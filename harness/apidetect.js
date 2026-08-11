'use strict';
/*
 * Render-API detection suite.
 *
 * Every fixture is a REAL PE image with a real import table (harness/pebuild.js), because that is
 * what the detector now reads. The cases are the ones that were actually getting the wrong answer.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeExe } = require('./pebuild');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'apidet-'));
const scanner = require('../src/scanner');
const peimports = require('../src/peimports');

let pass = 0, fail = 0;
const failures = [];
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass++; else { fail++; failures.push(`  ${name}\n      expected: ${want}\n      got:      ${got}`); }
}
function primary(dir, name, opts, extraFiles) {
  const d = path.join(ROOT, dir);
  const exe = writeExe(d, name, opts);
  for (const [rel, body] of Object.entries(extraFiles || {})) {
    const p = path.join(d, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body || 'x');
  }
  return scanner.detectApi(exe, null, d);
}

console.log('=== PE import parser ===');
{
  const exe = writeExe(path.join(ROOT, 'parse'), 'a.exe',
    { x64: true, imports: { 'kernel32.dll': ['CreateFileW'], 'd3d11.dll': ['D3D11CreateDeviceAndSwapChain'] } });
  const r = peimports.readImports(exe);
  check('parses PE32+', r.ok, true);
  check('reports x64', r.bit, 'x64');
  check('lists both DLLs', r.dlls.slice().sort().join(','), 'd3d11.dll,kernel32.dll');
  check('reads function names', r.fns.includes('D3D11CreateDeviceAndSwapChain'), true);

  const exe32 = writeExe(path.join(ROOT, 'parse32'), 'b.exe',
    { x64: false, imports: { 'd3d9.dll': ['Direct3DCreate9'] } });
  const r32 = peimports.readImports(exe32);
  check('parses PE32', r32.ok, true);
  check('reports x86', r32.bit, 'x86');
  check('reads PE32 function names', r32.fns.includes('Direct3DCreate9'), true);
}

console.log('=== the regressions that motivated the rewrite ===');
{
  // dxgi alone must NOT mean DX11. Every DX12 game imports dxgi; the old rule made them all DX11.
  check('dxgi + d3d12 -> DX12 leads',
    primary('dx12', 'game.exe', { x64: true, imports: {
      'dxgi.dll': ['CreateDXGIFactory2'], 'd3d12.dll': ['D3D12CreateDevice'] } })[0], 'DX12');

  // A DX12 renderer that is DELAY-loaded was previously invisible.
  check('delay-loaded d3d12 -> DX12 leads',
    primary('dx12delay', 'game.exe', { x64: true,
      imports: { 'kernel32.dll': ['LoadLibraryW'] },
      delay:   { 'd3d12.dll': ['D3D12CreateDevice'] } })[0], 'DX12');

  // dxgi with nothing else is a DX10/11/12-class renderer resolving dynamically -> DX11 default.
  check('dxgi alone -> DX11 (weak default)',
    primary('dxgionly', 'game.exe', { x64: true, imports: { 'dxgi.dll': ['CreateDXGIFactory1'] } })[0], 'DX11');

  // Vulkan must win over an incidental dxgi import.
  check('vulkan + dxgi -> Vulkan leads',
    primary('vk', 'game.exe', { x64: true, imports: {
      'vulkan-1.dll': ['vkCreateInstance'], 'dxgi.dll': ['CreateDXGIFactory1'] } })[0], 'Vulkan');

  // A genuine DX9 title must not be dragged to DX11 by a d3dcompiler / dxgi mention.
  check('d3d9 only -> DX9',
    primary('dx9', 'game.exe', { x64: false, imports: {
      'd3d9.dll': ['Direct3DCreate9'], 'd3dcompiler_43.dll': ['D3DCompile'] } })[0], 'DX9');

  check('ddraw -> DX7',
    primary('dx7', 'old.exe', { x64: false, imports: { 'ddraw.dll': ['DirectDrawCreate'] } })[0], 'DX7');
  check('d3d8 -> DX8',
    primary('dx8', 'old.exe', { x64: false, imports: { 'd3d8.dll': ['Direct3DCreate8'] } })[0], 'DX8');
  check('opengl32 -> OpenGL',
    primary('gl', 'game.exe', { x64: false, imports: { 'opengl32.dll': ['wglCreateContext'] } })[0], 'OpenGL');
}

console.log('=== stub executables (the Unity case) ===');
{
  // A Unity exe imports no graphics API at all; UnityPlayer.dll is what creates the device.
  const d = path.join(ROOT, 'unity');
  writeExe(d, 'UnityPlayer.dll', { x64: true, imports: { 'd3d11.dll': ['D3D11CreateDeviceAndSwapChain'] } });
  const exe = writeExe(d, 'Game.exe', { x64: true, imports: { 'UnityPlayer.dll': ['UnityMain'], 'kernel32.dll': ['ExitProcess'] } });
  fs.mkdirSync(path.join(d, 'Game_Data'), { recursive: true });
  check('follows UnityPlayer.dll for the real API', scanner.detectApi(exe, null, d)[0], 'DX11');
}

console.log('=== shipped-alongside evidence ===');
{
  // The D3D12 Agility SDK is only redistributed by titles that drive DX12.
  check('Agility SDK beats a bare dxgi import',
    primary('agility', 'game.exe', { x64: true, imports: { 'dxgi.dll': ['CreateDXGIFactory1'] } },
      { 'D3D12/D3D12Core.dll': 'x' })[0], 'DX12');
}

console.log('=== wrapper files must never be counted as the game\'s own API ===');
{
  // geo-11 drops d3d11.dll beside a DX9 game. Rescanning must not flip the game to DX11.
  const d = path.join(ROOT, 'wrapped');
  const exe = writeExe(d, 'game.exe', { x64: false, imports: { 'd3d9.dll': ['Direct3DCreate9'] } });
  fs.writeFileSync(path.join(d, 'd3d11.dll'), 'wrapper');
  fs.writeFileSync(path.join(d, 'dxgi.dll'), 'wrapper');
  fs.mkdirSync(path.join(d, '.stereoscope'), { recursive: true });
  fs.writeFileSync(path.join(d, '.stereoscope', 'manifest.json'),
    JSON.stringify({ mods: { geo11: { files: ['d3d11.dll', 'dxgi.dll'] } } }));
  check('installed wrapper DLLs are ignored', scanner.detectApi(exe, null, d)[0], 'DX9');
}

console.log('=== bitness, from the same parse ===');
{
  const e64 = writeExe(path.join(ROOT, 'b64'), 'g.exe', { x64: true, imports: { 'kernel32.dll': ['ExitProcess'] } });
  const e32 = writeExe(path.join(ROOT, 'b32'), 'g.exe', { x64: false, imports: { 'kernel32.dll': ['ExitProcess'] } });
  check('readBitness x64', scanner.readBitness(e64), 'x64');
  check('readBitness x86', scanner.readBitness(e32), 'x86');
}

console.log('=== unparseable input degrades, never throws ===');
{
  const d = path.join(ROOT, 'junk');
  fs.mkdirSync(d, { recursive: true });
  const p = path.join(d, 'packed.exe');
  fs.writeFileSync(p, Buffer.alloc(4096, 0x41));            // not a PE at all
  let out = null, threw = false;
  try { out = scanner.detectApi(p, null, d); } catch (_) { threw = true; }
  check('no throw on a non-PE', threw, false);
  check('falls back to the safe default', (out || [])[0], 'DX11');
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log(`\napidetect: ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
