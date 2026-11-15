import { skyAt, timeToChange, DEFAULT_THRESHOLDS } from "../core/geometry.js";
import { runScenario, plainSummary } from "../core/scenario.js";
import { drawPanorama, drawDome, drawTimeline } from "./skyCharts.js";
import {
  loadSites, loadEphemeris, loadSiteProduct, renderNav, readHash, writeHash, toUtcInput, fromUtcInput, fmtUtc,
  fmtHours, fmtLat, fmtLon, LIGHT, LIGHT_LABEL, STATUS_LABEL
} from "./common.js";

renderNav("site.html");
const $ = (id) => document.getElementById(id);

const [{ sites }, eph] = await Promise.all([loadSites(), loadEphemeris()]);
const hash = readHash();

const state = {
  id: hash.id || "bluemoon1",
  lat: parseFloat(hash.lat ?? -89.5), lon: parseFloat(hash.lon ?? 0),
  t0: hash.t ? fromUtcInput(hash.t) : eph.clamp(Math.max(Date.now(), eph.startMs)),
  days: parseFloat(hash.d || 15),
  cursor: 0, // index within the series
  th: { ...DEFAULT_THRESHOLDS }
};
let siteObj = null, product = null, run = null, playing = null;

// ---- selectors ----
$("sel-site").innerHTML = sites.map((s) => `<option value="${s.id}">${s.name}</option>`).join("") + `<option value="custom">Custom coordinates…</option>`;
$("sel-site").value = state.id;
$("sel-days").value = String(state.days);
$("in-time").min = toUtcInput(eph.startMs);
$("in-time").max = toUtcInput(eph.endMs);
$("in-time").value = toUtcInput(state.t0);
$("in-lat").value = state.lat; $("in-lon").value = state.lon;

// ---- thresholds UI ----
const TH = [
  ["minSunlitPct", "Sunlit % for green", 1], ["okSunlitPct", "Sunlit % for yellow", 1],
  ["maxDarkH", "Max darkness h (green)", 1], ["okDarkH", "Max darkness h (yellow)", 1],
  ["minEarthPct", "Earth visible % (green)", 1], ["okEarthPct", "Earth visible % (yellow)", 1],
  ["maxOutageH", "Max outage h (green)", 1], ["okOutageH", "Max outage h (yellow)", 1]
];
$("thresholds").innerHTML = TH.map(([k, l]) => `<label class="field">${l}<input type="number" data-th="${k}" value="${state.th[k]}" step="1" min="0" /></label>`).join("");
$("thresholds").addEventListener("input", (e) => {
  const k = e.target.dataset.th;
  if (k) { state.th[k] = parseFloat(e.target.value) || 0; recompute(false); }
});

async function loadSite() {
  if (state.id === "custom") {
    siteObj = { id: "custom", name: "Custom point", lat: state.lat, lon: state.lon, status: "custom", elevM: 0 };
    product = null;
  } else {
    const meta = sites.find((s) => s.id === state.id) || sites[0];
    state.id = meta.id;
    try { product = await loadSiteProduct(meta.id); } catch { product = null; }
    siteObj = { ...meta, elevM: product?.metadata.site_elevation_m ?? 0 };
  }
  document.querySelectorAll(".custom-only").forEach((e) => (e.style.display = state.id === "custom" ? "" : "none"));
  $("site-name").textContent = siteObj.name;
  $("site-kicker").textContent = siteObj.id === "custom" ? "Custom coordinates" : `${siteObj.provider} · ${siteObj.mission}`;
  $("site-sub").innerHTML = `${fmtLat(siteObj.lat)}, ${fmtLon(siteObj.lon)}${siteObj.site ? " · " + siteObj.site : ""}` +
    (siteObj.status && siteObj.status !== "custom" ? ` · <span class="chip ${siteObj.status}">${STATUS_LABEL[siteObj.status]}</span>` : "");
  $("lnk-path").href = state.id === "custom" ? "pathfinder.html" : `pathfinder.html#id=${state.id}`;
  renderProvenance();
  recompute(true);
}

function renderProvenance() {
  const p = product?.metadata;
  const parts = [];
  if (p) {
    parts.push(`<b>Terrain horizon:</b> NASA LRO LOLA (${p.terrain_source.replace("polar20m", "LDEM_80S_20M, 20 m/px").replace("global128", "LDEM_128, ≈237 m/px")}), spherical Moon, rays out to 30 km. Site elevation ${p.site_elevation_m.toFixed(0)} m above the 1737.4 km reference sphere.`);
  } else {
    parts.push(`<b>Terrain horizon:</b> none for custom coordinates, so a flat/spherical horizon is assumed. In polar regions this overestimates sunlight and Earth visibility. Pick a curated site for real terrain.`);
  }
  parts.push(`<b>Sun &amp; Earth positions:</b> JPL DE421 with lunar libration, ${eph.meta.start_utc.slice(0, 4)}–${eph.meta.start_utc.slice(0, 4) * 1 + 4}, hourly, interpolated. Within 0.01° of JPL Horizons in our checks.`);
  parts.push(`<b>Definitions:</b> Sun "up" = upper limb above the terrain horizon. Earth "up" = disc centre above the terrain horizon (antenna line of sight). No atmosphere, so no refraction.`);
  if (siteObj.confidence === "approximate") parts.push(`<span class="note warn" style="display:block">Coordinates for this site are approximate (region centre). Verify against NASA's latest data before relying on them.</span>`);
  $("provenance").innerHTML = parts.map((x) => `<p>${x}</p>`).join("");
}

function metric(k, v, s = "") {
  return `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
}

function recompute(resetCursor) {
  const horizon = product?.horizon_deg || null;
  run = runScenario(eph, siteObj, horizon, state.t0, state.days, state.th);
  if (resetCursor) state.cursor = 0;
  state.cursor = Math.min(state.cursor, run.S.n - 1);
  $("cursor").max = run.S.n - 1;
  $("cursor").value = state.cursor;
  renderWindow();
  render();
  syncHash();
}

function renderWindow() {
  const m = run.metrics, l = run.lights;
  $("lights").innerHTML = ["power", "comms", "overall"].map((k) =>
    `<div class="light"><span class="dot" style="background:${LIGHT[l[k]]}"></span>${k === "power" ? "Power" : k === "comms" ? "Direct-to-Earth" : "Overall"}: ${LIGHT_LABEL[l[k]]}</div>`).join("");
  $("plain").textContent = plainSummary(m, siteObj.name);
  $("win-metrics").innerHTML = [
    metric("Sunlit", `${m.sunlitPct.toFixed(0)}%`, `peak Sun elevation ${m.maxSunEl.toFixed(1)}°`),
    metric("Longest darkness", fmtHours(m.longestDarkH), `longest sunlight ${fmtHours(m.longestSunH)}`),
    metric("Earth visible", `${m.earthPct.toFixed(0)}%`, `longest window ${fmtHours(m.longestEarthH)}`),
    metric("Longest Earth outage", fmtHours(m.longestEarthOutageH), `Sun and Earth both up ${m.bothPct.toFixed(0)}%`),
    metric("Solar index, flat panel", m.horizontalPowerIdx.toFixed(2), "mean of sin(elevation), 1 = Sun at zenith all the time"),
    metric("Solar index, vertical panel", m.verticalPowerIdx.toFixed(2), "mean of cos(elevation), panel turned to the Sun")
  ].join("");
}

function render() {
  const S = run.S, i = state.cursor, tMs = S.t0Ms + i * S.stepMs;
  const horizon = product?.horizon_deg || null;
  const sky = skyAt(eph, tMs, siteObj);
  // trail: next 24 h
  const trail = { sun: [], earth: [] };
  for (let k = 0; k <= 48; k++) {
    const s = skyAt(eph, eph.clamp(tMs + k * 1800000), siteObj);
    trail.sun.push(s.sun); trail.earth.push(s.earth);
  }
  drawPanorama($("cv-pano"), { horizon, sky, trail, labelFlat: !horizon });
  drawDome($("cv-dome"), { horizon, sky });
  drawTimeline($("cv-timeline"), S, i, { onSeek: (idx) => { state.cursor = idx; $("cursor").value = idx; render(); } });
  $("cursor-label").textContent = `${fmtUtc(tMs)}  (+${((tMs - S.t0Ms) / 86400000).toFixed(2)} d)`;

  const sunUp = S.sunUp[i] === 1, earthUp = S.earthUp[i] === 1;
  const toSun = timeToChange(S, S.sunUp, i), toEarth = timeToChange(S, S.earthUp, i);
  const rest = ((S.n - 1 - i) * S.stepMs) / 3.6e6;
  const ev = (h, up, what) => (h === null ? `no change in the next ${fmtHours(rest)}` : `${what} in ${fmtHours(h)}`);
  $("now-metrics").innerHTML = [
    metric("Sun elevation", `${sky.sun.el.toFixed(2)}°`, `azimuth ${sky.sun.az.toFixed(1)}° · terrain horizon there ${(horizonAtSafe(horizon, sky.sun.az)).toFixed(1)}°`),
    metric(sunUp ? "Time to sunset" : "Time to sunrise", toSun === null ? "> window" : fmtHours(toSun), ev(toSun, sunUp, sunUp ? "sunset" : "sunrise")),
    metric("Earth elevation", `${sky.earth.el.toFixed(2)}°`, `azimuth ${sky.earth.az.toFixed(1)}° · terrain horizon there ${(horizonAtSafe(horizon, sky.earth.az)).toFixed(1)}°`),
    metric(earthUp ? "Time to Earthset" : "Time to Earthrise", toEarth === null ? "> window" : fmtHours(toEarth), ev(toEarth, earthUp, earthUp ? "Earthset" : "Earthrise")),
    metric("Sun right now", sunUp ? "Visible" : "Hidden", sunUp ? "power available" : "on battery"),
    metric("Earth right now", earthUp ? "Visible" : "Hidden", earthUp ? "direct link possible" : "no direct link")
  ].join("");
}

function horizonAtSafe(profile, az) {
  if (!profile) return 0;
  const f = (((az % 360) + 360) % 360), i = Math.floor(f), w = f - i;
  return profile[i % 360] * (1 - w) + profile[(i + 1) % 360] * w;
}

function syncHash() {
  const h = { id: state.id, t: toUtcInput(state.t0), d: state.days };
  if (state.id === "custom") { h.lat = state.lat; h.lon = state.lon; }
  writeHash(h);
  const sc = `${state.id === "custom" ? `custom:${state.lat}:${state.lon}` : state.id},${toUtcInput(state.t0)},${state.days}`;
  $("lnk-compare").href = `compare.html#sc=${encodeURIComponent(sc)}`;
}

// ---- events ----
$("sel-site").addEventListener("change", (e) => { state.id = e.target.value; loadSite(); });
const readCustom = () => { state.lat = parseFloat($("in-lat").value) || 0; state.lon = parseFloat($("in-lon").value) || 0; loadSite(); };
$("in-lat").addEventListener("change", readCustom); $("in-lon").addEventListener("change", readCustom);
$("in-time").addEventListener("change", (e) => { const v = fromUtcInput(e.target.value); if (!isNaN(v)) { state.t0 = eph.clamp(v); recompute(true); } });
$("sel-days").addEventListener("change", (e) => { state.days = parseFloat(e.target.value); recompute(true); });
$("cursor").addEventListener("input", (e) => { state.cursor = parseInt(e.target.value, 10); render(); });
$("btn-play").addEventListener("click", () => {
  if (playing) { clearInterval(playing); playing = null; $("btn-play").textContent = "▶ Play"; return; }
  $("btn-play").textContent = "⏸ Pause";
  playing = setInterval(() => {
    const step = Math.max(1, Math.round(run.S.n / 300));
    state.cursor = (state.cursor + step) % run.S.n;
    $("cursor").value = state.cursor; render();
  }, 40);
});
$("btn-share").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); $("btn-share").textContent = "Copied ✓"; } catch { $("btn-share").textContent = "Copy from address bar"; }
  setTimeout(() => ($("btn-share").textContent = "Copy link"), 1800);
});
$("mode-planner").addEventListener("click", () => setMode("planner"));
$("mode-explorer").addEventListener("click", () => setMode("explorer"));
function setMode(m) {
  document.body.className = m;
  $("mode-planner").classList.toggle("on", m === "planner");
  $("mode-explorer").classList.toggle("on", m === "explorer");
}
$("btn-csv").addEventListener("click", () => {
  const horizon = product?.horizon_deg || null;
  const t0 = run.t0, t1 = run.t1;
  const rows = ["utc,sun_el_deg,sun_az_deg,earth_el_deg,earth_az_deg"];
  for (let t = t0; t <= t1; t += 3600000) {
    const s = skyAt(eph, t, siteObj);
    rows.push(`${new Date(t).toISOString()},${s.sun.el.toFixed(3)},${s.sun.az.toFixed(3)},${s.earth.el.toFixed(3)},${s.earth.az.toFixed(3)}`);
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  a.download = `${siteObj.id}_${toUtcInput(t0).slice(0, 10)}.csv`;
  a.click();
});
new ResizeObserver(() => run && render()).observe(document.querySelector("main"));

await loadSite();
