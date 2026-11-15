import { t } from "./i18n.js";
import { renderNav } from "./common.js";

renderNav("aprender.html");

const slider = document.getElementById("slider-elev");
const lbl = document.getElementById("lbl-sun-elev");
const canvas = document.getElementById("cv-shadow-demo");

function drawDemo() {
  if (!canvas || !slider) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 800;
  const h = 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const elevDeg = parseFloat(slider.value);
  if (lbl) {
    lbl.textContent = `${elevDeg.toFixed(1)}° ${elevDeg < 3 ? "(Polo Sur Lunar)" : elevDeg > 35 ? "(Mediodía Ecuatorial)" : ""}`;
  }

  // Background
  ctx.fillStyle = "#030712";
  ctx.fillRect(0, 0, w, h);

  // Synthetic crater profile: 2 rims and bowl floor
  const points = [];
  const n = 200;
  const cx = w / 2;
  const radius = w * 0.28;
  const depth = 75;
  const rimHeight = 24;

  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const dist = Math.abs(x - cx);
    let y = 120;
    if (dist < radius) {
      const u = dist / radius;
      y = 120 + depth * (1 - u * u);
    } else if (dist < radius * 1.5) {
      const u = (dist - radius) / (radius * 0.5);
      y = 120 - rimHeight * (1 - u * u);
    }
    points.push({ x, y });
  }

  // Sunlight comes from left at angle theta = elevDeg
  const rad = (elevDeg * Math.PI) / 180;
  const tan = Math.tan(rad);

  const isShadowed = new Uint8Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    let blocked = false;
    for (let k = 0; k < i; k++) {
      const prev = points[k];
      const rayY = prev.y - (pt.x - prev.x) * tan;
      if (rayY < pt.y) {
        blocked = true;
        break;
      }
    }
    if (blocked) isShadowed[i] = 1;
  }

  // Sunlight beam volume
  ctx.fillStyle = "rgba(142, 166, 255, 0.08)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, 120);
  for (let i = points.length - 1; i >= 0; i--) {
    if (!isShadowed[i]) ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();

  // Draw terrain
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = "#0c1524";
  ctx.fill();
  ctx.strokeStyle = "#3a56dd";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Shadow overlay
  ctx.fillStyle = "rgba(3, 7, 18, 0.85)";
  ctx.beginPath();
  let inShadow = false;
  for (let i = 0; i < points.length; i++) {
    if (isShadowed[i]) {
      if (!inShadow) {
        ctx.moveTo(points[i].x, points[i].y);
        inShadow = true;
      } else {
        ctx.lineTo(points[i].x, points[i].y);
      }
    } else if (inShadow) {
      ctx.lineTo(points[i - 1].x, h);
      ctx.lineTo(points[0].x, h);
      inShadow = false;
    }
  }
  if (inShadow) {
    ctx.lineTo(w, h);
    ctx.lineTo(points[0].x, h);
  }
  ctx.closePath();
  ctx.fill();

  // Highlight sunlit crest in electric blue / gold
  ctx.strokeStyle = "#8ea6ff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let drawingLit = false;
  for (let i = 0; i < points.length; i++) {
    if (!isShadowed[i]) {
      if (!drawingLit) {
        ctx.moveTo(points[i].x, points[i].y);
        drawingLit = true;
      } else {
        ctx.lineTo(points[i].x, points[i].y);
      }
    } else {
      drawingLit = false;
    }
  }
  ctx.stroke();

  // Annotations
  ctx.font = "12px 'Poppins', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(t(`Incidencia Solar: ${elevDeg.toFixed(1)}°`), 16, 24);

  // Shadow extent % on crater floor
  const floorPoints = points.slice(Math.floor(n * 0.3), Math.floor(n * 0.7));
  const floorShadowCount = floorPoints.filter((_, idx) => isShadowed[Math.floor(n * 0.3) + idx]).length;
  const pct = ((floorShadowCount / floorPoints.length) * 100).toFixed(0);

  ctx.fillStyle = pct > 50 ? "#ef4444" : "#10b981";
  ctx.fillText(t(`Fondo del Cráter en Sombra Total: ${pct}%`), 16, 44);
}

if (slider) slider.addEventListener("input", drawDemo);
const btnPole = document.getElementById("btn-demo-preset-pole");
if (btnPole) {
  btnPole.addEventListener("click", () => {
    slider.value = 1.5;
    drawDemo();
  });
}
const btnEquator = document.getElementById("btn-demo-preset-equator");
if (btnEquator) {
  btnEquator.addEventListener("click", () => {
    slider.value = 45;
    drawDemo();
  });
}

window.addEventListener("resize", drawDemo);
drawDemo();
