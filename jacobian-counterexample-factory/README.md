# Jacobian Counterexample Factory

An exact SymPy implementation of a polynomial-map family

\[
G_d:\mathbb C^3\to\mathbb C^3,\qquad d\ge 3,
\]

with all of the following properties:

- \(\det DG_d=-2\), or \(1\) after a one-coordinate normalization;
- an explicit collision certificate, so \(G_d\) is not injective;
- generic fiber degree \(d\); and
- one pairwise left-right inequivalent example for every \(d\ge3\).

The seed map was publicly announced on July 20, 2026. The algebraic identities
here are exact and machine-checkable; the announcement is new enough that
normal mathematical review is still unfolding. This repository makes no
priority claim for the infinite-family construction.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"

jacobian-factory --count 6 --verify-through 8
pytest
```

Normalize every determinant to \(1\):

```bash
jacobian-factory --count 6 --normalize --verify-through 8
```

## Interactive fiber lab

The browser-based [Jacobian Fiber Lab](visualizer/) compares determinant-one
polynomial automorphisms with this repository's counterexamples in two linked,
rotatable views:

- a real fiber atlas built from
  \(\alpha(T)=(h_d(T,\gamma)+\beta T)/2\) and
  \(x(T)=2/P'(T)\); and
- a complex landscape of the same fiber polynomial
  \(P(T)=h_d(T,\gamma)+\beta T-2\alpha\).

The visualizer performs complete affine-chart bookkeeping. Simple roots
reconstruct finite sources on \(x\ne0\); finite sources on \(x=0\) are
reconstructed separately; repeated roots with \(P=P'=0\) are classified as
escaping sheets; and any remaining degree loss is reported as a nonproper
branch rather than silently relabeled. Adaptive, disclosed `asinh` display
coordinates keep far roots visible in both scenes while the inspector retains
actual uncompressed values.

Switch among identity, single-shear, and chained-shear automorphisms, each with
determinant `1`, an explicit inverse, and one preimage per target. Then explore
`d=3,...,12` counterexamples, exact stored collision certificates, nearby
fibers, and tangencies. The browser distinguishes exact SymPy certificates from
numerical re-evaluation and reports the maximum relative root residual.

Serve the repository locally and open the visualizer:

```bash
python -m http.server 8000
open http://localhost:8000/jacobian-counterexample-factory/visualizer/
```

Generate from Python:

```python
from jacobian_factory import generate_n, verify

family = generate_n(10, normalize_jacobian_to_one=True)
report = verify(7, normalize_jacobian_to_one=True)
assert report.ok
assert report.generic_degree == 7
assert report.brute_force_jacobian == 1
```

## What is actually verified

The package does not merely print `generic_degree=d` and salute smartly.
For each requested \(d\), it checks four independent certificate layers:

1. **Frame identity.** The compact polynomial formula is compared exactly with
   a rational determinant-neutral frame whose poles cancel.
2. **Structural Jacobian.** Two small Jacobians multiply to the constant
   determinant, avoiding reliance on a giant expanded determinant.
3. **Brute-force Jacobian.** Optionally, SymPy differentiates the full explicit
   coordinate polynomials and factors the resulting determinant.
4. **Fiber and collision data.** The generic fiber polynomial has degree \(d\),
   and exact distinct source points evaluate to one exact target. Points on the
   chart \(x\ne0\) are reconstructed from simple roots of the fiber polynomial.

The first-release audit ran:

- structural-frame equality and full symbolic determinants for \(d=3,\dots,12\);
- normalized full determinants for \(d=3,\dots,9\);
- exact collision certificates for \(d=3,\dots,100\); and
- exact Jacobian evaluations at random integer points for \(d=13,\dots,50\).

Reproduce it with:

```bash
python verification/audit.py
```

## Determinant-neutral frame

On \(x\ne0\), choose polynomials \(w(x,y)\) and \(h(T,C)\), then set

\[
t=y+\frac1x,\qquad r=\frac2x,\qquad c=w(x,y)-x^3z,
\]

\[
B=r-h_T(t,c),\qquad 2A=h(t,c)+tB.
\]

In the \((t,r,c)\) coordinates,

\[
\det\frac{\partial(A,B,c)}{\partial(t,r,c)}=\frac r2.
\]

For every polynomial \(w\),

\[
\det\frac{\partial(t,r,c)}{\partial(x,y,z)}=-2x.
\]

Since \(r=2/x\), their product is \(-2\). The family in this repository
chooses \(h,w\) so all apparent poles cancel and \(A,B,c\) are polynomials.

For \(d=3\),

\[
w=2x-3x^2y,\qquad h(T,C)=-2T^2+CT^3.
\]

For \(d=4\), put \(v=CT-1\) and use

\[
w=x,\qquad h(T,C)=T^2(2v-3v^2).
\]

For \(d\ge5\), use

\[
w=x,\qquad h(T,C)=T^2\left(2v-3v^2-3v^{d-2}\right).
\]

In each case, \(\deg_T h=d\).

## Why the generic degree is \(d\)

For a target \((\alpha,\beta,\gamma)\), every source point on \(x\ne0\)
corresponds to a simple root of

\[
P_{\alpha,\beta,\gamma}(T)
=h(T,\gamma)+\beta T-2\alpha.
\]

Conversely, a simple root \(t_i\) reconstructs a source point through

\[
r_i=P'(t_i),\qquad x_i=\frac2{r_i},\qquad
 y_i=t_i-\frac{r_i}{2},\qquad
 z_i=\frac{w(x_i,y_i)-\gamma}{x_i^3}.
\]

The generic polynomial \(h(T,C)+BT-2A\) has degree \(d\) in \(T\). It is
irreducible over \(\mathbb C(A,B,C)\): viewed over \(\mathbb C(B,C)\), it is
of the form \(f(T)-2A\), with \(A\) transcendental, and a nontrivial
factorization would force a nonconstant factor independent of \(A\) to divide
both the coefficient of \(A\) and the remaining term. Therefore the induced
function-field extension has degree \(d\).

Generic degree is invariant under polynomial automorphisms on source and
target. Hence the maps with distinct \(d\) are genuinely inequivalent, not
merely coordinate-changed copies.

## Seed-map credit and references

The \(d=3\) map was announced on X by Levent Alpöge, crediting Akhil for the
question and Fable for producing the example:

- https://x.com/__alpoge__/status/2079028340955197566

A same-day expository verification and consequences note:

- https://zzhang-iu.github.io/papers/direct-consequences-jacobian/

The code and exposition here are intended for reproduction and scrutiny.
Independent verification, corrections, and sharper attribution are welcome.

## License

MIT. See [LICENSE](LICENSE).
