#!/usr/bin/env python3
"""Extended exact audit used before the first public release."""

from __future__ import annotations

import random

import sympy as sp

from jacobian_factory import (
    VARS,
    collision_certificate,
    counterexample_map,
    evaluate,
    verify,
    x,
    y,
    z,
)


def main() -> None:
    print("1. Exact structural and full symbolic verification, d=3..12")
    for d in range(3, 13):
        report = verify(d, brute_force_jacobian=True)
        assert report.ok
        assert report.brute_force_jacobian == -2
        print(f"   d={d}: det={report.brute_force_jacobian}")

    print("2. Exact normalized determinants, d=3..9")
    for d in range(3, 10):
        report = verify(
            d,
            normalize_jacobian_to_one=True,
            brute_force_jacobian=True,
        )
        assert report.ok
        assert report.brute_force_jacobian == 1
        print(f"   d={d}: det={report.brute_force_jacobian}")

    print("3. Exact collision certificates, d=3..100")
    for d in range(3, 101):
        F = counterexample_map(d)
        certificate = collision_certificate(d)
        assert len(set(certificate.points)) == len(certificate.points)
        assert all(
            evaluate(F, point) == certificate.target
            for point in certificate.points
        )
    print("   all collisions verified")

    print("4. Random exact Jacobian evaluations, d=13..50")
    rng = random.Random(20260720)
    for d in range(13, 51):
        F = counterexample_map(d)
        J = sp.Matrix(F).jacobian(VARS)
        for _ in range(5):
            point = {
                x: sp.Integer(rng.choice((-3, -2, -1, 1, 2, 3))),
                y: sp.Integer(rng.randint(-3, 3)),
                z: sp.Integer(rng.randint(-3, 3)),
            }
            assert sp.simplify(J.subs(point).det()) == -2
    print("   all random evaluations verified")

    print("AUDIT PASSED")


if __name__ == "__main__":
    main()
