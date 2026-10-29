# Lesson Preview Video / 讲解视频资产说明

> Status: **concept placeholder — final instructor footage pending**  
> Version: `2026-10-26`  
> Source composition: [`design/lesson-preview.html`](design/lesson-preview.html)

---

## 1. Delivered files

| File | Format | Notes |
| --- | --- | --- |
| `public/video/lesson-preview.mp4` | H.264 / MP4 | 1280 × 720, 24 fps, 15 s, silent, `yuv420p`, fast-start |
| `public/video/lesson-preview-poster.webp` | WebP | Poster frame at `t = 2.4 s` |
| `public/video/lesson-preview.vtt` | WebVTT | Bilingual captions, 5 cues |
| `docs/design/lesson-preview-poster.png` | PNG | Poster source for review |
| `docs/design/lesson-preview.html` | HTML/CSS/JS | Deterministic frame source |

The MP4 deliberately has **no audio track**. The asset checklist removed audio production from scope.

---

## 2. Storyboard

| Time | Chapter | Copy | Visual |
| --- | --- | --- | --- |
| 0.0–3.4 s | 00 / Arrival | CODEX 1. The Zero-Watt Cognitive Engine. | Floating cover, orbit ring, closed-form shadow |
| 3.4–6.8 s | 01 / Structure | Cellulose Display™ | Six-layer exploded stack, gold hinge line |
| 6.8–10.2 s | 02 / Interaction | Haptic Random Access | Paper fan, rust ribbon, heat line |
| 10.2–13.6 s | 03 / Neural Link | Analog at Heart. Digital in Soul. | Knowledge graph, one-code QR card |
| 13.6–15.0 s | 04 / Bookln | CODEX 1. | Wordmark end card |

The video is a **concept preview**, not a lesson recording. It exists so the page can be built, reviewed, and demoed before the instructor footage is produced.

---

## 3. Replacement brief

When the final instructor footage is available, replace the MP4 and poster while keeping the same public paths:

- **Length:** 45–90 s is preferred for a lesson sample; the current 15 s is a teaser.
- **Frame:** 16:9, 1920 × 1080 or 1280 × 720, 24/25/30 fps, H.264 High profile, `yuv420p`, fast-start.
- **Audio:** normalise to −16 LUFS integrated, −1 dBTP true peak. If audio is added, also supply a transcript and update the VTT.
- **Captions:** burn-in optional; sidecar VTT required.
- **Poster:** supply a 1280 × 720 frame with the instructor and the book visible. No text baked into the poster.
- **Content:** at least one instructor on camera, one page turn, one page-edge scan, and one companion-layer reveal. Keep the claim language aligned with `docs/script-final.md` and `docs/benchmark-sources.md`.
- **Rights:** talent release, music licence, location release, and captions review on file before launch.

---

## 4. Accessibility

- Captions are provided in `lesson-preview.vtt`.
- The video is silent; no audio-only information is required.
- The poster is a static fallback for reduced-motion and low-power devices.
- The clip is silent and pull-only: it runs only while its own step is the active one and pauses otherwise. Reduced-motion users get the poster alone.
- Keep the transcript in the DOM or behind a disclosure so screen-reader users can read the same content.

---

## 5. Regeneration

```sh
node scripts/render-lesson-preview.mjs
```

The script renders 360 deterministic frames from the HTML composition and encodes them with `libx264`. It requires Google Chrome and ffmpeg with `libx264`. The intermediate frames are written to `scripts/.cache/` and removed after encoding.

---

## 6. Status

- **Delivered:** concept MP4, poster, VTT, source composition.
- **Pending:** final instructor footage, talent/location/music rights, and legal review of spoken claims. Audio is not part of the current asset scope; if a future cut includes sound, add a −16 LUFS mix and update the transcript/captions.
- **Do not publish** the concept MP4 as if it were a recorded lesson. It is a visual placeholder.
