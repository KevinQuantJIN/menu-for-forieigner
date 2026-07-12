/* ChopStory · S0 首页：画像面板 + 扫描/识别流程 */
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

/* ---------------- analyze flow：极简等待屏 + 真后端 NDJSON ---------------- */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function clearAnalyzeError() {
  const err = document.getElementById("anaErr");
  if (err) {
    err.classList.add("hidden");
    err.textContent = "";
  }
  const retry = document.getElementById("anaRetry");
  if (retry) retry.classList.add("hidden");
  const bar = document.getElementById("anaBar");
  if (bar) bar.style.width = "0%";
}

function showAnalyzeError(code) {
  analyzing = false;
  const status = document.getElementById("anaStatus");
  if (status) status.textContent = "";
  const err = document.getElementById("anaErr");
  if (err) {
    err.classList.remove("hidden");
    err.textContent = ERROR_COPY[code] || ERROR_COPY.upstream_error;
  }
  const retry = document.getElementById("anaRetry");
  if (retry) retry.classList.remove("hidden");
}

function renderAnaThumbs(urls) {
  const el = document.getElementById("anaThumbs");
  if (!el) return;
  if (!urls?.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const n = urls.length;
  el.innerHTML = urls.map((u, i) =>
    `<div><img src="${u}" alt="Page ${i + 1}"><span class="pg">${i + 1}/${n}</span></div>`
  ).join("");
  el.classList.remove("hidden");
}

async function startAnalyze(images) {
  if (analyzing) return;
  clearAnalyzeError();
  lastImages = images?.length ? images : lastImages;

  if (scanSource === "album") {
    const urls = lastPreviewUrls.length ? lastPreviewUrls : (images || lastImages);
    renderAnaThumbs(urls);
  } else {
    renderAnaThumbs([]);
  }

  go("analyzing");
  order.clear();
  streamed = [];
  analyzing = true;

  if (scanSource === "camera" && !images?.length) {
    await runDemoAnalyze();
    return;
  }
  try {
    if (!lastImages.length) {
      showAnalyzeError("invalid_images");
      return;
    }
    await streamDishes(lastImages);
  } catch {
    showAnalyzeError("upstream_error");
  }
}

async function runDemoAnalyze() {
  const status = document.getElementById("anaStatus");
  const bar = document.getElementById("anaBar");
  const phase = (txt, pct) => {
    if (status) status.textContent = txt;
    if (bar) bar.style.width = pct + "%";
  };
  phase("Looking at the photo", 18);
  await sleep(900);
  phase("Translating 14 dishes", 55);
  await sleep(900);
  phase("Checking your allergies", 85);
  await sleep(600);
  phase("Done", 100);
  await sleep(200);
  const src = (typeof DEMO_DISHES !== "undefined" ? DEMO_DISHES : DISHES);
  presentMenu(src.map(normalizeDish), "Chuanla Kitchen 川辣小馆");
}

async function streamDishes(images) {
  const status = document.getElementById("anaStatus");
  const bar = document.getElementById("anaBar");
  if (status) status.textContent = "Reading your menu…";
  if (bar) bar.style.width = "15%";

  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images }),
  });
  if (res.status === 400) {
    let code = "invalid_images";
    try { const j = await res.json(); if (j && j.code) code = j.code; } catch {}
    showAnalyzeError(code);
    return;
  }
  if (!res.ok || !res.body) {
    showAnalyzeError("upstream_error");
    return;
  }

  const collected = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawDone = false;
  let failed = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === "dish" && ev.data) {
        collected.push(normalizeDish(ev.data));
        const n = collected.length;
        if (status) status.textContent = `Found ${n} dishes…`;
        if (bar) bar.style.width = Math.min(90, 20 + n * 3) + "%";
      } else if (ev.type === "error") {
        failed = true;
        showAnalyzeError(ev.code || "upstream_error");
        try { reader.cancel(); } catch {}
        return;
      } else if (ev.type === "done") {
        sawDone = true;
      }
    }
  }
  if (buf.trim() && !failed) {
    try {
      const ev = JSON.parse(buf);
      if (ev.type === "dish" && ev.data) {
        collected.push(normalizeDish(ev.data));
        const n = collected.length;
        if (status) status.textContent = `Found ${n} dishes…`;
        if (bar) bar.style.width = Math.min(90, 20 + n * 3) + "%";
      }
      if (ev.type === "error") { showAnalyzeError(ev.code || "upstream_error"); return; }
      if (ev.type === "done") sawDone = true;
    } catch {}
  }
  if (failed) return;
  if (!collected.length && !sawDone) {
    showAnalyzeError("upstream_error");
    return;
  }
  if (status) status.textContent = "Done";
  if (bar) bar.style.width = "100%";
  await sleep(220);
  presentMenu(collected, scanSource === "album" ? "Your menu" : "Ma Wang Zi 马旺子");
}

function presentMenu(dishes, restoName) {
  analyzing = false;
  streamed = dishes.slice();
  currentCat = "All";
  document.getElementById("restoName").textContent = restoName;
  const meta = document.querySelector(".resto-bar .m");
  if (meta) {
    const pages = lastImages.length > 1 ? `${lastImages.length} pages · ` : "";
    meta.innerHTML = `${pages}<span id="dishCount">${streamed.length}</span> dishes`;
  } else {
    const dc = document.getElementById("dishCount");
    if (dc) dc.textContent = streamed.length;
  }
  renderCats();
  renderList(true);
  go("list");
}

function beginStream() {
  const src = (typeof DEMO_DISHES !== "undefined" ? DEMO_DISHES : DISHES);
  presentMenu(src.map(normalizeDish), "Chuanla Kitchen 川辣小馆");
}
