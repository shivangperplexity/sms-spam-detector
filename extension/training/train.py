"""
SpamShield for Gmail - model training.

Trains a 4-class email classifier (genuine / important / promo / spam) on
~170k public emails + SMS + synthetic modern Indian-context mail and exports
a compact, quantised model to ../model.js for the Chrome extension.

Usage:  python3 train.py <data_dir>
    data_dir must contain: enron_spam_data.csv, phish_combined.csv,
    phish_kaggle.csv, vayoa_full.csv, synthetic.csv (from synth.py)
    and the SMS corpus is read from ../../data/sms_spam.tsv

The tokenizer below is mirrored line-for-line in ../classifier.js.
"""
import base64, json, os, re, sys, time, random
import numpy as np, pandas as pd
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.model_selection import train_test_split

HERE = os.path.dirname(os.path.abspath(__file__))
CLASSES = ["genuine", "important", "promo", "spam"]
MAX_TOK = 160
SHORT_BODY = 30
VOCAB_SIZE = 30000

# ---------------------------------------------------------------- tokenizer
A = re.A
R_CUR = re.compile(r"[₹£€]")              # ₹ £ €  -> " rs "
R_NONASCII = re.compile(r"[^\x00-\x7f]")
R_TAG = re.compile(r"<[^>]{0,400}>", A)
R_ENT = re.compile(r"&#?[a-z0-9]{1,8};", A)
R_EMAIL = re.compile(r"[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+", A)
R_URL = re.compile(r"(https?://|www\.)[^\s<>\"']+", A)
R_DOM = re.compile(r"\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|in|net|org|co|io|ly|me|info|biz|xyz|top|site|online|link|app|club|shop|live)\b(/[^\s]*)?", A)
R_MONEY = re.compile(r"(\$|\b(rs|inr|usd)\.?) ?\d[\d,]*(\.\d+)?", A)
R_PCT = re.compile(r"\d+(\.\d+)? ?%", A)
R_CODE = re.compile(r"\b\d{4,8}\b", A)
R_NUM = re.compile(r"\d+", A)
R_TOK = re.compile(r"[a-z]{2,}", A)


def tokenize(text):
    t = R_CUR.sub(" rs ", str(text))
    t = R_NONASCII.sub(" ", t).lower()
    t = R_TAG.sub(" ", t)
    t = R_ENT.sub(" ", t)
    t = R_EMAIL.sub(" emailtok ", t)
    t = R_URL.sub(" urltok ", t)
    t = R_DOM.sub(" urltok ", t)
    t = R_MONEY.sub(" moneytok ", t)
    t = R_PCT.sub(" pcttok ", t)
    t = R_CODE.sub(" codetok ", t)
    t = R_NUM.sub(" numtok ", t)
    return R_TOK.findall(t)[:MAX_TOK]


def features(tokens):
    f = set(tokens)
    for i in range(len(tokens) - 1):
        f.add(tokens[i] + " " + tokens[i + 1])
    return f


# ---------------------------------------------------------------- data
def load(data_dir):
    rows = []  # (subject, body, label, source)

    def add(df, subj, body, lab, src):
        for s, b, l in zip(subj, body, lab):
            rows.append(("" if pd.isna(s) else str(s), "" if pd.isna(b) else str(b), l, src))

    d = pd.read_csv(os.path.join(data_dir, "enron_spam_data.csv"))
    add(d, d["Subject"], d["Message"], d["Spam/Ham"].map({"ham": "genuine", "spam": "spam"}), "enron")

    d = pd.read_csv(os.path.join(data_dir, "phish_combined.csv"))
    add(d, [""] * len(d), d["text_combined"], d["label"].map({0: "genuine", 1: "spam"}), "phish_combined")

    d = pd.read_csv(os.path.join(data_dir, "phish_kaggle.csv")).dropna(subset=["Email Text"])
    add(d, [""] * len(d), d["Email Text"], d["Email Type"].map({"Safe Email": "genuine", "Phishing Email": "spam"}), "phish_kaggle")

    d = pd.read_csv(os.path.join(data_dir, "vayoa_full.csv"))
    cmap = {"verify_code": "important", "promotions": "promo", "spam": "spam",
            "forum": "genuine", "social_media": "genuine", "updates": "genuine"}
    add(d, d["subject"], d["body"], d["category"].map(cmap), "vayoa")

    d = pd.read_csv(os.path.join(data_dir, "synthetic.csv"))
    add(d, d["subject"], d["body"], d["label"], "synthetic")

    sms = os.path.join(HERE, "..", "..", "data", "sms_spam.tsv")
    d = pd.read_csv(sms, sep="\t", header=None, names=["label", "text"], quoting=3)
    add(d, [""] * len(d), d["text"], d["label"].map({"ham": "genuine", "spam": "spam"}), "sms")

    return [r for r in rows if r[2] in CLASSES]


def main():
    data_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    t0 = time.time()
    rows = load(data_dir)
    print(f"loaded {len(rows)} rows in {time.time()-t0:.0f}s")

    # tokenize + dedupe (on the normalised token sequence)
    seen, docs = set(), []
    for subj, body, lab, src in rows:
        st, bt = tokenize(subj), tokenize(body)
        full = (st + bt)[:MAX_TOK]
        if len(full) < 3:
            continue
        key = " ".join(full[:60])
        if key in seen:
            continue
        seen.add(key)
        docs.append((st, bt, lab, src))
    print(f"after dedupe: {len(docs)}")
    df = pd.DataFrame(docs, columns=["st", "bt", "label", "src"])
    print(pd.crosstab(df.src, df.label))

    tr, te = train_test_split(df, test_size=0.12, random_state=7, stratify=df.src + df.label)

    def expand(part):
        """full document + a Gmail-list-style short view (subject + snippet)."""
        X, y, w, src = [], [], [], []
        for st, bt, lab, s in zip(part.st, part.bt, part.label, part.src):
            X.append((st + bt)[:MAX_TOK]); y.append(lab); src.append(s)
            X.append((st + bt[:SHORT_BODY])[:MAX_TOK]); y.append(lab); src.append(s)
        return X, np.array(y), np.array(src)

    Xtr, ytr, srctr = expand(tr)
    Xte, yte, srcte = expand(te)

    # class-balancing weights (sqrt-balanced so rare classes matter, but priors survive)
    counts = pd.Series(ytr).value_counts()
    cw = {c: (counts.max() / counts[c]) ** 0.75 for c in CLASSES}
    # modern sources get a boost (closer to what a Gmail inbox looks like in 2026)
    sw_src = {"synthetic": 1.0, "vayoa": 1.5, "sms": 0.6, "enron": 1.0, "phish_combined": 0.8, "phish_kaggle": 0.8}
    wtr = np.array([cw[c] * sw_src[s] for c, s in zip(ytr, srctr)])
    print("class weights", {k: round(v, 2) for k, v in cw.items()})

    analyzer = lambda toks: list(features(toks))

    # pass 1: wide vocabulary -> L1-ish selection by coefficient magnitude
    cv = CountVectorizer(analyzer=analyzer, binary=True, min_df=4, dtype=np.float32)
    Mtr = cv.fit_transform(Xtr)
    print("full vocab", Mtr.shape)

    def l2(M):
        n = np.asarray(M.sum(axis=1)).ravel()
        n[n == 0] = 1
        return sparse.diags(1 / np.sqrt(n)) @ M

    clf = LogisticRegression(C=8, max_iter=300, solver="saga", tol=1e-3)
    clf.fit(l2(Mtr), ytr, sample_weight=wtr)
    score = np.abs(clf.coef_).max(axis=0)
    keep = np.argsort(-score)[:VOCAB_SIZE]
    inv = cv.get_feature_names_out()
    vocab = sorted(inv[keep].tolist())
    print(f"pass1 done {time.time()-t0:.0f}s, keeping {len(vocab)}")

    # pass 2: retrain on the selected vocabulary (normalisation counts only kept features)
    cv2 = CountVectorizer(analyzer=analyzer, binary=True, vocabulary=vocab, dtype=np.float32)
    Mtr2, Mte2 = l2(cv2.transform(Xtr)), l2(cv2.transform(Xte))
    best = None
    for C in (4, 8, 16):
        m = LogisticRegression(C=C, max_iter=400, solver="saga", tol=1e-4)
        m.fit(Mtr2, ytr, sample_weight=wtr)
        acc = (m.predict(Mte2) == yte).mean()
        # macro-F1 is what we care about (small classes matter)
        from sklearn.metrics import f1_score
        f1 = f1_score(yte, m.predict(Mte2), average="macro")
        print(f"  C={C}: acc={acc:.4f} macroF1={f1:.4f}")
        if best is None or f1 > best[0]:
            best = (f1, C, m)
    _, C, model = best
    print("chosen C", C)

    pred = model.predict(Mte2)
    report = classification_report(yte, pred, digits=4)
    print(report)
    cm = confusion_matrix(yte, pred, labels=CLASSES)
    print(pd.DataFrame(cm, index=CLASSES, columns=CLASSES))
    per_src = {}
    for s in np.unique(srcte):
        mk = srcte == s
        per_src[s] = round(float((pred[mk] == yte[mk]).mean()), 4)
    print("per-source acc", per_src)

    # ---------------------------------------------------------------- export (int8 quantised)
    assert list(model.classes_) == CLASSES
    W = model.coef_.astype(np.float64)               # (4, V)
    scales = np.abs(W).max(axis=1) / 127.0
    Q = np.clip(np.round(W / scales[:, None]), -127, 127).astype(np.int8)
    # check quantisation error on the test set
    Wq = Q.astype(np.float64) * scales[:, None]
    logits = Mte2 @ Wq.T + model.intercept_
    qacc = (np.array(CLASSES)[logits.argmax(1)] == yte).mean()
    print(f"quantised acc {qacc:.4f} vs float {(pred == yte).mean():.4f}")

    # interleave weights as V x 4 so JS can read w[i*4 + c]
    blob = base64.b64encode(Q.T.copy().tobytes()).decode()
    meta = {
        "version": time.strftime("%Y-%m-%d"),
        "classes": CLASSES,
        "vocab": vocab,
        "weights": blob,
        "scales": [float(x) for x in scales],
        "bias": [float(x) for x in model.intercept_],
        "maxTokens": MAX_TOK,
        "trainedOn": int(len(df)),
        "testAccuracy": round(float(qacc), 4),
        "macroF1": round(float(best[0]), 4),
        "perSource": per_src,
    }
    out = os.path.join(HERE, "..", "model.js")
    with open(out, "w") as f:
        f.write("/* SpamShield for Gmail - trained model (generated by training/train.py, do not edit) */\n")
        f.write("globalThis.SS_MODEL = " + json.dumps(meta, separators=(",", ":")) + ";\n")
    print("wrote", out, os.path.getsize(out) // 1024, "KB")

    with open(os.path.join(HERE, "metrics.txt"), "w") as f:
        f.write(f"documents after dedupe: {len(df)}\ntrain rows (incl. short views): {len(ytr)}\n")
        f.write(f"test rows: {len(yte)}\nvocabulary: {len(vocab)}\nC={C}\n\n{report}\n")
        f.write(pd.DataFrame(cm, index=CLASSES, columns=CLASSES).to_string() + "\n\n")
        f.write(f"quantised accuracy: {qacc:.4f}\nper-source accuracy: {json.dumps(per_src)}\n")
        f.write("\n" + pd.crosstab(df.src, df.label).to_string() + "\n")

    # dump a few test docs (raw tokens + expected probs) for the JS parity test
    rnd = random.Random(1)
    idx = rnd.sample(range(len(Xte)), 200)
    P = model.predict_proba(Mte2[idx])
    probe = [{"tokens": Xte[i], "p": [round(float(x), 5) for x in P[k]]} for k, i in enumerate(idx)]
    with open(os.path.join(HERE, "parity_probe.json"), "w") as f:
        json.dump(probe, f)


if __name__ == "__main__":
    main()
