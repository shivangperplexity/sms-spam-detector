// SpamShield — UI wiring

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
const M = {};

const EXAMPLES = [
  "Congratulations! You've won a ₹50,000 cash prize. Call 9876543210 now to claim before midnight!",
  "Dear customer, your bank KYC has expired. Update now at http://bit.ly/kyc-upd or your account will be blocked today.",
  "Hey, are we still meeting for lunch at 1? I'll be near the library.",
  "URGENT! Your mobile number has been selected for a £1000 bonus. Reply YES to 81122 to claim.",
  "Your OTP for login is 482913. Do not share it with anyone.",
  "Mom, I reached the hostel. Will call you after dinner.",
  "FREE entry! Text WIN to 80086 for a chance to win a new phone. T&Cs apply, 18+ only.",
];

// friendlier names for the normalised tokens
const LABEL = { numtoken: "numbers", phonetoken: "phone numbers", moneytoken: "money amounts", urltoken: "links", emailtoken: "email addresses", txt: "txt", rep: "reply" };
const nice = (t) => LABEL[t] || t;
// the dataset stores some characters as HTML entities
const clean = (s) => s.replace(/&lt;#&gt;/g, "…").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function init() {
  $("examples").innerHTML = EXAMPLES.map((e, i) => `<button data-i="${i}" title="${esc(e)}">${esc(e.length > 46 ? e.slice(0, 44) + "…" : e)}</button>`).join("");
  $("examples").querySelectorAll("button").forEach((b) => (b.onclick = () => { $("msg").value = EXAMPLES[+b.dataset.i]; check(); }));
  $("msg").value = EXAMPLES[1];
  // local copy first; fall back to the copy in the GitHub repository (via jsDelivr)
  let res = await fetch("data/sms_spam.tsv").catch(() => null);
  if (!res || !res.ok) res = await fetch("https://cdn.jsdelivr.net/gh/shivangperplexity/sms-spam-detector@main/data/sms_spam.tsv");
  const tsv = await res.text();
  await new Promise((r) => setTimeout(r, 20));
  train(tsv);
  $("btnCheck").disabled = false;
  $("btnCheck").onclick = check;
  $("msg").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) check(); });
  renderSigns();
  check();
}

function train(tsv) {
  M.data = loadDataset(tsv);
  const { train } = stratifiedSplit(M.data.rows);
  M.nb = new NaiveBayes().fit(train);
  M.knn = new KNN(5).fit(train);
  M.tree = buildTree(train);
  M.models = [
    { key: "nb", name: "Word patterns" },
    { key: "knn", name: "Similar messages" },
    { key: "tree", name: "Message style" },
  ];
  $("status").textContent = "Ready · press Ctrl+Enter to check";
}

function check() {
  const text = $("msg").value.trim();
  if (!text) return;
  const tokens = tokenize(text), fv = featureVector(text);
  const probs = { nb: M.nb.probSpam(tokens), knn: M.knn.probSpam(tokens), tree: treeProb(M.tree, fv) };
  const p = probs.nb;
  const spamVotes = Object.values(probs).filter((x) => x >= 0.5).length;
  const isSpam = p >= 0.5;
  const v = $("verdict");
  v.className = "verdict card " + (isSpam ? "spam" : "ham");
  $("vBadge").textContent = isSpam ? "!" : "✓";
  $("vTitle").textContent = isSpam ? (p > 0.95 ? "Very likely spam" : "Probably spam") : (p < 0.05 ? "Looks genuine" : "Probably genuine");
  $("vSub").textContent = `Spam score ${pct(p, 0)} · ${spamVotes} of 3 checks say spam`;
  $("vMeter").style.left = `calc(${(p * 100).toFixed(1)}% - 2px)`;
  $("votes").innerHTML = M.models.map((m) => {
    const x = probs[m.key], s = x >= 0.5;
    return `<div class="vote"><span><b>${m.name}</b></span><div class="bar"><i style="width:${Math.max(2, x * 100)}%;background:${s ? "var(--spam)" : "var(--ham)"}"></i></div>
      <span>${pct(x, 0)}</span><span class="tag ${s ? "spam" : "ham"}">${s ? "SPAM" : "OK"}</span></div>`;
  }).join("");
  $("vTip").textContent = isSpam
    ? "Do not click links, call the number or share any OTP. Delete the message or report it to 1909 (DND) / cybercrime.gov.in."
    : "Nothing suspicious found. Still, never share OTPs or passwords over SMS.";

  // word highlighting
  $("highlight").innerHTML = text.split(/(\s+)/).map((w) => {
    if (!w.trim()) return " ";
    const toks = tokenize(w);
    if (!toks.length) return `<span class="skip">${esc(w)}</span>`;
    const ev = M.nb.evidence(toks).reduce((s, x) => s + x.w, 0);
    const a = Math.min(0.85, Math.abs(ev) / 5);
    const bg = ev > 0 ? `rgba(225,29,72,${a})` : `rgba(5,150,105,${a})`;
    return `<span style="background:${bg};color:${a > 0.45 ? "#fff" : "inherit"}">${esc(w)}</span>`;
  }).join("");

  $("neighbours").innerHTML = M.knn.neighbours(tokens).map((n) => `<li><span class="tag ${n.row.label}">${n.row.label === "spam" ? "SPAM" : "OK"}</span>
    <span>${esc(clean(n.row.text).length > 140 ? clean(n.row.text).slice(0, 138) + "…" : clean(n.row.text))}</span><span></span></li>`).join("") || '<li class="hint">No similar messages found.</li>';
}

function renderSigns() {
  const spam = M.data.rows.filter((r) => r.label === "spam");
  const top = topWords(spam, 12), max = top[0].share;
  $("spamWords").innerHTML = top.map((x) => `<div class="brow"><code>${esc(nice(x.t))}</code><div class="bar"><i style="width:${(100 * x.share) / max}%;background:var(--spam)"></i></div><span>${pct(x.share, 0)}</span></div>`).join("");
  const res = apriori(spam.map((r) => r.tokens), 0.05, 3);
  const seen = new Set(), combos = [];
  for (const r of res.rules.filter((r) => r.lift > 1.3 && r.confidence >= 0.8)) {
    const words = [...r.A, ...r.B].sort();
    const k = words.join("|");
    if (seen.has(k)) continue;
    seen.add(k); combos.push(words.map(nice).join(" + "));
    if (combos.length >= 10) break;
  }
  $("combos").innerHTML = combos.map((c) => `<span>${esc(c)}</span>`).join("");
}

init();
