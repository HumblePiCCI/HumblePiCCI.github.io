import assert from "node:assert/strict";
import test from "node:test";

import {
  automorphismFiberCoefficients,
  automorphismFrameCurvePoint,
  automorphismJacobian,
  cAbs,
  collisionCertificate,
  determinant3,
  evaluateAutomorphismMap,
  evaluatePolynomial,
  fiberPolynomialCoefficients,
  framePolynomialCoefficients,
  invertAutomorphismMap,
  reconstructAutomorphismSource,
  reconstructSource,
  solvePolynomial,
  verifyCollisionNumerically,
} from "../math.js";

function near(actual, expected, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("frame polynomial has the requested generic degree", () => {
  for (let d = 3; d <= 20; d += 1) {
    const coefficients = framePolynomialCoefficients(d, 1);
    assert.equal(coefficients.length - 1, d);
    assert.notEqual(coefficients.at(-1), 0);
  }
});

test("conjecture-compatible automorphisms have an exact polynomial inverse", () => {
  const variants = ["identity", "shear", "chain"];
  const targets = [
    { alpha: 2, beta: 1, gamma: 0 },
    { alpha: -3, beta: 2, gamma: -1 },
    { alpha: 0.25, beta: -0.5, gamma: 0.75 },
  ];
  for (let k = 2; k <= 12; k += 1) {
    for (const variant of variants) {
      for (const target of targets) {
        const source = invertAutomorphismMap(k, target, variant);
        const image = evaluateAutomorphismMap(k, source, variant);
        near(image[0], target.alpha, 1e-6);
        near(image[1], target.beta, 1e-10);
        near(image[2], target.gamma, 1e-10);
      }
    }
  }
});

test("automorphism examples have constant Jacobian determinant one", () => {
  const variants = ["identity", "shear", "chain"];
  const points = [[0, 0, 0], [1, -2, 3], [-0.25, 0.5, -0.75]];
  for (let k = 2; k <= 20; k += 1) {
    for (const variant of variants) {
      for (const point of points) {
        assert.equal(determinant3(automorphismJacobian(k, point, variant)), 1);
      }
    }
  }
});

test("every automorphism target has exactly one fiber root and one reconstructed source", () => {
  const target = { alpha: 2, beta: 1, gamma: 0 };
  for (const variant of ["identity", "shear", "chain"]) {
    for (let k = 2; k <= 12; k += 1) {
      const coefficients = automorphismFiberCoefficients(k, target.alpha, target.beta, target.gamma, variant);
      const solution = solvePolynomial(coefficients);
      assert.equal(solution.degree, 1);
      assert.equal(solution.roots.length, 1);
      const source = reconstructAutomorphismSource(k, solution.roots[0], target, variant);
      const expected = invertAutomorphismMap(k, target, variant);
      near(source.x.re, expected[0]);
      near(source.y.re, expected[1]);
      near(source.z.re, expected[2]);
      const point = automorphismFrameCurvePoint(k, solution.roots[0].re, target.beta, target.gamma, variant);
      near(point.alpha, target.alpha);
      assert.equal(point.slope, 1);
    }
  }
});

test("browser coefficients match the exact SymPy frame expansions", () => {
  assert.deepEqual(framePolynomialCoefficients(3, 1), [0, 0, -2, 1]);
  assert.deepEqual(framePolynomialCoefficients(4, 1), [0, 0, -5, 8, -3]);
  assert.deepEqual(framePolynomialCoefficients(5, 1), [0, 0, -2, -1, 6, -3]);
  assert.deepEqual(fiberPolynomialCoefficients(3, -0.25, 0, 0), [0.5, 0, -2]);
  assert.deepEqual(fiberPolynomialCoefficients(4, 2, 4, 1), [-4, 4, -5, 8, -3]);
  assert.deepEqual(fiberPolynomialCoefficients(5, 8, 16, 1), [-16, 16, -2, -1, 6, -3]);
});

test("the cubic generic target has roots -1, 1, and 2", () => {
  const coefficients = fiberPolynomialCoefficients(3, -1, -1, 1);
  for (const root of [-1, 1, 2]) near(evaluatePolynomial(coefficients, root).re, 0);
  const solution = solvePolynomial(coefficients);
  assert.equal(solution.roots.length, 3);
  assert.ok(solution.converged);
  assert.ok(solution.residual < 1e-9);
  assert.deepEqual(solution.roots.map((root) => Math.round(root.re)), [-1, 1, 2]);
});

test("published collision certificates evaluate to their exact targets numerically", () => {
  for (let d = 3; d <= 12; d += 1) {
    const verification = verifyCollisionNumerically(d);
    assert.ok(verification.ok, `d=${d} error=${verification.maximumError}`);
  }
});

test("d=5 certified roots reconstruct the two rational source points", () => {
  const certificate = collisionCertificate(5);
  const expected = certificate.points;
  for (let index = 0; index < certificate.finiteRootTs.length; index += 1) {
    const t = certificate.finiteRootTs[index];
    const source = reconstructSource(5, { re: t, im: 0 }, certificate.target);
    near(source.x.re, expected[index][0], 1e-10);
    near(source.y.re, expected[index][1], 1e-10);
    near(source.z.re, expected[index][2], 1e-7);
    near(source.x.im, 0);
    near(source.y.im, 0);
    near(source.z.im, 0);
  }
});

test("collision fibers expose the expected number of finite roots", () => {
  for (let d = 3; d <= 12; d += 1) {
    const target = collisionCertificate(d).target;
    const coefficients = fiberPolynomialCoefficients(d, target.alpha, target.beta, target.gamma);
    const solution = solvePolynomial(coefficients);
    const expectedFiniteDegree = d === 3 ? 2 : d;
    assert.equal(solution.degree, expectedFiniteDegree, `d=${d}`);
    assert.equal(solution.roots.length, expectedFiniteDegree, `d=${d}`);
    assert.ok(solution.residual < 1e-6, `d=${d} residual=${solution.residual}`);
    for (const root of solution.roots) {
      assert.ok(cAbs(evaluatePolynomial(coefficients, root)) < 1e-6, `d=${d}`);
    }
  }
});
