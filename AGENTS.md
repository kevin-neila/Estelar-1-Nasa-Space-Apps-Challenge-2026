# AGENTS.md — ArtemisForge (NASA Space Apps Challenge 2026)

## 1. Project Identity & Mission Context
* **Project Name:** Artemis South Pole Pathfinder (*ArtemisForge*)
* **Competition:** NASA International Space Apps Challenge 2026 — Theme: *"The Next Frontier"* (Lunar Exploration & Surface Infrastructure)
* **Project Directory:** `/home/cacho/artemis-forge`
* **Live Dev Server:** `http://localhost:5173/` (Port `5173`)
* **Target Region:** Lunar South Pole — Shackleton Crater Rim & Connecting Ridge ($89.5^\circ\text{S} - 90.0^\circ\text{S}$, $0.0^\circ\text{E}$, $20 \times 20\text{ km}$ tactical grid, $128 \times 128$ resolution).

---

## 2. Immediate Pending Task: NASA API Key Integration
The user is obtaining their official **NASA Open APIs Key** (`https://api.nasa.gov`).
**When the user provides the NASA API Key in a future session, immediately perform the following steps:**

1. **Create `/home/cacho/artemis-forge/.env`:**
   ```env
   VITE_NASA_API_KEY=<USER_PROVIDED_API_KEY>
   ```
2. **Update Default Fallback in `/home/cacho/artemis-forge/src/nasaApi.js`:**
   * Set the fallback key in `NasaApiClient` (`src/nasaApi.js`) so the app uses the user's real key out-of-the-box even without manual UI pasting.
   * Auto-trigger `this.nasaApi.fetchSpaceWeatherRadiationStatus()` and `this.scene.connectLiveNasaMoonTexture(this.nasaApi.getApiKey(), ...)` on startup in `src/main.js` (`init()`).
3. **Verify Live NASA Endpoints:**
   * **NASA DONKI (Space Weather SEP / Solar Energetic Particle Flux):** `https://api.nasa.gov/DONKI/SEP?api_key=<KEY>`
   * **NASA Moon Trek WMTS Polar Basemap Tiles:** `https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SP_85S_100m_v1.1.0/1.0.0/default/default028mm/...`
4. **Re-run Verification & Rebuild:**
   ```bash
   cd /home/cacho/artemis-forge && node scripts/verify_engine.mjs && npm run build
   ```

---

## 3. Architecture & File Map (`/home/cacho/artemis-forge`)

| File Path | Responsibility |
| :--- | :--- |
| `index.html` | Asymmetric editorial/brutalist cockpit layout, Apollo Hasselblad Reseau crosshairs (`+`), 3D `.GLB` model selectors, NASA API key input, and 7-Slide Monograph Pitch Modal. |
| `src/style.css` | Editorial/Brutalist aerospace visual system. Uses `Instrument Serif`, `Space Grotesk`, and `IBM Plex Mono`. Features `.theatre-mode` (`⛶ MAX 3D VIEW` / `F` hotkey) for 100% full-bleed 3D rendering. |
| `src/main.js` | Main controller connecting UI events, 4D A* pathfinding, 3D scene updates, bilingual dictionary (`EN` / `ES`), `.GLB` custom model uploads, and PDF export. |
| `src/lunarScene.js` | Three.js WebGL 3D Lunar South Pole engine (`worldSize = 300.0`). Includes 4 multi-spectral vertex/texture layers (`optical`, `slope`, `thermal`, `comms`), procedural Mars Perseverance 6-wheel rover + Artemis VIPER/LTV rover, 3D Blue Marble Earth, Solar Corona Star, and custom `.glb/.gltf` loader. |
| `src/pathfinder.js` | 4D Spatiotemporal Weighted A* Pathfinder + Dynamic Grazing Solar Raycaster (`1.6°` solar elevation). Computes Bekker-Wong slope penalties, LTV `3000 Wh` battery drawdown, PSR cryogenic dwell time (`<110 K`), and DSN line-of-sight coverage. |
| `src/nasaApi.js` | NASA Open APIs (`api.nasa.gov` / DONKI Space Weather) & runtime API key manager (`VITE_NASA_API_KEY` + `localStorage`). |
| `src/charts.js` | High-DPI HTML5 Canvas analog oscilloscope profile chart (LRO LOLA Elevation in `#B8FF01` Phosphor Lime + Diviner Temperature in `#FF5500` Kapton Orange). |
| `src/pdfExporter.js` | 1-Click `jsPDF` generator outputting `ArtemisForge_EVA_Flight_Dossier.pdf` with embedded 3D WebGL canvas snapshot, stereographic coordinates, and NASA PDS citations. |
| `src/i18n.js` | Complete English (`en`) and Spanish (`es`) dictionary + 7-Slide NASA Space Apps Pitch Deck content. |
| `scripts/generate_lunar_data.py` | Python synthesizer producing `public/data/shackleton_pds_grid.json` (`128x128` grid modeled on LRO LOLA DEM & Diviner thermal records). |
| `scripts/verify_engine.mjs` | Automated verification suite testing dataset integrity, all 4 Artemis III mission presets, DOM IDs, and bilingual slides. |
| `start_artemis.sh` / `start_artemis.bat` | 1-click launchers for Linux/macOS and Windows ( plus `/home/cacho/Desktop/ArtemisForge.desktop`). |

---

## 4. Strict Visual & Design Guidelines (DO NOT VIOLATE)
* **Typography:** Never use generic AI fonts (`Inter`, `Roboto`, `Arial`, system sans). Always preserve the trio:
  * `--font-serif: "Instrument Serif", Georgia, serif` (Headings, logo, hero metrics, pitch quotes)
  * `--font-sans: "Space Grotesk", sans-serif` (Body & controls)
  * `--font-mono: "IBM Plex Mono", monospace` (Telemetry, coordinates, stamps, oscilloscope)
* **Color Palette:** Never use white backgrounds with blue/purple gradients. Preserve the Apollo/Artemis Field Instrumentation palette:
  * Obsidian/Basalt backgrounds: `#0A0908`, `#12110E`, `#161411`
  * Bone/Parchment ink: `#F2EFE9`, `#9E9A90`
  * High-contrast hardware accents: Kapton Safety Orange (`#FF5500`), Phosphor Vector Green (`#B8FF01`), Cryo Cyan (`#38BDF8`), Halon Red (`#FF2A2A`).
* **Layout:** Preserve the asymmetric stepped spine layout (`.dossier-block` with vertical rotated `.block-spine`), staggered right-hand telemetry ledger, and expanded 3D viewport (`⛶ MAX 3D VIEW` / `F` shortcut).
