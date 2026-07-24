import { expect, test } from "@playwright/test";

async function openLab(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.goto("./", { waitUntil: "networkidle" });
  await expect(page.locator("#scene")).toHaveAttribute("data-render-ready", "true");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.sessionReady === "true")).toBe(true);
  return errors;
}

async function snapshot(page) {
  return page.evaluate(() => window.__JACOBIAN_LAB__.snapshot());
}

test("clicking the already-active family preserves running animation and its center", async ({ page }) => {
  const errors = await openLab(page);
  await page.locator("#animate-target").click();
  const before = await snapshot(page);
  expect(before.state.animate).toBe(true);
  const center = before.state.animationCenter;

  await page.getByRole("button", { name: /Counterexamples/ }).click();
  const afterClick = await snapshot(page);
  expect(afterClick.state.animate).toBe(true);
  expect(afterClick.state.animationCenter).toBeCloseTo(center, 10);
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#animate-target > span").first()).toHaveText("Ⅱ");

  const alpha = afterClick.state.alpha;
  await page.waitForTimeout(280);
  expect(Math.abs((await snapshot(page)).state.alpha - alpha)).toBeGreaterThan(1e-4);
  expect(errors).toEqual([]);
});

test("automorphism presets and coordinate edits stop animation with truthful controls", async ({ page }) => {
  const errors = await openLab(page);
  await page.getByRole("button", { name: /Automorphisms/ }).click();
  await page.locator("#animate-target").click();
  await page.locator("#preset-three").click();
  expect((await snapshot(page)).state.animate).toBe(false);
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#animate-target > span").first()).toHaveText("▶");

  await page.locator("#animate-target").click();
  await page.locator("#gamma-number").fill("0.75");
  await page.locator("#gamma-number").press("Enter");
  expect((await snapshot(page)).state.animate).toBe(false);
  await expect(page.locator("#animate-target")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#animate-target > span").first()).toHaveText("▶");
  expect(errors).toEqual([]);
});
