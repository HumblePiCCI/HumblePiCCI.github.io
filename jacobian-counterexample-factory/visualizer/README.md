# Jacobian Fiber Lab

An immersive static visualizer for two mathematically distinct classes of
constant-Jacobian polynomial maps:

- determinant-one polynomial automorphisms with explicit inverses; and
- the repository's noninjective family `G_d`, with determinant `-2` and exact
  collision certificates.

The full maps live in six real dimensions. The lab therefore visualizes the
one-variable fiber equation

```text
P(T) = h_d(T, gamma) + beta*T - 2*alpha
```

and keeps the distinction between the rational `T`-chart and the full affine
source space explicit.

## Run locally

The visualizer is self-contained and can be opened directly from a downloaded
checkout: double-click `visualizer/index.html` or drag it into a browser. Its
runtime uses ordered classic scripts, so a `file://` launch does not depend on
cross-origin ES-module loading.

To serve the same files over HTTP, from `jacobian-counterexample-factory/`:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000/visualizer/
```

## Guided interactive tour

The **guided tour** is the recommended entry point for visitors who do not
already know the Jacobian conjecture. Open it from the top bar, the floating
`∂` guide, the `?` keyboard shortcut, or a shareable URL ending in `?tour=1`.

The tour is a separate, file-compatible presentation layer. It moves the live
lab through a carefully ordered teaching sequence while keeping the underlying
mathematics and renderer unchanged:

1. the Jacobian determinant and the local inverse guarantee;
2. the conjecture's proposed local-to-global implication;
3. an invertible triangular-shear control case;
4. the constant-Jacobian counterexample chamber;
5. the exact three-source cubic collision;
6. the one-variable fiber polynomial and reconstruction formula;
7. the finite `x = 0` source in the second affine chart;
8. repeated roots and sheets escaping through infinity;
9. the complex root landscape; and
10. why exact local invertibility plus global overlap is so remarkable.

Each step spotlights the relevant control, changes the live mathematical state,
and presents plain-language context alongside the key formula. The tour includes
an intuition check, a source-cycling interaction, keyboard navigation, mobile
bottom-sheet layout, progress persistence when storage is available, and full
state restoration when a visitor exits early. Finishing leaves the lab at the
exact cubic collision for free exploration.

The tour exports a small test API as `window.__JACOBIAN_TOUR__`. It remains
compatible with direct `file://` launch because `tour.js` is an ordered classic
script loaded after the existing math and application runtimes.

## What is represented

### Fiber atlas

For fixed `d`, `beta`, and `gamma`, the real sculpture uses

```text
alpha(T) = (h_d(T, gamma) + beta*T) / 2
x(T)     = 2 / (h_T(T, gamma) + beta).
```

A target plane at the selected `alpha` meets this curve at real simple roots.
Each such root reconstructs a finite source on `x != 0`.

The horizontal display coordinate is an adaptive, disclosed transform

```text
u = asinh((T - center) / scale).
```

It is fitted from all current real roots and critical points, so a root near
`T=200` is not silently dropped. Actual, uncompressed coordinates remain in
the inspector.

### Complex landscape

The landscape evaluates the same exact polynomial over a two-dimensional
adaptive coordinate chart:

```text
u = asinh((Re T - center_re) / scale_re)
v = asinh((Im T - center_im) / scale_im).
```

The surface height is a normalized `log(1 + |P(T)|)` value. Every numerical
polynomial root is placed inside the declared display window; the UI shows the
actual complex `T` and the maximum relative residual.

## Complete fiber accounting

The lab classifies sheets from the mathematics, not from which preset button
was clicked.

1. **Simple roots on `x != 0`.** These reconstruct finite affine sources via
   `x = 2/P'(T)`.
2. **Finite sources on `x = 0`.** Exactly when `gamma = 0`, the rational `T`
   coordinate omits a finite boundary-chart source. It is reconstructed
   separately, numerically checked against the selected target, and never
   inferred from a tolerance or mislabeled as infinity.
3. **Repeated roots.** When `P(T) = P'(T) = 0`, reconstruction cannot produce a
   finite `x`; the associated generic sheets escape through infinity.
4. **Degree loss at chart infinity.** In the exact `gamma = 0`
   specialization, after accounting for the finite `x = 0` source, any
   remaining generic sheets absent from the special affine fiber are reported
   as nonproper branches at infinity. For nonzero `gamma`, an apparent degree
   drop can only come from floating-point coefficient underflow, so the
   missing sheets are numerically unresolved rather than geometric escape.
5. **Numerical uncertainty.** Undefined or unresolved values receive an
   explicit status. `NaN` is never formatted as a signed infinity.

At the cubic collision target, the correct accounting is three finite affine
preimages: two simple roots on `x != 0` and the finite point
`(0, 0, -1/4)` on `x = 0`.

## Exact versus numerical claims

- Family formulas, determinants, generic degrees, and stored collision
  certificates are established by the exact SymPy package.
- The browser re-evaluates stored certificates numerically and reports the
  measured error; it does not call that floating-point check an exact proof.
- Root locations and rendered meshes are numerical. Their maximum relative
  residual is always exposed.
- The automorphism chamber displays the exact triangular inverse and has one
  affine preimage for every target.

## Interaction

- start the guided tour from the top bar, floating `∂`, `?`, `?tour=1`, or
  `#tour`;
- use Left/Right or Page Up/Page Down to navigate the tour and Escape to exit;
- drag to rotate;
- Shift-drag or right-drag to pan;
- wheel to zoom;
- click a marker to inspect its sheet group;
- use the exact-collision, nearby-fiber, and escape-wall presets;
- switch between the real fiber atlas and the complex landscape.

The renderer is dependency-free Canvas 2D with an explicit 3D camera. This
removes CDN/runtime fragility and avoids WebGL resource leaks during long
interactive sessions.

## Tests

Pure mathematics:

```bash
node --test visualizer/tests/math.test.mjs
```

Maintained Playwright desktop/mobile suite, including the guided tour:

```bash
cd visualizer
npm ci
npx playwright install chromium
npm run test:browser
```

Equivalent dependency-light Python smoke suite:

```bash
python -m pip install playwright==1.61.0
python -m playwright install chromium
python -m http.server 8765 &
JACOBIAN_LAB_URL=http://127.0.0.1:8765/visualizer/ \
  python visualizer/tests/browser_smoke.py
```

The browser suite exercises direct `file://` launch, desktop and mobile
layouts, both chambers and both scene modes, the complete guided learning arc,
a far-off cubic root, the cubic `x = 0` source, tiny nonzero `gamma` values
that must not create a boundary source, a manually entered tangency, marker
visibility, rotate/pan/zoom/reset, screenshots, failed resource requests, and
console errors.
