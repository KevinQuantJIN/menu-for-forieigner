/* ChopStory · S1/S2：菜单 list + 详情弹层 + 购物车条
   ★ 2026-07-13 柿漆金排档 v-final（规范：Hackathon/UI-DESIGN.md 末章；基准：ui-lab/style-lab-final.html） */
/* ---------------- list rendering ---------------- */
function categoryOrder(dishes) {
  const seen = [];
  for (const d of dishes) {
    const c = d.category || "Other";
    if (!seen.includes(c)) seen.push(c);
  }
  return seen;
}
function renderCats() {
  const cats = ["All", ...categoryOrder(streamed)];
  if (streamed.some(d => d.signature)) cats.splice(1, 0, "⭐ Signature");
  const count = c => c === "All" ? streamed.length
    : c === "⭐ Signature" ? streamed.filter(d => d.signature).length
    : streamed.filter(d => (d.category || "Other") === c).length;
  document.getElementById("cats").innerHTML = cats.filter(c => count(c) > 0).map(c =>
    `<button class="cat ${c===currentCat?"on":""}" data-c="${esc(c)}" onclick="setCat(${JSON.stringify(c)})">${esc(c)}<i>${count(c)}</i></button>`).join("");
}
function setCat(c) { currentCat = c; renderCats(); renderList(); }

function speak(cn, ev) {
  ev.stopPropagation();
  const u = new SpeechSynthesisUtterance(cn); u.lang = "zh-CN"; u.rate = .85;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
/* 辣度标注（7.13 统一）：🌶 icon 三档缀在菜名旁；麻不在列表标注（仅详情 Heads-up） */
function spiceLabel(d) {
  return d.spicy ? "🌶".repeat(Math.min(d.spicy, 3)) : "";
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
  const p = parsePrice(d.price), pl = priceLabel(d.price);
  return `<div class="pcard" style="--d:${stagger ? Math.min(i, 14) * 40 : 0}ms" onclick="openDetail(${d.id})">
    <div class="addwrap" data-id="${d.id}">${addCtlHTML(d)}</div>
    <div class="name">${esc(d.name)}${sp ? `<span class="sp">${sp}</span>` : ""}</div>
    <div class="cn">${esc(d.nameCn)} · ${esc(d.pinyin)}</div>
    <div class="right"><b>≈${curSym()}${fxN(p)}</b><small>¥${esc(pl)}</small></div>
    <div class="tags">${previewTags(d)}</div>
  </div>`;
}
/* 折叠逻辑已移除（7.13，Julia 定）：命中过敏/忌口的菜不再收到底部，
   行内保留红色 ⚠ tag（previewTags/personalHits）作为唯一警示 */
function renderList(stagger = false) {
  const pool = streamed.filter(d => currentCat === "All" || (currentCat === "⭐ Signature" ? d.signature : (d.category || "Other") === currentCat));
  let idx = 0, html = "";
  if (currentCat === "All") {
    /* All = whole menu, grouped with section headers（分区名 = tab 名，scrollspy 联动） */
    for (const c of categoryOrder(streamed)) {
      const grp = pool.filter(d => (d.category || "Other") === c);
      if (!grp.length) continue;
      html += `<div class="sechead" data-cat="${esc(c)}" style="--d:${stagger ? idx * 40 : 0}ms"><b>${esc(c)}</b><span>${esc(grp[0].catOriginal || "")}</span></div>`;
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
   Flavor bars 已废弃（UI.md 7.12）：辣度文字化在列表菜名行；麻/风险信息由 textures[] + textureLabel 承载 */
function openDetail(id) {
  const d = streamed.find(x => x.id === id);
  if (!d) return;
  const qty = order.get(id) || 0;
  const p = parsePrice(d.price), pl = priceLabel(d.price);
  const sheet = document.getElementById("detail-sheet");
  const keepScroll = !sheet.classList.contains("hidden") ? sheet.scrollTop : 0;
  const storyBlock = (d.story || d.howToEat) ? `
    <div class="story"><div class="lb2">THE STORY · 由来</div>${esc(d.story || "")}
      ${d.howToEat ? `<p class="how"><b>How to eat:</b> ${esc(d.howToEat)}</p>` : ""}</div>` : `<div style="height:14px"></div>`;
  sheet.innerHTML = `
    <div class="grabber"></div>
    <button class="dclose" onclick="closeDetail()" aria-label="Close">✕</button>
    <div class="hero">${dishEmoji(d)}</div>
    <div class="dname">${esc(d.name)}</div>
    <div class="dcn">${esc(d.nameCn)} · ${esc(d.pinyin)} <button class="speak" style="border:none;background:none;cursor:pointer;padding:6px" onclick="speak(${JSON.stringify(d.nameCn)},event)">🔊</button></div>
    <div class="lede">${esc(d.description || "")}</div>
    <div class="dsec"><div class="gt">Ingredients <span>食材</span></div>
      <div class="ing-chips">${d.ingredients.map(i => `<span class="ing">${esc(i)}</span>`).join("")}</div></div>
    <div class="dsec"><div class="gt">Allergens <span>过敏原</span></div>
      <div class="alg-chips">${d.allergens.length
        ? d.allergens.map(a => `<span class="alg ${a.level === "contains" ? "c" : "m"}">${esc((ALLERGEN_LABEL[a.type] || a.type).toLowerCase())} · ${a.level === "contains" ? "contains" : "may"}</span>`).join("")
        : `<span class="alg none">none flagged for the typical recipe</span>`}</div></div>
    ${d.textures.length ? `<div class="dsec"><div class="gt">Heads-up <span>请留意</span></div>
      <div class="ing-chips">${d.textures.map(t => `<span class="ing">${esc(textureLabel(t))}</span>`).join("")}</div></div>` : ""}
    ${storyBlock}
    <div class="detail-cta">
      ${qty ? `<div class="stepper"><button onclick="addToOrder(${d.id},-1);openDetail(${d.id})">−</button><b>${qty}</b><button onclick="addToOrder(${d.id},1);openDetail(${d.id})">＋</button></div>`
            : `<button class="btn" onclick="addToOrder(${d.id},1);openDetail(${d.id})">Add to order · ≈${curSym()}${fxN(p)}&nbsp;&nbsp;<small>¥${esc(pl)}</small></button>`}
    </div>`;
  document.getElementById("detail-mask").classList.remove("hidden");
  sheet.classList.remove("hidden");
  sheet.scrollTop = keepScroll;
}
function closeDetail() {
  document.getElementById("detail-mask").classList.add("hidden");
  document.getElementById("detail-sheet").classList.add("hidden");
}

/* ---------------- 货币选择（7.13 A 案：币徽 + 底部弹层） ---------------- */
function openCurrency() {
  const sheet = document.getElementById("cur-sheet");
  sheet.innerHTML = `
    <div class="grabber"></div>
    <h4 class="cur-title">Show prices in…</h4>
    <p class="cur-sub">We convert ¥ (CNY) prices into a currency you're familiar with, for your convenience — the rate is approximate and for reference only.</p>
    ${CURRENCIES.map(c => `<div class="cur-row ${c.code === curCode ? "on" : ""}" onclick="setCurrency('${c.code}')">
      <span class="fl">${c.flag}</span><b>${c.name}</b><span class="cd">${c.code}</span>
      <span class="pv"><i class="u">${c.sym}${c.unit === 1 ? "1" : c.unit.toLocaleString("en-US")}</i><i class="r">≈ ¥${(c.unit / c.perCny).toFixed(2)}</i></span></div>`).join("")}`;
  document.getElementById("cur-mask").classList.remove("hidden");
  sheet.classList.remove("hidden");
}
function closeCurrency() {
  document.getElementById("cur-mask").classList.add("hidden");
  document.getElementById("cur-sheet").classList.add("hidden");
}
function setCurrency(code) {
  curCode = code;
  localStorage.setItem("ml.currency", code);
  document.getElementById("curBtn").textContent = curSym();
  closeCurrency();
  renderList();                                    // 价签 + 底栏联动刷新
  if (!document.getElementById("s-order").classList.contains("hidden")) renderOrder();
}
document.getElementById("curBtn").textContent = curSym(); // 启动时恢复上次选择
