import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { skyAt } from "../core/geometry.js";
import {
  BASE, loadSites, loadEphemeris, renderNav, toUtcInput, fromUtcInput, fmtUtc, fmtLat, fmtLon, STATUS_LABEL
} from "./common.js";

const COLORS = { landed: 0xa4e3bf, planned: 0xf0c94a, failed: 0xff8a6b };
const RAD = Math.PI / 180;

/** Moon body-fixed (x:lon0, y:lon90E, z:north) -> three.js (x, y:north, z). */
const toScene = (v, s = 1) => new THREE.Vector3(v[0] * s, v[2] * s, -v[1] * s);
const latLonToVec = (lat, lon, r = 1) => {
  const p = lat * RAD, l = lon * RAD;
  return new THREE.Vector3(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l));
};

renderNav("index.html");

const stage = document.getElementById("globe-stage");
const tip = document.getElementById("pin-tip");
const card = document.getElementById("pin-card");
const listEl = document.getElementById("pin-list");

const [{ sites }, eph] = await Promise.all([loadSites(), loadEphemeris()]);

// ---------------- three.js scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x061a2e);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
camera.position.set(2.6, 1.0, 2.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.35;
controls.maxDistance = 7;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.enablePan = false;

// stars
{
  const n = 1800, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 60 + Math.random() * 30;
    pos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd3e8f6, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.8 })));
}

const useHi = Math.min(window.innerWidth, window.innerHeight) > 700 && !matchMedia("(pointer: coarse)").matches;
const loader = new THREE.TextureLoader();
const colorTex = loader.load(`${BASE}textures/${useHi ? "moon_lola_4k.jpg" : "moon_lola_2k.jpg"}`);
colorTex.colorSpace = THREE.SRGBColorSpace;
colorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const heightTex = loader.load(`${BASE}textures/moon_lola_height_2k.png`);

// sphere with the same lat/lon -> uv mapping used for the pins (u = lon/360 east, v = (lat+90)/180)
// three's SphereGeometry maps u -> longitude as lon = 180deg + 360deg * u, so shifting the texture by 0.5
// makes the image's longitude axis (0..360 E, left to right) match the pin placement exactly.
const geo = new THREE.SphereGeometry(1, 128, 96);
for (const t of [colorTex, heightTex]) {
  t.wrapS = THREE.RepeatWrapping;
  t.offset.x = 0.5;
}

const moonMat = new THREE.MeshStandardMaterial({
  map: colorTex, bumpMap: heightTex, bumpScale: 1.5, roughness: 1, metalness: 0
});
const moon = new THREE.Mesh(geo, moonMat);
scene.add(moon);

const sunLight = new THREE.DirectionalLight(0xfff4de, 3.2);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x7da3c4, 0.22));

// Sun & Earth markers (real directions)
function glowSprite(color) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, color); g.addColorStop(0.35, color); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending }));
}
const sunMark = glowSprite("rgba(255,236,170,1)"); sunMark.scale.set(0.5, 0.5, 1); scene.add(sunMark);
const earthMark = glowSprite("rgba(120,190,255,1)"); earthMark.scale.set(0.3, 0.3, 1); scene.add(earthMark);

// pins
const pinGroup = new THREE.Group();
moon.add(pinGroup);
const pins = [];
for (const s of sites) {
  const pos = latLonToVec(s.lat, s.lon, 1.0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), new THREE.MeshBasicMaterial({ color: COLORS[s.status] }));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color: COLORS[s.status] }));
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
  const g = new THREE.Group();
  stem.position.y = 0.045; head.position.y = 0.095; hit.position.y = 0.08;
  g.add(stem, head, hit);
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
  pinGroup.add(g);
  hit.userData.site = s; head.userData.site = s;
  pins.push({ site: s, group: g, head, hit });
}

// ---------------- state ----------------
let tMs = Math.min(Math.max(Date.now(), eph.startMs), eph.endMs - 31 * 86400000);
let baseMs = tMs;
let selected = null;
const timeInput = document.getElementById("globe-time");
const slider = document.getElementById("globe-time-slider");
const timeLabel = document.getElementById("globe-time-label");
timeInput.min = toUtcInput(eph.startMs);
timeInput.max = toUtcInput(eph.endMs);

function applyTime() {
  const s = eph.sample(tMs);
  const sun = new THREE.Vector3(s[0], s[2], -s[1]).normalize();
  const earth = new THREE.Vector3(s[3], s[5], -s[4]).normalize();
  sunLight.position.copy(sun.clone().multiplyScalar(20));
  sunMark.position.copy(sun.clone().multiplyScalar(5.2));
  earthMark.position.copy(earth.clone().multiplyScalar(4.4));
  timeLabel.textContent = `${fmtUtc(tMs)} · +${Math.round((tMs - baseMs) / 3.6e6)} h`;
  if (selected) renderCard(selected);
}

timeInput.addEventListener("change", () => {
  const v = fromUtcInput(timeInput.value);
  if (!isNaN(v)) { baseMs = eph.clamp(v); tMs = baseMs + slider.value * 3.6e6; applyTime(); }
});
slider.addEventListener("input", () => { tMs = eph.clamp(baseMs + slider.value * 3.6e6); applyTime(); });
timeInput.value = toUtcInput(baseMs);

// ---------------- list + card ----------------
for (const s of sites) {
  const li = document.createElement("li");
  li.innerHTML = `<button data-id="${s.id}"><span>${s.name}</span><span class="chip ${s.status}">${STATUS_LABEL[s.status]}</span></button>`;
  li.firstChild.addEventListener("click", () => select(s, true));
  listEl.appendChild(li);
}

function renderCard(s) {
  const sky = skyAt(eph, tMs, { lat: s.lat, lon: s.lon });
  const approx = s.confidence === "approximate"
    ? `<p class="note" style="margin-top:8px;font-size:12px">Approximate coordinates (region centre). Verify before mission use.</p>` : "";
  const hash = `id=${s.id}&t=${toUtcInput(tMs)}`;
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
      <h3>${s.name}</h3><button class="btn small" id="card-close" aria-label="Close">✕</button></div>
    <div class="muted" style="font-size:12px">${s.provider} · ${s.site}</div>
    <div style="margin:6px 0"><span class="chip ${s.status}">${STATUS_LABEL[s.status]}</span>
      <span class="muted" style="font-size:12px"> ${fmtLat(s.lat)}, ${fmtLon(s.lon)}</span></div>
    <p style="font-size:13px">${s.outcome}</p>
    <div class="grid cols-2" style="margin-top:10px;gap:10px">
      <div class="metric"><div class="k">Sun elevation</div><div class="v">${sky.sun.el.toFixed(1)}°</div><div class="s">az ${sky.sun.az.toFixed(0)}°</div></div>
      <div class="metric"><div class="k">Earth elevation</div><div class="v">${sky.earth.el.toFixed(1)}°</div><div class="s">az ${sky.earth.az.toFixed(0)}°</div></div>
    </div>
    <p class="muted" style="font-size:11px;margin-top:6px">Geometric values at ${fmtUtc(tMs)} (flat horizon). Open the analysis for the real LOLA horizon.</p>
    ${approx}
    <div class="actions">
      <a class="btn primary" href="site.html#${hash}">Analyze site &amp; dates →</a>
      <a class="btn" href="pathfinder.html#id=${s.id}">Rover pathfinder</a>
      <a class="btn" href="compare.html#a=${s.id}">Compare</a>
    </div>`;
  card.classList.add("open");
  card.querySelector("#card-close").addEventListener("click", () => { selected = null; card.classList.remove("open"); markList(); });
}

function markList() {
  listEl.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", selected && b.dataset.id === selected.id));
}

let fly = null;
function select(s, focus) {
  selected = s;
  renderCard(s);
  markList();
  if (focus) {
    controls.autoRotate = false;
    document.getElementById("btn-spin").textContent = "Auto-rotate: off";
    const dir = latLonToVec(s.lat, s.lon, 1).normalize();
    // keep the pole readable: tilt a bit toward the equator side
    fly = { from: camera.position.clone(), to: dir.multiplyScalar(2.6), t: 0 };
  }
}

// ---------------- interaction ----------------
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(pins.map((p) => p.hit), false);
  if (!hits.length) return null;
  const moonHit = ray.intersectObject(moon, false)[0];
  const h = hits[0];
  if (moonHit && moonHit.distance < h.distance - 0.02) return null; // pin is behind the limb
  return h.object.userData.site;
}
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const s = pick(e);
  if (s) select(s, true);
});
renderer.domElement.addEventListener("pointermove", (e) => {
  const s = pick(e);
  renderer.domElement.style.cursor = s ? "pointer" : "grab";
  if (s) {
    const r = stage.getBoundingClientRect();
    tip.style.display = "block";
    tip.style.left = `${e.clientX - r.left + 12}px`;
    tip.style.top = `${e.clientY - r.top + 12}px`;
    tip.textContent = `${s.name} · ${s.provider}`;
  } else tip.style.display = "none";
});

document.getElementById("btn-pole").addEventListener("click", () => { controls.autoRotate = false; fly = { from: camera.position.clone(), to: new THREE.Vector3(0.9, -2.5, 0.9), t: 0 }; });
document.getElementById("btn-near").addEventListener("click", () => { fly = { from: camera.position.clone(), to: new THREE.Vector3(3, 0.4, 0), t: 0 }; });
document.getElementById("btn-spin").addEventListener("click", (e) => {
  controls.autoRotate = !controls.autoRotate;
  e.target.textContent = `Auto-rotate: ${controls.autoRotate ? "on" : "off"}`;
});

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduce) controls.autoRotate = false;

const clock = new THREE.Clock();
function frame() {
  const dt = clock.getDelta();
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 1.1);
    const k = 1 - Math.pow(1 - fly.t, 3);
    camera.position.lerpVectors(fly.from, fly.to, k).setLength(THREE.MathUtils.lerp(fly.from.length(), fly.to.length(), k));
    if (fly.t >= 1) fly = null;
  }
  const pulse = 1 + 0.25 * Math.sin(performance.now() / 300);
  pins.forEach((p) => p.head.scale.setScalar(selected && p.site.id === selected.id ? pulse * 1.5 : 1));
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
applyTime();

// deep link: index.html#id=im2
const h0 = new URLSearchParams(location.hash.slice(1)).get("id");
if (h0) { const s = sites.find((x) => x.id === h0); if (s) select(s, true); }
frame();
