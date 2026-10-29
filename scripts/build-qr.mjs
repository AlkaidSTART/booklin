#!/usr/bin/env node
/**
 * Build the page-edge QR assets from public/data/links.json.
 * Run: node scripts/build-qr.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import qrcode from 'qrcode-generator';

const root = path.resolve(import.meta.dirname, '..');
const linksPath = path.join(root, 'public', 'data', 'links.json');
const outDir = path.join(root, 'public', 'qr');
const links = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
const target = links.landing.qrTarget;
const errorCorrection = links.qr.errorCorrection || 'M';
const quietZone = Number(links.qr.quietZoneModules || 4);

const qr = qrcode(0, errorCorrection);
qr.addData(target);
qr.make();

const modules = qr.getModuleCount();
const total = modules + quietZone * 2;
const ink = '#11100E';
const paper = '#E8DCC4';
const inkRgb = [17, 16, 14];
const paperRgb = [232, 220, 196];

const xmlEscape = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

fs.mkdirSync(outDir, { recursive: true });

function svgModuleRects(scale = 1) {
  const parts = [];
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) continue;
      const x = (col + quietZone) * scale;
      const y = (row + quietZone) * scale;
      parts.push(`M${x} ${y}h${scale}v${scale}h-${scale}z`);
    }
  }
  return parts.join('');
}

const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 ${total} ${total}" width="1024" height="1024" shape-rendering="crispEdges">
  <title id="title">Bookln one-code entry QR</title>
  <desc id="desc">Scan to open the companion knowledge layer for any Bookln-connected book. Target: ${xmlEscape(target)}</desc>
  <rect width="${total}" height="${total}" fill="${paper}"/>
  <path d="${svgModuleRects(1)}" fill="${ink}"/>
</svg>
`;
fs.writeFileSync(path.join(outDir, 'one-code-entry.svg'), rawSvg);

const cardWidth = 480;
const cardHeight = 640;
const qrSize = 320;
const qrX = (cardWidth - qrSize) / 2;
const qrY = 92;
const cardScale = qrSize / total;
const cardModules = svgModuleRects(cardScale);
const displayUrl = links.landing.url.replace(/^https?:\/\//, '');

const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 ${cardWidth} ${cardHeight}" width="${cardWidth}" height="${cardHeight}">
  <title id="title">Bookln one-code entry card</title>
  <desc id="desc">Print-ready card with the page-edge QR, the English label “Scan to context” and the Chinese label “一码入网”.</desc>
  <rect width="${cardWidth}" height="${cardHeight}" fill="${paper}"/>
  <rect x="18.5" y="18.5" width="${cardWidth - 37}" height="${cardHeight - 37}" fill="none" stroke="${ink}" stroke-opacity=".18"/>
  <rect x="${cardWidth - 66}" y="34" width="24" height="24" fill="#9C3F2F"/>
  <text x="48" y="58" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="10" letter-spacing="2.2" fill="${ink}">BOOKLN / PAGE 042</text>
  <g transform="translate(${qrX} ${qrY})">
    <rect width="${qrSize}" height="${qrSize}" fill="${paper}"/>
    <path d="${cardModules}" fill="${ink}"/>
  </g>
  <rect x="48" y="448" width="${cardWidth - 96}" height="1" fill="${ink}" fill-opacity=".22"/>
  <text x="48" y="490" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="18" font-weight="500" letter-spacing="2.6" fill="${ink}">SCAN TO CONTEXT</text>
  <text x="48" y="518" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="16" fill="${ink}">一码入网</text>
  <text x="48" y="552" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="10" fill="${ink}" fill-opacity=".58">${displayUrl}</text>
  <text x="48" y="592" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="8" letter-spacing="1.6" fill="${ink}" fill-opacity=".5">PAGE-EDGE ACCESS / 001</text>
  <text x="${cardWidth - 48}" y="592" text-anchor="end" font-family="'Cormorant Garamond','Times New Roman',serif" font-size="16" fill="${ink}">bookln</text>
</svg>
`;
fs.writeFileSync(path.join(outDir, 'one-code-entry-card.svg'), cardSvg);

// Minimal PNG writer so the QR deliverables do not depend on a raster library.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(filePath, width, height, rgbAt) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = rgbAt(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

const pngSize = Math.floor(1024 / total) * total;
const scalePx = pngSize / total;
writePng(path.join(outDir, 'one-code-entry.png'), pngSize, pngSize, (x, y) => {
  const col = Math.floor(x / scalePx) - quietZone;
  const row = Math.floor(y / scalePx) - quietZone;
  if (col < 0 || row < 0 || col >= modules || row >= modules) return paperRgb;
  return qr.isDark(row, col) ? inkRgb : paperRgb;
});

// Asset C3: spine mark — a narrow, ink-on-paper QR variant for the book spine.
const spineLink = links.spine;
let spineModules = null;
if (spineLink) {
  const spineQr = qrcode(0, spineLink.errorCorrection || 'Q');
  spineQr.addData(spineLink.qrTarget);
  spineQr.make();
  spineModules = spineQr.getModuleCount();
  const spineQuiet = Number(spineLink.quietZoneModules || 2);
  const spineTotal = spineModules + spineQuiet * 2;
  const spineParts = [];
  for (let row = 0; row < spineModules; row += 1) {
    for (let col = 0; col < spineModules; col += 1) {
      if (spineQr.isDark(row, col)) spineParts.push(`M${col + spineQuiet} ${row + spineQuiet}h1v1h-1z`);
    }
  }
  const spineSvg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 ${spineTotal} ${spineTotal}" width="512" height="512" shape-rendering="crispEdges">
  <title id="title">Bookln spine mark</title>
  <desc id="desc">Scan the spine to open the public preview layer: contents, sample chapter, lesson sample and graph outline. Target: ${xmlEscape(spineLink.qrTarget)}</desc>
  <rect width="${spineTotal}" height="${spineTotal}" fill="${paper}"/>
  <path d="${spineParts.join('')}" fill="${ink}"/>
</svg>
`;
  fs.writeFileSync(path.join(outDir, 'spine-mark.svg'), spineSvg);
}

// Asset A10: page-edge mark — printed on the fore-edge at P.042 and read by the
// phone in the claim chapter. Higher error correction than the entry code: it is
// scanned at an angle on a curved edge, and the camera feed pushes in close.
const pageEdge = links.pageEdge;
let pageEdgeModules = null;
if (pageEdge) {
  const edgeQr = qrcode(0, pageEdge.errorCorrection || 'H');
  edgeQr.addData(pageEdge.qrTarget);
  edgeQr.make();
  pageEdgeModules = edgeQr.getModuleCount();
  const edgeQuiet = Number(pageEdge.quietZoneModules || 2);
  const edgeTotal = pageEdgeModules + edgeQuiet * 2;
  const edgeParts = [];
  for (let row = 0; row < pageEdgeModules; row += 1) {
    for (let col = 0; col < pageEdgeModules; col += 1) {
      if (edgeQr.isDark(row, col)) edgeParts.push(`M${col + edgeQuiet} ${row + edgeQuiet}h1v1h-1z`);
    }
  }
  const edgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 ${edgeTotal} ${edgeTotal}" width="1024" height="1024" shape-rendering="crispEdges">
  <title id="title">Bookln page-edge mark, P.042</title>
  <desc id="desc">Claim layer: scanning attaches the companion layer to this copy. Carries no reader data. Target: ${xmlEscape(pageEdge.qrTarget)}</desc>
  <rect width="${edgeTotal}" height="${edgeTotal}" fill="${paper}"/>
  <path d="${edgeParts.join('')}" fill="${ink}"/>
</svg>
`;
  fs.writeFileSync(path.join(outDir, 'page-edge-p042.svg'), edgeSvg);

  const edgeSize = Math.floor(2048 / edgeTotal) * edgeTotal;
  const edgeScale = edgeSize / edgeTotal;
  writePng(path.join(outDir, 'page-edge-p042.png'), edgeSize, edgeSize, (x, y) => {
    const col = Math.floor(x / edgeScale) - edgeQuiet;
    const row = Math.floor(y / edgeScale) - edgeQuiet;
    if (col < 0 || row < 0 || col >= pageEdgeModules || row >= pageEdgeModules) return paperRgb;
    return edgeQr.isDark(row, col) ? inkRgb : paperRgb;
  });
}

console.log(JSON.stringify({
  target,
  errorCorrection,
  modules,
  total,
  png: `${pngSize}x${pngSize}`,
  outputs: [
    'one-code-entry.svg',
    'one-code-entry.png',
    'one-code-entry-card.svg',
    ...(spineLink ? ['spine-mark.svg'] : []),
    ...(pageEdge ? ['page-edge-p042.svg', 'page-edge-p042.png'] : []),
  ],
  spineModules,
  pageEdgeModules,
}, null, 2));
