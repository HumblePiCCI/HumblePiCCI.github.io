const EPSILON = 1e-12;

export function complex(re = 0, im = 0) {
  return { re, im };
}

export function cAdd(a, b) {
  return complex(a.re + b.re, a.im + b.im);
}

export function cSub(a, b) {
  return complex(a.re - b.re, a.im - b.im);
}

export function cScale(a, scalar) {
  return complex(a.re * scalar, a.im * scalar);
}

export function cMul(a, b) {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

export function cDiv(a, b) {
  const denominator = b.re * b.re + b.im * b.im;
  if (denominator < Number.MIN_VALUE) {
    return complex(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  }
  return complex(
    (a.re * b.re + a.im * b.im) / denominator,
    (a.im * b.re - a.re * b.im) / denominator,
  );
}

export function cAbs(a) {
  return Math.hypot(a.re, a.im);
}

export function cPow(a, exponent) {
  let result = complex(1, 0);
  let base = a;
  let power = exponent;
  while (power > 0) {
    if (power % 2 === 1) result = cMul(result, base);
    base = cMul(base, base);
    power = Math.floor(power / 2);
  }
  return result;
}

function polyAdd(a, b) {
  const size = Math.max(a.length, b.length);
  const result = Array(size).fill(0);
  for (let index = 0; index < size; index += 1) {
    result[index] = (a[index] ?? 0) + (b[index] ?? 0);
  }
  return result;
}

function polyScale(polynomial, scalar) {
  return polynomial.map((coefficient) => coefficient * scalar);
}

function polyMultiply(a, b) {
  const result = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      result[i + j] += a[i] * b[j];
    }
  }
  return result;
}

function polyPower(polynomial, exponent) {
  let result = [1];
  let base = polynomial;
  let power = exponent;
  while (power > 0) {
    if (power % 2 === 1) result = polyMultiply(result, base);
    base = polyMultiply(base, base);
    power = Math.floor(power / 2);
  }
  return result;
}

function shiftPolynomial(polynomial, places) {
  return [...Array(places).fill(0), ...polynomial];
}

function trimPolynomial(polynomial, tolerance = EPSILON) {
  const result = [...polynomial];
  while (result.length > 1 && Math.abs(result.at(-1)) < tolerance) result.pop();
  return result;
}

export function framePolynomialCoefficients(d, gamma) {
  if (!Number.isInteger(d) || d < 3) throw new RangeError("d must be an integer at least 3");

  if (d === 3) return [0, 0, -2, gamma];

  const v = [-1, gamma];
  let g = polyAdd(polyScale(v, 2), polyScale(polyPower(v, 2), -3));
  if (d >= 5) g = polyAdd(g, polyScale(polyPower(v, d - 2), -3));
  return shiftPolynomial(g, 2);
}

export function fiberPolynomialCoefficients(d, alpha, beta, gamma) {
  const coefficients = [...framePolynomialCoefficients(d, gamma)];
  coefficients[0] = (coefficients[0] ?? 0) - 2 * alpha;
  coefficients[1] = (coefficients[1] ?? 0) + beta;
  return trimPolynomial(coefficients);
}

export function derivativeCoefficients(coefficients) {
  if (coefficients.length <= 1) return [0];
  return coefficients.slice(1).map((coefficient, index) => coefficient * (index + 1));
}

export function evaluatePolynomial(coefficients, value) {
  const z = typeof value === "number" ? complex(value, 0) : value;
  let result = complex(0, 0);
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    result = cAdd(cMul(result, z), complex(coefficients[index], 0));
  }
  return result;
}

function snapComplex(value, tolerance = 1e-9) {
  return complex(
    Math.abs(value.re) < tolerance ? 0 : value.re,
    Math.abs(value.im) < tolerance ? 0 : value.im,
  );
}

export function solvePolynomial(coefficients, options = {}) {
  const tolerance = options.tolerance ?? 1e-12;
  const maxIterations = options.maxIterations ?? 360;
  const polynomial = trimPolynomial(coefficients, tolerance * 0.1);
  const degree = polynomial.length - 1;

  if (degree < 1) {
    return { roots: [], degree, iterations: 0, converged: true, residual: 0 };
  }
  if (degree === 1) {
    const root = complex(-polynomial[0] / polynomial[1], 0);
    return { roots: [root], degree, iterations: 1, converged: true, residual: 0 };
  }

  const leading = polynomial.at(-1);
  const monic = polynomial.map((coefficient) => coefficient / leading);
  const radius = 1 + Math.max(...monic.slice(0, -1).map(Math.abs));
  let roots = Array.from({ length: degree }, (_, index) => {
    const angle = (2 * Math.PI * (index + 0.271828)) / degree;
    const stagger = 1 + index * 0.003;
    return complex(radius * stagger * Math.cos(angle), radius * stagger * Math.sin(angle));
  });

  let converged = false;
  let iterations = 0;
  for (iterations = 1; iterations <= maxIterations; iterations += 1) {
    let maximumStep = 0;
    const next = roots.map((root, index) => {
      let denominator = complex(1, 0);
      for (let other = 0; other < roots.length; other += 1) {
        if (other !== index) denominator = cMul(denominator, cSub(root, roots[other]));
      }
      if (cAbs(denominator) < 1e-24) {
        denominator = cAdd(denominator, complex(1e-12 * (index + 1), -1e-12));
      }
      const step = cDiv(evaluatePolynomial(monic, root), denominator);
      maximumStep = Math.max(maximumStep, cAbs(step));
      return cSub(root, step);
    });
    roots = next;
    if (maximumStep < tolerance) {
      converged = true;
      break;
    }
  }

  const derivative = derivativeCoefficients(monic);
  roots = roots.map((root) => {
    let refined = root;
    for (let step = 0; step < 12; step += 1) {
      const slope = evaluatePolynomial(derivative, refined);
      if (cAbs(slope) < 1e-18) break;
      const correction = cDiv(evaluatePolynomial(monic, refined), slope);
      refined = cSub(refined, correction);
      if (cAbs(correction) < tolerance) break;
    }
    return snapComplex(refined);
  });

  roots.sort((a, b) => {
    const aReal = Math.abs(a.im) < 1e-8;
    const bReal = Math.abs(b.im) < 1e-8;
    if (aReal !== bReal) return aReal ? -1 : 1;
    if (Math.abs(a.re - b.re) > 1e-9) return a.re - b.re;
    return a.im - b.im;
  });

  const residual = Math.max(...roots.map((root) => cAbs(evaluatePolynomial(polynomial, root))));
  return {
    roots,
    degree,
    iterations: Math.min(iterations, maxIterations),
    converged: converged || residual < 1e-8,
    residual,
  };
}

export function reconstructSource(d, root, target) {
  const { alpha, beta, gamma } = target;
  const polynomial = fiberPolynomialCoefficients(d, alpha, beta, gamma);
  const slope = evaluatePolynomial(derivativeCoefficients(polynomial), root);
  const x = cDiv(complex(2, 0), slope);
  const y = cSub(root, cScale(slope, 0.5));
  const w = d === 3
    ? cSub(cScale(x, 2), cScale(cMul(cMul(x, x), y), 3))
    : x;
  const z = cDiv(cSub(w, complex(gamma, 0)), cPow(x, 3));
  return { x, y, z, slope };
}

export function frameCurvePoint(d, t, beta, gamma) {
  const h = framePolynomialCoefficients(d, gamma);
  const derivative = derivativeCoefficients(h);
  const hValue = evaluatePolynomial(h, t).re;
  const slope = evaluatePolynomial(derivative, t).re + beta;
  return {
    t,
    alpha: (hValue + beta * t) / 2,
    slope,
    x: Math.abs(slope) < 1e-15 ? Number.POSITIVE_INFINITY : 2 / slope,
  };
}

export function collisionCertificate(d) {
  if (d === 3) {
    return {
      target: { alpha: -0.25, beta: 0, gamma: 0 },
      points: [[0, 0, -0.25], [1, -1.5, 6.5], [-1, 1.5, 6.5]],
      finiteRootTs: [-0.5, 0.5],
      rootsAtInfinity: 1,
    };
  }
  if (d === 4) {
    return {
      target: { alpha: 2, beta: 4, gamma: 1 },
      points: [[1 / 3, -2, -18], [-1 / 8, 10, 576]],
      finiteRootTs: [1, 2],
      rootsAtInfinity: 0,
    };
  }
  const m = 6 * d - 4;
  return {
    target: { alpha: 8, beta: 16, gamma: 1 },
    points: [[1 / 9, -8, -648], [-1 / m, 6 * d - 2, m * m * (6 * d - 3)]],
    finiteRootTs: [1, 2],
    rootsAtInfinity: 0,
  };
}

export function threeRealPreset(d) {
  if (d === 3) return { alpha: -1, beta: -1, gamma: 1 };
  const certificate = collisionCertificate(d).target;
  return { ...certificate, alpha: certificate.alpha - 0.65 };
}

export function evaluateCounterexampleMap(d, point) {
  const [x, y, z] = point;
  const q = 1 + x * y;
  if (d === 3) {
    return [
      q ** 3 * z + y ** 2 * q * (4 + 3 * x * y),
      y + 3 * x * q ** 2 * z + 3 * x * y ** 2 * (4 + 3 * x * y),
      2 * x - 3 * x ** 2 * y - x ** 3 * z,
    ];
  }

  const D = y - x * z - x ** 2 * y * z;
  const s = x * D;
  const c = x - x ** 3 * z;
  if (d === 4) {
    return [
      q * (y ** 2 - q ** 2 * z) + 4.5 * q ** 2 * D ** 2,
      -2 * y + 12 * x * q * D ** 2,
      c,
    ];
  }
  return [
    q * (y ** 2 - q ** 2 * z)
      + 1.5 * q ** 2 * D ** 2
      * (3 + (d - 2) * s ** (d - 5) + (d - 1) * s ** (d - 4)),
    -2 * y
      + 3 * x * q * D ** 2
      * (4 + (d - 2) * s ** (d - 5) + d * s ** (d - 4)),
    c,
  ];
}

export function verifyCollisionNumerically(d) {
  const certificate = collisionCertificate(d);
  const expected = [certificate.target.alpha, certificate.target.beta, certificate.target.gamma];
  let maximumError = 0;
  for (const point of certificate.points) {
    const image = evaluateCounterexampleMap(d, point);
    for (let index = 0; index < 3; index += 1) {
      maximumError = Math.max(maximumError, Math.abs(image[index] - expected[index]));
    }
  }
  return { ok: maximumError < 1e-7, maximumError, certificate };
}

export function realCriticalTargets(d, beta, gamma) {
  const h = framePolynomialCoefficients(d, gamma);
  const derivative = derivativeCoefficients(h);
  derivative[0] = (derivative[0] ?? 0) + beta;
  const solution = solvePolynomial(derivative);
  return solution.roots
    .filter((root) => Math.abs(root.im) < 1e-7)
    .map((root) => frameCurvePoint(d, root.re, beta, gamma))
    .filter((point) => Number.isFinite(point.alpha))
    .sort((a, b) => a.alpha - b.alpha);
}

export function formatNumber(value, precision = 4) {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "−∞";
  if (Math.abs(value) < 1e-12) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e4 || magnitude < 1e-3) return value.toExponential(2);
  return Number(value.toFixed(precision)).toString().replace("-", "−");
}

export function formatComplex(value, precision = 4) {
  const re = Math.abs(value.re) < 1e-9 ? 0 : value.re;
  const im = Math.abs(value.im) < 1e-9 ? 0 : value.im;
  if (im === 0) return formatNumber(re, precision);
  if (re === 0) return `${formatNumber(im, precision)}i`;
  const sign = im >= 0 ? "+" : "−";
  return `${formatNumber(re, precision)} ${sign} ${formatNumber(Math.abs(im), precision)}i`;
}
