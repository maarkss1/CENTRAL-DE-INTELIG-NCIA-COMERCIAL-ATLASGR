import csv
import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[3] / "scripts" / "market-intelligence" / "load_company_snapshot.py"
spec = importlib.util.spec_from_file_location("load_company_snapshot", MODULE_PATH)
assert spec and spec.loader
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)


def write_gzip_csv(path: Path, columns: list[str], row: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerow(row)


class CompanySnapshotLoaderTest(unittest.TestCase):
    def test_build_sql_uses_copy_atomic_publication_and_redacts_global_contacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            company_path = root / "uf=SP" / "companies.csv.gz"
            row = {column: "" for column in loader.COMPANY_COLUMNS}
            row.update({
                "cnpj": "A2345678000195",
                "cnpjBasico": "A2345678",
                "cnpjOrdem": "0001",
                "cnpjDv": "95",
                "razaoSocial": "EMPRESA FIXTURE LTDA",
                "razaoSocialSearch": "EMPRESA FIXTURE LTDA",
                "situacaoCadastral": "ATIVA",
                "municipioIbge": "3543402",
                "municipioNome": "Ribeirão Preto",
                "uf": "SP",
                "telefone1": "30000000",
                "email": "contato@fixture.invalid",
                "dataOrigin": "OBSERVED",
                "competencia": "2026-08",
                "cnaesSecundarios": "[]",
            })
            write_gzip_csv(company_path, loader.COMPANY_COLUMNS, row)

            mapping_path = root / "municipality-mapping.csv.gz"
            mapping = {column: "" for column in loader.MAPPING_COLUMNS}
            mapping.update({
                "receitaCode": "6969",
                "receitaName": "RIBEIRAO PRETO",
                "uf": "SP",
                "ibgeCode": "3543402",
                "ibgeName": "Ribeirão Preto",
                "mappingMethod": "RECEITA_NAME_UF_TO_IBGE_OFFICIAL",
                "sourceVersion": "2026-08",
            })
            write_gzip_csv(mapping_path, loader.MAPPING_COLUMNS, mapping)

            manifest = {
                "dataset": "CNPJ_COMPANIES",
                "source": "RECEITA_FEDERAL_CNPJ",
                "sourceVersion": "2026-08",
                "sourceUrl": "https://fixture.invalid/receita",
                "competencia": "2026-08",
                "pipelineVersion": "fixture-v1",
                "datasetHash": "a" * 64,
                "files": [{
                    "path": "uf=SP/companies.csv.gz",
                    "sha256": loader.sha256_file(company_path),
                    "records": 1,
                    "uf": "SP",
                }],
                "municipalityMappingFile": {
                    "path": "municipality-mapping.csv.gz",
                    "sha256": loader.sha256_file(mapping_path),
                    "records": 1,
                },
                "stats": {"recordsExported": 1, "establishmentRowsRead": 1},
                "rejections": {},
            }
            (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            sql = loader.build_psql_script(root, manifest)
            self.assertIn("\\copy mi_company_stage", sql)
            self.assertIn("BEGIN;", sql)
            self.assertIn("COMMIT;", sql)
            self.assertIn("CNPJ_ACTIVE", sql)
            self.assertIn("^[A-Z0-9]{12}[0-9]{2}$", sql)

            target_columns = sql.split('INSERT INTO "MarketIntelligenceCompany" (', 1)[1].split(')\nSELECT', 1)[0]
            self.assertNotIn('"telefone1"', target_columns)
            self.assertNotIn('"telefone2"', target_columns)
            self.assertNotIn('"fax"', target_columns)
            self.assertNotIn('"email"', target_columns)
            self.assertNotIn('"hasRntrc"', target_columns)

    def test_manifest_hash_mismatch_fails_before_database(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            company_path = root / "uf=SP" / "companies.csv.gz"
            write_gzip_csv(company_path, loader.COMPANY_COLUMNS, {column: "" for column in loader.COMPANY_COLUMNS})
            mapping_path = root / "municipality-mapping.csv.gz"
            write_gzip_csv(mapping_path, loader.MAPPING_COLUMNS, {column: "" for column in loader.MAPPING_COLUMNS})
            manifest = {
                "dataset": "CNPJ_COMPANIES",
                "competencia": "2026-08",
                "datasetHash": "b" * 64,
                "files": [{"path": "uf=SP/companies.csv.gz", "sha256": "0" * 64, "records": 1}],
                "municipalityMappingFile": {"path": "municipality-mapping.csv.gz", "sha256": loader.sha256_file(mapping_path)},
                "stats": {"recordsExported": 1},
            }
            with self.assertRaisesRegex(RuntimeError, "SHA-256 divergente"):
                loader.build_psql_script(root, manifest)


if __name__ == "__main__":
    unittest.main()
