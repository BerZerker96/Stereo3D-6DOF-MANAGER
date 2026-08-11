# Changelog

## Build `08f0109f` — 2026-08-10

Fixes for three reported faults (wrong VR-export links, "Remove all mods" doing nothing, per-mod
Uninstall doing nothing), a rewritten render-API detector, and the audit findings that came with them.

---

### 1. VR-export add-on links pointed at the wrong repositories

The **Mods** page linked *SuperVrExport* at `BlueSkyDefender/SuperVrExport` and *GeoVrExport* at
`Flugan/Geo3D-Installer`. Neither is where the app downloads them from — both add-ons come from the
same repository, `BerZerker96/Super-VRExport-Addon`, which is what `CORE_SOURCES` has always said.

Both links now point at **https://github.com/BerZerker96/Super-VRExport-Addon**, and the smoke suite
asserts the Mods page agrees with the download source so the two cannot drift apart again.

> This is the same failure the handoff records for the Osiris VR Viewer link: a wrong URL in the Mods
> tab is invisible until somebody clicks it. Both directions are now asserted.

---

### 2. "Remove all mods" did nothing

Two independent faults, either of which alone was enough to break the button.

**a. It called a function that does not exist.** `openDetail()` was invoked in two places in the
renderer and defined in none. The call was the last statement of `uninstallAllMods()`, so the
function threw a `ReferenceError` after running the removals but *before* refreshing the library or
reporting anything. Nothing on screen changed, so the button appeared inert.

**b. It passed the wrong identifiers.** The loop iterated `g.inst`, which holds the UI's *card* ids
(`supervr`, `geovr`), and passed them straight to the backend, which keys the manifest by *registry*
ids (`supervrexport`, `geovrexport`). Those calls matched no manifest record — and the old
`uninstall()` answered "nothing recorded" with `{ ok: true }`, so the loop counted them as
successfully removed while deleting nothing at all.

**The fix.** The whole operation moved into the main process as `installer.uninstallAll(game)`,
reached over a new `uninstallAll` IPC channel. It reads the manifest — the only thing that actually
knows what was placed — orders guests before hosts, removes each mod independently so one failure
cannot abort the rest, and returns a real report (`removed`, `files`, `failed`). The renderer now
re-derives the game's state from disk afterwards rather than editing its in-memory copy.

---

### 3. Per-mod "Uninstall" did nothing

`uninstall()` returned `{ ok: true }` when the manifest had no record for the id. The UI took that as
success and dropped the mod from its list, but no files were deleted — so the next folder rescan
detected the mod still on disk and put it straight back. That round trip is exactly what "the
uninstall button doesn't work" looked like.

`uninstall()` now distinguishes three outcomes and reports them honestly:

| Outcome | Meaning | Behaviour |
|---|---|---|
| **installed** | files were recorded | they are deleted, the record is removed |
| **adopted** | registered for management but installed by hand | record removed, **nothing deleted** |
| **untracked** | nothing recorded for this id | `ok: false`, `untracked: true`, with an explanation |

It also now:

- accepts the UI's card ids (`supervr` / `geovr`) defensively, so an id can never silently resolve to
  "no such mod";
- deletes deepest paths first and removes the directories it emptied (but only when genuinely empty);
- reports per-file failures with a translated errno instead of swallowing them;
- takes locked add-ons off with their host (`lockedBy`), while leaving shared hosts in place.

**Re-adoption guard.** `refreshDetected()` auto-adopts anything it finds on disk. Called straight
after a removal, that re-adopted leftover signatures and the mod reappeared. All uninstall paths now
call `refreshDetected(i, { adopt: false })`.

---

### 4. Per-game mod tracking

The manifest at `<game>\.stereoscope\manifest.json` was always the record of what the app placed;
what was missing was a way for the UI to *read* it rather than keep a parallel guess.

- New `installer.installedMods(game)` → `[{ id, name, tag, adopted, lockedBy, files, when }]`,
  exposed over a new `installedMods` IPC channel.
- "Remove all mods" now builds its confirmation list from the manifest, so the list the user is shown
  is exactly what will be removed — including which entries are adopted and will only be
  de-registered.
- Both uninstall paths re-derive state from disk afterwards, so the UI cannot drift from the drive.

IPC surface is now **101 handlers, 101 bridged**, asserted by the smoke suite.

---

### 5. Render-API detection rewritten

Games were frequently reported with the wrong API. The detector read the first 24 MB of the
executable and asked whether the bytes contained `"d3d11.dll"` — which matches error strings,
embedded resources, unrelated blobs and other libraries' names.

Detection is now modelled on **how ReShade actually decides**. ReShade hooks the loader and watches
which graphics entry point the process really calls. The static equivalent is the PE **import
directory**, which the new `src/peimports.js` parses — both the classic import table and the
**delay-load** table.

Two specific failure modes this removes:

- **`dxgi.dll` counted as proof of DX11.** It is not. DX10, DX11 and DX12 all import dxgi, and so do
  many Vulkan titles. Every DX12 game therefore also claimed DX11, and since the UI shows `api[0]`,
  the wrong one often won. `dxgi` alone now contributes nothing; it only resolves to DX11 when no
  stronger evidence exists at all.
- **Delay-loaded renderers were invisible.** Modern engines delay-load `d3d12.dll`, so DX12 titles
  showed no DX12 evidence beyond an incidental string.

Evidence is scored by how much it actually proves:

| Score | Evidence |
|---|---|
| 4 | an imported **function** unique to one API (`D3D12CreateDevice`, `vkCreateInstance`, `Direct3DCreate9`) |
| 3 | a direct import of the API's own DLL |
| 3 | a **delay-load** import of the API's own DLL |
| 2 | the engine runtime beside the exe imports it (`UnityPlayer.dll` — a Unity exe imports no API itself) |
| 2 | the D3D12 **Agility SDK** shipped with the game (`D3D12Core.dll`) |
| 1 | a real sibling DLL in the game folder |
| 1 | the executable's own name (`Control_DX12.exe`) |

Also carried forward: files this app installed, and any known wrapper name, are still excluded — a
geo-11 `d3d11.dll` beside a DX9 game must never flip it to DX11 on rescan. The old string scan
survives only as a last resort for binaries with no readable import table (packed or protected), and
is scored below every real signal.

`scanner.detectApiDetailed(exe, dir)` is new, returning the resolved list plus the graphics DLLs
actually imported — useful for logs and for explaining a detection to a user.

**Correction to the handoff.** Appendix B states "the database is a hint, never an override. What the
binary actually imports wins." That was never true in code: `inspectGame()` lets a database match
replace the PE result outright. The behaviour is defensible — a remaster can change API without
changing the binary's imports — but the documentation had it backwards. It is now described
accurately in `DEVELOPER.md`.

---

### 6. Audit findings fixed alongside

| Area | Finding |
|---|---|
| `src/scanner.js` | **`pickMainExe` was defined twice.** The second definition silently won, and it had lost the `JUNK_DIR` guard — so the fallback descended into `_Redist`, `installer_files` and `tools`, the folders section 7 exists to keep out. Duplicate removed. |
| `src/installer.js` | `apiOverrideNote` residue from a blanket string replacement: a `typeof`-guarded spread pasted into six places, two of them in `uninstall()` where the variable is not in scope and the guard always evaluated to `[]`. Removed. |
| `renderer/index.html` | The empty-scan guard in `realScan()` was duplicated; the second copy was unreachable. Removed. |
| `renderer/index.html` | The Settings page still told users settings are "saved next to the app when that folder is writable (portable)". They moved to the per-user app-data folder precisely because an update replaced that folder and destroyed the library. Text corrected. |
| `src/store.js` | Its file header described the same removed portable behaviour. Corrected. |
| `src/mods.js` | The geo-11 catalogue note read "Official HelixMod build v0.7.9" while the pinned `url` and `version` are v0.7.10. Corrected. |
| `renderer/index.html` | The mockup-era `LATEST` table was printed as fact ("latest v0.6.56 on GitHub") before any update check had run. Version labels now render through `verLabel()`, which shows a dash until the value has been confirmed against the network. |

---

### 7. Defaults were overwriting user settings *(found by the new config suite)*

The handoff guarantees "defaults seed without overwriting: installing seeds missing sections so
settings are editable before first launch, but never replaces a value the user has already set."
That was not what the code did — `_installInner` wrote the whole `DEFAULTS[modId]` block
unconditionally, so a hand-tuned config was replaced with the app's defaults on first install.

Two changes:

- **Defaults now seed only absent keys.** Present values are left exactly as they are.
- **The pre-install snapshot is taken on every install**, not only on an update. A config file can
  already exist because the user installed the mod by hand and tuned it; a first install through the
  app previously overwrote it with the author's shipped file and the tuning was gone.

### 8. Test harness

The archive shipped without the `harness/` directory the handoff describes, so nothing was runnable.
A new harness now covers the changed subsystems *and* reconstructs the intent of the original
combination matrices:

```
bash harness/validate.sh        # all suites
node harness/smoke.js           # structure, IPC symmetry, registry, links, undefined globals
node harness/apidetect.js       # API detection against real synthetic PE images
node harness/uninstall.js       # install/uninstall lifecycle and per-game tracking
node harness/matrix.js          # every mod x every engine layout, and every output format
node harness/conflicts.js       # proxy slots, install order, ownership, uninstall permutations
node harness/configs.js         # config round-trips, unknown keys, seeding without overwriting
node harness/wiring.js          # renderer -> preload -> main wiring for both uninstall paths
node harness/uninstall-e2e.js   # uninstall through the renderer's OWN payload contract
node harness/apicompare.js      # old vs new API detector, head to head
```

**715 assertions, all passing.**

| Suite | Checks | Covers |
|---|---:|---|
| smoke | 94 | Parsing, 101/101 IPC symmetry, registry integrity, catalogue links, bundled payloads, database, build stamp, undefined globals |
| apidetect | 22 | The PE import parser, then every detection regression against real synthetic PE32/PE32+ images |
| uninstall | 41 | Install → record → remove → verify, locked add-ons, adopted de-registration, untracked honesty, remove-all |
| matrix | 346 | 88 mod/layout combinations and all 47 mod/output combinations; every install reaches a *justified* decision |
| conflicts | 110 | 8 mod pairs in **both** orders, proxy-slot ownership, ReShade rehoming, uninstall permutations, drift across cycles |
| configs | 33 | Round-trips, comment/unknown-key preservation, tuning surviving upgrade, seed-without-overwrite |
| **wiring** | **27** | Markup button → integration-layer handler → IPC channel → preload binding → main handler, for both uninstall paths |
| **uninstall-e2e** | **42** | Uninstall driven through the renderer's exact `serializeGame` payload and `bidOf` id mapping, plus edge cases |
| **apicompare** | — | Reimplements the OLD detector and runs both head to head on 14 realistic fixtures |

- `harness/pebuild.js` writes genuinely valid PE32 / PE32+ images with a chosen import and delay-import
  table. API detection reads the real import directory, so testing it honestly requires fixtures whose
  import tables actually say what the test claims — string fixtures would test exactly the thing that
  was wrong before.
- `harness/uninstall.js` drives the real installer against a sandboxed game folder using `manual-core`,
  so it needs no network. It asserts install→record→remove→verify, locked add-on removal, adopted
  de-registration, untracked honesty, and that three install/uninstall cycles leave an identical
  footprint with nothing behind.
- `harness/smoke.js` asserts **no renderer function is called that is never defined** — the check that
  catches the `openDetail` class of bug. Verified to fail when that definition is removed.
- `harness/matrix.js` asserts both halves of the original suite's central claim: every install reaches
  a decision (never a crash, never a silent no-op), and every refusal *and* acceptance is justified
  against `MOD_API`. It also checks placement lands beside the real executable rather than the game
  root, which is the failure that only a layout-aware test finds.
- `harness/conflicts.js` runs every pair in **both** install orders, because slot claiming is
  order-sensitive and a bug that only appears when the head-tracking mod installs first would
  otherwise hide completely.

---

### Re-audit (same day)

Everything above was re-verified from the packaged archive rather than the working copy, with three
new suites written specifically to attack the fixes rather than confirm them:

- **`wiring.js`** asserts the full chain — markup `onclick` → integration-layer definition → IPC
  channel → preload binding → `ipcMain.handle`. A backend that works is useless if the button does
  not reach it, and both original faults were wiring faults rather than logic faults. It caught one
  remaining unguarded `openDetail(sel)` call in `setGameExe` (safe, since the definition precedes it
  in the same IIFE, but now guarded for consistency).
- **`uninstall-e2e.js`** drives uninstall through the renderer's *exact* `serializeGame` payload and
  `bidOf` id mapping rather than calling the backend directly, so a mismatch between what the UI
  sends and what the backend expects would surface. It also covers: files already deleted by hand,
  adopted and installed mods removed together, nested executable layouts, an undeletable file, double
  uninstall, and a game with no folder. **42/42.**
- **`apicompare.js`** reimplements the pre-fix detector verbatim and runs both against 14 fixtures
  modelling real binaries.

#### API detection, measured

| | Correct | Rate |
|---|---:|---:|
| Old detector | 8 / 14 | 57% |
| New detector | **14 / 14** | **100%** |

Six cases fixed, zero regressions. The failures the rewrite removes:

- a DX9 title whose binary mentions `d3d11.dll` in an error string → was reported DX11
- an OpenGL title with a `dxgi` reference in a bundled library table → was reported DX11
- a DX11 title with a `d3d12` mention in a feature-check string → was reported DX12
- a legacy DirectDraw title mentioning `d3d9` in a compat note → was reported DX9 instead of DX7
- a Unity stub whose `UnityPlayer.dll` is DX12 → was reported DX11
- a DX9 title with geo-11 already installed beside it → was reported DX11

The common thread is that a byte match is not a dependency. Every one of these is a binary that
*mentions* an API it does not use.

### Files changed

```
src/peimports.js      NEW  PE import-directory parser (classic + delay-load)
src/scanner.js             detectApi rewritten; detectApiDetailed added; duplicate pickMainExe removed
src/installer.js           uninstall rewritten; uninstallAll + installedMods added; residue removed;
                           DEFAULTS now seed-only; config snapshot taken on every install
main.js                    +2 IPC handlers (uninstallAll, installedMods)
preload.js                 +2 bridge bindings
renderer/index.html        VR-export links; openDetail defined; uninstall paths rewired; dup guard;
                           settings-location text; version labels via verLabel()
src/store.js               stale header comment
src/mods.js                geo-11 version note
harness/                NEW  pebuild.js, smoke.js, apidetect.js, apicompare.js, uninstall.js,
                             uninstall-e2e.js, wiring.js, matrix.js, conflicts.js, configs.js,
                             validate.sh
CHANGELOG.md            NEW
docs/API-Detection.md   NEW
docs/Stereo3D-6DoF-Manager-Handoff-Addendum.pdf  NEW
```
