#!/usr/bin/env node
/**
 * Validate the bilingual copy deck against its layout limits.
 * Run: node scripts/validate-copy.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const copyPath = path.join(root, 'docs', 'copy-fields.json');
const data = JSON.parse(fs.readFileSync(copyPath, 'utf8'));
const limits = data.limits || {};
const fields = data.fields || [];
const errors = [];
const warnings = [];
const seen = new Set();

const count = (value) => [...String(value)].length;

function checkLength(label, value, limitKey, language, mode) {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${label}: missing ${language} copy`);
    return;
  }
  const limit = limits[limitKey];
  if (!limit) {
    errors.push(`${label}: unknown limit key "${limitKey}"`);
    return;
  }
  const max = limit[mode];
  const length = count(value);
  if (typeof max !== 'number') {
    errors.push(`${label}: limit "${limitKey}" has no ${mode} value`);
    return;
  }
  if (length > max) {
    errors.push(`${label} (${language}, ${mode}): ${length} chars > ${mode} limit ${max}`);
  }
}

function checkField(field, label, valueKey, mobileKey, limitKey, language) {
  const desktopValue = field[valueKey];
  const mobileValue = field[mobileKey] ?? desktopValue;
  checkLength(`${label}.${valueKey}`, desktopValue, limitKey, language, 'desktop');
  checkLength(`${label}.${mobileKey}`, mobileValue, limitKey, language, 'mobile');
}

for (const field of fields) {
  if (!field.id) {
    errors.push('field without id');
    continue;
  }
  if (seen.has(field.id)) {
    errors.push(`${field.id}: duplicate id`);
  }
  seen.add(field.id);

  if (!field.chapter) errors.push(`${field.id}: missing chapter`);
  if (!field.role) errors.push(`${field.id}: missing role`);
  if (!field.limit) errors.push(`${field.id}: missing limit`);
  if (!field.en) errors.push(`${field.id}: missing en`);
  if (!field.zh) errors.push(`${field.id}: missing zh`);

  checkField(field, field.id, 'en', 'enMobile', field.limit, 'en');
  checkField(field, field.id, 'zh', 'zhMobile', field.limit, 'zh');

  if (field.fullEn || field.fullZh) {
    if (!field.fullLimit) {
      errors.push(`${field.id}: full copy present without fullLimit`);
    } else {
      if (field.fullEn) checkField(field, field.id, 'fullEn', 'fullEnMobile', field.fullLimit, 'en');
      if (field.fullZh) checkField(field, field.id, 'fullZh', 'fullZhMobile', field.fullLimit, 'zh');
    }
  }

  for (const [key, value] of Object.entries(field)) {
    if (typeof value !== 'string') continue;
    if (/\b(TODO|TBD|FIXME|Lorem ipsum)\b/i.test(value)) {
      warnings.push(`${field.id}.${key}: placeholder marker in copy`);
    }
  }
}

const chapters = [...new Set(fields.map((field) => field.chapter))];
const roles = [...new Set(fields.map((field) => field.role))];

console.log(JSON.stringify({
  version: data.version,
  fields: fields.length,
  chapters,
  roles,
  limitKeys: Object.keys(limits),
  errors,
  warnings,
}, null, 2));

if (errors.length > 0) {
  process.exitCode = 1;
}
