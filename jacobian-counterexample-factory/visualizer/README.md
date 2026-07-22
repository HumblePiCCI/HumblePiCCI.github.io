# Jacobian Fiber Lab

An immersive static visualizer for the exact counterexample family in this
repository. Open `index.html` through a local web server or visit the GitHub
Pages route.

From the repository root:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/jacobian-counterexample-factory/visualizer/
```

## What the two views mean

### Fiber sculpture

For fixed `d`, `beta`, and `gamma`, the sculpture is the real parametric curve

```text
t      -> horizontal axis
alpha  = (h(t, gamma) + beta*t) / 2
x      = 2 / (h_T(t, gamma) + beta)
```

The visual uses `asinh`-style logarithmic compression on the `alpha` and `x`
axes so escaping branches remain visible. The glowing target plane is the
current constant value of `alpha`; its intersections with the sculpture are
the real roots of the fiber polynomial and hence the real finite preimages on
the `x != 0` chart.

At a repeated root, `P'(t) = 0`, so `x = 2/P'(t)` escapes to infinity. The
visual break in the sculpture is therefore mathematical, not decorative.

### Complex landscape

The landscape plots

```text
(Re T, Im T) -> log(1 + |P(T)|)
```

for

```text
P(T) = h_d(T, gamma) + beta*T - 2*alpha.
```

Every displayed root is a numerical zero of the exact polynomial assembled
from the same formulas as `src/jacobian_factory/factory.py`. The UI reports the
largest evaluated root residual. Clicking a root reconstructs its full complex
source coordinates `(x, y, z)`.

## Accuracy boundary

- Family formulas and stored collision certificates are exact transcriptions
  of the SymPy implementation.
- The browser reconstructs and renders roots numerically. It always exposes the
  maximum root residual instead of presenting floating-point output as exact.
- `det DG_d = -2` comes from the repository's exact structural and brute-force
  certificates; it is not estimated from the mesh.
- The cubic collision target has two finite roots on the `x != 0` chart and one
  sheet at infinity. The UI reports that degeneration explicitly.

## Tests

```bash
node --test visualizer/tests/math.test.mjs
```

The tests cover degree construction, collision evaluation, numerical roots,
and source reconstruction independently of WebGL.
