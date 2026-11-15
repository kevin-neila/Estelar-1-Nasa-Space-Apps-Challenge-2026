// Validates our Sun/Earth azimuth+elevation against NASA JPL Horizons (topocentric, Moon body-fixed).
// Usage: node scripts/validate_horizons.mjs      (needs internet)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ephemeris } from "../src/core/ephemeris.js";
import { skyAt } from "../src/core/geometry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const meta = JSON.parse(fs.readFileSync(path.join(root, "public/data/ephemeris.json"), "utf-8"));
const bin = fs.readFileSync(path.join(root, "public/data/ephemeris.bin"));
const eph = new Ephemeris(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

const sites = [
  { name: "IM-2 Mons Mouton", lat: -84.79, lon: 29.2 },
  { name: "Connecting Ridge (Blue Moon)", lat: -89.47, lon: -138.01 },
  { name: "Blue Ghost M1 Mare Crisium", lat: 18.5623, lon: 61.8103 },
  { name: "Schrodinger (far side)", lat: -75.0, lon: 132.4 }
];
const times = ["2026-03-01 12:00", "2027-06-15 06:00", "2029-10-10 18:00"];
const bodies = { sun: "10", earth: "399" };

async function horizons(cmd, site, t) {
  const t1 = new Date(Date.parse(t.replace(" ", "T") + ":00Z") + 3600000).toISOString().slice(0, 16).replace("T", " ");
  const q = new URLSearchParams({
    format: "json", COMMAND: `'${cmd}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${site.lon},${site.lat},0'`,
    START_TIME: `'${t}'`, STOP_TIME: `'${t1}'`, STEP_SIZE: "'60 min'", QUANTITIES: "'4'", CSV_FORMAT: "'YES'", ANG_FORMAT: "'DEG'"
  });
  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${q}`);
  const js = await res.json();
  const body = js.result.split("$$SOE")[1]?.split("$$EOE")[0];
  if (!body) throw new Error(js.result.slice(0, 400));
  const first = body.trim().split("\n")[0].split(",").map((s) => s.trim()).filter(Boolean);
  const nums = first.filter((s) => /^-?\d+(\.\d+)?$/.test(s)).map(Number);
  return { az: nums[nums.length - 2], el: nums[nums.length - 1] };
}

let worst = 0;
for (const site of sites) {
  for (const t of times) {
    const mine = skyAt(eph, Date.parse(t.replace(" ", "T") + ":00Z"), { ...site });
    for (const [name, cmd] of Object.entries(bodies)) {
      const ref = await horizons(cmd, site, t);
      const m = mine[name];
      const dEl = m.el - ref.el;
      let dAz = m.az - ref.az;
      dAz = ((dAz + 540) % 360) - 180;
      // azimuth error is meaningless when the body is at the zenith/nadir
      worst = Math.max(worst, Math.abs(dEl), Math.abs(dAz) * Math.cos((ref.el * Math.PI) / 180));
      console.log(`${site.name.padEnd(30)} ${t} ${name.padEnd(5)} el ours ${m.el.toFixed(3)} JPL ${ref.el.toFixed(3)} (d ${dEl.toFixed(3)})  az ours ${m.az.toFixed(3)} JPL ${ref.az.toFixed(3)} (d ${dAz.toFixed(3)})`);
    }
  }
}
console.log(`\nWorst angular difference vs JPL Horizons: ${worst.toFixed(3)} deg`);
process.exit(worst < 0.1 ? 0 : 1);
