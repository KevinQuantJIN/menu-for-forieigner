/* Chopstory · S1/S2：菜单 list + 详情弹层 + 购物车条 */
/* ---------------- list rendering ---------------- */
function renderCats() {
  const count = c => c === "All" ? streamed.length
    : c === "⭐ Signature" ? streamed.filter(d => d.signature).length
    : streamed.filter(d => d.cat === c).length;
  document.getElementById("cats").innerHTML = CATS.filter(c => count(c) > 0).map(c =>
    `<button class="cat ${c===currentCat?"on":""}" onclick="setCat('${c}')">${c}<i>${count(c)}</i></button>`).join("");
}
function setCat(c) { currentCat = c; renderCats(); renderList(); }

function speak(cn, ev) {
  ev.stopPropagation();
  const u = new SpeechSynthesisUtterance(cn); u.lang = "zh-CN"; u.rate = .85;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function pcardHTML(d, i = 0, stagger = false) {
  const inOrder = order.get(d.id) || 0;
  return `<div class="pcard" style="--d:${stagger ? Math.min(i, 14) * 40 : 0}ms" onclick="openDetail(${d.id})">
    ${inOrder ? `<span class="qty-badge">×${inOrder}</span>` : ""}
    <button class="addbtn ${inOrder?"in":""}" onclick="event.stopPropagation();addToOrder(${d.id},1)">＋</button>
    <div class="pcard-top">
      <div>
        <div class="name">${d.emoji} ${d.name}</div>
        <div class="cn">${d.nameCn} · ${d.pinyin} <button class="speak" onclick="speak('${d.nameCn}',event)">🔊</button></div>
      </div>
      <div class="right price-dual"><b>≈ $${usdN(d.price)}</b><br><span>¥${d.price}</span></div>
    </div>
    <div class="tags">${d.spicy ? `<span class="tag tag-gray chili-tag">${"🌶".repeat(d.spicy)}</span>` : ""}${previewTags(d)}</div>
  </div>`;
}
let foldOpen = false;
function toggleFold() { foldOpen = !foldOpen; renderList(); }
function renderList(stagger = false) {
  const pool = streamed.filter(d => currentCat === "All" || (currentCat === "⭐ Signature" ? d.signature : d.cat === currentCat));
  const shown = [], folded = [];
  for (const d of pool) (personalHits(d).length ? folded : shown).push(d);
  let idx = 0, html = "";
  if (currentCat === "All") {
    /* All = whole menu, grouped with section headers (standard categories + original CN label) */
    for (const c of CATS) {
      if (c === "All" || c === "⭐ Signature") continue;
      const grp = shown.filter(d => d.cat === c);
      if (!grp.length) continue;
      html += `<div class="sechead" style="--d:${stagger ? idx * 40 : 0}ms"><b>${c}</b><span>${grp[0].catOriginal || ""}</span></div>`;
      html += grp.map(d => pcardHTML(d, ++idx, stagger)).join("");
    }
  } else {
    html = shown.map(d => pcardHTML(d, idx++, stagger)).join("");
  }
  document.getElementById("cards").innerHTML = html;
  const fb = document.getElementById("foldBar"), fw = document.getElementById("foldedCards");
  if (folded.length) {
    fb.classList.remove("hidden");
    const reasons = [...new Set(folded.flatMap(personalHits))].join(" · ");
    fb.innerHTML = `${foldOpen ? "▾" : "▸"} ${folded.length} dishes hidden for you<span class="why">${reasons} — tap to ${foldOpen ? "collapse" : "review"}</span>`;
    fw.classList.toggle("hidden", !foldOpen);
    fw.innerHTML = foldOpen ? folded.map(d => pcardHTML(d)).join("") : "";
  } else { fb.classList.add("hidden"); fw.classList.add("hidden"); fw.innerHTML = ""; }
  renderCartBar();
}

/* ---------------- detail ----------------
   Flavor bars 已移除（UI.md 7.12）：辣度 = 🌶 icon（价签/详情价格行），
   麻 numbing≥5 = Heads-up 标签；Heads-up 标签清单维护在 data.js（GENERIC_TAG / HIDDEN_RISK_LABEL） */
function openDetail(id) {
  const d = DISHES.find(x => x.id === id);
  const hits = personalHits(d);
  const qty = order.get(id) || 0;
  const LVL = { contains: `<span class="tag tag-red lvl">contains</span>`, may: `<span class="tag tag-amber lvl">may contain</span>` };
  const sheet = document.getElementById("detail-sheet");
  const keepScroll = !sheet.classList.contains("hidden") ? sheet.scrollTop : 0;
  sheet.innerHTML = `
    <div class="grabber"></div>
    <button class="dclose" onclick="closeDetail()" aria-label="Close">✕</button>
    <div class="hero">${d.emoji}</div>
    <div class="dname">${d.name}</div>
    <div class="dcn">${d.nameCn} · ${d.pinyin} <button class="speak" style="border:none;background:none;cursor:pointer;padding:6px" onclick="speak('${d.nameCn}',event)">🔊</button></div>
    ${d.cuisine ? `<div class="dcuisine">${d.cuisine}</div>` : ""}
    <div class="dprice price-dual"><b>≈ $${usdN(d.price)}</b> <span>· ¥${d.price} on menu</span> &nbsp;${d.spicy ? "🌶".repeat(d.spicy) : ""}</div>
    ${d.uncertain ? `<div class="uncertain-banner">🤔 Not sure about this one — we couldn't fully verify this dish. Confirm with staff.</div>` : ""}
    ${hits.length ? `<div class="uncertain-banner" style="background:var(--danger-bg);color:var(--danger)">⚠ Flagged for you: ${hits.join(", ")}</div>` : ""}
    <div class="quote">${d.desc}</div>
    <div class="dsec"><div class="gt">Main ingredients</div>
      <div class="ing-chips">${d.ingredients.map(i => `<span class="ing">${i}</span>`).join("")}</div></div>
    <div class="dsec"><div class="gt">Allergens</div>
      ${d.allergens.length ? d.allergens.map(a => `<div class="allergen-row">${ALLERGEN_LABEL[a.t]} ${LVL[a.l]}</div>`).join("") : `<div class="allergen-row" style="color:var(--muted)">None flagged for the typical recipe</div>`}
    </div>
    ${d.textures.length || (d.hiddenRisks||[]).length || (d.flavorBars && d.flavorBars.numbing >= 5) ? `<div class="dsec"><div class="gt">Heads-up</div>
      <div class="ing-chips">${(d.flavorBars && d.flavorBars.numbing >= 5) ? `<span class="ing">⚡ tingling 麻 — Sichuan pepper buzz</span>` : ""}
      ${d.textures.map(t => `<span class="ing">${GENERIC_TAG[t]}</span>`).join("")}
      ${(d.hiddenRisks||[]).map(h => `<span class="ing">${HIDDEN_RISK_LABEL[h] || h}</span>`).join("")}</div></div>` : ""}
    ${d.story || d.howToEat ? `<div class="dsec"><div class="gt">The story</div>
      ${d.story ? `<p class="story">${d.story}</p>` : ""}
      ${d.howToEat ? `<p class="story"><b>How to eat:</b> ${d.howToEat}</p>` : ""}</div>` : ""}
    <div class="detail-cta">
      ${qty ? `<div class="stepper"><button onclick="addToOrder(${d.id},-1);openDetail(${d.id})">−</button><b>${qty}</b><button onclick="addToOrder(${d.id},1);openDetail(${d.id})">＋</button></div>`
            : `<button class="btn" onclick="addToOrder(${d.id},1);openDetail(${d.id})">Add to order · ≈ $${usdN(d.price)}</button>`}
    </div>`;
  document.getElementById("detail-mask").classList.remove("hidden");
  sheet.classList.remove("hidden");
  sheet.scrollTop = keepScroll;
}
function closeDetail() {
  document.getElementById("detail-mask").classList.add("hidden");
  document.getElementById("detail-sheet").classList.add("hidden");
}

