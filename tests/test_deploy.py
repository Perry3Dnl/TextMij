"""Exercise real activation/rollback code using fake Docker and public health."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
REVISION = "a" * 40
OLD = "textmij-api-old"
START = "# --- textmij (managed by TextMij deployment) ---"
END = "# --- end textmij ---"
OTHER = "metelkaar.online {\n\treverse_proxy metelkaar-online-web:3000\n}\n"

DOCKER = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ['FAKE_LOG'], 'a') as stream:
    stream.write(json.dumps(args) + '\n')
if args[:2] == ['inspect', 'dummy-stock-caddy']:
    print(json.dumps({'dummy-stock-simulator_default': {}}))
if 'up' in args and os.environ.get('FAKE_FAILURE') == 'candidate':
    sys.exit(1)
if 'validate' in args and os.environ.get('FAKE_FAILURE') == 'validation':
    flag = Path(os.environ['FAKE_LOG'] + '.failed')
    if not flag.exists():
        flag.touch()
        sys.exit(1)
'''

CURL = r'''#!/usr/bin/env python3
import json, os
revision = 'b' * 40 if os.environ.get('FAKE_FAILURE') == 'public' else 'a' * 40
print(json.dumps({'status': 'ok', 'service': 'textmij', 'revision': revision}))
'''


class DeploymentTests(unittest.TestCase):
    def deploy(self, failure="", first=False):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name)
        app = base / "textmij"
        release = app / "releases" / f"{REVISION}-123-1"
        release.mkdir(parents=True)
        shutil.copytree(ROOT / "deploy", release / "deploy")
        caddyfile = base / "Caddyfile"
        old_block = f"{START}\ntextmij.example.com {{\n\treverse_proxy {OLD}:3000\n}}\n{END}\n"
        original = OTHER if first else OTHER + old_block
        caddyfile.write_text(original)
        previous = app / "releases/previous"
        previous.mkdir()
        (previous / ".container").write_text(OLD)
        if not first:
            (app / "current").symlink_to(previous)
        binaries = base / "bin"
        binaries.mkdir()
        for name, content in {"docker": DOCKER, "curl": CURL, "sleep": "#!/bin/sh\nexit 0\n"}.items():
            target = binaries / name
            target.write_text(content)
            target.chmod(0o755)
        log = base / "docker.log"
        result = subprocess.run(
            ["bash", str(release / "deploy/activate.sh"), str(app), REVISION, "textmij.example.com"],
            env={**os.environ, "PATH": f"{binaries}:{os.environ['PATH']}",
                 "SHARED_CADDYFILE": str(caddyfile), "SHARED_CADDY_CONTAINER": "dummy-stock-caddy",
                 "SHARED_PROXY_NETWORK": "dummy-stock-simulator_default", "FAKE_FAILURE": failure, "FAKE_LOG": str(log)},
            capture_output=True, text=True, timeout=20,
        )
        commands = [json.loads(line) for line in log.read_text().splitlines()]
        return result, app, release, caddyfile, original, previous, commands

    def test_success_switches_route_then_stops_only_previous_textmij_container(self):
        result, app, release, caddyfile, _, _, commands = self.deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((app / "current").resolve(), release)
        self.assertTrue(caddyfile.read_text().startswith(OTHER))
        self.assertIn(f"textmij-api-{release.name}:3000", caddyfile.read_text())
        self.assertIn(["stop", "--time", "20", OLD], commands)
        self.assertFalse(any(command[:2] == ["rm", "-f"] for command in commands))
        self.assertFalse(any("restart" in command or "prune" in command for command in commands))

    def test_unhealthy_candidate_leaves_old_route_and_container_running(self):
        result, app, release, caddyfile, original, previous, commands = self.deploy("candidate")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(caddyfile.read_text(), original)
        self.assertEqual((app / "current").resolve(), previous)
        self.assertIn(["rm", "-f", f"textmij-api-{release.name}"], commands)
        self.assertFalse(any(command[0] == "stop" for command in commands))

    def test_invalid_caddy_config_rolls_back_without_stopping_old_container(self):
        result, app, _, caddyfile, original, previous, commands = self.deploy("validation")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(caddyfile.read_text(), original)
        self.assertEqual((app / "current").resolve(), previous)
        self.assertFalse(any(command[0] == "stop" for command in commands))

    def test_wrong_public_revision_rolls_back(self):
        result, app, _, caddyfile, original, previous, commands = self.deploy("public")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(caddyfile.read_text(), original)
        self.assertEqual((app / "current").resolve(), previous)
        self.assertFalse(any(command[0] == "stop" for command in commands))

    def test_first_deployment_failure_preserves_other_sites(self):
        result, app, _, caddyfile, _, _, _ = self.deploy("public", first=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(caddyfile.read_text().startswith(OTHER))
        self.assertNotIn(START, caddyfile.read_text())
        self.assertFalse((app / "current").exists())

    def test_first_deployment_success_has_no_previous_container_to_stop(self):
        result, app, release, _, _, _, commands = self.deploy(first=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((app / "current").resolve(), release)
        self.assertFalse(any(command[0] == "stop" for command in commands))
