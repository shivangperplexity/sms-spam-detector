(() => {
  const DEFAULTS = { enabled: true, sensitivity: "balanced", badges: true, filter: "all", collapsed: false, trusted: [], blocked: [] };
  const $ = (id) => document.getElementById(id);
  let S = { ...DEFAULTS };
  const NAMES = { important: "Important", genuine: "Genuine", likely: "Likely spam", spam: "Spam" };

  function paint() {
    $("enabled").checked = S.enabled;
    $("badges").checked = S.badges;
    document.querySelectorAll("#sens button").forEach((b) => b.classList.toggle("on", b.dataset.v === S.sensitivity));
    list("trusted"); list("blocked");
  }
  function list(key) {
    const ul = $(key);
    ul.textContent = "";
    if (!S[key].length) { const li = document.createElement("li"); li.className = "empty"; li.textContent = "None yet"; ul.append(li); return; }
    for (const v of S[key]) {
      const li = document.createElement("li");
      const s = document.createElement("span"); s.textContent = v;
      const x = document.createElement("button"); x.textContent = "×"; x.title = "Remove";
      x.onclick = () => set({ [key]: S[key].filter((y) => y !== v) });
      li.append(s, x); ul.append(li);
    }
  }
  function set(p) { S = { ...S, ...p }; chrome.storage.sync.set(p); paint(); }

  chrome.storage.sync.get(DEFAULTS, (v) => { S = { ...DEFAULTS, ...v }; paint(); });
  chrome.storage.local.get({ lastCounts: null, lastSeen: 0 }, ({ lastCounts, lastSeen }) => {
    if (!lastCounts) return;
    for (const k of ["important", "genuine", "likely", "spam"]) $("n-" + k).textContent = lastCounts[k];
    const mins = Math.round((Date.now() - lastSeen) / 60000);
    $("seen").textContent = `${lastCounts.all} emails on your last Gmail page · ${mins < 1 ? "just now" : mins + " min ago"}`;
  });

  $("enabled").onchange = (e) => set({ enabled: e.target.checked });
  $("badges").onchange = (e) => set({ badges: e.target.checked });
  document.querySelectorAll("#sens button").forEach((b) => (b.onclick = () => set({ sensitivity: b.dataset.v })));

  let t = null;
  $("probe").oninput = (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      const v = e.target.value.trim();
      const out = $("probeOut");
      if (!v) { out.hidden = true; return; }
      const [subject, ...rest] = v.split("\n");
      const r = SSClassifier.classify({ subject, text: rest.join(" ") }, { sensitivity: S.sensitivity });
      out.hidden = false;
      out.textContent = "";
      const tag = document.createElement("span"); tag.className = "tag " + r.bucket; tag.textContent = NAMES[r.bucket];
      out.append(tag, `${r.reason} · junk score ${Math.round(r.junk * 100)}%`);
    }, 150);
  };

  const m = SSClassifier.model();
  $("modelInfo").textContent = `On-device model · trained on ${m.trainedOn.toLocaleString("en-IN")} emails & SMS · ${(m.testAccuracy * 100).toFixed(1)}% test accuracy · ${m.vocab.length.toLocaleString("en-IN")} features · nothing leaves your browser`;
})();
