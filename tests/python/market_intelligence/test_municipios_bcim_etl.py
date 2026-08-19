from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

from etl_municipios_ibge import (  # noqa: E402
    build_municipios,
    parse_dbf_field,
    parse_shp_polygon_centroids,
    polygon_centroid,
)


def make_dbf(field_name: str, values: list[str], field_len: int = 15) -> bytes:
    """Monta um DBF minimo (dBASE III) com um unico campo de texto, para teste."""
    header_len = 32 + 32 + 1  # cabecalho fixo + 1 descritor de campo + terminator
    record_len = 1 + field_len
    header = bytearray(32)
    struct.pack_into("<IHH", header, 4, len(values), header_len, record_len)
    field_descriptor = bytearray(32)
    name_bytes = field_name.encode("latin-1")[:11]
    field_descriptor[0 : len(name_bytes)] = name_bytes
    field_descriptor[11] = ord("C")
    field_descriptor[16] = field_len
    body = bytearray()
    for value in values:
        body += b" "  # flag de exclusao
        body += value.encode("latin-1").ljust(field_len)[:field_len]
    return bytes(header) + bytes(field_descriptor) + b"\x0d" + bytes(body)


def make_shp_polygon_record(rings: list[list[tuple[float, float]]]) -> bytes:
    points = [point for ring in rings for point in ring]
    parts = []
    offset = 0
    for ring in rings:
        parts.append(offset)
        offset += len(ring)
    content = struct.pack("<i", 5)  # shape type Polygon
    content += struct.pack("<dddd", 0, 0, 0, 0)  # bbox (nao usado pelo parser)
    content += struct.pack("<ii", len(parts), len(points))
    content += struct.pack(f"<{len(parts)}i", *parts)
    for x, y in points:
        content += struct.pack("<dd", x, y)
    header = struct.pack(">ii", 1, len(content) // 2)
    return header + content


def make_shp(records: list[bytes]) -> bytes:
    return b"\x00" * 100 + b"".join(records)


class PolygonCentroidTests(unittest.TestCase):
    def test_single_ring_square_centroid(self) -> None:
        square = [(0, 0), (4, 0), (4, 4), (0, 4)]
        self.assertEqual(polygon_centroid([square]), (2.0, 2.0))

    def test_hole_with_opposite_winding_is_subtracted(self) -> None:
        outer = [(0, 0), (10, 0), (10, 10), (0, 10)]
        hole = [(8, 8), (8, 10), (10, 10), (10, 8)]  # winding oposto ao outer
        cx, cy = polygon_centroid([outer, hole])
        self.assertAlmostEqual(cx, 4.833333333333333)
        self.assertAlmostEqual(cy, 4.833333333333333)

    def test_degenerate_ring_returns_none(self) -> None:
        self.assertIsNone(polygon_centroid([[(1, 1), (1, 1)]]))


class DbfParsingTests(unittest.TestCase):
    def test_parses_fixed_width_text_field_in_record_order(self) -> None:
        payload = make_dbf("geocodigo", ["3550308", "3304557", "1200013"])
        self.assertEqual(parse_dbf_field(payload, "geocodigo"), ["3550308", "3304557", "1200013"])

    def test_missing_field_raises(self) -> None:
        payload = make_dbf("geocodigo", ["3550308"])
        with self.assertRaises(RuntimeError):
            parse_dbf_field(payload, "outro_campo")


class ShpParsingTests(unittest.TestCase):
    def test_parses_polygon_centroid_per_record_index_matching_dbf_order(self) -> None:
        square = [[(0, 0), (4, 0), (4, 4), (0, 4)]]
        triangle = [[(0, 0), (6, 0), (0, 6)]]
        payload = make_shp([make_shp_polygon_record(square), make_shp_polygon_record(triangle)])
        centroids = parse_shp_polygon_centroids(payload)
        self.assertEqual(centroids[0], (2.0, 2.0))
        self.assertEqual(centroids[1], (2.0, 2.0))  # centroide de triangulo reto (0,0)(6,0)(0,6) = (2,2)


class BuildMunicipiosTests(unittest.TestCase):
    def test_missing_centroid_is_null_never_estimated(self) -> None:
        registry = {
            "3550308": {"ibgeCode": "3550308", "name": "São Paulo", "uf": "SP", "region": "Sudeste"},
            "9999999": {"ibgeCode": "9999999", "name": "Sem Poligono", "uf": "SP", "region": "Sudeste"},
        }
        centroids = {"3550308": (-46.6, -23.5)}
        rows, stats = build_municipios(registry, centroids)
        by_code = {row["ibgeCode"]: row for row in rows}
        self.assertEqual(by_code["3550308"]["latitude"], -23.5)
        self.assertIsNone(by_code["9999999"]["latitude"])
        self.assertIsNone(by_code["9999999"]["longitude"])
        self.assertEqual(stats["municipalities_missing_centroid"], 1)
        self.assertEqual(stats["municipalities_with_centroid"], 1)


if __name__ == "__main__":
    unittest.main()
