/* SpamShield for Gmail - content script.
 * Classifies every row of the Gmail inbox list and every opened email,
 * adds a badge to each, and shows a floating filter bar:
 *   All · Important · Genuine · Likely spam · Spam
 * Everything runs locally in the browser; no email text leaves the page.
 * DOM is built with createElement only (Gmail enforces Trusted Types).
 */
(() => {
  "use strict";
  const C = globalThis.SSClassifier;
  const BUCKETS = [
    { id: "all", label: "All" },
    { id: "important", label: "Important", hint: "OTPs, verification & password links" },
    { id: "genuine", label: "Genuine", hint: "People, orders, bank alerts, updates" },
    { id: "likely", label: "Likely spam", hint: "Low but real spam / promo score" },
    { id: "spam", label: "Spam", hint: "Marketing blasts, scams, phishing" },
  ];
  const NAMES = { important: "Important", genuine: "Genuine", likely: "Likely spam", spam: "Spam" };

  const DEFAULTS = { enabled: true, sensitivity: "balanced", badges: true, filter: "all", collapsed: false, trusted: [], blocked: [] };
  let S = { ...DEFAULTS };
  const cache = new Map(); // key -> result

  // ------------------------------------------------------------ tiny DOM helper (no innerHTML)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
    return el;
  }
  const pct = (x) => Math.round(x * 100) + "%";

  // ------------------------------------------------------------ settings
  const store = chrome.storage && chrome.storage.sync;
  function loadSettings() {
    return new Promise((res) => {
      if (!store) return res();
      store.get(DEFAULTS, (v) => { S = { ...DEFAULTS, ...v }; res(); });
    });
  }
  function save(patch) {
    S = { ...S, ...patch };
    try { if (store) store.set(patch); } catch (e) { /* extension was reloaded */ }
  }
  if (store) chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    let reclass = false;
    for (const [k, { newValue }] of Object.entries(ch)) {
      S[k] = newValue;
      if (k === "sensitivity" || k === "trusted" || k === "blocked") reclass = true;
    }
    if (reclass) { cache.clear(); resetRows(); }
    refresh(true);
  });

  // ------------------------------------------------------------ Gmail extraction
  function rowInfo(tr) {
    const snd = tr.querySelector("span[email]") || tr.querySelector(".yP, .zF");
    const subj = tr.querySelector(".bog, .bqe");
    const snip = tr.querySelector(".y2");
    const subject = subj ? subj.textContent.trim() : "";
    let text = snip ? snip.textContent.replace(/^\s*[-–—]\s*/, "").trim() : "";
    return {
      sender: snd ? (snd.getAttribute("name") || snd.textContent || "").trim() : "",
      senderEmail: snd ? (snd.getAttribute("email") || "").trim() : "",
      subject,
      text,
    };
  }

  function classify(info) {
    const key = [info.senderEmail, info.subject, info.text.slice(0, 300)].join("\u0001");
    let r = cache.get(key);
    if (!r) {
      r = C.classify(info, { sensitivity: S.sensitivity, trusted: S.trusted, blocked: S.blocked });
      cache.set(key, r);
      if (cache.size > 3000) cache.delete(cache.keys().next().value);
    }
    return { key, r };
  }

  function badge(r, info) {
    const score = r.bucket === "important" ? r.probs.important : r.bucket === "genuine" ? 1 - r.junk : r.junk;
    const b = h("span", {
      class: `ss-badge ss-${r.bucket}`,
      title: `SpamShield: ${NAMES[r.bucket]} — ${r.reason} (junk score ${pct(r.junk)}). Click for details.`,
      role: "button",
      tabindex: "0",
    }, h("i"), r.bucket === "spam" ? r.reason.split(" ")[0] : NAMES[r.bucket], r.bucket === "likely" || r.bucket === "spam" ? h("b", null, pct(score)) : null);
    const open = (e) => { e.preventDefault(); e.stopPropagation(); showCard(b, r, info); };
    b.addEventListener("mousedown", (e) => e.stopPropagation(), true);
    b.addEventListener("click", open, true);
    b.addEventListener("keydown", (e) => { if (e.key === "Enter") open(e); });
    return b;
  }

  // ------------------------------------------------------------ list rows
  function listRows() {
    return [...document.querySelectorAll("tr.zA")];
  }
  function rowVisibleContext(tr) {
    const t = tr.closest("table");
    return t && t.offsetParent !== null;
  }
  function resetRows() {
    for (const tr of listRows()) {
      delete tr.dataset.ssKey;
      tr.querySelectorAll(".ss-badge").forEach((n) => n.remove());
    }
  }

  function processRows() {
    for (const tr of listRows()) {
      const info = rowInfo(tr);
      if (!info.subject && !info.text) continue;
      const { key, r } = classify(info);
      if (tr.dataset.ssKey === key && tr.querySelector(".ss-badge")) continue;
      tr.dataset.ssKey = key;
      tr.dataset.ssBucket = r.bucket;
      tr.querySelectorAll(".ss-badge").forEach((n) => n.remove());
      if (S.badges) {
        const host = tr.querySelector(".xT") || tr.querySelector(".bog")?.parentElement?.parentElement || tr.querySelector("td:nth-last-child(2)");
        if (host) host.prepend(badge(r, info));
      }
    }
  }

  function applyFilter() {
    const counts = { all: 0, important: 0, genuine: 0, likely: 0, spam: 0 };
    for (const tr of listRows()) {
      const b = tr.dataset.ssBucket;
      const hide = S.enabled && S.filter !== "all" && b && b !== S.filter;
      tr.classList.toggle("ss-hidden", !!hide);
      if (b && rowVisibleContext(tr)) { counts.all++; counts[b]++; }
    }
    return counts;
  }

  // ------------------------------------------------------------ opened email
  function processOpened() {
    for (const body of document.querySelectorAll("div.a3s")) {
      if (body.offsetParent === null) continue;
      const msg = body.closest(".adn, .h7, [data-message-id]") || body.parentElement;
      const text = (body.innerText || body.textContent || "").slice(0, 6000);
      const subjEl = document.querySelector("h2.hP");
      const snd = msg.querySelector("span.gD[email], span[email]");
      const info = {
        sender: snd ? snd.getAttribute("name") || snd.textContent : "",
        senderEmail: snd ? snd.getAttribute("email") || "" : "",
        subject: subjEl ? subjEl.textContent.trim() : "",
        text,
      };
      const sig = info.senderEmail + "|" + info.subject + "|" + text.length;
      if (body.dataset.ssSig === sig) continue;
      body.dataset.ssSig = sig;
      const { r } = classify(info);
      const prev = body.previousElementSibling;
      if (prev && prev.classList.contains("ss-banner")) prev.remove();
      body.before(banner(r, info));
    }
  }

  function banner(r, info) {
    const msgs = {
      important: "Contains a one-time code or a verification / password link. Never share codes with anyone.",
      genuine: r.reason === "Trusted sender" ? "From a sender you trust." : "No spam or marketing signals found.",
      likely: `Moderate ${r.reason === "Probably promotional" ? "promotional" : "spam"} score (${pct(r.junk)}). Be careful with links and attachments.`,
      spam: r.reason.startsWith("Phishing")
        ? "Looks like a phishing or scam message. Do not click links, pay, or share OTPs / bank details."
        : r.reason === "Marketing" ? "Promotional bulk mail (offers, sales, newsletters)." : "Junk mail.",
    };
    const title = "SpamShield · " + NAMES[r.bucket] + (r.bucket === "spam" ? " · " + r.reason : "");
    return h("div", { class: `ss-banner ss-${r.bucket}` },
      h("span", { class: "ss-shield" }),
      h("div", { class: "ss-bt" }, h("b", null, title), h("span", null, msgs[r.bucket])),
      h("button", { class: "ss-more", onclick: (e) => showCard(e.currentTarget, r, info) }, "Why?"),
    );
  }

  // ------------------------------------------------------------ detail card
  let card = null;
  function closeCard() { if (card) { card.remove(); card = null; } }
  document.addEventListener("click", (e) => { if (card && !card.contains(e.target)) closeCard(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCard(); });

  function showCard(anchor, r, info) {
    closeCard();
    const bars = [["important", "Important"], ["genuine", "Genuine"], ["promo", "Marketing"], ["spam", "Spam / scam"]].map(([k, l]) =>
      h("div", { class: "ss-bar" }, h("span", null, l), h("i", null, h("u", { class: "ss-f-" + k, style: `width:${Math.max(2, r.probs[k] * 100)}%` })), h("b", null, pct(r.probs[k]))));
    const why = (r.why || []).filter((w) => !/tok$/.test(w.term) || true).slice(0, 6).map((w) =>
      h("span", { class: "ss-term " + (w.junk > 0 ? "j" : "g") }, w.term.replace(/urltok/g, "‹link›").replace(/moneytok/g, "‹amount›").replace(/codetok/g, "‹code›").replace(/pcttok/g, "‹%›").replace(/numtok/g, "‹num›").replace(/emailtok/g, "‹email›")));
    const email = (info.senderEmail || "").toLowerCase();
    const domain = email.split("@")[1];
    const acts = email ? [
      h("button", { onclick: () => { save({ trusted: uniq([...S.trusted, email]), blocked: S.blocked.filter((x) => x !== email) }); cache.clear(); resetRows(); refresh(true); closeCard(); } }, "Trust sender"),
      h("button", { class: "danger", onclick: () => { save({ blocked: uniq([...S.blocked, email]), trusted: S.trusted.filter((x) => x !== email) }); cache.clear(); resetRows(); refresh(true); closeCard(); } }, "Always spam"),
      domain && !/^(gmail|yahoo|outlook|hotmail)\./.test(domain)
        ? h("button", { class: "ghost", onclick: () => { save({ blocked: uniq([...S.blocked, "@" + domain]) }); cache.clear(); resetRows(); refresh(true); closeCard(); } }, "Block @" + domain)
        : null,
    ] : [];
    card = h("div", { class: "ss-card", role: "dialog" },
      h("div", { class: "ss-card-h" }, h("span", { class: `ss-badge ss-${r.bucket}` }, h("i"), NAMES[r.bucket]), h("small", null, r.reason)),
      h("div", { class: "ss-card-s" }, "Junk score ", h("b", null, pct(r.junk)), email ? h("small", null, " · " + email) : null),
      ...bars,
      why.length ? h("div", { class: "ss-why" }, h("small", null, "Strongest signals"), h("div", null, why)) : null,
      acts.length ? h("div", { class: "ss-acts" }, acts) : null,
    );
    document.body.append(card);
    const rc = anchor.getBoundingClientRect();
    const cw = 300, ch = card.offsetHeight;
    let left = Math.min(window.innerWidth - cw - 12, Math.max(12, rc.left));
    let top = rc.bottom + 6;
    if (top + ch > window.innerHeight - 12) top = Math.max(12, rc.top - ch - 6);
    card.style.left = left + "px";
    card.style.top = top + "px";
  }
  const uniq = (a) => [...new Set(a)];

  // ------------------------------------------------------------ floating filter bar
  let bar = null;
  const btns = {};
  function buildBar() {
    bar = h("div", { class: "ss-bar-wrap", id: "ss-bar" });
    const toggle = h("button", { class: "ss-logo", title: "SpamShield — click to collapse / expand", onclick: () => { save({ collapsed: !S.collapsed }); paintBar(); } }, h("span", { class: "ss-shield" }), h("b", null, "SpamShield"));
    bar.append(toggle);
    const group = h("div", { class: "ss-seg", role: "tablist" });
    for (const b of BUCKETS) {
      const el = h("button", { class: `ss-f ss-f-${b.id}`, role: "tab", title: b.hint || "Show every email", onclick: () => { save({ filter: b.id }); refresh(); } },
        b.id !== "all" ? h("i") : null, b.label, h("em", null, "0"));
      btns[b.id] = el;
      group.append(el);
    }
    bar.append(group);
    document.body.append(bar);
  }
  function paintBar(counts) {
    if (!bar) buildBar();
    bar.hidden = !S.enabled;
    bar.classList.toggle("collapsed", !!S.collapsed);
    for (const b of BUCKETS) {
      btns[b.id].classList.toggle("on", S.filter === b.id);
      btns[b.id].setAttribute("aria-selected", S.filter === b.id ? "true" : "false");
      if (counts) btns[b.id].querySelector("em").textContent = counts[b.id];
    }
  }

  // ------------------------------------------------------------ main loop
  let lastCounts = null, statsTimer = null;
  function refresh(force) {
    if (!S.enabled) {
      document.querySelectorAll(".ss-badge,.ss-banner").forEach((n) => n.remove());
      listRows().forEach((tr) => { tr.classList.remove("ss-hidden"); delete tr.dataset.ssKey; });
      paintBar();
      return;
    }
    try {
      processRows();
      processOpened();
    } catch (e) {
      console.warn("[SpamShield]", e);
    }
    let counts = applyFilter();
    if (!counts.all && lastCounts) counts = JSON.parse(lastCounts); // opened-mail view: keep the inbox counts
    paintBar(counts);
    const sig = JSON.stringify(counts);
    if (force || sig !== lastCounts) {
      lastCounts = sig;
      clearTimeout(statsTimer);
      statsTimer = setTimeout(() => { try { chrome.storage.local.set({ lastCounts: counts, lastSeen: Date.now() }); } catch (e) { /* extension was reloaded */ } }, 500);
    }
  }

  function safeRefresh(force) {
    try { refresh(force); } catch (e) { console.warn("[SpamShield]", e); }
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; safeRefresh(); }, 300);
  }

  // Start only once Gmail's own app has finished loading (its main pane exists), so
  // SpamShield never touches Gmail's loading screen, error pages or sign-in pages.
  function whenGmailReady(cb) {
    const t0 = Date.now();
    (function poll() {
      if (document.querySelector('div[role="main"]')) return cb();
      if (Date.now() - t0 < 120000) setTimeout(poll, 700);
    })();
  }

  whenGmailReady(() => loadSettings().then(() => {
    safeRefresh(true);
    new MutationObserver((muts) => {
      for (const m of muts) {
        const t = m.target;
        if (t.nodeType === 1 && (t.closest(".ss-bar-wrap,.ss-card") || t.classList.contains("ss-badge"))) continue;
        schedule();
        break;
      }
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hashchange", schedule);
  }));
})();
