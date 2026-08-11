# Render-API detection

How the app decides whether a game is DX9, DX11, DX12, Vulkan or OpenGL — and why the previous
approach got it wrong so often.

---

## The problem with the old detector

```js
const has = s => buf.includes(Buffer.from(s, 'ascii'));
if (has('d3d11.dll') || has('dxgi.dll')) apis.add('DX11');
```

It read the first 24 MB of the executable and looked for byte sequences. A byte sequence is not a
dependency. `"d3d11.dll"` appears in a binary for many reasons that have nothing to do with what it
renders with:

- error and log message strings (`"Failed to load d3d11.dll"`)
- embedded resources, manifests and configuration blobs
- statically linked third-party libraries that mention every API they *can* use
- crash-reporter symbol tables
- the game's own launcher/updater code paths

Two consequences dominated the wrong answers:

1. **`dxgi.dll` was treated as proof of DX11.** DXGI is the *shared* infrastructure layer. DX10, DX11
   and DX12 all import it, and plenty of Vulkan titles do too (for presentation and HDR queries). So
   essentially every modern game matched DX11. Because the UI shows `api[0]` and the recommender
   keys off it, DX12 and Vulkan titles were routinely offered a DX11-only pipeline.

2. **Delay-loaded renderers were invisible.** Engines commonly delay-load their graphics backend so a
   machine without the runtime can still start and show an error. The DLL name then lives in the
   *delay-load* directory, which the old scan never looked at as a structure — it only ever saw a
   string, at the same weight as an error message.

---

## What ReShade does, and the static equivalent

ReShade does not guess. It installs itself as a proxy for a graphics DLL and hooks the loader, then
watches which entry point the process actually calls — `D3D11CreateDeviceAndSwapChain`,
`D3D12CreateDevice`, `Direct3DCreate9`, `vkCreateInstance`, `wglCreateContext` — and configures its
runtime from whichever one fires. Its answer is authoritative because it is an observation, not an
inference.

We cannot run the game. The closest static equivalent to *"what does this binary actually call"* is
the PE **import directory**: the loader-honoured list of DLLs, and the named functions taken from
each. That is a structure, not a string, and it is what `src/peimports.js` now parses:

- **data directory 1** — the classic import table
- **data directory 13** — the delay-load import table

Both DLL names and imported **function** names are returned, because the function name is far
stronger evidence. Linking `dxgi.dll` says almost nothing; importing `D3D12CreateDevice` is
conclusive.

---

## Evidence model

Each API accumulates the score of the best evidence found for it.

| Score | Evidence | Why it is worth that |
|---:|---|---|
| **4** | An imported function unique to one API | Only a DX12 renderer imports `D3D12CreateDevice`. Nothing else has a reason to. |
| **3** | Direct import of the API's own DLL | The loader will resolve this at start-up. It is a real dependency. |
| **3** | Delay-load import of the API's own DLL | Equally real — the loader honours it on first call. Weighted the same on purpose. |
| **2** | The engine runtime beside the exe imports it | A Unity `Game.exe` imports `UnityPlayer.dll` and no graphics API at all; the renderer is in the DLL. Followed one hop. |
| **2** | D3D12 Agility SDK shipped with the game | A title only redistributes `D3D12Core.dll` because it drives DX12. |
| **1** | A real sibling DLL in the game folder | Suggestive, easily coincidental. |
| **1** | The executable's own name | `Control_DX12.exe`, `ffxiv_dx11.exe`. Deliberate, but only a name. |

Results are ordered by score, then by capability (`DX12 → Vulkan → DX11 → DX10 → DX9 → DX8 → DX7 →
OpenGL`). `api[0]` — what the UI shows and the recommender uses — is therefore the
strongest-evidence API, which is the entire point of the rewrite.

### The dxgi rule

`dxgi.dll` contributes **no score**. It is recorded only as a flag meaning *"a DX10/11/12-class
renderer is present here"*. If no other evidence is found at all, that flag resolves to DX11 with
score 1 — the correct reading of a binary that pulls in DXGI and creates its device dynamically. It
can never outrank real DX12 or Vulkan evidence, and it can never drag a DX9 game upward.

---

## Signals that are deliberately excluded

Files this app installed, and any known wrapper name, are ignored when reading the game folder:

```
d3d8/9/10/11/12.dll · dxgi.dll · ddraw.dll · d3dimm.dll · opengl32.dll
nvapi(64).dll · dinput8.dll · winmm.dll · version.dll · dsound.dll
geod3d9.dll · reshade(32/64).dll · d3dcompiler_*.dll
```

geo-11 places `d3d11.dll` next to the executable. Counting that would flip a DX9 game to DX11 on the
next rescan, which then mis-picks the pipeline, the dgVoodoo2 wrapper DLL and the D3D9 proxy. The
per-game manifest is consulted so anything the app placed is excluded by path, and the name list
catches hand-installed wrappers.

---

## Fallback behaviour

- A binary whose import table cannot be read — packed, protected, or corrupt — falls back to the old
  string scan, scored at **1**, so any real import evidence from anywhere else still outranks it.
- A file that is not a PE at all returns the safe default `['DX11']` rather than throwing.
- Nothing found at all returns `['DX11']`, unchanged from before.

---

## The database's role

The curated game database (3,335 titles) is consulted **after** detection, in `inspectGame()`, and a
database match **replaces** the detected API.

This is a deliberate choice, and the earlier documentation had it backwards — the handoff's
Appendix B claims "the database is a hint, never an override. What the binary actually imports wins."
It does not. The database wins, because:

- a remaster or a patch can change the renderer without changing what the binary imports;
- a title that ships both a DX11 and a DX12 path in one executable cannot be separated statically;
- the database entry is a curated, human-verified fact, while detection is an inference.

The user can override either from the game panel, and the override is remembered. Pressing
**↺ Auto-detect** re-runs PE detection and the database lookup together.

---

## Testing

`harness/apidetect.js` covers this, and `harness/pebuild.js` writes **genuinely valid PE32 and PE32+
images** with a chosen import and delay-import table. This matters: the detector reads the real
import directory, so fixtures built from strings would test precisely the thing that used to be
wrong.

Cases asserted include:

- `dxgi` + `d3d12` resolves to **DX12**, not DX11
- a **delay-loaded** `d3d12.dll` resolves to DX12
- `dxgi` alone resolves to DX11 (weak default)
- Vulkan outranks an incidental `dxgi` import
- a DX9 title with a `d3dcompiler` import stays **DX9**
- a Unity stub exe resolves through `UnityPlayer.dll`
- the Agility SDK beats a bare `dxgi` import
- installed wrapper DLLs listed in the manifest are ignored
- a non-PE file degrades to the default without throwing

```bash
node harness/apidetect.js
```
