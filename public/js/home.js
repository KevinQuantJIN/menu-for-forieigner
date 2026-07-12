/* Chopstory · S0 首页：画像面板 + 扫描/识别流程 */
/* ---------------- profile sheet ---------------- */
function renderProfileStrip() {
  const el = document.getElementById("profileStrip");
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

/* ---------------- analyze flow (mock streaming) ---------------- */
function startAnalyze() {
  const thumb = document.getElementById("anaThumb");
  if (scanSource === "album") thumb.innerHTML = `<img src="real-menu-mawangzi.jpg" alt="Menu photo">`;
  else thumb.textContent = "川辣小馆·川菜 —— 夫妻肺片 25 · 宫保鸡丁 42 · 麻婆豆腐 32 · 水煮鱼 58 · 龙抄手 18 ……";
  go("analyzing");
  const set = (id, cls, txt) => { const s = document.getElementById(id); s.className = "step " + cls; s.querySelector(".st").textContent = txt; };
  set("st1","doing","reading…"); set("st2","","waiting"); set("st3","","waiting");
  setTimeout(() => { set("st1","done","done ✓"); set("st2","doing","translating…"); }, 900);
  setTimeout(() => { set("st2","done","done ✓"); set("st3","doing","checking…"); }, 1800);
  setTimeout(() => { set("st3","done","done ✓"); beginStream(); }, 2400);
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

