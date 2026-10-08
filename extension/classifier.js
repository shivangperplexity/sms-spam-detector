/* SpamShield for Gmail - in-browser classifier.
 * Tokenizer mirrors training/train.py exactly (same regexes, same order).
 * Model: 4-class logistic regression (genuine / important / promo / spam)
 * over binary unigram+bigram features, int8-quantised weights.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------ tokenizer
  const R_CUR = /[₹£€]/g;
  const R_NONASCII = /[^\x00-\x7f]/g;
  const R_TAG = /<[^>]{0,400}>/g;
  const R_ENT = /&#?[a-z0-9]{1,8};/g;
  const R_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+/g;
  const R_URL = /(https?:\/\/|www\.)[^\s<>"']+/g;
  const R_DOM = /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|in|net|org|co|io|ly|me|info|biz|xyz|top|site|online|link|app|club|shop|live)\b(\/[^\s]*)?/g;
  const R_MONEY = /(\$|\b(rs|inr|usd)\.?) ?\d[\d,]*(\.\d+)?/g;
  const R_PCT = /\d+(\.\d+)? ?%/g;
  const R_CODE = /\b\d{4,8}\b/g;
  const R_NUM = /\d+/g;
  const R_TOK = /[a-z]{2,}/g;

  function tokenize(text) {
    let t = String(text == null ? "" : text).replace(R_CUR, " rs ");
    t = t.replace(R_NONASCII, " ").toLowerCase();
    t = t.replace(R_TAG, " ").replace(R_ENT, " ");
    t = t.replace(R_EMAIL, " emailtok ");
    t = t.replace(R_URL, " urltok ").replace(R_DOM, " urltok ");
    t = t.replace(R_MONEY, " moneytok ").replace(R_PCT, " pcttok ");
    t = t.replace(R_CODE, " codetok ").replace(R_NUM, " numtok ");
    const m = t.match(R_TOK) || [];
    return m.slice(0, MODEL().maxTokens || 160);
  }

  function featureSet(tokens) {
    const f = new Set(tokens);
    for (let i = 0; i < tokens.length - 1; i++) f.add(tokens[i] + " " + tokens[i + 1]);
    return f;
  }

  // ------------------------------------------------------------ model
  let M = null;
  function MODEL() {
    if (M) return M;
    const raw = root.SS_MODEL;
    if (!raw) throw new Error("SpamShield model not loaded");
    const index = new Map();
    raw.vocab.forEach((w, i) => index.set(w, i));
    const bin = atobSafe(raw.weights);
    const W = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) W[i] = (bin.charCodeAt(i) << 24) >> 24;
    M = { ...raw, index, W, K: raw.classes.length };
    return M;
  }
  function atobSafe(s) {
    if (typeof atob === "function") return atob(s);
    return Buffer.from(s, "base64").toString("binary");
  }

  /** class probabilities for a token list (+ the features that drove them) */
  function predictTokens(tokens, wantWhy) {
    const m = MODEL();
    const K = m.K;
    const present = [];
    for (const f of featureSet(tokens)) {
      const i = m.index.get(f);
      if (i !== undefined) present.push(i);
    }
    const norm = present.length ? 1 / Math.sqrt(present.length) : 0;
    const z = m.bias.slice();
    for (const i of present) for (let c = 0; c < K; c++) z[c] += m.W[i * K + c] * m.scales[c] * norm;
    const mx = Math.max(...z);
    const e = z.map((v) => Math.exp(v - mx));
    const s = e.reduce((a, b) => a + b, 0);
    const p = e.map((v) => v / s);
    let why = null;
    if (wantWhy) {
      // junk evidence = promo+spam weight minus genuine+important weight
      why = present
        .map((i) => {
          const w = (c) => m.W[i * K + c] * m.scales[c];
          return { term: m.vocab[i], junk: (Math.max(w(2), w(3)) - Math.max(w(0), w(1))) * norm };
        })
        .sort((a, b) => Math.abs(b.junk) - Math.abs(a.junk))
        .slice(0, 8);
    }
    return { p, why, nFeatures: present.length };
  }

  // ------------------------------------------------------------ rules on top of the model
  const IMPORTANT_RE = /\b(otp|one[- ]?time (pass(word|code)?|code|pin)|verification code|security code|login code|sign[- ]?in code|passcode|auth(entication)? code|confirmation code|verify (your |this )?(email|e-mail|account|identity|address|device|login|sign[- ]?in)|confirm (your )?(email|e-mail|account|registration|address|subscription)|reset (your )?password|password reset|forgot (your )?password|new (sign[- ]?in|login|device)|sign[- ]?in (attempt|alert|activity)|log[- ]?in (attempt|alert)|(used|tried) to (sign|log)[- ]?in|someone (tried|signed|logged)|change your password|security alert|2fa|two[- ]factor|activate your account|magic link|login link|sign[- ]?in link)\b/i;
  const PHISH_RE = /\b(kyc|suspend(ed)?|blocked|unusual activity|update your (pan|aadhaar|details|kyc)|claim|prize|lottery|won|winner|refund|disconnect(ed|ion)?|customs|urgent|act now|expire[sd]? today|gift card|bitcoin|crypto|investment|guaranteed)\b/i;
  const PROMO_SENDER_RE = /(newsletter|offers?|deals?|promo|promotions|marketing|campaign|mailer|mailers|news|digest|shop|store|sale|hello|hi|team|info|updates?)@|@(e|em|email|mail|mailer|news|newsletter|marketing|offers|promo|engage|comms)\./i;
  // classic bulk-marketing phrases; each distinct cue nudges P(promo) up a little
  const PROMO_CUES = /\b(sale|% off|off on|flat \d+|today only|ends (tonight|today|soon|sunday)|last chance|limited (time|period|stock|offer)|shop now|order now|book now|explore (courses|now|deals)|buy \d+ get|bogo|free shipping|free delivery|use code|coupon|promo code|cashback|deals? of the day|lowest price|best price|hurry|don'?t miss|exclusive offer|new arrivals|unsubscribe|starting at|from (₹|rs\.?) ?\d+)/gi;
  const PERSONAL_DOMAINS = /@(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|proton|protonmail|rediffmail)\.(com|in|co\.in|me)$/i;

  // Well-known Indian / global senders. A mail really *from* one of these domains is
  // very unlikely to be a scam (it can still be marketing). A domain that only *contains*
  // the brand name (netflix-billing-help.com, sbi-kyc.top) is a classic phishing look-alike.
  const KNOWN = ["google.com", "youtube.com", "microsoft.com", "office.com", "apple.com",
    "github.com", "linkedin.com", "facebookmail.com", "facebook.com", "instagram.com", "whatsapp.com", "x.com", "twitter.com", "amazon.in", "amazon.com",
    "flipkart.com", "myntra.com", "ajio.com", "nykaa.com", "meesho.com", "swiggy.in", "zomato.com", "blinkit.com", "zepto.co", "bigbasket.com",
    "paytm.com", "phonepe.com", "google.co.in", "razorpay.com", "hdfcbank.net", "hdfcbank.com", "icicibank.com", "sbi.co.in", "onlinesbi.sbi", "axisbank.com",
    "kotak.com", "yesbank.in", "idfcfirstbank.com", "irctc.co.in", "makemytrip.com", "goibibo.com", "uber.com", "olacabs.com", "airtel.com", "airtel.in", "jio.com",
    "netflix.com", "spotify.com", "hotstar.com", "primevideo.com", "notion.so", "makenotion.com", "slack.com", "zoom.us", "atlassian.com", "vercel.com",
    "coursera.org", "udemy.com", "medium.com", "quora.com", "naukri.com", "unstop.com", "internshala.com", "indeed.com", "digilocker.gov.in", "uidai.gov.in",
    "incometax.gov.in", "npci.org.in", "dropbox.com", "canva.com", "openai.com", "anthropic.com", "adobe.com"];
  const BRANDS = ["google", "microsoft", "apple", "amazon", "flipkart", "paytm", "phonepe", "hdfc", "icici", "sbi", "yono", "axisbank", "kotak", "irctc", "netflix",
    "paypal", "airtel", "bses", "dhl", "fedex", "bluedart", "indiapost", "incometax", "uidai", "aadhaar", "kbc", "whatsapp", "instagram", "facebook", "linkedin"];
  function senderTrust(domain) {
    if (!domain) return 0;
    if (/\.(gov|nic|ac|edu)\.in$|\.edu$/.test(domain)) return 1;
    if (KNOWN.some((d) => domain === d || domain.endsWith("." + d))) return 1;
    const label = domain.replace(/\.[a-z.]+$/, "");
    if (BRANDS.some((b) => label.includes(b))) return -1; // brand name inside an unrelated domain
    if (/\.(xyz|top|site|online|link|club|live|biz|info|icu|buzz|rest|cam)$/.test(domain)) return -0.5;
    return 0;
  }

  const SENS = {
    // spam threshold, likely-spam threshold on P(junk)=P(promo)+P(spam)
    relaxed: [0.88, 0.62],
    balanced: [0.78, 0.45],
    strict: [0.66, 0.32],
  };

  /**
   * @param {{sender?:string, senderEmail?:string, subject?:string, text?:string}} mail
   * @param {{sensitivity?:string, trusted?:string[], blocked?:string[]}} opts
   */
  function classify(mail, opts) {
    opts = opts || {};
    const subject = mail.subject || "";
    const text = mail.text || "";
    const email = (mail.senderEmail || "").toLowerCase();
    const domain = email.split("@")[1] || "";
    const full = subject + " \n " + text;
    const toks = tokenize(full);
    const r = predictTokens(toks, true);
    let [pg, pi, pp, ps] = r.p;

    // sender lists (exact address or whole domain) override the model
    const match = (list) => (list || []).some((x) => x && (x === email || x === domain || (x.startsWith("@") && x.slice(1) === domain)));
    if (email && match(opts.trusted)) return out("genuine", "Trusted sender", r, toks, IMPORTANT_RE.test(full));
    if (email && match(opts.blocked)) return out("spam", "Blocked sender", r, toks);

    // light sender priors (the model never sees the sender address)
    if (PROMO_SENDER_RE.test(email)) { pp += 0.12; }
    if (PERSONAL_DOMAINS.test(email) && pp > ps) { pp *= 0.6; } // a friend's gmail is rarely a brand blast
    const cues = new Set((full.match(PROMO_CUES) || []).map((x) => x.toLowerCase().replace(/\d+/g, "#"))).size;
    if (cues && !IMPORTANT_RE.test(full)) pp *= Math.exp(Math.min(3.2, 0.8 * cues)); // logit boost (renormalised below)
    const trust = senderTrust(domain);
    if (trust > 0) { pg += ps * 0.8; ps *= 0.2; }        // real brand domain: not a scam (may still be marketing)
    else if (trust < 0) { ps += 0.3 * (pg + pi); pg *= 0.7; pi *= 0.7; } // look-alike / throwaway domain

    const sum = pg + pi + pp + ps;
    pg /= sum; pi /= sum; pp /= sum; ps /= sum;
    const junk = pp + ps;
    const [tSpam, tLikely] = SENS[opts.sensitivity] || SENS.balanced;
    const rule = IMPORTANT_RE.test(full);
    const res = { probs: { genuine: pg, important: pi, promo: pp, spam: ps }, junk };

    if (rule && ps < 0.6 && !(PHISH_RE.test(full) && ps > 0.35)) return out("important", "Verification / OTP", r, toks, true, res);
    if (junk >= tSpam) {
      const kind = pp >= ps ? "Marketing" : trust < 0 || PHISH_RE.test(full) || /urltok/.test(toks.join(" ")) && ps > 0.8 ? "Phishing / scam" : "Spam";
      return out("spam", kind, r, toks, false, res);
    }
    if (junk >= tLikely) return out("likely", pp >= ps ? "Probably promotional" : "Suspicious", r, toks, false, res);
    if (pi >= 0.5) return out("important", "Verification / OTP", r, toks, true, res);
    return out("genuine", pi > 0.25 ? "Account notice" : "Looks genuine", r, toks, false, res);

    function out(bucket, reason, rr, tk, imp, extra) {
      const probs = extra ? extra.probs : { genuine: rr.p[0], important: rr.p[1], promo: rr.p[2], spam: rr.p[3] };
      const j = extra ? extra.junk : rr.p[2] + rr.p[3];
      if (bucket === "genuine" && imp) bucket = "important";
      return { bucket, reason, probs, junk: j, why: rr.why, tokens: tk.length };
    }
  }

  const api = { tokenize, featureSet, predictTokens, classify, model: () => MODEL(), SENS };
  root.SSClassifier = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
