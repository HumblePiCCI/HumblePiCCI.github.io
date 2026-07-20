"""Command-line interface for the Jacobian counterexample factory."""

from __future__ import annotations

import argparse
from collections.abc import Sequence

import sympy as sp

from .factory import generate_n, verify


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="jacobian-factory",
        description=(
            "Generate exact constant-Jacobian, noninjective polynomial maps "
            "C^3 -> C^3 and verify their certificates."
        ),
    )
    parser.add_argument(
        "--count",
        type=int,
        default=3,
        help="number of pairwise inequivalent maps to generate (default: 3)",
    )
    parser.add_argument(
        "--normalize",
        action="store_true",
        help="scale the first output so every Jacobian determinant is 1",
    )
    parser.add_argument(
        "--verify-through",
        type=int,
        default=8,
        help=(
            "run the full expanded Jacobian determinant for d at most this "
            "value; structural verification always runs (default: 8)"
        ),
    )
    parser.add_argument(
        "--print-maps",
        action="store_true",
        help="print expanded coordinate polynomials",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    family = generate_n(
        args.count,
        normalize_jacobian_to_one=args.normalize,
    )

    success = True
    for d, F, certificate in family:
        report = verify(
            d,
            normalize_jacobian_to_one=args.normalize,
            brute_force_jacobian=d <= args.verify_through,
        )
        success = success and report.ok
        brute_force = (
            "skipped"
            if report.brute_force_jacobian is None
            else str(report.brute_force_jacobian)
        )
        print(
            f"d={d}: ok={report.ok}, generic_degree={report.generic_degree}, "
            f"structural_det={report.structural_jacobian}, "
            f"brute_force_det={brute_force}, collision={report.collision_ok}"
        )
        print(f"  target: {certificate.target}")
        print(f"  points: {certificate.points}")
        if args.print_maps:
            print(f"  map: {tuple(sp.expand(component) for component in F)}")

    return 0 if success else 1
