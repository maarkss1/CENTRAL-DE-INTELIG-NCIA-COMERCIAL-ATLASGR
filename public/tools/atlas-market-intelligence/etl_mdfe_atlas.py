#!/usr/bin/env python3
"""Normaliza exportações CSV do Painel de Movimentação de Cargas da ANTT.

Uso:
    python etl_mdfe_atlas.py entrada.csv -o atlas_mdfe_fluxo.csv

O script tenta reconhecer layouts origem-destino e exportações já agregadas por
município. Não inventa métricas ausentes. O resultado pode ser importado na
camada MDF-e do Atlas Market Intelligence v0.4.
"""
from __future__ import annotations
import argparse, csv, re, unicodedata
from pathlib import Path


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().strip()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")

ALIASES = {
    "municipio_origem": ["municipio_origem", "origem_municipio", "municipio_de_origem", "origem"],
    "uf_origem": ["uf_origem", "origem_uf", "estado_origem", "uf_de_origem"],
    "municipio_destino": ["municipio_destino", "destino_municipio", "municipio_de_destino", "destino"],
    "uf_destino": ["uf_destino", "destino_uf", "estado_destino", "uf_de_destino"],
    "municipio": ["municipio", "localidade", "municipio_nome"],
    "uf": ["uf", "estado", "sigla_uf"],
    "viagens": ["viagens", "numero_de_viagens", "qtd_viagens", "jornadas", "quantidade_viagens"],
    "mdfe": ["mdfe", "mdf_e", "quantidade_mdfe", "qtd_mdfe", "manifestos"],
    "toneladas": ["toneladas", "peso_toneladas", "peso_t", "ton"],
    "tku": ["tku", "tonelada_quilometro_util", "toneladas_quilometro_util"],
    "ncm_grupo": ["ncm_grupo", "ncm", "grupo_ncm", "produto", "tipo_carga"],
    "periodo": ["periodo", "mes_ano", "ano_mes", "competencia", "data"],
}


def detect_encoding(path: Path) -> str:
    raw = path.read_bytes()[:65536]
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            raw.decode(enc)
            return enc
        except UnicodeDecodeError:
            pass
    return "latin-1"


def detect_dialect(sample: str):
    try:
        return csv.Sniffer().sniff(sample, delimiters=";,\t|")
    except csv.Error:
        return csv.excel


def map_columns(fieldnames):
    normalized = {norm(x): x for x in fieldnames or []}
    out = {}
    for target, aliases in ALIASES.items():
        for a in aliases:
            if norm(a) in normalized:
                out[target] = normalized[norm(a)]
                break
    return out


def main():
    ap = argparse.ArgumentParser(description="Normaliza CSV MDF-e para Atlas Market Intelligence")
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("atlas_mdfe_fluxo.csv"))
    args = ap.parse_args()
    enc = detect_encoding(args.input)
    with args.input.open("r", encoding=enc, newline="") as fh:
        sample = fh.read(65536); fh.seek(0)
        dialect = detect_dialect(sample)
        reader = csv.DictReader(fh, dialect=dialect)
        cols = map_columns(reader.fieldnames)
        raw_od = all(k in cols for k in ("municipio_origem","uf_origem","municipio_destino","uf_destino"))
        municipal = all(k in cols for k in ("municipio","uf"))
        if not raw_od and not municipal:
            raise SystemExit("Layout não reconhecido. São necessários origem+destino+UFs ou município+UF.")
        if raw_od:
            fields = ["municipio_origem","uf_origem","municipio_destino","uf_destino","viagens","mdfe","toneladas","tku","ncm_grupo","periodo"]
        else:
            fields = ["municipio","uf","viagens","mdfe","toneladas","tku","ncm_grupo","periodo"]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        n = 0
        with args.output.open("w", encoding="utf-8-sig", newline="") as out:
            wr = csv.DictWriter(out, fieldnames=fields)
            wr.writeheader()
            for row in reader:
                rec = {f: (row.get(cols[f], "") if f in cols else "") for f in fields}
                # Normalize UFs without altering the municipality spelling.
                for f in ("uf_origem","uf_destino","uf"):
                    if f in rec: rec[f] = rec[f].strip().upper()
                if raw_od and not (rec["municipio_origem"].strip() and rec["uf_origem"] and rec["municipio_destino"].strip() and rec["uf_destino"]):
                    continue
                if municipal and not (rec["municipio"].strip() and rec["uf"]):
                    continue
                wr.writerow(rec); n += 1
    print(f"OK: {n:,} linhas gravadas em {args.output}")
    print("Campos reconhecidos:", ", ".join(sorted(cols)))

if __name__ == "__main__":
    main()
