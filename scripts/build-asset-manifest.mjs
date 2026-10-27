#!/usr/bin/env node
/**
 * Build the asset inventory and human-readable delivery manifest.
 * Run: node scripts/build-asset-manifest.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestJson = path.join(root, 'public', 'data', 'asset-manifest.json');
const manifestMd = path.join(root, 'docs', 'asset-manifest.md');

const groups = [
  {
    id: 'A1',
    label: 'Book 3D model',
    status: 'delivered',
    role: 'delivery',
    files: ['public/models/book-transformed.glb'],
    notes: 'Draco-compressed GLB with shape keys Key_Closed, Key_HalfOpen and Key_Flat.',
  },
  {
    id: 'A2',
    label: 'Book PBR textures',
    status: 'delivered',
    role: 'delivery',
    files: [
      'public/textures/book-ao.ktx2',
      'public/textures/book-basecolor.ktx2',
      'public/textures/book-metalness.ktx2',
      'public/textures/book-normal.ktx2',
      'public/textures/book-roughness.ktx2',
      'public/textures/mobile/book-ao.ktx2',
      'public/textures/mobile/book-basecolor.ktx2',
      'public/textures/mobile/book-metalness.ktx2',
      'public/textures/mobile/book-normal.ktx2',
      'public/textures/mobile/book-roughness.ktx2',
    ],
    notes: 'Desktop and mobile KTX2 / Basis Universal sets. Source PNGs remain under public/textures/source for regeneration.',
  },
  {
    id: 'A3',
    label: 'Slipcase 3D model',
    status: 'delivered',
    role: 'delivery',
    files: ['public/models/slipcase.glb'],
    notes: 'Draco-compressed GLB used by the sixth chapter.',
  },
  {
    id: 'A4',
    label: 'Desk and pedestal',
    status: 'delivered',
    role: 'delivery',
    files: ['public/models/oak-desk.glb', 'public/models/display-pedestal.glb', 'public/textures/oak-basecolor.ktx2', 'public/textures/oak-normal.ktx2', 'public/textures/oak-roughness.ktx2'],
    notes: 'Programmatic oak desk and display pedestal with oak PBR maps.',
  },
  {
    id: 'A5',
    label: 'Fonts',
    status: 'delivered',
    role: 'delivery',
    files: [
      'public/fonts/cormorant-garamond-medium.woff2',
      'public/fonts/cormorant-garamond-semibold.woff2',
      'public/fonts/noto-sans-sc-regular.woff2',
      'public/fonts/noto-sans-sc-medium.woff2',
      'public/fonts/noto-serif-sc-medium.woff2',
      'public/fonts/noto-serif-sc-semibold.woff2',
      'public/fonts/cormorant-garamond-medium.ttf',
      'public/fonts/cormorant-garamond-semibold.ttf',
      'public/fonts/noto-sans-sc-regular.ttf',
      'public/fonts/noto-sans-sc-medium.ttf',
      'public/fonts/noto-serif-sc-medium.ttf',
      'public/fonts/noto-serif-sc-semibold.ttf',
    ],
    notes: 'WOFF2 + TTF. OFL licence files live in public/fonts/licenses/.',
  },
  {
    id: 'A6',
    label: 'Visual specification and design references',
    status: 'delivered',
    role: 'reference',
    files: [
      'docs/design/visual-spec.html',
      'docs/design/visual-spec-desktop.png',
      'docs/design/visual-spec-desktop.webp',
      'docs/design/visual-spec-mobile.png',
      'docs/design/visual-spec-mobile.webp',
      'docs/design/book-cover-art.png',
      'docs/design/book-preview-closed.png',
      'docs/design/book-preview-open.png',
      'public/design/tokens.json',
      'public/design/tokens.css',
    ],
    notes: 'Desktop and mobile visual spec, book previews, and implementation-ready design tokens. Figma handoff is not required for the concept build.',
  },
  {
    id: 'A7',
    label: 'Final bilingual copy',
    status: 'delivered',
    role: 'reference',
    files: ['docs/script-final.md', 'docs/script.md', 'docs/copy-fields.json'],
    notes: 'Canonical copy deck is script-final.md; script.md is a legacy mirror. Desktop/mobile limits and layout variants are validated by scripts/validate-copy.mjs. Launch review still required for all claim language.',
  },
  {
    id: 'B1',
    label: 'One-code entry QR and links',
    status: 'placeholder',
    role: 'delivery',
    files: [
      'public/data/links.json',
      'public/qr/one-code-entry.svg',
      'public/qr/one-code-entry.png',
      'public/qr/one-code-entry-card.svg',
      'public/qr/one-code-entry-card.png',
      'public/qr/one-code-entry-card.webp',
    ],
    notes: 'QR content is generated from links.json. The target currently uses the reserved .example host and must be replaced before launch.',
  },
  {
    id: 'B2',
    label: 'Editions, prices and checkout',
    status: 'pending-external',
    role: 'delivery',
    files: ['public/data/editions.json'],
    notes: 'Schema and three editions are delivered, but prices and checkout URLs are null until the commerce owner supplies them.',
  },
  {
    id: 'B3',
    label: 'Lesson video and poster',
    status: 'placeholder',
    role: 'delivery',
    files: [
      'public/video/lesson-preview.mp4',
      'public/video/lesson-preview-poster.webp',
      'public/video/lesson-preview.vtt',
      'docs/design/lesson-preview-poster.png',
      'docs/design/lesson-preview.html',
      'docs/video-spec.md',
    ],
    notes: '15 s silent concept preview. Final instructor footage, audio and rights clearance are pending.',
  },
  {
    id: 'B4',
    label: 'Knowledge graph data and preview',
    status: 'delivered',
    role: 'delivery',
    files: [
      'public/data/knowledge-graph.json',
      'public/design/knowledge-graph.svg',
      'public/design/knowledge-graph.png',
      'public/design/knowledge-graph.webp',
    ],
    notes: 'Deterministic concept graph with 9 nodes and 11 links. Replace with CMS export when available.',
  },
  {
    id: 'B5',
    label: 'Brand mark, wordmark and favicon',
    status: 'delivered',
    role: 'delivery',
    files: [
      'public/brand/bookln-mark.svg',
      'public/brand/bookln-mark-transparent.svg',
      'public/brand/bookln-mark-1024.png',
      'public/brand/bookln-mark-512.png',
      'public/brand/bookln-mark-192.png',
      'public/brand/bookln-wordmark.svg',
      'public/brand/bookln-wordmark-light.svg',
      'public/brand/bookln-lockup.svg',
      'public/brand/bookln-lockup-light.svg',
      'public/brand/favicon-32.png',
      'public/brand/favicon-48.png',
      'public/favicon.svg',
      'public/favicon.ico',
      'public/apple-touch-icon.png',
      'public/site.webmanifest',
      'docs/brand-guidelines.md',
    ],
    notes: 'Outlined wordmarks, geometric mark, favicon set, Apple touch icon and web manifest.',
  },
  {
    id: 'B6',
    label: 'Studio HDRI',
    status: 'delivered',
    role: 'delivery',
    files: ['public/hdri/warm-studio.hdr'],
    notes: 'Warm studio environment used by the 3D scene.',
  },
  {
    id: 'B7',
    label: 'Fallback posters',
    status: 'delivered',
    role: 'delivery',
    files: [
      'public/fallback/book-cover-art.webp',
      'public/fallback/fallback-desktop.webp',
      'public/fallback/fallback-mobile.webp',
      'docs/design/fallback-poster.html',
      'docs/design/fallback-desktop.png',
      'docs/design/fallback-mobile.png',
    ],
    notes: 'Static desktop and mobile posters for low-power devices and reduced-motion mode.',
  },
  {
    id: 'B8',
    label: 'Benchmark sources and evidence',
    status: 'delivered',
    role: 'reference',
    files: ['public/data/benchmark.json', 'docs/benchmark-sources.md'],
    notes: 'Claim register, source URLs, caveats and legal disclaimers. All † claims still need a technical evidence pack.',
  },
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const assets = groups.map((group) => {
  const files = group.files.map((relative) => {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) {
      return { path: relative, bytes: null, sha256: null, missing: true };
    }
    const stat = fs.statSync(absolute);
    return {
      path: relative,
      bytes: stat.size,
      sha256: sha256(absolute),
      missing: false,
    };
  });
  return {
    id: group.id,
    label: group.label,
    status: group.status,
    role: group.role,
    notes: group.notes,
    files,
    bytes: files.reduce((sum, file) => sum + (file.bytes || 0), 0),
    missing: files.filter((file) => file.missing).map((file) => file.path),
  };
});

const missing = assets.flatMap((asset) => asset.missing);
const statusCounts = assets.reduce((counts, asset) => {
  counts[asset.status] = (counts[asset.status] || 0) + 1;
  return counts;
}, {});

const manifest = {
  version: '2026-10-26',
  generatedAt: new Date().toISOString(),
  source: 'docs/assets.md',
  statusCounts,
  totals: {
    groups: assets.length,
    files: assets.reduce((sum, asset) => sum + asset.files.length, 0),
    bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    missing: missing.length,
  },
  assets,
};

fs.writeFileSync(manifestJson, `${JSON.stringify(manifest, null, 2)}\n`);

const rows = assets.map((asset) => {
  const fileList = asset.files.map((file) => `\`${file.path}\``).join('<br />');
  const size = asset.bytes > 0 ? `${(asset.bytes / 1024).toFixed(1)} KB` : '—';
  return `| ${asset.id} | ${asset.label} | ${asset.status} | ${size} | ${fileList} |`;
});

const markdown = `# Asset Manifest / 资产交付清单\n\n> Generated: \`${manifest.generatedAt}\`  \n> Source: [\`assets.md\`](assets.md)  \n> Machine-readable: [\`../public/data/asset-manifest.json\`](../public/data/asset-manifest.json)  \n> Excludes raw source masters under \`public/models/source/\`, \`public/textures/source/\`, \`public/fonts/source/\`, and the pre-existing \`public/voice/voice.mp3\` (not part of the current asset scope).\n\n## Summary\n\n| Status | Groups |\n| --- | ---: |\n${Object.entries(statusCounts).map(([status, count]) => `| ${status} | ${count} |`).join('\n')}\n\n- Groups: **${manifest.totals.groups}**\n- Files: **${manifest.totals.files}**\n- Total inventory bytes: **${(manifest.totals.bytes / 1024 / 1024).toFixed(2)} MB** (includes source/reference docs; not first-screen transfer)\n- Missing files: **${manifest.totals.missing}**\n\n## Assets\n\n| ID | Asset | Status | Bytes | Files |\n| --- | --- | --- | ---: | --- |\n${rows.join('\n')}\n\n## Missing files\n\n${missing.length === 0 ? 'None.' : missing.map((file) => `- \`${file}\``).join('\n')}\n\n## Status meaning\n\n- **delivered** — file exists at the documented path and passes the current review.\n- **placeholder** — usable for development, but contains an intentional placeholder value.\n- **pending-external** — blocked on an external owner (commerce, instructor, legal).\n\nRegenerate with:\n\n\`\`\`sh\nnode scripts/build-asset-manifest.mjs\n\`\`\`\n`;

fs.writeFileSync(manifestMd, markdown);

console.log(JSON.stringify({
  manifest: path.relative(root, manifestJson),
  markdown: path.relative(root, manifestMd),
  statusCounts,
  totals: manifest.totals,
  missing,
}, null, 2));

if (missing.length > 0) process.exitCode = 1;
