/* ChopStory · S1/S2：菜单 list + 详情弹层 + 购物车条
   ★ 2026-07-13 柿漆金排档 v-final（规范：Hackathon/UI-DESIGN.md 末章；基准：ui-lab/style-lab-final.html） */
/* ---------------- list rendering ---------------- */
function renderCats() {
  const count = c => c === "All" ? streamed.length
    : c === "⭐ Signature" ? streamed.filter(d => d.signature).length
    : streamed.filter(d => d.cat === c).length;
  document.getElementById("cats").innerHTML = CATS.filter(c => count(c) > 0).map(c =>
    `<button class="cat ${c===currentCat?"on":""}" data-c="${c}" onclick="setCat('${c}')">${c}<i>${count(c)}</i></button>`).join("");
}
function setCat(c) { currentCat = c; renderCats(); renderList(); }

function speak(cn, ev) {
  ev.stopPropagation();
  const u = new SpeechSynthesisUtterance(cn); u.lang = "zh-CN"; u.rate = .85;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
/* 辣度文字化（v-final）：零 emoji。麻 numbing≥5 追加 ·MÁ */
function spiceLabel(d) {
  const s = ["", "MILD", "MED", "HOT"][d.spicy] || "";
  const ma = d.flavorBars && d.flavorBars.numbing >= 5 ? (s ? " · MÁ" : "MÁ") : "";
  return s + ma;
}
/* 加购前 = 柿红＋钮；加购后 = 就地 [− n ＋] 迷你 stepper（7.13 修正：不再变黑色数字钮）。
   独立成函数：加减号只局部重绘 .addwrap，不再触发整列表 renderList（7.13 防抖动） */
function addCtlHTML(d) {
  const inOrder = order.get(d.id) || 0;
  return inOrder
    ? `<div class="qtyctl" onclick="event.stopPropagation()"><button onclick="addToOrder(${d.id},-1)">−</button><b>${inOrder}</b><button onclick="addToOrder(${d.id},1)">＋</button></div>`
    : `<button class="addbtn" onclick="event.stopPropagation();addToOrder(${d.id},1)">＋</button>`;
}
function pcardHTML(d, i = 0, stagger = false) {
  const sp = spiceLabel(d);
  return `<div class="pcard" style="--d:${stagger ? Math.min(i, 14) * 40 : 0}ms" onclick="openDetail(${d.id})">
    <div class="addwrap" data-id="${d.id}">${addCtlHTML(d)}</div>
    <div class="name">${d.name}${sp ? `<span class="sp">${sp}</span>` : ""}</div>
    <div class="cn">${d.nameCn} · ${d.pinyin}</div>
    <div class="right"><b>≈$${usdN(d.price)}</b><small>¥${d.price}</small></div>
    <div class="tags">${previewTags(d)}</div>
  </div>`;
}
/* 折叠逻辑已移除（7.13，Julia 定）：命中过敏/忌口的菜不再收到底部，
   行内保留红色 ⚠ tag（previewTags/personalHits）作为唯一警示 */
function renderList(stagger = false) {
  const pool = streamed.filter(d => currentCat === "All" || (currentCat === "⭐ Signature" ? d.signature : d.cat === currentCat));
  let idx = 0, html = "";
  if (currentCat === "All") {
    /* All = whole menu, grouped with section headers（分区名 = tab 名，scrollspy 联动） */
    for (const c of CATS) {
      if (c === "All" || c === "⭐ Signature") continue;
      const grp = pool.filter(d => d.cat === c);
      if (!grp.length) continue;
      html += `<div class="sechead" data-cat="${c}" style="--d:${stagger ? idx * 40 : 0}ms"><b>${c}</b><span>${grp[0].catOriginal || ""}</span></div>`;
      html += grp.map(d => pcardHTML(d, ++idx, stagger)).join("");
    }
  } else {
    html = pool.map(d => pcardHTML(d, idx++, stagger)).join("");
  }
  document.getElementById("cards").innerHTML = html;
  renderCartBar();
}

/* scrollspy（v-final）：All 视图下滑到哪个分区，顶部对应 tab 点亮 */
function spyCats() {
  if (currentCat !== "All") return;
  const listEl = document.getElementById("s-list");
  if (!listEl || listEl.classList.contains("hidden")) return;
  let active = "All";
  document.querySelectorAll("#cards .sechead").forEach(h => {
    if (h.offsetTop - listEl.scrollTop <= 150) active = h.dataset.cat;
  });
  document.querySelectorAll("#cats .cat").forEach(b =>
    b.classList.toggle("on", b.dataset.c === active));
}
document.getElementById("s-list").addEventListener("scroll",
  () => requestAnimationFrame(spyCats), { passive: true });

/* ---------------- detail（v-final：标题两行 · What it is 主角 · 题跋 story · 价格只在 CTA） ----------------
   Flavor bars 已废弃（UI.md 7.12）：辣度文字化在列表菜名行；麻 numbing≥5 = Heads-up 标签；
   Heads-up 标签清单维护在 data.js（GENERIC_TAG / HIDDEN_RISK_LABEL） */
function openDetail(id) {
  const d = DISHES.find(x => x.id === id);
  const hits = personalHits(d);
  const qty = order.get(id) || 0;
  const sheet = document.getElementById("detail-sheet");
  const keepScroll = !sheet.classList.contains("hidden") ? sheet.scrollTop : 0;
  const storyBlock = (d.story || d.howToEat) ? `
    <div class="story"><div class="lb2">THE STORY · 由来</div>${d.story || ""}
      ${d.howToEat ? `<p class="how"><b>How to eat:</b> ${d.howToEat}</p>` : ""}</div>` : `<div style="height:14px"></div>`;
  sheet.innerHTML = `
    <div class="grabber"></div>
    <button class="dclose" onclick="closeDetail()" aria-label="Close">✕</button>
    <div class="hero">${d.emoji}</div>
    <div class="dname">${d.name}</div>
    <div class="dcn">${d.nameCn} · ${d.pinyin} <button class="speak" style="border:none;background:none;cursor:pointer;padding:6px" onclick="speak('${d.nameCn}',event)">🔊</button></div>
    ${d.uncertain ? `<div class="uncertain-banner">🤔 Not sure about this one — we couldn't fully verify this dish. Confirm with staff.</div>` : ""}
    ${hits.length ? `<div class="uncertain-banner" style="background:#fbeeea;color:#b23a26">⚠ Flagged for you: ${hits.join(", ")}</div>` : ""}
    <div class="lede">${d.desc}</div>
    <div class="dsec"><div class="gt">Ingredients <span>食材</span></div>
      <div class="ing-chips">${d.ingredients.map(i => `<span class="ing">${i}</span>`).join("")}</div></div>
    <div class="dsec"><div class="gt">Allergens <span>过敏原</span></div>
      <div class="alg-chips">${d.allergens.length
        ? d.allergens.map(a => `<span class="alg ${a.l === "contains" ? "c" : "m"}">${ALLERGEN_LABEL[a.t].toLowerCase()} · ${a.l === "contains" ? "contains" : "may"}</span>`).join("")
        : `<span class="alg none">none flagged for the typical recipe</span>`}</div></div>
    ${d.textures.length || (d.hiddenRisks||[]).length || (d.flavorBars && d.flavorBars.numbing >= 5) ? `<div class="dsec"><div class="gt">Heads-up <span>请留意</span></div>
      <div class="ing-chips">${(d.flavorBars && d.flavorBars.numbing >= 5) ? `<span class="ing">⚡ tingling 麻 — Sichuan pepper buzz</span>` : ""}
      ${d.textures.map(t => `<span class="ing">${GENERIC_TAG[t]}</span>`).join("")}
      ${(d.hiddenRisks||[]).map(h => `<span class="ing">${HIDDEN_RISK_LABEL[h] || h}</span>`).join("")}</div></div>` : ""}
    ${storyBlock}
    <div class="detail-cta">
      ${qty ? `<div class="stepper"><button onclick="addToOrder(${d.id},-1);openDetail(${d.id})">−</button><b>${qty}</b><button onclick="addToOrder(${d.id},1);openDetail(${d.id})">＋</button></div>`
            : `<button class="btn" onclick="addToOrder(${d.id},1);openDetail(${d.id})">Add to order · ≈$${usdN(d.price)}&nbsp;&nbsp;<small>¥${d.price}</small></button>`}
    </div>`;
  document.getElementById("detail-mask").classList.remove("hidden");
  sheet.classList.remove("hidden");
  sheet.scrollTop = keepScroll;
}
function closeDetail() {
  document.getElementById("detail-mask").classList.add("hidden");
  document.getElementById("detail-sheet").classList.add("hidden");
}
