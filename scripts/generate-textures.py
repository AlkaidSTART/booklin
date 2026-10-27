#!/usr/bin/env python3
"""Generate deterministic Bookln PBR atlases and a warm-studio HDRI."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "textures" / "source"
OUT.mkdir(parents=True, exist_ok=True)
FONT_DIR = ROOT / "public" / "fonts" / "source"

# UV regions for each object's six box faces. v is measured from the bottom.
REGIONS = {
    "front-cover": (0.00, 0.50, 0.50, 1.00),
    "back-cover": (0.50, 0.50, 1.00, 1.00),
    "spine": (0.00, 0.25, 0.25, 0.50),
    "page-0": (0.25, 0.25, 0.50, 0.50),
    "page-1": (0.50, 0.25, 0.75, 0.50),
    "page-2": (0.75, 0.25, 1.00, 0.50),
    "page-3": (0.00, 0.00, 0.25, 0.25),
    "page-4": (0.25, 0.00, 0.50, 0.25),
    "page-5": (0.50, 0.00, 0.75, 0.25),
    "ribbon": (0.75, 0.00, 1.00, 0.25),
}

FACE_SLOT = {
    # col, row within a region's 3x2 face grid
    "front": (0, 1),
    "back": (1, 1),
    "left": (2, 1),
    "right": (0, 0),
    "top": (1, 0),
    "bottom": (2, 0),
}


def face_uv(region: tuple[float, float, float, float], face: str) -> tuple[float, float, float, float]:
    u0, v0, u1, v1 = region
    c, r = FACE_SLOT[face]
    du = (u1 - u0) / 3.0
    dv = (v1 - v0) / 2.0
    return (u0 + c * du, v0 + r * dv, u0 + (c + 1) * du, v0 + (r + 1) * dv)


def face_px(size: int, region: tuple[float, float, float, float], face: str) -> tuple[int, int, int, int]:
    u0, v0, u1, v1 = face_uv(region, face)
    # Convert bottom-origin UV to PIL's top-origin pixel space.
    return (
        round(u0 * size),
        round((1.0 - v1) * size),
        round(u1 * size),
        round((1.0 - v0) * size),
    )


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size=size)


def paper_field(size: int, seed: int = 19) -> np.ndarray:
    rng = np.random.default_rng(seed)
    base = rng.normal(0, 1, (size, size)).astype(np.float32)
    # Cheap multi-scale fibre field from phase-shifted random rows/columns.
    fibre_x = rng.normal(0, 1, (size, 1)).repeat(size, axis=1)
    fibre_y = rng.normal(0, 1, (1, size)).repeat(size, axis=0)
    field = 0.62 * base + 0.24 * fibre_x + 0.14 * fibre_y
    img = Image.fromarray(((field - field.min()) / (field.max() - field.min()) * 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(max(0.5, size / 4096)))
    return np.asarray(img, dtype=np.float32) / 255.0


def make_basecolor(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), (20, 19, 17))
    px = np.asarray(img).astype(np.float32)
    grain = paper_field(size, 7)
    px[..., 0] += (grain - 0.5) * 10
    px[..., 1] += (grain - 0.5) * 8
    px[..., 2] += (grain - 0.5) * 6
    img = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)

    # Front cover: title art in the dedicated front-face UV island.
    rect = face_px(size, REGIONS["front-cover"], "front")
    x0, y0, x1, y1 = rect
    draw.rectangle(rect, fill=(24, 23, 20))
    # Cloth-like fine hatch.
    step = max(5, size // 256)
    for y in range(y0, y1, step):
        shade = 31 if (y // step) % 2 else 27
        draw.line((x0, y, x1, y), fill=(shade, shade - 1, shade - 3), width=1)
    inset = max(16, size // 64)
    gold = (190, 166, 116)
    gold_dim = (109, 95, 69)
    draw.rectangle((x0 + inset, y0 + inset, x1 - inset, y1 - inset), outline=gold_dim, width=max(1, size // 1024))
    # Thin asymmetrical registration frame.
    draw.line((x0 + inset * 1.8, y0 + inset * 2.1, x0 + inset * 1.8, y1 - inset * 2.1), fill=gold, width=max(2, size // 512))
    title_font = font("CormorantGaramond-Variable.ttf", int((x1 - x0) * 0.22))
    micro_font = font("CormorantGaramond-Variable.ttf", int((x1 - x0) * 0.045))
    cn_font = font("NotoSerifSC-Variable.ttf", int((x1 - x0) * 0.038))
    draw.text((x0 + (x1 - x0) * 0.15, y0 + (y1 - y0) * 0.30), "THE", font=title_font, fill=gold)
    draw.text((x0 + (x1 - x0) * 0.15, y0 + (y1 - y0) * 0.47), "BOOK.", font=title_font, fill=gold)
    draw.text((x0 + (x1 - x0) * 0.17, y0 + (y1 - y0) * 0.68), "ANALOG AT HEART", font=micro_font, fill=gold_dim)
    draw.text((x0 + (x1 - x0) * 0.17, y0 + (y1 - y0) * 0.73), "DIGITAL IN SOUL", font=micro_font, fill=gold_dim)
    draw.text((x0 + (x1 - x0) * 0.17, y0 + (y1 - y0) * 0.81), "纸端 · 云端 · 书链赋能", font=cn_font, fill=gold_dim)

    # Back cover: restrained colophon.
    bx0, by0, bx1, by1 = face_px(size, REGIONS["back-cover"], "front")
    draw.rectangle((bx0, by0, bx1, by1), fill=(22, 21, 18))
    mark_font = font("CormorantGaramond-Variable.ttf", int((bx1 - bx0) * 0.13))
    small_font = font("CormorantGaramond-Variable.ttf", int((bx1 - bx0) * 0.034))
    draw.text((bx0 + (bx1 - bx0) * 0.16, by0 + (by1 - by0) * 0.75), "bookln", font=mark_font, fill=(151, 131, 91))
    draw.text((bx0 + (bx1 - bx0) * 0.17, by0 + (by1 - by0) * 0.84), "EVERY PHYSICAL BOOK, CONNECTED", font=small_font, fill=(94, 83, 61))

    # Spine foil.
    sx0, sy0, sx1, sy1 = face_px(size, REGIONS["spine"], "front")
    draw.rectangle((sx0, sy0, sx1, sy1), fill=(27, 25, 21))
    spine_font = font("CormorantGaramond-Variable.ttf", max(10, int((sx1 - sx0) * 0.30)))
    draw.text((sx0 + (sx1 - sx0) * 0.24, sy0 + (sy1 - sy0) * 0.73), "THE BOOK.", font=spine_font, fill=gold)
    draw.line((sx0 + (sx1 - sx0) * 0.45, sy0 + (sy1 - sy0) * 0.12, sx0 + (sx1 - sx0) * 0.45, sy0 + (sy1 - sy0) * 0.65), fill=gold_dim, width=max(1, size // 1024))

    # Page faces: warm paper, registration rules and sparse text lines.
    for i in range(6):
        region = REGIONS[f"page-{i}"]
        for face in ("front", "back"):
            px_rect = face_px(size, region, face)
            x0, y0, x1, y1 = px_rect
            draw.rectangle(px_rect, fill=(214, 202, 176))
            kicker = max(6, (x1 - x0) // 16)
            margin = max(3, (x1 - x0) // 12)
            rule = (126, 112, 86)
            draw.line((x0 + margin, y0 + margin, x1 - margin, y0 + margin), fill=rule, width=max(1, kicker // 5))
            for row in range(6 + i % 3):
                yy = y0 + margin + int((y1 - y0) * (0.24 + row * 0.085))
                width = int((x1 - x0) * (0.46 + ((row * 13 + i * 7) % 32) / 100))
                draw.line((x0 + margin, yy, min(x1 - margin, x0 + margin + width), yy), fill=(125, 113, 91), width=max(1, kicker // 6))
            if i == 2:
                # Matrix-code block sits on one visible page for ch. 04.
                q = max(20, (x1 - x0) // 5)
                qx, qy = x1 - margin - q, y1 - margin - q
                for row in range(7):
                    for col in range(7):
                        if (row * 7 + col * 3 + 5) % 4 < 2:
                            draw.rectangle((qx + col * q / 7, qy + row * q / 7, qx + (col + 1) * q / 7, qy + (row + 1) * q / 7), fill=(42, 39, 33))

    # Ribbon.
    rx0, ry0, rx1, ry1 = face_px(size, REGIONS["ribbon"], "front")
    draw.rectangle((rx0, ry0, rx1, ry1), fill=(142, 55, 40))
    for x in range(rx0, rx1, max(2, size // 512)):
        draw.line((x, ry0, x, ry1), fill=(162, 70, 49), width=1)
    return img


def normal_from_height(size: int) -> Image.Image:
    h = paper_field(size, 31)
    # Include a low-frequency cloth weave.
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    weave = 0.035 * np.sin(xx * math.pi / max(4, size // 170)) * np.sin(yy * math.pi / max(4, size // 170))
    h = np.clip(h + weave, 0, 1)
    dx = np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)
    dy = np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)
    strength = 2.4
    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1)
    return Image.fromarray(np.clip((normal * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), "RGB")


def make_roughness(size: int) -> Image.Image:
    rng = np.random.default_rng(11)
    field = paper_field(size, 47)
    img = np.full((size, size, 3), 190, dtype=np.float32)
    img += (field - 0.5)[..., None] * 22
    draw_img = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(draw_img)
    front = face_px(size, REGIONS["front-cover"], "front")
    back = face_px(size, REGIONS["back-cover"], "front")
    for rect in (front, back):
        x0, y0, x1, y1 = rect
        draw.rectangle(rect, fill=(176, 176, 176))
    for i in range(6):
        for face in ("front", "back"):
            draw.rectangle(face_px(size, REGIONS[f"page-{i}"], face), fill=(214, 214, 214))
    spine = face_px(size, REGIONS["spine"], "front")
    draw.rectangle(spine, fill=(116, 116, 116))
    ribbon = face_px(size, REGIONS["ribbon"], "front")
    draw.rectangle(ribbon, fill=(225, 225, 225))
    return draw_img


def make_metalness(size: int) -> Image.Image:
    # White only where foil/thread is expected; black elsewhere.
    out = Image.new("RGB", (size, size), (0, 0, 0))
    draw = ImageDraw.Draw(out)
    # Foil title strokes are approximated with a narrow inset frame and spine rule.
    x0, y0, x1, y1 = face_px(size, REGIONS["front-cover"], "front")
    inset = max(12, size // 72)
    w = max(2, size // 900)
    draw.rectangle((x0 + inset, y0 + inset, x1 - inset, y1 - inset), outline=(255, 255, 255), width=w)
    draw.line((x0 + inset * 2, y0 + inset * 2, x0 + inset * 2, y1 - inset * 2), fill=(255, 255, 255), width=max(2, w * 2))
    # Title area: a restrained metallic patch so the gold text reads at a distance.
    draw.rectangle((x0 + int((x1-x0)*.14), y0 + int((y1-y0)*.31), x0 + int((x1-x0)*.78), y0 + int((y1-y0)*.52)), fill=(170, 170, 170))
    sx0, sy0, sx1, sy1 = face_px(size, REGIONS["spine"], "front")
    draw.line((sx0 + (sx1-sx0)//2, sy0 + (sy1-sy0)//8, sx0 + (sx1-sx0)//2, sy0 + (sy1-sy0)*5//8), fill=(255, 255, 255), width=max(2, size // 900))
    return out


def make_ao(size: int) -> Image.Image:
    # Baked-in broad AO: dark page gutters and corner falloff.
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    nx = (xx / max(1, size - 1)) * 2 - 1
    ny = (yy / max(1, size - 1)) * 2 - 1
    edge = np.clip(0.93 - 0.20 * (nx * nx + ny * ny), 0, 1)
    ao = (edge * 255).astype(np.uint8)
    img = Image.fromarray(np.stack((ao, ao, ao), axis=-1), "RGB")
    draw = ImageDraw.Draw(img)
    for i in range(6):
        for face in ("front", "back"):
            x0, y0, x1, y1 = face_px(size, REGIONS[f"page-{i}"], face)
            gutter = max(2, (x1 - x0) // 12)
            draw.rectangle((x0, y0, x0 + gutter, y1), fill=(158, 158, 158))
            draw.rectangle((x0 + gutter, y0, x0 + gutter * 2, y1), fill=(190, 190, 190))
    return img


def make_oak(size: int) -> tuple[Image.Image, Image.Image, Image.Image]:
    rng = np.random.default_rng(71)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    # Long oak grain: warped horizontal bands and fine pores.
    warp = 9 * np.sin(xx / size * math.pi * 4) + rng.normal(0, 0.6, (size, size))
    bands = np.sin((yy + warp) / size * math.pi * 84)
    pores = rng.normal(0, 0.5, (size, size))
    tone = 0.55 + 0.19 * bands + 0.06 * pores
    r = np.clip(116 * tone + 40, 0, 255)
    g = np.clip(76 * tone + 24, 0, 255)
    b = np.clip(45 * tone + 12, 0, 255)
    color = Image.fromarray(np.stack((r, g, b), axis=-1).astype(np.uint8), "RGB")
    rough = Image.fromarray(np.clip(166 + bands * 18 + pores * 4, 0, 255).astype(np.uint8), "L").convert("RGB")
    height = (bands * 0.25 + pores * 0.12).astype(np.float32)
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nz = np.ones_like(dx)
    length = np.sqrt(dx * dx + dy * dy + nz * nz)
    normal = np.stack((-dx / length, -dy / length, nz / length), axis=-1)
    normal_img = Image.fromarray(np.clip((normal * .5 + .5) * 255, 0, 255).astype(np.uint8), "RGB")
    return color, normal_img, rough


def write_radiance_hdr(path: Path, width: int = 1024, height: int = 512) -> None:
    """Write a small, deterministic RGBE equirectangular warm studio light."""
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    lon = (xx / width) * 2 * math.pi - math.pi
    lat = (yy / height) * math.pi - math.pi / 2
    sky = np.stack(
        (
            0.08 + 0.12 * np.clip(np.cos(lat), 0, 1),
            0.065 + 0.085 * np.clip(np.cos(lat), 0, 1),
            0.045 + 0.05 * np.clip(np.cos(lat), 0, 1),
        ),
        axis=-1,
    )
    # Two soft boxes, placed toward the front-left and rear-right.
    for cx, cy, sx, sy, power, tint in [
        (-1.2, 0.15, 0.55, 0.32, 10.0, (1.0, 0.76, 0.52)),
        (1.42, -0.05, 0.78, 0.42, 5.5, (1.0, 0.86, 0.68)),
    ]:
        d = ((lon - cx) / sx) ** 2 + ((lat - cy) / sy) ** 2
        light = np.exp(-d * 2.8) * power
        sky[..., 0] += light * tint[0]
        sky[..., 1] += light * tint[1]
        sky[..., 2] += light * tint[2]
    # Floor bounce.
    floor = np.clip((-lat - 0.3) / 1.2, 0, 1)[..., None]
    sky += floor * np.array([0.06, 0.035, 0.018], dtype=np.float32)
    rgb = sky.astype(np.float32)
    maxc = rgb.max(axis=-1, keepdims=True)
    exponent = np.where(maxc > 1e-6, np.ceil(np.log2(np.maximum(maxc, 1e-6))), -128).astype(np.int32)
    scale = np.exp2(exponent) / np.maximum(maxc, 1e-6)
    mantissa = np.clip(rgb * scale * 256, 0, 255).astype(np.uint8)
    rgbe = np.empty((height, width, 4), dtype=np.uint8)
    rgbe[..., :3] = mantissa
    rgbe[..., 3] = np.clip(exponent[..., 0] + 128, 0, 255).astype(np.uint8)
    header = (
        f"#?RADIANCE\n# Bookln warm studio HDRI\nFORMAT=32-bit_rle_rgbe\n\n"
        f"-Y {height} +X {width}\n"
    ).encode("ascii")
    path.write_bytes(header + rgbe.tobytes())


def main() -> None:
    for size in (2048, 1024):
        out = OUT if size == 2048 else OUT.parent / "mobile" / "source"
        out.mkdir(parents=True, exist_ok=True)
        base = make_basecolor(size)
        normal = normal_from_height(size)
        rough = make_roughness(size)
        metal = make_metalness(size)
        ao = make_ao(size)
        base.save(out / "book-basecolor.png", optimize=True)
        normal.save(out / "book-normal.png", optimize=True)
        rough.save(out / "book-roughness.png", optimize=True)
        metal.save(out / "book-metalness.png", optimize=True)
        ao.save(out / "book-ao.png", optimize=True)
        print(f"wrote book PBR {size}x{size} -> {out}")
    oak_size = 1024
    oak_base, oak_normal, oak_rough = make_oak(oak_size)
    oak_base.save(OUT / "oak-basecolor.png", optimize=True)
    oak_normal.save(OUT / "oak-normal.png", optimize=True)
    oak_rough.save(OUT / "oak-roughness.png", optimize=True)
    write_radiance_hdr(ROOT / "public" / "hdri" / "warm-studio.hdr")
    print("wrote oak textures and warm-studio.hdr")


if __name__ == "__main__":
    main()
