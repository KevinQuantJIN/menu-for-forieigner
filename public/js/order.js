/* Chopstory · S3：点单状态 + 双面点菜卡 */
/* ---------------- order ---------------- */
function addToOrder(id, delta) {
  const q = (order.get(id) || 0) + delta;
  if (q <= 0) order.delete(id); else order.set(id, q);
  if (!document.getElementById("s-list").classList.contains("hidden")) renderList();
  renderCartBar();
}
function orderTotal() { let t = 0; for (const [id,q] of order) t += DISHES.find(d => d.id === id).price * q; return t; }
function renderCartBar() {
  /* persistent bar — always visible on the list so "My Order" is one tap away */
  const n = [...order.values()].reduce((a,b) => a+b, 0);
  const sum = document.getElementById("cartSum");
  if (!n) sum.innerHTML = `<span style="opacity:.72">Pick dishes to build your order</span>`;
  else sum.textContent = `🧾 ${n} dish${n>1?"es":""} · ≈ $${usdN(orderTotal())} · ¥${orderTotal()}`;
}
function openOrder() { waiterMode = false; renderOrder(); go("order"); }
function renderOrder() {
  const items = [...order.entries()].map(([id,q]) => ({ d: DISHES.find(x => x.id === id), q }));
  const el = document.getElementById("s-order");
  seedRequests();
  if (waiterMode) { waiterSeen = true; orderEditing = false; }
  const n = items.reduce((a,x) => a + x.q, 0);
  const total = orderTotal();
  const reqSel = REQ_DEFS.filter(r => requests.has(r.k));
  const allergenEN = profile.allergens.map(a => ALLERGEN_LABEL[a]).join(", ");
  const allergenCN = profile.allergens.map(a => ALLERGEN_CN[a]).join("、");
  const avoidEN = profile.avoid.map(a => AVOID_LABEL[a]).join(", ");
  const avoidCN = profile.avoid.map(a => AVOID_CN[a]).join("、");
  const keepScroll = el.scrollTop;
  /* bilingual card note — same block on both faces (user AND waiter read it) */
  const NOTE = `<div class="onote">🧾 <b>This is an order card — the guest's picks, translated into Chinese.</b>这是一张点菜卡：顾客已选好以上菜品，请您确认后下单，谢谢！</div>`;

  /* §2 dishes — one container card with its own empty state; total is a small
     footnote (it's for the guest, not the waiter — dish names are the point) */
  const dishesEN = items.length
    ? items.map(({d,q}) => `<div class="orow"><b>${d.emoji} ${d.name}<small>${d.nameCn} · ${d.pinyin}</small></b><span class="q">×${q}</span><span class="price-dual"><span>≈ $${usdN(d.price*q)}</span></span></div>`).join("")
      + `<div class="total-sm">Total ≈ $${usdN(total)} · ¥${total}</div>`
    : `<div class="sec-empty"><span class="e">🍽️</span>No dishes yet — browse the menu and tap ＋<br><button class="edit-btn" style="margin-top:10px" onclick="go('list')">Browse the menu</button></div>`;
  const dishesCN = items.length
    ? items.map(({d,q}) => `<div class="orow"><b>${d.nameCn}<small>${d.name}</small></b><span class="q">×${q}</span><span>¥${d.price*q}</span></div>`).join("")
      + `<div class="total-sm">合计 ¥${total}</div>`
    : `<div class="sec-empty"><span class="e">🍽️</span>还没有选菜</div>`;

  /* §3 heads-up — allergy / avoid / requests / free note, each with its own
     empty state; one Edit button governs the whole card */
  const chipRow = (defs, group) => Object.entries(defs).map(([k, l]) =>
    `<button class="chip ${profile[group].includes(k) ? "on" : ""}" onclick="toggleProfileItem('${group}','${k}')">${l}</button>`).join("");
  const headsUpEN = orderEditing ? `
      <div class="chip-group"><div class="gt">Allergies</div><div class="chips">${chipRow(ALLERGEN_LABEL, "allergens")}</div></div>
      <div class="chip-group"><div class="gt">I'd rather avoid</div><div class="chips">${chipRow(AVOID_LABEL, "avoid")}</div></div>
      <div class="chip-group"><div class="gt">Requests</div><div class="chips">${REQ_DEFS.map(r => `<button class="chip ${requests.has(r.k)?"on":""}" onclick="toggleReq('${r.k}')">${r.en}</button>`).join("")}</div></div>
      <div class="chip-group"><div class="gt">Anything else</div><input class="note-input" placeholder="e.g. no raw garlic please" value="${customNote.replace(/"/g,"&quot;")}" onchange="customNote=this.value"></div>
    ` : `
      <div class="note-row danger"><span class="k">⚠️ Allergies</span><span class="v ${allergenEN?"":"none"}">${allergenEN || "None set — tap Edit"}</span></div>
      <div class="note-row"><span class="k">🙅 Avoid</span><span class="v ${avoidEN?"":"none"}">${avoidEN || "Nothing marked"}</span></div>
      <div class="note-row"><span class="k">📝 Requests</span><span class="v ${reqSel.length?"":"none"}">${reqSel.map(r => r.en.replace(/^\S+ /, "")).join(" · ") || "No requests"}</span></div>
      ${customNote ? `<div class="note-row"><span class="k">💬 Note</span><span class="v">${customNote}</span></div>` : ""}
    `;
  const headsUpCN = `
      <div class="note-row danger"><span class="k">⚠️ 过敏</span><span class="v ${allergenCN?"":"none"}">${allergenCN ? `我对<b>${allergenCN}</b>严重过敏，请确保菜品和烹饪用油中不含以上成分` : "无"}</span></div>
      <div class="note-row"><span class="k">🙅 忌口</span><span class="v ${avoidCN?"":"none"}">${avoidCN ? `尽量不要${avoidCN}` : "无"}</span></div>
      <div class="note-row"><span class="k">📝 备注</span><span class="v ${(reqSel.length||customNote)?"":"none"}">${[reqSel.map(r => r.cn).join("；"), customNote].filter(Boolean).join("；另外：") || "无"}</span></div>
    `;

  el.className = "screen" + (waiterMode ? " waiter" : "");
  /* both faces render the SAME section order: greeting → dishes card → heads-up card → note */
  el.innerHTML = `
    <div class="topbar">
      <button class="back" onclick="go('list')">‹</button>
      <div class="otabs">
        <button class="otab ${!waiterMode?"on":""}" onclick="waiterMode=false;renderOrder()">For me<span class="s">English · $</span></button>
        <button class="otab ${waiterMode?"on":""}" onclick="waiterMode=true;renderOrder()">For waiter<span class="s">中文 · ¥</span></button>
      </div>
    </div>
    ${!waiterMode && !waiterSeen ? `<div class="guide-banner" onclick="waiterMode=true;renderOrder()"><span>Done choosing? Switch to <b>For waiter</b> and hand your phone over</span><span class="arr">→</span></div>` : ""}
    ${waiterMode ? `
      <div class="bubble">您好！我想点以下这些菜 🙏</div>
      <div class="sec-card"><div class="sec-head"><span class="gt">已选菜品</span><span class="gt">${n ? n + " 道" : ""}</span></div>${dishesCN}</div>
      <div class="sec-card"><div class="sec-head"><span class="gt">请注意</span></div>${headsUpCN}</div>
      ${NOTE}
    ` : `
      <div class="bubble">Hello! I'd like to order the following, please.</div>
      <div class="sec-card"><div class="sec-head"><span class="gt">My picks</span><span class="gt">${n ? n + " items" : ""}</span></div>${dishesEN}</div>
      <div class="sec-card"><div class="sec-head"><span class="gt">Heads-up for the kitchen</span><button class="edit-btn" onclick="orderEdit(${!orderEditing})">${orderEditing ? "Done ✓" : "✎ Edit"}</button></div>${headsUpEN}</div>
      ${NOTE}
    `}`;
  el.scrollTop = keepScroll;
}

