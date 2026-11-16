import { skyAt, timeToChange, DEFAULT_THRESHOLDS } from "../core/geometry.js";
import { runScenario, plainSummary } from "../core/scenario.js";
import { drawPanorama, drawDome, drawTimeline } from "./skyCharts.js";
import { exportSiteReportPdf } from "./reportPdf.js";
import {
  loadSites, loadEphemeris, loadSiteProduct, renderNav, getLang, readHash, writeHash, toUtcInput, fromUtcInput, fmtUtc,
  fmtHours, fmtLat, fmtLon, LIGHT, LIGHT_LABEL, STATUS_LABEL
} from "./common.js";

renderNav("sitio.html");
const $ = (id) => document.getElementById(id);

const [{ sites }, eph] = await Promise.all([loadSites(), loadEphemeris()]);
const hash = readHash();

const state = {
  id: hash.id || "bluemoon1",
  lat: parseFloat(hash.lat ?? -89.47), lon: parseFloat(hash.lon ?? -138.01),
  t0: hash.t ? fromUtcInput(hash.t) : eph.clamp(Math.max(Date.now(), eph.startMs)),
  days: parseFloat(hash.d || 15),
  cursor: 0,
  th: { ...DEFAULT_THRESHOLDS }
};
let siteObj = null, product = null, customProduct = null, run = null, playing = null;

// Selectors
$("sel-site").innerHTML = sites.map((s) => `<option value="${s.id}">${s.name} (${s.site})</option>`).join("") + `<option value="custom">Coordenadas personalizadas…</option>`;
$("sel-site").value = state.id;
$("sel-days").value = String(state.days);
$("in-time").min = toUtcInput(eph.startMs);
$("in-time").max = toUtcInput(eph.endMs);
$("in-time").value = toUtcInput(state.t0);
$("in-lat").value = state.lat; $("in-lon").value = state.lon;

// Thresholds UI in Spanish
const TH = [
  ["minSunlitPct", "Luz solar mín % (Verde)"], ["okSunlitPct", "Luz solar mín % (Amarillo)"],
  ["maxDarkH", "Oscuridad máx h (Verde)"], ["okDarkH", "Oscuridad máx h (Amarillo)"],
  ["minEarthPct", "Visibilidad Tierra % (Verde)"], ["okEarthPct", "Visibilidad Tierra % (Amarillo)"],
  ["maxOutageH", "Apagón radio máx h (Verde)"], ["okOutageH", "Apagón radio máx h (Amarillo)"]
];
$("thresholds").innerHTML = TH.map(([k, l]) => `<label class="field">${l}<input type="number" data-th="${k}" value="${state.th[k]}" step="1" min="0" /></label>`).join("");
$("thresholds").addEventListener("input", (e) => {
  const k = e.target.dataset.th;
  if (k) { state.th[k] = parseFloat(e.target.value) || 0; recompute(false); }
});

async function loadSite() {
  if (state.id === "custom") {
    product = customProduct;
    siteObj = {
      id: "custom",
      name: product?.metadata?.name ? `Punto Personalizado (${product.metadata.name})` : "Punto Personalizado",
      lat: state.lat,
      lon: state.lon,
      status: "custom",
      elevM: product?.metadata?.site_elevation_m ?? 0
    };
  } else {
    const meta = sites.find((s) => s.id === state.id) || sites[0];
    state.id = meta.id;
    try { product = await loadSiteProduct(meta.id); } catch { product = null; }
    siteObj = { ...meta, elevM: product?.metadata.site_elevation_m ?? 0 };
  }
  document.querySelectorAll(".custom-only").forEach((e) => (e.style.display = state.id === "custom" ? "" : "none"));
  if (state.id === "custom") {
    $("btn-clear-lola").style.display = customProduct ? "" : "none";
  }
  $("site-name").textContent = siteObj.name;
  $("site-kicker").textContent = siteObj.id === "custom" ? "Coordenadas Personalizadas" : `${siteObj.provider} · Misión ${siteObj.mission}`;
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
    parts.push(`<strong>Topografía del Horizonte:</strong> Altimetría oficial NASA LRO LOLA (${p.terrain_source.replace("polar20m", "LDEM_80S_20M a 20 m/píxel").replace("global128", "LDEM_128 global a ~237 m/píxel")}), trazado de rayos con curvatura lunar esférica hasta 30 km. Elevación del sitio: ${p.site_elevation_m.toFixed(0)} m sobre el radio de referencia de 1737.4 km.`);
  } else {
    parts.push(`<strong>Topografía del Horizonte:</strong> Asume horizonte esférico plano al no haber perfil descargado para coordenadas libres. En regiones polares esto sobreestima la luz solar.`);
  }
  parts.push(`<strong>Efemérides de Sol y Tierra:</strong> JPL DE421 con libración lunar física NAIF de 2026 a 2030, paso horario interpolado. Error &lt; 0.006° frente al Horizons System de la NASA.`);
  parts.push(`<strong>Criterios:</strong> Sol "visible" cuando el limbo superior supera el horizonte de terreno. Tierra "visible" cuando el centro del disco supera el relieve (visión directa de antena).`);
  $("provenance").innerHTML = parts.map((x) => `<p style="margin-top:4px;">${x}</p>`).join("");
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

function hasLocalHorizon() {
  return Boolean(product?.horizon_deg && product.horizon_deg.length >= 360);
}

function renderWindow() {
  const m = run.metrics, l = run.lights;
  if (!hasLocalHorizon()) {
    $("lights").innerHTML = ["Energía Solar", "Enlace Tierra (LOS)", "Viabilidad Global"].map((lbl) =>
      `<div class="light-pill"><span class="dot" style="background:#94A3B8"></span>${lbl}: N/A</div>`).join("");
    $("plain").textContent = getLang() === "en"
      ? `No local NASA LOLA horizon profile is loaded for ${siteObj.name}. Sun/Earth positions (JPL DE421) are active above, while terrain-dependent illumination, blackout, and viability metrics remain N/A until you load a LOLA .json file or select a CLPS site.`
      : `No hay perfil de horizonte NASA LOLA cargado para ${siteObj.name}. Las posiciones astronómicas del Sol y la Tierra (JPL DE421) son reales, pero las métricas dependientes del relieve permanecen en N/A hasta cargar un archivo LOLA (.json) o elegir un sitio CLPS.`;
    $("win-metrics").innerHTML = [
      metric("Iluminación Solar", "N/A", "requiere perfil LOLA 360°"),
      metric("Máxima Oscuridad", "N/A", "sin relieve local"),
      metric("Tierra Visible (DTE)", "N/A", "requiere perfil LOLA 360°"),
      metric("Mayor Corte de Radio", "N/A", "sin relieve local"),
      metric("Índice Panel Horizontal", "N/A", "sin ocultación real"),
      metric("Índice Panel Vertical", "N/A", "sin ocultación real")
    ].join("");
    return;
  }
  $("lights").innerHTML = ["power", "comms", "overall"].map((k) =>
    `<div class="light-pill"><span class="dot" style="background:${LIGHT[l[k]]}"></span>${k === "power" ? "Energía Solar" : k === "comms" ? "Enlace Tierra (LOS)" : "Viabilidad Global"}: ${LIGHT_LABEL[l[k]]}</div>`).join("");
  $("plain").textContent = plainSummary(m, siteObj.name, getLang());
  $("win-metrics").innerHTML = [
    metric("Iluminación Solar", `${m.sunlitPct.toFixed(0)}%`, `elevación solar máxima ${m.maxSunEl.toFixed(1)}°`),
    metric("Máxima Oscuridad", fmtHours(m.longestDarkH), `período de luz continuo ${fmtHours(m.longestSunH)}`),
    metric("Tierra Visible (DTE)", `${m.earthPct.toFixed(0)}%`, `ventana continua máx ${fmtHours(m.longestEarthH)}`),
    metric("Mayor Corte de Radio", fmtHours(m.longestEarthOutageH), `Sol y Tierra visibles juntos ${m.bothPct.toFixed(0)}%`),
    metric("Índice Panel Horizontal", m.horizontalPowerIdx.toFixed(2), "promedio de sen(elevación)"),
    metric("Índice Panel Vertical", m.verticalPowerIdx.toFixed(2), "promedio de cos(elevación) orientado al Sol")
  ].join("");
}

function render() {
  const S = run.S, i = state.cursor, tMs = S.t0Ms + i * S.stepMs;
  const horizon = product?.horizon_deg || null;
  const sky = skyAt(eph, tMs, siteObj);

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
  const ev = (h, up, what) => (h === null ? `sin cambio en las próx ${fmtHours(rest)}` : `${what} en ${fmtHours(h)}`);

  if (!hasLocalHorizon()) {
    $("now-metrics").innerHTML = [
      metric("Elevación Solar", `${sky.sun.el.toFixed(2)}°`, `azimut ${sky.sun.az.toFixed(1)}° · horizonte local N/A (sin DEM)`),
      metric("Tiempo hasta ocaso / salida", "N/A", "requiere perfil LOLA 360°"),
      metric("Elevación Tierra", `${sky.earth.el.toFixed(2)}°`, `azimut ${sky.earth.az.toFixed(1)}° · horizonte local N/A (sin DEM)`),
      metric("Tiempo hasta Earthset / rise", "N/A", "requiere perfil LOLA 360°"),
      metric("Estado Solar Actual", "N/A", "sin relieve LOLA cargado"),
      metric("Enlace con la Tierra", "N/A", "sin relieve LOLA cargado")
    ].join("");
    return;
  }

  $("now-metrics").innerHTML = [
    metric("Elevación Solar", `${sky.sun.el.toFixed(2)}°`, `azimut ${sky.sun.az.toFixed(1)}° · horizonte local ${(horizonAtSafe(horizon, sky.sun.az)).toFixed(1)}°`),
    metric(sunUp ? "Tiempo hasta ocaso" : "Tiempo hasta salida de Sol", toSun === null ? "> ventana" : fmtHours(toSun), ev(toSun, sunUp, sunUp ? "ocaso" : "salida")),
    metric("Elevación Tierra", `${sky.earth.el.toFixed(2)}°`, `azimut ${sky.earth.az.toFixed(1)}° · horizonte local ${(horizonAtSafe(horizon, sky.earth.az)).toFixed(1)}°`),
    metric(earthUp ? "Tiempo hasta Earthset" : "Tiempo hasta Earthrise", toEarth === null ? "> ventana" : fmtHours(toEarth), ev(toEarth, earthUp, earthUp ? "Earthset" : "Earthrise")),
    metric("Estado Solar Actual", sunUp ? "Iluminado" : "En Sombra", sunUp ? "generando energía" : "consumo de batería"),
    metric("Enlace con la Tierra", earthUp ? "Línea de Vista OK" : "Ocluido", earthUp ? "comunicación directa" : "sin enlace directo")
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
  $("lnk-compare").href = `comparar.html#sc=${encodeURIComponent(sc)}`;
}

// Events
$("sel-site").addEventListener("change", (e) => { state.id = e.target.value; loadSite(); });
const readCustom = () => { state.lat = parseFloat($("in-lat").value) || 0; state.lon = parseFloat($("in-lon").value) || 0; loadSite(); };
$("in-lat").addEventListener("change", readCustom); $("in-lon").addEventListener("change", readCustom);
$("in-time").addEventListener("change", (e) => { const v = fromUtcInput(e.target.value); if (!isNaN(v)) { state.t0 = eph.clamp(v); recompute(true); } });
$("sel-days").addEventListener("change", (e) => { state.days = parseFloat(e.target.value); recompute(true); });
$("cursor").addEventListener("input", (e) => { state.cursor = parseInt(e.target.value, 10); render(); });

$("btn-play").addEventListener("click", () => {
  if (playing) { clearInterval(playing); playing = null; $("btn-play").textContent = "▶ Reproducir"; return; }
  $("btn-play").textContent = "⏸ Pausa";
  playing = setInterval(() => {
    const step = Math.max(1, Math.round(run.S.n / 300));
    state.cursor = (state.cursor + step) % run.S.n;
    $("cursor").value = state.cursor; render();
  }, 40);
});

$("btn-share").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); $("btn-share").textContent = "Enlace Copiado ✓"; } catch { $("btn-share").textContent = "Copia desde la barra"; }
  setTimeout(() => ($("btn-share").textContent = "Compartir"), 1800);
});

$("btn-csv").addEventListener("click", () => {
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

$("btn-upload-lola")?.addEventListener("click", () => $("in-lola-file")?.click());

$("in-lola-file")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const statusEl = $("custom-lola-status");
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.horizon_deg) || data.horizon_deg.length < 360) {
      throw new Error("El JSON debe incluir un arreglo 'horizon_deg' de 360 valores.");
    }
    customProduct = {
      ...data,
      metadata: {
        terrain_source: data.metadata?.terrain_source || "custom_lola_json",
        site_elevation_m: typeof data.metadata?.site_elevation_m === "number" ? data.metadata.site_elevation_m : 0,
        ...data.metadata
      }
    };
    if (typeof data.metadata?.lat === "number") {
      state.lat = data.metadata.lat;
      $("in-lat").value = state.lat;
    }
    if (typeof data.metadata?.lon === "number") {
      state.lon = data.metadata.lon;
      $("in-lon").value = state.lon;
    }
    if (statusEl) {
      statusEl.style.color = "#34D399";
      statusEl.textContent = getLang() === "en"
        ? `✓ Loaded: ${file.name} (${customProduct.horizon_deg.length} azimuths${customProduct.elevation_m?.length ? " + 40×40 km grid" : ""})`
        : `✓ Cargado: ${file.name} (${customProduct.horizon_deg.length} azimuts${customProduct.elevation_m?.length ? " + grilla 40×40 km" : ""})`;
    }
    await loadSite();
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = "#F87171";
      statusEl.textContent = getLang() === "en"
        ? `✕ Failed to read ${file.name}: ${err.message}`
        : `✕ Error al leer ${file.name}: ${err.message}`;
    }
  } finally {
    e.target.value = "";
  }
});

$("btn-clear-lola")?.addEventListener("click", async () => {
  customProduct = null;
  const statusEl = $("custom-lola-status");
  if (statusEl) statusEl.textContent = "";
  await loadSite();
});

$("btn-site-pdf")?.addEventListener("click", () => {
  if (!run || !siteObj) return;
  const hasHorizon = hasLocalHorizon();
  exportSiteReportPdf({
    site: siteObj,
    product,
    metrics: run.metrics,
    verdict: hasHorizon ? (run.lights?.overall || "amber") : "na",
    summary: hasHorizon
      ? plainSummary(run.metrics, siteObj.name, getLang())
      : (getLang() === "en"
          ? "No local NASA LOLA horizon profile was loaded for this custom coordinate. Terrain-dependent metrics are reported as N/A; only JPL DE421 astronomical positions apply."
          : "No se cargó un perfil de horizonte NASA LOLA local para esta coordenada personalizada. Las métricas dependientes del relieve se reportan como N/A; solo aplican las posiciones astronómicas JPL DE421."),
    windowHours: state.days * 24,
    startUtcLabel: fmtUtc(run.t0),
    hasHorizon,
  });
});

new ResizeObserver(() => run && render()).observe(document.querySelector("main"));
await loadSite();

