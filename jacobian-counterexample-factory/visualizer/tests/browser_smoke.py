from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Page, sync_playwright

BASE_URL = os.environ.get("JACOBIAN_LAB_URL", "http://127.0.0.1:8765/visualizer/")
INLINE_ROOT = os.environ.get("JACOBIAN_LAB_INLINE_ROOT")
RESULTS = Path(os.environ.get("JACOBIAN_LAB_RESULTS", Path(__file__).parent / "test-results"))
RESULTS.mkdir(parents=True, exist_ok=True)


def wait_ready(page: Page) -> None:
    page.wait_for_function("document.documentElement.dataset.renderReady === 'true'")
    page.wait_for_timeout(300)


def snapshot(page: Page) -> dict:
    return page.evaluate("window.__JACOBIAN_LAB__.snapshot()")


def assert_markers_inside(data: dict, marker_type: str = "finite") -> None:
    width = data["canvas"]["width"]
    height = data["canvas"]["height"]
    markers = [marker for marker in data["markers"] if marker["type"] == marker_type]
    assert markers, f"no {marker_type} markers in {json.dumps(data, indent=2)}"
    for marker in markers:
        assert -2 <= marker["x"] <= width + 2, marker
        assert -2 <= marker["y"] <= height + 2, marker


def set_state(page: Page, **partial: object) -> dict:
    page.evaluate("partial => window.__JACOBIAN_LAB__.setState(partial)", partial)
    page.wait_for_timeout(350)
    return snapshot(page)


def run() -> None:
    console_errors: list[str] = []
    page_errors: list[str] = []
    executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")

    with sync_playwright() as playwright:
        launch_options: dict[str, object] = {"headless": True}
        if executable:
            launch_options["executable_path"] = executable
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = context.new_page()

        def on_console(message: ConsoleMessage) -> None:
            if message.type == "error":
                console_errors.append(message.text)

        page.on("console", on_console)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        if INLINE_ROOT:
            root = Path(INLINE_ROOT)
            html = (root / "index.html").read_text(encoding="utf-8")
            css = (root / "visualizer.css").read_text(encoding="utf-8")
            math_source = (root / "math.js").read_text(encoding="utf-8").replace("export ", "")
            app_source = (root / "app.js").read_text(encoding="utf-8")
            import_end = app_source.index("const $ =")
            app_source = app_source[import_end:]
            html = html.replace('<link rel="stylesheet" href="./visualizer.css">', f"<style>{css}</style>")
            html = html.replace('<script type="module" src="./app.js"></script>', f"<script>{math_source}\n{app_source}</script>")
            page.set_content(html, wait_until="load")
        else:
            page.goto(BASE_URL, wait_until="networkidle")
        wait_ready(page)

        data = snapshot(page)
        assert data["state"]["family"] == "counterexample"
        assert data["analysis"]["genericDegree"] == 5
        assert data["analysis"]["unresolvedCount"] == 0
        assert page.locator("#classification-title").inner_text() == "Non-injective Keller map"

        # All three roots, including T approximately 200, must remain visible in
        # both scenes rather than falling outside a fixed plotting window.
        data = set_state(
            page,
            family="counterexample",
            mode="fiber",
            d=3,
            alpha=-0.25,
            beta=0,
            gamma=0.01,
            activePreset="custom",
        )
        assert data["analysis"]["finiteAffineCount"] == 3, data
        assert data["analysis"]["escapeCount"] == 0, data
        assert any(root["re"] and root["re"] > 190 for root in data["analysis"]["roots"]), data
        assert_markers_inside(data, "finite")
        assert "asinh" in data["transform"]

        data = set_state(page, mode="landscape")
        assert_markers_inside(data, "finite")
        page.screenshot(path=str(RESULTS / "desktop-landscape.png"), full_page=True)

        # An x=0 source exists only over gamma exactly zero. Tiny nonzero
        # leading coefficients retain all three chart roots without adding a
        # tolerance-created fourth affine source.
        for tiny_gamma in (1e-13, -1e-13):
            data = set_state(
                page,
                mode="fiber",
                d=3,
                alpha=-0.25,
                beta=0,
                gamma=tiny_gamma,
                activePreset="custom",
            )
            assert data["analysis"]["chartDegree"] == 3, data
            assert data["analysis"]["boundaryCount"] == 0, data
            assert data["analysis"]["finiteAffineCount"] == 3, data
            assert data["analysis"]["accountedSheets"] == 3, data
            assert data["analysis"]["unresolvedCount"] == 0, data
            assert data["analysis"]["sheetAccountingValid"] is True, data
            assert page.locator("#accounting-total").inner_text() == "3 / 3 sheets"

        # The cubic collision has two x != 0 roots and one finite x = 0 source.
        data = set_state(page, mode="fiber", d=3, alpha=-0.25, beta=0, gamma=0, activePreset="collision")
        assert data["analysis"]["finiteChartCount"] == 2, data
        assert data["analysis"]["boundaryCount"] == 1, data
        assert data["analysis"]["finiteAffineCount"] == 3, data
        assert data["analysis"]["escapeCount"] == 0, data
        assert_markers_inside(data, "boundary")
        assert page.locator("#truth-title").inner_text() == "Stored exact certificate"
        assert "numerical re-evaluation passed" in page.locator("#truth-detail").inner_text()

        # A manually entered tangency is inferred from P and P', not a preset.
        data = set_state(page, d=3, alpha=0, beta=0, gamma=0, activePreset="custom")
        assert data["analysis"]["boundaryCount"] == 1, data
        assert data["analysis"]["repeatedEscapeCount"] == 2, data
        assert data["analysis"]["finiteAffineCount"] == 1, data
        assert data["analysis"]["escapeCount"] == 2, data
        assert_markers_inside(data, "boundary")
        assert_markers_inside(data, "escape")
        assert page.locator("#truth-title").inner_text() == "Escape inferred from P and P′"

        # The automorphism chamber remains determinant-one and single-sheeted.
        data = set_state(
            page,
            family="automorphism",
            mode="fiber",
            variant="chain",
            d=12,
            alpha=2,
            beta=1,
            gamma=0,
            activePreset="chain",
        )
        assert data["analysis"]["genericDegree"] == 1, data
        assert data["analysis"]["finiteAffineCount"] == 1, data
        assert data["analysis"]["escapeCount"] == 0, data
        assert page.locator("#jacobian-metric").inner_text() == "1"

        # Rotate, Shift-pan, wheel-zoom, and reset in a real browser.
        before = snapshot(page)["camera"]
        box = page.locator("#scene").bounding_box()
        assert box
        cx = box["x"] + box["width"] * 0.55
        cy = box["y"] + box["height"] * 0.48
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + 110, cy + 55, steps=8)
        page.mouse.up()
        page.wait_for_timeout(120)
        rotated = snapshot(page)["camera"]
        assert abs(rotated["yaw"] - before["yaw"]) > 0.2
        assert abs(rotated["pitch"] - before["pitch"]) > 0.1

        page.keyboard.down("Shift")
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + 70, cy - 35, steps=6)
        page.mouse.up()
        page.keyboard.up("Shift")
        page.mouse.wheel(0, -420)
        page.wait_for_timeout(120)
        moved = snapshot(page)["camera"]
        assert abs(moved["panX"]) > 20
        assert abs(moved["panY"]) > 10
        assert moved["zoom"] > rotated["zoom"]
        page.locator("#reset-camera").click()
        page.wait_for_timeout(80)
        reset = snapshot(page)["camera"]
        assert abs(reset["panX"]) < 1e-9 and abs(reset["panY"]) < 1e-9
        page.screenshot(path=str(RESULTS / "desktop-fiber.png"), full_page=True)

        # Mobile layout remains horizontally contained and interactive.
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(400)
        dimensions = page.evaluate(
            "({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth})"
        )
        assert dimensions["client"] == dimensions["scroll"] == 390, dimensions
        page.locator('[data-family="counterexample"]').click()
        page.locator('[data-mode="landscape"]').click()
        page.wait_for_timeout(350)
        assert page.locator("#scene").is_visible()
        page.screenshot(path=str(RESULTS / "mobile-landscape.png"), full_page=True)

        assert not console_errors, console_errors
        assert not page_errors, page_errors
        context.close()
        browser.close()


if __name__ == "__main__":
    run()
