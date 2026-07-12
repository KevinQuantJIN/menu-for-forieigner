/* ChopStory · S3：点单状态 + 双面点菜卡 */
/* ---------------- order ---------------- */
function addToOrder(id, delta) {
  const q = (order.get(id) || 0) + delta;
  if (q <= 0) order.delete(id); else order.set(id, q);
  /* 7.13 防抖动：数量变化只局部重绘该菜的加购控件（含折叠区副本），不再整列表 renderList */
  const d = DISHES.find(x => x.id === id);
  document.querySelectorAll(`.addwrap[data-id="${id}"]`).forEach(w => { w.innerHTML = addCtlHTML(d); });
  renderCartBar();
}
function orderTotal() { let t = 0; for (const [id,q] of order) t += DISHES.find(d => d.id === id).price * q; return t; }
function renderCartBar() {
  /* persistent bar — always visible on the list so "My Order" is one tap away */
  const n = [...order.values()].reduce((a,b) => a+b, 0);
  const sum = document.getElementById("cartSum");
  if (!n) sum.innerHTML = `<span style="opacity:.72">Pick dishes to build your order</span>`;
  else sum.textContent = `${n} dish${n>1?"es":""} · ≈ $${usdN(orderTotal())} · ¥${orderTotal()}`;
}
function openOrder() { waiterMode = false; renderOrder(); go("order"); }
function renderOrder() {
  /* order-card-final 定稿（7.13）：单行三件套顶行 · 圆框金签单元 · 两面严格同构
     一面一种语言：英文面全英文（¥ 数字并存于 Total）；中文面全中文（连 tab 都本地化）
     底部 CTA 两面同一样式，语言徽标 = 金框 CN/EN 字母 */
  const items = [...order.entries()].map(([id,q]) => ({ d: DISHES.find(x => x.id === id), q }));
  const el = document.getElementById("s-order");
  seedRequests();
  if (waiterMode) orderEditing = false;
  const total = orderTotal();
  const reqSel = REQ_DEFS.filter(r => requests.has(r.k));
  const allergenEN = profile.allergens.map(a => ALLERGEN_LABEL[a]).join(", ");
  const allergenCN = profile.allergens.map(a => ALLERGEN_CN[a]).join("、");
  const avoidEN = profile.avoid.map(a => AVOID_LABEL[a]).join(", ");
  const avoidCN = profile.avoid.map(a => AVOID_CN[a]).join("、");
  const keepScroll = el.scrollTop;

  /* MY PICKS / 已选菜品 —— 行内不带 icon；Total/合计 在单元内、重线顶隔 */
  const dishesEN = items.length
    ? items.map(({d,q}) => `<div class="orow"><b>${d.name}<small>${d.nameCn} · ${d.pinyin}</small></b><span class="q">×${q}</span><span>≈ $${usdN(d.price*q)}</span></div>`).join("")
      + `<div class="total-line"><span>Total</span><span>≈ $${usdN(total)} · ¥${total}</span></div>`
    : `<div class="sec-empty"><span class="e">🍽️</span>Nothing here yet — tap ＋ on the menu</div>`;
  const dishesCN = items.length
    ? items.map(({d,q}) => `<div class="orow"><b>${d.nameCn}</b><span class="q">×${q}</span><span>¥${d.price*q}</span></div>`).join("")
      + `<div class="total-line"><span>合计</span><span>¥${total}</span></div>`
    : `<div class="sec-empty"><span class="e">🍽️</span>还没有选菜</div>`;

  /* MY NOTES（英文面：My xx 键名 + 空态提示；Edit 编辑整卡）*/
  const chipRow = (defs, group) => Object.entries(defs).map(([k, l]) =>
    `<button class="chip ${profile[group].includes(k) ? "on" : ""}" onclick="toggleProfileItem('${group}','${k}')">${l}</button>`).join("");
  const notesEN = orderEditing ? `
      <div class="chip-group"><div class="gt">Allergies</div><div class="chips">${chipRow(ALLERGEN_LABEL, "allergens")}</div></div>
      <div class="chip-group"><div class="gt">I'd rather avoid</div><div class="chips">${chipRow(AVOID_LABEL, "avoid")}</div></div>
      <div class="chip-group"><div class="gt">Requests</div><div class="chips">${REQ_DEFS.map(r => `<button class="chip ${requests.has(r.k)?"on":""}" onclick="toggleReq('${r.k}')">${r.en}</button>`).join("")}</div></div>
      <div class="chip-group"><div class="gt">Anything else</div><input class="note-input" placeholder="e.g. no raw garlic please" value="${customNote.replace(/"/g,"&quot;")}" onchange="customNote=this.value"></div>
    ` : `
      <div class="note-row danger"><span class="k">My allergies</span><span class="v ${allergenEN?"":"none"}">${allergenEN || "None set — tap Edit"}</span></div>
      <div class="note-row"><span class="k">My dislikes</span><span class="v ${avoidEN?"":"none"}">${avoidEN || "Nothing marked"}</span></div>
      <div class="note-row"><span class="k">My requests</span><span class="v ${reqSel.length?"":"none"}">${reqSel.map(r => r.en.replace(/^\S+ /, "")).join(" · ") || "None"}</span></div>
      ${customNote ? `<div class="note-row"><span class="k">My note</span><span class="v">${customNote}</span></div>` : ""}
    `;
  /* 请注意（中文面：整句、无空行——服务员只看有内容的行）*/
  const cnRows = [
    allergenCN ? `<div class="note-row danger"><span class="v">对${allergenCN}严重过敏，请勿使用相关食材及烹饪油</span></div>` : "",
    avoidCN ? `<div class="note-row"><span class="v">尽量不要${avoidCN}</span></div>` : "",
    (reqSel.length || customNote) ? `<div class="note-row"><span class="v">${[reqSel.map(r => r.cn).join("；"), customNote].filter(Boolean).join("；另外：")}</span></div>` : "",
  ].filter(Boolean).join("") || `<div class="note-row"><span class="v none">无特别要求</span></div>`;

  el.className = "screen" + (waiterMode ? " waiter" : "");
  el.innerHTML = `
    <div class="topbar">
      <button class="back" onclick="go('list')">‹</button>
      <div class="otabs">${waiterMode ? `
        <button class="otab off" onclick="waiterMode=false;renderOrder()">顾客视图<span class="s">英文</span></button>
        <button class="otab on-cn" onclick="waiterMode=true;renderOrder()">服务员视图<span class="s">中文</span></button>` : `
        <button class="otab on-en" onclick="waiterMode=false;renderOrder()">My view<span class="s">IN ENGLISH</span></button>
        <button class="otab off" onclick="waiterMode=true;renderOrder()">Waiter view<span class="s">IN CHINESE</span></button>`}
      </div>
    </div>
    ${waiterMode ? `
      <div class="sec-card"><span class="sec-lab">🍽 已选菜品</span>${dishesCN}</div>
      <div class="sec-card"><span class="sec-lab zhu">⚠️ 请注意</span>${cnRows}</div>
      <div class="order-cta">
        <div class="cn-note">🙏 顾客不会中文 · 请照单下单，谢谢</div>
        <button class="cta-main" onclick="waiterMode=false;renderOrder()">‹ Back to my view <span class="lang-badge">EN</span></button>
      </div>
    ` : `
      <div class="sec-card"><span class="sec-lab">🍽 MY PICKS</span>${dishesEN}</div>
      <div class="sec-card"><span class="sec-lab zhu">⚠️ MY NOTES</span><button class="edit-btn" onclick="orderEdit(${!orderEditing})">${orderEditing ? "Done ✓" : "✎ Edit"}</button>${notesEN}</div>
      <div class="order-cta">
        <button class="cta-main" onclick="waiterMode=true;renderOrder()">Show to waiter → <span class="lang-badge">CN</span></button>
      </div>
    `}`;
  el.scrollTop = keepScroll;
}

