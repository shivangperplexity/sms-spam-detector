// SpamShield — text mining core: preprocessing, Naive Bayes, k-NN (TF-IDF),
// decision tree, evaluation and Apriori on spam vocabulary.

const STOPWORDS = new Set(("a an the and or but if then so to of in on at by for with from up down out over under again " +
  "is am are was were be been being have has had do does did i me my we our you your he him his she her it its they them their " +
  "this that these those what which who whom there here when where why how all any both each few more most other some such no nor " +
  "not only own same than too very s t can will just don should now u ur im ll ve re d m o y ok").split(" "));

// ---------- Preprocessing ----------
function stem(w) {
  if (w.length <= 4 || w.endsWith("token")) return w;
  for (const [suf, rep] of [["ies", "y"], ["ing", ""], ["ed", ""], ["es", ""], ["s", ""]]) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length) + rep;
  }
  return w;
}

function normalise(text) {
  return text.toLowerCase()
    .replace(/&lt;|&gt;|&amp;|&#\d+;/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+|\b\S+\.(com|net|org|co\.uk|in|ly)\b\S*/g, " urltoken ")
    .replace(/\S+@\S+\.\S+/g, " emailtoken ")
    .replace(/(£|\$|₹|rs\.?\s?|inr\s?)\s?\d[\d,.]*|\d[\d,.]*\s?(pounds|rupees|p\b)/g, " moneytoken ")
    .replace(/\+?\d[\d\s-]{6,}\d/g, " phonetoken ")
    .replace(/\d+/g, " numtoken ");
}

// Full pipeline with every intermediate step (used for the "pipeline" view)
function preprocessSteps(text) {
  const lower = text.toLowerCase();
  const norm = normalise(text);
  const noPunct = norm.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = noPunct.split(" ").filter(Boolean);
  const noStop = tokens.filter((t) => !STOPWORDS.has(t) && t.length > 1);
  const stems = noStop.map(stem);
  return { original: text, lower, norm: norm.replace(/\s+/g, " ").trim(), noPunct, tokens, noStop, stems };
}
const tokenize = (text) => preprocessSteps(text).stems;

// Hand-made numeric features (for the decision tree)
const FEATURES = [
  { key: "length", label: "message length", f: (m) => m.length },
  { key: "digits", label: "digit count", f: (m) => (m.match(/\d/g) || []).length },
  { key: "caps", label: "capital-letter ratio", f: (m) => { const l = m.replace(/[^a-zA-Z]/g, ""); return l.length ? (m.match(/[A-Z]/g) || []).length / l.length : 0; } },
  { key: "url", label: "has a link", f: (m) => (/https?:\/\/|www\.|\.com\b|\.co\.uk\b/i.test(m) ? 1 : 0) },
  { key: "money", label: "mentions money", f: (m) => (/£|\$|₹|\brs\.?\s?\d|\bcash\b|\bprize\b/i.test(m) ? 1 : 0) },
  { key: "phone", label: "has a phone/short code", f: (m) => (/\d{5,}/.test(m.replace(/\s/g, "")) ? 1 : 0) },
  { key: "excl", label: "exclamation marks", f: (m) => (m.match(/!/g) || []).length },
  { key: "words", label: "word count", f: (m) => m.split(/\s+/).filter(Boolean).length },
];
const featureVector = (m) => FEATURES.map((x) => x.f(m));

// ---------- Data loading and cleaning ----------
function loadDataset(tsv) {
  const raw = tsv.split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf("\t");
    return { label: line.slice(0, i).trim(), text: line.slice(i + 1).trim() };
  });
  const valid = raw.filter((r) => (r.label === "ham" || r.label === "spam") && r.text);
  const seen = new Set(), unique = [];
  for (const r of valid) { const k = r.text.toLowerCase(); if (!seen.has(k)) { seen.add(k); unique.push(r); } }
  unique.forEach((r, i) => { r.id = i; r.tokens = tokenize(r.text); r.fv = featureVector(r.text); });
  return { raw: raw.length, invalid: raw.length - valid.length, duplicates: valid.length - unique.length, rows: unique };
}

function stratifiedSplit(rows, testFrac = 0.2, seed = 42) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const train = [], test = [];
  for (const label of ["ham", "spam"]) {
    const group = rows.filter((r) => r.label === label);
    for (let i = group.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [group[i], group[j]] = [group[j], group[i]]; }
    const cut = Math.round(group.length * testFrac);
    test.push(...group.slice(0, cut)); train.push(...group.slice(cut));
  }
  return { train, test };
}

// ---------- Multinomial Naive Bayes ----------
class NaiveBayes {
  fit(rows) {
    this.count = { ham: {}, spam: {} }; this.total = { ham: 0, spam: 0 }; this.docs = { ham: 0, spam: 0 };
    this.vocab = new Set();
    for (const r of rows) {
      this.docs[r.label]++;
      for (const t of r.tokens) { this.count[r.label][t] = (this.count[r.label][t] || 0) + 1; this.total[r.label]++; this.vocab.add(t); }
    }
    this.n = rows.length;
    return this;
  }
  logp(t, c) { return Math.log(((this.count[c][t] || 0) + 1) / (this.total[c] + this.vocab.size)); }
  // per-token evidence: log P(t|spam) − log P(t|ham)
  evidence(tokens) { return tokens.filter((t) => this.vocab.has(t)).map((t) => ({ t, w: this.logp(t, "spam") - this.logp(t, "ham") })); }
  probSpam(tokens) {
    let s = Math.log(this.docs.spam / this.n), h = Math.log(this.docs.ham / this.n);
    for (const t of tokens) if (this.vocab.has(t)) { s += this.logp(t, "spam"); h += this.logp(t, "ham"); }
    return 1 / (1 + Math.exp(h - s));
  }
}

// ---------- k-NN with TF-IDF + cosine similarity (inverted index) ----------
class KNN {
  constructor(k = 5) { this.k = k; }
  fit(rows) {
    this.rows = rows;
    const df = {};
    rows.forEach((r) => new Set(r.tokens).forEach((t) => (df[t] = (df[t] || 0) + 1)));
    this.idf = {};
    for (const [t, d] of Object.entries(df)) this.idf[t] = Math.log((1 + rows.length) / (1 + d)) + 1;
    this.index = {};
    this.vecs = rows.map((r, i) => {
      const v = this.vector(r.tokens);
      for (const [t, w] of v) (this.index[t] ||= []).push([i, w]);
      return v;
    });
    return this;
  }
  vector(tokens) {
    const tf = new Map();
    tokens.forEach((t) => this.idf[t] && tf.set(t, (tf.get(t) || 0) + 1));
    let norm = 0;
    for (const [t, c] of tf) { const w = c * this.idf[t]; tf.set(t, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of tf) tf.set(t, w / norm);
    return tf;
  }
  neighbours(tokens) {
    const q = this.vector(tokens), score = new Map();
    for (const [t, w] of q) for (const [i, w2] of this.index[t] || []) score.set(i, (score.get(i) || 0) + w * w2);
    return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, this.k).map(([i, sim]) => ({ row: this.rows[i], sim }));
  }
  probSpam(tokens) {
    const nb = this.neighbours(tokens);
    if (!nb.length) return 0;
    return nb.filter((x) => x.row.label === "spam").length / this.k;
  }
}

// ---------- Decision tree (CART, Gini impurity) on numeric features ----------
function gini(rows) {
  if (!rows.length) return 0;
  const p = rows.filter((r) => r.label === "spam").length / rows.length;
  return 1 - p * p - (1 - p) * (1 - p);
}
function buildTree(rows, depth = 0, maxDepth = 4, minLeaf = 15) {
  const spam = rows.filter((r) => r.label === "spam").length;
  const node = { n: rows.length, spam, p: spam / rows.length };
  if (depth >= maxDepth || spam === 0 || spam === rows.length || rows.length < 2 * minLeaf) return node;
  let best = null;
  const g0 = gini(rows);
  FEATURES.forEach((_, fi) => {
    const vals = [...new Set(rows.map((r) => r.fv[fi]))].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(vals.length / 40)); // sample candidate thresholds
    for (let i = 0; i < vals.length - 1; i += step) {
      const thr = (vals[i] + vals[i + 1]) / 2;
      const L = rows.filter((r) => r.fv[fi] <= thr), R = rows.filter((r) => r.fv[fi] > thr);
      if (L.length < minLeaf || R.length < minLeaf) continue;
      const gain = g0 - (L.length * gini(L) + R.length * gini(R)) / rows.length;
      if (!best || gain > best.gain) best = { fi, thr, gain, L, R };
    }
  });
  if (!best || best.gain < 1e-4) return node;
  return { ...node, fi: best.fi, thr: best.thr, gain: best.gain, left: buildTree(best.L, depth + 1, maxDepth, minLeaf), right: buildTree(best.R, depth + 1, maxDepth, minLeaf) };
}
function treeProb(node, fv) {
  while (node.left) node = fv[node.fi] <= node.thr ? node.left : node.right;
  return node.p;
}
function treePath(node, fv) {
  const path = [];
  while (node.left) {
    const goLeft = fv[node.fi] <= node.thr;
    path.push({ feature: FEATURES[node.fi], thr: node.thr, value: fv[node.fi], goLeft });
    node = goLeft ? node.left : node.right;
  }
  return { path, leaf: node };
}

// ---------- Evaluation ----------
function evaluate(test, prob, threshold = 0.5) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of test) {
    const pred = prob(r) >= threshold;
    if (pred && r.label === "spam") tp++; else if (pred) fp++; else if (r.label === "spam") fn++; else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, tn, fn, accuracy: (tp + tn) / test.length, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}

// ---------- Frequent words and Apriori over spam messages ----------
function topWords(rows, n = 12) {
  const c = {};
  rows.forEach((r) => new Set(r.tokens).forEach((t) => (c[t] = (c[t] || 0) + 1)));
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t, k]) => ({ t, k, share: k / rows.length }));
}

function apriori(transactions, minSupport, maxK = 3) {
  const N = transactions.length, sets = transactions.map((t) => new Set(t));
  const count = (items) => sets.reduce((s, x) => s + (items.every((i) => x.has(i)) ? 1 : 0), 0);
  const c1 = {};
  transactions.forEach((t) => new Set(t).forEach((i) => (c1[i] = (c1[i] || 0) + 1)));
  let L = Object.entries(c1).filter(([, c]) => c / N >= minSupport).map(([i, c]) => ({ items: [i], support: c / N })).sort((a, b) => (a.items[0] < b.items[0] ? -1 : 1));
  const all = [...L];
  let candidates = Object.keys(c1).length;
  for (let k = 2; k <= maxK && L.length; k++) {
    const prev = new Set(L.map((x) => x.items.join("|"))), cand = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i].items, b = L[j].items;
      if (a.slice(0, k - 2).join("|") !== b.slice(0, k - 2).join("|")) continue;
      const c = [...a, b[k - 2]].sort();
      if (c.every((_, x) => prev.has(c.filter((__, y) => y !== x).join("|")))) cand.push(c);
    }
    candidates += cand.length;
    L = cand.map((items) => ({ items, support: count(items) / N })).filter((x) => x.support >= minSupport);
    all.push(...L);
  }
  const sup = new Map(all.map((x) => [x.items.join("|"), x.support]));
  const rules = [];
  for (const { items, support } of all) {
    if (items.length < 2) continue;
    for (let mask = 1; mask < (1 << items.length) - 1; mask++) {
      const A = items.filter((_, i) => mask & (1 << i)), B = items.filter((_, i) => !(mask & (1 << i)));
      const conf = support / sup.get(A.join("|"));
      rules.push({ A, B, support, confidence: conf, lift: conf / sup.get(B.join("|")) });
    }
  }
  return { itemsets: all, rules: rules.sort((a, b) => b.confidence - a.confidence || b.support - a.support), N, candidates };
}
