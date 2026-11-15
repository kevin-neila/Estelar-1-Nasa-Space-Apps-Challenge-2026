import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeDynamicShadowMask, findOptimalLunarRoute } from "../src/pathfinder.js";
import { I18N } from "../src/i18n.js";
import { Ephemeris } from "../src/core/ephemeris.js";
import { skyAt, buildSeries, computeMetrics, assess } from "../src/core/geometry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const datasetPath = path.join(rootDir, "public", "data", "shackleton_pds_grid.json");
const pathfinderHtmlPath = path.join(rootDir, "pathfinder.html");
const mainJsPath = path.join(rootDir, "src", "main.js");
const sitesPath = path.join(rootDir, "public", "data", "sites.json");
const ephMetaPath = path.join(rootDir, "public", "data", "ephemeris.json");
const ephBinPath = path.join(rootDir, "public", "data", "ephemeris.bin");

console.log("=== 1. VERIFYING CLPS SITES & NASA LOLA TOPOGRAPHY PRODUCTS ===");
const sitesData = JSON.parse(fs.readFileSync(sitesPath, "utf-8"));
if (!Array.isArray(sitesData.sites) || sitesData.sites.length < 10) {
  throw new Error("Sites catalog must contain at least 10 CLPS missions");
}
console.log(`[PASS] CLPS Catalog: ${sitesData.sites.length} sites documented.`);

for (const site of sitesData.sites) {
  const prodPath = path.join(rootDir, "public", "data", "sites", `${site.id}.json`);
  if (!fs.existsSync(prodPath)) {
    throw new Error(`Missing LOLA terrain product for site ${site.id}`);
  }
  const prod = JSON.parse(fs.readFileSync(prodPath, "utf-8"));
  if (!prod.horizon_deg || prod.horizon_deg.length !== 360) {
    throw new Error(`Invalid 360-degree horizon profile for ${site.id}`);
  }
  console.log(`[PASS] ${site.id.padEnd(12)} | ${site.name.padEnd(26)} | Elev: ${String(prod.metadata.site_elevation_m).padStart(6)}m | Source: ${prod.metadata.terrain_source}`);
}

console.log("\n=== 2. VERIFYING 2026-2030 SUN & EARTH EPHEMERIS ===");
const ephMeta = JSON.parse(fs.readFileSync(ephMetaPath, "utf-8"));
const ephBuf = fs.readFileSync(ephBinPath);
const eph = new Ephemeris(ephMeta, ephBuf.buffer.slice(ephBuf.byteOffset, ephBuf.byteOffset + ephBuf.byteLength));
console.log(`[PASS] Ephemeris range: ${ephMeta.start_utc} (Samples: ${eph.count}, ${(ephBuf.length/1024).toFixed(0)} KB)`);

// Test sky geometry on IM-2 Mons Mouton
const sky = skyAt(eph, Date.parse("2026-03-01T12:00:00Z"), { lat: -84.79, lon: 29.20 });
if (typeof sky.sun.el !== "number" || typeof sky.earth.el !== "number") {
  throw new Error("Invalid skyAt calculation");
}
console.log(`[PASS] Geometry Sample @ IM-2 Mons Mouton: Sun El ${sky.sun.el.toFixed(2)}°, Earth El ${sky.earth.el.toFixed(2)}°`);

console.log("\n=== 3. VERIFYING MULTI-PAGE APPLICATION FILES ===");
const pages = ["index.html", "site.html", "compare.html", "pathfinder.html", "learn.html", "about.html"];
for (const page of pages) {
  const pPath = path.join(rootDir, page);
  if (!fs.existsSync(pPath)) throw new Error(`Missing required page ${page}`);
}
console.log(`[PASS] All ${pages.length} core pages exist.`);

console.log("\n=== 4. VERIFYING 4D A* PATHFINDER ON ARTEMIS PRESETS ===");
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));
for (const preset of dataset.presets) {
  const mask = computeDynamicShadowMask(dataset, preset.sun_azimuth, 1.6);
  const res = findOptimalLunarRoute(dataset, mask, {
    start: preset.start,
    goal: preset.goal,
    maxSlope: preset.max_slope,
    weightSlope: preset.weights.slope,
    weightShadow: preset.weights.shadow,
    weightComms: preset.weights.comms
  });

  const t = res.telemetry;
  if (res.waypoints.length < 5) throw new Error(`Route too short for preset ${preset.id}`);
  console.log(
    `[PASS] ${preset.id.padEnd(24)} | WP: ${String(res.waypoints.length).padStart(2)} | Dist: ${t.distanceKm} km | MET: ${t.durationFormatted} | Batt: ${t.batteryRemainingPct}% | Verdict: ${t.verdict}`
  );
}

console.log("\n=== 5. VERIFYING DOM IDs & BILINGUAL I18N ===");
const html = fs.readFileSync(pathfinderHtmlPath, "utf-8");
const mainJs = fs.readFileSync(mainJsPath, "utf-8");
const idMatches = [...mainJs.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
for (const id of idMatches) {
  if (!html.includes(`id="${id}"`)) {
    throw new Error(`Missing DOM id="${id}" in pathfinder.html`);
  }
}
console.log(`[PASS] All ${idMatches.length} explicit DOM IDs referenced in src/main.js exist in pathfinder.html`);

if (I18N.en.slides.length !== 7 || I18N.es.slides.length !== 7) {
  throw new Error("Pitch deck must have exactly 7 slides in both EN and ES");
}
console.log("[PASS] 7-Slide Pitch Deck verified in both English and Español");
console.log("\nALL VERIFICATIONS PASSED WITH ZERO ERRORS.");
