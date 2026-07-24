(function installJacobianMath(root) {
"use strict";

const DEFAULT_TOLERANCE = 1e-12;
const MULTIPLE_ROOT_TOLERANCE = 2e-9;
const NEAR_MULTIPLE_TOLERANCE = 2e-5;

function complex(re = 0, im = 0) { return { re, im }; }
function isFiniteComplex(v) { return Number.isFinite(v?.re) && Number.isFinite(v?.im); }
function cAdd(a, b) { return complex(a.re + b.re, a.im + b.im); }
function cSub(a, b) { return complex(a.re - b.re, a.im - b.im); }
function cScale(a, s) { return complex(a.re * s, a.im * s); }
function cMul(a, b) { return complex(a.re*b.re-a.im*b.im, a.re*b.im+a.im*b.re); }
function cDiv(a, b) {
  const q = b.re*b.re + b.im*b.im;
  if (!Number.isFinite(q) || q === 0) return complex(Number.NaN, Number.NaN);
  return complex((a.re*b.re+a.im*b.im)/q, (a.im*b.re-a.re*b.im)/q);
}
function cAbs(a) { return Math.hypot(a.re, a.im); }
function cPow(a, n) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("exponent must be a nonnegative integer");
  let out = complex(1,0), base = a, p = n;
  while (p > 0) { if (p % 2) out = cMul(out, base); base = cMul(base, base); p = Math.floor(p/2); }
  return out;
}

function polyAdd(a,b){ const n=Math.max(a.length,b.length); return Array.from({length:n},(_,i)=>(a[i]??0)+(b[i]??0)); }
function polyScale(a,s){ return a.map(v=>v*s); }
function polyMultiply(a,b){ const r=Array(a.length+b.length-1).fill(0); for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)r[i+j]+=a[i]*b[j]; return r; }
function polyPower(a,n){ let r=[1],b=a,p=n; while(p>0){if(p%2)r=polyMultiply(r,b);b=polyMultiply(b,b);p=Math.floor(p/2);}return r; }
function shiftPolynomial(a,n){ return [...Array(n).fill(0),...a]; }

function trimPolynomial(polynomial) {
  const result = [...polynomial];
  // A tiny leading coefficient is still mathematically meaningful: when gamma
  // is close to zero, it represents a genuine root very far out in the T-chart.
  // Trim only coefficients that are exactly zero in the assembled polynomial.
  while (result.length > 1 && result.at(-1) === 0) result.pop();
  return result;
}
function derivativeCoefficients(c){ return c.length<=1?[0]:c.slice(1).map((v,i)=>v*(i+1)); }
function evaluatePolynomial(c,value){
  const z=typeof value==="number"?complex(value,0):value; let r=complex(0,0);
  for(let i=c.length-1;i>=0;i--)r=cAdd(cMul(r,z),complex(c[i],0)); return r;
}
function polynomialEvaluationScale(c,value){
  const radius=typeof value==="number"?Math.abs(value):cAbs(value); let s=0;
  for(let i=c.length-1;i>=0;i--)s=s*radius+Math.abs(c[i]); return Math.max(s,Number.MIN_VALUE);
}
function relativePolynomialResidual(c,value){ return cAbs(evaluatePolynomial(c,value))/polynomialEvaluationScale(c,value); }

function framePolynomialCoefficients(d,gamma){
  if(!Number.isInteger(d)||d<3)throw new RangeError("d must be an integer at least 3");
  if(!Number.isFinite(gamma))throw new TypeError("gamma must be finite");
  if(d===3)return [0,0,-2,gamma];
  const v=[-1,gamma]; let g=polyAdd(polyScale(v,2),polyScale(polyPower(v,2),-3));
  if(d>=5)g=polyAdd(g,polyScale(polyPower(v,d-2),-3)); return trimPolynomial(shiftPolynomial(g,2));
}
function fiberPolynomialCoefficients(d,alpha,beta,gamma){
  const c=[...framePolynomialCoefficients(d,gamma)]; c[0]=(c[0]??0)-2*alpha; c[1]=(c[1]??0)+beta; return trimPolynomial(c);
}

function binomial(n,k){ const m=Math.min(k,n-k); let r=1; for(let i=1;i<=m;i++)r=r*(n-m+i)/i; return r; }
function estimateRootScale(c){
  const p=trimPolynomial(c),n=p.length-1,lead=p.at(-1); if(n<1||lead===0)return 1;
  const estimates=[]; for(let i=0;i<n;i++){const order=n-i,ratio=Math.abs(p[i]/lead);if(ratio)estimates.push((ratio/binomial(n,order))**(1/order));}
  return Math.max(1e-6,...estimates,1);
}
function scalePolynomialVariable(c,radius){
  const n=c.length-1,lead=c.at(-1),q=Array(n+1).fill(0); q[n]=1;
  for(let i=0;i<n;i++)q[i]=(c[i]/lead)/radius**(n-i); return q;
}
function snapComplex(v,t=2e-11){ if(!isFiniteComplex(v))return v; return complex(Math.abs(v.re)<t?0:v.re,Math.abs(v.im)<t?0:v.im); }
function sortRoots(roots){
  roots.sort((a,b)=>{const ar=Math.abs(a.im)<1e-8,br=Math.abs(b.im)<1e-8;if(ar!==br)return ar?-1:1;if(Math.abs(a.re-b.re)>1e-9)return a.re-b.re;return a.im-b.im;}); return roots;
}

function solveWithScale(polynomial,variableScale,options={}){
  const tolerance=options.tolerance??2e-13,maxIterations=options.maxIterations??480,n=polynomial.length-1;
  const monic=scalePolynomialVariable(polynomial,variableScale),derivative=derivativeCoefficients(monic);
  let roots=Array.from({length:n},(_,i)=>{const angle=2*Math.PI*(i+0.314159265)/n;const radius=0.72+0.015*i;return complex(radius*Math.cos(angle),radius*Math.sin(angle));});
  let converged=false,iterations=0;
  for(iterations=1;iterations<=maxIterations;iterations++){
    let maxStep=0;
    const next=roots.map((root,index)=>{
      const value=evaluatePolynomial(monic,root),slope=evaluatePolynomial(derivative,root);
      if(cAbs(slope)<1e-24){const nudge=complex(1e-10*(index+1),-1e-10*(index+2));maxStep=Math.max(maxStep,cAbs(nudge));return cAdd(root,nudge);}
      const newton=cDiv(value,slope); let repel=complex(0,0);
      for(let j=0;j<roots.length;j++){if(j===index)continue;const diff=cSub(root,roots[j]);if(cAbs(diff)<1e-18)continue;repel=cAdd(repel,cDiv(complex(1,0),diff));}
      const denom=cSub(complex(1,0),cMul(newton,repel)),correction=cAbs(denom)<1e-18?newton:cDiv(newton,denom);
      maxStep=Math.max(maxStep,cAbs(correction)); return cSub(root,correction);
    }); roots=next; if(maxStep<tolerance){converged=true;break;}
  }
  roots=roots.map(root=>{let r=root;for(let k=0;k<20;k++){const slope=evaluatePolynomial(derivative,r);if(cAbs(slope)<1e-20)break;const correction=cDiv(evaluatePolynomial(monic,r),slope);if(!isFiniteComplex(correction))break;r=cSub(r,correction);if(cAbs(correction)<tolerance)break;}return snapComplex(cScale(r,variableScale));});
  sortRoots(roots); const relativeResidual=Math.max(...roots.map(root=>relativePolynomialResidual(polynomial,root)),0);
  const residual=Math.max(...roots.map(root=>cAbs(evaluatePolynomial(polynomial,root))),0);
  return {roots,degree:n,iterations:Math.min(iterations,maxIterations),converged:converged||relativeResidual<5e-9,residual,relativeResidual,variableScale};
}

function solvePolynomial(coefficients,options={}){
  const tolerance=options.tolerance??2e-13,p=trimPolynomial(coefficients),n=p.length-1;
  if(n<1)return {roots:[],degree:n,iterations:0,converged:true,residual:0,relativeResidual:0,variableScale:1};
  if(n===1){const root=complex(-p[0]/p[1],0);return {roots:[root],degree:1,iterations:1,converged:true,residual:0,relativeResidual:0,variableScale:1};}
  const estimated=estimateRootScale(p);
  const scales=[estimated,Math.max(1,estimated/2),Math.max(1,estimated*2),1];
  let best=null;
  for(const scale of [...new Set(scales.map(v=>Number(v.toPrecision(12))))]){
    const candidate=solveWithScale(p,scale,options); if(!best||candidate.relativeResidual<best.relativeResidual)best=candidate;
    if(candidate.relativeResidual<1e-10)break;
  }
  return best;
}

function distanceRelative(a,b){return cAbs(cSub(a,b))/Math.max(1,cAbs(a),cAbs(b));}
function uniqueComplex(values,tolerance=2e-7){const out=[];for(const v of values)if(!out.some(w=>distanceRelative(v,w)<tolerance))out.push(v);return out;}
function estimateMultiplicity(c,root){let d=c,m=0;for(let order=0;order<c.length;order++){if(relativePolynomialResidual(d,root)>2e-6)break;m++;d=derivativeCoefficients(d);if(d.length===1&&d[0]===0)break;}return Math.max(2,m);}
function detectMultipleRoots(coefficients){
  const p=trimPolynomial(coefficients);if(p.length<=2)return[];const critical=solvePolynomial(derivativeCoefficients(p)),out=[];
  for(const root of critical.roots){const residual=relativePolynomialResidual(p,root);if(residual<=NEAR_MULTIPLE_TOLERANCE)out.push({root,residual,exactWithinNumerics:residual<=MULTIPLE_ROOT_TOLERANCE,multiplicity:residual<=MULTIPLE_ROOT_TOLERANCE?Math.min(p.length-1,estimateMultiplicity(p,root)):1});}
  const unique=[];for(const item of out.sort((a,b)=>a.residual-b.residual)){if(!unique.some(v=>distanceRelative(v.root,item.root)<3e-6))unique.push(item);}return unique;
}

function reconstructSource(d,root,target){
  const coefficients=fiberPolynomialCoefficients(d,target.alpha,target.beta,target.gamma),slope=evaluatePolynomial(derivativeCoefficients(coefficients),root);
  if(!isFiniteComplex(slope)||cAbs(slope)===0)return{status:"non-affine",root,slope,x:null,y:null,z:null};
  const x=cDiv(complex(2,0),slope),y=cSub(root,cScale(slope,.5)),w=d===3?cSub(cScale(x,2),cScale(cMul(cMul(x,x),y),3)):x,z=cDiv(cSub(w,complex(target.gamma,0)),cPow(x,3));
  if(![x,y,z].every(isFiniteComplex))return{status:"numerically-undefined",root,slope,x,y,z}; return{status:"finite-chart",root,slope,x,y,z};
}

function boundaryChartSource(d,target){
  if(target.gamma!==0)return null;let source;
  if(d===3)source=[0,target.beta,target.alpha-4*target.beta**2];
  else if(d===5)source=[0,-target.beta/2,2.5*target.beta**2-target.alpha];
  else source=[0,-target.beta/2,11/8*target.beta**2-target.alpha];
  const image=evaluateCounterexampleMap(d,source),expected=[target.alpha,target.beta,target.gamma],error=Math.max(...image.map((v,i)=>Math.abs(v-expected[i])));
  const targetMatched=error<=1e-9;
  return{status:targetMatched?"finite-boundary-chart":"numerically-unresolved-boundary",source,image,numericalError:error,targetMatched,chart:"x = 0"};
}

function frameCurvePoint(d,t,beta,gamma){
  const h=framePolynomialCoefficients(d,gamma),dh=derivativeCoefficients(h),hValue=evaluatePolynomial(h,t).re,slope=evaluatePolynomial(dh,t).re+beta;
  return{t,alpha:(hValue+beta*t)/2,slope,x:slope===0?Number.NaN:2/slope};
}
function realCriticalTargets(d,beta,gamma){
  const h=framePolynomialCoefficients(d,gamma),dh=derivativeCoefficients(h);dh[0]=(dh[0]??0)+beta;
  return uniqueComplex(solvePolynomial(dh).roots).filter(r=>Math.abs(r.im)<1e-7).map(r=>frameCurvePoint(d,r.re,beta,gamma)).filter(p=>Number.isFinite(p.alpha)).sort((a,b)=>a.alpha-b.alpha);
}
function removeAssignedRoots(roots,repeated){const available=roots.map((root,index)=>({root,index,assigned:false}));for(const rep of repeated){if(!rep.exactWithinNumerics)continue;const closest=available.filter(e=>!e.assigned).map(e=>({...e,distance:distanceRelative(e.root,rep.root)})).sort((a,b)=>a.distance-b.distance).slice(0,rep.multiplicity);for(const e of closest)available[e.index].assigned=true;}return available.filter(e=>!e.assigned).map(e=>e.root);}
function clusterSimpleRoots(roots){const clusters=[];for(const root of roots){let c=clusters.find(v=>distanceRelative(v.root,root)<2e-7);if(!c){clusters.push({root,members:[root]});continue;}c.members.push(root);c.root=complex(c.members.reduce((s,v)=>s+v.re,0)/c.members.length,c.members.reduce((s,v)=>s+v.im,0)/c.members.length);}return clusters;}

function analyzeCounterexampleFiber(d,target){
  const coefficients=fiberPolynomialCoefficients(d,target.alpha,target.beta,target.gamma),derivative=derivativeCoefficients(coefficients),solution=solvePolynomial(coefficients),candidates=detectMultipleRoots(coefficients),repeated=candidates.filter(v=>v.exactWithinNumerics),nearMultipleRoots=candidates.filter(v=>!v.exactWithinNumerics),clusters=clusterSimpleRoots(removeAssignedRoots(solution.roots,repeated));
  const finiteChartRoots=clusters.map((cluster,index)=>{const root=cluster.root,source=reconstructSource(d,root,target),residual=relativePolynomialResidual(coefficients,root),slopeMagnitude=source.slope?cAbs(source.slope):0;return{id:`chart-${index}`,kind:source.status==="finite-chart"?"finite-chart":"unresolved",root,multiplicity:cluster.members.length,residual,slopeMagnitude,nearEscape:source.status==="finite-chart"&&(slopeMagnitude<1e-5||cAbs(source.x)>1e6),source};});
  const repeatedEntries=repeated.map((v,i)=>({id:`escape-${i}`,kind:"escape-repeated-root",root:v.root,multiplicity:v.multiplicity,residual:v.residual,source:null}));
  const boundary=boundaryChartSource(d,target),boundaryEntries=boundary?[{id:"boundary-0",kind:boundary.targetMatched?"finite-boundary-chart":"unresolved",multiplicity:1,root:null,source:boundary,residual:boundary.numericalError}]:[];
  const chartDegree=solution.degree,chartDegreeLoss=Math.max(0,d-chartDegree),boundaryCount=boundaryEntries.filter(v=>v.kind==="finite-boundary-chart").length,unresolvedBoundaryCount=boundaryEntries.length-boundaryCount,escapeAtChartInfinity=target.gamma===0?Math.max(0,chartDegreeLoss-boundaryEntries.length):0,repeatedEscapeCount=repeatedEntries.reduce((s,v)=>s+v.multiplicity,0),finiteChartCount=finiteChartRoots.filter(v=>v.kind==="finite-chart").length,unresolvedChartCount=finiteChartRoots.filter(v=>v.kind==="unresolved").length,finiteAffineCount=finiteChartCount+boundaryCount,escapeCount=repeatedEscapeCount+escapeAtChartInfinity,accountedSheets=finiteAffineCount+escapeCount,unresolvedCount=Math.max(unresolvedChartCount+unresolvedBoundaryCount,d-accountedSheets),sheetAccountingValid=accountedSheets<=d&&accountedSheets+unresolvedCount===d;
  const infinityEntries=escapeAtChartInfinity?[{id:"escape-chart-infinity",kind:"escape-chart-infinity",root:null,multiplicity:escapeAtChartInfinity,residual:0,source:null}]:[];
  const sheets=[...finiteChartRoots,...boundaryEntries,...repeatedEntries,...infinityEntries],allPolynomialRoots=[...finiteChartRoots.map(v=>({...v,displayRoot:v.root})),...repeatedEntries.map(v=>({...v,displayRoot:v.root}))];
  return{family:"counterexample",d,target:{...target},coefficients,derivative,solution,chartDegree,genericDegree:d,chartDegreeLoss,finiteChartRoots,boundaryEntries,repeatedEntries,infinityEntries,nearMultipleRoots,allPolynomialRoots,sheets,finiteChartCount,boundaryCount,finiteAffineCount,repeatedEscapeCount,escapeAtChartInfinity,escapeCount,unresolvedCount,accountedSheets,sheetAccountingValid,maximumRelativeResidual:Math.max(solution.relativeResidual,...finiteChartRoots.map(v=>v.residual),...repeatedEntries.map(v=>v.residual),0)};
}

const AUTOMORPHISM_VARIANTS=new Set(["identity","shear","chain"]);
function assertAutomorphismInputs(k,variant){if(!Number.isInteger(k)||k<2)throw new RangeError("k must be an integer at least 2");if(!AUTOMORPHISM_VARIANTS.has(variant))throw new RangeError(`unknown automorphism variant: ${variant}`);}
function automorphismY(k,beta,gamma,variant){return variant==="chain"?beta-gamma**k:beta;}
function automorphismOffset(k,beta,gamma,variant="chain"){assertAutomorphismInputs(k,variant);if(variant==="identity")return 0;return automorphismY(k,beta,gamma,variant)**k;}
function automorphismFiberCoefficients(k,alpha,beta,gamma,variant="chain"){return[automorphismOffset(k,beta,gamma,variant)-alpha,1];}
function evaluateAutomorphismMap(k,point,variant="chain"){assertAutomorphismInputs(k,variant);const[x,y,z]=point;if(variant==="identity")return[x,y,z];if(variant==="shear")return[x+y**k,y,z];return[x+y**k,y+z**k,z];}
function invertAutomorphismMap(k,target,variant="chain"){assertAutomorphismInputs(k,variant);const{alpha,beta,gamma}=target;if(variant==="identity")return[alpha,beta,gamma];const y=automorphismY(k,beta,gamma,variant);return[alpha-y**k,y,gamma];}
function automorphismJacobian(k,point,variant="chain"){assertAutomorphismInputs(k,variant);const[,y,z]=point;if(variant==="identity")return[[1,0,0],[0,1,0],[0,0,1]];const a=k*y**(k-1);if(variant==="shear")return[[1,a,0],[0,1,0],[0,0,1]];return[[1,a,0],[0,1,k*z**(k-1)],[0,0,1]];}
function determinant3(m){const[a,b,c]=m;return a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);}
function analyzeAutomorphismFiber(k,target,variant="chain"){
  const coefficients=automorphismFiberCoefficients(k,target.alpha,target.beta,target.gamma,variant),root=complex(-coefficients[0],0),tuple=invertAutomorphismMap(k,target,variant),source={status:"finite-chart",root,slope:complex(1,0),x:complex(tuple[0],0),y:complex(tuple[1],0),z:complex(tuple[2],0)},entry={id:"automorphism-0",kind:"finite-chart",root,multiplicity:1,residual:0,slopeMagnitude:1,nearEscape:false,source};
  return{family:"automorphism",d:k,target:{...target},variant,coefficients,derivative:[1],solution:{roots:[root],degree:1,iterations:1,converged:true,residual:0,relativeResidual:0,variableScale:1},chartDegree:1,genericDegree:1,chartDegreeLoss:0,finiteChartRoots:[entry],boundaryEntries:[],repeatedEntries:[],infinityEntries:[],nearMultipleRoots:[],allPolynomialRoots:[{...entry,displayRoot:root}],sheets:[entry],finiteChartCount:1,boundaryCount:0,finiteAffineCount:1,repeatedEscapeCount:0,escapeAtChartInfinity:0,escapeCount:0,unresolvedCount:0,accountedSheets:1,sheetAccountingValid:true,maximumRelativeResidual:0};
}

function collisionCertificate(d){
  if(!Number.isInteger(d)||d<3)throw new RangeError("d must be an integer at least 3");
  if(d===3)return{exact:true,target:{alpha:-.25,beta:0,gamma:0},points:[[0,0,-.25],[1,-1.5,6.5],[-1,1.5,6.5]],finiteRootTs:[-.5,.5],boundaryPointIndices:[0]};
  if(d===4)return{exact:true,target:{alpha:2,beta:4,gamma:1},points:[[1/3,-2,-18],[-1/8,10,576]],finiteRootTs:[1,2],boundaryPointIndices:[]};
  const m=6*d-4;return{exact:true,target:{alpha:8,beta:16,gamma:1},points:[[1/9,-8,-648],[-1/m,6*d-2,m*m*(6*d-3)]],finiteRootTs:[1,2],boundaryPointIndices:[]};
}
function evaluateCounterexampleMap(d,point){
  const[x,y,z]=point,q=1+x*y;if(d===3)return[q**3*z+y**2*q*(4+3*x*y),y+3*x*q**2*z+3*x*y**2*(4+3*x*y),2*x-3*x**2*y-x**3*z];
  const D=y-x*z-x**2*y*z,s=x*D,c=x-x**3*z;if(d===4)return[q*(y**2-q**2*z)+4.5*q**2*D**2,-2*y+12*x*q*D**2,c];
  return[q*(y**2-q**2*z)+1.5*q**2*D**2*(3+(d-2)*s**(d-5)+(d-1)*s**(d-4)),-2*y+3*x*q*D**2*(4+(d-2)*s**(d-5)+d*s**(d-4)),c];
}
function verifyCollisionNumerically(d){const certificate=collisionCertificate(d),expected=[certificate.target.alpha,certificate.target.beta,certificate.target.gamma];let maximumError=0;for(const point of certificate.points){const image=evaluateCounterexampleMap(d,point);for(let i=0;i<3;i++)maximumError=Math.max(maximumError,Math.abs(image[i]-expected[i]));}return{exactCertificateStored:certificate.exact,numericalEvaluationPassed:maximumError<1e-7,maximumError,certificate};}
function threeRealPreset(d){if(d===3)return{alpha:-1,beta:-1,gamma:1};const c=collisionCertificate(d).target;return{...c,alpha:c.alpha-.65};}

function median(values){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function quantile(values,q){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b),p=(s.length-1)*q,l=Math.floor(p),u=Math.ceil(p);return l===u?s[l]:s[l]*(u-p)+s[u]*(p-l);}
function deriveAsinhAxisTransform(values,options={}){
  const finite=values.filter(Number.isFinite),center=options.center??median(finite),dist=finite.map(v=>Math.abs(v-center)).filter(v=>v>1e-10),natural=dist.length?quantile(dist,.35):1,scale=options.scale??Math.min(2.5,Math.max(.35,natural)),raw=finite.map(v=>Math.asinh((v-center)/scale)),rawExtent=raw.length?Math.max(...raw.map(Math.abs)):0,extent=options.extent??Math.max(2.8,rawExtent+.6),sceneExtent=options.sceneExtent??5;
  return{kind:"asinh",center,scale,extent,sceneExtent,forward:v=>Math.asinh((v-center)/scale)/extent*sceneExtent,inverse:u=>center+scale*Math.sinh(u/sceneExtent*extent),normalized:v=>Math.asinh((v-center)/scale)};
}
function deriveFiberDisplayTransform(analysis,criticalPoints=[]){const realRoots=analysis.allPolynomialRoots.map(v=>v.displayRoot).filter(r=>r&&Math.abs(r.im)<1e-7).map(r=>r.re),critical=criticalPoints.filter(p=>Number.isFinite(p.t)).map(p=>p.t),features=[...realRoots,...critical];if(!features.length)features.push(0);const tAxis=deriveAsinhAxisTransform(features,{sceneExtent:5.1});return{tAxis,label:`u = asinh((T − ${formatNumber(tAxis.center,3)}) / ${formatNumber(tAxis.scale,3)})`};}
function deriveLandscapeDisplayTransform(analysis){const roots=analysis.allPolynomialRoots.map(v=>v.displayRoot).filter(isFiniteComplex),re=roots.map(r=>r.re),im=roots.map(r=>r.im);if(!re.length)re.push(0);if(!im.length)im.push(0);const realAxis=deriveAsinhAxisTransform(re,{sceneExtent:4.8}),imaginaryAxis=deriveAsinhAxisTransform(im,{sceneExtent:4.8,center:0});return{realAxis,imaginaryAxis,label:`u = asinh((Re T − ${formatNumber(realAxis.center,3)}) / ${formatNumber(realAxis.scale,3)}), v = asinh((Im T − ${formatNumber(imaginaryAxis.center,3)}) / ${formatNumber(imaginaryAxis.scale,3)})`,forward:root=>({x:realAxis.forward(root.re),z:imaginaryAxis.forward(root.im)}),inverse:(x,z)=>complex(realAxis.inverse(x),imaginaryAxis.inverse(z))};}
function formatNumber(value,precision=4){if(Number.isNaN(value))return"undefined";if(value===Infinity)return"∞";if(value===-Infinity)return"−∞";if(!Number.isFinite(value))return"undefined";if(Math.abs(value)<1e-12)return"0";const m=Math.abs(value);if(m>=1e5||m<1e-3)return value.toExponential(2).replace("e-","e−");return Number(value.toFixed(precision)).toString().replace("-","−");}
function formatComplex(value,precision=4){if(!value||Number.isNaN(value.re)||Number.isNaN(value.im))return"undefined";if(!isFiniteComplex(value))return"non-finite";const re=Math.abs(value.re)<1e-9?0:value.re,im=Math.abs(value.im)<1e-9?0:value.im;if(im===0)return formatNumber(re,precision);if(re===0)return`${formatNumber(im,precision)}i`;return`${formatNumber(re,precision)} ${im>=0?"+":"−"} ${formatNumber(Math.abs(im),precision)}i`;}

root.JacobianMath = Object.freeze({
  analyzeAutomorphismFiber,
  analyzeCounterexampleFiber,
  automorphismFiberCoefficients,
  automorphismJacobian,
  automorphismOffset,
  boundaryChartSource,
  cAbs,
  cAdd,
  cDiv,
  cMul,
  cPow,
  cScale,
  cSub,
  collisionCertificate,
  complex,
  derivativeCoefficients,
  deriveAsinhAxisTransform,
  deriveFiberDisplayTransform,
  deriveLandscapeDisplayTransform,
  determinant3,
  detectMultipleRoots,
  evaluateAutomorphismMap,
  evaluateCounterexampleMap,
  evaluatePolynomial,
  fiberPolynomialCoefficients,
  formatComplex,
  formatNumber,
  frameCurvePoint,
  framePolynomialCoefficients,
  invertAutomorphismMap,
  isFiniteComplex,
  polynomialEvaluationScale,
  realCriticalTargets,
  reconstructSource,
  relativePolynomialResidual,
  solvePolynomial,
  threeRealPreset,
  trimPolynomial,
  verifyCollisionNumerically,
});
})(globalThis);
