'use strict';
/*
 * API detection accuracy: OLD algorithm vs NEW, head to head.
 *
 * The old detector is reimplemented here verbatim from the pre-fix source so the comparison is
 * honest rather than asserted. Both run against the same fixtures.
 *
 * The fixtures model what real binaries actually look like. The crucial property is that a graphics
 * DLL name can appear in a file as DATA - an error message, an embedded resource, a statically
 * linked library's reference table, a D3D11On12 interop path - without the binary depending on it.
 * The old detector could not tell the difference between a byte match and a dependency. That is the
 * whole source of the wrong answers.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'apicmp-'));
const { writeExe } = require('./pebuild');
const scanner = require('../src/scanner');

/* ---------- the OLD detector, verbatim from the pre-fix scanner.js ---------- */
function readChunk(file, max) {
  try {
    const fd = fs.openSync(file, 'r');
    const size = Math.min(fs.fstatSync(fd).size, max);
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    fs.closeSync(fd);
    return buf;
  } catch (_) { return Buffer.alloc(0); }
}
function detectApiOLD(exe, buf, dir) {
  const apis = new Set();
  try {
    if (!buf) buf = readChunk(exe, 24 * 1024 * 1024);
    const has = s => buf.includes(Buffer.from(s, 'ascii'));
    if (has('d3d12.dll') || has('D3D12.dll') || has('D3D12Core.dll')) apis.add('DX12');
    if (has('vulkan-1.dll') || has('VULKAN-1.dll')) apis.add('Vulkan');
    if (has('d3d11.dll') || has('D3D11.dll') || has('dxgi.dll') || has('D3D11_')) apis.add('DX11');
    if (has('d3d10.dll') || has('D3D10.dll')) apis.add('DX10');
    if (has('d3d9.dll') || has('D3D9.dll')) apis.add('DX9');
    if (has('d3d8.dll') || has('D3D8.dll')) apis.add('DX8');
    if (has('ddraw.dll') || has('DDRAW.dll') || has('DDraw.dll')) apis.add('DX7');
    if (has('d3dim.dll') || has('D3DIM.dll') || has('d3dimm.dll') || has('D3DImm.dll')) apis.add('DX7');
    if (has('opengl32.dll') || has('OPENGL32.dll')) apis.add('OpenGL');
  } catch (_) {}
  try {
    const gdir = dir || path.dirname(exe);
    const names = fs.readdirSync(gdir).map(f => f.toLowerCase());
    if (names.includes('vulkan-1.dll')) apis.add('Vulkan');
    if (names.some(f => /^d3d12/.test(f))) apis.add('DX12');
    if (names.some(f => /^d3d11/.test(f))) apis.add('DX11');
  } catch (_) {}
  const base = String(path.basename(exe)).toLowerCase();
  if (/dx12|d3d12/.test(base)) apis.add('DX12');
  if (/dx11|d3d11/.test(base)) apis.add('DX11');
  if (/dx10/.test(base)) apis.add('DX10');
  if (/dx9|d3d9/.test(base)) apis.add('DX9');
  if (/(^|[^a-z])vk([^a-z]|$)|vulkan/.test(base)) apis.add('Vulkan');
  const order = ['DX12', 'Vulkan', 'DX11', 'DX10', 'DX9', 'DX8', 'DX7', 'OpenGL'];
  const out = order.filter(a => apis.has(a));
  return out.length ? out : ['DX11'];
}

/* ---------- fixtures: what real binaries look like ---------- */
let n = 0;
function fixture(spec) {
  const d = path.join(ROOT, 'f' + (++n));
  const exe = writeExe(d, spec.exe || 'game.exe', {
    x64: spec.x64 !== false, imports: spec.imports || {}, delay: spec.delay || {}, strings: spec.strings || []
  });
  for (const [rel, body] of Object.entries(spec.files || {})) {
    const p = path.join(d, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body === true ? 'x' : body);
  }
  for (const [name, sub] of Object.entries(spec.dlls || {})) {
    writeExe(d, name, { x64: true, imports: sub.imports || {}, delay: sub.delay || {} });
  }
  return { dir: d, exe: path.join(d, spec.exe || 'game.exe') };
}

const CASES = [
  { label: 'UE4 DX11 title',
    truth: 'DX11',
    spec: { imports: { 'd3d11.dll': ['D3D11CreateDeviceAndSwapChain'], 'dxgi.dll': ['CreateDXGIFactory1'] } } },

  { label: 'UE5 DX12 title, renderer delay-loaded',
    truth: 'DX12',
    spec: { imports: { 'dxgi.dll': ['CreateDXGIFactory2'], 'kernel32.dll': ['LoadLibraryW'] },
            delay: { 'd3d12.dll': ['D3D12CreateDevice'] } } },

  { label: 'DX12 title using D3D11On12 interop (imports BOTH)',
    truth: 'DX12',
    spec: { imports: { 'd3d12.dll': ['D3D12CreateDevice'], 'd3d11.dll': ['D3D11On12CreateDevice'],
                       'dxgi.dll': ['CreateDXGIFactory2'] } } },

  { label: 'DX9 title whose binary mentions d3d11 in an error string',
    truth: 'DX9',
    spec: { x64: false, imports: { 'd3d9.dll': ['Direct3DCreate9'] },
            strings: ['Failed to load d3d11.dll', 'dxgi.dll not found'] } },

  { label: 'OpenGL title with a dxgi reference in a bundled library table',
    truth: 'OpenGL',
    spec: { x64: false, imports: { 'opengl32.dll': ['wglCreateContext'] },
            strings: ['dxgi.dll', 'd3d11.dll'] } },

  { label: 'Vulkan title that also mentions d3d11 (shared middleware)',
    truth: 'Vulkan',
    spec: { imports: { 'vulkan-1.dll': ['vkCreateInstance'] }, strings: ['d3d11.dll', 'dxgi.dll'] } },

  { label: 'Unity stub exe; renderer lives in UnityPlayer.dll (DX11)',
    truth: 'DX11',
    spec: { imports: { 'UnityPlayer.dll': ['UnityMain'], 'kernel32.dll': ['ExitProcess'] },
            dlls: { 'UnityPlayer.dll': { imports: { 'd3d11.dll': ['D3D11CreateDeviceAndSwapChain'] } } },
            files: { 'Game_Data/app.info': true } } },

  { label: 'Unity stub exe; UnityPlayer.dll is DX12',
    truth: 'DX12',
    spec: { imports: { 'UnityPlayer.dll': ['UnityMain'], 'kernel32.dll': ['ExitProcess'] },
            dlls: { 'UnityPlayer.dll': { imports: { 'd3d12.dll': ['D3D12CreateDevice'], 'dxgi.dll': ['CreateDXGIFactory2'] } } },
            files: { 'Game_Data/app.info': true } } },

  { label: 'DX12 title shipping the Agility SDK, device created dynamically',
    truth: 'DX12',
    spec: { imports: { 'dxgi.dll': ['CreateDXGIFactory2'], 'kernel32.dll': ['LoadLibraryW'] },
            files: { 'D3D12/D3D12Core.dll': true } } },

  { label: 'Legacy DirectDraw title mentioning d3d9 in a compat note',
    truth: 'DX7',
    spec: { x64: false, imports: { 'ddraw.dll': ['DirectDrawCreate'] }, strings: ['d3d9.dll'] } },

  { label: 'DX8 title',
    truth: 'DX8',
    spec: { x64: false, imports: { 'd3d8.dll': ['Direct3DCreate8'] } } },

  { label: 'DX9 title with geo-11 already installed beside it (wrapper DLLs present)',
    truth: 'DX9',
    spec: { x64: false, imports: { 'd3d9.dll': ['Direct3DCreate9'] },
            files: { 'd3d11.dll': 'wrapper', 'dxgi.dll': 'wrapper', 'nvapi64.dll': 'wrapper',
                     '.stereoscope/manifest.json': JSON.stringify({ mods: { geo11: { files: ['d3d11.dll', 'dxgi.dll', 'nvapi64.dll'] } } }) } } },

  { label: 'DX11 title with a d3d12 mention in a feature-check string',
    truth: 'DX11',
    spec: { imports: { 'd3d11.dll': ['D3D11CreateDevice'], 'dxgi.dll': ['CreateDXGIFactory1'] },
            strings: ['d3d12.dll unavailable, falling back'] } },

  { label: 'DX10 title',
    truth: 'DX10',
    spec: { x64: false, imports: { 'd3d10.dll': ['D3D10CreateDeviceAndSwapChain'] } } }
];

console.log('\n' + 'CASE'.padEnd(62) + 'TRUTH'.padEnd(8) + 'OLD'.padEnd(10) + 'NEW');
console.log('-'.repeat(96));
let oldRight = 0, newRight = 0;
const regressions = [], fixes = [];
for (const c of CASES) {
  const f = fixture(c.spec);
  const o = detectApiOLD(f.exe, null, f.dir)[0];
  const nw = scanner.detectApi(f.exe, null, f.dir)[0];
  const oOk = o === c.truth, nOk = nw === c.truth;
  if (oOk) oldRight++;
  if (nOk) newRight++;
  if (!oOk && nOk) fixes.push(c.label);
  if (oOk && !nOk) regressions.push(c.label);
  console.log(c.label.slice(0, 60).padEnd(62) +
    c.truth.padEnd(8) +
    ((oOk ? '  ' : '! ') + o).padEnd(10) +
    ((nOk ? '  ' : '! ') + nw));
}
console.log('-'.repeat(96));
console.log(`OLD: ${oldRight}/${CASES.length} correct   (${Math.round(oldRight / CASES.length * 100)}%)`);
console.log(`NEW: ${newRight}/${CASES.length} correct   (${Math.round(newRight / CASES.length * 100)}%)`);
if (fixes.length) { console.log('\nFixed by the rewrite:'); fixes.forEach(f => console.log('  + ' + f)); }
if (regressions.length) { console.log('\nREGRESSED:'); regressions.forEach(f => console.log('  - ' + f)); }

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
process.exit(regressions.length || newRight < oldRight ? 1 : 0);
