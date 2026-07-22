import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/controls/OrbitControls.js";
import {
  cAbs,
  collisionCertificate,
  evaluatePolynomial,
  fiberPolynomialCoefficients,
  formatComplex,
  formatNumber,
  frameCurvePoint,
  realCriticalTargets,
  reconstructSource,
  solvePolynomial,
  threeRealPreset,
  verifyCollisionNumerically,
} from "./math.js";

const COLORS = {
  cyan: 0x57e6ff,
  violet: 0xae7dff,
  magenta: 0xff5edb,
  gold: 0xffd36a,
  green: 0x63f2b5,
  ink: 0xf5f7ff,
  muted: 0x7d87a9,
  deep: 0x070817,
};

const elements = {
  scene: document.querySelector("#scene"),
  fallback: document.querySelector("#webgl-fallback"),
  degree: document.querySelector("#degree"),
  degreeOutput: document.querySelector("#degree-output"),
  alpha: document.querySelector("#alpha"),
  beta: document.querySelector("#beta"),
  gamma: document.querySelector("#gamma"),
  alphaOutput: document.querySelector("#alpha-output"),
  betaOutput: document.querySelector("#beta-output"),
  gammaOutput: document.querySelector("#gamma-output"),
  animateTarget: document.querySelector("#animate-target"),
  resetCamera: document.querySelector("#reset-camera"),
  collisionPreset: document.querySelector("#collision-preset"),
  driftPreset: document.querySelector("#drift-preset"),
  escapePreset: document.querySelector("#escape-preset"),
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  degreeMetric: document.querySelector("#degree-metric"),
  rootCountMetric: document.querySelector("#root-count-metric"),
  residualMetric: document.querySelector("#residual-metric"),
  equationDetail: document.querySelector("#equation-detail"),
  solverStatus: document.querySelector("#solver-status"),
  rootIndex: document.querySelector("#root-index"),
  rootT: document.querySelector("#root-t"),
  rootX: document.querySelector("#root-x"),
  rootY: document.querySelector("#root-y"),
  rootZ: document.querySelector("#root-z"),
  previousRoot: document.querySelector("#previous-root"),
  nextRoot: document.querySelector("#next-root"),
  truthStrip: document.querySelector(".truth-strip"),
  truthIcon: document.querySelector("#truth-icon"),
  truthTitle: document.querySelector("#truth-title"),
  truthDetail: document.querySelector("#truth-detail"),
  tooltip: document.querySelector("#root-tooltip"),
  legendPrimary: document.querySelector("#legend-primary"),
  legendSecondary: document.querySelector("#legend-secondary"),
};

const initialCertificate = collisionCertificate(5);
const state = {
  d: 5,
  ...initialCertificate.target,
  mode: "fiber",
  activePreset: "collision",
  animateTarget: false,
  animationCenter: initialCertificate.target.alpha,
  selectedRoot: 0,
  solution: null,
  escapeT: null,
  lastStructureKey: "",
  lastAnimatedUpdate: 0,
};

let renderer;
let scene;
let camera;
let controls;
let structureGroup;
let overlayGroup;
let interactiveRoots = [];
let selectedMeshes = [];
let hoveredRoot = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

function createRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    console.error(error);
    elements.fallback.hidden = false;
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  elements.scene.append(renderer.domElement);
  return true;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createStarfield() {
  const random = seededRandom(20260720);
  const positions = [];
  const colors = [];
  const cyan = new THREE.Color(COLORS.cyan);
  const violet = new THREE.Color(COLORS.violet);
  for (let index = 0; index < 1100; index += 1) {
    const radius = 12 + random() * 17;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
    const color = cyan.clone().lerp(violet, random());
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geometry, material);
  stars.rotation.z = 0.28;
  scene.add(stars);
}

function initializeScene() {
  if (!createRenderer()) return;
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.deep, 0.035);
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(9.5, 6.6, 10.5);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = true;
  controls.minDistance = 4;
  controls.maxDistance = 30;
  controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotateSpeed = 0.34;
  controls.target.set(0, 0.35, 0);

  scene.add(new THREE.HemisphereLight(0xb9d8ff, 0x170c2f, 1.35));
  const keyLight = new THREE.DirectionalLight(COLORS.cyan, 2.2);
  keyLight.position.set(6, 9, 5);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(COLORS.magenta, 25, 30, 2);
  rimLight.position.set(-7, 3, -6);
  scene.add(rimLight);
  const goldLight = new THREE.PointLight(COLORS.gold, 18, 22, 2);
  goldLight.position.set(5, -2, 4);
  scene.add(goldLight);

  structureGroup = new THREE.Group();
  overlayGroup = new THREE.Group();
  scene.add(structureGroup, overlayGroup);
  createStarfield();

  const resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(elements.scene);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerleave", clearHover);
  renderer.domElement.addEventListener("click", handleRootClick);
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
  });
  resizeRenderer();
  renderer.setAnimationLoop(renderFrame);
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const width = Math.max(1, elements.scene.clientWidth);
  const height = Math.max(1, elements.scene.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
    child.texture?.dispose?.();
  });
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    disposeObject(child);
  }
}

function compress(value, scale = 1) {
  if (!Number.isFinite(value)) return Math.sign(value || 1) * 6.5;
  return Math.sign(value) * Math.log1p(Math.abs(value) / scale);
}

function mapFiberPoint(point) {
  return new THREE.Vector3(
    point.t * 1.72,
    compress(point.alpha, 2.2) * 1.58,
    compress(point.x, 1.1) * 1.24,
  );
}

function createTextSprite(text, color = "#f5f7ff") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "500 42px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 14;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

function createAxisLine(start, end, color, opacity = 0.4) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geometry, material);
}

function addFiberAxes() {
  const grid = new THREE.GridHelper(12, 12, 0x2d405d, 0x19243b);
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  grid.position.y = -4.5;
  structureGroup.add(grid);
  structureGroup.add(
    createAxisLine(new THREE.Vector3(-5.8, -4.5, 0), new THREE.Vector3(5.8, -4.5, 0), COLORS.cyan),
    createAxisLine(new THREE.Vector3(0, -5.3, 0), new THREE.Vector3(0, 5.8, 0), COLORS.violet),
    createAxisLine(new THREE.Vector3(0, -4.5, -5.8), new THREE.Vector3(0, -4.5, 5.8), COLORS.magenta),
  );
  const tLabel = createTextSprite("T", "#57e6ff");
  tLabel.position.set(6.1, -4.45, 0);
  const alphaLabel = createTextSprite("α target", "#ae7dff");
  alphaLabel.position.set(0, 6.1, 0);
  const xLabel = createTextSprite("escape  asinh(x)", "#ff5edb");
  xLabel.position.set(0, -4.35, 6.2);
  structureGroup.add(tLabel, alphaLabel, xLabel);
}

function addFiberSegment(points, index) {
  if (points.length < 4) return;
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.45);
  const tubularSegments = Math.min(260, Math.max(30, points.length * 2));
  const color = index % 2 === 0 ? COLORS.cyan : COLORS.violet;
  const glowGeometry = new THREE.TubeGeometry(curve, tubularSegments, 0.105, 6, false);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const coreGeometry = new THREE.TubeGeometry(curve, tubularSegments, 0.034, 8, false);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.5,
    roughness: 0.22,
    metalness: 0.35,
  });
  structureGroup.add(new THREE.Mesh(glowGeometry, glowMaterial), new THREE.Mesh(coreGeometry, coreMaterial));
}

function buildFiberStructure() {
  addFiberAxes();
  const tRange = state.d === 3 ? 4.2 : 3.25;
  const samples = 760;
  const segments = [];
  let active = [];
  let previous = null;
  for (let index = 0; index <= samples; index += 1) {
    const t = -tRange + (2 * tRange * index) / samples;
    const point = frameCurvePoint(state.d, t, state.beta, state.gamma);
    const mapped = mapFiberPoint(point);
    const valid = Number.isFinite(point.alpha)
      && Number.isFinite(point.x)
      && Math.abs(point.slope) > 0.008
      && mapped.length() < 16;
    const jump = previous ? mapped.distanceTo(previous) : 0;
    if (!valid || jump > 1.7) {
      if (active.length >= 4) segments.push(active);
      active = [];
      previous = null;
      continue;
    }
    active.push(mapped);
    previous = mapped;
  }
  if (active.length >= 4) segments.push(active);
  segments.forEach(addFiberSegment);

  const criticalTargets = realCriticalTargets(state.d, state.beta, state.gamma);
  criticalTargets.slice(0, 10).forEach((critical, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    const position = mapFiberPoint({ ...critical, x: side * 120 });
    const geometry = new THREE.TorusGeometry(0.13, 0.018, 8, 28);
    const material = new THREE.MeshBasicMaterial({
      color: COLORS.magenta,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    marker.rotation.x = Math.PI / 2;
    structureGroup.add(marker);
  });
}

function createRootMarker(root, position, rootIndex, certified = false) {
  const selected = rootIndex === state.selectedRoot;
  const color = certified ? COLORS.gold : Math.abs(root.im) < 1e-7 ? COLORS.magenta : COLORS.cyan;
  const geometry = new THREE.SphereGeometry(selected ? 0.135 : 0.105, 24, 18);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: selected ? 4.2 : 2.7,
    metalness: 0.2,
    roughness: 0.18,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.userData.rootIndex = rootIndex;
  mesh.userData.root = root;
  mesh.userData.certified = certified;

  const haloGeometry = new THREE.SphereGeometry(selected ? 0.29 : 0.22, 18, 12);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: selected ? 0.16 : 0.09,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.position.copy(position);
  halo.userData.rootIndex = rootIndex;
  halo.userData.root = root;
  overlayGroup.add(halo, mesh);
  interactiveRoots.push(mesh, halo);
  if (selected) selectedMeshes.push(mesh, halo);
}

function isCertifiedRoot(root) {
  if (state.activePreset !== "collision" || Math.abs(root.im) > 1e-7) return false;
  const certificate = collisionCertificate(state.d);
  return certificate.finiteRootTs.some((value) => Math.abs(root.re - value) < 2e-5);
}

function addTargetPlane() {
  const y = compress(state.alpha, 2.2) * 1.58;
  const geometry = new THREE.PlaneGeometry(12.5, 11.5, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: COLORS.gold,
    transparent: true,
    opacity: 0.055,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0.28 }),
  );
  edges.rotation.copy(plane.rotation);
  edges.position.copy(plane.position);
  overlayGroup.add(plane, edges);
}

function buildFiberOverlay() {
  addTargetPlane();
  state.solution.roots.forEach((root, index) => {
    if (Math.abs(root.im) > 1e-6) return;
    const source = reconstructSource(state.d, root, state);
    const point = mapFiberPoint({ t: root.re, alpha: state.alpha, x: source.x.re });
    createRootMarker(root, point, index, isCertifiedRoot(root));
  });
}

function landscapeHeight(root) {
  const coefficients = fiberPolynomialCoefficients(state.d, state.alpha, state.beta, state.gamma);
  return Math.min(5.7, Math.log1p(cAbs(evaluatePolynomial(coefficients, root))) * 0.72);
}

function buildLandscapeStructure() {
  const span = 3.35;
  const resolution = window.innerWidth < 700 ? 62 : 84;
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  for (let row = 0; row <= resolution; row += 1) {
    const im = -span + (2 * span * row) / resolution;
    for (let column = 0; column <= resolution; column += 1) {
      const re = -span + (2 * span * column) / resolution;
      const height = landscapeHeight({ re, im });
      positions.push(re * 1.52, height - 1.8, im * 1.52);
      const normalized = height / 5.7;
      color.setHSL(0.52 + normalized * 0.28, 0.82, 0.48 + normalized * 0.12);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const a = row * (resolution + 1) + column;
      const b = a + 1;
      const c = a + resolution + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    roughness: 0.38,
    metalness: 0.18,
    side: THREE.DoubleSide,
  });
  structureGroup.add(new THREE.Mesh(geometry, material));

  const wireframe = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: COLORS.ink, transparent: true, opacity: 0.045 }),
  );
  structureGroup.add(wireframe);

  const grid = new THREE.GridHelper(10.2, 12, 0x2d405d, 0x19243b);
  grid.position.y = -1.82;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  structureGroup.add(grid);

  const realLabel = createTextSprite("Re(T)", "#57e6ff");
  realLabel.position.set(5.9, -1.75, 0);
  const imaginaryLabel = createTextSprite("Im(T)", "#ff5edb");
  imaginaryLabel.position.set(0, -1.75, 5.9);
  const magnitudeLabel = createTextSprite("log(1 + |P|)", "#ae7dff");
  magnitudeLabel.position.set(0, 4.5, 0);
  structureGroup.add(realLabel, imaginaryLabel, magnitudeLabel);
}

function buildLandscapeOverlay() {
  state.solution.roots.forEach((root, index) => {
    const height = landscapeHeight(root);
    const position = new THREE.Vector3(root.re * 1.52, height - 1.72, root.im * 1.52);
    createRootMarker(root, position, index, isCertifiedRoot(root));
    const beaconGeometry = new THREE.CylinderGeometry(0.008, 0.008, 1.1, 6);
    const beaconMaterial = new THREE.MeshBasicMaterial({
      color: isCertifiedRoot(root) ? COLORS.gold : COLORS.cyan,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
    });
    const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
    beacon.position.set(position.x, position.y + 0.55, position.z);
    overlayGroup.add(beacon);
  });
}

function structureKey() {
  const base = `${state.mode}|${state.d}|${state.beta.toFixed(6)}|${state.gamma.toFixed(6)}`;
  return state.mode === "landscape" ? `${base}|${state.alpha.toFixed(6)}` : base;
}

function rebuildScene() {
  if (!renderer) return;
  const key = structureKey();
  if (key !== state.lastStructureKey) {
    clearGroup(structureGroup);
    if (state.mode === "fiber") buildFiberStructure();
    else buildLandscapeStructure();
    state.lastStructureKey = key;
  }

  clearGroup(overlayGroup);
  interactiveRoots = [];
  selectedMeshes = [];
  if (state.mode === "fiber") buildFiberOverlay();
  else buildLandscapeOverlay();
}

function solveCurrentFiber() {
  const coefficients = fiberPolynomialCoefficients(state.d, state.alpha, state.beta, state.gamma);
  state.solution = solvePolynomial(coefficients);
  if (state.selectedRoot >= state.solution.roots.length) state.selectedRoot = 0;
}

function targetsMatch(a, b, tolerance = 1e-9) {
  return Math.abs(a.alpha - b.alpha) < tolerance
    && Math.abs(a.beta - b.beta) < tolerance
    && Math.abs(a.gamma - b.gamma) < tolerance;
}

function formatResidual(value) {
  if (!Number.isFinite(value)) return "not finite";
  if (value < 1e-12) return "< 1e−12";
  return value.toExponential(2).replace("e-", "e−");
}

function escapingSheetCount() {
  return state.activePreset === "escape" && Number.isFinite(state.escapeT) ? 2 : 0;
}

function rootIsAtEscapeWall(root) {
  return escapingSheetCount() > 0
    && Math.hypot(root.re - state.escapeT, root.im) < 2e-4;
}

function updateOutputs() {
  elements.degree.value = String(state.d);
  elements.degreeOutput.value = `d = ${state.d}`;
  elements.alpha.value = String(state.alpha);
  elements.beta.value = String(state.beta);
  elements.gamma.value = String(state.gamma);
  elements.alphaOutput.value = formatNumber(state.alpha);
  elements.betaOutput.value = formatNumber(state.beta);
  elements.gammaOutput.value = formatNumber(state.gamma);
  elements.degreeMetric.textContent = String(state.d);

  const degreeLossAtInfinity = Math.max(0, state.d - state.solution.degree);
  const escaping = escapingSheetCount();
  const rootsAtInfinity = degreeLossAtInfinity + escaping;
  const finitePreimages = Math.max(0, state.solution.degree - escaping);
  elements.rootCountMetric.textContent = rootsAtInfinity
    ? `${finitePreimages} + ${rootsAtInfinity}∞`
    : String(finitePreimages);
  elements.residualMetric.textContent = formatResidual(state.solution.residual);
  elements.solverStatus.textContent = escaping
    ? "repeated root · P′(T) = 0"
    : state.solution.converged ? "converged" : "near a multiple root";
  elements.solverStatus.style.color = escaping || !state.solution.converged ? "var(--gold)" : "";
  elements.equationDetail.textContent = rootsAtInfinity
    ? `degree ${state.d} generically · ${finitePreimages} finite preimages · ${rootsAtInfinity} sheets at infinity`
    : `degree ${state.d} · ${state.solution.roots.length} finite complex roots`;

  const certificate = collisionCertificate(state.d);
  const onCertificate = targetsMatch(state, certificate.target);
  elements.truthStrip.classList.toggle("is-numeric", !onCertificate);
  if (onCertificate) {
    const verification = verifyCollisionNumerically(state.d);
    elements.truthIcon.textContent = verification.ok ? "✓" : "!";
    elements.truthTitle.textContent = verification.ok ? "Certificate verified" : "Certificate mismatch";
    const target = certificate.target;
    elements.truthDetail.textContent = `distinct inputs → (${formatNumber(target.alpha)}, ${formatNumber(target.beta)}, ${formatNumber(target.gamma)})`;
  } else {
    elements.truthIcon.textContent = "≈";
    elements.truthTitle.textContent = "Numerical fiber solved";
    elements.truthDetail.textContent = escaping
      ? `two sheets escape · root residual ${formatResidual(state.solution.residual)}`
      : `${state.solution.roots.length} roots · residual ${formatResidual(state.solution.residual)}`;
  }

  for (const button of [elements.collisionPreset, elements.driftPreset, elements.escapePreset]) {
    button.classList.remove("is-active");
  }
  if (state.activePreset === "collision") elements.collisionPreset.classList.add("is-active");
  if (state.activePreset === "drift") elements.driftPreset.classList.add("is-active");
  if (state.activePreset === "escape") elements.escapePreset.classList.add("is-active");
}

function updateInspector() {
  const roots = state.solution?.roots ?? [];
  if (!roots.length) {
    elements.rootIndex.textContent = "no finite roots";
    for (const element of [elements.rootT, elements.rootX, elements.rootY, elements.rootZ]) element.textContent = "—";
    return;
  }
  const index = ((state.selectedRoot % roots.length) + roots.length) % roots.length;
  state.selectedRoot = index;
  const root = roots[index];
  const source = reconstructSource(state.d, root, state);
  elements.rootIndex.textContent = `root ${index + 1} / ${roots.length}`;
  if (rootIsAtEscapeWall(root)) {
    elements.rootT.textContent = formatNumber(state.escapeT);
    elements.rootX.textContent = "∞  (P′ = 0)";
    elements.rootY.textContent = "sheet at infinity";
    elements.rootZ.textContent = "outside affine chart";
  } else {
    elements.rootT.textContent = formatComplex(root);
    elements.rootX.textContent = formatComplex(source.x);
    elements.rootY.textContent = formatComplex(source.y);
    elements.rootZ.textContent = formatComplex(source.z);
  }
}

function updateLegends() {
  const landscape = state.mode === "landscape";
  elements.legendPrimary.textContent = landscape ? "|P(T)| landscape" : "real fiber curve";
  elements.legendSecondary.textContent = landscape ? "complex root / preimage" : "real finite preimage";
}

function updateAll({ resetStructure = false } = {}) {
  if (resetStructure) state.lastStructureKey = "";
  solveCurrentFiber();
  updateOutputs();
  updateInspector();
  updateLegends();
  rebuildScene();
}

function applyTarget(target, preset, { escapeT = null } = {}) {
  state.alpha = target.alpha;
  state.beta = target.beta;
  state.gamma = target.gamma;
  state.activePreset = preset;
  state.escapeT = escapeT;
  state.animateTarget = false;
  state.animationCenter = state.alpha;
  state.selectedRoot = 0;
  elements.animateTarget.setAttribute("aria-pressed", "false");
  updateAll({ resetStructure: true });
}

function resetCamera() {
  if (!camera || !controls) return;
  if (state.mode === "fiber") camera.position.set(9.5, 6.6, 10.5);
  else camera.position.set(8.7, 7.3, 9.6);
  controls.target.set(0, state.mode === "fiber" ? 0.35 : 0.2, 0);
  controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.update();
}

function setMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  state.lastStructureKey = "";
  for (const button of elements.modeButtons) {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  resetCamera();
  updateAll({ resetStructure: true });
}

function selectRoot(index) {
  const count = state.solution?.roots.length ?? 0;
  if (!count) return;
  state.selectedRoot = ((index % count) + count) % count;
  updateInspector();
  rebuildScene();
}

function pointerCoordinates(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  return rect;
}

function intersectRoot(event) {
  if (!renderer || !camera) return null;
  pointerCoordinates(event);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(interactiveRoots, false)[0] ?? null;
}

function handlePointerMove(event) {
  const intersection = intersectRoot(event);
  if (!intersection) {
    clearHover();
    return;
  }
  hoveredRoot = intersection.object.userData.rootIndex;
  const root = intersection.object.userData.root;
  const rect = elements.scene.getBoundingClientRect();
  elements.tooltip.hidden = false;
  elements.tooltip.style.left = `${Math.min(event.clientX - rect.left + 14, rect.width - 180)}px`;
  elements.tooltip.style.top = `${Math.max(10, event.clientY - rect.top - 42)}px`;
  elements.tooltip.innerHTML = `T = ${formatComplex(root)}<small>click to inspect this sheet</small>`;
}

function clearHover() {
  hoveredRoot = null;
  elements.tooltip.hidden = true;
}

function handleRootClick(event) {
  const intersection = intersectRoot(event);
  if (intersection) selectRoot(intersection.object.userData.rootIndex);
}

function renderFrame() {
  if (!renderer || !scene || !camera) return;
  const elapsed = clock.getElapsedTime();
  if (state.animateTarget && elapsed - state.lastAnimatedUpdate > 0.11) {
    state.lastAnimatedUpdate = elapsed;
    const amplitude = state.d === 3 ? 0.9 : 1.25;
    const alphaMinimum = Number.parseFloat(elements.alpha.min);
    const alphaMaximum = Number.parseFloat(elements.alpha.max);
    state.alpha = Math.max(
      alphaMinimum,
      Math.min(alphaMaximum, state.animationCenter + amplitude * Math.sin(elapsed * 0.62)),
    );
    state.activePreset = "custom";
    state.escapeT = null;
    updateAll();
  }
  const pulse = 1 + 0.08 * Math.sin(elapsed * 2.4);
  selectedMeshes.forEach((mesh, index) => {
    mesh.scale.setScalar(index % 2 === 0 ? pulse : 1 + (pulse - 1) * 0.6);
  });
  controls.update();
  renderer.render(scene, camera);
}

elements.degree.addEventListener("input", () => {
  state.d = Number.parseInt(elements.degree.value, 10);
  applyTarget(collisionCertificate(state.d).target, "collision");
});

for (const [key, element] of [["alpha", elements.alpha], ["beta", elements.beta], ["gamma", elements.gamma]]) {
  element.addEventListener("input", () => {
    state[key] = Number.parseFloat(element.value);
    state.activePreset = "custom";
    state.escapeT = null;
    state.animateTarget = false;
    elements.animateTarget.setAttribute("aria-pressed", "false");
    updateAll({ resetStructure: key !== "alpha" });
  });
}

elements.collisionPreset.addEventListener("click", () => {
  applyTarget(collisionCertificate(state.d).target, "collision");
});

elements.driftPreset.addEventListener("click", () => {
  applyTarget(threeRealPreset(state.d), "drift");
});

elements.escapePreset.addEventListener("click", () => {
  const criticalTargets = realCriticalTargets(state.d, state.beta, state.gamma);
  const nearest = criticalTargets.reduce((best, current) => {
    if (!best) return current;
    return Math.abs(current.alpha - state.alpha) < Math.abs(best.alpha - state.alpha) ? current : best;
  }, null);
  const target = nearest
    ? { alpha: nearest.alpha, beta: state.beta, gamma: state.gamma }
    : { ...collisionCertificate(state.d).target };
  applyTarget(target, "escape", { escapeT: nearest?.t ?? null });
});

elements.animateTarget.addEventListener("click", () => {
  state.animateTarget = !state.animateTarget;
  state.animationCenter = state.alpha;
  elements.animateTarget.setAttribute("aria-pressed", String(state.animateTarget));
  elements.animateTarget.querySelector("span").textContent = state.animateTarget ? "Ⅱ" : "▶";
});

elements.resetCamera.addEventListener("click", resetCamera);
elements.previousRoot.addEventListener("click", () => selectRoot(state.selectedRoot - 1));
elements.nextRoot.addEventListener("click", () => selectRoot(state.selectedRoot + 1));
elements.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

initializeScene();
updateAll({ resetStructure: true });
