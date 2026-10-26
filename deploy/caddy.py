"""Edit only TextMij's block, preserving the inode used by Caddy's bind mount."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re

START = "# --- textmij (managed by TextMij deployment) ---"
END = "# --- end textmij ---"
DOMAIN = re.compile(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?")


def bounds(text):
    if START not in text and END not in text:
        return None
    if text.count(START) != 1 or text.count(END) != 1:
        raise ValueError("Malformed or duplicate TextMij Caddy markers")
    start = text.index(START)
    end = text.index(END) + len(END)
    if end < start:
        raise ValueError("Reversed TextMij Caddy markers")
    return start, end


def block(text):
    span = bounds(text)
    return text[span[0]:span[1]] if span else None


def replace(text, replacement):
    span = bounds(text)
    if span:
        return text[:span[0]] + (replacement or "") + text[span[1]:]
    if replacement is None:
        return text
    return text + ("\n\n" if text else "") + replacement + "\n"


def render(domain, upstream):
    if not DOMAIN.fullmatch(domain):
        raise ValueError("TEXTMIJ_DOMAIN must be a single DNS hostname without a scheme or path")
    if not re.fullmatch(r"textmij-api-[a-z0-9-]+", upstream):
        raise ValueError("Invalid TextMij upstream container name")
    template = Path(__file__).with_name("Caddyfile").read_text()
    return template.replace("__TEXTMIJ_DOMAIN__", domain).replace("__TEXTMIJ_UPSTREAM__", upstream).strip()


def edit(path, backup_path, domain=None, upstream=None, restore=False):
    # r+ and an in-place write keep the existing Docker bind mount attached.
    with Path(path).open("r+", encoding="utf-8", newline="") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        original = stream.read()
        current = block(original)
        if restore:
            state = json.loads(Path(backup_path).read_text())
            if current != state["candidate"]:
                raise ValueError("TextMij route changed since deployment; refusing to overwrite it")
            updated = replace(original, state["previous"])
        else:
            candidate = render(domain, upstream)
            # Save only our block; rollback must preserve other projects' changes.
            with Path(backup_path).open("x", encoding="utf-8") as backup:
                json.dump({"previous": current, "candidate": candidate}, backup)
            updated = replace(original, candidate)
        stream.seek(0)
        stream.write(updated)
        stream.truncate()
        stream.flush()
        os.fsync(stream.fileno())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["apply", "restore"])
    parser.add_argument("path", type=Path)
    parser.add_argument("backup", type=Path)
    parser.add_argument("domain", nargs="?")
    parser.add_argument("upstream", nargs="?")
    args = parser.parse_args()
    try:
        edit(args.path, args.backup, args.domain, args.upstream, args.action == "restore")
    except (ValueError, OSError) as error:
        parser.exit(1, f"Caddy update failed: {error}\n")
