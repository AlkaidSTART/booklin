# Asset Scripts / 资产生成脚本

All asset sources are versioned. Derived files can be regenerated deterministically from the commands below.

## Prerequisites

| Tool | Used for |
| --- | --- |
| Node.js ≥ 22.23.4 + pnpm | QR, graph, manifest, copy validation |
| Google Chrome | Headless rendering of SVG/HTML and video frames |
| ffmpeg with `libx264` | MP4 encoding, favicon `.ico` |
| `cwebp` | WebP derivatives |
| Blender 5.x | Book, slipcase, desk and pedestal GLBs |
| `uv` + fontTools | Outlined brand wordmark |
| `@gltf-transform/cli` | Draco/KTX2 optimisation and inspection |

Chrome path defaults to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; override with `CHROME_PATH`.

## Pipeline

```sh
# 1. Models, textures, fonts and visual spec (existing sources)
blender -b --python scripts/build-models.py
blender -b --python scripts/build-hand.py
python scripts/generate-textures.py
uv run --with fonttools python scripts/build-fonts.py
node scripts/capture-visual-spec.mjs

# 2. Brand SVGs, QR, knowledge graph
uv run --with fonttools python scripts/build-brand-assets.py
node scripts/build-qr.mjs
node scripts/build-knowledge-graph.mjs

# 3. Raster derivatives, fallback posters, lesson video
node scripts/render-media.mjs
node scripts/render-lesson-preview.mjs

# 4. Validate and inventory
node scripts/validate-copy.mjs
node scripts/build-asset-manifest.mjs
```

## Script reference

| Script | Output |
| --- | --- |
| `build-models.py` | `public/models/*.glb` (incl. `shelf.glb`; `BOOKLN_ONLY=shelf` builds just the shelf), source `.blend` files |
| `generate-textures.py` | `public/hdri/*.hdr`, `public/textures/**/*.ktx2`, source PNGs |
| `build-fonts.py` | `public/fonts/*.woff2`, `*.ttf`, licence files |
| `capture-visual-spec.mjs` | `docs/design/visual-spec-*.png` and `.webp` |
| `build-brand-assets.py` | `public/brand/*.svg`, `public/favicon.svg` |
| `build-qr.mjs` | `public/qr/spine-mark.svg`, `public/qr/one-code-entry.{svg,png}`, card assets |
| `build-knowledge-graph.mjs` | `public/design/knowledge-graph.svg` |
| `render-media.mjs` | brand PNGs/favicons, QR card PNG/WebP, graph PNG/WebP, fallback posters |
| `render-lesson-preview.mjs` | `public/video/lesson-preview.mp4`, poster WebP |
| `validate-copy.mjs` | copy-limit report; exit code 1 on error |
| `build-asset-manifest.mjs` | `public/data/asset-manifest.json`, `docs/asset-manifest.md` |

## Notes

- `public/data/links.json` is the source of truth for the QR target. Replace the `.example` host before generating print assets.
- `public/data/editions.json` prices and checkout URLs are intentionally `null` until commerce supplies them.
- `scripts/.cache/` is temporary render output and is ignored by git.
- The lesson video is a concept placeholder. See [`../docs/video-spec.md`](../docs/video-spec.md) before replacing it with instructor footage.
