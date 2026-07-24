import { expect, test } from "@playwright/test";

const FILE_URL = new URL("../index.html", import.meta.url).href;

async function waitForLabAndTour(page) {
  await expect(page.locator("#scene")).toHaveAttribute("data-render-ready", "true");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tourReady === "true")).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(
    window.__JACOBIAN_TOUR__
      && typeof window.__JACOBIAN_TOUR__.start === "function"
      && typeof window.__JACOBIAN_TOUR__.goTo === "function"
      && typeof window.__JACOBIAN_TOUR__.snapshot === "function",
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
