import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("caddy", Path(__file__).parents[1] / "deploy/caddy.py")
caddy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(caddy)

OTHER = "# Shared server\nstock.example.com {\n\treverse_proxy stock:3000\n}\n\nmetelkaar.online {\n\treverse_proxy metelkaar-online-web:3000\n}\n"


class CaddyTests(unittest.TestCase):
    def test_add_route_preserves_all_existing_content(self):
        result = caddy.replace(OTHER, caddy.render("textmij.example.com", "textmij-api-abc"))
        self.assertTrue(result.startswith(OTHER))
        self.assertIn("reverse_proxy textmij-api-abc:3000", result)

    def test_replace_changes_only_owned_block(self):
        first = caddy.replace(OTHER, caddy.render("textmij.example.com", "textmij-api-old"))
        suffix = "\nextra.example.com { respond 200 }\n"
        result = caddy.replace(first + suffix, caddy.render("textmij.example.com", "textmij-api-new"))
        self.assertTrue(result.startswith(OTHER))
        self.assertTrue(result.endswith(suffix))
        self.assertEqual(result.count(caddy.START), 1)
        self.assertNotIn("textmij-api-old", result)

    def test_malformed_markers_are_rejected(self):
        for text in (caddy.START, caddy.END, caddy.END + "\n" + caddy.START,
                     caddy.START + caddy.END + caddy.START + caddy.END):
            with self.subTest(text=text), self.assertRaises(ValueError):
                caddy.replace(text, "replacement")

    def test_invalid_domains_cannot_inject_caddy_configuration(self):
        for domain in ("https://example.com", "example.com/path", "example.com {", "-example.com", "example.com\nother.com", ""):
            with self.subTest(domain=domain), self.assertRaises(ValueError):
                caddy.render(domain, "textmij-api-abc")

    def test_upstream_must_fit_a_dns_label(self):
        with self.assertRaises(ValueError):
            caddy.render("textmij.example.com", "textmij-api-" + "a" * 54)

    def test_rollback_preserves_other_projects_new_changes_and_inode(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Caddyfile"
            backup = Path(directory) / "rollback.json"
            previous = caddy.render("textmij.example.com", "textmij-api-old")
            original = caddy.replace(OTHER, previous)
            path.write_text(original)
            inode = path.stat().st_ino
            caddy.edit(path, backup, "textmij.example.com", "textmij-api-new")
            self.assertEqual(path.stat().st_ino, inode)
            extra = "\nnew-project.example.com { respond 200 }\n"
            with path.open("a") as stream:
                stream.write(extra)
            caddy.edit(path, backup, restore=True)
            self.assertEqual(path.read_text(), original + extra)
            self.assertEqual(path.stat().st_ino, inode)

    def test_first_deployment_rollback_removes_only_textmij(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Caddyfile"
            backup = Path(directory) / "rollback.json"
            path.write_text(OTHER)
            caddy.edit(path, backup, "textmij.example.com", "textmij-api-new")
            caddy.edit(path, backup, restore=True)
            self.assertTrue(path.read_text().startswith(OTHER))
            self.assertNotIn(caddy.START, path.read_text())

    def test_rollback_refuses_to_overwrite_a_later_textmij_release(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Caddyfile"
            backup = Path(directory) / "rollback.json"
            path.write_text(OTHER)
            caddy.edit(path, backup, "textmij.example.com", "textmij-api-new")
            later = path.read_text().replace("textmij-api-new", "textmij-api-later")
            path.write_text(later)
            with self.assertRaises(ValueError):
                caddy.edit(path, backup, restore=True)
            self.assertEqual(path.read_text(), later)
