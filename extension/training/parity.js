// node parity.js -> JS tokenizer + quantised model vs Python float model
require("../model.js");
const C = require("../classifier.js");
const probe = require("./parity_probe.json");
let maxd = 0, agree = 0;
for (const p of probe) {
  const q = C.predictTokens(p.tokens).p;
  maxd = Math.max(maxd, ...q.map((v, i) => Math.abs(v - p.p[i])));
  agree += q.indexOf(Math.max(...q)) === p.p.indexOf(Math.max(...p.p));
}
console.log(`argmax agreement ${agree}/${probe.length}, max |dp| = ${maxd.toFixed(4)}`);
