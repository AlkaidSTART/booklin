#!/usr/bin/env python3
"""Build the Bookln brand SVGs from the licensed display font.

Run with fontTools available, for example:
  uv run --with fonttools python scripts/build-brand-assets.py
"""
from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / "public" / "fonts" / "cormorant-garamond-semibold.ttf"
OUT = ROOT / "public" / "brand"
OUT.mkdir(parents=True, exist_ok=True)

PAPER = "#E8DCC4"
INK = "#11100E"
INK_2 = "#211D18"
GOLD = "#C8A96D"
GOLD_2 = "#A78750"
RUST = "#9C3F2F"


def load_wordmark(text: str):
    font = TTFont(FONT)
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    hmtx = font["hmtx"]
    paths: list[tuple[str, float]] = []
    pen_x = 0.0
    min_x = float("inf")
    max_x = float("-inf")
    min_y = float("inf")
    max_y = float("-inf")

    for char in text:
        glyph_name = cmap.get(ord(char))
        if glyph_name is None:
            raise SystemExit(f"Missing glyph for {char!r} in {FONT.name}")
        pen = SVGPathPen(glyph_set)
        glyph_set[glyph_name].draw(pen)
        commands = pen.getCommands()
        if commands:
            bounds_pen = BoundsPen(glyph_set)
            glyph_set[glyph_name].draw(bounds_pen)
            if bounds_pen.bounds:
                x_min, y_min, x_max, y_max = bounds_pen.bounds
                min_x = min(min_x, pen_x + x_min)
                max_x = max(max_x, pen_x + x_max)
                min_y = min(min_y, y_min)
                max_y = max(max_y, y_max)
            paths.append((commands, pen_x))
        pen_x += hmtx[glyph_name][0]

    return {
        "paths": paths,
        "min_x": min_x,
        "max_x": max_x,
        "min_y": min_y,
        "max_y": max_y,
        "width": max_x - min_x,
        "height": max_y - min_y,
    }


def path_markup(wordmark: dict, fill: str) -> str:
    return "\n".join(
        f'      <path d="{escape(commands)}" transform="translate({x:.3f} 0)" fill="{fill}"/>'
        for commands, x in wordmark["paths"]
    )


def wordmark_svg(wordmark: dict, fill: str, title: str) -> str:
    pad = 42.0
    min_x = wordmark["min_x"] - pad
    min_y = -wordmark["max_y"] - pad
    width = wordmark["width"] + pad * 2
    height = wordmark["height"] + pad * 2
    nominal_width = 320
    nominal_height = nominal_width * height / width
    return f'''<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="{min_x:.3f} {min_y:.3f} {width:.3f} {height:.3f}" width="{nominal_width}" height="{nominal_height:.3f}">
  <title id="title">{escape(title)}</title>
  <desc id="desc">Outline wordmark generated from Cormorant Garamond SemiBold. The source font is licensed under the SIL Open Font License.</desc>
  <g transform="scale(1 -1)">
{path_markup(wordmark, fill)}
  </g>
</svg>
'''


def mark_svg(transparent: bool = False) -> str:
    background = "" if transparent else f'  <rect width="64" height="64" rx="13" fill="{INK}"/>\n'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 64 64" width="64" height="64">
  <title id="title">Bookln mark</title>
  <desc id="desc">A book block with a gold spine, a paper page edge and a rust bookmark.</desc>
{background}  <rect x="14.5" y="11.5" width="35" height="41" rx="1" fill="{INK_2}" stroke="{GOLD}" stroke-width="1.5"/>
  <rect x="18.6" y="13" width="1" height="38" fill="{PAPER}" opacity=".22"/>
  <rect x="19.8" y="13" width="2.5" height="38" fill="{GOLD}"/>
  <rect x="46" y="14.5" width="1.5" height="35" fill="{GOLD_2}"/>
  <path d="M36.5 11.5h6v13l-3-2.5-3 2.5z" fill="{RUST}"/>
  <path d="M26 21h13M26 26.5h13M26 32h9" stroke="{PAPER}" stroke-width="1.4" stroke-linecap="round" opacity=".72"/>
</svg>
'''


def lockup_svg(wordmark: dict, fill: str, title: str) -> str:
    width = 64 + 24 + 1 + 18 + (wordmark["width"] * (42.0 / wordmark["height"]))
    height = 80.0
    scale = 42.0 / wordmark["height"]
    tx = 64 + 24 + 1 + 18 - wordmark["min_x"] * scale
    ty = 19.0 + wordmark["max_y"] * scale
    return f'''<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 {width:.3f} 80" width="{width:.3f}" height="80">
  <title id="title">{escape(title)}</title>
  <desc id="desc">Bookln mark and outline wordmark lockup.</desc>
  <g transform="translate(0 8)">
    <rect width="64" height="64" rx="13" fill="{INK}"/>
    <rect x="14.5" y="11.5" width="35" height="41" rx="1" fill="{INK_2}" stroke="{GOLD}" stroke-width="1.5"/>
    <rect x="18.6" y="13" width="1" height="38" fill="{PAPER}" opacity=".22"/>
    <rect x="19.8" y="13" width="2.5" height="38" fill="{GOLD}"/>
    <rect x="46" y="14.5" width="1.5" height="35" fill="{GOLD_2}"/>
    <path d="M36.5 11.5h6v13l-3-2.5-3 2.5z" fill="{RUST}"/>
    <path d="M26 21h13M26 26.5h13M26 32h9" stroke="{PAPER}" stroke-width="1.4" stroke-linecap="round" opacity=".72"/>
  </g>
  <rect x="88" y="15" width="1" height="50" fill="{GOLD}"/>
  <g transform="translate({tx:.3f} {ty:.3f}) scale({scale:.8f} -{scale:.8f})">
{path_markup(wordmark, fill)}
  </g>
</svg>
'''


def main() -> None:
    wordmark = load_wordmark("bookln")
    files = {
        "bookln-wordmark.svg": wordmark_svg(wordmark, PAPER, "bookln"),
        "bookln-wordmark-light.svg": wordmark_svg(wordmark, INK, "bookln"),
        "bookln-lockup.svg": lockup_svg(wordmark, PAPER, "bookln lockup"),
        "bookln-lockup-light.svg": lockup_svg(wordmark, INK, "bookln lockup, light"),
        "bookln-mark.svg": mark_svg(transparent=False),
        "bookln-mark-transparent.svg": mark_svg(transparent=True),
    }
    for name, content in files.items():
        (OUT / name).write_text(content, encoding="utf-8")
        print("wrote", OUT / name)
    (ROOT / "public" / "favicon.svg").write_text(mark_svg(transparent=False), encoding="utf-8")
    print("wrote", ROOT / "public" / "favicon.svg")


if __name__ == "__main__":
    main()
