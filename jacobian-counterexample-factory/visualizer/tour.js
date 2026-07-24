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

function noteAnimationStopped() {
  state.animationActive = false;
  syncAnimationControl(false);
}

function noteAnimationButtonState() {
  const active = animateButton?.getAttribute("aria-pressed") === "true";
  state.animationActive = active;
  if (active) state.animationCenter = original.snapshot().state.alpha;
  syncAnimationControl(active);
}

animateButton?.addEventListener("click", noteAnimationButtonState);

function stopAnimation() {
  if (state.animationActive) animateButton?.click();
  if (state.animationActive) noteAnimationStopped();
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
  noteAnimationStopped();
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
    noteAnimationStopped();
    families[otherFamily] = clone(augmentedSnapshot());
    original.setFamily(activeFamily);
    noteAnimationStopped();
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
    noteAnimationStopped();
    applyVisibleSnapshot(session.families[otherFamily], { resumeAnimation: false });
  }

  if (original.snapshot().state.family !== activeFamily) original.setFamily(activeFamily);
  noteAnimationStopped();
  return applyVisibleSnapshot(session.families[activeFamily], { resumeAnimation });
}

function applyTransientState(partial) {
  stopAnimation();
  const clean = { ...partial };
  delete clean.animate;
  delete clean.animationCenter;
  delete clean.selectedSheet;
  original.setState(clean);
  noteAnimationStopped();
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
  if (familyChanged) noteAnimationStopped();
  if (wantsAnimation && partial.animate) {
    startAnimation(partial.animationCenter, partial.alpha);
  } else if (wantsAnimation) {
    noteAnimationStopped();
  }
  if (Number.isInteger(partial.selectedSheet)) setSelectedSheet(partial.selectedSheet);
  return augmentedSnapshot();
}

function setFamily(family) {
  original.setFamily(family);
  noteAnimationStopped();
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

for (const button of $$('[data-family]')) button.addEventListener("click", noteAnimationStopped);
for (const button of [$("#preset-one"), $("#preset-two")]) button?.addEventListener("click", noteAnimationStopped);
$("#preset-three")?.addEventListener("click", () => {
  if (original.snapshot().state.family === "automorphism" || animateButton?.getAttribute("aria-pressed") === "false") noteAnimationStopped();
  else stopAnimation();
});
for (const control of [$("#alpha"), $("#beta"), $("#gamma")]) control?.addEventListener("input", noteAnimationStopped);
for (const control of [$("#alpha-number"), $("#beta-number"), $("#gamma-number")]) {
  control?.addEventListener("change", noteAnimationStopped);
  control?.addEventListener("keydown", (event) => { if (event.key === "Enter") noteAnimationStopped(); });
}
$("#degree")?.addEventListener("input", () => {
  if (original.snapshot().state.family === "automorphism") stopAnimation();
  else noteAnimationStopped();
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
(function installJacobianTour(root) {
"use strict";

const steps = root.JacobianTourContent;
if (!Array.isArray(steps)) throw new Error("JacobianTourContent failed to load before the tour runtime.");

const STORAGE_KEY = "jacobian-fiber-lab-tour-v1";
const REDUCED_MOTION = root.matchMedia?.("(prefers-reduced-motion: reduce)");
const $ = (selector) => document.querySelector(selector);
const dom = {};
const state = { active: false, index: 0, returnSession: null, restoreFocus: null, target: null, transition: 0 };

function frames(count = 2) {
  return new Promise((resolve) => {
    const tick = () => count-- <= 0 ? resolve() : requestAnimationFrame(tick);
    tick();
  });
}

function waitForLab() {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const probe = () => {
      const lab = root.__JACOBIAN_LAB__;
      if (lab && typeof lab.captureSession === "function" && document.documentElement.dataset.renderReady === "true") return resolve();
      if (performance.now() - started > 10000) return reject(new Error("Jacobian Fiber Lab did not become ready for the guided tour."));
      requestAnimationFrame(probe);
    };
    probe();
  });
}

function storageRead() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}
function storageWrite(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
}
async function setLab(partial) {
  root.__JACOBIAN_LAB__.applyTransientState({ ...partial, animate: false });
  await frames();
}

const scenes = {
  welcome: () => setLab({ family: "counterexample", mode: "fiber", d: 5, alpha: 8, beta: 16, gamma: 1, activePreset: "collision", camera: { yaw: -0.58, pitch: 0.34, zoom: 1, panX: 0, panY: 0, autoRotate: false } }),
  "automorphism-identity": () => setLab({ family: "automorphism", mode: "fiber", variant: "identity", d: 3, alpha: 2, beta: 1, gamma: 0, activePreset: "identity" }),
  "automorphism-chain": () => setLab({ family: "automorphism", mode: "fiber", variant: "chain", d: 4, alpha: 2, beta: 1, gamma: 0, activePreset: "chain" }),
  "cubic-collision": () => setLab({ family: "counterexample", mode: "fiber", d: 3, alpha: -0.25, beta: 0, gamma: 0, activePreset: "collision" }),
  "cubic-tangency": () => setLab({ family: "counterexample", mode: "fiber", d: 3, alpha: 0, beta: 0, gamma: 0, activePreset: "custom" }),
  "complex-landscape": () => setLab({ family: "counterexample", mode: "landscape", d: 5, alpha: 8, beta: 16, gamma: 1, activePreset: "collision" }),
  async "boundary-source"() {
    await scenes["cubic-collision"]();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ($("#root-chart")?.textContent?.includes("x = 0")) return;
      $("#next-sheet")?.click();
      await frames(1);
    }
  },
};
const tries = {
  "cycle-source": async () => { $("#next-sheet")?.click(); await frames(1); },
  "cubic-collision": scenes["cubic-collision"],
};

function createInterface() {
  const shell = document.createElement("div");
  shell.id = "jacobian-tour-root";
  shell.innerHTML = `
    <button id="tour-launcher" class="tour-launcher" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Start the guided Jacobian tour">
      <span class="tour-launcher-mascot" aria-hidden="true"><b>∂</b><i>✦</i></span>
      <span class="tour-launcher-label"><strong>Meet Pip</strong><small>guided tour</small></span>
    </button>
    <aside id="tour-invite" class="tour-invite" hidden aria-label="Guided tour invitation">
      <button id="tour-invite-close" class="tour-invite-close" type="button" aria-label="Dismiss tour invitation">×</button>
      <div class="tour-mini-mascot" aria-hidden="true">∂</div>
      <p><strong>New to the Jacobian conjecture?</strong><span>Pip can turn this lab into a friendly, interactive story.</span></p>
      <button id="tour-invite-start" type="button">Take the tour</button>
    </aside>
    <div id="tour-spotlight" class="tour-spotlight" hidden aria-hidden="true"></div>
    <section id="tour-card" class="tour-card" hidden role="dialog" aria-modal="false" aria-live="polite" aria-labelledby="tour-title" aria-describedby="tour-body" tabindex="-1">
      <header class="tour-card-header">
        <div class="tour-mascot" aria-hidden="true"><span>∂</span><i></i></div>
        <div><p id="tour-chapter" class="tour-chapter"></p><h2 id="tour-title"></h2></div>
        <button id="tour-close" class="tour-close" type="button" aria-label="Close and restore the previous lab view">×</button>
      </header>
      <div class="tour-progress" aria-hidden="true"><span id="tour-progress-bar"></span></div>
      <div class="tour-progress-meta"><span id="tour-counter"></span><button id="tour-skip" type="button">Exit tour</button></div>
      <div id="tour-body" class="tour-body"></div>
      <div id="tour-formula" class="tour-formula" hidden></div>
      <div id="tour-detail" class="tour-detail" hidden></div>
      <div id="tour-quiz" class="tour-quiz" hidden></div>
      <button id="tour-try" class="tour-try" type="button" hidden></button>
      <footer class="tour-card-footer">
        <button id="tour-back" class="tour-back" type="button">← Back</button>
        <div id="tour-dots" class="tour-dots" aria-label="Tour progress"></div>
        <button id="tour-next" class="tour-next" type="button">Next →</button>
      </footer>
      <p class="tour-shortcuts"><kbd>←</kbd><kbd>→</kbd> move · <kbd>Esc</kbd> exit</p>
    </section>
    <div id="tour-toast" class="tour-toast" hidden role="status" aria-live="polite"></div>`;
  document.body.append(shell);
  for (const id of ["launcher","invite","invite-start","invite-close","spotlight","card","close","skip","chapter","title","body","formula","detail","quiz","try","back","next","dots","counter","progress-bar","toast"]) {
    dom[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = $(`#tour-${id}`);
  }
  dom.topbar = $("#tour-topbar");
  dom.dots.innerHTML = steps.map((step, index) => `<button type="button" data-tour-index="${index}" aria-label="Go to step ${index + 1}: ${step.title}"></button>`).join("");
  dom.launcher.addEventListener("click", () => state.active ? close({ restore: true }) : start());
  dom.topbar?.addEventListener("click", () => start());
  dom.inviteStart.addEventListener("click", () => start());
  dom.inviteClose.addEventListener("click", dismissInvite);
  dom.close.addEventListener("click", () => close({ restore: true }));
  dom.skip.addEventListener("click", () => close({ restore: true }));
  dom.back.addEventListener("click", previous);
  dom.next.addEventListener("click", () => state.index === steps.length - 1 ? finish() : next());
  dom.dots.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-tour-index]");
    if (dot) goTo(Number(dot.dataset.tourIndex));
  });
  dom.try.addEventListener("click", async () => {
    const action = tries[steps[state.index].try];
    if (!action) return;
    dom.try.disabled = true;
    try { await action(); position(); } finally { dom.try.disabled = false; }
  });
  root.addEventListener("keydown", keyboard);
  root.addEventListener("resize", position, { passive: true });
  root.addEventListener("scroll", position, true);
  if (root.ResizeObserver) new ResizeObserver(position).observe(document.documentElement);
}

function dismissInvite() {
  dom.invite.hidden = true;
  storageWrite({ ...(storageRead() || {}), invited: true });
}
function keyboard(event) {
  if (!state.active) {
    if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) start();
    return;
  }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
  if (event.key === "Escape") { event.preventDefault(); close({ restore: true }); }
  if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); state.index === steps.length - 1 ? finish() : next(); }
  if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); previous(); }
}
function optional(element, value) {
  element.hidden = !value;
  if (value) element.textContent = value;
}
function quiz(data) {
  dom.quiz.replaceChildren();
  dom.quiz.hidden = !data;
  if (!data) return;
  const question = document.createElement("p");
  question.className = "tour-quiz-question";
  question.textContent = data.question;
  const choices = document.createElement("div");
  choices.className = "tour-quiz-choices";
  const feedback = document.createElement("p");
  feedback.className = "tour-quiz-feedback";
  feedback.hidden = true;
  for (const [label, correct, message] of data.choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      for (const item of choices.children) item.disabled = true;
      button.classList.add(correct ? "is-correct" : "is-wrong");
      feedback.textContent = message;
      feedback.dataset.correct = String(correct);
      feedback.hidden = false;
    });
    choices.append(button);
  }
  dom.quiz.append(question, choices, feedback);
}

async function anchor(step) {
  state.target?.classList.remove("tour-target");
  state.target = document.querySelector(step.anchor) || $(".viewport") || document.body;
  state.target.classList.add("tour-target");
  state.target.scrollIntoView({ block: "center", inline: "nearest", behavior: REDUCED_MOTION?.matches ? "auto" : "smooth" });
  await new Promise((resolve) => setTimeout(resolve, REDUCED_MOTION?.matches ? 20 : 240));
  position();
}

async function render(index) {
  if (!state.active) return;
  const token = ++state.transition;
  state.index = Math.max(0, Math.min(steps.length - 1, index));
  const step = steps[state.index];
  document.body.dataset.tourStep = step.id;
  dom.card.classList.add("is-transitioning");
  dom.chapter.textContent = step.chapter;
  dom.title.textContent = step.title;
  dom.body.textContent = step.body;
  optional(dom.formula, step.formula);
  optional(dom.detail, step.detail);
  quiz(step.quiz);
  dom.try.hidden = !step.try;
  dom.try.textContent = step.tryLabel || "Try it";
  dom.back.disabled = state.index === 0;
  dom.next.textContent = state.index === steps.length - 1 ? "Finish & explore ✦" : "Next →";
  dom.counter.textContent = `${state.index + 1} of ${steps.length}`;
  dom.progressBar.style.width = `${((state.index + 1) / steps.length) * 100}%`;
  [...dom.dots.children].forEach((dot, i) => {
    dot.classList.toggle("is-active", i === state.index);
    dot.classList.toggle("is-complete", i < state.index);
    i === state.index ? dot.setAttribute("aria-current", "step") : dot.removeAttribute("aria-current");
  });
  try {
    if (scenes[step.scene]) await scenes[step.scene]();
    if (token !== state.transition || !state.active) return;
    await anchor(step);
  } finally { dom.card.classList.remove("is-transitioning"); }
}

function position() {
  if (!state.active || !state.target || dom.card.hidden) return;
  const rect = state.target.getBoundingClientRect();
  dom.spotlight.style.cssText = `left:${Math.max(4, rect.left - 8)}px;top:${Math.max(4, rect.top - 8)}px;width:${Math.max(24, Math.min(innerWidth - 8, rect.width + 16))}px;height:${Math.max(24, Math.min(innerHeight - 8, rect.height + 16))}px`;
  if (innerWidth <= 760) {
    Object.assign(dom.card.style, { left: "12px", right: "12px", top: "auto", bottom: "12px" });
    dom.card.dataset.side = "mobile";
    return;
  }
  const card = dom.card.getBoundingClientRect();
  const controls = state.target.closest(".controls");
  let left = controls ? rect.left - card.width - 18 : Math.min(innerWidth - card.width - 16, rect.right + 18);
  let top = rect.top + (rect.height - card.height) / 2;
  if (left < 16) left = 16;
  top = Math.max(16, Math.min(innerHeight - card.height - 16, top));
  Object.assign(dom.card.style, { left: `${left}px`, right: "auto", top: `${top}px`, bottom: "auto" });
  dom.card.dataset.side = controls ? "left" : "right";
}

async function start(index = 0) {
  await waitForLab();
  dismissInvite();
  if (!state.active) {
    state.returnSession = root.__JACOBIAN_LAB__.captureSession();
    state.restoreFocus = document.activeElement;
  }
  state.active = true;
  document.body.classList.add("tour-active");
  dom.card.hidden = false;
  dom.spotlight.hidden = false;
  dom.launcher.setAttribute("aria-expanded", "true");
  dom.topbar?.setAttribute("aria-pressed", "true");
  await render(index);
  dom.card.focus({ preventScroll: true });
}
async function close({ restore = true } = {}) {
  if (!state.active) return;
  state.active = false;
  state.transition += 1;
  state.target?.classList.remove("tour-target");
  state.target = null;
  document.body.classList.remove("tour-active");
  delete document.body.dataset.tourStep;
  dom.card.hidden = true;
  dom.spotlight.hidden = true;
  dom.launcher.setAttribute("aria-expanded", "false");
  dom.topbar?.setAttribute("aria-pressed", "false");
  if (restore && state.returnSession) {
    root.__JACOBIAN_LAB__.restoreSession(state.returnSession, { resumeAnimation: true });
    await frames();
  }
  state.returnSession = null;
  (state.restoreFocus?.isConnected ? state.restoreFocus : dom.launcher)?.focus?.({ preventScroll: true });
}
async function finish() {
  storageWrite({ completed: true, completedAt: new Date().toISOString() });
  if (state.returnSession) root.__JACOBIAN_LAB__.restoreSession(state.returnSession, { resumeAnimation: false });
  await scenes["cubic-collision"]();
  await close({ restore: false });
  dom.toast.textContent = "Tour complete — you’re now at the exact cubic collision. Explore! ✦";
  dom.toast.hidden = false;
  setTimeout(() => { dom.toast.hidden = true; }, 4800);
}
function goTo(indexOrId) {
  const index = typeof indexOrId === "string" ? steps.findIndex((step) => step.id === indexOrId) : Number(indexOrId);
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) throw new RangeError("Unknown tour step.");
  return state.active ? render(index) : start(index);
}
function next() { return render(Math.min(steps.length - 1, state.index + 1)); }
function previous() { return render(Math.max(0, state.index - 1)); }
function snapshot() { return { active: state.active, index: state.index, id: steps[state.index]?.id ?? null, total: steps.length, title: steps[state.index]?.title ?? null, anchor: steps[state.index]?.anchor ?? null }; }

async function initialize() {
  createInterface();
  try { await waitForLab(); } catch (error) { console.error(error); return; }
  document.documentElement.dataset.tourReady = "true";
  const requested = new URLSearchParams(location.search).get("tour") === "1" || location.hash === "#tour";
  if (requested) start();
  else if (!storageRead()?.completed && !storageRead()?.invited) setTimeout(() => { if (!state.active) dom.invite.hidden = false; }, 850);
}

root.__JACOBIAN_TOUR__ = Object.freeze({ start, close, next, previous, goTo, finish, snapshot, steps: steps.map(({ id, chapter, title, anchor }) => ({ id, chapter, title, anchor })) });
initialize();
})(globalThis);
