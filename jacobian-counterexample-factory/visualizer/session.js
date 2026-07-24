(function installJacobianLabSession(root) {
"use strict";

const original = root.__JACOBIAN_LAB__;
if (!original) throw new Error("Jacobian Fiber Lab must load before the session adapter.");

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const animateButton = $("#animate-target");
const animateGlyph = animateButton?.querySelector("span");
const FAMILY_NAMES = ["counterexample", "automorphism"];
const state = {
  animationActive: animateButton?.getAttribute("aria-pressed") === "true",
  animationCenter: original.snapshot().state.alpha,
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readSelectedSheet() {
  const match = /group\s+(\d+)\s*\/\s*(\d+)/i.exec($("#sheet-index")?.textContent || "");
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function readSheetCount() {
  const match = /group\s+(\d+)\s*\/\s*(\d+)/i.exec($("#sheet-index")?.textContent || "");
  return match ? Math.max(1, Number(match[2])) : 1;
}

function setSelectedSheet(index) {
  const total = readSheetCount();
  const target = Math.max(0, Math.min(total - 1, Number.isInteger(index) ? index : 0));
  for (let attempt = 0; attempt < total + 1 && readSelectedSheet() !== target; attempt += 1) {
    $("#next-sheet")?.click();
  }
}

function syncAnimationControl(active) {
  if (!animateButton) return;
  animateButton.setAttribute("aria-pressed", String(active));
  if (animateGlyph) animateGlyph.textContent = active ? "Ⅱ" : "▶";
}

function markAnimationStopped() {
  state.animationActive = false;
  syncAnimationControl(false);
}

function syncAnimationFromControl() {
  const active = animateButton?.getAttribute("aria-pressed") === "true";
  state.animationActive = active;
  if (active) state.animationCenter = original.snapshot().state.alpha;
  syncAnimationControl(active);
}

animateButton?.addEventListener("click", syncAnimationFromControl);

function stopAnimation() {
  if (state.animationActive) animateButton?.click();
  if (state.animationActive) markAnimationStopped();
  else syncAnimationControl(false);
}

function startAnimation(center, displayAlpha) {
  stopAnimation();
  const current = original.snapshot().state;
  const targetCenter = Number.isFinite(center) ? center : current.alpha;
  const visibleAlpha = Number.isFinite(displayAlpha) ? displayAlpha : current.alpha;
  original.setState({ alpha: targetCenter });
  animateButton?.click();
  state.animationActive = true;
  state.animationCenter = targetCenter;
  syncAnimationControl(true);
  if (Number.isFinite(visibleAlpha) && visibleAlpha !== targetCenter) original.setState({ alpha: visibleAlpha });
}

function augmentedSnapshot() {
  const snapshot = original.snapshot();
  return {
    ...snapshot,
    state: {
      ...snapshot.state,
      animate: state.animationActive,
      animationCenter: state.animationCenter,
      selectedSheet: readSelectedSheet(),
    },
  };
}

function cleanState(stateValue) {
  const clean = { ...stateValue };
  delete clean.animate;
  delete clean.animationCenter;
  delete clean.selectedSheet;
  return clean;
}

function applyVisibleSnapshot(snapshot, { resumeAnimation = false } = {}) {
  if (!snapshot?.state) throw new TypeError("A lab snapshot with state is required.");
  stopAnimation();
  original.setState({ ...cleanState(snapshot.state), camera: snapshot.camera });
  markAnimationStopped();
  if (resumeAnimation && snapshot.state.animate) {
    startAnimation(snapshot.state.animationCenter, snapshot.state.alpha);
  }
  setSelectedSheet(snapshot.state.selectedSheet);
  return augmentedSnapshot();
}

function captureSession() {
  const visible = augmentedSnapshot();
  const activeFamily = visible.state.family;
  const otherFamily = FAMILY_NAMES.find((family) => family !== activeFamily);
  stopAnimation();

  const families = { [activeFamily]: clone(visible) };
  if (otherFamily) {
    original.setFamily(otherFamily);
    markAnimationStopped();
    families[otherFamily] = clone(augmentedSnapshot());
    original.setFamily(activeFamily);
    markAnimationStopped();
    applyVisibleSnapshot(visible, { resumeAnimation: false });
  }

  return Object.freeze({ version: 1, activeFamily, families: clone(families) });
}

function restoreSession(session, { resumeAnimation = true } = {}) {
  if (!session?.families || !session.activeFamily) throw new TypeError("A captured lab session is required.");
  stopAnimation();
  const activeFamily = session.activeFamily;
  const otherFamily = FAMILY_NAMES.find((family) => family !== activeFamily);

  if (otherFamily && session.families[otherFamily]) {
    if (original.snapshot().state.family !== otherFamily) original.setFamily(otherFamily);
    markAnimationStopped();
    applyVisibleSnapshot(session.families[otherFamily], { resumeAnimation: false });
  }

  if (original.snapshot().state.family !== activeFamily) original.setFamily(activeFamily);
  markAnimationStopped();
  return applyVisibleSnapshot(session.families[activeFamily], { resumeAnimation });
}

function applyTransientState(partial) {
  stopAnimation();
  const clean = { ...partial };
  delete clean.animate;
  delete clean.animationCenter;
  delete clean.selectedSheet;
  original.setState(clean);
  markAnimationStopped();
  if (Number.isInteger(partial.selectedSheet)) setSelectedSheet(partial.selectedSheet);
  return augmentedSnapshot();
}

function setState(partial = {}) {
  const wantsAnimation = Object.prototype.hasOwnProperty.call(partial, "animate");
  if (wantsAnimation && !partial.animate) stopAnimation();
  const beforeFamily = original.snapshot().state.family;
  const clean = { ...partial };
  delete clean.animate;
  delete clean.animationCenter;
  delete clean.selectedSheet;
  original.setState(clean);
  const familyChanged = original.snapshot().state.family !== beforeFamily;
  if (familyChanged) markAnimationStopped();
  if (wantsAnimation && partial.animate) {
    startAnimation(partial.animationCenter, partial.alpha);
  } else if (wantsAnimation) {
    markAnimationStopped();
  }
  if (Number.isInteger(partial.selectedSheet)) setSelectedSheet(partial.selectedSheet);
  return augmentedSnapshot();
}

function setFamily(family) {
  const before = original.snapshot().state.family;
  original.setFamily(family);
  family === before ? syncAnimationFromControl() : markAnimationStopped();
  return augmentedSnapshot();
}

function setMode(mode) {
  original.setMode(mode);
  return augmentedSnapshot();
}

function resetCamera() {
  original.resetCamera();
  return augmentedSnapshot();
}

for (const button of $$("button[data-family]")) {
  button.addEventListener("click", () => {
    button.dataset.sessionWasActive = String(original.snapshot().state.family === button.dataset.family);
  }, { capture: true });
  button.addEventListener("click", () => {
    const wasActive = button.dataset.sessionWasActive === "true";
    delete button.dataset.sessionWasActive;
    wasActive ? syncAnimationFromControl() : markAnimationStopped();
  });
}
for (const button of [$("#preset-one"), $("#preset-two")]) button?.addEventListener("click", markAnimationStopped);
$("#preset-three")?.addEventListener("click", syncAnimationFromControl);
for (const control of [$("#alpha"), $("#beta"), $("#gamma")]) control?.addEventListener("input", syncAnimationFromControl);
for (const control of [$("#alpha-number"), $("#beta-number"), $("#gamma-number")]) {
  control?.addEventListener("change", syncAnimationFromControl);
  control?.addEventListener("keydown", (event) => { if (event.key === "Enter") syncAnimationFromControl(); });
}
$("#degree")?.addEventListener("input", () => {
  if (original.snapshot().state.family === "automorphism" && state.animationActive) stopAnimation();
  else syncAnimationFromControl();
});

root.__JACOBIAN_LAB__ = Object.freeze({
  setState,
  setFamily,
  setMode,
  resetCamera,
  setAnimation(active, center = augmentedSnapshot().state.alpha) {
    active ? startAnimation(center, augmentedSnapshot().state.alpha) : stopAnimation();
    return augmentedSnapshot();
  },
  captureSession,
  restoreSession,
  applyTransientState,
  snapshot: augmentedSnapshot,
});

document.documentElement.dataset.sessionReady = "true";
})(globalThis);
