#!/usr/bin/env python3
"""Dérivés PNG à partir du maître icons/logo-1024.png (export design).

Ne régénère pas favicon-16 / favicon-32 / icon-512 : les placer depuis la maquette.
Génère : icon-192.png, apple-touch-icon.png (180×180).

Prérequis : macOS `sips`, fichier icons/logo-1024.png

  npm run icons:gen
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    icons = root / "icons"
    master = icons / "logo-1024.png"
    if not master.is_file():
        print("Absent:", master, file=sys.stderr)
        print("Ajoutez logo-1024.png dans icons/ puis relancez.", file=sys.stderr)
        sys.exit(1)

    for z, name in [(192, "icon-192.png"), (180, "apple-touch-icon.png")]:
        subprocess.run(
            ["sips", "-z", str(z), str(z), str(master), "--out", str(icons / name)],
            check=True,
        )
        print("wrote", icons / name)


if __name__ == "__main__":
    main()
