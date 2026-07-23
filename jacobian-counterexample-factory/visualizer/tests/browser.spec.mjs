import { expect, test } from "@playwright/test";

async function openLab(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.goto("./", { waitUntil: "networkidle" });
  await expect(page.locator("#scene-canvas")).toHaveAttribute("data-render-ready", "true");
  return errors;
}

test("both mathematical chambers and both scene modes render without errors", async ({ page }, testInfo) => {
  const errors = await openLab(page);
  await expect(page.locator("#classification-title")).toContainText("Non-injective");
  await page.getByRole("button", { name: /Automorphisms/ }).click();
  await expect(page.locator("#classification-title")).toContainText("Polynomial automorphism");
  await expect(page.locator("#jacobian-metric")).toHaveText("1");
  await page.getByRole("button", { name: /Counterexamples/ }).click();
  await expect(page.locator("#jacobian-metric")).toHaveText("−2");
  await page.getByRole("button", { name: /Complex landscape/ }).click();
  await expect(page.locator("#view-transform")).toContainText("T =");
  await page.getByRole("button", { name: /Fiber sculpture/ }).click();
  await expect(page.locator("#view-transform")).toContainText("asinh");
  await page.screenshot({ path: testInfo.outputPath("chambers-desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("far real root is fitted in both the sculpture and landscape", async ({ page }, testInfo) => {
  const errors = await openLab(page);
  const snapshot = await page.evaluate(() => window.__fiberLab.setState({
    family: "counterexample",
    d: 3,
    alpha: -0.25,
    beta: 0,
    gamma: 0.01,
    activePreset: "custom",
    mode: "fiber",
  }));
  expect(snapshot.analysis.realRecordCount).toBe(3);
  expect(snapshot.analysis.maxAbsRealRoot).toBeGreaterThan(190);
  expect(snapshot.view.containsAllRealRoots).toBe(true);
  await expect(page.locator("#view-transform")).toContainText("asinh");
  await page.screenshot({ path: testInfo.outputPath("far-root-fiber.png"), fullPage: true });

  await page.getByRole("button", { name: /Complex landscape/ }).click();
  const landscape = await page.evaluate(() => window.__fiberLab.snapshot());
  expect(landscape.view.rootsFitLandscape).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("far-root-landscape.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("cubic collision counts the finite x=0 source and does not invent infinity", async ({ page }) => {
  const errors = await openLab(page);
  const snapshot = await page.evaluate(() => window.__fiberLab.setState({
    family: "counterexample",
    d: 3,
    alpha: -0.25,
    beta: 0,
    gamma: 0,
    activePreset: "collision",
    mode: "fiber",
  }));
  expect(snapshot.analysis.finiteAffineCount).toBe(3);
  expect(snapshot.analysis.boundaryMultiplicity).toBe(1);
  expect(snapshot.analysis.projectiveDeficit).toBe(0);
  expect(snapshot.analysis.escapeBranches).toBe(0);
  await expect(page.locator("#root-count-metric")).toContainText("3 finite");
  await expect(page.locator("#truth-title")).toHaveText("Stored exact certificate");
  await expect(page.locator("#truth-detail")).toContainText("browser replay passed");

  let foundBoundary = false;
  for (let index = 0; index < 6; index += 1) {
    if ((await page.locator("#root-kind").textContent())?.includes("x = 0")) {
      foundBoundary = true;
      break;
    }
    await page.locator("#next-root").click();
  }
  expect(foundBoundary).toBe(true);
  await expect(page.locator("#root-t")).toContainText("outside");
  await expect(page.locator("#root-x")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("manual tangency is classified from the polynomial, not the preset button", async ({ page }, testInfo) => {
  const errors = await openLab(page);
  const snapshot = await page.evaluate(() => window.__fiberLab.setState({
    family: "counterexample",
    d: 3,
    alpha: 0,
    beta: 0,
    gamma: 0,
    activePreset: "custom",
    mode: "fiber",
  }));
  expect(snapshot.analysis.escapeBranches).toBe(2);
  expect(snapshot.analysis.finiteAffineCount).toBe(1);
  expect(snapshot.analysis.boundaryMultiplicity).toBe(1);
  await expect(page.locator("#solver-status")).toContainText("tangency detected");
  await expect(page.locator("#root-count-metric")).toContainText("2 escape");
  await page.screenshot({ path: testInfo.outputPath("manual-tangency.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("rotate, shift-pan, zoom, and reset are observable", async ({ page }) => {
  const errors = await openLab(page);
  const canvas = page.locator("#scene-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const before = await page.evaluate(() => window.__fiberLab.snapshot().view.camera);
  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58, { steps: 8 });
  await page.mouse.up();
  const rotated = await page.evaluate(() => window.__fiberLab.snapshot().view.camera);
  expect(Math.abs(rotated.yaw - before.yaw)).toBeGreaterThan(0.1);

  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.58, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const panned = await page.evaluate(() => window.__fiberLab.snapshot().view.camera);
  expect(Math.abs(panned.panX) + Math.abs(panned.panY)).toBeGreaterThan(10);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -500);
  const zoomed = await page.evaluate(() => window.__fiberLab.snapshot().view.camera);
  expect(zoomed.zoom).toBeGreaterThan(before.zoom);

  await page.locator("#reset-camera").click();
  const reset = await page.evaluate(() => window.__fiberLab.snapshot().view.camera);
  expect(Math.abs(reset.yaw + 0.58)).toBeLessThan(0.08);
  expect(Math.abs(reset.panX)).toBeLessThan(1);
  expect(Math.abs(reset.panY)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test("all presets remain playable and numerically labeled", async ({ page }) => {
  const errors = await openLab(page);
  await page.locator("#drift-preset").click();
  await expect(page.locator("#truth-title")).toContainText("Numerical fiber analysis");
  await page.locator("#escape-preset").click();
  await expect(page.locator("#solver-status")).toContainText("tangency detected");
  await page.locator("#collision-preset").click();
  await expect(page.locator("#truth-title")).toHaveText("Stored exact certificate");

  await page.getByRole("button", { name: /Automorphisms/ }).click();
  await page.locator("#collision-preset").click();
  await expect(page.locator("#truth-detail")).toContainText("identity");
  await page.locator("#drift-preset").click();
  await expect(page.locator("#truth-detail")).toContainText("single triangular shear");
  await page.locator("#escape-preset").click();
  await expect(page.locator("#truth-detail")).toContainText("chained triangular shears");
  expect(errors).toEqual([]);
});

test("mobile layout has no horizontal overflow and retains interaction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only assertion");
  const errors = await openLab(page);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.clientWidth).toBe(390);
  expect(dimensions.scrollWidth).toBe(390);
  await page.getByRole("button", { name: /Complex landscape/ }).click();
  await expect(page.locator("#scene-canvas")).toHaveAttribute("data-render-ready", "true");
  await page.screenshot({ path: testInfo.outputPath("mobile-landscape.png"), fullPage: true });
  expect(errors).toEqual([]);
});
