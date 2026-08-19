#!/usr/bin/env python3
"""ETL do cadastro canonico de municipios -> municipios.json.

Cruza o cadastro de localidades do IBGE (codigo IBGE, nome, UF, regiao) com o
centroide geometrico oficial dos poligonos municipais do IBGE (BCIM - Base
Cartografica Continua, camada `lim_municipio_a`), que carrega o campo
`geocodigo` (codigo IBGE de 7 digitos) em cada registro. E a unica camada
oficial encontrada que expoe latitude/longitude com o codigo IBGE como chave
direta -- nunca por casamento de nome/geocodificacao textual (ver
DATA_LINEAGE.md, secao 1: "latitude/longitude devem vir de fonte documentada
e nao de inferencia textual").

A camada `loc_cidade_p` do mesmo pacote foi avaliada e descartada: ela
contem pontos de sede de cidade/vila (mais registros que municipios, pois
inclui sedes distritais) sem nenhum campo de codigo IBGE ou UF, o que so
permitiria join por nome — exatamente o que a regra do projeto proibe para
coordenadas.

O poligono municipal e mais apropriado para o Territory Optimizer de
qualquer forma: o centroide geometrico pondera a area real do municipio,
enquanto um ponto de sede so representa o nucleo urbano.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import struct
import sys
import time
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

IBGE_MUNICIPIOS = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
BCIM_URL = (
    "https://geoftp.ibge.gov.br/cartas_e_mapas/bases_cartograficas_continuas/"
    "bcim/versao2016/shapefile/bcim_2016_shapefiles_21-11-2018.zip"
)
BCIM_SOURCE_PAGE = "https://www.ibge.gov.br/geociencias/downloads-geociencias.html"
BCIM_LAYER = "lim_municipio_a"
USER_AGENT = "AtlasGR-MarketIntelligence/1.0 (+data engineering)"


def request_bytes(url: str, timeout: int = 180) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        payload = response.read()
        # urllib nao descomprime automaticamente; o IBGE gzipa a resposta mesmo sem
        # Accept-Encoding explicito no pedido (mesmo comportamento ja tratado em etl_cnpj_atlas.py).
        if response.headers.get("Content-Encoding", "").lower() == "gzip" or payload[:2] == b"\x1f\x8b":
            payload = gzip.decompress(payload)
        return payload


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_with_retry(url: str, target: Path, attempts: int = 4, timeout: int = 600) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        if target.exists() and target.stat().st_size >= 1000:
            return
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=timeout) as response, target.open("wb") as output:  # noqa: S310
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
        except OSError as error:
            last_error = error
            target.unlink(missing_ok=True)
            if attempt < attempts:
                time.sleep(2**attempt)
    if not target.exists() or target.stat().st_size < 1000:
        raise RuntimeError(f"Falha ao baixar {url} apos {attempts} tentativas: {last_error}")


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def extract_uf(row: dict[str, Any]) -> dict[str, Any]:
    micro = as_dict(row.get("microrregiao"))
    meso = as_dict(micro.get("mesorregiao"))
    uf = as_dict(meso.get("UF"))
    if uf:
        return uf
    immediate = as_dict(row.get("regiao-imediata"))
    intermediate = as_dict(immediate.get("regiao-intermediaria"))
    return as_dict(intermediate.get("UF"))


def load_ibge_registry(cache: Path) -> dict[str, dict[str, Any]]:
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        cache.write_bytes(request_bytes(IBGE_MUNICIPIOS))
    rows = json.loads(cache.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise RuntimeError("Cadastro municipal do IBGE retornou estrutura incompativel: lista esperada")

    registry: dict[str, dict[str, Any]] = {}
    for raw_row in rows:
        if not isinstance(raw_row, dict):
            continue
        uf = extract_uf(raw_row)
        sigla = str(uf.get("sigla") or "").upper()
        code = str(raw_row.get("id") or "")
        if not sigla or not code:
            continue
        registry[code] = {
            "ibgeCode": code,
            "name": raw_row.get("nome"),
            "uf": sigla,
            "region": as_dict(uf.get("regiao")).get("nome"),
        }
    if len(registry) < 5500:
        raise RuntimeError(f"Cadastro municipal IBGE incompleto: apenas {len(registry)} municipios com UF/codigo")
    return registry


def parse_dbf_field(payload: bytes, field_name: str) -> list[str]:
    n_records, header_len, record_len = struct.unpack("<IHH", payload[4:12])
    fields: list[tuple[str, int]] = []
    pos = 32
    while payload[pos] != 0x0D:
        name = payload[pos : pos + 11].split(b"\x00")[0].decode("latin-1")
        length = payload[pos + 16]
        fields.append((name, length))
        pos += 32

    offsets: list[tuple[str, int, int]] = []
    running = 1  # byte 0 de cada registro e a flag de exclusao
    for name, length in fields:
        offsets.append((name, running, length))
        running += length

    match = next(((n, o, l) for n, o, l in offsets if n == field_name), None)
    if match is None:
        raise RuntimeError(f"Campo '{field_name}' nao encontrado no DBF (campos: {[f[0] for f in fields]!r})")
    _, field_offset, field_len = match

    values: list[str] = []
    for i in range(n_records):
        record = payload[header_len + i * record_len : header_len + (i + 1) * record_len]
        values.append(record[field_offset : field_offset + field_len].decode("latin-1").strip())
    return values


def polygon_centroid(rings: list[list[tuple[float, float]]]) -> tuple[float, float] | None:
    """Centroide de um poligono (possivelmente multi-parte, com furos) por area ponderada.

    Furos (aneis com orientacao oposta ao anel externo) tem area assinada de sinal
    contrario e sao naturalmente subtraidos pela formula -- nao exige deteccao manual
    de furo vs. anel externo.
    """
    cx_acc = cy_acc = area_acc = 0.0
    for ring in rings:
        area = cx = cy = 0.0
        n = len(ring)
        if n < 3:
            continue
        for i in range(n):
            x0, y0 = ring[i]
            x1, y1 = ring[(i + 1) % n]
            cross = x0 * y1 - x1 * y0
            area += cross
            cx += (x0 + x1) * cross
            cy += (y0 + y1) * cross
        area *= 0.5
        if area == 0:
            continue
        cx /= 6 * area
        cy /= 6 * area
        cx_acc += cx * area
        cy_acc += cy * area
        area_acc += area
    if area_acc == 0:
        return None
    return cx_acc / area_acc, cy_acc / area_acc


def parse_shp_polygon_centroids(payload: bytes) -> dict[int, tuple[float, float]]:
    """Le um .shp de poligonos (shape type 5) e retorna centroide por indice de registro.

    O indice de registro (0-based, ordem sequencial) corresponde 1:1 a ordem dos
    registros no .dbf irmao -- e o invariante fundamental do formato shapefile.
    """
    centroids: dict[int, tuple[float, float]] = {}
    pos = 100  # cabecalho fixo do arquivo .shp
    idx = 0
    while pos + 8 <= len(payload):
        _, content_length = struct.unpack(">ii", payload[pos : pos + 8])
        content_start = pos + 8
        content_len_bytes = content_length * 2
        content = payload[content_start : content_start + content_len_bytes]
        if len(content) < content_len_bytes:
            break
        shape_type = struct.unpack("<i", content[0:4])[0]
        if shape_type == 5:  # Polygon
            num_parts, num_points = struct.unpack("<ii", content[36:44])
            parts_offset = 44
            parts_idx = struct.unpack(f"<{num_parts}i", content[parts_offset : parts_offset + 4 * num_parts])
            points_offset = parts_offset + 4 * num_parts
            points = [
                struct.unpack("<dd", content[points_offset + 16 * i : points_offset + 16 * i + 16])
                for i in range(num_points)
            ]
            rings = []
            for i in range(num_parts):
                start = parts_idx[i]
                end = parts_idx[i + 1] if i + 1 < num_parts else num_points
                rings.append(points[start:end])
            centroid = polygon_centroid(rings)
            if centroid is not None:
                centroids[idx] = centroid
        idx += 1
        pos = content_start + content_len_bytes
    return centroids


def load_bcim_centroids(workdir: Path) -> dict[str, tuple[float, float]]:
    archive_path = workdir / "raw" / "bcim" / "bcim_2016_shapefiles.zip"
    download_with_retry(BCIM_URL, archive_path)
    if not zipfile.is_zipfile(archive_path):
        raise RuntimeError(f"Arquivo BCIM baixado nao e um ZIP valido: {archive_path}")

    with zipfile.ZipFile(archive_path) as archive:
        dbf_bytes = archive.read(f"{BCIM_LAYER}.dbf")
        shp_bytes = archive.read(f"{BCIM_LAYER}.shp")

    codes = parse_dbf_field(dbf_bytes, "geocodigo")
    centroids_by_index = parse_shp_polygon_centroids(shp_bytes)
    if len(codes) < 5500:
        raise RuntimeError(f"Camada BCIM {BCIM_LAYER} retornou apenas {len(codes)} poligonos municipais")

    result: dict[str, tuple[float, float]] = {}
    for i, code in enumerate(codes):
        centroid = centroids_by_index.get(i)
        if code and centroid is not None:
            result[code] = centroid
    return result


def build_municipios(registry: dict[str, dict[str, Any]], centroids: dict[str, tuple[float, float]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    rows: list[dict[str, Any]] = []
    missing_centroid = 0
    for code, entry in registry.items():
        centroid = centroids.get(code)
        row = dict(entry)
        if centroid is not None:
            row["longitude"] = round(centroid[0], 6)
            row["latitude"] = round(centroid[1], 6)
        else:
            row["longitude"] = None
            row["latitude"] = None
            missing_centroid += 1
        rows.append(row)
    rows.sort(key=lambda row: (row["uf"], row["name"]))
    stats = {
        "municipalities_total": len(rows),
        "municipalities_with_centroid": len(rows) - missing_centroid,
        "municipalities_missing_centroid": missing_centroid,
        "bcim_polygons_matched": len(centroids),
    }
    return rows, stats


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, default=Path(".cache/market-intelligence/municipios"))
    parser.add_argument("--output", type=Path, default=Path("public/tools/atlas-market-intelligence/data/municipios.json"))
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--ibge-json", type=Path)
    args = parser.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)

    ibge_cache = args.ibge_json or (args.workdir / "raw" / "ibge" / "municipios.json")
    registry = load_ibge_registry(ibge_cache)
    centroids = load_bcim_centroids(args.workdir)
    rows, stats = build_municipios(registry, centroids)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    metadata_path = args.metadata or args.output.with_suffix(".metadata.json")
    metadata = {
        "dataset": "IBGE Localidades + BCIM (centroide municipal)",
        "sources": {
            "registry": {"url": IBGE_MUNICIPIOS, "fields": ["codigo IBGE", "nome", "UF", "regiao"]},
            "geometry": {
                "url": BCIM_URL,
                "sourcePage": BCIM_SOURCE_PAGE,
                "layer": BCIM_LAYER,
                "crs": "GEOGCS SIRGAS 2000 (graus decimais)",
                "joinKey": "geocodigo (codigo IBGE de 7 digitos por poligono)",
            },
        },
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "outputSha256": sha256_file(args.output),
        "stats": stats,
        "transformations": [
            "cadastro IBGE via API de localidades: codigo IBGE, nome, UF, regiao",
            "poligonos municipais BCIM (lim_municipio_a) filtrados pelo campo geocodigo (chave IBGE direta, sem join por nome)",
            "centroide geometrico por area ponderada (formula de shoelace), aneis multiplos e furos tratados por area assinada",
            "join final por codigo IBGE",
        ],
        "limitations": [
            "o centroide e geometrico (area do poligono), nao o ponto de sede/cidade -- mais representativo para raio de territorio, mas nao deve ser usado como endereco",
            "BCIM versao 2016 e a edicao vigente publicada pelo IBGE para esta camada; nao houve nova edicao nacional completa da malha municipal desde entao",
            f"{stats['municipalities_missing_centroid']} municipio(s) sem poligono correspondente no BCIM permanecem sem latitude/longitude (nunca estimados)",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    if stats["municipalities_missing_centroid"]:
        print(
            f"AVISO: {stats['municipalities_missing_centroid']} municipios sem centroide BCIM; "
            "revisar antes de promover o dataset como completo.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
