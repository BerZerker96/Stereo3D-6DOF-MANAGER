'use strict';
/*
 * Real config read/write for the stereo-mod family.
 * Handles INI-style files: ReShade.ini, d3dx.ini, d3dxdm.ini, dgVoodoo.conf,
 * 3dvision4all.ini, HeadTracking.ini, ReShadePreset.ini, *.headtracking.cfg.
 *
 * Design goals from the audit:
 *  - round-trip WITHOUT dropping unknown keys, comments, or section order
 *  - atomic write + .bak backup
 *  - section-aware get/set so the editor only touches the keys it knows
 */
const fs = require('fs');
const path = require('path');

/** Parse an INI-ish file into an ordered model that remembers comments/blank lines. */
function parseIni(text) {
  const lines = text.split(/\r?\n/);
  const model = { sections: [], _eol: text.includes('\r\n') ? '\r\n' : '\n' };
  let cur = { name: null, items: [] }; // top-of-file (no section) bucket
  model.sections.push(cur);
  for (const line of lines) {
    const m = line.match(/^\s*\[(.+?)\]\s*$/);
    if (m) {
      cur = { name: m[1], items: [] };
      model.sections.push(cur);
      continue;
    }
    const kv = line.match(/^(\s*)([^;#=\[\]]+?)\s*=\s*(.*?)\s*$/);
    if (kv && !line.trimStart().startsWith(';') && !line.trimStart().startsWith('#')) {
      let value = kv[3], comment = '';
      const cm = value.match(/^(.*?)(\s+[;#].*)$/);   // inline comment: whitespace + ; or #
      if (cm) { value = cm[1].trim(); comment = cm[2]; }
      cur.items.push({ type: 'kv', key: kv[2].trim(), value, comment, raw: line });
    } else {
      cur.items.push({ type: 'raw', raw: line }); // comment or blank, preserved verbatim
    }
  }
  return model;
}

function serializeIni(model) {
  const out = [];
  for (const sec of model.sections) {
    if (sec.name !== null) out.push('[' + sec.name + ']');
    for (const it of sec.items) {
      if (it.type === 'kv') out.push(formatKv(it));
      else out.push(it.raw);
    }
  }
  // collapse a trailing duplicate newline
  let text = out.join(model._eol || '\n');
  if (!text.endsWith(model._eol)) text += model._eol;
  return text;
}

function formatKv(it) {
  // preserve original spacing/alignment + any inline comment when we can
  if (it.raw) {
    const m = it.raw.match(/^(\s*[^=]+?\s*=\s*)/);
    if (m) return m[1] + it.value + (it.comment || '');
  }
  return it.key + '=' + it.value + (it.comment || '');
}

function findSection(model, name) {
  return model.sections.find(s => (s.name || '').toLowerCase() === String(name).toLowerCase());
}

/** Apply a flat {section: {key: value}} patch onto the model, creating sections/keys as needed. */
function applyPatch(model, patch) {
  for (const [secName, kvs] of Object.entries(patch)) {
    let sec = secName === '' ? model.sections[0] : findSection(model, secName);
    if (!sec) { sec = { name: secName, items: [] }; model.sections.push(sec); }
    for (const [key, value] of Object.entries(kvs)) {
      const v = String(value);
      const existing = sec.items.find(i => i.type === 'kv' && i.key.toLowerCase() === key.toLowerCase());
      if (existing) existing.value = v;
      else sec.items.push({ type: 'kv', key, value: v, raw: key + ' = ' + v });
    }
  }
  return model;
}

/** Read a flat {section:{key:value}} view of a file (best-effort; empty if missing). */
function readConfig(file) {
  if (!fs.existsSync(file)) return { sections: {}, exists: false };
  const model = parseIni(fs.readFileSync(file, 'utf8'));
  const flat = {};
  for (const sec of model.sections) {
    const name = sec.name || '';
    flat[name] = flat[name] || {};
    for (const it of sec.items) if (it.type === 'kv') flat[name][it.key] = it.value;
  }
  return { sections: flat, exists: true };
}

/** Write a patch into a file, preserving everything else. Atomic + .bak. */
function writeConfig(file, patch) {
  let model;
  if (fs.existsSync(file)) {
    const orig = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file + '.bak', orig); // backup before touching
    model = parseIni(orig);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    model = { sections: [{ name: null, items: [] }], _eol: '\r\n' };
  }
  applyPatch(model, patch);
  const text = serializeIni(model);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file); // atomic replace on same volume
  return { ok: true, file };
}

module.exports = { parseIni, serializeIni, readConfig, writeConfig, applyPatch };
