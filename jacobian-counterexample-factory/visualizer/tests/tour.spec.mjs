import { expect, test } from "@playwright/test";

const FILE_URL = new URL("../index.html", import.meta.url).href;

async function waitForLabAndTour(page) {
  await expect(page.locator("#scene")).toHaveAttribute("data-render-ready", "true");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.sessionReady === "true")).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tourReady === "true")).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(
    window.__JACOBIAN_TOUR__
      && typeof window.__JACOBIAN_TOUR__.start === "function"
      && typeof window.__JACOBIAN_TOUR__.goTo === "function"
      && typeof window.__JACOBIAN_TOUR__.snapshot === "function"
      && typeof window.__JACOBIAN_LAB__.captureSession === "function"
      && typeof window.__JACOBIAN_LAB__.restoreSession === "function",
  ))).toBe(true);
}

async function openLab(page, url = "./") {
  const errors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.addInitScript(() => {
    try { localStorage.removeItem("jacobian-fiber-lab-tour-v1"); } catch {}
  });
  await page.goto(url, { waitUntil: url.startsWith("file:") ? "load" : "networkidle" });
  await waitForLabAndTour(page);
  return { errors, failedRequests };
}

async function tourSnapshot(page) {
  return page.evaluate(() => window.__JACOBIAN_TOUR__.snapshot());
}

async function labSnapshot(page) {
  return page.evaluate(() => window.__JACOBIAN_LAB__.snapshot());
}

async function startTour(page) {
  await page.evaluate(() => window.__JACOBIAN_TOUR__.start());
  await expect(page.locator("#tour-card")).toBeVisible();
  return tourSnapshot(page);
}

async function goTo(page, id) {
  await page.evaluate((stepId) => window.__JACOBIAN_TOUR__.goTo(stepId), id);
  await expect.poll(() => tourSnapshot(page).then((tour) => tour.id)).toBe(id);
  return { tour: await tourSnapshot(page), lab: await labSnapshot(page) };
}

test("the guided tour survives direct file launch with no missing resources", async ({ page }) => {
  const { errors, failedRequests } = await openLab(page, FILE_URL);
  await expect(page.locator("#tour-launcher")).toBeVisible();
  const tour = await startTour(page);
  expect(tour.total).toBe(12);
  expect(tour.id).toBe("welcome");

  const counterexample = await goTo(page, "counterexample");
  expect(counterexample.lab.state.family).toBe("counterexample");
  expect(counterexample.lab.analysis.genericDegree).toBe(3);
  expect(counterexample.lab.analysis.finiteAffineCount).toBe(3);
  await expect(page.locator("#tour-title")).toContainText("Break the global conclusion");

  expect(errors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("the tour teaches the full local-to-global story through live lab states", async ({ page }, testInfo) => {
  const { errors } = await openLab(page);
  const initial = await startTour(page);
  expect(initial.total).toBe(12);
  await expect(page.locator("#tour-card")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#tour-progress-bar")).toBeVisible();

  let result = await goTo(page, "local");
  expect(result.lab.state.family).toBe("automorphism");
  expect(result.lab.analysis.finiteAffineCount).toBe(1);
  await expect(page.locator("#jacobian-metric")).toHaveText("1");
  await page.locator("#tour-quiz button").nth(1).click();
  await expect(page.locator(".tour-quiz-feedback")).toContainText("separates local invertibility");

  result = await goTo(page, "control");
  expect(result.lab.state.family).toBe("automorphism");
  expect(result.lab.state.variant).toBe("chain");
  expect(result.lab.analysis.finiteAffineCount).toBe(1);

  result = await goTo(page, "collision");
  expect(result.lab.state.family).toBe("counterexample");
  expect(result.lab.analysis.genericDegree).toBe(3);
  expect(result.lab.analysis.finiteChartCount).toBe(2);
  expect(result.lab.analysis.boundaryCount).toBe(1);
  expect(result.lab.analysis.finiteAffineCount).toBe(3);
  expect(result.lab.analysis.escapeCount).toBe(0);
  expect(result.lab.state.animate).toBe(false);
  await expect(page.locator("#truth-title")).toHaveText("Stored exact certificate");
  const beforeSheet = await page.locator("#sheet-index").textContent();
  await page.locator("#tour-try").click();
  await expect.poll(() => page.locator("#sheet-index").textContent()).not.toBe(beforeSheet);

  result = await goTo(page, "fiber");
  expect(result.lab.state.mode).toBe("fiber");
  await expect(page.locator("#tour-formula")).toContainText("P(T)");
  await expect(page.locator("#tour-formula")).toContainText("2 / P′(T)");
  await expect(page.locator("#tour-detail")).toContainText("generic target has d sheets");

  result = await goTo(page, "boundary");
  expect(result.lab.analysis.boundaryCount).toBe(1);
  await expect(page.locator("#root-chart")).toHaveText("x = 0");
  await expect(page.locator("#root-x")).toHaveText("0");
  await expect(page.locator("#tour-title")).toContainText("finite");

  result = await goTo(page, "escape");
  expect(result.lab.analysis.repeatedEscapeCount).toBe(2);
  expect(result.lab.analysis.escapeCount).toBe(2);
  await expect(page.locator("#solver-status")).toHaveText("P and P′ share a root");
  await expect(page.locator("#tour-formula")).toContainText("|x| → ∞");

  result = await goTo(page, "complex");
  expect(result.lab.state.mode).toBe("landscape");
  await expect(page.locator("#tour-title")).toContainText("Real slices");

  result = await goTo(page, "remarkable");
  expect(result.lab.state.family).toBe("counterexample");
  await expect(page.locator("#tour-body")).toContainText("locally invertible everywhere");
  await expect(page.locator("#tour-body")).toContainText("globally overlap");

  await goTo(page, "explore");
  await page.screenshot({ path: testInfo.outputPath("guided-tour-finale.png"), fullPage: true });
  await page.evaluate(() => window.__JACOBIAN_TOUR__.finish());
  await expect(page.locator("#tour-card")).toBeHidden();
  const finishedLab = await labSnapshot(page);
  expect(finishedLab.state.family).toBe("counterexample");
  expect(finishedLab.state.mode).toBe("fiber");
  expect(finishedLab.state.d).toBe(3);
  expect(finishedLab.state.animate).toBe(false);
  expect(finishedLab.analysis.finiteAffineCount).toBe(3);
  await expect(page.locator("#tour-toast")).toContainText("Tour complete");

  expect(errors).toEqual([]);
});

test("keyboard exit restores the visitor's original lab view", async ({ page }) => {
  const { errors } = await openLab(page);
  await page.evaluate(() => window.__JACOBIAN_LAB__.setState({
    family: "automorphism",
    mode: "landscape",
    variant: "shear",
    d: 7,
    alpha: 3,
    beta: -1,
    gamma: 0.5,
    activePreset: "shear",
    selectedSheet: 0,
    camera: { yaw: 0.2, pitch: -0.1, zoom: 1.4, panX: 12, panY: -8, autoRotate: false },
  }));
  const before = await labSnapshot(page);
  await startTour(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => tourSnapshot(page).then((tour) => tour.index)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#tour-card")).toBeHidden();
  const after = await labSnapshot(page);
  expect(after.state).toEqual(before.state);
  expect(after.camera.yaw).toBeCloseTo(before.camera.yaw, 8);
  expect(after.camera.pitch).toBeCloseTo(before.camera.pitch, 8);
  expect(after.camera.zoom).toBeCloseTo(before.camera.zoom, 8);
  expect(after.camera.panX).toBeCloseTo(before.camera.panX, 8);
  expect(after.camera.panY).toBeCloseTo(before.camera.panY, 8);
  expect(errors).toEqual([]);
});

test("tour scenes suspend animation and early exit restores animation, sheet, and both family memories", async ({ page }) => {
  const { errors } = await openLab(page);
  await page.evaluate(() => {
    const lab = window.__JACOBIAN_LAB__;
    lab.setState({ family: "automorphism", mode: "fiber", variant: "shear", d: 4, alpha: 3, beta: 2, gamma: 1, activePreset: "shear" });
    lab.setState({ family: "counterexample", mode: "fiber", d: 6, alpha: 5, beta: 4, gamma: 3, activePreset: "custom", camera: { yaw: 0.15, pitch: -0.2, zoom: 1.25, panX: 9, panY: -6, autoRotate: false } });
  });
  await page.locator("#next-sheet").click();
  await page.locator("#animate-target").click();
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#animate-target > span").first()).toHaveText("Ⅱ");
  const before = await labSnapshot(page);
  expect(before.state.animate).toBe(true);
  expect(before.state.animationCenter).toBeCloseTo(5, 8);
  expect(before.state.selectedSheet).toBeGreaterThan(0);

  await startTour(page);
  let welcome = await labSnapshot(page);
  expect(welcome.state.animate).toBe(false);
  expect(welcome.state.alpha).toBe(8);
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#animate-target > span").first()).toHaveText("▶");
  await page.waitForTimeout(350);
  welcome = await labSnapshot(page);
  expect(welcome.state.alpha).toBe(8);

  await goTo(page, "question");
  await page.keyboard.press("Escape");
  await expect(page.locator("#tour-card")).toBeHidden();
  const restored = await labSnapshot(page);
  expect(restored.state.family).toBe("counterexample");
  expect(restored.state.d).toBe(6);
  expect(restored.state.beta).toBe(4);
  expect(restored.state.gamma).toBe(3);
  expect(restored.state.activePreset).toBe("custom");
  expect(restored.state.animate).toBe(true);
  expect(restored.state.animationCenter).toBeCloseTo(before.state.animationCenter, 8);
  expect(restored.state.selectedSheet).toBe(before.state.selectedSheet);
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#animate-target > span").first()).toHaveText("Ⅱ");
  const alphaBefore = restored.state.alpha;
  await page.waitForTimeout(280);
  const alphaAfter = (await labSnapshot(page)).state.alpha;
  expect(Math.abs(alphaAfter - alphaBefore)).toBeGreaterThan(1e-4);

  await page.getByRole("button", { name: /Automorphisms/ }).click();
  const automorphism = await labSnapshot(page);
  expect(automorphism.state.variant).toBe("shear");
  expect(automorphism.state.d).toBe(4);
  expect(automorphism.state.alpha).toBe(3);
  expect(automorphism.state.beta).toBe(2);
  expect(automorphism.state.gamma).toBe(1);

  await page.getByRole("button", { name: /Counterexamples/ }).click();
  const counterexample = await labSnapshot(page);
  expect(counterexample.state.d).toBe(6);
  expect(counterexample.state.beta).toBe(4);
  expect(counterexample.state.gamma).toBe(3);
  expect(counterexample.state.activePreset).toBe("custom");
  expect(errors).toEqual([]);
});

test("finishing after a direct jump leaves the exact cubic collision paused", async ({ page }) => {
  const { errors } = await openLab(page);
  await page.locator("#animate-target").click();
  await startTour(page);
  await goTo(page, "explore");
  await page.evaluate(() => window.__JACOBIAN_TOUR__.finish());
  await expect(page.locator("#tour-card")).toBeHidden();
  const finished = await labSnapshot(page);
  expect(finished.state.family).toBe("counterexample");
  expect(finished.state.mode).toBe("fiber");
  expect(finished.state.d).toBe(3);
  expect(finished.state.alpha).toBe(-0.25);
  expect(finished.state.beta).toBe(0);
  expect(finished.state.gamma).toBe(0);
  expect(finished.state.animate).toBe(false);
  expect(finished.analysis.finiteAffineCount).toBe(3);
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#animate-target > span").first()).toHaveText("▶");
  await page.waitForTimeout(350);
  expect((await labSnapshot(page)).state.alpha).toBe(-0.25);
  expect(errors).toEqual([]);
});

test("state-changing controls keep target-animation state and presentation synchronized", async ({ page }) => {
  const { errors } = await openLab(page);
  await page.locator("#animate-target").click();
  await page.getByRole("button", { name: /Automorphisms/ }).click();
  expect((await labSnapshot(page)).state.animate).toBe(false);
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#animate-target > span").first()).toHaveText("▶");

  await page.locator("#animate-target").click();
  await page.locator("#beta-number").fill("2");
  await page.locator("#beta-number").press("Enter");
  expect((await labSnapshot(page)).state.animate).toBe(false);
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#animate-target > span").first()).toHaveText("▶");
  expect(errors).toEqual([]);
});

test("the guided bubble stays inside the mobile viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only assertion");
  const { errors } = await openLab(page);
  await startTour(page);
  await goTo(page, "collision");

  const card = await page.locator("#tour-card").boundingBox();
  expect(card).not.toBeNull();
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(390);
  expect(card.y + card.height).toBeLessThanOrEqual(844);
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.client).toBe(390);
  expect(dimensions.scroll).toBe(390);
  await expect(page.locator("#tour-spotlight")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("guided-tour-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});
