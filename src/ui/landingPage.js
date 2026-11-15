import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BASE, renderNav, loadEphemeris } from "./common.js";

renderNav("index.html");

const container = document.getElementById("hero-moon-canvas");
if (!container) throw new Error("No canvas container");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 0.15, 2.65);
camera.lookAt(0, 0, 0);

// Starfield particles in the background
{
  const starCount = 1400;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 30 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0x94a3b8,
    size: 0.12,
    transparent: true,
    opacity: 0.75
  });
  scene.add(new THREE.Points(starGeo, starMat));
}

// Lighting: Iluminación frontal 3/4 para que la cara visible en Home luzca siempre iluminada
const sunLight = new THREE.DirectionalLight(0xfff7ed, 3.4);
sunLight.position.set(-4.2, 2.0, 5.5);
scene.add(sunLight);

const ambientLight = new THREE.HemisphereLight(0x2d3b55, 0x090d16, 0.55);
scene.add(ambientLight);

// Moon model container
const moonGroup = new THREE.Group();
scene.add(moonGroup);

// Load the 3D model provided by the user: luna.glb
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  `${BASE}models/luna.glb`,
  (gltf) => {
    const model = gltf.scene;
    // Normalize model to radius 1.0 (bounds are ~500)
    model.scale.setScalar(1.0 / 500.0);
    // Center model
    model.position.set(0, 0, 0);

    // Apply high-quality PBR settings to materials
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.roughness = 0.92;
        child.material.metalness = 0.04;
      }
    });

    moonGroup.add(model);
  },
  undefined,
  () => {
    // Graceful fallback to procedural sphere if glb format issue occurs
    const texLoader = new THREE.TextureLoader();
    const sphereGeo = new THREE.SphereGeometry(1, 64, 48);
    const sphereMat = new THREE.MeshStandardMaterial({
      map: texLoader.load(`${BASE}textures/moon_lola_2k.jpg`),
      bumpMap: texLoader.load(`${BASE}textures/moon_lola_height_2k.png`),
      bumpScale: 1.2,
      roughness: 0.95
    });
    moonGroup.add(new THREE.Mesh(sphereGeo, sphereMat));
  }
);

// Mantenemos la luz fija en la cara frontal en Home (la vista con efemérides reales está en Mapa)

function resize() {
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // En escritorio: Luna grande a la derecha como fondo. En móvil: centrada pasando por debajo del texto.
  if (w > 1024) {
    moonGroup.position.set(0.85, -0.04, 0);
    camera.position.setLength(2.65);
  } else {
    moonGroup.position.set(0, -0.18, 0);
    const v = THREE.MathUtils.degToRad(camera.fov / 2);
    const hFov = Math.atan(Math.tan(v) * camera.aspect);
    const d = 1.15 / Math.sin(Math.min(v, hFov));
    camera.position.setLength(Math.max(2.9, d));
  }
}
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(container);
resize();

function animate() {
  requestAnimationFrame(animate);
  moonGroup.rotation.y += 0.0016;
  renderer.render(scene, camera);
}
animate();

