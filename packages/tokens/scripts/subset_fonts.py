#!/usr/bin/env python3
"""Subset the self-hosted fonts for both sites (integration-plan §8 W1.7).

Reads fonts/sources.json, fetches each pinned npm package with `npm pack`
(npm verifies the registry integrity hash), and for every face:

1. limits the variable `wght` axis to the configured range (or pins it),
2. subsets to the configured code points, keeping all OpenType layout
   features (Hebrew mark positioning needs GPOS mark/mkmk and ccmp),
3. drops hinting and writes woff2 to fonts/<id>.woff2.

It then writes fonts/manifest.json (files, sizes, sha256, unicode ranges actually
present in each subset, vertical metrics for metric-matched fallbacks, source
package and integrity) and copies each package's OFL licence to
fonts/licenses/. `npm run css -w @emunas/tokens` turns the manifest into
css/fonts.css.

Usage (from the repo root):
    python3 -m venv .venv-fonts
    .venv-fonts/bin/pip install -r packages/tokens/scripts/requirements.txt
    .venv-fonts/bin/python -I packages/tokens/scripts/subset_fonts.py
Options:
    --src DIR   use already extracted packages in DIR/<npm-pack-tarball-stem>/package
                instead of running `npm pack` (offline regeneration)
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "fonts"
SOURCES = FONTS / "sources.json"
MANIFEST = FONTS / "manifest.json"
LICENSES = FONTS / "licenses"

# Name records kept: copyright, family, subfamily, unique id, full name, version,
# PostScript name, licence description, licence URL (OFL attribution stays in the file).
NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 13, 14]


def parse_ranges(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        part = part.strip().removeprefix("U+")
        if not part:
            continue
        lo, _, hi = part.partition("-")
        start = int(lo, 16)
        end = int(hi, 16) if hi else start
        out.extend(range(start, end + 1))
    return out


def to_ranges(cps: set[int]) -> str:
    ordered = sorted(cps)
    parts: list[str] = []
    i = 0
    while i < len(ordered):
        j = i
        while j + 1 < len(ordered) and ordered[j + 1] == ordered[j] + 1:
            j += 1
        a, b = ordered[i], ordered[j]
        parts.append(f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}")
        i = j + 1
    return ",".join(parts)


def npm_pack(spec: str, dest: Path) -> tuple[Path, str]:
    """Runs `npm pack` for an exact spec and safely extracts it. Returns (package dir, integrity)."""
    raw = subprocess.run(
        ["npm", "pack", spec, "--json", "--pack-destination", str(dest)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    info = json.loads(raw)[0]
    tarball = dest / info["filename"]
    target = dest / tarball.name.removesuffix(".tgz")
    target.mkdir()
    with tarfile.open(tarball) as tar:
        tar.extractall(target, filter="data")
    return target / "package", info["integrity"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glyph_top(font: TTFont, cp: int) -> int | None:
    """yMax of the glyph for `cp` at the default instance, or None if absent."""
    name = font.getBestCmap().get(cp)
    if name is None:
        return None
    pen = BoundsPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    return None if pen.bounds is None else round(pen.bounds[3])


def vertical_metrics(font: TTFont) -> dict[str, int | None]:
    """hhea metrics (for ascent/descent/line-gap overrides on fallback faces) and
    the heights of ה and x, used to size faces against each other."""
    hhea = font["hhea"]
    return {
        "unitsPerEm": font["head"].unitsPerEm,
        "ascender": hhea.ascent,
        "descender": hhea.descent,
        "lineGap": hhea.lineGap,
        "hebrewHeight": glyph_top(font, 0x05D4),
        "xHeight": glyph_top(font, 0x0078),
    }


def reload(font: TTFont) -> TTFont:
    """Round-trips through an in-memory TTF so every table is fully decompiled
    (woff2 input and instancer output otherwise keep lazily loaded gvar data
    that the subsetter cannot index)."""
    buf = io.BytesIO()
    font.flavor = None
    font.save(buf)
    buf.seek(0)
    return TTFont(buf, lazy=False, recalcTimestamp=False)


def build_face(face: dict, src_file: Path, ranges: dict[str, str]) -> dict:
    font = reload(TTFont(src_file, lazy=False, recalcTimestamp=False))
    wmin, wmax = face["wght"]
    if "fvar" in font:
        axes = {a.axisTag: a for a in font["fvar"].axes}
        if set(axes) != {"wght"}:
            raise SystemExit(f"{face['id']}: expected a wght-only variable font, got {sorted(axes)}")
        limit = wmin if wmin == wmax else (wmin, wmax)
        font = reload(instancer.instantiateVariableFont(font, {"wght": limit}, updateFontNames=False))

    wanted = set(parse_ranges(ranges[face["range"]]))
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = NAME_IDS
    options.name_languages = [0x409]
    options.hinting = False
    options.notdef_outline = True
    options.drop_tables += ["DSIG"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=sorted(wanted))
    subsetter.subset(font)

    present = set(font.getBestCmap()) & wanted
    out = FONTS / f"{face['id']}.woff2"
    font.flavor = "woff2"
    font.save(out)

    return {
        "id": face["id"],
        "family": face["family"],
        "style": face["style"],
        "weight": [wmin, wmax],
        "variable": wmin != wmax,
        "file": out.name,
        "bytes": out.stat().st_size,
        "sha256": sha256(out),
        "unicodeRange": to_ranges(present),
        "metrics": vertical_metrics(font),
        "source": {"package": face["package"], "file": face["file"]},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", type=Path, help="directory with extracted packages (skips npm pack)")
    args = parser.parse_args()

    config = json.loads(SOURCES.read_text(encoding="utf-8"))
    LICENSES.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="emunas-fonts-") as tmp:
        package_dirs: dict[str, Path] = {}
        packages: dict[str, dict[str, str]] = {}
        for key, spec in config["packages"].items():
            if args.src:
                name, _, version = spec.rpartition("@")
                stem = f"{name.lstrip('@').replace('/', '-')}-{version}"
                pkg_dir, integrity = args.src / stem / "package", "unverified (--src)"
                if not pkg_dir.is_dir():
                    raise SystemExit(f"--src: missing {pkg_dir}")
            else:
                pkg_dir, integrity = npm_pack(spec, Path(tmp))
            package_dirs[key] = pkg_dir
            packages[key] = {"spec": spec, "integrity": integrity, "license": "OFL-1.1"}
            shutil.copyfile(pkg_dir / "LICENSE", LICENSES / f"{key}.txt")

        faces = []
        for face in config["faces"]:
            src_file = package_dirs[face["package"]] / face["file"]
            built = build_face(face, src_file, config["ranges"])
            faces.append(built)
            print(f"{built['file']:40} {built['bytes']:>7} B  {built['unicodeRange'][:60]}")

    total = sum(f["bytes"] for f in faces)
    manifest = {
        "$comment": "Generated by scripts/subset_fonts.py from fonts/sources.json. Do not edit.",
        "packages": packages,
        "totalBytes": total,
        "faces": faces,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"total {total} B ({total / 1024:.1f} KiB) in {len(faces)} faces")
    return 0


if __name__ == "__main__":
    sys.exit(main())
