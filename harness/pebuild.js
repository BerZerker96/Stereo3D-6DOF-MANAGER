'use strict';
/*
 * A minimal but genuinely valid PE writer, used only by the test harness.
 *
 * API detection is now driven by the real import directory, so testing it honestly means producing
 * binaries whose import tables actually say what the test claims. Substring fixtures would test
 * nothing - they are exactly what the old detector read, and exactly why it was wrong.
 *
 * Emits a single-section PE32 or PE32+ image with a classic import directory and, optionally, a
 * delay-load import directory. Nothing here is executable; only the headers and the directories
 * the detector parses need to be correct.
 */
const fs = require('fs');
const path = require('path');

const ALIGN_FILE = 0x200, ALIGN_SECT = 0x1000;
const align = (v, a) => Math.ceil(v / a) * a;

/**
 * build({ x64, imports: { 'd3d11.dll': ['D3D11CreateDeviceAndSwapChain'] }, delay: {...} })
 * Returns a Buffer containing the image.
 */
function build(opts) {
  opts = opts || {};
  const x64 = !!opts.x64;
  const imports = opts.imports || {};
  const delay = opts.delay || {};
  const IMAGE_BASE = x64 ? 0x140000000 : 0x400000;
  const SECT_RVA = ALIGN_SECT;

  /* ---- lay out the section payload in RVA space ---- */
  const blobs = [];                        // {buf, rva}
  let cur = SECT_RVA;
  const put = (buf) => { const rva = cur; blobs.push({ buf, rva }); cur += buf.length; cur = align(cur, 8); return rva; };
  const cstr = (s) => { const b = Buffer.alloc(s.length + 1); b.write(s, 0, 'latin1'); return b; };

  const thunkSize = x64 ? 8 : 4;

  function buildDir(map, isDelay) {
    const entries = Object.keys(map);
    if (!entries.length) return { rva: 0, size: 0 };
    const parts = [];
    for (const dll of entries) {
      const nameRva = put(cstr(dll));
      // IMAGE_IMPORT_BY_NAME blocks: Hint(2) + name + NUL
      const fnRvas = (map[dll] || []).map(fn => {
        const b = Buffer.alloc(2 + fn.length + 1);
        b.writeUInt16LE(0, 0); b.write(fn, 2, 'latin1');
        return put(b);
      });
      // thunk array, NULL-terminated
      const th = Buffer.alloc(thunkSize * (fnRvas.length + 1));
      fnRvas.forEach((r, i) => {
        if (x64) th.writeBigUInt64LE(BigInt(r), i * thunkSize);
        else th.writeUInt32LE(r, i * thunkSize);
      });
      const thunkRva = put(th);
      parts.push({ dll, nameRva, thunkRva });
    }
    if (isDelay) {
      // IMAGE_DELAYLOAD_DESCRIPTOR: 8 x DWORD. Attributes bit0 = 1 -> fields are RVAs.
      const buf = Buffer.alloc(32 * (parts.length + 1));
      parts.forEach((p, i) => {
        const o = i * 32;
        buf.writeUInt32LE(1, o + 0);            // Attributes: RVA-based
        buf.writeUInt32LE(p.nameRva, o + 4);    // DllNameRVA
        buf.writeUInt32LE(0, o + 8);            // ModuleHandleRVA
        buf.writeUInt32LE(p.thunkRva, o + 12);  // ImportAddressTableRVA
        buf.writeUInt32LE(p.thunkRva, o + 16);  // ImportNameTableRVA
      });
      return { rva: put(buf), size: buf.length };
    }
    // IMAGE_IMPORT_DESCRIPTOR: 5 x DWORD, NULL-terminated
    const buf = Buffer.alloc(20 * (parts.length + 1));
    parts.forEach((p, i) => {
      const o = i * 20;
      buf.writeUInt32LE(p.thunkRva, o + 0);     // OriginalFirstThunk
      buf.writeUInt32LE(0, o + 4);
      buf.writeUInt32LE(0, o + 8);
      buf.writeUInt32LE(p.nameRva, o + 12);     // Name
      buf.writeUInt32LE(p.thunkRva, o + 16);    // FirstThunk
    });
    return { rva: put(buf), size: buf.length };
  }

  /* Literal strings embedded as DATA, importing nothing. This models the real-world case that broke
   * the old detector: a graphics DLL name appearing in an error message, an embedded resource, or a
   * statically linked library's reference table. A byte match is not a dependency. */
  for (const lit of (opts.strings || [])) put(cstr(lit));

  const impDir = buildDir(imports, false);
  const dlyDir = buildDir(delay, true);

  const sectVirtualSize = cur - SECT_RVA;
  const optSize = x64 ? 240 : 224;
  const headersSize = align(0x40 + 4 + 20 + optSize + 40, ALIGN_FILE);
  const sectRaw = align(sectVirtualSize, ALIGN_FILE);
  const image = Buffer.alloc(headersSize + sectRaw, 0);

  /* ---- DOS header ---- */
  image.write('MZ', 0, 'latin1');
  image.writeUInt32LE(0x80, 0x3c);

  /* ---- PE signature + COFF ---- */
  const pe = 0x80;
  image.write('PE\0\0', pe, 'latin1');
  image.writeUInt16LE(x64 ? 0x8664 : 0x14c, pe + 4);   // Machine
  image.writeUInt16LE(1, pe + 6);                      // NumberOfSections
  image.writeUInt16LE(optSize, pe + 20);               // SizeOfOptionalHeader
  image.writeUInt16LE(0x0102, pe + 22);                // Characteristics: EXECUTABLE_IMAGE

  /* ---- optional header ---- */
  const opt = pe + 24;
  image.writeUInt16LE(x64 ? 0x20b : 0x10b, opt);       // Magic
  if (x64) image.writeBigUInt64LE(BigInt(IMAGE_BASE), opt + 24);
  else image.writeUInt32LE(IMAGE_BASE, opt + 28);
  image.writeUInt32LE(ALIGN_SECT, opt + 32);           // SectionAlignment
  image.writeUInt32LE(ALIGN_FILE, opt + 36);           // FileAlignment
  image.writeUInt32LE(align(SECT_RVA + sectVirtualSize, ALIGN_SECT), opt + 56);  // SizeOfImage
  image.writeUInt32LE(headersSize, opt + 60);          // SizeOfHeaders
  const ddCountOff = x64 ? 108 : 92;
  const ddOff = x64 ? 112 : 96;
  image.writeUInt32LE(16, opt + ddCountOff);
  image.writeUInt32LE(impDir.rva, opt + ddOff + 1 * 8);       // dir 1  = import
  image.writeUInt32LE(impDir.size, opt + ddOff + 1 * 8 + 4);
  image.writeUInt32LE(dlyDir.rva, opt + ddOff + 13 * 8);      // dir 13 = delay import
  image.writeUInt32LE(dlyDir.size, opt + ddOff + 13 * 8 + 4);

  /* ---- section header ---- */
  const sec = opt + optSize;
  image.write('.rdata\0\0', sec, 8, 'latin1');
  image.writeUInt32LE(sectVirtualSize, sec + 8);
  image.writeUInt32LE(SECT_RVA, sec + 12);
  image.writeUInt32LE(sectRaw, sec + 16);
  image.writeUInt32LE(headersSize, sec + 20);
  image.writeUInt32LE(0x40000040, sec + 36);           // INITIALIZED_DATA | READ

  /* ---- section payload ---- */
  for (const b of blobs) image.set(b.buf, headersSize + (b.rva - SECT_RVA));
  return image;
}

/** Write a synthetic exe and return its path. */
function writeExe(dir, name, opts) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, build(opts));
  return p;
}

module.exports = { build, writeExe };
