'use strict';
/*
 * Extract an executable's embedded icon by reading its PE resource section.
 *
 * Electron's app.getFileIcon() asks the Windows shell, which returns nothing for a surprising number
 * of game binaries - a shipping build with no icon resource, an exe the shell refuses to thumbnail,
 * or an icon the shell only has at 32x32. Parsing the file ourselves is deterministic, works for
 * non-Steam games with no artwork anywhere on disk, and lets us pick the LARGEST icon present rather
 * than whatever size the shell felt like handing back.
 *
 * The layout, for reference:
 *   DOS header      e_lfanew at 0x3C points at the PE header
 *   PE header       "PE\0\0", COFF header, optional header
 *   data directory  entry 2 is the resource table (virtual address + size)
 *   sections        map virtual addresses to file offsets
 *   resources       a three-level tree: type -> name/id -> language -> data entry
 *                   type 14 (RT_GROUP_ICON) is a directory of icon sizes
 *                   type  3 (RT_ICON)       is each individual image
 *
 * An .ico file is a 6-byte header, one 16-byte entry per image, then the images. A GRPICONDIR is
 * nearly the same shape but stores a 2-byte resource ID where the .ico stores a 4-byte offset, so
 * rebuilding an .ico means swapping those and concatenating the images.
 */
const fs = require('fs');

const RT_ICON = 3;
const RT_GROUP_ICON = 14;

/** Read `len` bytes at `pos`, or null if the file is shorter than that. */
function readAt(fd, pos, len) {
  try {
    const b = Buffer.alloc(len);
    const n = fs.readSync(fd, b, 0, len, pos);
    return n === len ? b : null;
  } catch (_) { return null; }
}

/** Parse just enough of the PE header to locate the resource table and the section map. */
function peInfo(fd) {
  const dos = readAt(fd, 0, 0x40);
  if (!dos || dos.readUInt16LE(0) !== 0x5a4d) return null;          // "MZ"
  const peOff = dos.readUInt32LE(0x3c);
  const sig = readAt(fd, peOff, 24);
  if (!sig || sig.readUInt32LE(0) !== 0x00004550) return null;      // "PE\0\0"

  const numSections = sig.readUInt16LE(6);
  const optSize = sig.readUInt16LE(20);
  const optOff = peOff + 24;
  const opt = readAt(fd, optOff, Math.min(optSize, 256));
  if (!opt) return null;
  const magic = opt.readUInt16LE(0);
  // the data directory starts 96 bytes in for PE32, 112 for PE32+
  const ddOff = magic === 0x20b ? 112 : 96;
  if (opt.length < ddOff + 24) return null;
  const resVA = opt.readUInt32LE(ddOff + 16);                       // directory entry 2
  const resSize = opt.readUInt32LE(ddOff + 20);
  if (!resVA || !resSize) return null;

  const sections = [];
  const secOff = optOff + optSize;
  for (let i = 0; i < numSections; i++) {
    const sh = readAt(fd, secOff + i * 40, 40);
    if (!sh) break;
    sections.push({
      va: sh.readUInt32LE(12),
      vsize: sh.readUInt32LE(8),
      raw: sh.readUInt32LE(20),
      rawSize: sh.readUInt32LE(16)
    });
  }
  const toOffset = (va) => {
    for (const s of sections) {
      if (va >= s.va && va < s.va + Math.max(s.vsize, s.rawSize)) return s.raw + (va - s.va);
    }
    return null;
  };
  return { resVA, resSize, resOff: toOffset(resVA), toOffset };
}

/** Walk one level of the resource tree, returning [{ id, isDir, offset }]. */
function resEntries(fd, base, dirOff) {
  const hdr = readAt(fd, base + dirOff, 16);
  if (!hdr) return [];
  const named = hdr.readUInt16LE(12), ids = hdr.readUInt16LE(14);
  const out = [];
  for (let i = 0; i < named + ids; i++) {
    const e = readAt(fd, base + dirOff + 16 + i * 8, 8);
    if (!e) break;
    const nameOrId = e.readUInt32LE(0), offset = e.readUInt32LE(4);
    out.push({
      id: (nameOrId & 0x80000000) ? null : nameOrId,               // high bit set = string name
      isDir: !!(offset & 0x80000000),
      offset: offset & 0x7fffffff
    });
  }
  return out;
}

/** Follow a type down to its first leaf, returning { va, size } for each id under it. */
function leavesForType(fd, info, type) {
  const base = info.resOff;
  const out = new Map();
  for (const t of resEntries(fd, base, 0)) {
    if (t.id !== type || !t.isDir) continue;
    for (const n of resEntries(fd, base, t.offset)) {
      if (!n.isDir) continue;
      const langs = resEntries(fd, base, n.offset);
      const leaf = langs.find(l => !l.isDir);
      if (!leaf) continue;
      const de = readAt(fd, base + leaf.offset, 16);
      if (!de) continue;
      out.set(n.id, { va: de.readUInt32LE(0), size: de.readUInt32LE(4) });
    }
  }
  return out;
}

/**
 * Rebuild the best icon in `exePath` as a .ico buffer, or null.
 * Picks the group with the largest image, so the UI gets 256px art where it exists.
 */
function extractIcon(exePath) {
  let fd = null;
  try {
    fd = fs.openSync(exePath, 'r');
    const info = peInfo(fd);
    if (!info || !info.resOff) return null;

    const groups = leavesForType(fd, info, RT_GROUP_ICON);
    const icons = leavesForType(fd, info, RT_ICON);
    if (!groups.size || !icons.size) return null;

    let best = null;
    for (const [, g] of groups) {
      const off = info.toOffset(g.va);
      if (off == null) continue;
      const dir = readAt(fd, off, Math.min(g.size, 6 + 14 * 64));
      if (!dir || dir.length < 6) continue;
      const count = dir.readUInt16LE(4);
      const entries = [];
      let maxPx = 0;
      for (let i = 0; i < count; i++) {
        const p = 6 + i * 14;
        if (p + 14 > dir.length) break;
        const w = dir[p] || 256, h = dir[p + 1] || 256;
        entries.push({
          w: dir[p], h: dir[p + 1], colors: dir[p + 2], reserved: dir[p + 3],
          planes: dir.readUInt16LE(p + 4), bpp: dir.readUInt16LE(p + 6),
          bytes: dir.readUInt32LE(p + 8), resId: dir.readUInt16LE(p + 12)
        });
        maxPx = Math.max(maxPx, w * h);
      }
      if (entries.length && maxPx > (best ? best.maxPx : -1)) best = { entries, maxPx };
    }
    if (!best) return null;

    // assemble a real .ico: header, directory entries with file offsets, then the images
    const images = [];
    const usable = [];
    let cursor = 6 + best.entries.length * 16;
    for (const e of best.entries) {
      const src = icons.get(e.resId);
      if (!src) continue;
      const off = info.toOffset(src.va);
      if (off == null) continue;
      const img = readAt(fd, off, src.size);
      if (!img) continue;
      usable.push({ e, offset: cursor, size: img.length });
      images.push(img);
      cursor += img.length;
    }
    if (!usable.length) return null;

    // offsets shift if some entries were unusable, so recompute from the surviving set
    let pos = 6 + usable.length * 16;
    const head = Buffer.alloc(6 + usable.length * 16);
    head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(usable.length, 4);
    usable.forEach((u, i) => {
      const p = 6 + i * 16;
      head[p] = u.e.w; head[p + 1] = u.e.h; head[p + 2] = u.e.colors; head[p + 3] = 0;
      head.writeUInt16LE(u.e.planes, p + 4);
      head.writeUInt16LE(u.e.bpp, p + 6);
      head.writeUInt32LE(u.size, p + 8);
      head.writeUInt32LE(pos, p + 12);
      pos += u.size;
    });
    return Buffer.concat([head, ...images]);
  } catch (_) {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} }
  }
}

/** The largest single image in the exe as a PNG buffer, when one is stored as PNG (Vista+ icons). */
function extractLargestPng(exePath) {
  const ico = extractIcon(exePath);
  if (!ico || ico.length < 6) return null;
  const count = ico.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i++) {
    const p = 6 + i * 16;
    if (p + 16 > ico.length) break;
    const w = ico[p] || 256, h = ico[p + 1] || 256;
    const size = ico.readUInt32LE(p + 8), off = ico.readUInt32LE(p + 12);
    if (off + size > ico.length) continue;
    const body = ico.slice(off, off + size);
    const isPng = body.length > 8 && body[0] === 0x89 && body[1] === 0x50;   // \x89PNG
    if (isPng && (!best || w * h > best.px)) best = { px: w * h, body };
  }
  return best ? best.body : null;
}

module.exports = { extractIcon, extractLargestPng };
