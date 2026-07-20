from __future__ import annotations

import pytest
import sympy as sp

from jacobian_factory import (
    C,
    R,
    T,
    VARS,
    counterexample_map,
    frame_certificate,
    rational_frame_map,
    x,
    y,
    z,
)


@pytest.mark.parametrize("d", range(3, 9))
def test_explicit_map_equals_frame_map(d: int) -> None:
    explicit = counterexample_map(d)
    structural = rational_frame_map(d)
    assert all(
        sp.cancel(a - b) == 0 for a, b in zip(explicit, structural)
    )


@pytest.mark.parametrize("d", range(3, 12))
def test_frame_jacobian_is_r_over_two(d: int) -> None:
    cert = frame_certificate(d)
    B = R - sp.diff(cert.h, T)
    A = (cert.h + T * B) / 2
    determinant = sp.simplify(
        sp.Matrix((A, B, C)).jacobian((T, R, C)).det()
    )
    assert determinant == R / 2


@pytest.mark.parametrize("d", range(3, 12))
def test_coordinate_jacobian_is_minus_two_x(d: int) -> None:
    cert = frame_certificate(d)
    t = y + 1 / x
    r = 2 / x
    c = cert.w - x**3 * z
    determinant = sp.simplify(sp.Matrix((t, r, c)).jacobian(VARS).det())
    assert determinant == -2 * x
