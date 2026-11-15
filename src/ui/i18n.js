/**
 * Internacionalización global (ES por defecto, EN opcional).
 *
 * El código fuente de toda la web está escrito en español. Cuando el idioma activo es "en",
 * un traductor de DOM reemplaza los textos (nodos de texto + atributos) usando los diccionarios
 * de `src/ui/dict/*.js` y observa el DOM para traducir también el contenido generado por JS.
 *
 * Reglas de búsqueda en el diccionario (clave = texto en español):
 *   1. Coincidencia exacta del texto normalizado (espacios colapsados).
 *   2. Coincidencia con números sustituidos por {n}:  "ventana continua máx {n} d"  ->  "max continuous window {n} d"
 *      Los valores capturados se reinsertan en orden en la traducción.
 * Cambiar de idioma guarda la preferencia y recarga la página (los canvas y la escena 3D se reconstruyen).
 */
import common from "./dict/common.js";
import landing from "./dict/landing.js";
import mapa from "./dict/mapa.js";
import sitio from "./dict/sitio.js";
import comparar from "./dict/comparar.js";
import aprender from "./dict/aprender.js";
import acerca from "./dict/acerca.js";
import pathfinder from "./dict/pathfinder.js";

const KEY = "clpsLang";
export const LANGS = [
  ["es", "Español", "ES"],
  ["en", "English", "EN"]
];

export function getLang() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "es" || v === "en") return v;
  } catch { /* almacenamiento bloqueado */ }
  return "es";
}

export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* ignorar */ }
  location.reload();
}

const lang = getLang();
export const isEn = lang === "en";

const norm = (s) => s.replace(/\s+/g, " ").trim();
const NUM = /-?\d+(?:[.,]\d+)?/g;

const exact = new Map();
const pattern = new Map();
for (const dict of [common, landing, mapa, sitio, comparar, aprender, acerca, pathfinder]) {
  for (const [es, en] of Object.entries(dict)) {
    const k = norm(es);
    if (k.includes("{n}")) {
      pattern.set(k, en); // clave ya escrita con {n}
      continue;
    }
    exact.set(k, en);
    const nk = k.replace(NUM, "{n}");
    if (nk !== k) pattern.set(nk, en); // clave con dígitos de ejemplo
  }
}

/** Traduce un texto en español al idioma activo. Devuelve el original si no hay traducción. */
export function t(text) {
  if (!isEn || typeof text !== "string" || !text.trim()) return text;
  const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
  const k = norm(text);
  let out = exact.get(k);
  if (out === undefined) {
    const nums = k.match(NUM);
    if (nums) {
      const pv = pattern.get(k.replace(NUM, "{n}"));
      if (pv !== undefined) {
        let i = 0;
        out = pv.replace(/\{n\}/g, () => nums[i++] ?? "");
      }
    }
  }
  return out === undefined ? text : lead + out + trail;
}

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "NOSCRIPT"]);

function textNode(n) {
  const p = n.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest("[data-no-i18n]")) return;
  const v = n.nodeValue;
  if (!v || !v.trim()) return;
  const out = t(v);
  if (out !== v) n.nodeValue = out;
}

function attrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v) {
      const out = t(v);
      if (out !== v) el.setAttribute(a, out);
    }
  }
}

function walk(root) {
  if (root.nodeType === 3) return textNode(root);
  if (root.nodeType !== 1 || SKIP.has(root.tagName)) return;
  attrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) textNode(n);
    else if (!SKIP.has(n.tagName)) attrs(n);
  }
}

let started = false;
export function initI18n() {
  if (started) return;
  started = true;
  document.documentElement.lang = lang;
  if (!isEn) return;
  document.title = t(document.title);
  const md = document.querySelector('meta[name="description"]');
  if (md) md.content = t(md.content);
  walk(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") textNode(m.target);
      else if (m.type === "attributes") attrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS
  });
}
