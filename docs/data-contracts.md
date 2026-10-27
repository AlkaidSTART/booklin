# Data Contracts / 资产数据契约

> Status: **concept data — commerce and CMS values pending**  
> Version: `2026-10-26`

The page should read its volatile content from these JSON files rather than hard-coding it into components. This keeps copy, pricing, links, graph data and benchmark evidence reviewable in one place.

---

## 1. `public/data/links.json`

**Purpose:** one-code entry target, QR metadata, legal link.

| Field | Type | Notes |
| --- | --- | --- |
| `landing.url` | string | Human-readable landing URL. Currently a reserved `.example` placeholder. |
| `landing.qrTarget` | string | URL encoded into the QR. Includes print-attribution UTMs. |
| `qr.file` / `qr.png` / `qr.card` | string | Public paths to the generated QR assets. |
| `qr.errorCorrection` | `"L" \| "M" \| "Q" \| "H"` | Current: `M`. |
| `qr.quietZoneModules` | number | Current: `4`. |
| `status` | string | `placeholder` until a production host is supplied. |

**Update rule:** change `landing.url` and `landing.qrTarget`, then run `node scripts/build-qr.mjs` and `node scripts/render-media.mjs`. Do not edit the SVG/PNG by hand.

---

## 2. `public/data/editions.json`

**Purpose:** the three deployment cards in Chapter 05.

| Field | Type | Notes |
| --- | --- | --- |
| `currency` | string \| null | `null` until commerce supplies a currency. |
| `price` | number \| null | `null` until commerce supplies a price. |
| `priceDisplay` | string | UI-safe fallback such as “Price pending”. |
| `checkoutUrl` | string \| null | `null` disables the CTA. |
| `available` | boolean | `false` disables purchase. |
| `recommended` | boolean | Exactly one edition should be recommended. |
| `features` / `featuresZh` | string[] | Short, scannable feature list. |

**Update rule:** commerce owns the final prices, currencies, availability and checkout URLs. The UI must render a disabled “Price pending” or “Contact sales” state when `checkoutUrl` or `price` is null. Do not invent a price to make the layout look complete.

---

## 3. `public/data/benchmark.json`

**Purpose:** machine-readable version of the Chapter 04 comparison and its evidence.

| Field | Type | Notes |
| --- | --- | --- |
| `devices` | array | iPad Pro, Kindle and CODEX 1 roles. |
| `dimensions` | array | Power, focus, durability, knowledge layer, sensory character. |
| `dimensions[].claimType` | string | `manufacturer-spec`, `descriptive`, `editorial`, `mixed`, `concept`. |
| `cells.*.value` | string | The short table cell. |
| `cells.*.evidence` | string | The supporting note or caveat. |
| `sources` | array | URLs, publishers, access dates, supported claims. |
| `legal` | object | Third-party, concept-claim and comparison disclaimers. |

**Update rule:** change `benchmark.json` and `docs/benchmark-sources.md` together. Do not add a comparative claim without a source or a concept marker.

---

## 4. `public/data/knowledge-graph.json`

**Purpose:** deterministic concept data for the Neural Link chapter and the static graph preview.

| Field | Type | Notes |
| --- | --- | --- |
| `page` | object | The physical page that anchors the layer. |
| `nodes[].id` | string | Unique node ID. |
| `nodes[].type` | string | `page`, `concept`, `citation`, `video`, `discussion`, `glossary`, `author`, `chapter`, `ai`. |
| `nodes[].x` / `.y` | number | Normalized 0–1 layout position. |
| `nodes[].weight` | number | 0–1 visual weight. |
| `links[]` | array | `source`, `target`, optional `label`, `weight`. |
| `dataNotes` | string[] | Explicitly says this is not a live AI output. |

**Update rule:** the current data is a concept preview. When the CMS export exists, keep the same shape and replace labels/links. Run `node scripts/build-knowledge-graph.mjs` to refresh the SVG.

---

## 5. `docs/copy-fields.json`

**Purpose:** the bilingual copy deck with layout limits.

| Field | Type | Notes |
| --- | --- | --- |
| `limits` | object | Desktop/mobile character limits and line guidance. |
| `fields[]` | array | Flat list of copy fields. |
| `fields[].id` | string | Stable ID for the UI / CMS. |
| `fields[].chapter` | string | `00-arrival` … `05-deployment`, or `global`. |
| `fields[].role` | string | `eyebrow`, `title`, `subtitle`, `annotation`, `metric`, `cardTitle`, `cardBody`, `cta`. |
| `fields[].en` / `.zh` | string | Desktop copy for each language. |
| `fields[].enMobile` / `.zhMobile` | string? | Optional mobile layout variants when the desktop phrase cannot meet the mobile limit. |
| `fields[].fullEn` / `.fullZh` | string? | Longer version when the short label is a layout derivative. |
| `fields[].fullEnMobile` / `.fullZhMobile` | string? | Optional mobile variants for the longer version. |
| `fields[].fullLimit` | string? | Limit key for the longer version. |

**Update rule:** `docs/script-final.md` is the human source of truth. `copy-fields.json` is the machine-readable copy deck. Update both, then run `node scripts/validate-copy.mjs`.

---

## 6. `public/data/asset-manifest.json`

**Purpose:** generated inventory of all delivered assets, their sizes, hashes and statuses.

- Regenerate with `node scripts/build-asset-manifest.mjs`.
- Status values: `delivered`, `placeholder`, `pending-external`, `not-in-scope`.
- The manifest does not replace `docs/assets.md`; it is the machine-readable companion.
- Raw source masters (`public/models/source/`, `public/textures/source/`, `public/fonts/source/`) and the pre-existing `public/voice/voice.mp3` are excluded from the delivery inventory.

---

## 7. Status vocabulary

| Status | Meaning |
| --- | --- |
| `delivered` | Asset exists at the documented path and passes the current review. |
| `placeholder` | Asset is usable for development, but contains an intentional placeholder value (e.g. `.example` URL). |
| `pending-external` | Asset cannot be completed until an external owner supplies content (commerce, instructor, legal). |
| `not-in-scope` | Confirmed out of scope for this project (e.g. audio branding). |

---

## 8. Validation

```sh
node scripts/validate-copy.mjs
node scripts/build-asset-manifest.mjs
```

`validate-copy.mjs` checks every field against the limits in `copy-fields.json` and reports any field that lacks English or Chinese copy. Build the page only from validated copy.
