import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("names", Path(__file__).parents[1] / "deploy/names.py")
names = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(names)


class ReleaseNameTests(unittest.TestCase):
    def test_production_run_id_fits_a_dns_label(self):
        name = names.container_name("0f065d5445e832bf679b16cb4ca9f4666194a369-40340723565-1")
        self.assertLessEqual(len(name), 63)
        self.assertRegex(name, r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")

    def test_retries_and_runs_get_different_names(self):
        revision = "a" * 40
        self.assertNotEqual(names.container_name(f"{revision}-40340723565-1"), names.container_name(f"{revision}-40340723565-2"))
        self.assertNotEqual(names.container_name(f"{revision}-40340723565-1"), names.container_name(f"{revision}-40340723566-1"))

    def test_invalid_and_oversized_identifiers_fail(self):
        for release in ("not-a-release", "a" * 40 + "-" + "9" * 60 + "-1"):
            with self.subTest(release=release), self.assertRaises(ValueError):
                names.container_name(release)
