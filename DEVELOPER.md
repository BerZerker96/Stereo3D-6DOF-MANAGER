# Stereo 3D / 6DoF Manager — developer notes

Build `08f0109f`. Electron 31, Windows x64.

> **This file was substantially rewritten on 2026-08-10.** The previous version had drifted badly
> from the code — it claimed wiz3D and 3DVision4All had been removed (both are live), that loaders
> are never auto-installed (they are), that ReShade is installed by launching its setup `.exe` (it is
> a placed core), and that settings live next to the executable (they moved to the per-user data
> folder). Everything below is checked against the current source.

---

## Architecture

A standard two-process Electron app. All privileged work — filesystem, HTTPS, archive extraction, PE
parsing, process launch — happens in the main process. The renderer is a single HTML document with
no Node integration, reaching main only through an explicitly enumerated preload bridge.

| Process | Owns | Never does |
|---|---|---|
| Main | Filesystem, HTTPS, extraction, PE parsing, launch, logging, settings | Renders UI |
| Preload | A fixed list of **101** channel bindings; context isolation on | Exposes `require`, `fs` or arbitrary IPC |
| Renderer | All presentation and interaction | Touches the filesystem or network directly |

The bridge is exact: **101 handlers registered, 101 invocations exposed**. The smoke suite asserts
that symmetry, so a handler added without a binding fails the build rather than becoming a silent
no-op at runtime.

### Source layout

```
main.js                 Window lifecycle, 101 IPC handlers, icon resolution, process launch
preload.js              The context bridge — the complete list of what the UI may ask for
renderer/index.html     The entire interface: markup, styling and logic in one document
src/installer.js        Download, extraction, placement, configuration, conflicts, uninstall
src/scanner.js          Drives, Steam libraries, executable ranking, API + bitness detection
src/peimports.js        PE import-directory parser (classic + delay-load) — drives API detection
src/peicon.js           PE resource parsing, to read an icon out of an executable
src/mods.js             The catalogue: 17 mods, their sources, placement rules and API support
src/gamedb.js + ext     3,335 known titles with engine, API and bitness hints
src/ghfree.js           GitHub access that does not depend on the rate-limited API
src/config.js           INI, XML and ReShade-preset reading and writing
src/store.js            Settings, profiles and library persistence
src/logger.js           Two rotating logs beside the executable
harness/                Offline test suites (see below)
```

### The renderer is two layers

`renderer/index.html` contains the original in-memory **mockup** (hardcoded games, catalogues and
version tables) followed by an **integration layer** gated on:

```js
if (!(window.stereo && window.stereo.isReal)) return;
```

Inside the desktop app that gate opens and ~100 globals are replaced with real backend calls. Opened
as a plain `.html` in a browser the mockup runs instead, so the same file serves both. When editing
the renderer, check which layer you are in — a function defined in the mockup may be overridden later.

---

## Runtime locations

| Path | Contents | Survives update |
|---|---|---|
| `%APPDATA%\Stereo3D Manager\` | `settings.json`, `library.json`, `profiles.json` | Yes |
| `…\core\` | Cached mod payloads, one folder per source and version | Yes |
| `…\cache\github\` | Cached release metadata, ten-minute TTL | Yes |
| `<app>\logs\` | `app.log`, `download.log`, `update.log` | Yes — excluded from the update copy |
| `<app>\manual-core\` | Manually supplied mod packages | Yes — excluded from the update copy |
| `<game>\.stereoscope\manifest.json` | What this app installed into that game | Lives with the game |

**Settings are not portable.** They used to be written next to the executable — precisely the folder
an update replaces — so updating destroyed the user's library. They now live in the per-user data
folder alongside the mod cache. An older install is migrated once, automatically, and the original is
kept with a `.migrated` suffix.

---

## Render-API detection

Detection reads the executable's real **PE import directory** — classic *and* delay-load — rather
than scanning the file for byte sequences. This models what ReShade does at runtime: hook the loader
and see which graphics entry point is actually called.

Evidence is scored. An imported function unique to one API (4) beats a direct DLL import (3), which
ties with a delay-load import (3), which beats an engine-runtime import or the Agility SDK (2), which
beats a sibling file or an exe-name hint (1). `dxgi.dll` scores **nothing** — DX10, DX11 and DX12 all
import it — and only resolves to DX11 when no stronger evidence exists anywhere.

Full rationale, the evidence table and the exclusion rules: **[`docs/API-Detection.md`](docs/API-Detection.md)**.

**The game database overrides detection.** In `inspectGame()` a database match replaces the detected
API. This is deliberate: a remaster can change renderer without changing imports, and a single
executable can ship both a DX11 and a DX12 path. The user can override either, and the override is
remembered; **↺ Auto-detect** re-runs PE detection and the database lookup together.

---

## Install and uninstall

### Install

```
resolve the source     catalogue entry, manual-core, or the exact build the user picked
  -> ensure the core   manual-core, then disk cache, then download
  -> verify            magic bytes: PK, 7z, Rar!
  -> extract           wrapper folders unwrapped
  -> check the slot    refuse or rehome on proxy contention
  -> preflight         writable? at least 64 MB free?
  -> place             per-mod rules, relative to the executable
  -> verify each write size check, to detect antivirus quarantine
  -> claim files       exactly one mod owns each path
  -> seed config       defaults, without overwriting user values
  -> record            the manifest: the exact file list
```

Hosts declared in `needs` (ReShade) are installed first and are **not** removed with their guest.
Add-ons declared in `requires` are recorded with `lockedBy` and **are** removed with their host.

### Uninstall

The manifest is the only authority. `installer.uninstall(modId, game)` returns one of three outcomes:

| Outcome | Meaning |
|---|---|
| `{ ok: true, adopted: false, files: n }` | Recorded files deleted, record removed |
| `{ ok: true, adopted: true }` | Registered but hand-installed — record removed, **nothing deleted** |
| `{ ok: false, untracked: true, note }` | Nothing recorded for this id; says so instead of faking success |

`installer.uninstallAll(game)` removes everything recorded for a game in dependency order (guests
before hosts; loaders and converters last), independently per mod, returning `{ removed, files, failed }`.

`installer.installedMods(game)` returns what the manifest records, so the UI can show the truth
rather than its own in-memory guess.

> **Do not** iterate the renderer's `g.inst` and call `uninstall` per id. That list holds UI *card*
> ids (`supervr`, `geovr`) while the manifest is keyed by *registry* ids (`supervrexport`,
> `geovrexport`). That mismatch is what made "Remove all mods" delete nothing while reporting
> success. Use `uninstallAll`, or map through `bidOf()`.

> After any removal, refresh with `refreshDetected(i, { adopt: false })`. The default path
> auto-adopts anything found on disk, which would immediately re-adopt a leftover signature and make
> a successful removal look like it had failed.

---

## Testing

```bash
bash harness/validate.sh       # all suites — 715 assertions
node harness/smoke.js          # structure, IPC symmetry, registry, links, undefined globals
node harness/apidetect.js      # API detection against real synthetic PE images
node harness/uninstall.js      # install/uninstall lifecycle and per-game tracking
node harness/matrix.js         # every mod x every engine layout, and every output format
node harness/conflicts.js      # proxy slots, install order, ownership, uninstall permutations
node harness/configs.js        # config round-trips, unknown keys, seeding without overwriting
node harness/wiring.js         # renderer -> preload -> main wiring for both uninstall paths
node harness/uninstall-e2e.js  # uninstall through the renderer's OWN payload contract
node harness/apicompare.js     # old vs new API detector, head to head (57% -> 100%)
```

| Suite | Checks |
|---|---:|
| smoke | 94 |
| apidetect | 22 |
| uninstall | 41 |
| matrix | 346 |
| conflicts | 110 |
| configs | 33 |
| wiring | 27 |
| uninstall-e2e | 42 |

No suite touches the network or a real game folder. `harness/uninstall.js` drives the real installer
against a sandboxed folder using the `manual-core` mechanism, which is also what makes the download
path testable offline.

`harness/pebuild.js` writes genuinely valid PE32 / PE32+ images with a chosen import table. Because
detection now reads the real import directory, fixtures built from strings would test exactly the
thing that used to be broken.

The smoke suite asserts **no renderer function is called that is never defined**. That check exists
because `openDetail()` was called in two places and defined in none — one of them the last line of
"Remove all mods", which threw after doing the work but before reporting it.

---

## Adding a mod

- Add an entry to `src/mods.js`: name, source strategy, placement rules, supported APIs, config file.
- Add a `CORE_SOURCES` entry if it needs a shared download, with its discovery strategy.
- Add its config sections to `MOD_SECTIONS` in the installer, and a `modSectionFile()` case if the
  file is not beside the executable.
- Run `bash harness/validate.sh`.

## Where to be careful

- **Widening a blocklist.** Always assert in both directions; the false-positive half matters more.
- **Blanket string replacement in the installer.** Check the surrounding structure, not just the
  matched text. Two bugs came from this, most recently an `apiOverrideNote` spread pasted into
  functions where that variable does not exist.
- **Adding UI that references state.** An undefined global inside a render function kills the whole
  page silently and presents as a routing bug. The smoke suite now asserts none exist.
- **Changing `MOD_API`.** Verify every API still has at least one route; Vulkan has exactly one
  (SuperDepth3D), and the smoke suite asserts it.
- **Changing the manifest format.** It is the only record of what may safely be deleted from a user's
  game folder.
- **Writing config defaults.** `DEFAULTS[modId]` must *seed* only the keys that are absent. Writing
  the whole block replaces values the user has already tuned — which is what it used to do.

---

## Building

```bash
npm install
node stamp-build.js       # refresh the build fingerprint
npm run dist              # package (runs the stamp automatically)
```

`npm run pack:dir` produces a portable folder and needs no Wine on Linux. `npm run dist` uses
electron-builder and wants Windows (or Wine) for icons and signing.

### Release checklist

- `bash harness/validate.sh` — all suites pass.
- `node stamp-build.js` and confirm the fingerprint changed.
- Verify the packaged zip has `update.bat` beside the executable, not inside the asar.
- Launch, open Settings, confirm the build fingerprint matches.
- Scan one drive and confirm the library merges rather than replaces.
- Install a mod, then **Remove all mods**, and confirm the game folder returns to its prior state.

---

## Safety

- All wrappers and ASI/add-on builds are **single-player only** — never on anti-cheat multiplayer.
- The config writer always backs up to `<file>.bak` before changing anything.
- Uninstall removes exactly the files recorded in the manifest.

MIT licensed. Mod sources belong to their respective authors (links in `src/mods.js`).
