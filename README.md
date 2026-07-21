<div align="center">

# 🥽 Stereo 3D / 6DoF Manager

### One‑click setup for stereoscopic‑3D & 6DOF head‑tracking game mods

*Scan your games → get the right 3D mod → play in depth. No manual DLL juggling.*

<br/>

![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white)
![APIs](https://img.shields.io/badge/APIs-DX9%20·%20DX10%20·%20DX11%20·%20DX12%20·%20Vulkan%20·%20OpenGL-1a6a7a)
![Games](https://img.shields.io/badge/Game%20database-819%20titles-2a71a8)
![Mods](https://img.shields.io/badge/Managed%20mods-15-0e7f93)
![Built with](https://img.shields.io/badge/Built%20with-Electron-47848F?logo=electron&logoColor=white)

</div>

---

## 📖 What is this?

Playing PC games in **stereoscopic 3D** or with **6DOF head tracking** usually means hunting down the right driver, the right ReShade add‑on, the right per‑game mod, matching each to your game's graphics API, dropping DLLs into the correct folder, and hand‑editing config files. 😮‍💨

**This app does all of that for you.** It scans your drives, identifies each game, recommends the correct 3D pipeline, downloads the real mods from their official sources, installs them with the correct proxy DLLs, and gives you a clean editor for the settings that actually matter.

> [!NOTE]
> This is an **installer / orchestrator**. The 3D and 6DOF mods themselves are made by the amazing community authors in the [Credits](#-credits). Please support them! 💛

---

## ✨ Features

| | Feature | What it does |
|:--:|---|---|
| 🔍 | **Drive scan** | Finds installed games and reads each one's render API + 32/64‑bit straight from the `.exe`. |
| ⚡ | **One‑click setup** | Picks & installs the best 3D pipeline for the game's API and writes a working config. |
| 🎚️ | **Manual install** | Install any single mod yourself, with the correct proxy & folder layout applied automatically. |
| 🟨 | **API / bit override** | A yellow selector under the game title lets you correct detection; it sticks across rescans. |
| 🖼️ | **Dynamic output picker** | The output list adapts to each mod's real formats (SBS, TAB, interlaced, checkerboard, VR…). |
| 🎯 | **6DOF auto‑match** | Understands the game *name* and matches a BerZerker or itsloopyo head‑tracking mod. |
| 🕹️ | **6DOF manual picker** | Pick **any** mod & version from either catalogue — including combined **3D + 6DOF** builds. |
| ⚙️ | **Streamlined config** | Key 3D settings pinned on top, the rest folded away. Edits saved with a `.bak`, kept across updates. |
| 🧹 | **Clean uninstall** | Removes only the files the app installed (tracked per game). Your `game.exe` is never touched. |
| 💾 | **Backup & restore** | Export / import all your settings, library and profiles as a single JSON file. |
| 📴 | **Offline‑capable** | Bundled cores & fallbacks install even when a download source is unreachable. |

---

## 🚀 Usage — 5 simple steps

```
①  Scan  →  ②  Pick a game  →  ③  One‑click setup  →  ④  Tune  →  ⑤  Play
```

### ① Scan your drives
Click **⟳ Scan all drives**. The app reads each game's API + bitness and matches its name against the built‑in database of **819 titles**.

### ② Pick a game
Select any game. Its detected **API** and **bitness** show under the title in a 🟨 yellow selector — override them if a game was mis‑detected.

### ③ One‑click setup
Choose an **output format** and press the setup button. The app:
- picks the best 3D pipeline for the game's API,
- downloads the real mod from its official source,
- installs it with the correct proxy DLL & folder layout,
- writes a working config.

### ④ Tune
Open **⚙ Config**. The settings that matter for 3D — **output, separation, convergence** — are pinned at the top; everything else is folded into an *Advanced* section.

### ⑤ Play (+ optional 6DOF)
Launch the game. For head tracking, install a **6DOF** mod from the game's card (auto‑matched) or the manual picker, and point your tracker at **UDP `127.0.0.1:4242`**.

> [!TIP]
> Some config files only appear **after a game's first launch** (loaders like BepInEx create them on first run). The app shows sensible defaults until then.

---

## 🧩 What it can install

<table>
<tr><td valign="top">

**🟦 Stereoscopic 3D**
- **geo‑11** — DX11 geometry 3D
- **Geo3D** (Flugan) — DX10/11/12
- **SuperDepth3D** — depth‑based, any API
- **wiz3D** — DX9 & legacy

</td><td valign="top">

**🥽 VR export (full‑res SBS)**
- **SuperVrExport** → SuperDepth3D
- **GeoVrExport** → Geo3D
- ships **`geod3d9.dll`** for native DX9
- feeds **Katanga / VRScreenCap**

</td><td valign="top">

**🎯 6DOF head tracking**
- **BerZerker hub** (per‑game)
- **itsloopyo** (per‑game)
- combined **3D + 6DOF** builds
- auto loader install

</td></tr>
</table>

---

## 📚 Glossary

| Term | Meaning |
|---|---|
| **Stereoscopic 3D** | A separate image per eye, so the scene has real depth on a 3D display or VR viewer. |
| **6DOF** | *Six Degrees Of Freedom* — head yaw, pitch, roll + X/Y/Z lean driving the in‑game camera. |
| **Render API** | The graphics interface a game uses (DirectX 7–12, Vulkan, OpenGL). Decides which mod & DLL apply. |
| **Proxy DLL** | A DLL named like a system graphics library (`d3d9.dll`, `dxgi.dll`) that the game loads so a mod can hook in. |
| **ReShade** | A post‑processing injector; its **Add‑on** build hosts the stereo shaders and VR‑export add‑ons. |
| **SBS / TAB** | *Side‑by‑Side / Top‑and‑Bottom* — two eye images in one frame (half‑res squished, or full‑res). |
| **Convergence** | The distance that sits on the screen plane. Nearer pops out, farther recedes. |
| **Separation** | The 3D strength — how far apart the two eye viewpoints are. |
| **Katanga / VRScreenCap** | VR viewer apps that display the full‑res SBS frame the export add‑ons share to them. |
| **Core** | A shared cached download that multiple games link against (vs. a per‑game build). |

---

## 🕹️ DX9 games & full‑res VR

Direct3D 9 games can't share GPU textures across processes, so the VR‑export add‑ons ship a tiny proxy — **`geod3d9.dll`** — that upgrades the game to an extended (D3D9Ex) device for the fast GPU‑shared path. **This works for both SuperDepth3D and Geo3D.**

On a DX9 game, the manual install section shows an **optional ⛭ button** to set this up. Click it after installing ReShade + your 3D mod + the VR‑export addon. It renames the proxy to `d3d9.dll` beside the executable and moves ReShade into a subfolder it chainloads:

```
<game>\game.exe
<game>\d3d9.dll            ← geod3d9 proxy (renamed; the ONLY DirectX dll here)
<game>\ReShade\d3d9.dll    ← ReShade itself (keeps the d3d9.dll name)
<game>\ReShade\GeoVrExport.addon32
<game>\ReShade\ReShade.ini + ReShadePreset.ini
```

**Legacy DX → DX11 is built in.** For DX7/8/9/10 games, the manual section has an **Install dgVoodoo2** button that downloads the official package and places the correct DLL for the game's API + bitness (no site visit needed). This presents the game as DirectX 11 so geo‑11 / ReShade / Geo3D can run.

> dgVoodoo2 is freeware © **Dege** — the app fetches it *unmodified from the official source*, never bundling a modified copy, per its redistribution terms.

---

## 📄 Full documentation

A complete **feature & technical reference** — every download method, install layout, the config editor, and the DX9 proxy in detail — is in **[`docs/Stereo3D-6DoF-Manager-Guide.pdf`](docs/Stereo3D-6DoF-Manager-Guide.pdf)**.

Developers: build & architecture notes are in **[`DEVELOPER.md`](DEVELOPER.md)**.

---

## 🙏 Credits

This manager stands on the shoulders of the stereoscopic‑3D & VR modding community. All mods are downloaded from their **official sources** and remain under their authors' own licenses. 💛

| Project | Author |
|---|---|
| **SuperDepth3D / Depth3D** | [BlueSkyDefender](https://github.com/BlueSkyDefender/Depth3D) |
| **geo‑11 / HelixMod** | bo3b, DHR, Flugan & the HelixMod community |
| **Geo3D** | [Flugan](https://github.com/Flugan/Geo3D-Installer) |
| **Super‑VRExport / GeoVrExport** | [BerZerker96](https://github.com/BerZerker96/Super-VRExport-Addon) *(built on [artumino's ReshadeVRExport](https://github.com/artumino/ReshadeVRExport))* |
| **Katanga VR** | [bo3b](https://github.com/bo3b/katanga) |
| **ReShade** | [crosire](https://reshade.me) |
| **wiz3D** | effcol |
| **6DOF Head‑Tracking Hub** | [BerZerker96](https://github.com/BerZerker96) |
| **6DOF per‑game mods** | [itsloopyo](https://github.com/itsloopyo) |
| **dgVoodoo2** | [Dege](https://dege.freeweb.hu/) |
| **Loaders** | BepInEx · ThirteenAG (Ultimate ASI Loader) · praydog (REFramework) |

---

<div align="center">

**Made for the 3D gaming community.**

*Not affiliated with or endorsed by the individual mod authors — this tool simply helps you install their work correctly.*

</div>
