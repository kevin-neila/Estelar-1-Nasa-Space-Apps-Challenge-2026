import { jsPDF } from "jspdf";
import { getLang } from "./i18n.js";

function drawHeader(doc, title, subtitle) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(12, 18, 36);
  doc.rect(0, 0, w, 28, "F");
  doc.setFillColor(74, 111, 165);
  doc.rect(0, 28, w, 1.2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 16, 13);

  doc.setTextColor(170, 194, 232);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(subtitle, 16, 21);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function renderSiteLayerMapDataUrl(product, layer, site, isEn) {
  const N = product?.metadata?.grid_size || Math.round(Math.sqrt(product.elevation_m.length));
  const elev = product.elevation_m;
  const slope = product.slope_deg;
  const illum = product.illumination_frac || [];
  const earth = product.earth_visible_frac || [];

  let eMin = Infinity;
  let eMax = -Infinity;
  for (let k = 0; k < elev.length; k++) {
    if (elev[k] < eMin) eMin = elev[k];
    if (elev[k] > eMax) eMax = elev[k];
  }
  const eSpan = Math.max(1, eMax - eMin);
  const cellM = product?.metadata?.cell_size_m || 240;

  const raw = document.createElement("canvas");
  raw.width = N;
  raw.height = N;
  const rctx = raw.getContext("2d");
  const img = rctx.createImageData(N, N);
  const px = img.data;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const z = elev[idx];
      const slp = slope ? slope[idx] : 0;
      const ill = illum.length ? illum[idx] : 0.5;
      const ear = earth.length ? earth[idx] : 0.5;

      // Hillshade from NW grazing light for crisp crater relief
      const iL = Math.max(0, i - 1);
      const iR = Math.min(N - 1, i + 1);
      const jU = Math.max(0, j - 1);
      const jD = Math.min(N - 1, j + 1);
      const dzdx = (elev[j * N + iR] - elev[j * N + iL]) / (2 * cellM);
      const dzdy = (elev[jD * N + i] - elev[jU * N + i]) / (2 * cellM);
      const shade = clamp(0.74 - dzdx * 0.85 - dzdy * 0.55, 0.3, 1.25);

      let r = 0, g = 0, b = 0;

      if (layer === "optical") {
        const zNorm = (z - eMin) / eSpan;
        const base = (0.28 + 0.58 * Math.pow(zNorm, 0.88)) * shade;
        const light = 0.22 + 0.78 * ill;
        r = clamp(Math.round(base * light * 255), 10, 250);
        g = clamp(Math.round(base * light * 246), 12, 244);
        b = clamp(Math.round(base * light * 234), 16, 232);
      } else if (layer === "slope") {
        if (slp < 8.0) {
          const t = slp / 8.0;
          r = (0.16 + 0.38 * t) * 255;
          g = (0.80 - 0.12 * t) * 255;
          b = 0.22 * 255;
        } else if (slp <= 15.0) {
          const t = (slp - 8.0) / 7.0;
          r = (0.92 + 0.08 * t) * 255;
          g = (0.65 - 0.36 * t) * 255;
          b = 0.06 * 255;
        } else {
          const t = clamp((slp - 15.0) / 18.0, 0, 1);
          r = 0.95 * 255;
          g = 0.16 * (1 - t) * 255;
          b = 0.14 * 255;
        }
        const sMod = 0.68 + 0.32 * shade;
        r = clamp(Math.round(r * sMod), 0, 255);
        g = clamp(Math.round(g * sMod), 0, 255);
        b = clamp(Math.round(b * sMod), 0, 255);
      } else if (layer === "thermal") {
        // Cryo cold traps (< 110 K when ill < 0.08) vs sunlit warm regolith
        const tempK = 45 + 175 * Math.pow(clamp(ill, 0, 1), 0.55);
        if (tempK < 110.0) {
          const cryo = clamp((110.0 - tempK) / 65.0, 0, 1);
          r = (0.08 + 0.10 * cryo) * 255;
          g = (0.50 + 0.42 * cryo) * 255;
          b = (0.86 + 0.14 * cryo) * 255;
        } else {
          const warm = clamp((tempK - 110.0) / 110.0, 0, 1);
          r = (0.45 + 0.55 * warm) * 255;
          g = (0.24 + 0.30 * (1 - Math.abs(warm - 0.45))) * 255;
          b = 0.08 * 255;
        }
        const sMod = 0.72 + 0.28 * shade;
        r = clamp(Math.round(r * sMod), 0, 255);
        g = clamp(Math.round(g * sMod), 0, 255);
        b = clamp(Math.round(b * sMod), 0, 255);
      } else if (layer === "comms") {
        if (ear >= 0.5 && ill >= 0.25) {
          r = 138; g = 224; b = 34;
        } else if (ear >= 0.5) {
          r = 46; g = 136; b = 212;
        } else if (ear >= 0.15) {
          r = 128; g = 92; b = 108;
        } else {
          r = 165; g = 34; b = 46;
        }
        const sMod = 0.74 + 0.26 * shade;
        r = clamp(Math.round(r * sMod), 0, 255);
        g = clamp(Math.round(g * sMod), 0, 255);
        b = clamp(Math.round(b * sMod), 0, 255);
      }

      const p = idx * 4;
      px[p] = r;
      px[p + 1] = g;
      px[p + 2] = b;
      px[p + 3] = 255;
    }
  }
  rctx.putImageData(img, 0, 0);

  const size = 320;
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(raw, 0, 0, size, size);

  // Subtle tactical grid lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  for (let k = 1; k <= 3; k++) {
    const pos = (size / 4) * k;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }

  // North arrow (top-right)
  ctx.fillStyle = "rgba(10, 15, 30, 0.72)";
  ctx.fillRect(size - 34, 8, 26, 20);
  ctx.fillStyle = "#F8FAFC";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N ↑", size - 21, 22);

  // Scale bar (bottom-left)
  const domainKm = product?.metadata?.domain_km || 40.08;
  const barKm = 10;
  const barPx = (barKm / domainKm) * size;
  ctx.fillStyle = "rgba(10, 15, 30, 0.72)";
  ctx.fillRect(8, size - 26, barPx + 14, 18);
  ctx.strokeStyle = "#F8FAFC";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(15, size - 14);
  ctx.lineTo(15 + barPx, size - 14);
  ctx.stroke();
  ctx.fillStyle = "#F8FAFC";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${barKm} km`, 15, size - 17);

  // Center landing coordinate marker (Red Pin on Optical, Red Crosshair on others)
  const cx = size / 2;
  const cy = size / 2;
  if (layer === "optical") {
    // Target halo
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();

    // Red teardrop map pin pointing at (cx, cy)
    ctx.fillStyle = "#EF4444";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cx - 12, cy - 14, cx - 12, cy - 28, cx, cy - 28);
    ctx.bezierCurveTo(cx + 12, cy - 28, cx + 12, cy - 14, cx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(cx, cy - 19, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Coordinate pill
    const latS = `${Math.abs(site.lat).toFixed(2)}°${site.lat < 0 ? "S" : "N"}`;
    const lonS = `${Math.abs(site.lon).toFixed(2)}°${site.lon < 0 ? (isEn ? "W" : "O") : "E"}`;
    const label = `${latS}, ${lonS}`;
    ctx.font = "bold 10px monospace";
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(cx - tw / 2, cy + 14, tw, 16);
    ctx.fillStyle = "#FCA5A5";
    ctx.textAlign = "center";
    ctx.fillText(label, cx, cy + 25);
  } else {
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#EF4444";
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return out.toDataURL("image/png");
}

function drawFooter(doc, pageNum, totalPages, isEn) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(210, 216, 226);
  doc.line(16, h - 14, w - 16, h - 14);
  doc.setTextColor(110, 120, 138);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    isEn
      ? "CLPS Lunar Mission Browser · Team Estelar 1 (FRC Team Paraguay) · NASA Space Apps 2026"
      : "CLPS Lunar Mission Browser · Equipo Estelar 1 (FRC Team Paraguay) · NASA Space Apps 2026",
    16,
    h - 8.5
  );
  doc.text(`${pageNum} / ${totalPages}`, w - 16, h - 8.5, { align: "right" });
}

function drawSwatch(doc, x, y, rgb, label, desc) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.roundedRect(x, y - 3.6, 5.5, 4.5, 1, 1, "F");
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x + 8, y);
  doc.setTextColor(75, 86, 104);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(desc, 152);
  doc.text(lines, x + 8, y + 4.5);
  return y + 6 + lines.length * 4.2;
}

/**
 * Generates a 2-page technical & didactic PDF for the Site Analysis page.
 */
export function exportSiteReportPdf({ site, product, metrics, verdict, summary, windowHours, startUtcLabel, hasHorizon = true }) {
  const isEn = getLang() === "en";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  // ================= PAGE 1: SITE & WINDOW ANALYSIS =================
  drawHeader(
    doc,
    isEn ? `Site Analysis Dossier — ${site.name}` : `Dossier de Análisis de Sitio — ${site.name}`,
    isEn
      ? `NASA LRO LOLA + JPL DE421 · Window: ${startUtcLabel} (${Math.round(windowHours / 24)} days)`
      : `NASA LRO LOLA + JPL DE421 · Ventana: ${startUtcLabel} (${Math.round(windowHours / 24)} días)`
  );

  let y = 38;
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(isEn ? "1. Mission Profile & Landing Coordinates" : "1. Perfil de Misión y Coordenadas", 16, y);
  y += 6;

  doc.setFillColor(244, 247, 252);
  doc.roundedRect(16, y, w - 32, 24, 2, 2, "F");
  doc.setFontSize(9);
  doc.setTextColor(40, 50, 68);
  const latStr = `${Math.abs(site.lat).toFixed(2)}°${site.lat < 0 ? "S" : "N"}`;
  const lonStr = `${Math.abs(site.lon).toFixed(2)}°${site.lon < 0 ? (isEn ? "W" : "O") : "E"}`;
  const metaSrc = hasHorizon ? (product?.metadata?.terrain_source || "LDEM_80S_20M_FLOAT") : (isEn ? "No local LOLA DEM" : "Sin DEM LOLA local");
  const elevM = hasHorizon ? (product?.metadata?.site_elevation_m ?? "—") : "N/A";

  doc.setFont("helvetica", "bold");
  doc.text(`${isEn ? "Provider / Lander" : "Proveedor / Módulo"}:`, 20, y + 7);
  doc.text(`${isEn ? "Region" : "Región"}:`, 20, y + 13.5);
  doc.text(`${isEn ? "Coordinates / Elev" : "Coordenadas / Elev"}:`, 20, y + 20);

  doc.setFont("helvetica", "normal");
  doc.text(`${site.provider || "Custom"} — ${site.lander || "CLPS"}`, 62, y + 7);
  doc.text(`${site.site || (isEn ? "Custom Coordinates" : "Coordenadas Personalizadas")}`, 62, y + 13.5);
  doc.text(`${latStr}, ${lonStr} · ${typeof elevM === "number" ? elevM.toFixed(0) : elevM} m (${metaSrc})`, 62, y + 20);
  y += 32;

  // KPI Grid
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(isEn ? "2. Solar & Earth Visibility Metrics" : "2. Métricas de Iluminación y Enlace Tierra", 16, y);
  y += 5;

  const sunlitFrac = (metrics.sunlitPct ?? 0) / 100;
  const earthFrac = (metrics.earthPct ?? 0) / 100;
  const bothFrac = (metrics.bothPct ?? 0) / 100;
  const maxDarkH = metrics.longestDarkH ?? 0;
  const maxNoEarthH = metrics.longestEarthOutageH ?? 0;

  const sunlitHrs = (sunlitFrac * windowHours).toFixed(1);
  const darkHrs = ((1 - sunlitFrac) * windowHours).toFixed(1);
  const earthHrs = (earthFrac * windowHours).toFixed(1);
  const kpis = hasHorizon
    ? [
        [isEn ? "Sunlit Time" : "Luz Solar", `${Math.round(sunlitFrac * 100)}% (${sunlitHrs} h)`, [234, 179, 8]],
        [isEn ? "Darkness Time" : "Horas en Sombra", `${Math.round((1 - sunlitFrac) * 100)}% (${darkHrs} h)`, [100, 116, 139]],
        [isEn ? "Earth Direct (DTE)" : "Visibilidad Tierra", `${Math.round(earthFrac * 100)}% (${earthHrs} h)`, [56, 189, 248]],
        [isEn ? "Sun + Earth Together" : "Sol y Tierra Juntos", `${Math.round(bothFrac * 100)}%`, [16, 185, 129]],
        [isEn ? "Max Dark Streak" : "Racha Oscura Máx.", `${maxDarkH.toFixed(1)} h`, [245, 158, 11]],
        [isEn ? "Max Radio Blackout" : "Apagón Radio Máx.", `${maxNoEarthH.toFixed(1)} h`, [239, 68, 68]],
      ]
    : [
        [isEn ? "Sunlit Time" : "Luz Solar", "N/A", [148, 163, 184]],
        [isEn ? "Darkness Time" : "Horas en Sombra", "N/A", [148, 163, 184]],
        [isEn ? "Earth Direct (DTE)" : "Visibilidad Tierra", "N/A", [148, 163, 184]],
        [isEn ? "Sun + Earth Together" : "Sol y Tierra Juntos", "N/A", [148, 163, 184]],
        [isEn ? "Max Dark Streak" : "Racha Oscura Máx.", "N/A", [148, 163, 184]],
        [isEn ? "Max Radio Blackout" : "Apagón Radio Máx.", "N/A", [148, 163, 184]],
      ];

  const colW = (w - 38) / 3;
  kpis.forEach(([lbl, val, rgb], idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const kx = 16 + col * (colW + 3);
    const ky = y + row * 19;
    doc.setFillColor(246, 248, 252);
    doc.setDrawColor(218, 224, 235);
    doc.roundedRect(kx, ky, colW, 16, 2, 2, "FD");
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(kx + 5, ky + 5.5, 1.8, "F");
    doc.setTextColor(85, 96, 114);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(lbl, kx + 9, ky + 6.3);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(val, kx + 5, ky + 13);
  });
  y += 44;

  // Viability Verdict
  const vRgb = !hasHorizon || verdict === "na"
    ? [100, 116, 139]
    : verdict === "green" ? [16, 185, 129] : verdict === "amber" ? [245, 158, 11] : [239, 68, 68];
  const vLabel = !hasHorizon || verdict === "na"
    ? "N/A"
    : verdict === "green" ? (isEn ? "VIABLE" : "VIABLE") : verdict === "amber" ? (isEn ? "MARGINAL" : "MARGINAL") : (isEn ? "CRITICAL" : "CRÍTICO");
  doc.setFillColor(244, 247, 252);
  doc.roundedRect(16, y, w - 32, 24, 2, 2, "F");
  doc.setFillColor(vRgb[0], vRgb[1], vRgb[2]);
  doc.roundedRect(20, y + 4.5, 22, 6, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(vLabel, 31, y + 8.7, { align: "center" });

  doc.setTextColor(20, 28, 46);
  doc.setFontSize(9.5);
  doc.text(isEn ? "Operational Assessment" : "Diagnóstico Operativo", 46, y + 8.7);
  doc.setTextColor(65, 76, 94);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const sumLines = doc.splitTextToSize(summary || "", w - 42);
  doc.text(sumLines, 20, y + 15.5);
  y += 32;

  // Chart Color Symbols Legend
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(isEn ? "3. Horizon & Timeline Color Legend" : "3. Simbología de Colores (Horizonte y Horas del Día)", 16, y);
  y += 7;
  y = drawSwatch(doc, 18, y, [250, 204, 21], isEn ? "Sun (Solar Power)" : "Sol (Energía Fotovoltaica)", isEn ? "Gold disc / yellow band: periods when the solar disc clears the 360° LOLA horizon." : "Disco dorado / banda amarilla: horas en que el Sol supera el horizonte real LOLA de 360°.");
  y = drawSwatch(doc, 18, y, [56, 189, 248], isEn ? "Earth (Direct-to-Earth Radio)" : "Tierra (Enlace Directo DTE)", isEn ? "Cyan disc / blue band: periods with unobstructed line-of-sight to Earth DSN antennas." : "Disco cian / banda azul: horas con línea de visión directa hacia las antenas DSN de la Tierra.");
  y = drawSwatch(doc, 18, y, [71, 85, 105], isEn ? "Lunar Shadow / Occultation" : "Sombra Lunar / Ocultación", isEn ? "Dark slate gaps: terrain blocks the Sun (battery discharge) or Earth (radio blackout)." : "Franjas gris oscuro: el relieve bloquea el Sol (consumo de batería) o la Tierra (apagón de radio).");

  const hasMaps = Boolean(product?.elevation_m?.length && product?.slope_deg?.length);
  const totalPages = hasMaps ? 3 : 2;

  drawFooter(doc, 1, totalPages, isEn);

  // ================= PAGE 2: 4-LAYER MAPS OF SELECTED LOCATION =================
  if (hasMaps) {
    doc.addPage();
    drawHeader(
      doc,
      isEn ? `Tactical 4-Layer Maps — ${site.name}` : `Mapas Tácticos de 4 Capas — ${site.name}`,
      isEn
        ? `40.08 × 40.08 km LOLA Grid (${product.metadata.grid_size}×${product.metadata.grid_size}, ${product.metadata.cell_size_m} m/cell) · Red pin = target landing site`
        : `Grilla LOLA 40.08 × 40.08 km (${product.metadata.grid_size}×${product.metadata.grid_size}, ${product.metadata.cell_size_m} m/celda) · Pin rojo = coordenada del sitio`
    );

    const maps = [
      {
        layer: "optical",
        title: isEn ? "OPT-01 // Optical Albedo & Solar Relief" : "OPT-01 // Albedo Óptico y Relieve Solar",
        caption: isEn ? "Red pin marks landing coordinates" : "Pin rojo indica la coordenada de aterrizaje",
      },
      {
        layer: "slope",
        title: isEn ? "SLP-02 // Slope Hazard (°)" : "SLP-02 // Peligro de Pendiente (°)",
        caption: isEn ? "Green < 8° · Amber 8°–15° · Red > 15°" : "Verde < 8° · Ámbar 8°–15° · Rojo > 15°",
      },
      {
        layer: "thermal",
        title: isEn ? "DIV-03 // Ice Cold Traps (< 110 K)" : "DIV-03 // Trampas de Hielo (< 110 K)",
        caption: isEn ? "Cyan < 110 K (H2O PSR) · Orange > 140 K" : "Cian < 110 K (Hielo PSR) · Naranja > 140 K",
      },
      {
        layer: "comms",
        title: isEn ? "DSN-04 // Earth Line-of-Sight" : "DSN-04 // Línea de Visión Tierra",
        caption: isEn ? "Green/Blue = DTE OK · Red = Occluded" : "Verde/Azul = Enlace OK · Rojo = Ocluido",
      },
    ];

    const cardW = 84;
    const imgSize = 78;
    const startX = 16;
    const gapX = 10;
    const startY = 36;
    const rowH = 100;

    maps.forEach((m, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const mx = startX + col * (cardW + gapX);
      const my = startY + row * rowH;

      doc.setFillColor(246, 248, 252);
      doc.setDrawColor(214, 222, 234);
      doc.roundedRect(mx, my, cardW, rowH - 5, 2, 2, "FD");

      doc.setTextColor(20, 28, 46);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(m.title, mx + 3, my + 5.5);

      const dataUrl = renderSiteLayerMapDataUrl(product, m.layer, site, isEn);
      doc.addImage(dataUrl, "PNG", mx + 3, my + 8, imgSize, imgSize);

      doc.setTextColor(75, 86, 104);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(m.caption, mx + 3, my + rowH - 8);
    });

    // Terrain stats box at bottom of Page 2
    const eMin = Math.min(...product.elevation_m).toFixed(0);
    const eMax = Math.max(...product.elevation_m).toFixed(0);
    const sMax = Math.max(...product.slope_deg).toFixed(1);
    const statY = startY + 2 * rowH + 2;
    doc.setFillColor(244, 247, 252);
    doc.roundedRect(16, statY, w - 32, 18, 2, 2, "F");
    doc.setTextColor(20, 28, 46);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(isEn ? "Site 40×40 km LOLA Terrain Summary:" : "Resumen Topográfico LOLA 40×40 km del Sitio:", 20, statY + 6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(65, 76, 94);
    doc.text(
      isEn
        ? `Elevation: ${eMin} m to ${eMax} m  |  Max Slope: ${sMax}°  |  Grid: ${product.metadata.grid_size}×${product.metadata.grid_size} (${product.metadata.cell_size_m} m/cell)`
        : `Elevación: ${eMin} m a ${eMax} m  |  Pendiente Máx.: ${sMax}°  |  Grilla: ${product.metadata.grid_size}×${product.metadata.grid_size} (${product.metadata.cell_size_m} m/celda)`,
      20,
      statY + 13
    );

    drawFooter(doc, 2, totalPages, isEn);
  }

  // ================= LAST PAGE: DIDACTIC PATHFINDER MAPS GUIDE =================
  doc.addPage();
  drawHeader(
    doc,
    isEn ? "Pathfinder 3D Maps & Color Guide" : "Guía Didáctica de Mapas 3D en Pathfinder",
    isEn ? `${site.name} · 40.08 × 40.08 km LOLA Tactical Grid (240 m/cell)` : `${site.name} · Grilla Táctica LOLA 40.08 × 40.08 km (240 m/celda)`
  );

  y = 38;
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    isEn ? "4. What Each Layer & Color Means in Pathfinder" : "4. Qué Significa Cada Capa y Color en Pathfinder",
    16,
    y
  );
  y += 6;
  doc.setTextColor(75, 86, 104);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    isEn
      ? "Pathfinder renders 4 NASA scientific layers over the real 1:1 3D terrain:"
      : "Pathfinder proyecta 4 capas científicas sobre el terreno real 3D en escala 1:1:",
    16,
    y
  );
  y += 9;

  // Layer 1: OPT-01
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("OPT-01 // " + (isEn ? "Optical / ShadowCam Albedo" : "Óptico / Albedo ShadowCam"), 16, y);
  y += 6;
  y = drawSwatch(doc, 18, y, [226, 232, 240], isEn ? "Light Gray / White" : "Gris Claro / Blanco", isEn ? "Regolith directly lit by grazing sunlight (1.6° solar elevation)." : "Regolito iluminado directamente por el Sol rasante (1.6° de elevación).");
  y = drawSwatch(doc, 18, y, [15, 23, 42], isEn ? "Deep Black" : "Negro Profundo", isEn ? "Cast shadow or Permanently Shadowed Region (PSR) blocked by crater rims." : "Sombra proyectada o Región Permanentemente Sombreada (PSR) bloqueada por bordes de cráter.");
  y += 3;

  // Layer 2: SLP-02
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("SLP-02 // " + (isEn ? "LOLA Slope Hazard (°)" : "Peligro de Pendiente LOLA (°)"), 16, y);
  y += 6;
  y = drawSwatch(doc, 18, y, [16, 185, 129], isEn ? "Green / Cyan (< 10°)" : "Verde / Cian (< 10°)", isEn ? "Safe traversable terrain with low Bekker-Wong rover slip." : "Terreno seguro y transitable con bajo deslizamiento del rover.");
  y = drawSwatch(doc, 18, y, [245, 158, 11], isEn ? "Amber / Orange (10°–15°)" : "Ámbar / Naranja (10°–15°)", isEn ? "Moderate slope caution: higher battery draw and wheel torque." : "Precaución por pendiente moderada: mayor consumo de batería y torque.");
  y = drawSwatch(doc, 18, y, [239, 68, 68], isEn ? "Red (> 15°)" : "Rojo (> 15°)", isEn ? "Steep crater wall hazard: exceeds safe rover tilt limit (avoided by A*)." : "Peligro de pared escarpada: supera el límite seguro de inclinación (evitado por A*).");
  y += 3;

  // Layer 3: DIV-03
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DIV-03 // " + (isEn ? "Diviner Temperature & Water Ice (< 110 K)" : "Temperatura Diviner y Hielo (< 110 K)"), 16, y);
  y += 6;
  y = drawSwatch(doc, 18, y, [56, 189, 248], isEn ? "Cryo Cyan / Blue (< 110 K)" : "Cian / Azul Criogénico (< 110 K)", isEn ? "Cold trap below water-ice sublimation threshold; potential volatile H2O deposits." : "Trampa fría bajo el umbral de sublimación del hielo; posible depósito de H2O volátil.");
  y = drawSwatch(doc, 18, y, [249, 115, 22], isEn ? "Warm Orange / Red (> 140 K)" : "Naranja / Rojo (> 140 K)", isEn ? "Sunlit thermal zone where surface water ice sublimates rapidly." : "Zona térmica iluminada donde el hielo superficial se sublima rápidamente.");
  y += 3;

  // Layer 4: DSN-04
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DSN-04 // " + (isEn ? "Earth Direct-to-Earth Line-of-Sight" : "Línea de Visión Tierra (DSN)"), 16, y);
  y += 6;
  y = drawSwatch(doc, 18, y, [34, 197, 94], isEn ? "Bright Green / Teal" : "Verde Brillante", isEn ? "Unobstructed radio link to Earth Deep Space Network antennas." : "Enlace de radio directo sin obstáculos hacia las antenas DSN de la Tierra.");
  y = drawSwatch(doc, 18, y, [100, 116, 139], isEn ? "Dark Gray / Occluded" : "Gris Oscuro / Ocluido", isEn ? "Terrain blocks Earth view; rover relies on onboard memory or relay." : "El relieve bloquea la Tierra; el rover requiere memoria local o satélite repetidor.");

  drawFooter(doc, totalPages, totalPages, isEn);
  doc.save(`${site.id}_Analisis_Sitio_Estelar1.pdf`);
}

/**
 * Generates an APA 7th-edition formatted Bibliography & Methodology PDF.
 */
export function exportBibliographyPdf() {
  const isEn = getLang() === "en";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 22;
  const maxW = w - margin * 2;

  drawHeader(
    doc,
    isEn ? "Scientific Bibliography & Data Sources (APA 7th Ed.)" : "Bibliografía Científica y Fuentes NASA (Norma APA)",
    isEn
      ? "CLPS Lunar Mission Browser · Team Estelar 1 · NASA International Space Apps Challenge 2026"
      : "CLPS Lunar Mission Browser · Equipo Estelar 1 · NASA International Space Apps Challenge 2026"
  );

  let y = 40;
  doc.setTextColor(20, 28, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(isEn ? "References (APA 7th Edition Format)" : "Referencias Bibliográficas (Formato APA 7.ª Edición)", margin, y);
  y += 6;

  doc.setTextColor(75, 86, 104);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const intro = doc.splitTextToSize(
    isEn
      ? "All lunar terrain models, planetary ephemerides, orbital validations, and space-weather telemetry used in this application derive from official NASA and JPL public archives:"
      : "Todos los modelos digitales de elevación lunar, efemérides planetarias, validaciones orbitales y telemetría de clima espacial utilizados en esta aplicación provienen de archivos oficiales públicos de la NASA y JPL:",
    maxW
  );
  doc.text(intro, margin, y);
  y += intro.length * 4.5 + 5;

  const refs = [
    "Acton, C. H. (1996). Ancillary data services of NASA's Navigation and Ancillary Information Facility (NAIF): Planetary ephemeris DE421 (de421.bsp) and lunar orientation kernel (moon_pa_de421_1900-2050.bpc). NASA Jet Propulsion Laboratory. https://naif.jpl.nasa.gov/pub/naif/generic_kernels/",
    "Giorgini, J. D., Yeomans, D. K., Chamberlin, A. B., Chodas, P. W., Jacobson, R. A., Keesey, M. S., Lieske, J. H., Ostro, S. J., Standish, E. M., & Wimberly, R. N. (1996). JPL's on-line solar system data service (JPL Horizons System). NASA Jet Propulsion Laboratory. https://ssd.jpl.nasa.gov/horizons/",
    "NASA Community Coordinated Modeling Center (CCMC). (2026). Space Weather Database Of Notifications, Knowledge, Information (DONKI) — Solar Energetic Particle (SEP) API. NASA Goddard Space Flight Center. https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
    "NASA Jet Propulsion Laboratory & Solar System Treks Team. (2025). Moon Trek: LRO WAC and LROC NAC lunar polar basemap tiles. NASA. https://trek.nasa.gov/moon/",
    "NASA Science Mission Directorate. (2026). Commercial Lunar Payload Services (CLPS) & Artemis Program landing site documentation. National Aeronautics and Space Administration. https://www.nasa.gov/commercial-lunar-payload-services/",
    "Paige, D. A., Siegler, M. A., Zhang, J. A., Hayne, P. O., Foote, E. J., Bennett, K. A., Vasavada, A. R., Greenhagen, B. T., Schofield, J. T., McCleese, D. J., Foote, M. C., DeJong, E., Bills, B. G., Hartford, W., Murray, B. C., Allen, C. C., Snook, K., Soderblom, L. A., Calcutt, S., ... & Bowles, N. E. (2010). Diviner Lunar Radiometer observations of cold traps in the Moon's south polar region. Science, 330(6003), 479-482. https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
    "Smith, D. E., Zuber, M. T., Neumann, G. A., Lemoine, F. G., Mazarico, E., Torrence, M. H., McGarry, J. F., Rowlands, D. D., Head, J. W., Duxbury, T. C., Aharonson, O., Lucey, P. G., Robinson, M. S., Barnouin, O. S., Cavanaugh, J. F., Sun, X., Liiva, P., Mao, D., Smith, J. C., & Bartels, A. E. (2010). Initial observations from the Lunar Orbiter Laser Altimeter (LOLA): Polar stereographic DEM (LDEM_80S_20M_FLOAT) and global DEM (LDEM_128_FLOAT). NASA PDS Geosciences Node, Washington University in St. Louis. https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
  ];

  doc.setFontSize(9);
  refs.forEach((ref) => {
    const lines = doc.splitTextToSize(ref, maxW - 6);
    if (y + lines.length * 4.4 > 272) {
      drawFooter(doc, 1, 2, isEn);
      doc.addPage();
      drawHeader(
        doc,
        isEn ? "Scientific Bibliography & Validation (cont.)" : "Bibliografía Científica y Validación (cont.)",
        "Estelar 1 · NASA Space Apps Challenge 2026"
      );
      y = 38;
    }
    doc.setTextColor(25, 34, 52);
    doc.text(lines[0], margin, y);
    if (lines.length > 1) {
      doc.setTextColor(55, 65, 84);
      doc.text(lines.slice(1), margin + 6, y + 4.4);
    }
    y += lines.length * 4.4 + 4;
  });

  // Validation Summary Box
  y += 3;
  doc.setFillColor(244, 247, 252);
  doc.setDrawColor(210, 218, 232);
  doc.roundedRect(margin, y, maxW, 24, 2, 2, "FD");
  doc.setTextColor(16, 130, 85);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(
    isEn ? "Orbital Cross-Validation Result: < 0.006° vs. JPL Horizons" : "Validación Cruzada Orbital: < 0.006° vs. NASA JPL Horizons",
    margin + 5,
    y + 7
  );
  doc.setTextColor(65, 76, 94);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const valNote = doc.splitTextToSize(
    isEn
      ? "Topographic horizons are computed across 360° azimuths out to 30 km on 40.08 × 40.08 km LOLA windows (240 m/cell) including lunar spherical curvature (R = 1737.4 km), ±7° libration, and light-time correction."
      : "Los horizontes topográficos se calculan en 360° de acimut hasta 30 km sobre ventanas LOLA de 40.08 × 40.08 km (240 m/celda) incluyendo curvatura esférica lunar (R = 1737.4 km), libración ±7° y corrección por tiempo de luz.",
    maxW - 10
  );
  doc.text(valNote, margin + 5, y + 13);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, isEn);
  }

  doc.save("Estelar1_Bibliografia_NASA_APA.pdf");
}
