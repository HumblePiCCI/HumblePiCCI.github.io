import { expect, test } from "@playwright/test";
import { realCriticalTargets } from "../math.js";

const API_NAME = "__JACOBIAN_LAB__";

async function waitForRenderedFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function snapshot(page) {
  return page.evaluate(() => window.__JACOBIAN_LAB__.snapshot());
}

async function setLabState(page, partial) {
  await page.evaluate((next) => window.__JACOBIAN_LAB__.setState(next), partial);
  await waitForRenderedFrame(page);
  return snapshot(page);
}

async function openLab(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.goto("./", { waitUntil: "networkidle" });
  await expect(page.locator("#scene")).toHaveAttribute("data-render-ready", "true");
  await expect.poll(
    () => page.evaluate((name) => {
      const api = window[name];
      return Boolean(api && typeof api.setState === "function" && typeof api.snapshot === "function");
    }, API_NAME),
  ).toBe(true);
  await waitForRenderedFrame(page);
  return errors;
}

function expectMarkersInside(snapshotData, markerType) {
  const markers = snapshotData.markers.filter((marker) => marker.type === markerType);
  expect(markers.length, `expected at least one ${markerType} marker`).toBeGreaterThan(0);
  for (const marker of markers) {
    expect(marker.x, `${markerType} marker x: ${JSON.stringify(marker)}`).toBeGreaterThanOrEqual(-2);
    expect(marker.x, `${markerType} marker x: ${JSON.stringify(marker)}`).toBeLessThanOrEqual(snapshotData.canvas.width + 2);
    expect(marker.y, `${markerType} marker y: ${JSON.stringify(marker)}`).toBeGreaterThanOrEqual(-2);
    expect(marker.y, `${markerType} marker y: ${JSON.stringify(marker)}`).toBeLessThanOrEqual(snapshotData.canvas.height + 2);
  }
}

function expectNoBoundaryMarker(snapshotData) {
  expect(snapshotData.markers.some((marker) => marker.type === "boundary")).toBe(false);
}

test("both mathematical chambers and both scene modes render through the current lab API", async ({ page }, testInfo) => {
  const errors = await openLab(page);
  let data = await snapshot(page);

  expect(data.state.family).toBe("counterexample");
  expect(data.analysis.genericDegree).toBe(5);
  expect(data.analysis.unresolvedCount).toBe(0);
  await expect(page.locator("#classification-title")).toHaveText("Non-injective Keller map");
  await expect(page.locator("#jacobian-metric")).toHaveText("−2");

  await page.getByRole("button", { name: /Automorphisms/ }).click();
  await expect.poll(() => snapshot(page).then((current) => current.state.family)).toBe("automorphism");
  await expect(page.locator("#classification-title")).toHaveText("Polynomial automorphism");
  await expect(page.locator("#jacobian-metric")).toHaveText("1");
  await expect(page.locator("#finite-metric")).toHaveText("1");

  await page.getByRole("button", { name: /Counterexamples/ }).click();
  await expect.poll(() => snapshot(page).then((current) => current.state.family)).toBe("counterexample");
  await page.getByRole("button", { name: /Complex landscape/ }).click();
  data = await snapshot(page);
  expect(data.state.mode).toBe("landscape");
  expect(data.transform.length).toBeGreaterThan(0);
  await expect(page.locator("#axis-transform")).not.toHaveText("");

  await page.getByRole("button", { name: /Fiber atlas/ }).click();
  data = await snapshot(page);
  expect(data.state.mode).toBe("fiber");
  expect(data.transform).toContain("asinh");
  await page.screenshot({ path: testInfo.outputPath("chambers-desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("far real root is fitted in both the fiber atlas and complex landscape", async ({ page }, testInfo) => {
  const errors = await openLab(page);
  let data = await setLabState(page, {
    family: "counterexample",
    d: 3,
    alpha: -0.25,
    beta: 0,
    gamma: 0.01,
    activePreset: "custom",
    mode: "fiber",
  });

  expect(data.analysis.finiteChartCount).toBe(3);
  expect(data.analysis.boundaryCount).toBe(0);
  expect(data.analysis.finiteAffineCount).toBe(3);
  expect(data.analysis.escapeCount).toBe(0);
  expect(data.analysis.roots.some((root) => root.re !== null && root.re > 190 && Math.abs(root.im ?? 0) < 1e-6)).toBe(true);
  expect(data.transform).toContain("asinh");
  expectMarkersInside(data, "finite");
  await page.screenshot({ path: testInfo.outputPath("far-root-fiber.png"), fullPage: true });

  data = await setLabState(page, { mode: "landscape" });
  expect(data.state.mode).toBe("landscape");
  expect(data.transform).toContain("asinh");
  expectMarkersInside(data, "finite");
  await page.screenshot({ path: testInfo.outputPath("far-root-landscape.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("boundary-chart sources are gated by exact gamma zero", async ({ page }) => {
  const errors = await openLab(page);

  for (const gamma of [1e-13, -1e-13]) {
    const data = await setLabState(page, {
      family: "counterexample",
      mode: "fiber",
      d: 3,
      alpha: -0.25,
      beta: 0,
      gamma,
      activePreset: "custom",
    });

    expect(data.analysis.chartDegree).toBe(3);
    expect(data.analysis.finiteChartCount).toBe(3);
    expect(data.analysis.boundaryCount).toBe(0);
    expect(data.analysis.finiteAffineCount).toBe(3);
    expect(data.analysis.escapeCount).toBe(0);
    expect(data.analysis.unresolvedCount).toBe(0);
    expectNoBoundaryMarker(data);
    await expect(page.locator("#count-boundary")).toHaveText("0");
    await expect(page.locator("#accounting-total")).toHaveText("3 / 3 sheets");
    await expect(page.locator("#truth-title")).toHaveText("Numerical fiber analysis");
  }

  expect(errors).toEqual([]);
});

test("nonzero gamma coefficient underflow is numerical, not geometric infinity", async ({ page }) => {
  const errors = await openLab(page);
  const data = await setLabState(page, {
    family: "counterexample",
    mode: "fiber",
    d: 6,
    alpha: -0.25,
    beta: 0,
    gamma: 1e-100,
    activePreset: "custom",
  });

  expect(data.analysis.chartDegree).toBeLessThan(6);
  expect(data.analysis.escapeAtChartInfinity).toBe(0);
  expect(data.analysis.escapeCount).toBe(0);
  expect(data.analysis.unresolvedCount).toBe(6);
  expect(data.analysis.accountedSheets + data.analysis.unresolvedCount).toBe(6);
  expect(data.analysis.sheetAccountingValid).toBe(true);
  await expect(page.locator("#count-escape")).toHaveText("0");
  await expect(page.locator("#count-unresolved")).toHaveText("6");
  await expect(page.locator("#accounting-total")).toHaveText("6 / 6 sheets");
  await expect(page.locator("#truth-title")).toHaveText("Numerical fiber analysis");
  expect(errors).toEqual([]);
});

test("cubic collision counts the finite x=0 source and does not invent infinity", async ({ page }) => {
  const errors = await openLab(page);
  const data = await setLabState(page, {
    family: "counterexample",
    d: 3,
    alpha: -0.25,
    beta: 0,
    gamma: 0,
    activePreset: "collision",
    mode: "fiber",
  });

  expect(data.analysis.finiteChartCount).toBe(2);
  expect(data.analysis.boundaryCount).toBe(1);
  expect(data.analysis.finiteAffineCount).toBe(3);
  expect(data.analysis.escapeCount).toBe(0);
  expect(data.analysis.unresolvedCount).toBe(0);
  expectMarkersInside(data, "boundary");
  await expect(page.locator("#finite-metric")).toHaveText("3");
  await expect(page.locator("#escape-metric")).toHaveText("0");
  await expect(page.locator("#accounting-total")).toHaveText("3 / 3 sheets");
  await expect(page.locator("#truth-title")).toHaveText("Stored exact certificate");
  await expect(page.locator("#truth-detail")).toContainText("browser numerical re-evaluation passed");

  let foundBoundary = false;
  for (let index = 0; index < data.analysis.genericDegree + 2; index += 1) {
    if ((await page.locator("#root-chart").textContent())?.includes("x = 0")) {
      foundBoundary = true;
      break;
    }
    await page.locator("#next-sheet").click();
  }
  expect(foundBoundary).toBe(true);
  await expect(page.locator("#sheet-status")).toContainText("boundary chart");
  await expect(page.locator("#root-t")).toHaveText("outside T-chart");
  await expect(page.locator("#root-x")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("manual tangency is classified from P and P-prime, not the preset button", async ({ page }, testInfo) => {
  const errors = await openLab(page);
  const data = await setLabState(page, {
    family: "counterexample",
    d: 3,
    alpha: 0,
    beta: 0,
    gamma: 0,
    activePreset: "custom",
    mode: "fiber",
  });

  expect(data.analysis.boundaryCount).toBe(1);
  expect(data.analysis.repeatedEscapeCount).toBe(2);
  expect(data.analysis.finiteAffineCount).toBe(1);
  expect(data.analysis.escapeCount).toBe(2);
  expect(data.analysis.unresolvedCount).toBe(0);
  expectMarkersInside(data, "boundary");
  expectMarkersInside(data, "escape");
  await expect(page.locator("#solver-status")).toHaveText("P and P′ share a root");
  await expect(page.locator("#escape-metric")).toHaveText("2");
  await expect(page.locator("#accounting-total")).toHaveText("3 / 3 sheets");
  await expect(page.locator("#truth-title")).toHaveText("Escape inferred from P and P′");
  await page.screenshot({ path: testInfo.outputPath("manual-tangency.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("rotate, shift-pan, zoom, and reset are observable on the current scene canvas", async ({ page }) => {
  const errors = await openLab(page);
  const initial = await setLabState(page, {
    camera: { yaw: -0.58, pitch: 0.34, zoom: 1, panX: 0, panY: 0, autoRotate: false },
  });
  const canvas = page.locator("#scene");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const before = initial.camera;
  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.60, { steps: 8 });
  await page.mouse.up();
  let moved = await snapshot(page);
  expect(Math.abs(moved.camera.yaw - before.yaw)).toBeGreaterThan(0.2);
  expect(Math.abs(moved.camera.pitch - before.pitch)).toBeGreaterThan(0.1);

  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.59, box.y + box.height * 0.43, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  moved = await snapshot(page);
  expect(Math.abs(moved.camera.panX)).toBeGreaterThan(20);
  expect(Math.abs(moved.camera.panY)).toBeGreaterThan(10);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -500);
  const zoomed = await snapshot(page);
  expect(zoomed.camera.zoom).toBeGreaterThan(moved.camera.zoom);

  await page.locator("#reset-camera").click();
  const reset = await snapshot(page);
  expect(reset.camera.yaw).toBeCloseTo(-0.58, 1);
  expect(reset.camera.pitch).toBeCloseTo(0.34, 1);
  expect(reset.camera.zoom).toBeCloseTo(1, 2);
  expect(reset.camera.panX).toBeCloseTo(0, 6);
  expect(reset.camera.panY).toBeCloseTo(0, 6);
  expect(errors).toEqual([]);
});

test("all presets remain playable and use the current mathematical copy", async ({ page }) => {
  const errors = await openLab(page);

  await page.locator("#preset-two").click();
  await expect(page.locator("#truth-title")).toHaveText("Numerical fiber analysis");
  const criticalTargets = realCriticalTargets(5, 16, 1);
  expect(criticalTargets.length).toBeGreaterThan(1);
  const expectedNearest = criticalTargets.at(-1);
  await setLabState(page, {
    family: "counterexample",
    d: 5,
    alpha: expectedNearest.alpha + 0.01,
    beta: 16,
    gamma: 1,
    activePreset: "custom",
  });
  await page.locator("#preset-three").click();
  const selectedTangency = await snapshot(page);
  expect(selectedTangency.state.alpha).toBeCloseTo(expectedNearest.alpha, 8);
  await expect(page.locator("#solver-status")).toHaveText("P and P′ share a root");
  await page.locator("#preset-one").click();
  await expect(page.locator("#truth-title")).toHaveText("Stored exact certificate");

  await page.getByRole("button", { name: /Automorphisms/ }).click();
  await page.locator("#preset-one").click();
  await expect(page.locator("#truth-detail")).toContainText("identity");
  await page.locator("#preset-two").click();
  await expect(page.locator("#truth-detail")).toContainText("single triangular shear");
  await page.locator("#preset-three").click();
  await expect(page.locator("#truth-detail")).toContainText("chained triangular shears");
  expect(errors).toEqual([]);
});

test("mobile layout has no horizontal overflow and retains the current scene interaction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only assertion");
  const errors = await openLab(page);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.clientWidth).toBe(390);
  expect(dimensions.scrollWidth).toBe(390);

  await page.getByRole("button", { name: /Complex landscape/ }).click();
  await expect(page.locator("#scene")).toHaveAttribute("data-render-ready", "true");
  const data = await snapshot(page);
  expect(data.state.mode).toBe("landscape");
  expect(data.canvas.width).toBeGreaterThan(0);
  expect(data.canvas.height).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("mobile-landscape.png"), fullPage: true });
  expect(errors).toEqual([]);
});
