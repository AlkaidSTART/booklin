# Brand Assets / 品牌资产说明

> Status: **concept brand kit — launch review required**  
> Version: `2026-10-26`  
> Visual source: [`design/visual-spec.html`](design/visual-spec.html)  
> Tokens: [`../public/design/tokens.json`](../public/design/tokens.json) / [`../public/design/tokens.css`](../public/design/tokens.css)

---

## 1. Delivered files

| Asset | Path | Format | Use |
| --- | --- | --- | --- |
| Primary mark | `public/brand/bookln-mark.svg` | SVG | App icon, avatar, favicon source |
| Transparent mark | `public/brand/bookln-mark-transparent.svg` | SVG | Mark without the dark tile |
| Mark PNG 1024 | `public/brand/bookln-mark-1024.png` | PNG | Store listing, maskable icon |
| Mark PNG 512 | `public/brand/bookln-mark-512.png` | PNG | Manifest icon, social avatar |
| Mark PNG 192 | `public/brand/bookln-mark-192.png` | PNG | Android / manifest |
| Favicon 48 / 32 | `public/brand/favicon-48.png`, `public/brand/favicon-32.png` | PNG | Browser fallback |
| Favicon | `public/favicon.svg`, `public/favicon.ico` | SVG + ICO | Browser tab |
| Apple touch icon | `public/apple-touch-icon.png` | PNG | iOS home screen |
| Wordmark (paper) | `public/brand/bookln-wordmark.svg` | SVG | On dark surfaces |
| Wordmark (ink) | `public/brand/bookln-wordmark-light.svg` | SVG | On paper / light surfaces |
| Lockup (paper) | `public/brand/bookln-lockup.svg` | SVG | Header, footer, co-branding |
| Lockup (ink) | `public/brand/bookln-lockup-light.svg` | SVG | Print on paper |
| Web manifest | `public/site.webmanifest` | JSON | PWA metadata |

The wordmarks are **outlined paths**, not live text. They do not depend on the visitor having Cormorant Garamond installed. The mark is geometric and remains legible at 16 px.

Raster mark exports use a full-bleed `--ink-0` background so platform icon masks never reveal white corners; the SVG retains the rounded tile for editorial use.

---

## 2. Colour

| Token | Value | Use |
| --- | --- | --- |
| `--ink-0` | `#11100E` | Page background |
| `--ink-1` | `#181613` | Raised surface |
| `--ink-2` | `#211D18` | Card / book block |
| `--paper` | `#E8DCC4` | Paper, primary button, wordmark on dark |
| `--text` | `#F3EAD8` | Primary text |
| `--muted` | `#B9AF9E` | Secondary text |
| `--faint` | `#968D80` | Metadata |
| `--gold` | `#C8A96D` | Primary accent, rules, foil |
| `--gold-2` | `#A78750` | Secondary foil / page edge |
| `--rust` | `#9C3F2F` | Bookmark ribbon, rare emphasis |
| `--rust-text` | `#D27C65` | Accessible rust text on dark |

Do not introduce a second accent hue. Gold is the metal; rust is the ribbon. Paper and ink carry the rest. `--faint` is for metadata on dark surfaces only; use `--ink-2` or `--ink-3` on paper.

---

## 3. Typography

| Role | Family | Weight | Notes |
| --- | --- | --- | --- |
| Display | Cormorant Garamond | 500 | Editorial headlines, numerals, wordmark source |
| Editorial serif | Noto Serif SC | 500 | Chinese headlines and bilingual subtitles |
| Interface | Noto Sans SC | 400 / 500 | Body, labels, legal text |
| Utility | Noto Sans SC | 400 | Uppercase microcopy, 9–10 px, tracking `0.14em` |

All fonts are licensed under the SIL Open Font License. Licence files live in `public/fonts/licenses/`.

---

## 4. Logo usage

### Clear space

Keep at least **one quarter of the mark’s height** clear on all sides. For the lockup, use the height of the mark as the minimum clear-space unit.

### Minimum sizes

| Asset | Digital minimum | Print minimum |
| --- | --- | --- |
| Mark | 16 px | 6 mm |
| Wordmark | 80 px wide | 24 mm wide |
| Lockup | 132 px wide | 38 mm wide |

### Do

- Use the paper wordmark on `--ink-0` / `--ink-1`.
- Use the ink wordmark on `--paper` or photography with a light, quiet area.
- Keep the mark’s square proportions; scale uniformly.
- Use the SVG source whenever possible.
- Pair the mark with generous negative space and a single gold rule if a divider is needed.

### Don’t

- Do not stretch, skew, outline, or add a glow to the wordmark.
- Do not rotate the lockup.
- Do not place the paper wordmark on a busy mid-tone image without a dark scrim.
- Do not recolour the mark outside the palette above.
- Do not set the wordmark in another typeface.
- Do not add a tagline inside the lockup; use a separate line of type.

---

## 5. Regeneration

The brand SVGs are deterministic outputs of the licensed font and the palette above.

```sh
# One-time: fontTools is required for the outlined wordmark.
uv run --with fonttools python scripts/build-brand-assets.py

# Raster derivatives, favicons, QR card, graph PNG and fallback posters.
node scripts/render-media.mjs
```

If the wordmark text, font weight, or palette changes, rerun both commands and check:

- `public/favicon.svg` and `public/favicon.ico`
- `public/site.webmanifest`
- `public/brand/bookln-mark-*.png`
- `public/brand/bookln-lockup*.svg`
- The wordmark in `docs/design/lesson-preview.html` and `docs/design/fallback-poster.html`

---

## 6. Status

- **Delivered:** mark, wordmark, lockup, favicon set, manifest, tokens.
- **Pending:** final legal/brand sign-off; any additional co-brand lockups required by partners.
- **Not included:** audio branding, motion logo sting, merchandise templates.
