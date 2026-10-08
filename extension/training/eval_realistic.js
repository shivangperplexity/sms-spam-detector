// node eval_realistic.js  -> checks the shipped JS model on hand-written Gmail-style emails
require("../model.js");
const C = require("../classifier.js");
const cases = require("./realistic_test.json");
let ok = 0, rows = [];
for (const c of cases) {
  const r = C.classify({ senderEmail: c.email, subject: c.subject, text: c.text }, { sensitivity: process.argv[2] || "balanced" });
  const pass = r.bucket === c.expect || (c.expect === "likely" && (r.bucket === "spam" || r.bucket === "genuine"));
  ok += pass;
  rows.push(`${pass ? "ok " : "XX "} ${c.expect.padEnd(9)} -> ${r.bucket.padEnd(9)} junk=${(r.junk * 100).toFixed(0).padStart(3)}%  ${r.reason.padEnd(20)} ${c.subject.slice(0, 60)}`);
}
console.log(rows.join("\n"));
console.log(`\n${ok}/${cases.length} correct`);
