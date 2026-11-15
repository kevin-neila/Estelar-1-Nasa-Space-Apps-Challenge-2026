/** Canvas drawing helpers for the sky panorama, sky dome and timeline. Plain 2D canvas, no dependencies. */
import { horizonAt } from "../core/geometry.js";
import { t, isEn } from "./i18n.js";
const CARD = isEn ? {} : { SW: "SO", W: "O", NW: "NO" };
const card = (l) => CARD[l] || l;

const C = {
  bg: "#0a1233", line: "#d3e8f6", muted: "#9fbdd3", chalk: "#f5f1e3", wax: "#f0c94a",
  earth: "#6fb8ff", ground: "#1a2547", edge: "rgba(211,232,246,0.28)", ok: "#a4e3bf", alert: "#ff8a6b"
};

function setup(canvas, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.parentElement.clientWidth;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "11px 'Courier Prime', monospace";
  return { ctx, w, h: cssH };
}

function disc(ctx, x, y, r, fill, glow) {
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 18; }
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * 360-degree horizon panorama: azimuth on X (N-E-S-W-N), elevation on Y.
 * Discs are drawn at a minimum readable size (the real Sun is only ~0.5 deg wide).
 */
export function drawPanorama(canvas, { horizon, sky, trail, labelFlat }) {
  const { ctx, w, h } = setup(canvas, 300);
  const padL = 40, padR = 12, padT = 14, padB = 26;
  const pw = w - padL - padR, ph = h - padT - padB;
  const eMin = -6;
  const eMax = Math.max(24, Math.ceil((Math.max(sky.sun.el, sky.earth.el, 0) + 6) / 6) * 6);
  const X = (az) => padL + (((az % 360) + 360) % 360 / 360) * pw;
  const Y = (el) => padT + (1 - (el - eMin) / (eMax - eMin)) * ph;

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, padT, 0, Y(0));
  g.addColorStop(0, "#050a1f"); g.addColorStop(1, "#14225e");
  ctx.fillStyle = g; ctx.fillRect(padL, padT, pw, Y(0) - padT);

  // grid
  ctx.strokeStyle = C.edge; ctx.lineWidth = 0.5; ctx.fillStyle = C.muted; ctx.textAlign = "right";
  for (let e = 0; e <= eMax; e += 6) {
    ctx.beginPath(); ctx.moveTo(padL, Y(e)); ctx.lineTo(w - padR, Y(e)); ctx.stroke();
    ctx.fillText(`${e}°`, padL - 5, Y(e) + 4);
  }
  ctx.textAlign = "center";
  [["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315], ["N", 360]].forEach(([l, a]) => {
    const x = padL + (a / 360) * pw;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
    ctx.fillText(`${card(l)} ${a % 360 === 0 && a ? "" : a}°`.trim(), x, h - 8);
  });

  // trail (position over the next hours)
  if (trail) {
    for (const [key, col] of [["sun", C.wax], ["earth", C.earth]]) {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath();
      let prev = null;
      trail[key].forEach((p) => {
        const x = X(p.az), y = Y(p.el);
        if (prev === null || Math.abs(x - prev) > pw / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        prev = x;
      });
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  // terrain silhouette (real LOLA horizon) or flat horizon
  ctx.beginPath();
  ctx.moveTo(padL, Y(eMin));
  for (let a = 0; a <= 360; a += 1) ctx.lineTo(padL + (a / 360) * pw, Y(Math.max(eMin, horizonAt(horizon, a))));
  ctx.lineTo(padL + pw, Y(eMin)); ctx.closePath();
  ctx.fillStyle = C.ground; ctx.fill();
  ctx.strokeStyle = "#7f98ad"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = C.muted; ctx.textAlign = "left";
  ctx.fillText(labelFlat ? t("horizonte plano (sin datos de terreno para el punto personalizado)") : t("horizonte del terreno según NASA LOLA"), padL + 6, Y(eMin) - 6);

  // bodies
  const body = (b, fill, glow, r, name) => {
    const x = X(b.az), y = Y(b.el);
    disc(ctx, x, y, r, fill, glow);
    ctx.fillStyle = C.chalk; ctx.textAlign = "center";
    ctx.fillText(`${name} ${b.el.toFixed(1)}°`, Math.min(w - 70, Math.max(70, x)), y - r - 7);
  };
  body(sky.earth, "#5aa7f0", "#6fb8ff", 8, t("Tierra"));
  body(sky.sun, "#ffe9a6", "#f0c94a", 10, t("Sol"));
  ctx.fillStyle = C.muted; ctx.textAlign = "right";
  ctx.fillText(t("discos ampliados para visibilidad"), w - padR, padT + 10);
}

/** Polar sky dome: centre = zenith, rim = horizon, North up. */
export function drawDome(canvas, { horizon, sky }) {
  const size = Math.min(canvas.parentElement.clientWidth, 320);
  canvas.style.width = `${size}px`;
  const { ctx, w, h } = setup(canvas, size);
  const cx = w / 2, cy = h / 2, R = w / 2 - 18;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  const P = (az, el) => {
    const r = R * (90 - Math.max(el, -5)) / 90, a = (az * Math.PI) / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  };
  ctx.fillStyle = "#080f2b"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.edge; ctx.lineWidth = 0.6;
  [0, 30, 60].forEach((e) => { ctx.beginPath(); ctx.arc(cx, cy, (R * (90 - e)) / 90, 0, Math.PI * 2); ctx.stroke(); });
  for (let a = 0; a < 360; a += 45) { const [x, y] = P(a, 0); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
  ctx.fillStyle = C.muted; ctx.textAlign = "center";
  [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(([l, a]) => { const [x, y] = P(a, -12); ctx.fillText(card(l), x, y + 4); });
  // terrain ring
  ctx.beginPath();
  for (let a = 0; a <= 360; a += 2) { const [x, y] = P(a, Math.max(0, horizonAt(horizon, a))); a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath();
  ctx.fillStyle = "rgba(60,80,100,0.0)";
  ctx.strokeStyle = "#7f98ad"; ctx.lineWidth = 1.4; ctx.stroke();
  // shade terrain-blocked sky
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  for (let a = 360; a >= 0; a -= 2) { const [x, y] = P(a, Math.max(0, horizonAt(horizon, a))); a === 360 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.fillStyle = "rgba(127,152,173,0.22)"; ctx.fill("evenodd");
  ctx.restore();
  const [sx, sy] = P(sky.sun.az, sky.sun.el), [ex, ey] = P(sky.earth.az, sky.earth.el);
  disc(ctx, ex, ey, 6, "#5aa7f0", "#6fb8ff");
  disc(ctx, sx, sy, 8, "#ffe9a6", "#f0c94a");
  ctx.fillStyle = C.muted; ctx.textAlign = "left";
  ctx.fillText(t("cenit al centro"), 6, h - 6);
}

/**
 * Timeline: Sun & Earth elevation over the window, terrain horizon in the Sun's direction,
 * lanes for "Sun up" / "Earth up", and a cursor. onSeek(index) is called on click/drag.
 */
export function drawTimeline(canvas, S, cursorIdx, { onSeek, title } = {}) {
  const { ctx, w, h } = setup(canvas, 250);
  const padL = 40, padR = 12, padT = 12, lane = 12, padB = 24 + lane * 2 + 6;
  const pw = w - padL - padR, ph = h - padT - padB;
  let eMax = 10, eMin = -10;
  for (let i = 0; i < S.n; i += 3) { eMax = Math.max(eMax, S.sunEl[i], S.earthEl[i]); eMin = Math.min(eMin, S.sunEl[i], S.earthEl[i]); }
  eMax = Math.ceil((eMax + 2) / 5) * 5; eMin = Math.max(-40, Math.floor((eMin - 2) / 5) * 5);
  const X = (i) => padL + (i / (S.n - 1)) * pw;
  const Y = (e) => padT + (1 - (e - eMin) / (eMax - eMin)) * ph;

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = C.edge; ctx.lineWidth = 0.5; ctx.fillStyle = C.muted; ctx.textAlign = "right";
  const stepE = (eMax - eMin) > 60 ? 20 : (eMax - eMin) > 30 ? 10 : 5;
  for (let e = Math.ceil(eMin / stepE) * stepE; e <= eMax; e += stepE) {
    ctx.beginPath(); ctx.moveTo(padL, Y(e)); ctx.lineTo(w - padR, Y(e)); ctx.stroke();
    ctx.fillText(`${e}°`, padL - 5, Y(e) + 4);
  }
  ctx.strokeStyle = "#7f98ad"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();

  const line = (arr, col, width = 1.6, dash = []) => {
    ctx.strokeStyle = col; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
    for (let i = 0; i < S.n; i++) i ? ctx.lineTo(X(i), Y(arr[i])) : ctx.moveTo(X(i), Y(arr[i]));
    ctx.stroke(); ctx.setLineDash([]);
  };
  line(S.sunHz, "#7f98ad", 1, [4, 3]);
  line(S.sunEl, C.wax);
  line(S.earthEl, C.earth);

  // lanes
  const lanes = [[t("Sol sobre el horizonte"), S.sunUp, C.wax], [t("Tierra sobre el horizonte"), S.earthUp, C.earth]];
  lanes.forEach(([label, flags, col], k) => {
    const y = h - padB + 22 + k * (lane + 2);
    ctx.fillStyle = "rgba(211,232,246,0.08)"; ctx.fillRect(padL, y, pw, lane);
    ctx.fillStyle = col; ctx.globalAlpha = 0.85;
    let i0 = -1;
    for (let i = 0; i <= S.n; i++) {
      const up = i < S.n && flags[i] === 1;
      if (up && i0 < 0) i0 = i;
      if (!up && i0 >= 0) { ctx.fillRect(X(i0), y, Math.max(1, X(i) - X(i0)), lane); i0 = -1; }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.fillText(label, padL + 4, y + lane - 2);
  });

  // x axis in days
  ctx.fillStyle = C.muted; ctx.textAlign = "center";
  const days = (S.n * S.stepMs) / 86400000;
  const tick = days <= 3 ? 0.5 : days <= 8 ? 1 : days <= 16 ? 2 : 5;
  for (let d = 0; d <= days; d += tick) {
    const x = padL + (d / days) * pw;
    ctx.strokeStyle = C.edge; ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
    ctx.fillText(`${+d.toFixed(1)}${isEn ? "d" : "d"}`, x, padT + ph + 13);
  }
  // legend
  ctx.textAlign = "left";
  [[t("Elevación solar"), C.wax], [t("Elevación terrestre"), C.earth], [t("horizonte del terreno hacia el Sol"), "#7f98ad"]].reduce((x, [t, c]) => {
    ctx.fillStyle = c; ctx.fillRect(x, padT + 4, 12, 3); ctx.fillStyle = C.muted; ctx.fillText(t, x + 16, padT + 9);
    return x + 24 + t.length * 6.6;
  }, padL + 6);

  // cursor
  if (cursorIdx !== null && cursorIdx !== undefined) {
    const x = X(cursorIdx);
    ctx.strokeStyle = C.chalk; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB + 22 + 2 * (lane + 2)); ctx.stroke();
  }

  if (onSeek && !canvas._wired) {
    canvas._wired = true;
    const seek = (e) => {
      const r = canvas.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left - padL) / pw));
      canvas._onSeek(Math.round(f * (canvas._n - 1)));
    };
    let drag = false;
    canvas.addEventListener("pointerdown", (e) => { drag = true; canvas.setPointerCapture(e.pointerId); seek(e); });
    canvas.addEventListener("pointermove", (e) => { if (drag) seek(e); });
    canvas.addEventListener("pointerup", () => { drag = false; });
  }
  canvas._onSeek = onSeek; canvas._n = S.n;
}

