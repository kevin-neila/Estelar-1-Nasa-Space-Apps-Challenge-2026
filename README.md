# ArtemisForge — Lunar Landing Site Navigator & Surface Pathfinder
### NASA International Space Apps Challenge 2026 — *"CLPS Lunar Mission Browser: Lunar Landing Site Navigator"*

A comprehensive web application enabling mission architects, scientists, educators, and the public to evaluate lunar landing sites, compare alternative dates, assess power generation potential from solar elevation, and calculate Direct-to-Earth communication windows using authentic NASA planetary data.

---

## 1. Executive Summary

Missions to the Moon’s south pole face extreme lighting and communication constraints:
- The Sun never rises more than ~1.5° above the horizon, casting multi-kilometer shadows across cratered terrain.
- Earth’s optical and physical libration (±7° wobble) causes it to oscillate above and below the horizon, creating cyclic communication blackout windows.
- In permanent shadow (PSRs), temperatures plunge to 40 K (-233°C), freezing lander batteries.

**ArtemisForge** bridges the gap between raw ephemerides and intuitive decision-making:
1. **Interactive 3D Moon Globe (`index.html`):** Explore curated NASA Commercial Lunar Payload Services (CLPS) missions (IM-1, IM-2, Griffin-1, Blue Moon MK1, Blue Ghost, etc.) with real-time solar terminator and Earth vectors.
2. **Site & Horizon Analyzer (`site.html`):** 360° terrain horizon profiles derived from NASA LRO LOLA altimetry, displaying instantaneous Sun/Earth elevations, countdowns to sunset/Earthset, and continuous operational windows.
3. **Launch Delay & Trade-off Matrix (`compare.html`):** Side-by-side comparative evaluator assessing the impact of launch slips (+14 days) or site re-targeting on power and comms viabilities.
4. **Educational Mode (`learn.html`):** Interactive grazing sun shadow simulator and real CLPS flight case studies explaining why south polar exploration is uniquely challenging.
5. **Surface Rover Pathfinder (`pathfinder.html`):** 4D spatiotemporal tactical rover cockpit with 3D terrain inspection, slope terramechanics, and 1-click NASA EVA Flight Dossier PDF export.
6. **Methodology & Sources (`about.html`):** Complete technical disclosure, formulas, and validation reports.

---

## 2. Authentic NASA Data Sources & Ephemerides

* **NASA LRO LOLA Polar DEM (`LDEM_80S_20M_FLOAT`):** 20 meters/pixel resolution polar stereographic digital elevation model (80°S to 90°S).
* **NASA LRO LOLA Global DEM (`LDEM_128_FLOAT`):** 128 pixels/degree (~237 m/pixel) cylindrical elevation model.
* **JPL DE421 Planetary Ephemeris + NAIF Lunar Orientation (`moon_pa_de421_1900-2050.bpc`):** High-precision Sun and Earth vectors computed in the Moon's Mean-Earth/polar-axis body-fixed frame, including physical libration and light-time correction.
* **Validation against NASA JPL Horizons:** Verified with automated test suite across all target sites with **maximum angular difference < 0.006°** (less than 22 arcseconds).

---

## 3. Quick Start (Run Locally)

```bash
# 1. Install dependencies
npm install

# 2. Run automated validation suite
npm test

# 3. Validate ephemeris against live NASA JPL Horizons API
npm run validate:horizons

# 4. Start local development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 4. Multi-Page Architecture

| Page | URL | Function |
| :--- | :--- | :--- |
| **Globe Explorer** | `index.html` | 3D Moon with CLPS mission pins, terminator, and site cards |
| **Site Analysis** | `site.html` | 360° LOLA terrain panorama, polar dome, and day/night timelines |
| **Scenario Compare** | `compare.html` | Side-by-side launch slip & site trade-off matrix |
| **Educational Mode** | `learn.html` | Interactive shadow engine & CLPS flight case studies |
| **Surface Pathfinder** | `pathfinder.html` | 3D rover tactical routing, slope hazards, and PDF dossier |
| **Methodology** | `about.html` | Data sources, Horizons validation, and team credits |

---

## 5. License & NASA Space Apps Challenge

Created for the **2026 NASA International Space Apps Challenge**. All NASA planetary datasets, LOLA altimetry, and JPL ephemerides cited in accordance with NASA Open Data guidelines.
