"""Generate a release-specific container name that fits a DNS label."""

import re
import sys


def container_name(release_id):
    match = re.fullmatch(r"([0-9a-f]{40})-([0-9]+)-([0-9]+)", release_id)
    if not match:
        raise ValueError("Invalid release ID")
    revision, run_id, attempt = match.groups()
    name = f"textmij-api-{revision[:12]}-{run_id}-{attempt}"
    if len(name) > 63:
        raise ValueError("Release container name exceeds the 63-byte DNS label limit")
    return name


if __name__ == "__main__":
    try:
        print(container_name(sys.argv[1]))
    except (ValueError, IndexError) as error:
        sys.exit(str(error))
