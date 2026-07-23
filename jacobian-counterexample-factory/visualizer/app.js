import {
  analyzeAutomorphismFiber,
  analyzeCounterexampleFiber,
  automorphismOffset,
  cAbs,
  collisionCertificate,
  complex,
  deriveFiberDisplayTransform,
  deriveLandscapeDisplayTransform,
  evaluatePolynomial,
  formatComplex,
  formatNumber,
  frameCurvePoint,
  isFiniteComplex,
  polynomialEvaluationScale,
  realCriticalTargets,
  threeRealPreset,
  verifyCollisionNumerically,
} from "./math.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const elements = {
  canvas: $("#scene"), renderStatus: $("#render-status"), tooltip: $("#tooltip"),
  familyButtons: $$('[data-family]'), modeButtons: $$('[data-mode]'),
  degree: $("#degree"), degreeOutput: $("#degree-output"), degreeLabel: $("#degree-label"),
  degreeMin: $("#degree-min"), degreeMax: $("#degree-max"),
  alpha: $("#alpha"), beta: $("#beta"), gamma: $("#gamma"),
  alphaNumber: $("#alpha-number"), betaNumber: $("#beta-number"), gammaNumber: $("#gamma-number"),
  animate: $("#animate-target"), resetCamera: $("#reset-camera"),
  presetOne: $("#preset-one"), presetTwo: $("#preset-two"), presetThree: $("#preset-three"),
  classificationSymbol: $("#classification-symbol"), classificationTitle: $("#classification-title"),
  classificationDetail: $("#classification-detail"), deckEyebrow: $("#deck-eyebrow"), deckTitle: $("#deck-title"),
  degreeMetricLabel: $("#degree-metric-label"), degreeMetric: $("#degree-metric"), finiteMetric: $("#finite-metric"),
  escapeMetric: $("#escape-metric"), jacobianMetric: $("#jacobian-metric"), residualMetric: $("#residual-metric"),
  axisTransform: $("#axis-transform"), solverStatus: $("#solver-status"), equationExpression: $("#equation-expression"),
  equationDetail: $("#equation-detail"), accountingTotal: $("#accounting-total"), countChart: $("#count-chart"),
  countBoundary: $("#count-boundary"), countEscape: $("#count-escape"), countUnresolved: $("#count-unresolved"),
  sheetIndex: $("#sheet-index"), sheetStatus: $("#sheet-status"), previousSheet: $("#previous-sheet"), nextSheet: $("#next-sheet"),
  rootT: $("#root-t"), rootMultiplicity: $("#root-multiplicity"), rootX: $("#root-x"), rootY: $("#root-y"),
  rootZ: $("#root-z"), rootChart: $("#root-chart"), truthStrip: $("#truth-strip"), truthIcon: $("#truth-icon"),
  truthTitle: $("#truth-title"), truthDetail: $("#truth-detail"), howToText: $("#how-to-text"),
  legendCurve: $("#legend-curve"), legendFinite: $("#legend-finite"), footerLead: $("#footer-lead"), footerDetail: $("#footer-detail"),
};

const initialCertificate = collisionCertificate(5);
const state = {
  family: "counterexample",
  variant: "chain",
  mode: "fiber",
  d: 5,
  ...initialCertificate.target,
  activePreset: "collision",
  animate: false,
  animationCenter: initialCertificate.target.alpha,
  selectedSheet: 0,
  analysis: null,
  sceneData: null,
  lastAnimatedUpdate: 0,
};
const familySnapshots = {
  counterexample: null,
  automorphism: { d: 3, variant: "chain", alpha: 2, beta: 1, gamma: 0, activePreset: "chain" },
};
const camera = {
  yaw: -0.58,
  pitch: 0.34,
  zoom: 1,
  panX: 0,
  panY: 0,
  autoRotate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
};
const pointerState = { down: false, mode: "rotate", x: 0, y: 0, moved: 0 };
const ctx = elements.canvas.getContext("2d", { alpha: false, desynchronized: true });
let viewport = { width: 1, height: 1, dpr: 1 };
let projectedMarkers = [];
let hoveredMarker = null;
let stars = [];
let frameRequested = true;
let lastFrameTime = 0;

const COLORS = {
  cyan: "#5be8ff", violet: "#a986ff", magenta: "#ff62d2", gold: "#ffd36a",
  green: "#62efb4", orange: "#ff9a62", ink: "#f4f7ff", muted: "#7d89ad",
};

function isAutomorphism() { return state.family === "automorphism"; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function compress(value, scale = 1) {
  if (!Number.isFinite(value)) return Math.sign(value || 1) * 5.8;
  return Math.asinh(value / scale);
}
function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const p = (sorted.length - 1) * q;
  const lo = Math.floor(p), hi = Math.ceil(p);
  return lo === hi ? sorted[lo] : sorted[lo] * (hi - p) + sorted[hi] * (p - lo);
}
function targetsMatch(a, b, tolerance = 1e-10) {
  return Math.abs(a.alpha - b.alpha) <= tolerance && Math.abs(a.beta - b.beta) <= tolerance && Math.abs(a.gamma - b.gamma) <= tolerance;
}
function formatResidual(value) {
  if (!Number.isFinite(value)) return "undefined";
  if (value < 1e-13) return "< 1e−13";
  return value.toExponential(2).replace("e-", "e−");
}
function snapshotTarget() { return { alpha: state.alpha, beta: state.beta, gamma: state.gamma }; }

function analyzeCurrentFiber() {
  const target = snapshotTarget();
  state.analysis = isAutomorphism()
    ? analyzeAutomorphismFiber(state.d, target, state.variant)
    : analyzeCounterexampleFiber(state.d, target);
  if (state.selectedSheet >= state.analysis.sheets.length) state.selectedSheet = 0;
}

function currentCriticalPoints() {
  return isAutomorphism() ? [] : realCriticalTargets(state.d, state.beta, state.gamma);
}

function fiberWorldPoint(point, tTransform, rootCenter = 0) {
  if (isAutomorphism()) {
    return {
      x: (point.t - rootCenter) * 1.25,
      y: (point.alpha - state.alpha) * 1.25,
      z: (point.x - rootCenter) * 1.25,
    };
  }
  return {
    x: tTransform.forward(point.t),
    y: clamp(compress(point.alpha - state.alpha, 2.2) * 1.55, -5.6, 5.6),
    z: clamp(compress(point.x, 1.1) * 1.25, -5.6, 5.6),
  };
}

function buildFiberScene() {
  const analysis = state.analysis;
  const criticalPoints = currentCriticalPoints();
  const transform = deriveFiberDisplayTransform(analysis, criticalPoints);
  const tAxis = transform.tAxis;
  const rootCenter = isAutomorphism() ? analysis.finiteChartRoots[0].root.re : 0;
  const segments = [];
  let active = [];
  let previous = null;
  const samples = innerWidth < 700 ? 460 : 760;

  for (let index = 0; index <= samples; index += 1) {
    const displayT = -tAxis.sceneExtent + (2 * tAxis.sceneExtent * index) / samples;
    const t = isAutomorphism() ? rootCenter + displayT / 1.25 : tAxis.inverse(displayT);
    const point = isAutomorphism()
      ? { t, alpha: t + automorphismOffset(state.d, state.beta, state.gamma, state.variant), slope: 1, x: t }
      : frameCurvePoint(state.d, t, state.beta, state.gamma);
    const world = fiberWorldPoint(point, tAxis, rootCenter);
    const valid = Number.isFinite(point.alpha) && Number.isFinite(point.x)
      && Number.isFinite(world.x) && Number.isFinite(world.y) && Number.isFinite(world.z)
      && (isAutomorphism() || Math.abs(point.slope) > 1e-9);
    const jump = previous ? Math.hypot(world.x - previous.x, world.y - previous.y, world.z - previous.z) : 0;
    if (!valid || jump > 1.15) {
      if (active.length >= 3) segments.push(active);
      active = [];
      previous = null;
      continue;
    }
    active.push(world);
    previous = world;
  }
  if (active.length >= 3) segments.push(active);

  const markers = [];
  for (const entry of analysis.finiteChartRoots) {
    if (Math.abs(entry.root.im) > 1e-7 || entry.kind !== "finite-chart") continue;
    const point = fiberWorldPoint({ t: entry.root.re, alpha: state.alpha, x: entry.source.x.re }, tAxis, rootCenter);
    markers.push({ entry, world: point, type: "finite", label: `T = ${formatComplex(entry.root)}` });
  }
  for (const entry of analysis.repeatedEntries) {
    if (Math.abs(entry.root.im) > 1e-7) continue;
    const x = isAutomorphism() ? 0 : tAxis.forward(entry.root.re);
    markers.push({ entry, world: { x, y: 0, z: 5.2 }, type: "escape", label: `${entry.multiplicity} sheets → ∞` });
    markers.push({ entry, world: { x, y: 0, z: -5.2 }, type: "escape-ghost", label: `${entry.multiplicity} sheets → ∞` });
  }
  for (const entry of analysis.boundaryEntries) {
    markers.push({ entry, world: { x: -3.7, y: -2.4, z: 2.4 }, type: "boundary", label: "finite source on x = 0" });
  }
  for (const entry of analysis.infinityEntries) {
    markers.push({ entry, world: { x: 3.7, y: 2.8, z: -2.4 }, type: "escape", label: `${entry.multiplicity} sheets outside affine fiber` });
  }

  return {
    kind: "fiber",
    segments,
    markers,
    transform,
    criticalPoints,
    targetPlane: true,
    rootCenter,
  };
}

function buildLandscapeScene() {
  const analysis = state.analysis;
  const transform = deriveLandscapeDisplayTransform(analysis);
  const span = 4.8;
  const resolution = innerWidth < 700 ? 30 : 42;
  const coefficients = analysis.coefficients; // deliberately computed once per mesh
  const samples = [];
  const rawValues = [];
  for (let row = 0; row <= resolution; row += 1) {
    const z = -span + (2 * span * row) / resolution;
    const line = [];
    for (let column = 0; column <= resolution; column += 1) {
      const x = -span + (2 * span * column) / resolution;
      const t = transform.inverse(x, z);
      const value = cAbs(evaluatePolynomial(coefficients, t));
      rawValues.push(value);
      line.push({ x, z, t, value, y: 0 });
    }
    samples.push(line);
  }
  const finiteValues = rawValues.filter(Number.isFinite);
  const valueScale = Math.max(1e-12, quantile(finiteValues, 0.58) || polynomialEvaluationScale(coefficients, complex(0, 0)) || 1);
  for (const row of samples) {
    for (const point of row) point.y = clamp(Math.log1p(point.value / valueScale) * 2.35 - 2.45, -2.45, 5.4);
  }

  const markers = [];
  for (const entry of analysis.allPolynomialRoots) {
    if (!entry.displayRoot || !isFiniteComplex(entry.displayRoot)) continue;
    const p = transform.forward(entry.displayRoot);
    markers.push({
      entry,
      world: { x: p.x, y: -2.36, z: p.z },
      type: entry.kind === "escape-repeated-root" ? "escape" : "finite",
      label: `${entry.kind === "escape-repeated-root" ? "repeated root" : "root"} T = ${formatComplex(entry.displayRoot)}`,
    });
  }
  for (const entry of analysis.boundaryEntries) {
    markers.push({ entry, world: { x: -3.65, y: 2.8, z: 2.35 }, type: "boundary", label: "finite x = 0 source (outside T-chart)" });
  }
  for (const entry of analysis.infinityEntries) {
    markers.push({ entry, world: { x: 3.65, y: 2.8, z: -2.35 }, type: "escape", label: `${entry.multiplicity} asymptotic sheets` });
  }
  return { kind: "landscape", samples, markers, transform, valueScale, span, resolution };
}

function rebuildSceneData() {
  state.sceneData = state.mode === "fiber" ? buildFiberScene() : buildLandscapeScene();
  frameRequested = true;
}

function updateFamilyChrome() {
  const auto = isAutomorphism();
  document.body.dataset.family = state.family;
  for (const button of elements.familyButtons) {
    const active = button.dataset.family === state.family;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  elements.classificationSymbol.textContent = auto ? "✓" : "≠";
  elements.classificationTitle.textContent = auto ? "Polynomial automorphism" : "Non-injective Keller map";
  elements.classificationDetail.textContent = auto
    ? "constant Jacobian · explicit polynomial inverse"
    : "constant Jacobian · certified global overlap";
  elements.deckEyebrow.textContent = auto ? "Exact inverse" : "Live target";
  elements.deckTitle.textContent = auto ? "Trace the unique source" : "Shape the fiber";
  elements.degreeLabel.textContent = auto ? "Shear exponent" : "Generic fiber degree";
  elements.degree.min = auto ? "2" : "3";
  elements.degreeMin.textContent = auto ? "2" : "3";
  elements.degreeMetricLabel.textContent = "generic degree";
  elements.jacobianMetric.textContent = auto ? "1" : "−2";
  if (auto) {
    elements.presetOne.querySelector("strong").textContent = "Identity";
    elements.presetOne.querySelector("small").textContent = "untouched baseline";
    elements.presetTwo.querySelector("strong").textContent = "Single shear";
    elements.presetTwo.querySelector("small").textContent = "x bends by yᵏ";
    elements.presetThree.querySelector("strong").textContent = "Chained shears";
    elements.presetThree.querySelector("small").textContent = "nonlinear, invertible";
    elements.equationExpression.innerHTML = state.variant === "identity" ? "P(T) = T − α"
      : state.variant === "shear" ? `P(T) = T + β<sup>${state.d}</sup> − α`
      : `P(T) = T + (β − γ<sup>${state.d}</sup>)<sup>${state.d}</sup> − α`;
    elements.howToText.textContent = "These triangular maps have determinant 1 and an explicit polynomial inverse. Their fiber polynomial is linear, so every target has exactly one affine source. The scene is recentered for readability; the inspector always shows the actual coordinates.";
    elements.footerLead.textContent = "One target. One source. An explicit route back.";
    elements.footerDetail.textContent = "Exact inverse · determinant 1 · adaptive numerical rendering";
  } else {
    elements.presetOne.querySelector("strong").textContent = "Exact collision";
    elements.presetOne.querySelector("small").textContent = "stored certificate";
    elements.presetTwo.querySelector("strong").textContent = "Nearby fiber";
    elements.presetTwo.querySelector("small").textContent = "move off certificate";
    elements.presetThree.querySelector("strong").textContent = "Escape wall";
    elements.presetThree.querySelector("small").textContent = "P and P′ share a root";
    elements.equationExpression.innerHTML = "P(T) = h<sub>d</sub>(T, γ) + βT − 2α";
    elements.howToText.textContent = "Simple roots reconstruct finite sources on x ≠ 0. Finite x = 0 sources are counted in a second affine chart. Repeated roots satisfy P′ = 0, so x = 2/P′ cannot be finite and those sheets escape through infinity. All display compression is disclosed above the scene.";
    elements.footerLead.textContent = "Nothing folds locally. The overlap is global.";
    elements.footerDetail.textContent = "Exact family formulas · explicit chart accounting · numerical root rendering";
  }
}

function syncControls() {
  elements.degree.value = String(state.d);
  elements.degreeOutput.value = `${isAutomorphism() ? "k" : "d"} = ${state.d}`;
  for (const [key, range, number] of [
    ["alpha", elements.alpha, elements.alphaNumber], ["beta", elements.beta, elements.betaNumber], ["gamma", elements.gamma, elements.gammaNumber],
  ]) {
    const value = state[key];
    const min = Number(range.min), max = Number(range.max);
    if (value >= min && value <= max) range.value = String(value);
    number.value = String(Number(value.toPrecision(12)));
  }
}

function updatePresetChrome() {
  for (const button of [elements.presetOne, elements.presetTwo, elements.presetThree]) button.classList.remove("is-active");
  if (["collision", "identity"].includes(state.activePreset)) elements.presetOne.classList.add("is-active");
  if (["nearby", "shear"].includes(state.activePreset)) elements.presetTwo.classList.add("is-active");
  if (["escape", "chain"].includes(state.activePreset)) elements.presetThree.classList.add("is-active");
}

function updateAnalysisUI() {
  const a = state.analysis;
  elements.degreeMetric.textContent = String(a.genericDegree);
  elements.finiteMetric.textContent = String(a.finiteAffineCount);
  elements.escapeMetric.textContent = String(a.escapeCount);
  elements.residualMetric.textContent = formatResidual(a.maximumRelativeResidual);
  elements.countChart.textContent = String(a.finiteChartCount);
  elements.countBoundary.textContent = String(a.boundaryCount);
  elements.countEscape.textContent = String(a.escapeCount);
  elements.countUnresolved.textContent = String(a.unresolvedCount);
  const displayedSheetCount = a.finiteAffineCount + a.escapeCount + a.unresolvedCount;
  elements.accountingTotal.textContent = a.sheetAccountingValid ? `${displayedSheetCount} / ${a.genericDegree} sheets` : `unresolved / ${a.genericDegree} sheets`;
  elements.solverStatus.textContent = !a.sheetAccountingValid
    ? "sheet-accounting caution"
    : a.repeatedEscapeCount
    ? "P and P′ share a root"
    : a.unresolvedCount ? "numerical caution" : a.solution.converged ? "converged" : "refining";
  elements.solverStatus.style.color = !a.sheetAccountingValid || a.repeatedEscapeCount || a.unresolvedCount ? "var(--gold)" : "";
  elements.equationDetail.textContent = isAutomorphism()
    ? "linear fiber · exactly one finite complex preimage"
    : `generic degree ${a.genericDegree} · degree ${a.chartDegree} in this T-chart · ${a.boundaryCount} finite boundary-chart source${a.boundaryCount === 1 ? "" : "s"}`;
  elements.axisTransform.textContent = state.sceneData.transform.label;
  elements.legendCurve.textContent = state.mode === "landscape" ? "log residual surface" : isAutomorphism() ? "unique inverse channel" : "real fiber curve";
  elements.legendFinite.textContent = state.mode === "landscape" ? "polynomial root" : "finite affine preimage";
}

function currentSheet() {
  const sheets = state.analysis?.sheets ?? [];
  if (!sheets.length) return null;
  state.selectedSheet = ((state.selectedSheet % sheets.length) + sheets.length) % sheets.length;
  return sheets[state.selectedSheet];
}

function updateInspector() {
  const sheets = state.analysis.sheets;
  const entry = currentSheet();
  if (!entry) {
    elements.sheetIndex.textContent = "no sheet data";
    for (const el of [elements.rootT, elements.rootMultiplicity, elements.rootX, elements.rootY, elements.rootZ, elements.rootChart]) el.textContent = "—";
    return;
  }
  elements.sheetIndex.textContent = `group ${state.selectedSheet + 1} / ${sheets.length}`;
  elements.rootMultiplicity.textContent = String(entry.multiplicity ?? 1);
  if (entry.kind === "finite-chart") {
    elements.sheetStatus.textContent = entry.nearEscape ? "finite, but far along an asymptotic branch" : "finite affine preimage";
    elements.rootT.textContent = formatComplex(entry.root);
    elements.rootX.textContent = formatComplex(entry.source.x);
    elements.rootY.textContent = formatComplex(entry.source.y);
    elements.rootZ.textContent = formatComplex(entry.source.z);
    elements.rootChart.textContent = "x ≠ 0";
  } else if (entry.kind === "finite-boundary-chart") {
    const [x, y, z] = entry.source.source;
    elements.sheetStatus.textContent = "finite affine preimage in the boundary chart";
    elements.rootT.textContent = "outside T-chart";
    elements.rootX.textContent = formatNumber(x);
    elements.rootY.textContent = formatNumber(y);
    elements.rootZ.textContent = formatNumber(z);
    elements.rootChart.textContent = "x = 0";
  } else if (entry.kind === "escape-repeated-root") {
    elements.sheetStatus.textContent = "escaping sheets: P(T) = P′(T) = 0";
    elements.rootT.textContent = formatComplex(entry.root);
    elements.rootX.textContent = "diverges";
    elements.rootY.textContent = "no finite source";
    elements.rootZ.textContent = "no finite source";
    elements.rootChart.textContent = "at infinity";
  } else if (entry.kind === "escape-chart-infinity") {
    elements.sheetStatus.textContent = "generic sheets absent from this affine fiber";
    elements.rootT.textContent = "∞ in T-chart";
    elements.rootX.textContent = "nonproper branch";
    elements.rootY.textContent = "—";
    elements.rootZ.textContent = "—";
    elements.rootChart.textContent = "at infinity";
  } else {
    elements.sheetStatus.textContent = "numerically unresolved";
    elements.rootT.textContent = entry.root ? formatComplex(entry.root) : "—";
    elements.rootX.textContent = "undefined";
    elements.rootY.textContent = "undefined";
    elements.rootZ.textContent = "undefined";
    elements.rootChart.textContent = "unresolved";
  }
}

function updateTruthStrip() {
  if (isAutomorphism()) {
    const names = { identity: "identity", shear: "single triangular shear", chain: "chained triangular shears" };
    elements.truthStrip.classList.remove("is-numeric");
    elements.truthIcon.textContent = "✓";
    elements.truthTitle.textContent = "Explicit inverse certificate";
    elements.truthDetail.textContent = `${names[state.variant]} · determinant 1 · exactly one source`;
    return;
  }
  const certificate = collisionCertificate(state.d);
  const onCertificate = targetsMatch(state, certificate.target);
  elements.truthStrip.classList.toggle("is-numeric", !onCertificate);
  if (onCertificate) {
    const verification = verifyCollisionNumerically(state.d);
    elements.truthIcon.textContent = verification.numericalEvaluationPassed ? "✓" : "!";
    elements.truthTitle.textContent = "Stored exact certificate";
    elements.truthDetail.textContent = verification.numericalEvaluationPassed
      ? `browser numerical re-evaluation passed · max error ${formatResidual(verification.maximumError)}`
      : `browser numerical re-evaluation mismatch · max error ${formatResidual(verification.maximumError)}`;
  } else if (state.analysis.repeatedEscapeCount) {
    elements.truthIcon.textContent = "↗";
    elements.truthTitle.textContent = "Escape inferred from P and P′";
    elements.truthDetail.textContent = `${state.analysis.repeatedEscapeCount} sheets have no finite affine source`;
  } else {
    elements.truthIcon.textContent = "≈";
    elements.truthTitle.textContent = "Numerical fiber analysis";
    elements.truthDetail.textContent = `${state.analysis.finiteAffineCount} finite · ${state.analysis.escapeCount} escaping · residual ${formatResidual(state.analysis.maximumRelativeResidual)}`;
  }
}

function updateAll({ resetSelection = false } = {}) {
  if (resetSelection) state.selectedSheet = 0;
  updateFamilyChrome();
  analyzeCurrentFiber();
  rebuildSceneData();
  syncControls();
  updatePresetChrome();
  updateAnalysisUI();
  updateInspector();
  updateTruthStrip();
  elements.renderStatus.classList.add("is-ready");
  elements.canvas.dataset.renderReady = "true";
  document.documentElement.dataset.renderReady = "true";
}

function resizeCanvas() {
  const rect = elements.canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  viewport = { width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr };
  elements.canvas.width = Math.round(viewport.width * dpr);
  elements.canvas.height = Math.round(viewport.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  frameRequested = true;
}

function createStars() {
  let seed = 20260720;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  stars = Array.from({ length: 360 }, () => ({
    x: random() * 2 - 1, y: random() * 2 - 1, z: random(), size: .3 + random() * 1.2, phase: random() * Math.PI * 2,
  }));
}

function rotatePoint(point) {
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const x1 = cy * point.x + sy * point.z;
  const z1 = -sy * point.x + cy * point.z;
  const y2 = cp * point.y - sp * z1;
  const z2 = sp * point.y + cp * z1;
  return { x: x1, y: y2, z: z2 };
}

function project(point) {
  const rotated = rotatePoint(point);
  const distance = 14;
  const perspective = distance / Math.max(4, distance - rotated.z);
  const scale = (Math.min(viewport.width, viewport.height) / 12.2) * camera.zoom * perspective;
  return {
    x: viewport.width / 2 + camera.panX + rotated.x * scale,
    y: viewport.height / 2 + camera.panY - rotated.y * scale,
    depth: rotated.z,
    scale: perspective * camera.zoom,
  };
}

function drawBackground(time) {
  const gradient = ctx.createRadialGradient(viewport.width * .5, viewport.height * .45, 10, viewport.width * .5, viewport.height * .45, Math.max(viewport.width, viewport.height) * .72);
  gradient.addColorStop(0, isAutomorphism() ? "#0b1d23" : "#16122d");
  gradient.addColorStop(.55, "#070b1a");
  gradient.addColorStop(1, "#02040b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const star of stars) {
    const x = ((star.x * .5 + .5) * viewport.width + camera.yaw * 10 * star.z) % viewport.width;
    const y = (star.y * .5 + .5) * viewport.height + camera.pitch * 7 * star.z;
    const alpha = .16 + .3 * (.5 + .5 * Math.sin(time * .0007 + star.phase));
    ctx.fillStyle = `rgba(143,190,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x < 0 ? x + viewport.width : x, y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWorldLine(a, b, color, width = 1, alpha = 1) {
  const pa = project(a), pb = project(b);
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); ctx.restore();
}

function drawGridAndAxes() {
  const familyColor = isAutomorphism() ? COLORS.green : COLORS.magenta;
  for (let i = -5; i <= 5; i += 1) {
    drawWorldLine({ x: -5.5, y: 0, z: i }, { x: 5.5, y: 0, z: i }, "#33415f", .55, .22);
    drawWorldLine({ x: i, y: 0, z: -5.5 }, { x: i, y: 0, z: 5.5 }, "#33415f", .55, .22);
  }
  drawWorldLine({ x: -5.7, y: 0, z: 0 }, { x: 5.7, y: 0, z: 0 }, COLORS.cyan, 1.1, .55);
  drawWorldLine({ x: 0, y: -5.3, z: 0 }, { x: 0, y: 5.3, z: 0 }, COLORS.violet, 1.1, .5);
  drawWorldLine({ x: 0, y: 0, z: -5.7 }, { x: 0, y: 0, z: 5.7 }, familyColor, 1.1, .5);
}

function drawTargetPlane() {
  const corners = [{x:-5.5,y:0,z:-5.5},{x:5.5,y:0,z:-5.5},{x:5.5,y:0,z:5.5},{x:-5.5,y:0,z:5.5}].map(project);
  ctx.save();
  ctx.fillStyle = isAutomorphism() ? "rgba(98,239,180,.035)" : "rgba(255,211,106,.035)";
  ctx.strokeStyle = isAutomorphism() ? "rgba(98,239,180,.22)" : "rgba(255,211,106,.22)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y); for(let i=1;i<corners.length;i++)ctx.lineTo(corners[i].x,corners[i].y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

function strokeProjectedPath(points, color, width, alpha, glow = 0) {
  if (points.length < 2) return;
  const projected = points.map(project);
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.beginPath(); ctx.moveTo(projected[0].x, projected[0].y); for (let i = 1; i < projected.length; i += 1) ctx.lineTo(projected[i].x, projected[i].y); ctx.stroke(); ctx.restore();
}

function drawFiber(time) {
  drawTargetPlane();
  drawGridAndAxes();
  state.sceneData.segments.forEach((segment, index) => {
    const color = isAutomorphism() ? (index % 2 ? COLORS.cyan : COLORS.green) : (index % 2 ? COLORS.violet : COLORS.cyan);
    strokeProjectedPath(segment, color, 9, .055, 20);
    strokeProjectedPath(segment, color, 2.15, .9, 9);
    strokeProjectedPath(segment, "#eefcff", .55, .75, 2);
  });
  const pulse = 1 + .12 * Math.sin(time * .0024);
  drawMarkers(pulse, true);
}

function surfaceColor(height, alpha = 1) {
  const normalized = clamp((height + 2.45) / 7.85, 0, 1);
  const hue = isAutomorphism() ? 154 + normalized * 35 : 188 + normalized * 95;
  return `hsla(${hue},82%,${45 + normalized * 17}%,${alpha})`;
}

function drawLandscape(time) {
  drawGridAndAxes();
  const rows = state.sceneData.samples;
  const cells = [];
  for (let r = 0; r < rows.length - 1; r += 1) {
    for (let c = 0; c < rows[r].length - 1; c += 1) {
      const world = [rows[r][c], rows[r][c+1], rows[r+1][c+1], rows[r+1][c]].map(p => ({x:p.x,y:p.y,z:p.z}));
      const projected = world.map(project);
      cells.push({ projected, depth: projected.reduce((s,p)=>s+p.depth,0)/4, height: world.reduce((s,p)=>s+p.y,0)/4 });
    }
  }
  cells.sort((a,b)=>a.depth-b.depth);
  ctx.save();
  for (const cell of cells) {
    ctx.fillStyle = surfaceColor(cell.height, .12);
    ctx.beginPath(); ctx.moveTo(cell.projected[0].x,cell.projected[0].y); for(let i=1;i<4;i++)ctx.lineTo(cell.projected[i].x,cell.projected[i].y); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  for (const row of rows) strokeProjectedPath(row.map(p=>({x:p.x,y:p.y,z:p.z})), "#86cbff", .58, .18);
  for (let c = 0; c < rows[0].length; c += 1) strokeProjectedPath(rows.map(row=>({x:row[c].x,y:row[c].y,z:row[c].z})), "#d58cff", .55, .14);
  const pulse = 1 + .1 * Math.sin(time * .0024);
  drawMarkers(pulse, false);
}

function markerColor(type) {
  if (type === "boundary") return COLORS.gold;
  if (type.startsWith("escape")) return COLORS.orange;
  return isAutomorphism() ? COLORS.green : COLORS.magenta;
}

function drawLabel(text, x, y, color) {
  ctx.save();
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  const width = Math.min(viewport.width - 16, ctx.measureText(text).width + 14);
  const centerX = clamp(x, width / 2 + 8, viewport.width - width / 2 - 8);
  const centerY = clamp(y - 18.5, 16, viewport.height - 16);
  ctx.fillStyle = "rgba(5,7,18,.84)"; ctx.strokeStyle = color; ctx.globalAlpha = .9; ctx.lineWidth = .7;
  ctx.beginPath(); ctx.roundRect(centerX - width/2, centerY - 9.5, width, 19, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, centerX, centerY); ctx.restore();
}

function drawRelationArcs(finitePositions) {
  if (!finitePositions.length) return;
  const center = finitePositions.reduce((sum,p)=>({x:sum.x+p.x,y:sum.y+p.y}),{x:0,y:0}); center.x/=finitePositions.length;center.y/=finitePositions.length;
  const beacon = { x: clamp(center.x + 105, 90, viewport.width - 90), y: clamp(center.y - 100, 90, viewport.height - 90) };
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = isAutomorphism() ? "rgba(98,239,180,.28)" : "rgba(255,211,106,.25)"; ctx.lineWidth = 1;
  for (const p of finitePositions) { ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.quadraticCurveTo((p.x+beacon.x)/2,Math.min(p.y,beacon.y)-35,beacon.x,beacon.y);ctx.stroke(); }
  ctx.fillStyle = isAutomorphism() ? COLORS.green : COLORS.gold; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18; ctx.beginPath();ctx.arc(beacon.x,beacon.y,5,0,Math.PI*2);ctx.fill();ctx.restore();
  drawLabel("shared output", beacon.x, beacon.y, isAutomorphism()?COLORS.green:COLORS.gold);
}

function drawMarkers(pulse, relationArcs) {
  projectedMarkers = [];
  const sorted = state.sceneData.markers.map((marker,index)=>({marker,index,projected:project(marker.world)})).sort((a,b)=>a.projected.depth-b.projected.depth);
  const finitePositions = [];
  for (const item of sorted) {
    const { marker, index, projected } = item;
    const selectedEntry = currentSheet();
    const selected = selectedEntry && selectedEntry.id === marker.entry.id;
    const color = markerColor(marker.type);
    const radius = (selected ? 7.5 : 5.5) * (selected ? pulse : 1) * clamp(projected.scale, .65, 1.5);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = selected ? 24 : 15; ctx.globalAlpha = marker.type === "escape-ghost" ? .45 : .95;
    ctx.beginPath(); ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2); ctx.fill();
    if (marker.type.startsWith("escape")) { ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(projected.x,projected.y,radius+6,0,Math.PI*2);ctx.stroke(); }
    if (marker.type === "boundary") { ctx.strokeStyle = "#fff2b8";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(projected.x,projected.y,radius+4,0,Math.PI*2);ctx.stroke(); }
    ctx.restore();
    if (marker.type === "finite" || marker.type === "boundary") finitePositions.push(projected);
    if (selected && marker.type !== "escape-ghost") drawLabel(marker.label, projected.x, projected.y, color);
    projectedMarkers.push({ ...marker, screen: projected, hitRadius: Math.max(12, radius + 6), markerIndex: index });
  }
  if (relationArcs) drawRelationArcs(finitePositions);
}

function render(time = performance.now()) {
  lastFrameTime = time;
  if (camera.autoRotate) { camera.yaw += .00016 * Math.min(32, time - (render.lastTime ?? time)); frameRequested = true; }
  render.lastTime = time;
  if (frameRequested || state.animate || camera.autoRotate) {
    drawBackground(time);
    if (state.sceneData?.kind === "fiber") drawFiber(time); else if (state.sceneData) drawLandscape(time);
    frameRequested = false;
  }
  if (state.animate && time - state.lastAnimatedUpdate > 110) {
    state.lastAnimatedUpdate = time;
    const amplitude = isAutomorphism() ? 1.8 : state.d === 3 ? .9 : 1.15;
    state.alpha = state.animationCenter + amplitude * Math.sin(time * .00062);
    state.activePreset = isAutomorphism() ? state.variant : "custom";
    updateAll();
  }
  requestAnimationFrame(render);
}

function markerAt(clientX, clientY) {
  const rect = elements.canvas.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  return projectedMarkers
    .map(marker => ({ marker, distance: Math.hypot(marker.screen.x - x, marker.screen.y - y) }))
    .filter(item => item.distance <= item.marker.hitRadius)
    .sort((a,b)=>a.distance-b.distance)[0]?.marker ?? null;
}

function selectEntry(entry) {
  const index = state.analysis.sheets.findIndex(sheet => sheet.id === entry.id);
  if (index >= 0) { state.selectedSheet = index; updateInspector(); frameRequested = true; }
}

function updateTooltip(event) {
  const marker = markerAt(event.clientX, event.clientY);
  hoveredMarker = marker;
  if (!marker) { elements.tooltip.hidden = true; return; }
  const rect = elements.canvas.getBoundingClientRect();
  elements.tooltip.hidden = false;
  elements.tooltip.style.left = `${clamp(event.clientX - rect.left + 14, 8, rect.width - 185)}px`;
  elements.tooltip.style.top = `${clamp(event.clientY - rect.top - 48, 8, rect.height - 68)}px`;
  elements.tooltip.innerHTML = `${marker.label}<small>click to inspect this sheet group</small>`;
}

function resetCamera() {
  Object.assign(camera, { yaw: -0.58, pitch: 0.34, zoom: 1, panX: 0, panY: 0, autoRotate: !matchMedia("(prefers-reduced-motion: reduce)").matches });
  frameRequested = true;
}

function applyTarget(target, preset) {
  Object.assign(state, target);
  state.activePreset = preset;
  state.animate = false;
  state.animationCenter = state.alpha;
  elements.animate.setAttribute("aria-pressed", "false");
  elements.animate.querySelector("span").textContent = "▶";
  updateAll({ resetSelection: true });
}

function setAutomorphismVariant(variant) {
  state.variant = variant;
  state.activePreset = variant;
  state.animate = false;
  updateAll({ resetSelection: true });
}

function setFamily(family) {
  if (family === state.family) return;
  familySnapshots[state.family] = { d: state.d, variant: state.variant, alpha: state.alpha, beta: state.beta, gamma: state.gamma, activePreset: state.activePreset };
  Object.assign(state, familySnapshots[family] ?? (family === "counterexample" ? { d:5,variant:"chain",...initialCertificate.target,activePreset:"collision" } : { d:3,variant:"chain",alpha:2,beta:1,gamma:0,activePreset:"chain" }));
  state.family = family;
  state.animate = false;
  resetCamera();
  updateAll({ resetSelection: true });
}

function setMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  for (const button of elements.modeButtons) { const active = button.dataset.mode === mode; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); }
  resetCamera();
  updateAll();
}

function setCoordinate(key, value, source = "custom") {
  if (!Number.isFinite(value)) return;
  state[key] = value;
  state.activePreset = isAutomorphism() ? state.variant : source;
  state.animate = false;
  elements.animate.setAttribute("aria-pressed", "false");
  updateAll();
}

for (const button of elements.familyButtons) button.addEventListener("click", () => setFamily(button.dataset.family));
for (const button of elements.modeButtons) button.addEventListener("click", () => setMode(button.dataset.mode));
elements.degree.addEventListener("input", () => {
  state.d = Number.parseInt(elements.degree.value, 10);
  if (isAutomorphism()) updateAll({ resetSelection: true });
  else applyTarget(collisionCertificate(state.d).target, "collision");
});
for (const [key, range, number] of [
  ["alpha", elements.alpha, elements.alphaNumber], ["beta", elements.beta, elements.betaNumber], ["gamma", elements.gamma, elements.gammaNumber],
]) {
  range.addEventListener("input", () => setCoordinate(key, Number.parseFloat(range.value)));
  number.addEventListener("change", () => setCoordinate(key, Number.parseFloat(number.value)));
  number.addEventListener("keydown", event => { if (event.key === "Enter") { number.blur(); setCoordinate(key, Number.parseFloat(number.value)); } });
}
elements.presetOne.addEventListener("click", () => isAutomorphism() ? setAutomorphismVariant("identity") : applyTarget(collisionCertificate(state.d).target, "collision"));
elements.presetTwo.addEventListener("click", () => isAutomorphism() ? setAutomorphismVariant("shear") : applyTarget(threeRealPreset(state.d), "nearby"));
elements.presetThree.addEventListener("click", () => {
  if (isAutomorphism()) { setAutomorphismVariant("chain"); return; }
  const points = realCriticalTargets(state.d, state.beta, state.gamma);
  const nearest = points.reduce((best, point) => !best || Math.abs(point.alpha-state.alpha)<Math.abs(best.alpha-state.alpha) ? point : best, null);
  if (nearest) applyTarget({ alpha: nearest.alpha, beta: state.beta, gamma: state.gamma }, "escape");
});
elements.animate.addEventListener("click", () => {
  state.animate = !state.animate; state.animationCenter = state.alpha;
  elements.animate.setAttribute("aria-pressed", String(state.animate));
  elements.animate.querySelector("span").textContent = state.animate ? "Ⅱ" : "▶";
});
elements.resetCamera.addEventListener("click", resetCamera);
elements.previousSheet.addEventListener("click", () => { state.selectedSheet -= 1; updateInspector(); frameRequested = true; });
elements.nextSheet.addEventListener("click", () => { state.selectedSheet += 1; updateInspector(); frameRequested = true; });

elements.canvas.addEventListener("contextmenu", event => event.preventDefault());
elements.canvas.addEventListener("pointerdown", event => {
  elements.canvas.setPointerCapture(event.pointerId);
  pointerState.down = true; pointerState.x = event.clientX; pointerState.y = event.clientY; pointerState.moved = 0;
  pointerState.mode = event.shiftKey || event.button === 2 ? "pan" : "rotate";
  camera.autoRotate = false;
});
elements.canvas.addEventListener("pointermove", event => {
  if (!pointerState.down) { updateTooltip(event); return; }
  const dx = event.clientX - pointerState.x, dy = event.clientY - pointerState.y;
  pointerState.x = event.clientX; pointerState.y = event.clientY; pointerState.moved += Math.hypot(dx,dy);
  if (pointerState.mode === "pan") { camera.panX += dx; camera.panY += dy; }
  else { camera.yaw += dx * .008; camera.pitch = clamp(camera.pitch + dy * .007, -1.25, 1.25); }
  frameRequested = true; elements.tooltip.hidden = true;
});
elements.canvas.addEventListener("pointerup", event => {
  if (pointerState.moved < 6) { const marker = markerAt(event.clientX,event.clientY); if (marker) selectEntry(marker.entry); }
  pointerState.down = false;
});
elements.canvas.addEventListener("pointerleave", () => { elements.tooltip.hidden = true; if (!pointerState.down) hoveredMarker = null; });
elements.canvas.addEventListener("wheel", event => { event.preventDefault(); camera.autoRotate = false; camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * .0011), .5, 2.7); frameRequested = true; }, { passive: false });
elements.canvas.addEventListener("dblclick", resetCamera);
window.addEventListener("keydown", event => { if (event.key === "ArrowLeft") { state.selectedSheet -= 1; updateInspector(); frameRequested = true; } if (event.key === "ArrowRight") { state.selectedSheet += 1; updateInspector(); frameRequested = true; } });

new ResizeObserver(resizeCanvas).observe(elements.canvas);
createStars();
resizeCanvas();
updateAll({ resetSelection: true });
requestAnimationFrame(render);

window.__JACOBIAN_LAB__ = {
  setState(partial) {
    if (partial.family && partial.family !== state.family) setFamily(partial.family);
    if (partial.mode && partial.mode !== state.mode) setMode(partial.mode);
    for (const key of ["variant", "d", "alpha", "beta", "gamma", "activePreset"]) if (key in partial) state[key] = partial[key];
    if (partial.camera) Object.assign(camera, partial.camera);
    updateAll({ resetSelection: true });
  },
  setMode,
  setFamily,
  resetCamera,
  snapshot() {
    return {
      state: { family: state.family, variant: state.variant, mode: state.mode, d: state.d, alpha: state.alpha, beta: state.beta, gamma: state.gamma, activePreset: state.activePreset },
      analysis: {
        genericDegree: state.analysis.genericDegree, chartDegree: state.analysis.chartDegree,
        finiteChartCount: state.analysis.finiteChartCount, boundaryCount: state.analysis.boundaryCount,
        finiteAffineCount: state.analysis.finiteAffineCount, repeatedEscapeCount: state.analysis.repeatedEscapeCount,
        escapeAtChartInfinity: state.analysis.escapeAtChartInfinity, escapeCount: state.analysis.escapeCount,
        unresolvedCount: state.analysis.unresolvedCount, accountedSheets: state.analysis.accountedSheets,
        sheetAccountingValid: state.analysis.sheetAccountingValid, maximumRelativeResidual: state.analysis.maximumRelativeResidual,
        roots: state.analysis.allPolynomialRoots.map(entry => ({ re: entry.displayRoot?.re ?? null, im: entry.displayRoot?.im ?? null, kind: entry.kind, multiplicity: entry.multiplicity })),
      },
      transform: state.sceneData.transform.label,
      markers: projectedMarkers.map(marker => ({ type: marker.type, x: marker.screen.x, y: marker.screen.y, label: marker.label })),
      canvas: { width: viewport.width, height: viewport.height },
      camera: { ...camera },
    };
  },
};
