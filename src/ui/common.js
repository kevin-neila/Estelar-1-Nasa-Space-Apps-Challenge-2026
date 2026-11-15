import { Ephemeris } from "../core/ephemeris.js";
import { getLang, setLang, LANGS, initI18n, t } from "./i18n.js";
export { t, getLang };

export const BASE = import.meta.env.BASE_URL || "./";
export const DATA = `${BASE}data/`;

let _sites, _eph;
const _products = {};

export async function loadSites() {
  if (!_sites) _sites = fetch(`${DATA}sites.json`).then((r) => r.json());
  return _sites;
}

export async function loadEphemeris() {
  if (!_eph) _eph = Ephemeris.load(DATA);
  return _eph;
}

/** Producto derivado de altimetría LOLA por sitio (perfil de horizonte + rejilla 160x160). */
export async function loadSiteProduct(id) {
  if (!_products[id]) {
    _products[id] = fetch(`${DATA}sites/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`Sin datos de terreno para ${id}`);
      return r.json();
    });
  }
  return _products[id];
}

export const NAV = [
  ["index.html", "Home"],
  ["mapa.html", "Mapa"],
  ["sitio.html", "Análisis de Sitio"],
  ["comparar.html", "Comparar"],
  ["pathfinder.html", "Pathfinder"],
  ["aprender.html", "Por qué es difícil"],
  ["acerca.html", "Método y Fuentes"]
];

export function renderNav(active) {
  const el = document.getElementById("site-nav");
  if (!el) return;
  const links = NAV.map(([href, label]) =>
    `<a href="${href}" class="${href === active ? "active" : ""}" ${href === active ? 'aria-current="page"' : ""}>${label}</a>`
  ).join("");
  const cur = LANGS.find(([c]) => c === getLang()) || LANGS[0];
  const langItems = LANGS.map(([c, name, short]) =>
    `<li role="none"><button type="button" role="menuitemradio" aria-checked="${c === cur[0]}" data-lang="${c}" class="${c === cur[0] ? "on" : ""}"><span class="lang-short">${short}</span>${name}</button></li>`
  ).join("");

  el.innerHTML = `
    <div class="brand-group">
      <a class="brand" href="index.html">
        <img src="${BASE}assets/logo.png" alt="Logo Estelar 1" class="brand-logo" />
        <div class="brand-text">
          <span class="brand-title">CLPS Lunar Mission Browser</span>
          <span class="brand-subtitle" data-no-i18n>Estelar 1 · NASA Space Apps 2026</span>
        </div>
      </a>
    </div>
    <button type="button" class="nav-toggle" id="nav-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="nav-menu">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-menu" id="nav-menu">
      <nav aria-label="Navegación principal">${links}</nav>
      <div class="lang-switch" id="lang-switch">
        <button type="button" class="lang-btn" id="lang-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Idioma">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>
          <span data-no-i18n>${cur[2]}</span>
          <svg class="caret" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>
        </button>
        <ul class="lang-list" role="menu" aria-label="Idioma">${langItems}</ul>
      </div>
      <button type="button" class="share-qr-btn" id="share-qr-btn" aria-label="Compartir con QR" title="Compartir">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
          <path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 21h3"/>
        </svg>
        <span>Compartir</span>
      </button>
    </div>`;

  // Fondo de orbes de color (da vida al desenfoque del glassmorphism)
  if (!document.querySelector(".bg-orbs")) {
    const orbs = document.createElement("div");
    orbs.className = "bg-orbs";
    orbs.setAttribute("aria-hidden", "true");
    orbs.innerHTML = "<i></i><i></i><i></i><i></i>";
    document.body.prepend(orbs);
  }

  const toggle = el.querySelector("#nav-toggle");
  const langSw = el.querySelector("#lang-switch");
  const langBtn = el.querySelector("#lang-btn");
  const closeAll = () => {
    el.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    langSw.classList.remove("open");
    langBtn.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const open = el.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = langSw.classList.toggle("open");
    langBtn.setAttribute("aria-expanded", String(open));
  });
  langSw.querySelectorAll("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.lang === getLang()) return closeAll();
      setLang(b.dataset.lang);
    })
  );
  document.addEventListener("click", (e) => { if (!el.contains(e.target)) closeAll(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
  el.querySelectorAll("nav a").forEach((a) => a.addEventListener("click", closeAll));

  const shareBtn = el.querySelector("#share-qr-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      closeAll();
      openShareQrModal();
    });
  }

  initI18n();
}

async function openShareQrModal() {
  let modal = document.getElementById("qr-share-modal");
  const landingUrl = new URL("index.html", window.location.href).href.replace(/\/index\.html$/, "/");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "qr-share-modal";
    modal.className = "qr-modal-backdrop";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="qr-modal-card">
        <button type="button" class="qr-modal-close" aria-label="${t("Cerrar")}">✕</button>
        <h3>${t("Compartir Proyecto")}</h3>
        <p class="qr-modal-desc">${t("Escanea el código QR para abrir la página principal desde cualquier dispositivo.")}</p>
        <div class="qr-canvas-wrap">
          <canvas id="qr-share-canvas" width="220" height="220"></canvas>
        </div>
        <div class="qr-url-box" data-no-i18n>${landingUrl}</div>
        <div class="qr-modal-actions">
          <button type="button" class="btn primary small" id="qr-copy-btn">${t("Copiar enlace")}</button>
          <button type="button" class="btn small qr-close-action">${t("Cerrar")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.classList.remove("open");
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    modal.querySelector(".qr-modal-close").addEventListener("click", closeModal);
    modal.querySelector(".qr-close-action").addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

    const copyBtn = modal.querySelector("#qr-copy-btn");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(landingUrl);
        copyBtn.textContent = t("¡Copiado!");
        setTimeout(() => { copyBtn.textContent = t("Copiar enlace"); }, 1800);
      } catch {
        copyBtn.textContent = landingUrl;
      }
    });
  } else {
    modal.querySelector("h3").textContent = t("Compartir Proyecto");
    modal.querySelector(".qr-modal-desc").textContent = t("Escanea el código QR para abrir la página principal desde cualquier dispositivo.");
    modal.querySelector("#qr-copy-btn").textContent = t("Copiar enlace");
    modal.querySelector(".qr-close-action").textContent = t("Cerrar");
  }

  modal.classList.add("open");
  const canvas = modal.querySelector("#qr-share-canvas");
  const QRCode = (await import("qrcode")).default;
  await QRCode.toCanvas(canvas, landingUrl, {
    width: 220,
    margin: 2,
    color: { dark: "#0a1020", light: "#ffffff" },
  });
}
export function fmtHours(h) {
  if (h === null || h === undefined || !isFinite(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} días`;
}

export const pad = (n) => String(n).padStart(2, "0");

/** ms -> valor para <input type="datetime-local"> interpretado como UTC. */
export function toUtcInput(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function fromUtcInput(v) {
  return Date.parse(`${v}:00Z`);
}

export function fmtUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function fmtLat(lat) {
  return `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"}`;
}

export function fmtLon(lon) {
  const l = ((lon + 540) % 360) - 180;
  return `${Math.abs(l).toFixed(2)}°${l < 0 ? "O" : "E"}`;
}

export function readHash() {
  const out = {};
  const q = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  for (const [k, v] of q) out[k] = v;
  return out;
}

export function writeHash(obj) {
  const q = new URLSearchParams(obj);
  history.replaceState(null, "", `#${q.toString()}`);
}

export const LIGHT = { green: "#10b981", yellow: "#f59e0b", red: "#ef4444" };
export const LIGHT_LABEL = { green: "Viable", yellow: "Marginal", red: "Crítico" };

export const STATUS_LABEL = {
  landed: "Alunizaje exitoso",
  planned: "Planificado",
  failed: "No completado"
};

