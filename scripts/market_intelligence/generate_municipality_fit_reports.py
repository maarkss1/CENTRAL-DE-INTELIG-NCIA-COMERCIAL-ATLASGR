#!/usr/bin/env python3
"""Gera 1 relatorio HTML de fit ICP/RNTRC/PIC por municipio, para todo o Brasil.

Generaliza scripts/market_intelligence/reports/campinas-sp-fit-alto-atlasgr.html (o
relatorio de referencia, feito originalmente so para Campinas/SP) para qualquer
municipio do pais, processando direto os CSVs normalizados por UF (sem depender de
Postgres/Docker).

Metodologia replicada, validada empiricamente contra o relatorio de referencia
(ver .claude/plans/swirling-sauteeing-lantern.md para o raciocinio completo):

- Universo: empresas ATIVA na Receita Federal cujo CNAE principal OU algum CNAE
  secundario bate com o Tier A da taxonomia (icp_taxonomy.v1.json) -- logistica e
  transporte diretamente expostos.
- Cruza cada CNPJ com rntrc_by_cnpj.csv (RNTRC nacional ja cruzado) -> rntrcMatch em
  {ATIVO, PENDENTE, NAO}.
- Mensagem comercial (picHypothesis/picSignal/decisorSugerido/influenciadoresSugeridos/
  validacoesPendentes/transportadoraCnae/interestadualCnae) e' uma funcao de
  (cnaeFit, rntrcMatch) -- extraida do relatorio de referencia e constante (validado:
  0 inconsistencias em 48 combinacoes reais). Combinacoes nunca observadas em Campinas
  usam um fallback conservador (PIC_NAO_INFERIVEL) em vez de inventar uma mensagem.
- Bucket: rntrcMatch=NAO -> nurtureNoRntrc; senao, picHypothesis=='PIC_NAO_INFERIVEL' ->
  researchBeforeContact; senao -> wave1.
- fitClasse/icpFit dependem so de rntrcMatch=='ATIVO' (binario, mais grosso que o bucket).

Uso:
  python scripts/market_intelligence/generate_municipality_fit_reports.py --uf SP --dry-run
  python scripts/market_intelligence/generate_municipality_fit_reports.py --uf SP
  python scripts/market_intelligence/generate_municipality_fit_reports.py   # todas as 27 UFs
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent.parent
TAXONOMY_PATH = PROJECT / "public" / "tools" / "atlas-market-intelligence" / "icp_taxonomy.v1.json"
RNTRC_CSV = PROJECT / ".cache" / "market-intelligence" / "rntrc_by_cnpj.csv"
NORMALIZED_COMPANIES = PROJECT / ".cache" / "market-intelligence" / "normalized" / "companies"
REFERENCE_HTML = PROJECT / ".cache" / "market-intelligence" / "reports" / "campinas-sp-fit-alto-atlasgr.html"
OUTPUT_ROOT = PROJECT / ".cache" / "market-intelligence" / "reports" / "Brasil"

ALL_UFS = [
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
    "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]

csv.field_size_limit(10_000_000)

DEFAULT_MESSAGE = {
    "picHypothesis": "PIC_NAO_INFERIVEL",
    "picSignal": "O PIC depende de gatilho, dor e contexto que as bases cadastrais não informam",
    "decisorSugerido": "Diretoria/Liderança da empresa",
    "influenciadoresSugeridos": "A validar",
    "validacoesPendentes": (
        "Frota >50; volume/rotas/terceiros; carga de alto valor; sinistro/seguro; "
        "processos de carga; vagas; troca de liderança; solução atual; dor e timing"
    ),
    "transportadoraCnae": "NAO",
    "interestadualCnae": "NAO",
}


def load_tier_a_prefixes() -> list[str]:
    taxonomy = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    return list(taxonomy["tiers"]["A"]["cnaePrefixes"])


def matched_tier_a_cnae(cnae_principal: str, cnaes_secundarios_raw: str, prefixes: list[str]) -> tuple[str, str, str] | None:
    """Retorna (cnaeFit, fitEvidence, cnaeFitDescricao) se a empresa bate no Tier A, senao None.

    Quando o CNAE principal nao bate mas ha varios CNAEs secundarios aderentes, o relatorio
    de referencia (Campinas) escolhe o CODIGO NUMERICAMENTE MENOR entre os que batem
    (validado: 7381/7381 casos de evidencia CNAE_SECUNDARIO em Campinas seguem essa regra).
    """
    if cnae_principal and any(cnae_principal.startswith(p) for p in prefixes):
        return cnae_principal, "CNAE_PRINCIPAL", ""
    if cnaes_secundarios_raw and cnaes_secundarios_raw != "[]":
        try:
            secundarios = json.loads(cnaes_secundarios_raw)
        except json.JSONDecodeError:
            return None
        candidates = [
            item for item in secundarios
            if item.get("code") and any(item["code"].startswith(p) for p in prefixes)
        ]
        if candidates:
            best = min(candidates, key=lambda item: item["code"])
            return best["code"], "CNAE_SECUNDARIO", best.get("description", "")
    return None


def load_rntrc_map() -> dict[str, tuple[str, str, str]]:
    m: dict[str, tuple[str, str, str]] = {}
    with RNTRC_CSV.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            m[row["cnpj"]] = (row["rntrcStatus"], row["rntrcNumber"], row["rntrcType"])
    return m


def rntrc_lookup(cnpj: str, rntrc_map: dict[str, tuple[str, str, str]]) -> tuple[str, str, str, str]:
    rec = rntrc_map.get(cnpj)
    if not rec:
        return "NAO", "", "", ""
    status, number, rtype = rec
    return status, number, status, rtype


def build_message_table() -> dict[tuple[str, str], dict[str, str]]:
    """Extrai a tabela (cnaeFit, rntrcMatch) -> mensagem do relatorio de referencia (Campinas)."""
    content = REFERENCE_HTML.read_text(encoding="utf-8")
    start = content.index("const DATA=") + len("const DATA=")
    end = content.index("];", start) + 1
    data = json.loads(content[start:end])

    fields = [
        "picHypothesis", "picSignal", "decisorSugerido", "influenciadoresSugeridos",
        "validacoesPendentes", "transportadoraCnae", "interestadualCnae",
    ]
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in data:
        groups[(row["cnaeFit"], row["rntrcMatch"])].append(row)

    table: dict[tuple[str, str], dict[str, str]] = {}
    inconsistent = 0
    for key, rows in groups.items():
        entry = {}
        for f in fields:
            values = Counter(r[f] for r in rows)
            most_common, _ = values.most_common(1)[0]
            if len(values) > 1:
                inconsistent += 1
                print(
                    f"AVISO: campo '{f}' inconsistente para {key} ({dict(values)}); "
                    f"usando o mais comum: {most_common!r}",
                    file=sys.stderr,
                )
            entry[f] = most_common
        table[key] = entry

    if inconsistent:
        print(f"AVISO: {inconsistent} campo(s) inconsistentes na tabela de mensagens extraida.", file=sys.stderr)
    print(f"Tabela de mensagens: {len(table)} combinacoes (cnaeFit, rntrcMatch) extraidas de Campinas.", file=sys.stderr)
    return table


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_only = ascii_only.lower().strip()
    out = []
    prev_dash = False
    for ch in ascii_only:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-") or "municipio"


def fmt_cnpj(cnpj: str) -> str:
    if len(cnpj) != 14:
        return cnpj
    return f"{cnpj[0:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:14]}"


def build_template() -> tuple[str, str]:
    """Extrai (prefixo, sufixo) do HTML de referencia, com marcadores de substituicao."""
    content = REFERENCE_HTML.read_text(encoding="utf-8")
    data_start = content.index("const DATA=")
    data_key_end = data_start + len("const DATA=")
    data_end = content.index("];", data_key_end) + 1

    prefix = content[:data_start]
    suffix = content[data_end:]

    prefix = prefix.replace(
        "<title>AtlasGR | ICP e personas em Campinas/SP</title>",
        "<title>AtlasGR | ICP e personas em __MUNICIPIO_UF__</title>",
    )
    prefix = prefix.replace(
        "Mapa de ICP e personas — AtlasGR · Campinas/SP",
        "Mapa de ICP e personas — AtlasGR · __MUNICIPIO_UF__",
    )
    prefix = prefix.replace(
        '<div class="card"><small>Base setorial analisada</small><strong>19,521</strong></div>\n'
        '    <div class="card"><small>Fit estrutural confirmado</small><strong>1,700</strong></div>\n'
        '    <div class="card"><small>Fit setorial potencial</small><strong>17,821</strong></div>\n'
        '    <div class="card"><small>RNTRC oficial ativo</small><strong>1,700</strong></div>\n'
        '    <div class="card"><small>Evidência CNAE interestadual</small><strong>4,354</strong></div>\n'
        '    <div class="card"><small>CNPJs inválidos</small><strong>0</strong></div>',
        "__CARDS__",
    )
    marketing_block_start = prefix.index('<section class="panel">\n    <h2>Processo de marketing preparado</h2>')
    marketing_block_end = prefix.index("</section>", marketing_block_start) + len("</section>")
    prefix = prefix[:marketing_block_start] + "__MARKETING_PANEL__" + prefix[marketing_block_end:]
    prefix = prefix.replace(
        "significa empresa ativa em Campinas, CNAE aderente e RNTRC oficial ativo",
        "significa empresa ativa em __MUNICIPIO__, CNAE aderente e RNTRC oficial ativo",
    )
    meta_block_start = prefix.index('<div><b>Dataset:</b>')
    meta_block_end = prefix.index("</div>\n    </div>", meta_block_start) + len("</div>")
    prefix = prefix[:meta_block_start] + "__META_BLOCK__" + prefix[meta_block_end:]

    suffix = suffix.replace(
        "a.download='campinas-sp-icp-personas-atlasgr.csv'",
        "a.download='__DOWNLOAD_FILENAME__'",
    )
    return prefix, suffix


def render_report(
    prefix_tpl: str,
    suffix_tpl: str,
    municipio_nome: str,
    uf: str,
    municipio_ibge: str,
    rows: list[dict],
    generated_at: str,
) -> str:
    total = len(rows)
    confirmado = sum(1 for r in rows if r["icpFit"] == "FIT_ESTRUTURAL_CONFIRMADO")
    potencial = total - confirmado
    rntrc_ativo = sum(1 for r in rows if r["rntrcMatch"] == "ATIVO")
    interestadual = sum(1 for r in rows if r["interestadualCnae"] == "SIM")
    invalidos = sum(1 for r in rows if r["cnpjValido"] != "SIM")

    def fmt_int(n: int) -> str:
        return f"{n:,}".replace(",", ".")

    wave1 = sum(1 for r in rows if r["_bucket"] == "wave1")
    research = sum(1 for r in rows if r["_bucket"] == "research")
    nurture = sum(1 for r in rows if r["_bucket"] == "nurture")

    municipio_uf = f"{municipio_nome}/{uf}"
    cards = (
        f'<div class="card"><small>Base setorial analisada</small><strong>{fmt_int(total)}</strong></div>\n'
        f'    <div class="card"><small>Fit estrutural confirmado</small><strong>{fmt_int(confirmado)}</strong></div>\n'
        f'    <div class="card"><small>Fit setorial potencial</small><strong>{fmt_int(potencial)}</strong></div>\n'
        f'    <div class="card"><small>RNTRC oficial ativo</small><strong>{fmt_int(rntrc_ativo)}</strong></div>\n'
        f'    <div class="card"><small>Evidência CNAE interestadual</small><strong>{fmt_int(interestadual)}</strong></div>\n'
        f'    <div class="card"><small>CNPJs inválidos</small><strong>{fmt_int(invalidos)}</strong></div>'
    )
    marketing_panel = f"""<section class="panel">
    <h2>Processo de marketing preparado</h2>
    <div class="profiles">
      <article class="profile"><h3>Onda 1 — validar PIC 1</h3><p><b>{fmt_int(wave1)} contas</b> com fit estrutural confirmado e hipótese de complexidade/expansão.</p></article>
      <article class="profile"><h3>Pesquisa antes do contato</h3><p><b>{fmt_int(research)} contas</b> cujo contexto exige validação antes de qualquer abordagem.</p></article>
      <article class="profile"><h3>Nurture sem nova evidência</h3><p><b>{fmt_int(nurture)} contas</b> com aderência apenas setorial; não priorizar outbound agora.</p><span>Requer nova fonte ou sinal comercial.</span></article>
      <article class="profile"><h3>Plano e governança</h3><p>Cadência preliminar de 15 dias úteis, personas, canais e bloqueios nacionais — ver <code>campinas-sp-marketing-plano.json</code> na pasta reports/ como referência metodológica.</p></article>
    </div>
    <p><b>Status:</b> preparado, não disparado. Este HTML não contém nomes de pessoas, telefones ou e-mails; antes do contato é obrigatório confirmar finalidade, proveniência e opt-out.</p>
  </section>"""
    meta_block = (
        f'<div><b>Dataset:</b> normalized/companies competência 2026-08</div>'
        f'<div><b>Competência:</b> 2026-08</div>'
        f'<div><b>Município IBGE:</b> {municipio_ibge}</div>'
        f'<div><b>Gerado em:</b> {generated_at}</div>'
        f'<div><b>Playbook:</b> Playbook - Atlas.docx (mesma tabela de mensagens do relatório de referência de Campinas/SP)</div>'
        f'<div><b>Modelo:</b> regras categóricas, sem score numérico</div>'
        f'<div><b>Origem cadastral:</b> Receita Federal / OBSERVED</div>'
        f'<div><b>RNTRC:</b> ANTT oficial / 2026-07</div>'
    )

    prefix = (
        prefix_tpl
        .replace("__MUNICIPIO_UF__", municipio_uf)
        .replace("__CARDS__", cards)
        .replace("__MARKETING_PANEL__", marketing_panel)
        .replace("__MUNICIPIO__", municipio_nome)
        .replace("__META_BLOCK__", meta_block)
    )
    download_name = f"{slugify(municipio_nome)}-{uf.lower()}-icp-personas-atlasgr.csv"
    suffix = suffix_tpl.replace("__DOWNLOAD_FILENAME__", download_name)

    data_rows = []
    for r in rows:
        clean = {k: v for k, v in r.items() if not k.startswith("_")}
        data_rows.append(clean)
    data_json = json.dumps(data_rows, ensure_ascii=False, separators=(",", ":"))

    return f"{prefix}const DATA={data_json};{suffix}"


def process_uf(
    uf: str,
    prefixes: list[str],
    rntrc_map: dict[str, tuple[str, str, str]],
    message_table: dict[tuple[str, str], dict[str, str]],
    prefix_tpl: str,
    suffix_tpl: str,
    dry_run: bool,
    fallback_counter: Counter,
    only_fit: bool,
    output_root: Path,
    index_entries: list[dict],
) -> tuple[int, int]:
    matches = list(NORMALIZED_COMPANIES.glob(f"competencia=*/snapshot=*/uf={uf}/companies.csv.gz"))
    if not matches:
        print(f"[{uf}] nenhum arquivo normalizado encontrado, pulando.", file=sys.stderr)
        return 0, 0
    csv_path = matches[0]

    by_municipio: dict[str, list[dict]] = defaultdict(list)
    total_companies = 0

    with gzip.open(csv_path, mode="rt", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            if row.get("situacaoCadastral") != "ATIVA":
                continue
            match = matched_tier_a_cnae(row["cnaePrincipal"], row.get("cnaesSecundarios", ""), prefixes)
            if not match:
                continue
            cnae_fit, fit_evidence, secondary_desc = match
            cnpj = row["cnpj"]
            rntrc_status, rntrc_number, rntrc_status_raw, rntrc_type = rntrc_lookup(cnpj, rntrc_map)

            key = (cnae_fit, rntrc_status)
            message = message_table.get(key)
            if message is None:
                message = DEFAULT_MESSAGE
                fallback_counter[key] += 1

            if rntrc_status == "NAO":
                bucket = "nurture"
            elif message["picHypothesis"] == "PIC_NAO_INFERIVEL":
                bucket = "research"
            else:
                bucket = "wave1"

            icp_fit = "FIT_ESTRUTURAL_CONFIRMADO" if rntrc_status == "ATIVO" else "FIT_SETORIAL_POTENCIAL"
            fit_classe = "ALTO_CONFIRMADO_RNTRC" if rntrc_status == "ATIVO" else "ALTO_SETORIAL"
            cnae_descricao = row["cnaePrincipalDescricao"] if fit_evidence == "CNAE_PRINCIPAL" else secondary_desc
            icp_reason = (
                f"CNPJ ativo em {row['municipioNome']} + CNAE aderente + RNTRC oficial ativo"
                if rntrc_status == "ATIVO"
                else f"CNPJ ativo em {row['municipioNome']} + CNAE aderente; falta confirmação RNTRC ativa"
            )

            out_row = {
                "cnpj": cnpj,
                "cnpjBasico": row["cnpjBasico"],
                "razaoSocial": row["razaoSocial"],
                "nomeFantasia": row["nomeFantasia"],
                "matrizFilial": row["matrizFilial"],
                "situacaoCadastral": row["situacaoCadastral"],
                "dataInicioAtividade": row["dataInicioAtividade"],
                "cnaePrincipal": row["cnaePrincipal"],
                "cnaePrincipalDescricao": row["cnaePrincipalDescricao"],
                "cnaesSecundarios": row.get("cnaesSecundarios", "[]"),
                "naturezaJuridicaCodigo": row["naturezaJuridicaCodigo"],
                "naturezaJuridica": row["naturezaJuridica"],
                "porteCodigo": row["porteCodigo"],
                "porte": row["porte"],
                "capitalSocial": row["capitalSocial"],
                "opcaoSimples": row["opcaoSimples"],
                "opcaoMei": row["opcaoMei"],
                "tipoLogradouro": row["tipoLogradouro"],
                "logradouro": row["logradouro"],
                "numero": row["numero"],
                "complemento": row["complemento"],
                "bairro": row["bairro"],
                "cep": row["cep"],
                "municipioCodigoReceita": row["municipioCodigoReceita"],
                "municipioIbge": row["municipioIbge"],
                "municipioNome": row["municipioNome"],
                "uf": row["uf"],
                "dataOrigin": row["dataOrigin"],
                "competencia": row["competencia"],
                "cnaeFit": cnae_fit,
                "fitEvidence": fit_evidence,
                "cnaePrincipalDescricaoFit": cnae_descricao,
                "temTelefoneCadastral": "SIM" if row.get("telefone1") else "NAO",
                "temEmailCadastral": "SIM" if row.get("email") else "NAO",
                "cnpjValido": "SIM",
                "rntrcMatch": rntrc_status,
                "rntrcNumber": rntrc_number,
                "rntrcStatus": rntrc_status_raw,
                "rntrcCategory": rntrc_type,
                "rntrcStatusDate": "",
                "fitClasse": fit_classe,
                "icpFit": icp_fit,
                "icpReason": icp_reason,
                "transportadoraCnae": message["transportadoraCnae"],
                "interestadualCnae": message["interestadualCnae"],
                "picHypothesis": message["picHypothesis"],
                "picSignal": message["picSignal"],
                "decisorSugerido": message["decisorSugerido"],
                "influenciadoresSugeridos": message["influenciadoresSugeridos"],
                "validacoesPendentes": message["validacoesPendentes"],
                "cnpjFormatado": fmt_cnpj(cnpj),
                "fitAlto": "TIER_A_MODELADO",
                "_bucket": bucket,
            }
            if only_fit and bucket != "wave1":
                continue
            by_municipio[row["municipioIbge"]].append(out_row)
            total_companies += 1

    if dry_run:
        for ibge, rows in sorted(by_municipio.items(), key=lambda kv: -len(kv[1]))[:5]:
            nome = rows[0]["municipioNome"]
            print(f"[{uf}] {nome} ({ibge}): {len(rows)} empresas Tier A", file=sys.stderr)
        print(f"[{uf}] total: {len(by_municipio)} municipios, {total_companies} empresas Tier A", file=sys.stderr)
        return len(by_municipio), total_companies

    out_dir = output_root / uf
    out_dir.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    written = 0
    for ibge, rows in by_municipio.items():
        nome = rows[0]["municipioNome"]
        html = render_report(prefix_tpl, suffix_tpl, nome, uf, ibge, rows, generated_at)
        slug = slugify(nome)
        out_path = out_dir / f"{slug}.html"
        out_path.write_text(html, encoding="utf-8")
        written += 1
        wave1_n = sum(1 for r in rows if r["_bucket"] == "wave1")
        index_entries.append({
            "uf": uf,
            "municipio": nome,
            "slug": slug,
            "total": len(rows),
            "wave1": wave1_n,
        })
    print(f"[{uf}] {written} relatorios de municipio escritos em {out_dir}", file=sys.stderr)
    return len(by_municipio), total_companies


def fmt_br(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def build_index_html(index_entries: list[dict], only_fit: bool, generated_at: str) -> str:
    by_uf: dict[str, list[dict]] = defaultdict(list)
    for entry in index_entries:
        by_uf[entry["uf"]].append(entry)

    total_municipios = len(index_entries)
    total_empresas = sum(e["total"] for e in index_entries)
    total_wave1 = sum(e["wave1"] for e in index_entries)

    uf_cards = []
    uf_sections = []
    for uf in sorted(by_uf):
        entries = sorted(by_uf[uf], key=lambda e: -e["total"])
        uf_total = sum(e["total"] for e in entries)
        uf_cards.append(
            f'<a class="uf-card" href="#uf-{uf}"><strong>{uf}</strong>'
            f'<span>{len(entries)} município(s)</span><span>{fmt_br(uf_total)} empresas</span></a>'
        )
        rows_html = "".join(
            f'<tr><td><a href="{uf}/{e["slug"]}.html">{e["municipio"]}</a></td>'
            f'<td>{fmt_br(e["total"])}</td><td>{fmt_br(e["wave1"])}</td></tr>'
            for e in entries
        )
        uf_sections.append(
            f'<section class="panel" id="uf-{uf}"><h2>{uf} — {len(entries)} município(s)</h2>'
            f'<div class="table-wrap"><table><thead><tr><th>Município</th><th>Empresas no relatório</th>'
            f'<th>Fit confirmado (wave1)</th></tr></thead><tbody>{rows_html}</tbody></table></div></section>'
        )

    escopo = (
        "Somente empresas com fit ICP confirmado (RNTRC ativo/pendente + hipótese comercial real — bucket wave1)."
        if only_fit
        else "Todas as empresas Tier A (wave1 + pesquisa + nurture)."
    )

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AtlasGR | Mapa nacional de fit ICP por município</title>
  <style>
    :root{{--navy:#071a2d;--blue:#0b69d1;--cyan:#35c2ff;--ink:#172235;--muted:#66758c;--line:#dce4ee;--paper:#f5f8fc}}
    *{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 Inter,Segoe UI,Arial,sans-serif}}
    header{{background:linear-gradient(120deg,var(--navy),#0b3e6f);color:#fff;padding:30px clamp(18px,4vw,54px)}}
    h1{{margin:0 0 8px;font-size:clamp(24px,4vw,38px)}} header p{{margin:0;color:#cce8ff;max-width:980px}}
    main{{max-width:1400px;margin:auto;padding:22px}}
    .cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:-42px;margin-bottom:16px}}
    .card{{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 25px #071a2d12;padding:17px}}
    .card small{{display:block;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em}} .card strong{{display:block;font-size:27px;margin-top:4px}}
    .uf-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:24px}}
    .uf-card{{display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;text-decoration:none;color:var(--ink)}}
    .uf-card strong{{font-size:20px;color:var(--blue)}} .uf-card span{{color:var(--muted);font-size:12px}}
    .panel{{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 25px #071a2d12;padding:18px;margin-top:16px}}
    h2{{margin:0 0 12px;font-size:19px}}
    .table-wrap{{overflow:auto;max-height:60vh;border:1px solid var(--line);border-radius:10px}}
    table{{border-collapse:separate;border-spacing:0;width:100%}}
    th{{position:sticky;top:0;background:var(--navy);color:#fff;text-align:left;padding:8px 10px}}
    td{{padding:7px 10px;border-bottom:1px solid #e8edf4}} tbody tr:hover{{background:#edf7ff}}
    a{{color:var(--blue)}}
  </style>
</head>
<body>
<header>
  <h1>Mapa nacional de fit ICP/RNTRC/PIC — AtlasGR</h1>
  <p>{escopo} Gerado em {generated_at}. Clique em um estado ou município para abrir o relatório detalhado.</p>
</header>
<main>
  <section class="cards">
    <div class="card"><small>UFs cobertas</small><strong>{len(by_uf)}</strong></div>
    <div class="card"><small>Municípios com relatório</small><strong>{fmt_br(total_municipios)}</strong></div>
    <div class="card"><small>Empresas nos relatórios</small><strong>{fmt_br(total_empresas)}</strong></div>
    <div class="card"><small>Fit confirmado (wave1)</small><strong>{fmt_br(total_wave1)}</strong></div>
  </section>
  <div class="uf-grid">{"".join(uf_cards)}</div>
  {"".join(uf_sections)}
</main>
</body></html>"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uf", action="append", dest="ufs", choices=ALL_UFS, help="Repetir para varias UFs; omitir para rodar as 27.")
    parser.add_argument("--dry-run", action="store_true", help="So reporta contagens, nao escreve HTML.")
    parser.add_argument("--only-fit", action="store_true", help="So inclui empresas do bucket wave1 (fit ICP/persona confirmado).")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_ROOT, help="Pasta de saida (default: .cache/market-intelligence/reports/Brasil).")
    args = parser.parse_args()

    ufs = args.ufs or ALL_UFS

    prefixes = load_tier_a_prefixes()
    print(f"Prefixos Tier A: {prefixes}", file=sys.stderr)
    rntrc_map = load_rntrc_map()
    print(f"RNTRC carregado: {len(rntrc_map)} CNPJs", file=sys.stderr)
    message_table = build_message_table()
    prefix_tpl, suffix_tpl = build_template()

    fallback_counter: Counter = Counter()
    index_entries: list[dict] = []
    total_municipios = 0
    total_empresas = 0
    start = datetime.now()
    for uf in ufs:
        m, e = process_uf(
            uf, prefixes, rntrc_map, message_table, prefix_tpl, suffix_tpl, args.dry_run,
            fallback_counter, args.only_fit, args.output_dir, index_entries,
        )
        total_municipios += m
        total_empresas += e
    elapsed = (datetime.now() - start).total_seconds()

    if not args.dry_run and index_entries:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
        index_html = build_index_html(index_entries, args.only_fit, generated_at)
        (args.output_dir / "index.html").write_text(index_html, encoding="utf-8")
        print(f"index.html escrito em {args.output_dir / 'index.html'}", file=sys.stderr)

    print("=" * 60, file=sys.stderr)
    print(f"UFs processadas: {len(ufs)}", file=sys.stderr)
    print(f"Municipios com relatorio: {total_municipios}", file=sys.stderr)
    print(f"Empresas Tier A processadas: {total_empresas}", file=sys.stderr)
    print(f"Tempo total: {elapsed:.1f}s", file=sys.stderr)
    if fallback_counter:
        print(f"Combinacoes (cnaeFit,rntrcMatch) sem mensagem observada em Campinas (usou fallback): {len(fallback_counter)}", file=sys.stderr)
        for key, count in fallback_counter.most_common(20):
            print(f"  {key}: {count} empresas", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
