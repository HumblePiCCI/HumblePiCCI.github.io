# Jacobian Fiber Lab

An immersive static visualizer comparing two mathematically distinct classes
of Keller maps:

- conjecture-compatible polynomial automorphisms with determinant `1`, an
  explicit polynomial inverse, and exactly one preimage for every target; and
- the exact non-injective constant-Jacobian family in this repository, with
  determinant `-2` and certified collisions.

Open `index.html` through a local web server or visit the GitHub Pages route.

From the repository root:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/jacobian-counterexample-factory/visualizer/
```

## What the two views mean

The **Automorphisms / Counterexamples** switch changes the map class. The
classification badge, palette, formulas, determinant, inverse/collision
certificate, presets, legends, and 3D relation diagram all change together so
the two classes cannot be confused.

### Conjecture-compatible examples

For an integer `k >= 2`, the three automorphism presets are

```text
I(x,y,z)   = (x, y, z)
S_k(x,y,z) = (x + y^k, y, z)
A_k(x,y,z) = (x + y^k, y + z^k, z).
```

They have triangular Jacobian matrices with diagonal `(1,1,1)`, so their
determinant is exactly `1`. The chained example has the explicit inverse

```text
z = gamma
y = beta - gamma^k
x = alpha - y^k.
```

Thus every complex target `(alpha,beta,gamma)` has exactly one preimage. With
`T=x`, its displayed fiber equation is the linear polynomial

```text
P(T) = T + (beta - gamma^k)^k - alpha.
```

The identity and single-shear presets are the corresponding simplifications.
The automorphism sculpture and landscape are recentered at the unique root;
all inspected coordinates remain the uncentered mathematical values.

### Fiber sculpture

For fixed `d`, `beta`, and `gamma`, the sculpture is the real parametric curve

```text
t      -> horizontal axis
alpha  = (h(t, gamma) + beta*t) / 2
x      = 2 / (h_T(t, gamma) + beta)
```

For the counterexample family, the visual uses `asinh`-style logarithmic compression on the `alpha` and `x`
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

Every displayed counterexample root is a numerical zero of the exact polynomial
assembled from the same formulas as `src/jacobian_factory/factory.py`. The UI
reports the largest evaluated root residual. Clicking a root reconstructs its
full complex source coordinates `(x, y, z)`. For an automorphism, the landscape
is the exact translated linear residual `|T - T_0|`, centered at its unique
root `T_0` to avoid floating-point cancellation for large shear exponents.

## Accuracy boundary

- Family formulas and stored collision certificates are exact transcriptions
  of the SymPy implementation.
- The automorphism examples are certified by their displayed triangular
  Jacobian and explicit polynomial inverse; the tests check all three variants
  for `2 <= k <= 12`.
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

The tests cover the automorphisms' inverse, determinant, unique fiber root,
counterexample degree construction, collision evaluation, numerical roots, and
source reconstruction independently of WebGL.
