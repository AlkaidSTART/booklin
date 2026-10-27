#!/usr/bin/env node
/**
 * Render the concept knowledge-graph data to a static SVG preview.
 * Run: node scripts/build-knowledge-graph.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataPath = path.join(root, 'public', 'data', 'knowledge-graph.json');
const outDir = path.join(root, 'public', 'design');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

fs.mkdirSync(outDir, { recursive: true });

const W = 1000;
const H = 720;
const PAD_X = 92;
const PAD_Y = 96;
const nodes = new Map(
  data.nodes.map((node) => [
    node.id,
    {
      ...node,
      px: PAD_X + node.x * (W - PAD_X * 2),
      py: PAD_Y + node.y * (H - PAD_Y * 2),
      radius: 8 + node.weight * 12,
    },
  ]),
);

const colors = {
  page: '#E8DCC4',
  concept: '#C8A96D',
  citation: '#D27C65',
  video: '#A78750',
  discussion: '#B9AF9E',
  glossary: '#968D80',
  author: '#F3EAD8',
  chapter: '#C8A96D',
  ai: '#9C3F2F',
};

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function curve(source, target, weight, index) {
  const dx = target.px - source.px;
  const dy = target.py - source.py;
  const length = Math.hypot(dx, dy) || 1;
  const bend = (index % 2 === 0 ? 1 : -1) * Math.min(34, length * 0.09);
  const mx = (source.px + target.px) / 2 - (dy / length) * bend;
  const my = (source.py + target.py) / 2 + (dx / length) * bend;
  const opacity = 0.18 + weight * 0.42;
  return {
    d: `M${source.px.toFixed(2)} ${source.py.toFixed(2)} Q${mx.toFixed(2)} ${my.toFixed(2)} ${target.px.toFixed(2)} ${target.py.toFixed(2)}`,
    opacity: opacity.toFixed(2),
    width: (0.8 + weight * 1.15).toFixed(2),
  };
}

const links = data.links
  .map((link, index) => {
    const source = nodes.get(link.source);
    const target = nodes.get(link.target);
    if (!source || !target) return '';
    const c = curve(source, target, link.weight, index);
    return `    <path d="${c.d}" fill="none" stroke="#C8A96D" stroke-opacity="${c.opacity}" stroke-width="${c.width}"/>`;
  })
  .filter(Boolean)
  .join('\n');

const nodeMarkup = data.nodes
  .map((node) => {
    const n = nodes.get(node.id);
    const color = colors[node.type] || '#C8A96D';
    const labelBelow = n.py < H * 0.58;
    const labelY = labelBelow ? n.py + n.radius + 19 : n.py - n.radius - 17;
    const zhY = labelBelow ? labelY + 13 : labelY - 13;
    const opacity = node.type === 'page' ? 1 : 0.9;
    const type = node.type.toUpperCase();
    return `  <g opacity="${opacity}">
    <circle cx="${n.px.toFixed(2)}" cy="${n.py.toFixed(2)}" r="${(n.radius + 7).toFixed(2)}" fill="none" stroke="${color}" stroke-opacity=".22"/>
    <circle cx="${n.px.toFixed(2)}" cy="${n.py.toFixed(2)}" r="${n.radius.toFixed(2)}" fill="${node.type === 'page' ? color : '#11100E'}" stroke="${color}" stroke-width="${node.type === 'page' ? 0 : 1.5}" fill-opacity="${node.type === 'page' ? 1 : 0.86}"/>
    <circle cx="${n.px.toFixed(2)}" cy="${n.py.toFixed(2)}" r="${(n.radius * 0.24).toFixed(2)}" fill="${node.type === 'page' ? '#11100E' : color}"/>
    <text x="${n.px.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="${node.type === 'page' ? 14 : 12}" fill="#F3EAD8">${esc(node.label)}</text>
    <text x="${n.px.toFixed(2)}" y="${zhY.toFixed(2)}" text-anchor="middle" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="10" fill="#B9AF9E">${esc(node.labelZh)}</text>
    <text x="${n.px.toFixed(2)}" y="${labelBelow ? (zhY + 12).toFixed(2) : (zhY - 12).toFixed(2)}" text-anchor="middle" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="7" letter-spacing="1.3" fill="${color}" fill-opacity=".8">${type}</text>
  </g>`;
  })
  .join('\n');

const legend = data.legend
  .map((item, index) => {
    const x = 64 + index * 112;
    const color = colors[item.type] || '#C8A96D';
    return `    <circle cx="${x}" cy="674" r="4" fill="${color}"/>
    <text x="${x + 12}" y="678" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="9" fill="#B9AF9E">${esc(item.label)}</text>`;
  })
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <title id="title">Bookln page 042 knowledge layer</title>
  <desc id="desc">A deterministic concept graph with nine nodes: the physical page, a concept, a citation, a lesson, margin discussion, glossary, author note, a related chapter and an AI companion.</desc>
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="72%">
      <stop offset="0" stop-color="#211B15"/>
      <stop offset=".58" stop-color="#16130F"/>
      <stop offset="1" stop-color="#11100E"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g stroke="#E8DCC4" stroke-opacity=".045">
    <path d="M0 180h1000M0 360h1000M0 540h1000M250 0v720M500 0v720M750 0v720"/>
  </g>
  <circle cx="500" cy="370" r="250" fill="none" stroke="#C8A96D" stroke-opacity=".12"/>
  <circle cx="500" cy="370" r="168" fill="none" stroke="#C8A96D" stroke-opacity=".08"/>
  <text x="64" y="58" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="9" letter-spacing="2.4" fill="#C8A96D">PAGE 042 / KNOWLEDGE LAYER</text>
  <text x="64" y="78" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="8" letter-spacing="1.5" fill="#968D80">CONCEPT PREVIEW · DETERMINISTIC DATA · NOT A LIVE AI OUTPUT</text>
  <g filter="url(#glow)">
${links}
  </g>
${nodeMarkup}
  <line x1="64" y1="650" x2="936" y2="650" stroke="#E8DCC4" stroke-opacity=".14"/>
${legend}
  <text x="936" y="678" text-anchor="end" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="9" letter-spacing="1.5" fill="#968D80">BOOKLN / ONE-CODE ENTRY</text>
</svg>
`;

fs.writeFileSync(path.join(outDir, 'knowledge-graph.svg'), svg);
console.log(JSON.stringify({
  output: 'public/design/knowledge-graph.svg',
  nodes: data.nodes.length,
  links: data.links.length,
  viewBox: `${W}x${H}`,
}, null, 2));
