import { I18N } from "./i18n.js";
import { computeDynamicShadowMask, findOptimalLunarRoute } from "./pathfinder.js";
import { LunarSouthPoleScene } from "./lunarScene.js";
import { TraverseProfileChart } from "./charts.js";
import { exportArtemisEvaDossierPdf } from "./pdfExporter.js";
import { NasaApiClient } from "./nasaApi.js";
import { adaptSiteToPathfinder } from "./core/siteAdapter.js";
import { renderNav, getLang } from "./ui/common.js";

class ArtemisForgeApp {
  constructor() {
    this.lang = getLang();
    this.dataset = null;
    this.sitesList = [];
    this.activeSiteId = "shackleton";
    this.scene = null;
    this.chart = null;
    this.nasaApi = new NasaApiClient();

    this.activePresetIdx = 0;
    this.activeLayer = "optical";
    this.clickMode = "inspect";

    this.sunAzimuthDeg = 315;
    this.sunAnimating = false;
    this.sunTimer = null;

    this.startCell = [38, 60];
    this.goalCell = [33, 84];
    this.maxSlope = 16.0;
    this.weightSlope = 4.5;
    this.weightShadow = 1.6;
    this.weightComms = 2.5;

    this.shadowMask = null;
    this.currentRoute = null;
    this.currentSlideIdx = 0;
  }

  async init() {
    renderNav("pathfinder.html");

    // Check URL hash for target site ID: pathfinder.html#id=im2
    const hashParams = new URLSearchParams(location.hash.slice(1));
    const targetSiteId = hashParams.get("id");

    // Load available sites catalog
    try {
      const sitesRes = await fetch("./data/sites.json");
      const sitesData = await sitesRes.json();
      this.sitesList = sitesData.sites || [];
    } catch {
      this.sitesList = [];
    }

    if (targetSiteId && targetSiteId !== "shackleton") {
      this.activeSiteId = targetSiteId;
      await this.loadSiteData(targetSiteId);
    } else {
      this.activeSiteId = "shackleton";
      const res = await fetch("./data/shackleton_pds_grid.json");
      this.dataset = await res.json();
    }

    const canvasContainer = document.getElementById("lunar-canvas-container");
    const chartCanvas = document.getElementById("profile-chart-canvas");

    this.chart = new TraverseProfileChart(chartCanvas);

    this.scene = new LunarSouthPoleScene(canvasContainer, this.dataset, {
      onHoverCell: (cellInfo) => this.updateInspectorUI(cellInfo),
      onClickCell: (i, j, cellInfo) => this.handleTerrainClick(i, j, cellInfo),
      onRoverStep: (progress, wp) => {
        this.chart.setRoverProgress(progress);
        if (wp) {
          const el = document.getElementById("hud-rover-live");
          if (el) {
            el.textContent = `${wp.distKm.toFixed(2)} km • ${wp.elevM.toFixed(0)}m • ${wp.tempK.toFixed(0)}K`;
          }
        }
      }
    });

    this.bindUIEvents();
    this.populateSiteSelector();
    this.populateMissionPresets();
    this.applyPreset(0);
    this.applyLanguage();
  }

  async loadSiteData(siteId) {
    if (siteId === "shackleton") {
      const res = await fetch("./data/shackleton_pds_grid.json");
      this.dataset = await res.json();
    } else {
      const res = await fetch(`./data/sites/${siteId}.json`);
      const rawProduct = await res.json();
      const meta = this.sitesList.find(s => s.id === siteId) || {};
      this.dataset = adaptSiteToPathfinder(rawProduct, meta);
    }
  }

  populateSiteSelector() {
    const sel = document.getElementById("pathfinder-site-select");
    if (!sel) return;
    sel.innerHTML = "";

    const optShack = document.createElement("option");
    optShack.value = "shackleton";
    optShack.textContent = "Borde y Cresta de Shackleton (Línea Base Artemis III)";
    sel.appendChild(optShack);

    this.sitesList.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.site})`;
      sel.appendChild(opt);
    });

    sel.value = this.activeSiteId;
    sel.addEventListener("change", async (e) => {
      const newId = e.target.value;
      this.activeSiteId = newId;
      await this.loadSiteData(newId);
      this.scene.loadDataset(this.dataset);
      this.populateMissionPresets();
      this.applyPreset(0);
    });
  }

  populateMissionPresets() {
    const select = document.getElementById("mission-preset-select");
    select.innerHTML = "";
    this.dataset.presets.forEach((p, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = this.lang === "es" ? p.name_es : p.name_en;
      select.appendChild(opt);
    });
    select.value = String(this.activePresetIdx);
  }

  applyPreset(idx) {
    this.activePresetIdx = idx;
    const p = this.dataset.presets[idx];
    if (!p) return;

    this.startCell = [...p.start];
    this.goalCell = [...p.goal];
    this.sunAzimuthDeg = p.sun_azimuth;
    this.maxSlope = p.max_slope;
    this.weightSlope = p.weights.slope;
    this.weightShadow = p.weights.shadow;
    this.weightComms = p.weights.comms;

    document.getElementById("slider-sun-azimuth").value = String(this.sunAzimuthDeg);
    document.getElementById("val-sun-azimuth").textContent = `${this.sunAzimuthDeg}°`;

    document.getElementById("slider-max-slope").value = String(this.maxSlope);
    document.getElementById("val-max-slope").textContent = `${this.maxSlope.toFixed(1)}°`;

    document.getElementById("slider-w-slope").value = String(this.weightSlope);
    document.getElementById("val-w-slope").textContent = `${this.weightSlope.toFixed(1)}x`;

    document.getElementById("slider-w-shadow").value = String(this.weightShadow);
    document.getElementById("val-w-shadow").textContent = `${this.weightShadow.toFixed(1)}x`;

    document.getElementById("slider-w-comms").value = String(this.weightComms);
    document.getElementById("val-w-comms").textContent = `${this.weightComms.toFixed(1)}x`;

    const descEl = document.getElementById("mission-preset-desc");
    descEl.textContent = this.lang === "es" ? p.desc_es : p.desc_en;

    this.recomputeShadowAndRoute();
  }

  recomputeShadowAndRoute() {
    this.shadowMask = computeDynamicShadowMask(this.dataset, this.sunAzimuthDeg, 1.6);
    this.scene.updateSunAndLayers(this.sunAzimuthDeg, this.shadowMask, this.activeLayer);
    this.recomputeRouteOnly();
  }

  recomputeRouteOnly() {
    this.currentRoute = findOptimalLunarRoute(this.dataset, this.shadowMask, {
      start: this.startCell,
      goal: this.goalCell,
      maxSlope: this.maxSlope,
      weightSlope: this.weightSlope,
      weightShadow: this.weightShadow,
      weightComms: this.weightComms
    });

    this.scene.updateRoute(this.currentRoute.waypoints);
    this.chart.setWaypoints(this.currentRoute.waypoints);
    this.updateTelemetryUI();
  }

  updateTelemetryUI() {
    if (!this.currentRoute) return;
    const { waypoints, telemetry, computeMs } = this.currentRoute;
    const dict = I18N[this.lang];

    document.getElementById("compute-time-badge").textContent = `(${computeMs}ms)`;

    const startWp = waypoints[0];
    const goalWp = waypoints[waypoints.length - 1];
    document.getElementById("hud-start-coords").textContent = `${startWp.latStr}, ${startWp.lonStr}`;
    document.getElementById("hud-goal-coords").textContent = `${goalWp.latStr}, ${goalWp.lonStr}`;

    document.getElementById("stat-val-distance").textContent = `${telemetry.distanceKm} km`;
    document.getElementById("stat-val-duration").textContent = telemetry.durationFormatted;
    document.getElementById("stat-val-battery").textContent = `${telemetry.batteryRemainingPct}%`;
    document.getElementById("stat-val-psr").textContent = `${telemetry.psrCryoMinutes} min`;
    document.getElementById("stat-val-slope").textContent = `${telemetry.maxSlopeDeg}°`;
    document.getElementById("stat-val-temp").textContent = `${telemetry.minTempK} K`;
    document.getElementById("stat-val-ice").textContent = `${telemetry.maxIceWt} wt%`;
    document.getElementById("stat-val-comms").textContent = `${telemetry.commsCoveragePct}%`;

    const battFill = document.getElementById("battery-bar-fill");
    if (battFill) {
      battFill.style.width = `${telemetry.batteryRemainingPct}%`;
    }

    // Aviso de seguridad: solo un símbolo que cambia de color (el texto va en el tooltip)
    const banner = document.getElementById("verdict-banner");
    banner.className = `verdict-icon ${telemetry.verdict}`;
    banner.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
    const verdictText =
      telemetry.verdict === "GO"
        ? `[GO] ${dict.verdictGo}`
        : telemetry.verdict === "CAUTION"
          ? `[CAUTION] ${dict.verdictCaution}`
          : `[NO-GO] ${dict.verdictNoGo}`;
    banner.title = verdictText;
    banner.setAttribute("aria-label", verdictText);
  }
  updateInspectorUI(info) {
    if (!info) return;
    document.getElementById("insp-coords").textContent = `${info.latStr}, ${info.lonStr}`;
    const sign = info.elevM >= 0 ? "+" : "";
    document.getElementById("insp-elev").textContent = `${sign}${info.elevM.toFixed(0)} m`;
    document.getElementById("insp-slope").textContent = `${info.slopeDeg.toFixed(1)}°`;
    document.getElementById("insp-temp").textContent = `${info.tempK.toFixed(1)} K`;
    document.getElementById("insp-ice").textContent = `${info.iceWt.toFixed(2)} wt%`;
    const es = this.lang === "es";
    const commsTxt = info.comms ? (es ? "LÍNEA DIRECTA OK" : "LOS OK") : es ? "OCLUIDO" : "OCCLUDED";
    const sunTxt = info.sunlit ? (es ? "ILUMINADO" : "SUNLIT") : es ? "EN SOMBRA" : "SHADOW";
    document.getElementById("insp-status").textContent = `${commsTxt} • ${sunTxt}`;
  }

  handleTerrainClick(i, j, cellInfo) {
    this.updateInspectorUI(cellInfo);
    if (this.clickMode === "start") {
      this.startCell = [i, j];
      this.recomputeRouteOnly();
    } else if (this.clickMode === "goal") {
      this.goalCell = [i, j];
      this.recomputeRouteOnly();
    }
  }

  bindUIEvents() {
    document.getElementById("mission-preset-select").addEventListener("change", (e) => {
      this.applyPreset(Number(e.target.value));
    });

    document.querySelectorAll(".layer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".layer-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeLayer = btn.dataset.layer;
        this.scene.updateSunAndLayers(this.sunAzimuthDeg, this.shadowMask, this.activeLayer);
      });
    });

    const sunSlider = document.getElementById("slider-sun-azimuth");
    sunSlider.addEventListener("input", (e) => {
      this.sunAzimuthDeg = Number(e.target.value);
      document.getElementById("val-sun-azimuth").textContent = `${this.sunAzimuthDeg}°`;
      this.recomputeShadowAndRoute();
    });

    document.getElementById("btn-animate-sun").addEventListener("click", () => {
      this.sunAnimating = !this.sunAnimating;
      if (this.sunAnimating) {
        this.sunTimer = setInterval(() => {
          this.sunAzimuthDeg = (this.sunAzimuthDeg + 3) % 360;
          sunSlider.value = String(this.sunAzimuthDeg);
          document.getElementById("val-sun-azimuth").textContent = `${this.sunAzimuthDeg}°`;
          this.recomputeShadowAndRoute();
        }, 90);
      } else if (this.sunTimer) {
        clearInterval(this.sunTimer);
        this.sunTimer = null;
      }
    });

    document.getElementById("slider-max-slope").addEventListener("input", (e) => {
      this.maxSlope = Number(e.target.value);
      document.getElementById("val-max-slope").textContent = `${this.maxSlope.toFixed(1)}°`;
      this.recomputeRouteOnly();
    });

    document.getElementById("slider-w-slope").addEventListener("input", (e) => {
      this.weightSlope = Number(e.target.value);
      document.getElementById("val-w-slope").textContent = `${this.weightSlope.toFixed(1)}x`;
      this.recomputeRouteOnly();
    });

    document.getElementById("slider-w-shadow").addEventListener("input", (e) => {
      this.weightShadow = Number(e.target.value);
      document.getElementById("val-w-shadow").textContent = `${this.weightShadow.toFixed(1)}x`;
      this.recomputeRouteOnly();
    });

    document.getElementById("slider-w-comms").addEventListener("input", (e) => {
      this.weightComms = Number(e.target.value);
      document.getElementById("val-w-comms").textContent = `${this.weightComms.toFixed(1)}x`;
      this.recomputeRouteOnly();
    });

    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.clickMode = btn.dataset.mode;
      });
    });

    // 06 // Custom 3D Models (Rover, Earth, Sun) & Moon Scale Controls
    const roverSelect = document.getElementById("select-rover-model");
    const roverFile = document.getElementById("file-rover-glb");
    roverSelect.addEventListener("change", (e) => {
      if (e.target.value === "custom") {
        roverFile.click();
      } else {
        this.scene.setRoverPreset(e.target.value);
      }
    });
    roverFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      roverSelect.value = "custom";
      const statusMsg = document.getElementById("api-status-msg");
      this.scene.loadCustomGlbModel("rover", file, (err) => {
        statusMsg.textContent = err
          ? `Error al cargar GLB del Rover: ${err.message || "formato inválido"}`
          : `Modelo 3D de Rover cargado: ${file.name}`;
      });
    });

    const earthSelect = document.getElementById("select-earth-model");
    const earthFile = document.getElementById("file-earth-glb");
    earthSelect.addEventListener("change", (e) => {
      if (e.target.value === "custom") {
        earthFile.click();
      } else {
        this.scene.setEarthPreset(e.target.value);
      }
    });
    earthFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      earthSelect.value = "custom";
      const statusMsg = document.getElementById("api-status-msg");
      this.scene.loadCustomGlbModel("earth", file, (err) => {
        statusMsg.textContent = err
          ? `Error al cargar GLB de la Tierra: ${err.message || "formato inválido"}`
          : `Modelo 3D de la Tierra cargado: ${file.name}`;
      });
    });

    const sunSelect = document.getElementById("select-sun-model");
    const sunFile = document.getElementById("file-sun-glb");
    sunSelect.addEventListener("change", (e) => {
      if (e.target.value === "custom") {
        sunFile.click();
      } else {
        this.scene.setSunPreset(e.target.value);
      }
    });
    sunFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      sunSelect.value = "custom";
      const statusMsg = document.getElementById("api-status-msg");
      this.scene.loadCustomGlbModel("sun", file, (err) => {
        statusMsg.textContent = err
          ? `Error al cargar GLB del Sol: ${err.message || "formato inválido"}`
          : `Modelo 3D del Sol cargado: ${file.name}`;
      });
    });

    // Moon Scale & Relief Exaggeration Slider
    document.getElementById("slider-moon-scale").addEventListener("input", (e) => {
      const val = Number(e.target.value);
      document.getElementById("val-moon-scale").textContent = `${val.toFixed(1)}x`;
      this.scene.setMoonVerticalScale(val);
    });

    // Pre-fill NASA API input if configured via .env or localStorage
    const apiInputEl = document.getElementById("input-nasa-api");
    if (this.nasaApi.hasCustomKey()) {
      apiInputEl.value = this.nasaApi.getApiKey();
    }

    // Live NASA API Key / Satellite Endpoint Sync
    document.getElementById("btn-connect-api").addEventListener("click", async () => {
      const apiInput = apiInputEl.value.trim();
      const statusMsg = document.getElementById("api-status-msg");
      statusMsg.textContent = "Conectando con NASA Planetary Data / DONKI / Moon Trek...";

      if (apiInput && !apiInput.startsWith("http")) {
        this.nasaApi.setRuntimeApiKey(apiInput);
      }

      const swStatus = await this.nasaApi.fetchSpaceWeatherRadiationStatus();
      this.scene.connectLiveNasaMoonTexture(apiInput, (_ok, msg) => {
        statusMsg.textContent = `${msg} | DONKI: ${swStatus.radiationStatus}`;
        document.getElementById("watermark-source-label").textContent =
          `SHACKLETON POLO SUR // API NASA EN VIVO (${swStatus.radiationStatus}) + LRO NAC`;
      });
    });

    // Maximize 3D Render Area (Theatre Mode Toggle + 'F' Hotkey)
    const toggleTheatreMode = () => {
      const layout = document.querySelector(".tactical-layout");
      const btnExpand = document.getElementById("btn-expand-3d");
      const isExpanded = layout.classList.toggle("theatre-mode");
      btnExpand.textContent = isExpanded ? "⛌ SALIR" : "⛶ MAX 3D";
      setTimeout(() => {
        this.scene.resize();
        this.chart.draw();
      }, 60);
      setTimeout(() => {
        this.scene.resize();
        this.chart.draw();
      }, 240);
    };

    document.getElementById("btn-expand-3d").addEventListener("click", toggleTheatreMode);

    // Toggle right-hand telemetry panel on desktop (collapsed by default)
    const btnToggleRight = document.getElementById("btn-toggle-right-panel");
    if (btnToggleRight) {
      btnToggleRight.addEventListener("click", () => {
        const layout = document.querySelector(".tactical-layout");
        const isCollapsed = layout.classList.toggle("right-collapsed");
        btnToggleRight.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        const arrow = btnToggleRight.querySelector(".toggle-arrow");
        if (arrow) arrow.textContent = isCollapsed ? "‹" : "›";
        setTimeout(() => { this.scene.resize(); this.chart.draw(); }, 60);
        setTimeout(() => { this.scene.resize(); this.chart.draw(); }, 270);
      });
    }
    window.addEventListener("keydown", (e) => {
      if ((e.key === "f" || e.key === "F") && document.activeElement?.tagName !== "INPUT") {
        toggleTheatreMode();
      }
    });

    // Viewport Controls
    document.getElementById("btn-toggle-rover").addEventListener("click", () => {
      this.scene.roverPlaying = !this.scene.roverPlaying;
    });

    document.getElementById("btn-focus-rover").addEventListener("click", () => {
      const following = this.scene.toggleFollowRover();
      const btn = document.getElementById("btn-focus-rover");
      btn.classList.toggle("mech-btn-orange", following);
    });

    document.getElementById("btn-toggle-wire").addEventListener("click", () => {
      this.scene.toggleWireframe();
    });

    document.getElementById("btn-reset-cam").addEventListener("click", () => {
      document.getElementById("btn-focus-rover").classList.remove("mech-btn-orange");
      this.scene.resetCamera();
    });

    // Language Switcher
    document.getElementById("btn-lang-toggle").addEventListener("click", () => {
      this.lang = this.lang === "en" ? "es" : "en";
      this.applyLanguage();
    });

    // Export PDF Dossier
    document.getElementById("btn-export-pdf").addEventListener("click", () => {
      const preset = this.dataset.presets[this.activePresetIdx];
      const missionName = preset
        ? this.lang === "es"
          ? preset.name_es
          : preset.name_en
        : "Custom Artemis Sortie";
      const snapshot = this.scene.captureSnapshotDataUrl();
      exportArtemisEvaDossierPdf({
        missionName,
        sunAzimuthDeg: this.sunAzimuthDeg,
        maxSafeSlope: this.maxSlope,
        routeResult: this.currentRoute,
        sceneSnapshotDataUrl: snapshot
      });
    });

    // 7-Slide Pitch Deck Modal
    const modal = document.getElementById("pitch-modal-backdrop");
    document.getElementById("btn-open-pitch").addEventListener("click", () => {
      modal.classList.remove("hidden");
      this.renderPitchSlide();
    });

    document.getElementById("btn-close-pitch").addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    document.getElementById("btn-prev-slide").addEventListener("click", () => {
      const slides = I18N[this.lang].slides;
      this.currentSlideIdx = (this.currentSlideIdx - 1 + slides.length) % slides.length;
      this.renderPitchSlide();
    });

    document.getElementById("btn-next-slide").addEventListener("click", () => {
      const slides = I18N[this.lang].slides;
      this.currentSlideIdx = (this.currentSlideIdx + 1) % slides.length;
      this.renderPitchSlide();
    });
  }

  applyLanguage() {
    const dict = I18N[this.lang];
    Object.keys(dict).forEach((key) => {
      if (key === "slides") return;
      const el = document.getElementById(`i18n-${key}`);
      if (el) el.textContent = dict[key];
    });

    this.populateMissionPresets();
    const preset = this.dataset.presets[this.activePresetIdx];
    if (preset) {
      document.getElementById("mission-preset-desc").textContent =
        this.lang === "es" ? preset.desc_es : preset.desc_en;
    }

    this.updateTelemetryUI();
    this.renderPitchSlide();
  }

  renderPitchSlide() {
    const slides = I18N[this.lang].slides;
    const s = slides[this.currentSlideIdx];
    if (!s) return;

    document.getElementById("slide-num").textContent = s.num;
    document.getElementById("slide-title").textContent = s.title;
    document.getElementById("slide-hook").textContent = s.hook;
    document.getElementById("slide-metric").textContent = s.metric;

    const ul = document.getElementById("slide-bullets");
    ul.innerHTML = "";
    s.bullets.forEach((b) => {
      const li = document.createElement("li");
      li.textContent = b;
      ul.appendChild(li);
    });

    const dotsContainer = document.getElementById("slide-dots-container");
    dotsContainer.innerHTML = "";
    slides.forEach((_, idx) => {
      const dot = document.createElement("div");
      dot.className = `slide-dot ${idx === this.currentSlideIdx ? "active" : ""}`;
      dot.addEventListener("click", () => {
        this.currentSlideIdx = idx;
        this.renderPitchSlide();
      });
      dotsContainer.appendChild(dot);
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new ArtemisForgeApp();
  app.init();
});
