/* Chopstory · S0 首页：画像面板 + 扫描/识别流程 */
/* ---------------- profile sheet ---------------- */
function renderProfileStrip() {
  const el = document.getElementById("profileStrip");
  if (!el) return; // 首页画像条已移除（UI.md 7.12）；画像入口 = 首跑面板 + 点单页 Edit
  const parts = [
    ...profile.allergens.map(a => "🚫 " + ALLERGEN_LABEL[a]),
    ...profile.avoid.map(a => "🙅 " + AVOID_LABEL[a]),
    "🌶 " + ["No spice","Mild","Medium","Hot ok"][profile.spice],
  ];
  el.innerHTML = parts.map(p => `<span class="tag tag-gray">${p}</span>`).join("") +
    ` <button class="tag" style="border:1.5px solid var(--accent);background:none;color:var(--accent);cursor:pointer;min-height:28px" onclick="openSheet()">✎ edit</button>`;
}
function openSheet() {
  document.getElementById("sheet-mask").classList.remove("hidden");
  document.getElementById("sheet").classList.remove("hidden");
  document.querySelectorAll("#sheet .chips").forEach(g => {
    const group = g.dataset.group;
    g.querySelectorAll(".chip").forEach(c => {
      const v = c.dataset.v;
      const on = group === "spice" ? String(profile.spice) === v : profile[group].includes(v);
      c.classList.toggle("on", on);
      c.onclick = () => {
        if (group === "spice") { g.querySelectorAll(".chip").forEach(x => x.classList.remove("on")); c.classList.add("on"); }
        else c.classList.toggle("on");
      };
    });
  });
}
function closeSheet(save) {
  if (save) {
    profile.allergens = [...document.querySelectorAll('[data-group="allergens"] .chip.on')].map(c => c.dataset.v);
    profile.avoid = [...document.querySelectorAll('[data-group="avoid"] .chip.on')].map(c => c.dataset.v);
    const sp = document.querySelector('[data-group="spice"] .chip.on');
    profile.spice = sp ? Number(sp.dataset.v) : 1;
    localStorage.setItem("ml.profile", JSON.stringify(profile));
  }
  document.getElementById("sheet-mask").classList.add("hidden");
  document.getElementById("sheet").classList.add("hidden");
  renderProfileStrip();
  if (!document.getElementById("s-list").classList.contains("hidden")) renderList();
}

/* ---------------- analyze flow：极简等待屏（一行状态轮换 + 进度条） ---------------- */
function startAnalyze() {
  go("analyzing");
  const status = document.getElementById("anaStatus");
  const bar = document.getElementById("anaBar");
  const phase = (txt, pct) => { status.textContent = txt; bar.style.width = pct + "%"; };
  phase("Looking at the photo", 18);
  setTimeout(() => phase("Translating 14 dishes", 55), 900);
  setTimeout(() => phase("Checking your allergies", 85), 1800);
  setTimeout(() => { phase("Done", 100); beginStream(); }, 2400);
}
function beginStream() {
  /* whole-menu reveal: analysis done → present the entire decoded menu at once
     (cards cascade in within ~0.6s via per-card animation-delay — feels like
     "here is your whole menu", not dishes trickling in one by one) */
  streamed = DISHES.slice(); currentCat = "All"; foldOpen = false;
  document.getElementById("restoName").textContent = scanSource === "album" ? "Ma Wang Zi 马旺子" : "Chuanla Kitchen 川辣小馆";
  document.getElementById("dishCount").textContent = DISHES.length;
  renderCats(); renderList(true);
  go("list");
}

