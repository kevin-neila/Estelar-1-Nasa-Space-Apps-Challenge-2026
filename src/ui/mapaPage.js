import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { skyAt } from "../core/geometry.js";
import {
  BASE, loadSites, loadEphemeris, renderNav, toUtcInput, fromUtcInput, fmtUtc, fmtLat, fmtLon, STATUS_LABEL
} from "./common.js";

renderNav("mapa.html");

const stage = document.getElementById("map-stage");
const tip = document.getElementById("map-pin-tooltip");
const card = document.getElementById("map-pin-card");
const listEl = document.getElementById("map-pin-list");

const [{ sites }, eph] = await Promise.all([loadSites(), loadEphemeris()]);

const COLORS = { landed: 0x10b981, planned: 0x8ea6ff, failed: 0xef4444 };
const RAD = Math.PI / 180;

const latLonToVec = (lat, lon, r = 1) => {
  const p = lat * RAD, l = lon * RAD;
  return new THREE.Vector3(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l));
};

// Three.js Scene Setup
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
camera.position.set(2.4, 0.8, 2.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.35;
controls.maxDistance = 7.5;
controls.autoRotate = false; // la rotación arranca 2 s después (ver más abajo)
controls.autoRotateSpeed = 0.5;
controls.enablePan = false;

// Starfield
{
  const n = 1600;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    const r = 50 + Math.random() * 25;
    pos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x94a3b8, size: 0.14, transparent: true, opacity: 0.7 })));
}

// Moon Object Container
const moonGroup = new THREE.Group();
scene.add(moonGroup);

// Load the 3D Moon model: luna.glb
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  `${BASE}models/luna.glb`,
  (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(1.0 / 500.0);
    model.position.set(0, 0, 0);

    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.roughness = 0.94;
        child.material.metalness = 0.04;
      }
    });

    moonGroup.add(model);
  },
  undefined,
  () => {
    // Fallback sphere if needed
    const texLoader = new THREE.TextureLoader();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.MeshStandardMaterial({
        map: texLoader.load(`${BASE}textures/moon_lola_2k.jpg`),
        roughness: 0.95
      })
    );
    moonGroup.add(sphere);
  }
);

// Invisible Raycast Sphere for exact pin placement and clicking
const raycastSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 32, 24),
  new THREE.MeshBasicMaterial({ visible: false })
);
moonGroup.add(raycastSphere);

// Lights & Distant Sun / Earth
const sunLight = new THREE.DirectionalLight(0xfff7ed, 3.4);
scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0x1e293b, 0x070a10, 0.45));

// Sol lejano (disco solar + halo corona)
const sunAnchor = new THREE.Group();
{
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff8dc })
  );
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(255, 245, 200, 0.95)");
  grad.addColorStop(0.25, "rgba(255, 210, 120, 0.45)");
  grad.addColorStop(0.6, "rgba(255, 170, 60, 0.12)");
  grad.addColorStop(1, "rgba(255, 140, 40, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    })
  );
  halo.scale.set(9.5, 9.5, 1);
  sunAnchor.add(sunCore, halo);
  scene.add(sunAnchor);
}

// Tierra lejana (Blue Marble procedural + atmósfera)
const earthAnchor = new THREE.Group();
{
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#164e8a";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#2d7a4f";
  [[50, 38, 22, 18], [130, 35, 36, 22], [150, 75, 20, 26], [205, 85, 18, 12], [75, 80, 14, 24]].forEach(([x, y, rx, ry]) => {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0.2, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = "rgba(255,255,255,0.4)";
  for (let i = 0; i < 18; i++) {
    g.beginPath(); g.ellipse((i * 37) % 256, 15 + ((i * 23) % 98), 22, 4, 0.1, 0, Math.PI * 2); g.fill();
  }
  const earthSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 32, 32),
    new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(c),
      roughness: 0.72,
      metalness: 0.05
    })
  );
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.04, 28, 28),
    new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.18, side: THREE.BackSide })
  );
  earthAnchor.add(earthSphere, atmo);
  scene.add(earthAnchor);
}

// 3D Pins
const pinGroup = new THREE.Group();
moonGroup.add(pinGroup);
const pins = [];

for (const s of sites) {
  const pos = latLonToVec(s.lat, s.lon, 1.0);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.09, 8),
    new THREE.MeshBasicMaterial({ color: COLORS[s.status] })
  );
  stem.position.y = 0.045;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 16, 12),
    new THREE.MeshStandardMaterial({
      color: COLORS[s.status],
      emissive: COLORS[s.status],
      emissiveIntensity: 0.4
    })
  );
  head.position.y = 0.095;

  const hitBox = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.y = 0.08;

  const g = new THREE.Group();
  g.add(stem, head, hitBox);
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
  pinGroup.add(g);

  hitBox.userData.site = s;
  head.userData.site = s;
  pins.push({ site: s, group: g, head, hit: hitBox });
}

// Time State
let tMs = Math.min(Math.max(Date.now(), eph.startMs), eph.endMs - 31 * 86400000);
let baseMs = tMs;
let selected = null;

const timeInput = document.getElementById("map-time");
const slider = document.getElementById("map-time-slider");
const timeLabel = document.getElementById("map-time-label");

timeInput.min = toUtcInput(eph.startMs);
timeInput.max = toUtcInput(eph.endMs);

function applyTime() {
  const s = eph.sample(tMs);
  const sun = new THREE.Vector3(s[0], s[2], -s[1]).normalize();
  const earth = new THREE.Vector3(s[3], s[5], -s[4]).normalize();
  sunLight.position.copy(sun.clone().multiplyScalar(20));
  sunAnchor.position.copy(sun.clone().multiplyScalar(42));
  earthAnchor.position.copy(earth.clone().multiplyScalar(28));
  timeLabel.textContent = `${fmtUtc(tMs)} · +${Math.round((tMs - baseMs) / 3.6e6)} h`;
  if (selected) renderCard(selected);
}

timeInput.addEventListener("change", () => {
  const v = fromUtcInput(timeInput.value);
  if (!isNaN(v)) {
    baseMs = eph.clamp(v);
    tMs = baseMs + slider.value * 3.6e6;
    applyTime();
  }
});

slider.addEventListener("input", () => {
  tMs = eph.clamp(baseMs + slider.value * 3.6e6);
  applyTime();
});

timeInput.value = toUtcInput(baseMs);

// Populate Mission List
for (const s of sites) {
  const li = document.createElement("li");
  li.innerHTML = `
    <button class="pin-btn" data-id="${s.id}">
      <span><strong>${s.name}</strong> <small style="display:block;color:var(--text-muted);">${s.site}</small></span>
      <span class="chip ${s.status}">${STATUS_LABEL[s.status]}</span>
    </button>
  `;
  li.querySelector("button").addEventListener("click", () => selectSite(s, true));
  listEl.appendChild(li);
}

function renderCard(s) {
  const sky = skyAt(eph, tMs, { lat: s.lat, lon: s.lon });
  const hash = `id=${s.id}&t=${toUtcInput(tMs)}`;

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
      <div>
        <span class="chip ${s.status}">${STATUS_LABEL[s.status]}</span>
        <h3 style="margin-top: 6px; font-size: 20px;">${s.name}</h3>
        <div class="muted" style="font-size: 13px;">${s.provider} · ${s.site}</div>
      </div>
      <button class="btn small" id="card-close" aria-label="Cerrar">✕</button>
    </div>

    <p style="font-size: 13px; margin-top: 10px; line-height: 1.5;">${s.outcome}</p>

    <div class="grid cols-2" style="margin-top: 14px; gap: 10px;">
      <div class="metric">
        <div class="k">Elevación Solar</div>
        <div class="v">${sky.sun.el.toFixed(1)}°</div>
        <div class="s">Azimut: ${sky.sun.az.toFixed(0)}°</div>
      </div>
      <div class="metric">
        <div class="k">Elevación Tierra</div>
        <div class="v">${sky.earth.el.toFixed(1)}°</div>
        <div class="s">Azimut: ${sky.earth.az.toFixed(0)}°</div>
      </div>
    </div>

    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px;">
      <a class="btn primary small" href="sitio.html#${hash}">Análisis de Sitio →</a>
      <a class="btn small" href="comparar.html#sc=${s.id},${toUtcInput(tMs)},15">Comparar</a>
      <a class="btn small" href="pathfinder.html#id=${s.id}">Pathfinder</a>
    </div>
  `;

  card.classList.add("open");
  card.querySelector("#card-close").addEventListener("click", () => {
    selected = null;
    card.classList.remove("open");
    updateListHighlight();
  });
}

function updateListHighlight() {
  listEl.querySelectorAll(".pin-btn").forEach((btn) => {
    btn.classList.toggle("active", selected && btn.dataset.id === selected.id);
  });
}

let fly = null;
function selectSite(s, focus) {
  selected = s;
  renderCard(s);
  updateListHighlight();

  if (focus) {
    controls.autoRotate = false;
    userStoppedSpin = true;
    document.getElementById("btn-toggle-spin").textContent = "Rotación: Pausada";
    const dir = latLonToVec(s.lat, s.lon, 1).normalize();
    fly = { from: camera.position.clone(), to: dir.multiplyScalar(2.6), t: 0 };
  }
}

// Raycasting Interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function pickSite(e) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);

  const hits = raycaster.intersectObjects(pins.map(p => p.hit), false);
  if (!hits.length) return null;

  const moonHit = raycaster.intersectObject(raycastSphere, false)[0];
  const h = hits[0];
  if (moonHit && moonHit.distance < h.distance - 0.02) return null; // Behind limb
  return h.object.userData.site;
}

let downPos = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  downPos = [e.clientX, e.clientY];
});

renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downPos || Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 5) return;
  const s = pickSite(e);
  if (s) selectSite(s, true);
});

renderer.domElement.addEventListener("pointermove", (e) => {
  const s = pickSite(e);
  renderer.domElement.style.cursor = s ? "pointer" : "grab";
  if (s) {
    const r = stage.getBoundingClientRect();
    tip.style.display = "block";
    tip.style.left = `${e.clientX - r.left + 12}px`;
    tip.style.top = `${e.clientY - r.top + 12}px`;
    tip.textContent = `${s.name} · ${s.site}`;
  } else {
    tip.style.display = "none";
  }
});

document.getElementById("btn-view-pole").addEventListener("click", () => {
  controls.autoRotate = false;
  userStoppedSpin = true;
  fly = { from: camera.position.clone(), to: new THREE.Vector3(0.9, -2.9, 0.9), t: 0 };
});

document.getElementById("btn-view-near").addEventListener("click", () => {
  fly = { from: camera.position.clone(), to: new THREE.Vector3(3.35, 0.35, 0), t: 0 };
});

document.getElementById("btn-toggle-spin").addEventListener("click", (e) => {
  userStoppedSpin = true;
  controls.autoRotate = !controls.autoRotate;
  e.target.textContent = `Rotación: ${controls.autoRotate ? "Activa" : "Pausada"}`;
});

function resize() {
  const w = stage.clientWidth || 800;
  const h = stage.clientHeight || 600;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(stage);
resize();

const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 1.1);
    const k = 1 - Math.pow(1 - fly.t, 3);
    camera.position.lerpVectors(fly.from, fly.to, k).setLength(
      THREE.MathUtils.lerp(fly.from.length(), fly.to.length(), k)
    );
    if (fly.t >= 1) fly = null;
  }

  const pulse = 1 + 0.25 * Math.sin(performance.now() / 300);
  pins.forEach(p => {
    p.head.scale.setScalar(selected && p.site.id === selected.id ? pulse * 1.4 : 1.0);
  });

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Vista inicial: siempre desde el lado iluminado por el Sol (giro de 180° respecto a la vista anterior,
// que arrancaba en el lado oscuro). La Luna queda quieta 2 s para apreciarla y luego empieza a girar.
let userStoppedSpin = false;
{
  const sv = eph.sample(tMs);
  const sunDir = new THREE.Vector3(sv[0], sv[2], -sv[1]).normalize();
  const flat = new THREE.Vector3(sunDir.x, 0, sunDir.z);
  if (flat.lengthSq() < 0.04) flat.set(1, 0, 0);
  flat.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(35));
  camera.position.set(flat.x * 3.35, -0.78, flat.z * 3.35);
  camera.lookAt(0, 0, 0);
}
setTimeout(() => {
  if (!userStoppedSpin) controls.autoRotate = true;
}, 2000);
applyTime();

// Handle deep-link
const deepId = new URLSearchParams(location.hash.slice(1)).get("id");
if (deepId) {
  const target = sites.find(x => x.id === deepId);
  if (target) selectSite(target, true);
}

animate();


