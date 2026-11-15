import { t } from "./ui/i18n.js";
/**
 * High-DPI Tactical Oscilloscope Elevation (m) & Diviner Surface Temperature (K) Profile Chart
 */

export class TraverseProfileChart {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.waypoints = [];
    this.roverProgress = 0;

    window.addEventListener("resize", () => this.draw());
  }

  setWaypoints(waypoints) {
    this.waypoints = waypoints || [];
    this.draw();
  }

  setRoverProgress(progress) {
    this.roverProgress = progress;
    this.draw();
  }

  draw() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(300, rect.width);
    const h = Math.max(105, rect.height);

    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Warm Obsidian Oscilloscope Background
    ctx.fillStyle = "#0b0a08";
    ctx.fillRect(0, 0, w, h);

    const padL = 48;
    const padR = 46;
    const padT = 16;
    const padB = 20;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    if (!this.waypoints || this.waypoints.length < 2) {
      ctx.restore();
      return;
    }

    let minElev = Infinity;
    let maxElev = -Infinity;
    for (const wp of this.waypoints) {
      if (wp.elevM < minElev) minElev = wp.elevM;
      if (wp.elevM > maxElev) maxElev = wp.elevM;
    }
    const elevSpan = Math.max(200, maxElev - minElev);
    minElev -= elevSpan * 0.1;
    maxElev += elevSpan * 0.1;

    const minTemp = 30;
    const maxTemp = 230;

    // Technical Oscilloscope Grid Lines
    ctx.strokeStyle = "rgba(158, 154, 144, 0.16)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) {
      const y = padT + (plotH * g) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();

      const elevVal = Math.round(maxElev - ((maxElev - minElev) * g) / 3);
      ctx.fillStyle = "#b8ff01";
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${elevVal}m`, padL - 6, y + 3);

      const tempVal = Math.round(maxTemp - ((maxTemp - minTemp) * g) / 3);
      ctx.fillStyle = "#ff5500";
      ctx.textAlign = "left";
      ctx.fillText(`${tempVal}K`, padL + plotW + 6, y + 3);
    }

    // 110K Water-Ice Cryogenic Stability Threshold Line
    const y110K = padT + plotH * (1 - (110 - minTemp) / (maxTemp - minTemp));
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(142, 166, 255, 0.55)";
    ctx.beginPath();
    ctx.moveTo(padL, y110K);
    ctx.lineTo(padL + plotW, y110K);
    ctx.stroke();
    ctx.fillStyle = "#8ea6ff";
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(t("LÍMITE DE SUBLIMACIÓN DEL HIELO H₂O (110K)"), padL + 6, y110K - 4);
    ctx.restore();

    const n = this.waypoints.length;

    // 1. LRO LOLA Elevation Area & Line (Phosphor Green #B8FF01)
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = padL + (plotW * k) / (n - 1);
      const y = padT + plotH * (1 - (this.waypoints[k].elevM - minElev) / (maxElev - minElev));
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#b8ff01";
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.lineTo(padL, padT + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, "rgba(184, 255, 1, 0.24)");
    grad.addColorStop(1, "rgba(184, 255, 1, 0.01)");
    ctx.fillStyle = grad;
    ctx.fill();

    // 2. LRO Diviner Temperature Curve (Kapton Orange #FF5500)
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = padL + (plotW * k) / (n - 1);
      const y = padT + plotH * (1 - (this.waypoints[k].tempK - minTemp) / (maxTemp - minTemp));
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#ff5500";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 3. Active Rover Position Reticle
    const rX = padL + plotW * this.roverProgress;
    ctx.strokeStyle = "#f2efe9";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(rX, padT);
    ctx.lineTo(rX, padT + plotH);
    ctx.stroke();

    const wpIdx = Math.min(n - 1, Math.floor(this.roverProgress * n));
    const rWp = this.waypoints[wpIdx];
    const rY = padT + plotH * (1 - (rWp.elevM - minElev) / (maxElev - minElev));
    ctx.fillStyle = "#f2efe9";
    ctx.fillRect(rX - 3.5, rY - 3.5, 7, 7);

    // Bottom X-axis distance labels
    const totalKm = this.waypoints[n - 1].distKm;
    ctx.fillStyle = "#9e9a90";
    ctx.font = "9.5px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("0.00 KM [HLS-A]", padL, h - 4);
    ctx.textAlign = "center";
    ctx.fillText(`${(totalKm * 0.5).toFixed(2)} KM`, padL + plotW * 0.5, h - 4);
    ctx.textAlign = "right";
    ctx.fillText(`${totalKm.toFixed(2)} KM [PSR-B]`, padL + plotW, h - 4);

    ctx.restore();
  }
}
