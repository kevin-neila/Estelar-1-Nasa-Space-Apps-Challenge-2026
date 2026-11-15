import { runScenario } from "../core/scenario.js";
import { drawPanorama } from "./skyCharts.js";
import { skyAt } from "../core/geometry.js";
import {
  loadSites, loadEphemeris, loadSiteProduct, renderNav, readHash, writeHash,
  toUtcInput, fromUtcInput, fmtUtc, fmtHours, fmtLat, fmtLon, LIGHT, LIGHT_LABEL
} from "./common.js";

renderNav("compare.html");

const [{ sites }, eph] = await Promise.all([loadSites(), loadEphemeris()]);

const container = document.getElementById("scenarios-container");
const matrixBody = document.getElementById("matrix-body");

let scenarioList = [];

// Parse scenarios from hash, e.g. #sc=im2,2026-03-01T12:00,15|im2,2026-03-15T12:00,15
function parseHashScenarios() {
  const hash = readHash();
  if (hash.sc) {
    const parts = decodeURIComponent(hash.sc).split("|");
    return parts.map((p, idx) => {
      const [siteId, tStr, daysStr] = p.split(",");
      return {
        id: `sc_${Date.now()}_${idx}`,
        siteId: siteId || "im2",
        t0: tStr ? fromUtcInput(tStr) : eph.startMs,
        days: parseFloat(daysStr) || 15
      };
    });
  }
  return [
    { id: "sc_1", siteId: "im2", t0: Date.parse("2026-03-01T00:00:00Z"), days: 15 },
    { id: "sc_2", siteId: "im2", t0: Date.parse("2026-03-15T00:00:00Z"), days: 15 }
  ];
}

scenarioList = parseHashScenarios();

function updateHash() {
  const scStr = scenarioList.map(s => `${s.siteId},${toUtcInput(s.t0)},${s.days}`).join("|");
  writeHash({ sc: encodeURIComponent(scStr) });
}

async function renderAll() {
  container.innerHTML = "";
  matrixBody.innerHTML = "";

  const results = [];

  for (let i = 0; i < scenarioList.length; i++) {
    const sc = scenarioList[i];
    const siteObj = sites.find(s => s.id === sc.siteId) || sites[0];
    let product = null;
    try {
      product = await loadSiteProduct(sc.siteId);
    } catch {
      product = null;
    }

    const res = runScenario(eph, siteObj, product?.horizon_deg, sc.t0, sc.days);
    results.push({ sc, siteObj, product, res });
  }

  const baseline = results[0];

  results.forEach(({ sc, siteObj, product, res }, idx) => {
    const card = document.createElement("div");
    card.className = `scenario-card ${idx === 0 ? "primary-sc" : ""}`;

    const isBase = idx === 0;
    const badge = isBase ? '<span class="chip planned">Baseline (Option A)</span>' : `<span class="chip">Option ${String.fromCharCode(65 + idx)}</span>`;

    // Compute diff vs baseline
    let diffHtml = "";
    if (!isBase && baseline) {
      const dSun = res.metrics.sunlitPct - baseline.res.metrics.sunlitPct;
      const dEarth = res.metrics.earthPct - baseline.res.metrics.earthPct;
      const dDark = res.metrics.longestDarkH - baseline.res.metrics.longestDarkH;

      diffHtml = `
        <div style="margin-top: 10px; padding: 6px 10px; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 12px;">
          <strong>Delta vs Baseline:</strong>
          <span class="delta-badge ${dSun >= 0 ? 'delta-pos' : 'delta-neg'}">Sun: ${dSun >= 0 ? '+' : ''}${dSun.toFixed(1)}%</span>
          <span class="delta-badge ${dEarth >= 0 ? 'delta-pos' : 'delta-neg'}">Earth: ${dEarth >= 0 ? '+' : ''}${dEarth.toFixed(1)}%</span>
          <span class="delta-badge ${dDark <= 0 ? 'delta-pos' : 'delta-neg'}">Dark: ${dDark >= 0 ? '+' : ''}${dDark.toFixed(1)}h</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="sc-head">
        <div>
          ${badge}
          <h3 style="margin-top: 4px;">${siteObj.name}</h3>
          <div class="muted" style="font-size: 12px;">${fmtLat(siteObj.lat)}, ${fmtLon(siteObj.lon)} · ${siteObj.site || ''}</div>
        </div>
        ${scenarioList.length > 1 ? `<button class="btn small btn-remove" data-idx="${idx}" title="Remove">✕</button>` : ''}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
        <label class="field">Target Site
          <select class="sc-site-sel" data-idx="${idx}">
            ${sites.map(s => `<option value="${s.id}" ${s.id === sc.siteId ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </label>
        <label class="field">Window Duration
          <select class="sc-days-sel" data-idx="${idx}">
            <option value="7" ${sc.days === 7 ? 'selected' : ''}>7 Days</option>
            <option value="14" ${sc.days === 14 ? 'selected' : ''}>14 Days</option>
            <option value="15" ${sc.days === 15 ? 'selected' : ''}>15 Days</option>
            <option value="29.5" ${sc.days === 29.5 ? 'selected' : ''}>29.5 Days (1 Lunar Day)</option>
          </select>
        </label>
      </div>

      <label class="field" style="margin-top: 6px;">Arrival / Touchdown (UTC)
        <input type="datetime-local" class="sc-time-in" data-idx="${idx}" value="${toUtcInput(sc.t0)}" />
      </label>

      ${diffHtml}

      <div style="margin-top: 14px;">
        <canvas class="chart cv-pano-mini" style="height: 140px;"></canvas>
      </div>

      <div class="grid cols-2" style="margin-top: 12px; gap: 8px;">
        <div class="metric"><div class="k">Sunlit Ratio</div><div class="v">${res.metrics.sunlitPct.toFixed(1)}%</div><div class="s">${fmtHours(res.metrics.longestSunH)} continuous</div></div>
        <div class="metric"><div class="k">Earth LOS</div><div class="v">${res.metrics.earthPct.toFixed(1)}%</div><div class="s">${fmtHours(res.metrics.longestEarthH)} link</div></div>
        <div class="metric"><div class="k">Longest Dark</div><div class="v">${fmtHours(res.metrics.longestDarkH)}</div><div class="s">cryo battery dwell</div></div>
        <div class="metric"><div class="k">Longest Outage</div><div class="v">${fmtHours(res.metrics.longestEarthOutageH)}</div><div class="s">autonomous ops</div></div>
      </div>

      <div style="display: flex; gap: 8px; align-items: center; margin-top: 12px; font-size: 12px;">
        <span class="dot" style="background: ${LIGHT[res.lights.power]};"></span>Power: <strong>${LIGHT_LABEL[res.lights.power]}</strong>
        <span class="dot" style="background: ${LIGHT[res.lights.comms]}; margin-left: 8px;"></span>Comms: <strong>${LIGHT_LABEL[res.lights.comms]}</strong>
      </div>

      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <a class="btn small" href="site.html#id=${sc.siteId}&t=${toUtcInput(sc.t0)}&d=${sc.days}">Full Analysis →</a>
      </div>
    `;

    container.appendChild(card);

    // Draw mini panorama
    const cvPano = card.querySelector(".cv-pano-mini");
    const midTime = sc.t0;
    const sky = skyAt(eph, midTime, siteObj);
    drawPanorama(cvPano, {
      horizon: product?.horizon_deg,
      sky,
      trail: null,
      labelFlat: !product
    });

    // Add to matrix
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${String.fromCharCode(65 + idx)}: ${siteObj.name}</strong></td>
      <td>${fmtLat(siteObj.lat)}, ${fmtLon(siteObj.lon)}</td>
      <td>${fmtUtc(sc.t0)}</td>
      <td>${res.metrics.sunlitPct.toFixed(1)}%</td>
      <td>${fmtHours(res.metrics.longestDarkH)}</td>
      <td>${res.metrics.earthPct.toFixed(1)}%</td>
      <td>${fmtHours(res.metrics.longestEarthOutageH)}</td>
      <td><span class="dot" style="background:${LIGHT[res.lights.power]}"></span>${LIGHT_LABEL[res.lights.power]}</td>
      <td><span class="dot" style="background:${LIGHT[res.lights.comms]}"></span>${LIGHT_LABEL[res.lights.comms]}</td>
    `;
    matrixBody.appendChild(tr);
  });

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll(".sc-site-sel").forEach(el => {
    el.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      scenarioList[idx].siteId = e.target.value;
      updateHash();
      renderAll();
    });
  });

  document.querySelectorAll(".sc-days-sel").forEach(el => {
    el.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      scenarioList[idx].days = parseFloat(e.target.value);
      updateHash();
      renderAll();
    });
  });

  document.querySelectorAll(".sc-time-in").forEach(el => {
    el.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const val = fromUtcInput(e.target.value);
      if (!isNaN(val)) {
        scenarioList[idx].t0 = eph.clamp(val);
        updateHash();
        renderAll();
      }
    });
  });

  document.querySelectorAll(".btn-remove").forEach(el => {
    el.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      scenarioList.splice(idx, 1);
      updateHash();
      renderAll();
    });
  });
}

document.getElementById("btn-add-scenario").addEventListener("click", () => {
  const last = scenarioList[scenarioList.length - 1];
  scenarioList.push({
    id: `sc_${Date.now()}`,
    siteId: last ? last.siteId : "im2",
    t0: last ? last.t0 + 14 * 86400000 : eph.startMs,
    days: last ? last.days : 15
  });
  updateHash();
  renderAll();
});

document.getElementById("btn-share-comparison").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    document.getElementById("btn-share-comparison").textContent = "Link Copied ✓";
  } catch {
    document.getElementById("btn-share-comparison").textContent = "Copy from address bar";
  }
  setTimeout(() => {
    document.getElementById("btn-share-comparison").textContent = "Share Comparison";
  }, 1800);
});

// Quick evaluation presets
document.getElementById("quick-presets").addEventListener("click", (e) => {
  const p = e.target.closest("button")?.dataset.preset;
  if (!p) return;

  const tBase = Date.parse("2026-03-01T00:00:00Z");

  if (p === "slip14") {
    scenarioList = [
      { id: "s1", siteId: "im2", t0: tBase, days: 15 },
      { id: "s2", siteId: "im2", t0: tBase + 14 * 86400000, days: 15 }
    ];
  } else if (p === "south-vs-crisium") {
    scenarioList = [
      { id: "s1", siteId: "im2", t0: tBase, days: 15 },
      { id: "s2", siteId: "bg1", t0: tBase, days: 15 }
    ];
  } else if (p === "farside") {
    scenarioList = [
      { id: "s1", siteId: "im3", t0: tBase, days: 15 },
      { id: "s2", siteId: "draper", t0: tBase, days: 15 }
    ];
  } else if (p === "ridge-vs-crater") {
    scenarioList = [
      { id: "s1", siteId: "bluemoon1", t0: tBase, days: 15 },
      { id: "s2", siteId: "im1", t0: tBase, days: 15 }
    ];
  }

  updateHash();
  renderAll();
});

renderAll();
