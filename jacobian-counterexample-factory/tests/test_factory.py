from __future__ import annotations

import pytest
import sympy as sp

from jacobian_factory import (
    T,
    collision_certificate,
    counterexample_map,
    evaluate,
    fiber_polynomial,
    frame_certificate,
    generate_n,
    reconstruct_source_from_root,
    verify,
)


def test_original_map_and_three_point_collision() -> None:
    report = verify(3, brute_force_jacobian=True)
    assert report.ok
    assert report.brute_force_jacobian == -2
    assert report.generic_degree == 3

    cert = collision_certificate(3)
    assert len(cert.points) == 3
    F = counterexample_map(3)
    assert all(evaluate(F, point) == cert.target for point in cert.points)


@pytest.mark.parametrize("d", range(3, 9))
def test_full_exact_verification(d: int) -> None:
    report = verify(d, brute_force_jacobian=True)
    assert report.ok
    assert report.structural_jacobian == -2
    assert report.brute_force_jacobian == -2
    assert report.generic_degree == d


@pytest.mark.parametrize("d", range(3, 9))
def test_normalized_jacobian(d: int) -> None:
    report = verify(
        d,
        normalize_jacobian_to_one=True,
        brute_force_jacobian=True,
    )
    assert report.ok
    assert report.structural_jacobian == 1
    assert report.brute_force_jacobian == 1


@pytest.mark.parametrize("d", range(3, 31))
def test_collision_certificates(d: int) -> None:
    F = counterexample_map(d)
    cert = collision_certificate(d)
    assert len(set(cert.points)) == len(cert.points)
    assert all(evaluate(F, point) == cert.target for point in cert.points)


@pytest.mark.parametrize("d", range(3, 21))
def test_generic_fiber_degree(d: int) -> None:
    cert = frame_certificate(d)
    P = fiber_polynomial(d)
    assert cert.generic_degree == d
    assert sp.Poly(P, T).degree() == d


@pytest.mark.parametrize("d", range(3, 11))
def test_reconstruction_for_nonzero_x_certificate_points(d: int) -> None:
    F = counterexample_map(d)
    cert = collision_certificate(d)
    checked = 0
    for point in cert.points:
        x_value, y_value, _ = point
        if x_value == 0:
            continue
        root = sp.simplify(y_value + 1 / x_value)
        reconstructed = reconstruct_source_from_root(d, root, cert.target)
        assert reconstructed == point
        assert evaluate(F, reconstructed) == cert.target
        checked += 1
    assert checked >= 1


def test_generate_n_uses_distinct_generic_degrees() -> None:
    family = generate_n(10)
    assert [d for d, _, _ in family] == list(range(3, 13))


@pytest.mark.parametrize("bad", [2, 1, 0, -1])
def test_rejects_small_degrees(bad: int) -> None:
    with pytest.raises(ValueError):
        counterexample_map(bad)


@pytest.mark.parametrize("bad", [3.0, "3", True])
def test_rejects_noninteger_degrees(bad: object) -> None:
    with pytest.raises(TypeError):
        counterexample_map(bad)  # type: ignore[arg-type]
