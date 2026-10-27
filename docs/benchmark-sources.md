# Benchmark Sources / 参数依据与免责说明

> Status: **concept evidence register — legal review required**  
> Version: `2026-10-26`  
> Source copy: [`script-final.md`](script-final.md)  
> Machine-readable data: [`../public/data/benchmark.json`](../public/data/benchmark.json)

This document records where the comparison statements in Chapter 04 come from, what they do **not** prove, and what must be completed before the page can publish them as product specifications.

---

## 1. Scope and method

- **In scope:** the iPad Pro / Kindle comparison table and the numbered footnotes in Chapter 04.
- **Out of scope:** the “zero-watt”, durability, storage and latency claims elsewhere in the script. Those need their own technical evidence pack.
- **Method:** manufacturer-published specifications and product descriptions only. No comparative lab testing, battery rundown test, drop test, display measurement, or user study was performed by Bookln.
- **Comparison rule:** third-party devices are used as **context**, not as measured competitors. The page must not imply a head-to-head test that did not happen.
- **Concept rule:** every CODEX 1 value marked `†` is a forward-looking concept claim. It is not a shipped specification.

---

## 2. Claim register

| # | Claim in page copy | Location | Type | Evidence | Source IDs | Launch action |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | iPad Pro: “Rechargeable” | Ch. 04 table | Manufacturer spec | Apple lists a built-in rechargeable lithium-polymer battery and up to 10 hours of web browsing or video playback. | `apple-ipad-pro-specs` | Keep attribution; do not convert to a Bookln test result. |
| 2 | Kindle: “Weeks-class battery*” | Ch. 04 table | Manufacturer description | Amazon’s Kindle Paperwhite listing describes “weeks of battery life”. Actual results vary with use, wireless settings and light level. | `amazon-kindle-paperwhite` | Keep the asterisk and the “context only” footnote. Re-check the live listing before launch. |
| 3 | CODEX 1: “No battery chemistry†” | Ch. 04 table | Concept claim | No production unit or test report exists. The claim describes the paper-first design intent. | — | Technical evidence pack + legal review. |
| 4 | iPad Pro: “General-purpose apps” | Ch. 04 table | Descriptive | iPadOS ships with built-in apps and access to the App Store; the device is not limited to reading. | `apple-ipados` | Keep it descriptive; do not imply a focus/attention study. |
| 5 | Kindle: “Reading-first” | Ch. 04 table | Product-category description | Amazon positions Kindle as a dedicated reading device. This is positioning, not a measured attention outcome. | `amazon-kindle-paperwhite` | Keep the wording; do not add “distraction-free” as a measured claim. |
| 6 | CODEX 1: “Reading-only by design” | Ch. 04 table | Design intent | Bookln design intent: no feed, notifications or general-purpose app surface is planned. | — | Product/design sign-off. |
| 7 | iPad Pro: “Glass display” | Ch. 04 table | Manufacturer spec | Apple lists an Ultra Retina XDR display with a glass front and a nano-texture glass option. No drop-test comparison is claimed. | `apple-ipad-pro-specs` | Keep the material description; do not add durability rankings. |
| 8 | Kindle: “E-reader construction” | Ch. 04 table | Descriptive | Amazon describes Kindle Paperwhite as a glare-free e-reader. Bookln has not tested drop performance. | `amazon-kindle-paperwhite` | Keep descriptive; no drop-test claim. |
| 9 | CODEX 1: “Paper-first construction†” | Ch. 04 table | Concept claim | Structural and drop testing must be completed before any durability statement is published. | — | Structural test report + legal review. |
| 10 | iPad Pro: “App ecosystem” | Ch. 04 table | Descriptive | Apps are installed and opened through iPadOS and the App Store. | `apple-ipados` | Keep descriptive. |
| 11 | Kindle: “Dictionary / store” | Ch. 04 table | Descriptive | Kindle devices provide built-in reading tools and access to Amazon’s Kindle store. | `amazon-kindle-paperwhite` | Keep descriptive; verify current feature set before launch. |
| 12 | CODEX 1: “Scan-to-context companion layer” | Ch. 04 table | Concept capability | Represented by the deterministic knowledge-graph preview in this repo; not a live AI output. | — | Demo review; replace concept data with CMS export when available. |
| 13 | iPad Pro: “Metal and glass” | Ch. 04 table | Editorial material description | Based on Apple’s published enclosure and display materials. Not a tactile study. | `apple-ipad-pro-specs` | Keep as editorial context. |
| 14 | Kindle: “Polymer” | Ch. 04 table | Editorial material description | Material description, not a measured tactile study. | `amazon-kindle-paperwhite` | Keep as editorial context. |
| 15 | CODEX 1: “Fibre, ink and cloth” | Ch. 04 table | Concept art direction | Concept art direction for the physical object. | — | Confirm final bill of materials. |
| 16 | Footnote `*`: no lab testing | Ch. 04 footnotes | Disclosure | Bookln performed no comparative lab testing. | — | Keep visible at the same breakpoint as the table. |
| 17 | Footnote `†`: forward-looking claim | Ch. 04 footnotes | Disclosure | Concept claim; validate before launch. | — | Keep visible; link to this document. |

---

## 3. Source list

### S1 — Apple, “iPad Pro — Technical Specifications”

- **URL:** <https://www.apple.com/ipad-pro/specs/>
- **Publisher:** Apple
- **Accessed:** 2026-10-26
- **Supports:** built-in rechargeable lithium-polymer battery; up to 10 hours of web browsing on Wi-Fi or video playback; Ultra Retina XDR display with tandem OLED; nano-texture glass option; published enclosure/display materials.
- **Caveats:** Apple’s battery figures are Apple’s own test results. They are not comparable to any Bookln test. Product generations and regional pages can change. Capture a dated screenshot or PDF before launch review.

### S2 — Apple, “iPadOS”

- **URL:** <https://www.apple.com/ipados/>
- **Publisher:** Apple
- **Accessed:** 2026-10-26
- **Supports:** general-purpose apps, built-in apps, App Store distribution.
- **Caveats:** Used only for the descriptive statement that iPad Pro is a general-purpose app device. It does not support any attention-span or focus claim.

### S3 — Amazon, “Kindle Paperwhite — product listing”

- **URL:** <https://www.amazon.com/clp/B0CTMS64NT>
- **Publisher:** Amazon
- **Accessed:** 2026-10-26
- **Supports:** “weeks of battery life”; glare-free reading display; dedicated reading-device positioning.
- **Caveats:** Amazon product pages can be region-gated, personalized, or unavailable to automated fetches. The quoted phrases are from the public listing title/description captured on the access date. Manual review should re-open the live page and archive a screenshot. Amazon’s battery estimate depends on usage, wireless settings and light level. Bookln has not independently tested it.

---

## 4. Claims that are intentionally not supported

The following are **not** backed by the sources above and must not be presented as verified specifications:

- “300-year standby”, “zero battery decay” or any lifetime/storage figure.
- “179.9° field of view” as a measured optical result.
- “< 12 ms” input latency as a measured result.
- “0.00% blue-light radiation” as a measured safety claim.
- Any drop-test, scratch-test, water-test or durability ranking against iPad Pro or Kindle.
- Any statement that Bookln has conducted comparative lab testing.

If these claims remain in the concept copy, they stay marked as concept claims and cannot be published as product specifications until a technical evidence pack and legal review are attached.

---

## 5. Third-party trademarks

iPad Pro and iPadOS are trademarks of Apple Inc. Kindle is a trademark of Amazon.com, Inc. or its affiliates. Bookln is not affiliated with Apple or Amazon. Third-party names are used for contextual comparison only.

---

## 6. Launch review checklist

- [ ] Re-open S1, S2 and S3; archive dated screenshots/PDFs.
- [ ] Confirm the exact device generations and regions referenced by the final layout.
- [ ] Keep footnote `*` and `†` visible wherever the comparison table appears, including mobile.
- [ ] Confirm the table does not imply a head-to-head lab test.
- [ ] Attach the Bookln technical evidence pack for every `†` claim that remains.
- [ ] Legal review of the final bilingual copy.
- [ ] Update `public/data/benchmark.json` and this document together.
- [ ] Remove or rewrite any claim listed in §4 that cannot be evidenced.
