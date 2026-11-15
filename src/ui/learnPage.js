import { renderNav } from "./common.js";

renderNav("learn.html");

const slider = document.getElementById("slider-elev");
const lbl = document.getElementById("lbl-sun-elev");
const canvas = document.getElementById("cv-shadow-demo");

function drawDemo() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 800;
  const h = 200;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const elevDeg = parseFloat(slider.value);
  lbl.textContent = `${elevDeg.toFixed(1)}° ${elevDeg < 3 ? "(Lunar South Pole)" : elevDeg > 35 ? "(Equatorial Noon)" : ""}`;

  ctx.fillStyle = "#061a2e";
  ctx.fillRect(0, 0, w, h);

  // Define a synthetic crater profile: 2 rims and a flat/bowl floor
  const points = [];
  const n = 200;
  const cx = w / 2;
  const radius = w * 0.28;
  const depth = 70;
  const rimHeight = 22;

  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const dist = Math.abs(x - cx);
    let y = 110;
    if (dist < radius) {
      const u = dist / radius;
      y = 110 + depth * (1 - u * u);
    } else if (dist < radius * 1.5) {
      const u = (dist - radius) / (radius * 0.5);
      y = 110 - rimHeight * (1 - u * u);
    }
    points.push({ x, y });
  }

  // Calculate shadow line: sunlight comes from the left at angle theta = elevDeg
  const rad = (elevDeg * Math.PI) / 180;
  const tan = Math.tan(rad);

  // Cast ray from each terrain peak towards right (downwards with slope = tan)
  const isShadowed = new Uint8Array(points.length);
  let maxObstacleHeight = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    // Any point to the left whose ray (y_left - (x - x_left)*tan) is above pt.y blocks pt
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

  // Draw sunlight volume
  ctx.fillStyle = "rgba(240, 201, 74, 0.08)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, 110);
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
  ctx.fillStyle = "#1b2a38";
  ctx.fill();
  ctx.strokeStyle = "#7f98ad";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Overlay shadow on terrain
  ctx.fillStyle = "rgba(5, 15, 30, 0.75)";
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

  // Highlight sunlit terrain rim in gold
  ctx.strokeStyle = "#f0c94a";
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
  ctx.font = "11px 'Courier Prime', monospace";
  ctx.fillStyle = "#f5f1e3";
  ctx.fillText(`Sun Ray Elevation: ${elevDeg.toFixed(1)}°`, 14, 20);

  // Shadow extent percentage on crater floor
  const floorPoints = points.slice(Math.floor(n * 0.3), Math.floor(n * 0.7));
  const floorShadowCount = floorPoints.filter((_, idx) => isShadowed[Math.floor(n * 0.3) + idx]).length;
  const pct = ((floorShadowCount / floorPoints.length) * 100).toFixed(0);

  ctx.fillStyle = pct > 50 ? "#ff8a6b" : "#a4e3bf";
  ctx.fillText(`Crater Floor in Deep Shadow: ${pct}%`, 14, 38);
}

slider.addEventListener("input", drawDemo);
document.getElementById("btn-demo-preset-pole").addEventListener("click", () => {
  slider.value = 1.5;
  drawDemo();
});
document.getElementById("btn-demo-preset-equator").addEventListener("click", () => {
  slider.value = 45;
  drawDemo();
});

window.addEventListener("resize", drawDemo);
drawDemo();
