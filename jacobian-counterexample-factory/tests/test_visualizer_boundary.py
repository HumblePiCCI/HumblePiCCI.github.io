"""Exact certificates for the visualizer's second affine chart."""

from __future__ import annotations

import pytest
import sympy as sp

from jacobian_factory import T, counterexample_map, evaluate, fiber_polynomial

ALPHA, BETA = sp.symbols("alpha beta")


def boundary_source(d: int) -> tuple[sp.Expr, sp.Expr, sp.Expr]:
    if d == 3:
        return (sp.Integer(0), BETA, ALPHA - 4 * BETA**2)
    if d == 5:
        return (sp.Integer(0), -BETA / 2, sp.Rational(5, 2) * BETA**2 - ALPHA)
    return (sp.Integer(0), -BETA / 2, sp.Rational(11, 8) * BETA**2 - ALPHA)


@pytest.mark.parametrize("d", range(3, 13))
def test_gamma_zero_has_the_claimed_finite_boundary_source(d: int) -> None:
    image = evaluate(counterexample_map(d), boundary_source(d))
    expected = (ALPHA, BETA, sp.Integer(0))
    assert all(
        sp.simplify(actual - target) == 0
        for actual, target in zip(image, expected)
    )


@pytest.mark.parametrize("d", range(3, 13))
def test_gamma_zero_fiber_polynomial_is_only_the_x_nonzero_chart(d: int) -> None:
    polynomial = sp.Poly(
        fiber_polynomial(d, ALPHA, BETA, sp.Integer(0)),
        T,
    )
    assert polynomial.degree() == 2
