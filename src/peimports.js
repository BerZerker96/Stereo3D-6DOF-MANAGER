'use strict';
/*
 * Real PE import-table reader.
 *
 * WHY THIS EXISTS
 * ---------------
 * API detection used to be a substring scan: read 24 MB off the front of the executable and ask
 * `buf.includes('d3d11.dll')`. That matches anything, anywhere — a error-message string, a path in
 * a resource, another library's name embedded in a static blob, a copyright notice. It is why so
 * many games were reported with the wrong renderer.
 *
 * ReShade does not guess. It hooks the loader and sees which graphics entry point the process
 * ACTUALLY calls — D3D11CreateDeviceAndSwapChain, D3D12CreateDevice, vkCreateInstance,
 * wglCreateContext — and configures itself from that. We cannot run the game, but the static
 * equivalent of "what does this binary actually call" is the PE **import directory**: the real,
 * loader-honoured list of DLLs and the named functions taken from each. That is what this module
 * reads.
 *
 * It parses:
 *   - the classic import directory (data directory 1)
 *   - the DELAY-load import directory (data directory 13), which modern engines use heavily —
 *     a DX12 renderer is very often delay-loaded, and ignoring it is how DX12 titles came back
 *     looking like DX11.
 *
 * Both DLL names and imported FUNCTION names are returned, because the function name is the
 * stronger signal: linking dxgi.dll says almost nothing (DX10, DX11, DX12 and even some Vulkan
 * layers all pull it in), while importing D3D12CreateDevice is conclusive.
 */
const fs = require('fs');

/* ---------- low-level helpers ---------- */
function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  try {
    const n = fs.readSync(fd, b, 0, len, pos);
    if (n < len) return b.slice(0, Math.max(0, n));
  } catch (_) { return Buffer.alloc(0); }
  return b;
}

/** Parse the PE headers we need: section table, data directories, bitness, image base. */
function peInfo(fd) {
  const dos = readAt(fd, 0, 0x40);
  if (dos.length < 0x40 || dos.readUInt16LE(0) !== 0x5a4d) return null;      // 'MZ'
  const peOff = dos.readUInt32LE(0x3c);
  if (!peOff || peOff > 0x10000000) return null;
  const sig = readAt(fd, peOff, 4);
  if (sig.length < 4 || sig.readUInt32LE(0) !== 0x00004550) return null;     // 'PE\0\0'

  const coff = readAt(fd, peOff + 4, 20);
  if (coff.length < 20) return null;
  const machine = coff.readUInt16LE(0);
  const nSections = coff.readUInt16LE(2);
  const optSize = coff.readUInt16LE(16);
  const optOff = peOff + 24;

  const optHead = readAt(fd, optOff, Math.min(optSize || 240, 240));
  if (optHead.length < 2) return null;
  const magic = optHead.readUInt16LE(0);
  const pe32Plus = magic === 0x20b;
  if (magic !== 0x10b && magic !== 0x20b) return null;

  // ImageBase: PE32 -> offset 28 (4 bytes); PE32+ -> offset 24 (8 bytes)
  let imageBase = 0;
  try {
    imageBase = pe32Plus
      ? Number(optHead.readBigUInt64LE(24))
      : optHead.readUInt32LE(28);
  } catch (_) { imageBase = 0; }

  // NumberOfRvaAndSizes then the data-directory array
  const ddCountOff = pe32Plus ? 108 : 92;
  const ddOff = pe32Plus ? 112 : 96;
  let ddCount = 0;
  try { ddCount = optHead.readUInt32LE(ddCountOff); } catch (_) { ddCount = 0; }
  if (!ddCount || ddCount > 16) ddCount = 16;

  const dd = [];
  const ddBuf = readAt(fd, optOff + ddOff, ddCount * 8);
  for (let i = 0; i < ddCount && (i * 8 + 8) <= ddBuf.length; i++) {
    dd.push({ rva: ddBuf.readUInt32LE(i * 8), size: ddBuf.readUInt32LE(i * 8 + 4) });
  }

  // section table follows the optional header
  const secOff = optOff + optSize;
  const sections = [];
  const secBuf = readAt(fd, secOff, Math.min(nSections, 96) * 40);
  for (let i = 0; i + 40 <= secBuf.length; i += 40) {
    sections.push({
      va: secBuf.readUInt32LE(i + 12),
      vsize: secBuf.readUInt32LE(i + 8),
      rawSize: secBuf.readUInt32LE(i + 16),
      rawPtr: secBuf.readUInt32LE(i + 20)
    });
  }
  if (!sections.length) return null;

  return { machine, pe32Plus, imageBase, dd, sections, bit: machine === 0x8664 ? 'x64' : machine === 0xaa64 ? 'arm64' : 'x86' };
}

/** Map a virtual address to a file offset through the section table. */
function rvaToOffset(info, rva) {
  if (!rva) return 0;
  for (const s of info.sections) {
    const span = Math.max(s.vsize || 0, s.rawSize || 0);
    if (rva >= s.va && rva < s.va + span) {
      const off = rva - s.va + s.rawPtr;
      // guard against a section whose raw data is shorter than its virtual size (bss-like)
      if (off < s.rawPtr || off > s.rawPtr + Math.max(s.rawSize, span)) return 0;
      return off;
    }
  }
  return 0;
}

/** Read a NUL-terminated ASCII string at a file offset. */
function cstrAt(fd, off, max) {
  if (!off) return '';
  const b = readAt(fd, off, max || 128);
  const z = b.indexOf(0);
  return (z >= 0 ? b.slice(0, z) : b).toString('latin1');
}

/**
 * Walk one thunk array and collect imported function NAMES.
 * Ordinal-only imports carry no name and are skipped — they tell us nothing about which API is used.
 */
function namesFromThunks(fd, info, thunkRva, cap) {
  const out = [];
  if (!thunkRva) return out;
  const step = info.pe32Plus ? 8 : 4;
  const ordinalFlag = info.pe32Plus ? 0x8000000000000000n : 0x80000000;
  let off = rvaToOffset(info, thunkRva);
  if (!off) return out;
  const buf = readAt(fd, off, step * (cap || 2048));
  for (let i = 0; i + step <= buf.length; i += step) {
    let v;
    if (info.pe32Plus) { v = buf.readBigUInt64LE(i); if (v === 0n) break; if (v & ordinalFlag) continue; }
    else { v = buf.readUInt32LE(i); if (v === 0) break; if (v & ordinalFlag) continue; }
    const nameRva = Number(v) + 2;                 // skip the 2-byte Hint
    const nOff = rvaToOffset(info, nameRva);
    if (!nOff) continue;
    const nm = cstrAt(fd, nOff, 96);
    if (nm) out.push(nm);
  }
  return out;
}

/** Classic import directory (data directory 1). */
function classicImports(fd, info) {
  const out = [];
  const d = info.dd[1];
  if (!d || !d.rva) return out;
  let off = rvaToOffset(info, d.rva);
  if (!off) return out;
  const buf = readAt(fd, off, Math.min(d.size || 20 * 512, 20 * 512) || 20 * 512);
  for (let i = 0; i + 20 <= buf.length; i += 20) {
    const oft = buf.readUInt32LE(0 + i);
    const nameRva = buf.readUInt32LE(12 + i);
    const ft = buf.readUInt32LE(16 + i);
    if (!oft && !nameRva && !ft) break;                    // null terminator
    if (!nameRva) continue;
    const dll = cstrAt(fd, rvaToOffset(info, nameRva), 128);
    if (!dll) continue;
    out.push({ dll: dll.toLowerCase(), delay: false, fns: namesFromThunks(fd, info, oft || ft) });
  }
  return out;
}

/**
 * Delay-load import directory (data directory 13).
 * Modern engines delay-load their renderer, so skipping this is how a DX12 title reads as DX11.
 * Old linkers wrote absolute VAs here instead of RVAs; the Attributes low bit tells us which,
 * and we additionally fall back to subtracting ImageBase when a value is obviously a VA.
 */
function delayImports(fd, info) {
  const out = [];
  const d = info.dd[13];
  if (!d || !d.rva) return out;
  const off = rvaToOffset(info, d.rva);
  if (!off) return out;
  const buf = readAt(fd, off, Math.min(d.size || 32 * 256, 32 * 256) || 32 * 256);
  for (let i = 0; i + 32 <= buf.length; i += 32) {
    const attrs = buf.readUInt32LE(0 + i);
    let nameField = buf.readUInt32LE(4 + i);
    let intField = buf.readUInt32LE(16 + i);        // ImportNameTableRVA
    if (!nameField && !intField) break;
    const usesVa = (attrs & 1) === 0;               // bit0 set => RVAs; clear => absolute VAs
    const norm = (v) => {
      if (!v) return 0;
      if (usesVa && info.imageBase && v > info.imageBase) return v - info.imageBase;
      return v;
    };
    nameField = norm(nameField); intField = norm(intField);
    const dll = cstrAt(fd, rvaToOffset(info, nameField), 128);
    if (!dll) continue;
    out.push({ dll: dll.toLowerCase(), delay: true, fns: namesFromThunks(fd, info, intField) });
  }
  return out;
}

/**
 * Every DLL this binary really imports, with the named functions taken from each.
 * Returns { ok, bit, dlls:[names], imports:[{dll,delay,fns}], fns:Set-like array }.
 * `ok:false` means the file could not be parsed as a PE at all — callers should fall back.
 */
function readImports(exePath) {
  let fd = null;
  try {
    fd = fs.openSync(exePath, 'r');
    const info = peInfo(fd);
    if (!info) return { ok: false, dlls: [], imports: [], fns: [] };
    const imports = classicImports(fd, info).concat(delayImports(fd, info));
    const dlls = [...new Set(imports.map(i => i.dll))];
    const fns = [...new Set(imports.reduce((a, i) => a.concat(i.fns), []))];
    return { ok: true, bit: info.bit, machine: info.machine, dlls, imports, fns };
  } catch (_) {
    return { ok: false, dlls: [], imports: [], fns: [] };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} }
  }
}

module.exports = { readImports, peInfo, rvaToOffset };
