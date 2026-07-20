"""Exact polynomial maps for an infinite C^3 Jacobian-counterexample family.

The implementation has two layers:

* compact explicit polynomial formulas, used for generation; and
* a rational ``(t, r, c)`` frame, used as a structural certificate.

All arithmetic is exact SymPy arithmetic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import sympy as sp

x, y, z = sp.symbols("x y z")
T, R, C = sp.symbols("T R C")
A_TARGET, B_TARGET, C_TARGET = sp.symbols("A_target B_target C_target")
VARS = (x, y, z)
FRAME_VARS = (T, R, C)

Point = tuple[sp.Expr, sp.Expr, sp.Expr]
PolynomialMap = tuple[sp.Expr, sp.Expr, sp.Expr]


@dataclass(frozen=True)
class CollisionCertificate:
    """Distinct source points and their common target."""

    d: int
    points: tuple[Point, ...]
    target: Point


@dataclass(frozen=True)
class FrameCertificate:
    """Data defining the determinant-neutral rational frame."""

    d: int
    w: sp.Expr
    h: sp.Expr
    generic_degree: int


@dataclass(frozen=True)
class VerificationReport:
    """Exact checks performed for one family member."""

    d: int
    normalized: bool
    expected_jacobian: sp.Expr
    generic_degree: int
    generic_degree_ok: bool
    frame_identity_ok: bool
    frame_jacobian_ok: bool
    coordinate_jacobian_ok: bool
    structural_jacobian: sp.Expr
    structural_jacobian_ok: bool
    collision_ok: bool
    reconstruction_ok: bool
    brute_force_jacobian: sp.Expr | None
    brute_force_jacobian_ok: bool | None

    @property
    def ok(self) -> bool:
        checks = (
            self.generic_degree_ok,
            self.frame_identity_ok,
            self.frame_jacobian_ok,
            self.coordinate_jacobian_ok,
            self.structural_jacobian_ok,
            self.collision_ok,
            self.reconstruction_ok,
        )
        brute_force_ok = (
            True
            if self.brute_force_jacobian_ok is None
            else self.brute_force_jacobian_ok
        )
        return all(checks) and brute_force_ok


def _validate_degree(d: int) -> int:
    if isinstance(d, bool) or not isinstance(d, int):
        raise TypeError("d must be an integer")
    if d < 3:
        raise ValueError("d must be at least 3")
    return d


def frame_certificate(d: int) -> FrameCertificate:
    """Return ``w(x,y)`` and ``h(T,C)`` for the rational frame.

    On the chart x != 0, set

        t = y + 1/x,
        r = 2/x,
        c = w(x,y) - x^3 z,
        B = r - h_T(t,c),
        2A = h(t,c) + tB.

    Whenever A and B polynomialize, the resulting map has determinant -2.
    For this family, ``degree_T(h) == d``.
    """
    d = _validate_degree(d)

    if d == 3:
        w = 2 * x - 3 * x**2 * y
        h = -2 * T**2 + C * T**3
    else:
        w = x
        v = C * T - 1
        if d == 4:
            g = 2 * v - 3 * v**2
        else:
            g = 2 * v - 3 * v**2 - 3 * v ** (d - 2)
        h = T**2 * g

    h = sp.expand(h)
    generic_degree = int(sp.Poly(h, T).degree())
    return FrameCertificate(d=d, w=w, h=h, generic_degree=generic_degree)


def counterexample_map(
    d: int,
    *,
    normalize_jacobian_to_one: bool = False,
    expand: bool = False,
) -> PolynomialMap:
    """Return the degree-d family member ``G_d = (A_d, B_d, C_d)``.

    The compact formulas satisfy ``det(D G_d) = -2`` and are noninjective.
    With ``normalize_jacobian_to_one=True``, the first output is multiplied
    by ``-1/2`` and the determinant becomes 1.
    """
    d = _validate_degree(d)
    q = 1 + x * y

    if d == 3:
        A = q**3 * z + y**2 * q * (4 + 3 * x * y)
        B = y + 3 * x * q**2 * z + 3 * x * y**2 * (4 + 3 * x * y)
        C_out = 2 * x - 3 * x**2 * y - x**3 * z
    else:
        D = y - x * z - x**2 * y * z
        s = x * D
        C_out = x - x**3 * z

        if d == 4:
            A = q * (y**2 - q**2 * z) + sp.Rational(9, 2) * q**2 * D**2
            B = -2 * y + 12 * x * q * D**2
        else:
            A = (
                q * (y**2 - q**2 * z)
                + sp.Rational(3, 2)
                * q**2
                * D**2
                * (3 + (d - 2) * s ** (d - 5) + (d - 1) * s ** (d - 4))
            )
            B = (
                -2 * y
                + 3
                * x
                * q
                * D**2
                * (4 + (d - 2) * s ** (d - 5) + d * s ** (d - 4))
            )

    if normalize_jacobian_to_one:
        A = -A / 2

    result = (A, B, C_out)
    if expand:
        return tuple(sp.expand(component) for component in result)  # type: ignore[return-value]
    return result


def rational_frame_map(
    d: int,
    *,
    normalize_jacobian_to_one: bool = False,
) -> PolynomialMap:
    """Construct the map through the rational frame.

    The returned expressions are simplified rational expressions.  For every
    member of this family, their denominators cancel exactly and they equal
    :func:`counterexample_map`.
    """
    cert = frame_certificate(d)
    t = y + 1 / x
    r = 2 / x
    c = cert.w - x**3 * z
    h_sub = cert.h.subs({T: t, C: c})
    h_t_sub = sp.diff(cert.h, T).subs({T: t, C: c})
    B = sp.cancel(r - h_t_sub)
    A = sp.cancel((h_sub + t * B) / 2)

    if normalize_jacobian_to_one:
        A = -A / 2

    return (sp.cancel(A), sp.cancel(B), sp.cancel(c))


def collision_certificate(
    d: int,
    *,
    normalize_jacobian_to_one: bool = False,
) -> CollisionCertificate:
    """Return an exact collision certificate for ``G_d``."""
    d = _validate_degree(d)

    if d == 3:
        points: tuple[Point, ...] = (
            (sp.Integer(0), sp.Integer(0), -sp.Rational(1, 4)),
            (sp.Integer(1), -sp.Rational(3, 2), sp.Rational(13, 2)),
            (-sp.Integer(1), sp.Rational(3, 2), sp.Rational(13, 2)),
        )
        target: Point = (
            -sp.Rational(1, 4),
            sp.Integer(0),
            sp.Integer(0),
        )
    elif d == 4:
        points = (
            (sp.Rational(1, 3), -sp.Integer(2), -sp.Integer(18)),
            (-sp.Rational(1, 8), sp.Integer(10), sp.Integer(576)),
        )
        target = (sp.Integer(2), sp.Integer(4), sp.Integer(1))
    else:
        m = 6 * d - 4
        points = (
            (sp.Rational(1, 9), -sp.Integer(8), -sp.Integer(648)),
            (
                -sp.Rational(1, m),
                sp.Integer(6 * d - 2),
                sp.Integer(m**2 * (6 * d - 3)),
            ),
        )
        target = (sp.Integer(8), sp.Integer(16), sp.Integer(1))

    if normalize_jacobian_to_one:
        target = (-target[0] / 2, target[1], target[2])

    return CollisionCertificate(d=d, points=points, target=target)


def evaluate(F: Sequence[sp.Expr], point: Sequence[sp.Expr]) -> Point:
    """Evaluate a 3-component symbolic map at an exact point."""
    if len(F) != 3 or len(point) != 3:
        raise ValueError("F and point must both have length 3")
    substitutions = dict(zip(VARS, point))
    return tuple(sp.simplify(component.subs(substitutions)) for component in F)  # type: ignore[return-value]


def exact_jacobian_determinant(F: Sequence[sp.Expr]) -> sp.Expr:
    """Compute and factor the full symbolic Jacobian determinant."""
    if len(F) != 3:
        raise ValueError("F must have length 3")
    return sp.factor(sp.Matrix(F).jacobian(VARS).det())


def fiber_polynomial(
    d: int,
    alpha: sp.Expr = A_TARGET,
    beta: sp.Expr = B_TARGET,
    gamma: sp.Expr = C_TARGET,
) -> sp.Expr:
    """Return the univariate fiber polynomial.

    For target ``(alpha, beta, gamma)``, source points on x != 0 correspond
    to simple roots of

        h(T, gamma) + beta*T - 2*alpha.
    """
    cert = frame_certificate(d)
    return sp.expand(cert.h.subs(C, gamma) + beta * T - 2 * alpha)


def reconstruct_source_from_root(
    d: int,
    root: sp.Expr,
    target: Sequence[sp.Expr],
) -> Point:
    """Reconstruct a source point from a simple fiber-polynomial root."""
    if len(target) != 3:
        raise ValueError("target must have length 3")
    alpha, beta, gamma = target
    cert = frame_certificate(d)
    derivative = sp.diff(cert.h, T).subs({T: root, C: gamma}) + beta
    r_value = sp.simplify(derivative)
    if r_value == 0:
        raise ValueError("root is not simple; reconstruction has x = infinity")

    x_value = sp.simplify(2 / r_value)
    y_value = sp.simplify(root - r_value / 2)
    w_value = cert.w.subs({x: x_value, y: y_value})
    z_value = sp.simplify((w_value - gamma) / x_value**3)
    return (x_value, y_value, z_value)


def _frame_jacobian(cert: FrameCertificate) -> sp.Expr:
    B = R - sp.diff(cert.h, T)
    A = (cert.h + T * B) / 2
    return sp.simplify(sp.Matrix((A, B, C)).jacobian(FRAME_VARS).det())


def _coordinate_jacobian(cert: FrameCertificate) -> sp.Expr:
    t = y + 1 / x
    r = 2 / x
    c = cert.w - x**3 * z
    return sp.simplify(sp.Matrix((t, r, c)).jacobian(VARS).det())


def _reconstruction_check(
    d: int,
    collision: CollisionCertificate,
    F: PolynomialMap,
) -> bool:
    """Check the frame reconstruction for certificate points with x != 0."""
    checked = 0
    for point in collision.points:
        x_value, y_value, _ = point
        if x_value == 0:
            continue
        root = sp.simplify(y_value + 1 / x_value)
        P = fiber_polynomial(d, *collision.target)
        if sp.simplify(P.subs(T, root)) != 0:
            return False
        reconstructed = reconstruct_source_from_root(d, root, collision.target)
        if any(sp.simplify(a - b) != 0 for a, b in zip(reconstructed, point)):
            return False
        if evaluate(F, reconstructed) != collision.target:
            return False
        checked += 1
    return checked > 0


def verify(
    d: int,
    *,
    normalize_jacobian_to_one: bool = False,
    brute_force_jacobian: bool = True,
) -> VerificationReport:
    """Run exact structural, fiber, collision, and optional brute-force checks."""
    d = _validate_degree(d)
    cert = frame_certificate(d)
    F = counterexample_map(
        d,
        normalize_jacobian_to_one=normalize_jacobian_to_one,
    )
    framed = rational_frame_map(
        d,
        normalize_jacobian_to_one=normalize_jacobian_to_one,
    )

    frame_identity_ok = all(
        sp.cancel(explicit - structural) == 0
        for explicit, structural in zip(F, framed)
    )

    frame_jacobian = _frame_jacobian(cert)
    frame_jacobian_ok = sp.simplify(frame_jacobian - R / 2) == 0

    coordinate_jacobian = _coordinate_jacobian(cert)
    coordinate_jacobian_ok = sp.simplify(coordinate_jacobian + 2 * x) == 0

    structural_jacobian = sp.simplify(
        frame_jacobian.subs(R, 2 / x) * coordinate_jacobian
    )
    if normalize_jacobian_to_one:
        structural_jacobian = sp.simplify(-structural_jacobian / 2)
        expected_jacobian = sp.Integer(1)
    else:
        expected_jacobian = -sp.Integer(2)
    structural_jacobian_ok = (
        sp.simplify(structural_jacobian - expected_jacobian) == 0
    )

    generic_degree = cert.generic_degree
    P_generic = fiber_polynomial(d)
    generic_degree_ok = (
        generic_degree == d
        and int(sp.Poly(P_generic, T).degree()) == d
        and int(sp.Poly(P_generic, A_TARGET).degree()) == 1
    )

    collision = collision_certificate(
        d,
        normalize_jacobian_to_one=normalize_jacobian_to_one,
    )
    images = tuple(evaluate(F, point) for point in collision.points)
    collision_ok = (
        len(set(collision.points)) == len(collision.points)
        and all(image == collision.target for image in images)
    )

    # Reconstruction uses the unnormalized frame's target coordinates.  When
    # normalized, undo the first-coordinate scaling before applying the frame.
    frame_target = collision.target
    frame_F = F
    if normalize_jacobian_to_one:
        frame_target = (-2 * collision.target[0], collision.target[1], collision.target[2])
        frame_F = counterexample_map(d)
    frame_collision = CollisionCertificate(d, collision.points, frame_target)
    reconstruction_ok = _reconstruction_check(d, frame_collision, frame_F)

    brute_force_value: sp.Expr | None = None
    brute_force_ok: bool | None = None
    if brute_force_jacobian:
        brute_force_value = exact_jacobian_determinant(F)
        brute_force_ok = sp.simplify(brute_force_value - expected_jacobian) == 0

    return VerificationReport(
        d=d,
        normalized=normalize_jacobian_to_one,
        expected_jacobian=expected_jacobian,
        generic_degree=generic_degree,
        generic_degree_ok=generic_degree_ok,
        frame_identity_ok=frame_identity_ok,
        frame_jacobian_ok=frame_jacobian_ok,
        coordinate_jacobian_ok=coordinate_jacobian_ok,
        structural_jacobian=structural_jacobian,
        structural_jacobian_ok=structural_jacobian_ok,
        collision_ok=collision_ok,
        reconstruction_ok=reconstruction_ok,
        brute_force_jacobian=brute_force_value,
        brute_force_jacobian_ok=brute_force_ok,
    )


def generate_n(
    count: int,
    *,
    normalize_jacobian_to_one: bool = False,
) -> list[tuple[int, PolynomialMap, CollisionCertificate]]:
    """Generate ``count`` pairwise inequivalent family members.

    The returned generic degrees are ``3, ..., count + 2``.  Generic degree is
    invariant under polynomial automorphisms on source and target, so distinct
    degrees certify left-right inequivalence.
    """
    if isinstance(count, bool) or not isinstance(count, int):
        raise TypeError("count must be an integer")
    if count < 1:
        raise ValueError("count must be positive")

    return [
        (
            d,
            counterexample_map(
                d,
                normalize_jacobian_to_one=normalize_jacobian_to_one,
            ),
            collision_certificate(
                d,
                normalize_jacobian_to_one=normalize_jacobian_to_one,
            ),
        )
        for d in range(3, count + 3)
    ]
