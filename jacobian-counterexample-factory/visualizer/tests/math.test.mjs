import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeAutomorphismFiber, analyzeCounterexampleFiber, automorphismJacobian,
  boundaryChartSource, cAbs, collisionCertificate, deriveFiberDisplayTransform,
  deriveLandscapeDisplayTransform, determinant3, evaluateAutomorphismMap,
  evaluateCounterexampleMap, evaluatePolynomial, fiberPolynomialCoefficients,
  formatNumber, framePolynomialCoefficients, invertAutomorphismMap,
  realCriticalTargets, relativePolynomialResidual, solvePolynomial,
  verifyCollisionNumerically,
} from "../math.module.mjs";
function near(a,e,t=1e-8){assert.ok(Math.abs(a-e)<=t,`expected ${a} within ${t} of ${e}`)}
function nearPoint(a,e,t=1e-8){assert.equal(a.length,e.length);a.forEach((v,i)=>near(v,e[i],t));}

test("frame polynomial has requested generic degree away from gamma=0",()=>{for(let d=3;d<=20;d++){const c=framePolynomialCoefficients(d,1);assert.equal(c.length-1,d);assert.notEqual(c.at(-1),0);}});
test("browser coefficients match exact SymPy expansions",()=>{
  assert.deepEqual(framePolynomialCoefficients(3,1),[0,0,-2,1]);
  assert.deepEqual(framePolynomialCoefficients(4,1),[0,0,-5,8,-3]);
  assert.deepEqual(framePolynomialCoefficients(5,1),[0,0,-2,-1,6,-3]);
  assert.deepEqual(fiberPolynomialCoefficients(3,-.25,0,0),[.5,0,-2]);
  assert.deepEqual(fiberPolynomialCoefficients(4,2,4,1),[-4,4,-5,8,-3]);
  assert.deepEqual(fiberPolynomialCoefficients(5,8,16,1),[-16,16,-2,-1,6,-3]);
});
test("automorphisms have determinant one, explicit inverse, one sheet",()=>{
  for(let k=2;k<=12;k++)for(const variant of ["identity","shear","chain"])for(const target of [{alpha:2,beta:1,gamma:0},{alpha:-3,beta:2,gamma:-1},{alpha:.25,beta:-.5,gamma:.75}]){
    const source=invertAutomorphismMap(k,target,variant);nearPoint(evaluateAutomorphismMap(k,source,variant),[target.alpha,target.beta,target.gamma],1e-5);assert.equal(determinant3(automorphismJacobian(k,source,variant)),1);const a=analyzeAutomorphismFiber(k,target,variant);assert.equal(a.finiteAffineCount,1);assert.equal(a.escapeCount,0);assert.equal(a.sheetAccountingValid,true);
  }
});
test("stored exact collision certificates pass browser numerical re-evaluation",()=>{for(let d=3;d<=12;d++){const v=verifyCollisionNumerically(d);assert.equal(v.exactCertificateStored,true);assert.equal(v.numericalEvaluationPassed,true,`d=${d} error=${v.maximumError}`);}});
test("cubic collision counts x=0 source as finite affine",()=>{const a=analyzeCounterexampleFiber(3,collisionCertificate(3).target);assert.equal(a.chartDegree,2);assert.equal(a.finiteChartCount,2);assert.equal(a.boundaryCount,1);assert.equal(a.finiteAffineCount,3);assert.equal(a.escapeCount,0);nearPoint(a.boundaryEntries[0].source.source,[0,0,-.25]);});
test("all gamma=0 boundary formulas map to the exact selected target",()=>{for(let d=3;d<=12;d++)for(const target of [{alpha:-.25,beta:0,gamma:0},{alpha:3.25,beta:-2,gamma:0},{alpha:-7,beta:4.5,gamma:0}]){const b=boundaryChartSource(d,target);assert.ok(b);assert.equal(b.targetMatched,true);assert.equal(b.status,"finite-boundary-chart");assert.ok(b.numericalError<1e-8,`d=${d}`);nearPoint(b.image,[target.alpha,target.beta,target.gamma],1e-7);nearPoint(evaluateCounterexampleMap(d,b.source),[target.alpha,target.beta,target.gamma],1e-7);}});
test("tiny nonzero gamma never fabricates an x=0 source",()=>{for(const gamma of [1e-13,-1e-13,1e-12,-1e-12]){for(let d=3;d<=12;d++)assert.equal(boundaryChartSource(d,{alpha:-.25,beta:0,gamma}),null,`d=${d} gamma=${gamma}`);const a=analyzeCounterexampleFiber(3,{alpha:-.25,beta:0,gamma});assert.equal(a.chartDegree,3);assert.equal(a.boundaryCount,0);assert.equal(a.boundaryEntries.length,0);assert.equal(a.finiteAffineCount,3);assert.equal(a.accountedSheets,3);assert.equal(a.unresolvedCount,0);assert.equal(a.sheetAccountingValid,true);}});
test("manual tangency is classified from polynomial, not preset",()=>{const a=analyzeCounterexampleFiber(3,{alpha:0,beta:0,gamma:0});assert.equal(a.chartDegree,2);assert.equal(a.repeatedEscapeCount,2);assert.equal(a.boundaryCount,1);assert.equal(a.finiteAffineCount,1);assert.equal(a.escapeCount,2);assert.equal(a.repeatedEntries.length,1);assert.equal(a.repeatedEntries[0].multiplicity,2);near(a.repeatedEntries[0].root.re,0,1e-7);});
test("critical target creates repeated root without finite reconstruction",()=>{for(const d of [3,4,5,8,12]){const beta=d===3?-1:collisionCertificate(d).target.beta,gamma=1,critical=realCriticalTargets(d,beta,gamma);assert.ok(critical.length);const p=critical[Math.floor(critical.length/2)],a=analyzeCounterexampleFiber(d,{alpha:p.alpha,beta,gamma});assert.ok(a.escapeCount>=2,`d=${d}`);assert.ok(a.repeatedEntries.some(e=>Math.abs(e.root.re-p.t)<1e-4),`d=${d}`);}});
test("far cubic root is solved and adaptive fiber transform includes every real root",()=>{const target={alpha:-.25,beta:0,gamma:.01},a=analyzeCounterexampleFiber(3,target);assert.equal(a.finiteAffineCount,3);assert.equal(a.escapeCount,0);const roots=a.finiteChartRoots.map(e=>e.root.re);assert.ok(roots.some(r=>r>190));const tr=deriveFiberDisplayTransform(a,realCriticalTargets(3,0,.01));for(const r of roots)assert.ok(Math.abs(tr.tAxis.forward(r))<=tr.tAxis.sceneExtent+1e-9);});
test("tiny nonzero leading coefficients preserve the full chart degree",()=>{for(const gamma of [1e-8,-1e-8,1e-5])for(let d=3;d<=12;d++){const coefficients=fiberPolynomialCoefficients(d,-.25,0,gamma);assert.equal(coefficients.length-1,d,`d=${d} gamma=${gamma}`);const a=analyzeCounterexampleFiber(d,{alpha:-.25,beta:0,gamma});assert.equal(a.chartDegree,d);assert.equal(a.finiteAffineCount+a.escapeCount+a.unresolvedCount,d);assert.equal(a.unresolvedCount,0);assert.equal(a.sheetAccountingValid,true);}});
test("nonzero gamma coefficient underflow is unresolved, never geometric infinity",()=>{for(const[d,gamma]of[[6,1e-100],[12,1e-100],[12,1e-50]]){const a=analyzeCounterexampleFiber(d,{alpha:-.25,beta:0,gamma});assert.ok(a.chartDegree<d,`d=${d} gamma=${gamma}`);assert.equal(a.escapeAtChartInfinity,0);assert.ok(a.unresolvedCount>=d-a.chartDegree);assert.equal(a.accountedSheets+a.unresolvedCount,d);assert.equal(a.sheetAccountingValid,true);}});
test("adaptive complex transform includes every root",()=>{const a=analyzeCounterexampleFiber(3,{alpha:-.25,beta:0,gamma:.01}),tr=deriveLandscapeDisplayTransform(a);for(const e of a.allPolynomialRoots){const p=tr.forward(e.displayRoot);assert.ok(Math.abs(p.x)<=tr.realAxis.sceneExtent+1e-9);assert.ok(Math.abs(p.z)<=tr.imaginaryAxis.sceneExtent+1e-9);}});
test("gamma=0 degree loss separates boundary source from escaping sheets",()=>{for(let d=4;d<=12;d++){const a=analyzeCounterexampleFiber(d,{alpha:1.25,beta:-.75,gamma:0});assert.equal(a.chartDegree,2);assert.equal(a.boundaryCount,1);assert.equal(a.escapeAtChartInfinity,d-3,`d=${d}`);assert.equal(a.finiteAffineCount+a.escapeCount,d,`d=${d}`);}});
test("solver residuals are small through degree 12",()=>{for(let d=3;d<=12;d++){const t=collisionCertificate(d).target,c=fiberPolynomialCoefficients(d,t.alpha,t.beta,t.gamma),s=solvePolynomial(c);assert.equal(s.roots.length,s.degree);assert.ok(s.relativeResidual<1e-7,`d=${d} residual=${s.relativeResidual}`);for(const root of s.roots){assert.ok(relativePolynomialResidual(c,root)<1e-6,`d=${d}`);assert.ok(cAbs(evaluatePolynomial(c,root))<Math.max(1e-3,s.residual*2+1e-12));}}});
test("NaN formatting never fabricates infinity",()=>{assert.equal(formatNumber(Number.NaN),"undefined");assert.equal(formatNumber(Infinity),"∞");assert.equal(formatNumber(-Infinity),"−∞");});
