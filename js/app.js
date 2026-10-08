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

async function init() {
  $("examples").innerHTML = EXAMPLES.map((e, i) => `<button data-i="${i}" title="${esc(e)}">${esc(e.length > 46 ? e.slice(0, 44) + "…" : e)}</button>`).join("");
  $("examples").querySelectorAll("button").forEach((b) => (b.onclick = () => { $("msg").value = EXAMPLES[+b.dataset.i]; check(); }));
  $("msg").value = EXAMPLES[1];
  const tsv = await fetch("data/sms_spam.tsv").then((r) => r.text());
  await new Promise((r) => setTimeout(r, 20));
  train(tsv);
  $("btnCheck").disabled = false;
  $("btnCheck").onclick = check;
  $("msg").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) check(); });
  $("thr").oninput = renderThreshold;
  $("sup").oninput = renderPatterns;
  renderData(); renderModels(); renderPatterns(); check();
}

function train(tsv) {
  const t0 = performance.now();
  M.data = loadDataset(tsv);
  const { train, test } = stratifiedSplit(M.data.rows);
  M.train = train; M.test = test;
  const time = (fn) => { const s = performance.now(); const v = fn(); return [v, performance.now() - s]; };
  [M.nb, M.tNb] = time(() => new NaiveBayes().fit(train));
  [M.knn, M.tKnn] = time(() => new KNN(5).fit(train));
  [M.tree, M.tTree] = time(() => buildTree(train));
  M.models = [
    { key: "nb", name: "Naive Bayes", sub: "multinomial, Laplace smoothing", prob: (r) => M.nb.probSpam(r.tokens), fit: M.tNb },
    { key: "knn", name: "k-Nearest Neighbours", sub: "k = 5, TF-IDF, cosine", prob: (r) => M.knn.probSpam(r.tokens), fit: M.tKnn },
    { key: "tree", name: "Decision Tree", sub: "8 numeric features, Gini", prob: (r) => treeProb(M.tree, r.fv), fit: M.tTree },
  ];
  M.models.forEach((m) => { const s = performance.now(); m.eval = evaluate(test, m.prob); m.predMs = (performance.now() - s) / test.length; });
  M.nbProbs = test.map((r) => ({ p: M.nb.probSpam(r.tokens), spam: r.label === "spam" }));
  $("status").textContent = `Models trained in ${Math.round(performance.now() - t0)} ms · press Ctrl+Enter to check`;
}

// ---------------- Checker ----------------
function check() {
  const text = $("msg").value.trim();
  if (!text) return;
  const tokens = tokenize(text), fv = featureVector(text);
  const probs = { nb: M.nb.probSpam(tokens), knn: M.knn.probSpam(tokens), tree: treeProb(M.tree, fv) };
  const p = probs.nb;
  const spamVotes = Object.values(probs).filter((x) => x >= 0.5).length;
  const isSpam = p >= +$("thr").value / 100;
  const v = $("verdict");
  v.className = "verdict card " + (isSpam ? "spam" : "ham");
  $("vBadge").textContent = isSpam ? "!" : "✓";
  $("vTitle").textContent = isSpam ? (p > 0.95 ? "Very likely spam" : "Probably spam") : (p < 0.05 ? "Looks genuine" : "Probably genuine");
  $("vSub").textContent = `Naive Bayes P(spam) = ${pct(p)} · ${spamVotes} of 3 models say spam`;
  $("vMeter").style.left = `calc(${(p * 100).toFixed(1)}% - 2px)`;
  $("votes").innerHTML = M.models.map((m) => {
    const x = probs[m.key], s = x >= 0.5;
    return `<div class="vote"><span><b>${m.name}</b></span><div class="bar"><i style="width:${Math.max(2, x * 100)}%;background:${s ? "var(--spam)" : "var(--ham)"}"></i></div>
      <span>${pct(x, 0)}</span><span class="tag ${s ? "spam" : "ham"}">${s ? "SPAM" : "HAM"}</span></div>`;
  }).join("");

  $("feats").innerHTML = FEATURES.map((f, i) => `<div><span>${f.label}</span><b>${f.key === "caps" ? pct(fv[i], 0) : ["url", "money", "phone"].includes(f.key) ? (fv[i] ? "yes" : "no") : fv[i]}</b></div>`).join("");

  // word highlighting
  const words = text.split(/(\s+)/);
  $("highlight").innerHTML = words.map((w) => {
    if (!w.trim()) return " ";
    const toks = tokenize(w);
    if (!toks.length) return `<span class="skip">${esc(w)}</span>`;
    const ev = M.nb.evidence(toks).reduce((s, x) => s + x.w, 0);
    const a = Math.min(0.85, Math.abs(ev) / 5);
    const bg = ev > 0 ? `rgba(225,29,72,${a})` : `rgba(5,150,105,${a})`;
    return `<span style="background:${bg};color:${a > 0.45 ? "#fff" : "inherit"}" title="${toks.join(", ")}: ${ev.toFixed(2)}">${esc(w)}</span>`;
  }).join("");
  const ev = M.nb.evidence(tokens).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 8);
  $("evidence").innerHTML = ev.map((x) => `<span style="color:${x.w > 0 ? "var(--spam)" : "var(--ham)"}">${esc(x.t)} ${x.w > 0 ? "+" : ""}${x.w.toFixed(2)}</span>`).join("");

  // neighbours
  $("neighbours").innerHTML = M.knn.neighbours(tokens).map((n) => `<li><span class="tag ${n.row.label}">${n.row.label.toUpperCase()}</span>
    <span>${esc(n.row.text.length > 120 ? n.row.text.slice(0, 118) + "…" : n.row.text)}</span><span class="sim">${n.sim.toFixed(2)}</span></li>`).join("") || '<li class="hint">No shared words with the training messages.</li>';

  // tree path
  const tp = treePath(M.tree, fv);
  const fmtV = (f, x) => (f.key === "caps" ? x.toFixed(2) : ["url", "money", "phone"].includes(f.key) ? (x ? "yes" : "no") : Math.round(x));
  const fmtT = (f, t) => (f.key === "caps" ? t.toFixed(2) : ["url", "money", "phone"].includes(f.key) ? null : Math.floor(t));
  $("treepath").innerHTML = tp.path.map((s) => {
    const thr = fmtT(s.feature, s.thr);
    const cond = thr == null ? `${s.feature.label}? <b>${fmtV(s.feature, s.value)}</b>` : `${s.feature.label} = <b>${fmtV(s.feature, s.value)}</b> ${s.goLeft ? "≤" : ">"} ${thr}`;
    return `<li>${cond}</li>`;
  }).join("") + `<li>Leaf: <b>${tp.leaf.spam}</b> of ${tp.leaf.n} training messages here were spam → <span class="tag ${tp.leaf.p >= 0.5 ? "spam" : "ham"}">${pct(tp.leaf.p, 0)} spam</span></li>`;

  renderPipeline(text);
}

// ---------------- Dataset ----------------
function renderData() {
  const rows = M.data.rows, spam = rows.filter((r) => r.label === "spam");
  $("kpis").innerHTML = `
    <div class="kpi"><span>Raw messages</span><b>${M.data.raw.toLocaleString("en-IN")}</b><small>UCI SMS Spam Collection</small></div>
    <div class="kpi"><span>Duplicates removed</span><b>${M.data.duplicates}</b><small>same text, case-insensitive</small></div>
    <div class="kpi"><span>Unique messages</span><b>${rows.length.toLocaleString("en-IN")}</b><small>${M.train.length} train · ${M.test.length} test</small></div>
    <div class="kpi"><span>Spam share</span><b>${pct(spam.length / rows.length)}</b><small>${spam.length} spam · ${rows.length - spam.length} ham</small></div>
    <div class="kpi"><span>Vocabulary</span><b>${M.nb.vocab.size.toLocaleString("en-IN")}</b><small>stemmed tokens</small></div>`;
  lengthChart();
}

function lengthChart() {
  const bins = 16, width = 20, W = 620, H = 250, pad = { t: 12, r: 10, b: 34, l: 40 };
  const hist = (label) => {
    const rs = M.data.rows.filter((r) => r.label === label), h = new Array(bins).fill(0);
    rs.forEach((r) => h[Math.min(bins - 1, Math.floor(r.text.length / width))]++);
    return h.map((x) => x / rs.length);
  };
  const ham = hist("ham"), spam = hist("spam");
  const ymax = Math.ceil(Math.max(...ham, ...spam) * 10) / 10;
  const bw = (W - pad.l - pad.r) / bins;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i <= 4; i++) {
    const y = H - pad.b - ((H - pad.t - pad.b) * i) / 4;
    s += `<line class="${i ? "grid" : "axis"}" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/><text class="tick" x="${pad.l - 6}" y="${y + 4}" text-anchor="end">${Math.round((ymax * i * 100) / 4)}%</text>`;
  }
  ham.forEach((v, i) => {
    const x = pad.l + i * bw, hH = ((H - pad.t - pad.b) * v) / ymax, hS = ((H - pad.t - pad.b) * spam[i]) / ymax;
    s += `<rect x="${x + 2}" y="${H - pad.b - hH}" width="${bw / 2 - 2}" height="${hH}" rx="2" fill="#059669"><title>ham ${i * width}–${i * width + width - 1}: ${pct(v)}</title></rect>`;
    s += `<rect x="${x + bw / 2}" y="${H - pad.b - hS}" width="${bw / 2 - 2}" height="${hS}" rx="2" fill="#e11d48"><title>spam ${i * width}–${i * width + width - 1}: ${pct(spam[i])}</title></rect>`;
    if (i % 2 === 0) s += `<text class="tick" x="${x + bw / 2}" y="${H - pad.b + 16}" text-anchor="middle">${i === bins - 1 ? "300+" : i * width}</text>`;
  });
  s += "</svg>";
  const mean = (l) => { const rs = M.data.rows.filter((r) => r.label === l); return Math.round(rs.reduce((a, r) => a + r.text.length, 0) / rs.length); };
  $("lenChart").innerHTML = s + `<div class="legend"><span><i style="background:#059669"></i>ham (avg ${mean("ham")} chars)</span><span><i style="background:#e11d48"></i>spam (avg ${mean("spam")} chars)</span></div>
    <p class="note">Spam is long and dense: it tries to fit an offer, a number and a call to action into one SMS.</p>`;
}

function renderPipeline(text) {
  const s = preprocessSteps(text);
  const steps = [
    ["Original", esc(s.original)],
    ["Lower-case", esc(s.lower)],
    ["Normalise", esc(s.norm).replace(/(urltoken|moneytoken|phonetoken|numtoken|emailtoken)/g, "<b>$1</b>")],
    ["Strip punctuation", esc(s.noPunct)],
    ["Remove stop-words", s.noStop.map(esc).join(" · ")],
    ["Stem → tokens", s.stems.map((t) => `<b>${esc(t)}</b>`).join(" · ")],
  ];
  $("pipeline").innerHTML = steps.map(([k, v]) => `<li><b>${k}</b><code>${v}</code></li>`).join("");
}

// ---------------- Models ----------------
function renderModels() {
  const best = (k) => Math.max(...M.models.map((m) => m.eval[k]));
  $("metricTable").innerHTML = `<tr><th>Model</th><th class="num">Accuracy</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">F1-score</th><th class="num">Train time</th><th class="num">Predict / msg</th></tr>` +
    M.models.map((m) => `<tr><td><b>${m.name}</b><br><span class="hint">${m.sub}</span></td>
      ${["accuracy", "precision", "recall", "f1"].map((k) => `<td class="num ${m.eval[k] === best(k) ? "top" : ""}">${pct(m.eval[k])}</td>`).join("")}
      <td class="num">${m.fit.toFixed(0)} ms</td><td class="num">${(m.predMs * 1000).toFixed(0)} µs</td></tr>`).join("");
  $("cms").innerHTML = M.models.map((m) => {
    const e = m.eval;
    return `<div class="card cm"><h4>${m.name}</h4><table>
      <tr><th></th><th>predicted ham</th><th>predicted spam</th></tr>
      <tr><th>actual ham</th><td class="good">${e.tn}<small>true negatives</small></td><td class="bad">${e.fp}<small>false alarms</small></td></tr>
      <tr><th>actual spam</th><td class="bad">${e.fn}<small>missed spam</small></td><td class="good">${e.tp}<small>caught spam</small></td></tr></table></div>`;
  }).join("");
  renderThreshold();
  renderTree();
}

function renderThreshold() {
  const t = +$("thr").value / 100;
  $("thrV").textContent = t.toFixed(2);
  let tp = 0, fp = 0, fn = 0, tn = 0;
  M.nbProbs.forEach(({ p, spam }) => { const s = p >= t; if (s && spam) tp++; else if (s) fp++; else if (spam) fn++; else tn++; });
  const prec = tp / (tp + fp || 1), rec = tp / (tp + fn || 1);
  $("thrStats").innerHTML = `<div><span>Precision</span><b>${pct(prec)}</b></div><div><span>Recall</span><b>${pct(rec)}</b></div>
    <div><span>False alarms</span><b>${fp}</b></div><div><span>Missed spam</span><b>${fn}</b></div>`;
  if (M.data) check();
}

function renderTree() {
  const lines = [];
  const fmt = (f, t) => (f.key === "caps" ? t.toFixed(2) : ["url", "money", "phone"].includes(f.key) ? null : Math.floor(t));
  (function walk(n, depth, prefix) {
    const pad = "&nbsp;&nbsp;&nbsp;".repeat(depth);
    if (!n.left) {
      const s = n.p >= 0.5;
      lines.push(`<div class="t-node">${pad}${prefix}<span class="leaf ${s ? "spam" : "ham"}">→ ${s ? "SPAM" : "HAM"}</span> <span class="dim">(${n.spam}/${n.n} spam)</span></div>`);
      return;
    }
    const f = FEATURES[n.fi], thr = fmt(f, n.thr);
    const [l, r] = thr == null ? [`no ${f.label}`, f.label] : [`${f.label} ≤ ${thr}`, `${f.label} > ${thr}`];
    lines.push(`<div class="t-node">${pad}${prefix}if <b>${l}</b>:</div>`); walk(n.left, depth + 1, "");
    lines.push(`<div class="t-node">${pad}else (<b>${r}</b>):</div>`); walk(n.right, depth + 1, "");
  })(M.tree, 0, "");
  $("tree").innerHTML = lines.join("");
}

// ---------------- Patterns ----------------
function wordBars(el, rows, color) {
  const top = topWords(rows, 12), max = top[0].share;
  $(el).innerHTML = top.map((x) => `<div class="brow"><code>${esc(x.t)}</code><div class="bar"><i style="width:${(100 * x.share) / max}%;background:${color}"></i></div><span>${pct(x.share, 0)}</span></div>`).join("");
}
function renderPatterns() {
  const spam = M.data.rows.filter((r) => r.label === "spam"), ham = M.data.rows.filter((r) => r.label === "ham");
  wordBars("spamWords", spam, "var(--spam)");
  wordBars("hamWords", ham, "var(--ham)");
  const sup = +$("sup").value / 100;
  $("supV").textContent = pct(sup, 0);
  const res = apriori(spam.map((r) => r.tokens), sup, 3);
  const rules = res.rules.filter((r) => r.lift > 1.3 && r.confidence >= 0.6).slice(0, 12);
  const maxLift = Math.max(...rules.map((r) => r.lift), 1);
  $("aprMeta").textContent = `${res.N} spam messages as transactions · ${res.candidates} candidate itemsets checked · ${res.itemsets.length} frequent itemsets · showing rules with confidence ≥ 60% and lift > 1.3`;
  const chips = (a) => a.map((t) => `<span class="chip">${esc(t)}</span>`).join(" + ");
  $("rulesTable").innerHTML = `<tr><th>If a spam message contains…</th><th>…it also contains</th><th class="num">Support</th><th class="num">Confidence</th><th>Lift</th></tr>` +
    (rules.map((r) => `<tr><td>${chips(r.A)}</td><td>${chips(r.B)}</td><td class="num">${pct(r.support)}</td><td class="num">${pct(r.confidence, 0)}</td>
      <td><span class="liftbar" style="width:${(70 * r.lift) / maxLift}px"></span>${r.lift.toFixed(2)}</td></tr>`).join("") || '<tr><td colspan="5" class="hint">No strong rules at this support.</td></tr>');
}

init();
