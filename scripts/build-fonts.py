#!/usr/bin/env python3
"""Create static, subset WOFF2/TTF web-font deliverables from OFL sources."""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "fonts" / "source"
OUT = ROOT / "public" / "fonts"
CORPUS_FILES = [
    ROOT / "docs" / "script.md",
    ROOT / "docs" / "design" / "visual-spec.html",
]
CORPUS = "\n".join(p.read_text(encoding="utf-8") for p in CORPUS_FILES if p.exists())
CORPUS += "\nABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()[]{}<>/\\|+-_=:;,.?'\"“”‘’·—–…￥¥©®™°†‡×÷→←↑↓ "
JOBS = [
    ("CormorantGaramond-Variable.ttf", "cormorant-garamond-medium.ttf", 500),
    ("CormorantGaramond-Variable.ttf", "cormorant-garamond-semibold.ttf", 600),
    ("NotoSansSC-Variable.ttf", "noto-sans-sc-regular.ttf", 400),
    ("NotoSansSC-Variable.ttf", "noto-sans-sc-medium.ttf", 500),
    ("NotoSerifSC-Variable.ttf", "noto-serif-sc-medium.ttf", 500),
    ("NotoSerifSC-Variable.ttf", "noto-serif-sc-semibold.ttf", 600),
]


def make_static_subset(source: Path, destination: Path, weight: int) -> None:
    font = TTFont(source)
    if "fvar" in font:
        font = instantiateVariableFont(font, {"wght": weight}, inplace=False, updateFontNames=True)
    buf = BytesIO()
    font.save(buf)
    buf.seek(0)
    font = TTFont(buf)
    options = subset.Options()
    options.flavor = None
    options.desubroutinize = True
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.recalc_bounds = True
    options.recalc_timestamp = False
    options.retain_gids = False
    options.glyph_names = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=CORPUS)
    subsetter.subset(font)
    font.save(destination)
    woff2 = TTFont(destination)
    woff2.flavor = "woff2"
    woff2.save(destination.with_suffix(".woff2"))
    print(f"{source.name} wght={weight} -> {destination.name} + woff2")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source_name, output_name, weight in JOBS:
        make_static_subset(SRC / source_name, OUT / output_name, weight)


if __name__ == "__main__":
    main()
