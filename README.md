# Bookln / CODEX 1.

A concept product page for **CODEX 1.**, a paper-first reading object by Bookln. The experience is a single-page 3D scrollytelling build: a physical book, an exploded material study, a haptic interaction sequence, and a page-edge bridge into a companion knowledge layer.

> **Status:** concept build. Product claims, prices, availability, third-party comparisons and legal language are illustrative and require review before launch. See [`docs/benchmark-sources.md`](docs/benchmark-sources.md).

---

## Start

```sh
pnpm install
pnpm dev
```

Build and preview:

```sh
pnpm build
pnpm preview
```

## Project map

```text
docs/                 Storyboard, visual spec, copy deck, asset and data contracts
public/brand/         Mark, wordmark, lockup, favicon and app icons
public/data/          Links, editions, benchmark, knowledge-graph and asset-manifest data
public/design/        Design tokens and knowledge-graph preview
public/fallback/      Static posters for low-power / reduced-motion fallback
public/fonts/         Licensed display and text fonts
public/hdri/          Warm studio and night-desk environments
public/models/        Book, slipcase, desk, pedestal and shelf GLBs
public/qr/            Page-edge QR assets
public/textures/      KTX2 PBR textures
public/video/         Lesson-preview placeholder, poster and captions
scripts/              Deterministic asset build and validation scripts
src/                  Astro application
```

## Key documents

| Document | What it covers |
| --- | --- |
| [`docs/TDD.md`](docs/TDD.md) | Technical design and performance targets |
| [`docs/script-final.md`](docs/script-final.md) | Bilingual concept copy |
| [`docs/copy-fields.json`](docs/copy-fields.json) | Machine-readable copy and length limits |
| [`docs/assets.md`](docs/assets.md) | Asset checklist and delivery status |
| [`docs/asset-manifest.md`](docs/asset-manifest.md) | Generated inventory with sizes and hashes |
| [`docs/benchmark-sources.md`](docs/benchmark-sources.md) | Comparison claim register and disclaimers |
| [`docs/brand-guidelines.md`](docs/brand-guidelines.md) | Brand usage, files, colours and type |
| [`docs/video-spec.md`](docs/video-spec.md) | Lesson-video placeholder and replacement brief |
| [`docs/data-contracts.md`](docs/data-contracts.md) | JSON contracts for links, editions, graph and benchmark |

Full visual reference: [`docs/design/visual-spec.html`](docs/design/visual-spec.html).

## Asset commands

```sh
pnpm validate:copy       # check bilingual copy against desktop/mobile limits
pnpm assets:qr           # rebuild page-edge QR from public/data/links.json
pnpm assets:graph        # rebuild knowledge-graph.svg from JSON
pnpm assets:media        # rasterise brand, QR card, graph and fallback posters
pnpm assets:video        # render the 15 s lesson-preview concept film
pnpm assets:manifest     # refresh public/data/asset-manifest.json
```

See [`scripts/README.md`](scripts/README.md) for the full pipeline, including Blender, fontTools and Chrome prerequisites.

## Notes

- The QR target is currently `https://bookln.example/...` — a reserved documentation host. Replace it with the production landing URL and rebuild the QR before print.
- `public/data/editions.json` intentionally leaves prices and checkout URLs `null` until commerce supplies them.
- The lesson video is a **concept placeholder**, not recorded instructor footage.
- No audio branding or sound effects are in scope.
- Third-party names are trademarks of their respective owners. Bookln is not affiliated with Apple or Amazon.
