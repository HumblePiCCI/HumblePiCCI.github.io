# Verification design

This project separates mathematical certification from brute-force computer
algebra. That matters because a large expression simplifying to `-2` is good
evidence, but a small structural identity explaining *why* it must simplify to
`-2` is better.

## Path A: structural determinant certificate

For each `d`, `frame_certificate(d)` supplies `w(x,y)` and `h(T,C)`. The code
constructs

```text
t = y + 1/x
r = 2/x
c = w(x,y) - x^3 z
B = r - h_T(t,c)
2A = h(t,c) + tB
```

and checks exact equality with the compact polynomial map. It separately checks

```text
det d(A,B,c)/d(t,r,c) = r/2
det d(t,r,c)/d(x,y,z) = -2x
```

so the chain rule gives `-2` after substituting `r=2/x`. Normalizing the first
output by `-1/2` gives determinant `1`.

## Path B: full symbolic determinant

When requested, `exact_jacobian_determinant` differentiates the explicit map in
`x,y,z`, takes the 3-by-3 determinant, and factors it. This is deliberately a
separate computational path from the frame proof.

## Noninjectivity certificate

`collision_certificate(d)` stores exact rational source points and an exact
common target. Verification checks point distinctness and direct substitution.
For points with `x != 0`, it also reconstructs the point from the corresponding
simple root of the fiber polynomial.

## Generic-degree certificate

The code checks `degree_T(h)=d` and that the generic fiber polynomial is linear
in the transcendental target coordinate `A`. The README records the elementary
irreducibility argument for `h(T,C)+BT-2A` over `C(A,B,C)`.

## First-release audit

Run:

```bash
python verification/audit.py
```

The script performs:

1. exact frame and full-determinant checks for `d=3..12`;
2. exact normalized full determinants for `d=3..9`;
3. exact collision checks for `d=3..100`; and
4. five exact random-point Jacobian evaluations for every `d=13..50`.

These checks use exact integers and rationals; no floating-point tolerance is
involved.
