import csv
import gzip
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

from cnpj_company_pipeline import (  # noqa: E402
    COMPANY_EXPORT_COLUMNS,
    build_company_snapshot,
    normalize_date,
    normalize_search,
    split_secondary_cnaes,
)


def write_zip(path: Path, rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        content = "\n".join(";".join(f'"{value}"' for value in row) for row in rows) + "\n"
        archive.writestr("fixture.csv", content.encode("latin-1"))


def ibge_ribeirao() -> list[dict]:
    return [{
        "id": 3543402,
        "nome": "Ribeirão Preto",
        "microrregiao": {
            "mesorregiao": {
                "UF": {"sigla": "SP", "regiao": {"nome": "Sudeste"}}
            }
        },
    }]


class CnpjCompanyPipelineTest(unittest.TestCase):
    def test_normalizers_preserve_unknown_as_empty(self) -> None:
        self.assertEqual(normalize_date("20260818"), "2026-08-18")
        self.assertEqual(normalize_date("00000000"), "")
        self.assertEqual(normalize_search("  Ribeirão   Preto/SP "), "RIBEIRAO PRETO SP")
        self.assertEqual(
            split_secondary_cnaes("4930201,4930202,4930201", {"4930202": "Carga"}),
            [
                {"code": "4930201", "description": None},
                {"code": "4930202", "description": "Carga"},
            ],
        )

    def test_filtered_snapshot_is_detailed_and_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw = root / "raw"
            establishments = raw / "Estabelecimentos0.zip"
            companies = raw / "Empresas0.zip"
            simples = raw / "Simples.zip"
            municipalities = raw / "Municipios.zip"
            cnaes = raw / "Cnaes.zip"
            naturezas = raw / "Naturezas.zip"
            qualificacoes = raw / "Qualificacoes.zip"
            motivos = raw / "Motivos.zip"

            # Fixture sanitizada: exercita inclusive o novo CNPJ alfanumérico sem representar uma
            # empresa de produção. O pipeline nunca publica esta fixture no bundle da aplicação.
            establishment = [
                "A2345678", "0001", "95", "1", "TRANSPORTADORA FIXTURE", "02", "20260801",
                "00", "", "", "20200115", "4930202", "4930201,5250805", "RUA", "DAS FLORES",
                "100", "SALA 1", "CENTRO", "14010000", "SP", "6969", "16", "30000000", "",
                "", "", "", "CONTATO@FIXTURE.INVALID", "", "",
            ]
            company = ["A2345678", "EMPRESA FIXTURE LTDA", "2062", "49", "123456,78", "03", ""]
            write_zip(establishments, [establishment])
            write_zip(companies, [company])
            write_zip(simples, [["A2345678", "S", "20200115", "", "N", "", "20240101"]])
            write_zip(municipalities, [["6969", "RIBEIRAO PRETO"]])
            write_zip(cnaes, [["4930202", "Transporte rodoviário de carga"], ["4930201", "Transporte municipal"], ["5250805", "Operador de transporte"]])
            write_zip(naturezas, [["2062", "Sociedade Empresária Limitada"]])
            write_zip(qualificacoes, [["49", "Sócio-Administrador"]])
            write_zip(motivos, [["00", "Sem motivo"]])

            kwargs = dict(
                competence="2026-08",
                workdir=root / "work",
                output_root=root / "output",
                establishment_archives=[establishments],
                company_archives=[companies],
                simples_archive=simples,
                municipalities_archive=municipalities,
                cnaes_archive=cnaes,
                naturezas_archive=naturezas,
                qualificacoes_archive=qualificacoes,
                motivos_archive=motivos,
                ibge_rows=ibge_ribeirao(),
                source_url="https://fixture.invalid/receita",
                filter_uf="SP",
                filter_ibge="3543402",
                progress=lambda _message: None,
            )
            first = build_company_snapshot(**kwargs)
            second = build_company_snapshot(**kwargs)

            self.assertEqual(first["datasetHash"], second["datasetHash"])
            self.assertEqual(first["stats"]["recordsExported"], 1)
            self.assertEqual(first["stats"]["activeRecordsExported"], 1)
            self.assertEqual(first["semantics"]["icp"], "NOT_AVAILABLE")
            snapshot = root / "output" / "competencia=2026-08" / f"snapshot={first['datasetHash'][:16]}"
            self.assertTrue((snapshot / "manifest.json").exists())
            self.assertEqual(len(list((root / "output").rglob("companies.csv.gz"))), 1)

            with gzip.open(snapshot / "uf=SP" / "companies.csv.gz", "rt", encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(list(rows[0].keys()), COMPANY_EXPORT_COLUMNS)
            self.assertEqual(rows[0]["cnpj"], "A2345678000195")
            self.assertEqual(rows[0]["municipioIbge"], "3543402")
            self.assertEqual(rows[0]["situacaoCadastral"], "ATIVA")
            self.assertEqual(rows[0]["capitalSocial"], "123456.78")
            self.assertEqual(rows[0]["opcaoSimples"], "SIM")
            self.assertEqual(rows[0]["opcaoMei"], "NAO")
            self.assertEqual(rows[0]["icpTier"], "")
            self.assertEqual(rows[0]["hasRntrc"], "")
            secondary = json.loads(rows[0]["cnaesSecundarios"])
            self.assertEqual([item["code"] for item in secondary], ["4930201", "5250805"])

            with gzip.open(snapshot / "municipality-mapping.csv.gz", "rt", encoding="utf-8", newline="") as handle:
                mapping = next(csv.DictReader(handle))
            self.assertEqual(mapping["receitaCode"], "6969")
            self.assertEqual(mapping["ibgeCode"], "3543402")


if __name__ == "__main__":
    unittest.main()
