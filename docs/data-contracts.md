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

## 7. `public/data/shelf.json`

**Purpose:** concept data for Chapter 00 (shelf) — the spine mark and its public preview layer.

| Field | Type | Notes |
| --- | --- | --- |
| `mark.*` | object | Spine mark identity (`spine-mark`), bilingual labels. |
| `preview.contents[]` | array | Preview-layer chips: contents / sample chapter / lesson sample / graph outline. |
| `preview.note` / `.noteZh` | string | Public-layer rule — anyone meets the book before it is claimed. |
| `status` | string | `concept-data` until a publisher catalog export exists. |

**Update rule:** the preview set is illustrative; a publisher defines the real contents. The preview layer must never carry reader data (worldview D4).

---

## 8. `public/data/companion.json`

**Purpose:** concept data for Chapter 05 (loop) — session anchors and the cloud-soul capability suite.

| Field | Type | Notes |
| --- | --- | --- |
| `session.page` / `.pageLabel` | number / string | Hand anchor: Page 042. |
| `session.lesson` | string | Mind anchor: Lesson 07. |
| `session.anchors.hand` / `.mind` | object | Dual anchors with bilingual labels and positions. |
| `capabilities[]` | array | Cloud-soul suite: video / audio / graph / AI / journey. |
| `dataNotes` | string[] | Concept-only; not a live AI output. |

**Update rule:** reader progress stays in the reader's own account; nothing is written into the book or across readers (worldview D4).

---

## 9. Status vocabulary

| Status | Meaning |
| --- | --- |
| `delivered` | Asset exists at the documented path and passes the current review. |
| `placeholder` | Asset is usable for development, but contains an intentional placeholder value (e.g. `.example` URL). |
| `pending-external` | Asset cannot be completed until an external owner supplies content (commerce, instructor, legal). |
| `not-in-scope` | Confirmed out of scope for this project (e.g. audio branding). |

---

## 10. Validation

```sh
node scripts/validate-copy.mjs
node scripts/build-asset-manifest.mjs
```

`validate-copy.mjs` checks every field against the limits in `copy-fields.json` and reports any field that lacks English or Chinese copy. Build the page only from validated copy.

---

## 11. `public/data/marks.json`

**Purpose:** the two-mark interaction in Chapter 00 — spine mark vs. page-edge mark, and the four outcomes of claim state × mark.

| Field | Type | Notes |
| --- | --- | --- |
| `intro.label` / `.labelZh` | string | Console header: “Two marks, two meanings”. |
| `states[]` | array | `unclaimed` / `claimed` with bilingual labels. |
| `marks[]` | array | `spine` / `pageEdge`, each with ritual name (`The Encounter` / `The Claim`) and position. |
| `layers.preview` / `.soul` | object | Bilingual layer labels; item lists are pulled from `shelf.json` and `companion.json`. |
| `outcomes` | object | Keyed `mark:state`; each gives status, tone (`preview` / `fallback` / `soul`), target layer and bilingual note. |
| `dataNotes` | string[] | Encodes D1 (page-edge before purchase must fall back) and D4 (no reader data). |

**Update rule:** keep `pageEdge:unclaimed.layer` at `preview`. A page-edge scan before purchase must never unlock the full cloud soul. The spine mark stays public in both states.

---

## 12. `public/data/bookln.json`

**Purpose:** the business layer — Bookln Haven rules, the exit receipt, real supply figures and the B2B → worldview service map.

| Field | Type | Notes |
| --- | --- | --- |
| `haven.nature` / `.natureZh` | string | “A library you can buy from.” |
| `haven.rules[]` | array | Take, public spine marks, settle at exit, claim at home. |
| `settlement` | object | Exit receipt: paper body / cloud soul states, note and pending soul policy. |
| `facts.asOf` | string | `2023-07` — must be displayed with the figures. |
| `facts.items[]` | array | Publisher / title / visit / reader counts. Display the source label and disclaimer together. |
| `services[]` | array | bookln.cn B2B service → reader-side embodiment. |
| `policies[]` | array | `pending-business` or `locked`, with bilingual notes. |

**Update rule:** supply figures are the Bookln official 2023-07 values. Confirm the latest numbers with business before launch and do not mix them with `†` concept claims. Commerce owns the policy status of “soul travels with the book”.

---

## 13. `public/data/reader.json`

**Purpose:** the page copy shown inside the phone in Chapter R (Read) — the e-book edition of the book itself.

| Field | Type | Notes |
| --- | --- | --- |
| `book.title` / `.edition` | string | Device header: the book title and the e-book edition label. |
| `pages[].no` | string | Folio, tied to the ribbon anchor (`042` onward). |
| `pages[].chapter` | string | Chapter line above the page title. |
| `pages[].title` | string | Page headline. |
| `pages[].body` | string[] | Short page paragraphs; the phone is a reading surface, not a feed. |
| `pages[].pull` | string | One pull line that closes the page. |
| `pages[].note` | string | Margin note; may reference the page-edge mark. |
| `dataNotes` | string[] | Concept copy only; no reader data is written into the book. |

**Update rule:** keep the folio anchored at Page 042 so the ribbon and graph chapters stay aligned. This is concept page copy, not a licensed excerpt; replace it with publisher-supplied text before launch. The scroll position maps page turns — never add page controls or pagination buttons.
