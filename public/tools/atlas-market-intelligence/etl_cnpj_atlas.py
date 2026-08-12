#!/usr/bin/env python3
"""
Atlas GR Market Intelligence - ETL CNPJ / ICP municipal

Objetivo
--------
Ler os Dados Abertos do CNPJ da Receita Federal já extraídos em disco e gerar
um arquivo municipal compacto que pode ser importado pelo site Atlas Market
Intelligence.

Uso básico
----------
python etl_cnpj_atlas.py --input "D:/CNPJ-RECEITA" --output atlas_icp_municipios.csv

A pasta de entrada pode conter os arquivos extraídos dos ZIPs Empresas,
Estabelecimentos e Municipios. O script reconhece os nomes oficiais que
contêm EMPRECSV, ESTABELE e MUNICCSV, além de nomes simplificados.

Importante
----------
Este é um motor ICP v0.1. Os pesos devem ser calibrados posteriormente com a
base de clientes, ganhos/perdas e ticket da Atlas GR. O resultado mede
DENSIDADE DE ICP, não White Space e não substitui o score final de território.
"""
from __future__ import annotations

import argparse
import csv
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Iterable, Iterator

# CNAE Atlas ICP v0.1 -------------------------------------------------------
# Os códigos são comparados sem pontuação (7 dígitos de subclasse).
DIRECT_CODES = {
    "4930201": ("transportadoras", 4.0),
    "4930202": ("transportadoras", 5.0),
    "4930203": ("transportadoras", 5.0),
    "4930204": ("transportadoras", 2.5),
    "5250803": ("operadores_logisticos", 5.0),
    "5250804": ("operadores_logisticos", 5.0),
    "5250805": ("operadores_logisticos", 4.5),
    "5211701": ("armazenagem", 4.0),
    "5211799": ("armazenagem", 4.0),
    "5212500": ("armazenagem", 3.5),
    "4791701": ("varejo_ecommerce", 2.0),
}

# Divisões CNAE com alta probabilidade de embarque rodoviário recorrente.
INDUSTRIAL_DIVISIONS = {
    "10", "11", "12", "16", "17", "19", "20", "21", "22", "23",
    "24", "25", "26", "27", "28", "29", "30", "31", "32"
}
AGRO_MINING_DIVISIONS = {"01", "02", "03", "05", "06", "07", "08", "09"}
WHOLESALE_DIVISION = "46"

PORTE_FACTOR = {
    "00": 0.60,  # não informado
    "01": 0.45,  # microempresa
    "03": 0.80,  # empresa de pequeno porte
    "05": 1.40,  # demais
}

SEGMENT_COLUMNS = [
    "transportadoras",
    "operadores_logisticos",
    "armazenagem",
    "embarcadores_industriais",
    "atacadistas_distribuidores",
    "agro_mineracao",
    "varejo_ecommerce",
]


def clean_code(value: str) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


def classify_cnae(cnae: str):
    code = clean_code(cnae)
    if not code:
        return None
    if code in DIRECT_CODES:
        return DIRECT_CODES[code]
    div = code[:2]
    if div in INDUSTRIAL_DIVISIONS:
        return ("embarcadores_industriais", 3.0)
    if div == WHOLESALE_DIVISION:
        return ("atacadistas_distribuidores", 2.5)
    if div in AGRO_MINING_DIVISIONS:
        return ("agro_mineracao", 2.4)
    return None


def discover_files(root: Path):
    files = [p for p in root.rglob("*") if p.is_file()]
    empresas, estabelecimentos, municipios = [], [], []
    for p in files:
        n = p.name.upper()
        if "EMPRECSV" in n or n.startswith("EMPRESAS") or n == "EMPRESAS.CSV":
            empresas.append(p)
        elif "ESTABELE" in n or n.startswith("ESTABELECIMENTOS") or n == "ESTABELECIMENTOS.CSV":
            estabelecimentos.append(p)
        elif "MUNICCSV" in n or n.startswith("MUNICIPIOS") or n == "MUNICIPIOS.CSV":
            municipios.append(p)
    return sorted(empresas), sorted(estabelecimentos), sorted(municipios)


def rows(path: Path) -> Iterator[list[str]]:
    # Arquivos da Receita são tipicamente Latin-1/Windows-1252 e ; separados.
    with path.open("r", encoding="latin-1", errors="replace", newline="") as f:
        reader = csv.reader(f, delimiter=";", quotechar='"')
        for row in reader:
            if row:
                yield row


def batched(it: Iterable, size=50000):
    batch = []
    for item in it:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def init_db(db: sqlite3.Connection):
    db.executescript("""
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
    PRAGMA temp_store=MEMORY;
    CREATE TABLE IF NOT EXISTS empresas (
        cnpj_base TEXT PRIMARY KEY,
        porte TEXT,
        capital REAL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS municipios (
        codigo TEXT PRIMARY KEY,
        nome TEXT
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS candidatos (
        cnpj_base TEXT NOT NULL,
        municipio_codigo TEXT NOT NULL,
        uf TEXT NOT NULL,
        cnae TEXT NOT NULL,
        matriz_filial TEXT,
        segmento TEXT NOT NULL,
        peso_base REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cand_mun ON candidatos(municipio_codigo, uf);
    CREATE INDEX IF NOT EXISTS idx_cand_base ON candidatos(cnpj_base);
    """)


def load_municipios(db: sqlite3.Connection, paths: list[Path]):
    if not paths:
        raise SystemExit("Arquivo Municipios não encontrado. Extraia Municipios.zip na pasta de entrada.")
    total = 0
    for path in paths:
        vals = []
        for r in rows(path):
            if len(r) >= 2:
                vals.append((clean_code(r[0]), r[1].strip()))
        db.executemany("INSERT OR REPLACE INTO municipios(codigo,nome) VALUES (?,?)", vals)
        total += len(vals)
    db.commit()
    print(f"Municípios carregados: {total:,}".replace(",", "."))


def load_empresas(db: sqlite3.Connection, paths: list[Path]):
    if not paths:
        print("AVISO: arquivos Empresas não encontrados; porte será tratado como não informado.")
        return
    total = 0
    t0 = time.time()
    sql = "INSERT OR REPLACE INTO empresas(cnpj_base,porte,capital) VALUES (?,?,?)"
    for path in paths:
        print(f"Empresas: {path.name}")
        def gen():
            nonlocal total
            for r in rows(path):
                # Layout oficial Empresas: base, razão social, natureza, qualif resp, capital, porte, ente
                if len(r) < 6:
                    continue
                base = clean_code(r[0])[:8]
                if not base:
                    continue
                porte = clean_code(r[5])[:2] or "00"
                try:
                    capital = float((r[4] or "0").replace(",", "."))
                except ValueError:
                    capital = 0.0
                total += 1
                yield (base, porte, capital)
        for batch in batched(gen()):
            db.executemany(sql, batch)
            db.commit()
        print(f"  acumulado: {total:,} empresas | {time.time()-t0:.0f}s".replace(",", "."))


def load_estabelecimentos(db: sqlite3.Connection, paths: list[Path]):
    if not paths:
        raise SystemExit("Arquivos Estabelecimentos não encontrados. Extraia Estabelecimentos*.zip na pasta de entrada.")
    total = active = matched = 0
    t0 = time.time()
    sql = "INSERT INTO candidatos(cnpj_base,municipio_codigo,uf,cnae,matriz_filial,segmento,peso_base) VALUES (?,?,?,?,?,?,?)"
    for path in paths:
        print(f"Estabelecimentos: {path.name}")
        def gen():
            nonlocal total, active, matched
            for r in rows(path):
                total += 1
                # Layout oficial Estabelecimentos:
                # 0 base,1 ordem,2 dv,3 matriz/filial,4 fantasia,5 situação,6 data sit,7 motivo,
                # 8 cidade exterior,9 país,10 abertura,11 cnae principal,...,19 CEP,20 UF,21 município...
                if len(r) < 22:
                    continue
                situation = clean_code(r[5])[:2]
                if situation != "02":  # ativa
                    continue
                active += 1
                cnae = clean_code(r[11])
                classified = classify_cnae(cnae)
                if not classified:
                    continue
                segment, weight = classified
                uf = (r[20] or "").strip().upper()
                mun = clean_code(r[21])
                base = clean_code(r[0])[:8]
                if not uf or not mun or not base:
                    continue
                matched += 1
                yield (base, mun, uf, cnae, (r[3] or "").strip(), segment, weight)
        for batch in batched(gen()):
            db.executemany(sql, batch)
            db.commit()
        print((f"  lidos {total:,} | ativos {active:,} | ICP {matched:,} | {time.time()-t0:.0f}s").replace(",", "."))


def export_aggregate(db: sqlite3.Connection, output: Path):
    print("Agregando por município...")
    query = """
    WITH enriched AS (
      SELECT
        c.municipio_codigo,
        c.uf,
        c.segmento,
        c.peso_base,
        COALESCE(e.porte,'00') AS porte,
        COALESCE(e.capital,0) AS capital,
        c.matriz_filial
      FROM candidatos c
      LEFT JOIN empresas e ON e.cnpj_base = c.cnpj_base
    )
    SELECT
      m.nome AS municipio,
      e.uf,
      COUNT(*) AS icp_total,
      SUM(CASE WHEN e.segmento IN ('transportadoras','operadores_logisticos') THEN 1 ELSE 0 END) AS tier_a,
      SUM(CASE WHEN e.segmento IN ('armazenagem','embarcadores_industriais') THEN 1 ELSE 0 END) AS tier_b,
      SUM(CASE WHEN e.segmento IN ('atacadistas_distribuidores','agro_mineracao','varejo_ecommerce') THEN 1 ELSE 0 END) AS tier_c,
      ROUND(SUM(e.peso_base * CASE e.porte WHEN '01' THEN 0.45 WHEN '03' THEN 0.80 WHEN '05' THEN 1.40 ELSE 0.60 END),2) AS score_ponderado,
      SUM(CASE WHEN e.segmento='transportadoras' THEN 1 ELSE 0 END) AS transportadoras,
      SUM(CASE WHEN e.segmento='operadores_logisticos' THEN 1 ELSE 0 END) AS operadores_logisticos,
      SUM(CASE WHEN e.segmento='armazenagem' THEN 1 ELSE 0 END) AS armazenagem,
      SUM(CASE WHEN e.segmento='embarcadores_industriais' THEN 1 ELSE 0 END) AS embarcadores_industriais,
      SUM(CASE WHEN e.segmento='atacadistas_distribuidores' THEN 1 ELSE 0 END) AS atacadistas_distribuidores,
      SUM(CASE WHEN e.segmento='agro_mineracao' THEN 1 ELSE 0 END) AS agro_mineracao,
      SUM(CASE WHEN e.segmento='varejo_ecommerce' THEN 1 ELSE 0 END) AS varejo_ecommerce,
      SUM(CASE WHEN e.porte='01' THEN 1 ELSE 0 END) AS micro,
      SUM(CASE WHEN e.porte='03' THEN 1 ELSE 0 END) AS pequeno_porte,
      SUM(CASE WHEN e.porte='05' THEN 1 ELSE 0 END) AS demais_portes,
      ROUND(SUM(e.capital),2) AS capital_social_soma
    FROM enriched e
    LEFT JOIN municipios m ON m.codigo=e.municipio_codigo
    GROUP BY e.municipio_codigo,e.uf
    ORDER BY score_ponderado DESC, icp_total DESC
    """
    cur = db.execute(query)
    headers = [d[0] for d in cur.description]
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";", quotechar='"', quoting=csv.QUOTE_MINIMAL)
        w.writerow(headers)
        n = 0
        while True:
            rows_ = cur.fetchmany(10000)
            if not rows_:
                break
            w.writerows(rows_)
            n += len(rows_)
    print(f"Arquivo gerado: {output} | {n:,} municípios".replace(",", "."))


def main():
    ap = argparse.ArgumentParser(description="Agrega os Dados Abertos do CNPJ em ICP municipal Atlas GR.")
    ap.add_argument("--input", required=True, type=Path, help="Pasta com os arquivos extraídos da Receita Federal")
    ap.add_argument("--output", default=Path("atlas_icp_municipios.csv"), type=Path)
    ap.add_argument("--db", default=None, type=Path, help="SQLite temporário/persistente (padrão: ao lado do output)")
    ap.add_argument("--reset", action="store_true", help="Apaga o banco intermediário e reprocessa tudo")
    args = ap.parse_args()
    root = args.input
    if not root.exists():
        raise SystemExit(f"Pasta não existe: {root}")
    db_path = args.db or args.output.with_suffix(".sqlite")
    if args.reset and db_path.exists():
        db_path.unlink()
    empresas, estabs, municipios = discover_files(root)
    print(f"Arquivos encontrados: Empresas={len(empresas)} Estabelecimentos={len(estabs)} Municipios={len(municipios)}")
    db = sqlite3.connect(db_path)
    init_db(db)
    try:
        # Permite retomar execução sem duplicar carga pesada.
        if db.execute("SELECT COUNT(*) FROM municipios").fetchone()[0] == 0:
            load_municipios(db, municipios)
        if db.execute("SELECT COUNT(*) FROM empresas").fetchone()[0] == 0:
            load_empresas(db, empresas)
        if db.execute("SELECT COUNT(*) FROM candidatos").fetchone()[0] == 0:
            load_estabelecimentos(db, estabs)
        export_aggregate(db, args.output)
    finally:
        db.close()
    print("Concluído. Importe o CSV gerado na camada ICP/CNPJ do Atlas Market Intelligence.")

if __name__ == "__main__":
    main()
