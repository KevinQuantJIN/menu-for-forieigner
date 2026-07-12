/* =====================================================================
   ChopStory — interactive UI prototype (mock data, no backend)
   Backend hookup later: replace streamDishes() with fetch('/api/analyze')
   reading NDJSON events {type:'dish',data}|{type:'done'} — same shapes.
   ===================================================================== */

/* 共享层：画像/个性化/全局状态/导航 —— 改动需协调 */
const parsePrice = (p) => {
  if (p == null || p === "") return 0;
  if (typeof p === "number") return p;
  const m = String(p).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
};
const priceLabel = (p) => {
  if (p == null || p === "") return "—";
  if (typeof p === "number") return String(p);
  return String(p).replace(/^¥\s*/, "");
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

/* ---------------- profile (Jake defaults: peanut allergy, mild spice) ---------------- */
let profile = JSON.parse(localStorage.getItem("ml.profile") || "null") || {
  /* demo defaults（7.14）：填满过敏/忌口，让服务员视图开箱即丰富——仅展示用 */
  allergens: ["peanut"], avoid: ["cilantro", "offal"], spice: 1,
};
if (profile.allergens) {
  profile.allergens = [...new Set(profile.allergens.map((a) =>
    (a === "crustacean" || a === "mollusk") ? "shellfish" : a
  ))];
}
const ALLERGEN_LABEL = {
  peanut:"Peanut", tree_nut:"Tree nut", shellfish:"Shellfish", gluten:"Gluten",
  soy:"Soy", egg:"Egg", dairy:"Dairy", sesame:"Sesame", fish:"Fish",
  crustacean:"Shellfish", mollusk:"Shellfish",
};
const AVOID_LABEL = { offal:"Organ meats", cilantro:"Cilantro", bone_in:"On the bone", fatty:"Fatty pork", whole_head:"Whole fish head", chicken_feet:"Chicken feet" };
const ALLERGEN_CN = {
  peanut:"花生", tree_nut:"坚果", shellfish:"虾蟹贝类", gluten:"麸质（面筋）",
  soy:"大豆", egg:"鸡蛋", dairy:"奶制品", sesame:"芝麻", fish:"鱼类",
  crustacean:"虾蟹类", mollusk:"贝类",
};
const AVOID_CN = { offal:"内脏", cilantro:"香菜", bone_in:"带骨的肉", fatty:"肥肉", whole_head:"整鱼", chicken_feet:"鸡爪" };
const ERROR_COPY = {
  not_a_menu: "That doesn't look like a menu photo. Try again with a clearer shot of the menu.",
  unreadable: "We couldn't read that photo clearly. Better light and a flatter page help.",
  upstream_error: "Something went wrong on our side. Please retry.",
  invalid_images: "That image couldn't be used. Try another photo.",
  invalid_json: "Something went wrong on our side. Please retry.",
  too_many_images: "Too many photos — please send up to 9.",
};
/* order-page requests — user picks in English, waiter view shows Chinese */
const REQ_DEFS = [
  { k:"mild",        en:"🌶 Mild spice",  cn:"请做微辣" },
  { k:"no_spice",    en:"🚫 No spice",    cn:"完全不要辣" },
  { k:"no_cilantro", en:"🌿 No cilantro", cn:"不要香菜" },
  { k:"less_oil",    en:"🫗 Less oil",    cn:"请少油" },
  { k:"no_msg",      en:"🧂 No MSG",      cn:"不要味精" },
];
let requests = null; // lazily seeded from profile on first order view
function seedRequests() {
  if (requests) return;
  requests = new Set();
  if (profile.spice <= 1) requests.add("mild");
  if (profile.avoid.includes("cilantro")) requests.add("no_cilantro");
  requests.add("less_oil"); // demo default（7.14，仅展示用）
}
function toggleReq(k) { requests.has(k) ? requests.delete(k) : requests.add(k); renderOrder(); }
/* Heads-up section edit mode (order page §3) */
let orderEditing = false;
let customNote = "Not too salty, please（口味清淡一点）"; // demo default（7.14，双语让两面都读得通）
function toggleProfileItem(group, v) {
  const arr = profile[group];
  const i = arr.indexOf(v);
  i >= 0 ? arr.splice(i, 1) : arr.push(v);
  renderOrder();
}
function orderEdit(on) {
  orderEditing = on;
  if (!on) { // Done: persist + refresh everything that depends on the profile
    localStorage.setItem("ml.profile", JSON.stringify(profile));
    renderProfileStrip();
    if (streamed.length) renderList();
  }
  renderOrder();
}

/* ---------------- personalization ---------------- */
function textureKey(t) {
  const s = String(t).toLowerCase();
  if (/offal|organ|tripe|lung|肚|内脏/.test(s)) return "offal";
  if (/bone|带骨/.test(s)) return "bone_in";
  if (/fatty|肥|wobbly/.test(s)) return "fatty";
  if (/whole.?head|whole fish|整鱼/.test(s)) return "whole_head";
  if (/chicken.?feet|鸡爪|凤爪/.test(s)) return "chicken_feet";
  if (/cilantro|香菜/.test(s)) return "cilantro";
  return null;
}
function textureLabel(t) {
  const k = textureKey(t);
  if (k && AVOID_LABEL[k]) return AVOID_LABEL[k];
  const known = {
    offal:"🫀 organ meats", "organ meats":"🫀 organ meats",
    bone_in:"🦴 on the bone", "on the bone":"🦴 on the bone",
    fatty:"🥓 fatty cut", "fatty pork":"🥓 fatty cut",
    whole_head:"🐟 whole head", "chicken feet":"🐔 chicken feet",
    "century egg":"🥚 century egg", "fishy herb":"🌿 fishy herb — dare?",
    "usually has minced pork":"🍖 usually has minced pork",
  };
  const low = String(t).toLowerCase();
  return known[low] || known[t] || ("· " + t);
}
function personalHits(d) {
  const hits = [];
  for (const a of d.allergens) {
    if (a.level === "contains" && profile.allergens.includes(a.type)) {
      hits.push("contains " + (ALLERGEN_LABEL[a.type] || a.type).toLowerCase());
    }
  }
  for (const t of d.textures) {
    const k = textureKey(t);
    if (k && profile.avoid.includes(k)) hits.push((AVOID_LABEL[k] || t).toLowerCase());
  }
  return hits;
}
const GENERIC_TAG = { offal:"🫀 organ meats", whole_head:"🐟 whole head", bone_in:"🦴 on the bone", fatty:"🥓 fatty cut", chicken_feet:"🐔 chicken feet", century_egg:"🥚 century egg", fishy_herb:"🌿 fishy herb — dare?" };
const HIDDEN_RISK_LABEL = { meat_broth:"🍲 made with meat broth", minced_pork:"🍖 usually has minced pork & dried shrimp" };
function previewTags(d) {
  const tags = [];
  const hits = personalHits(d);
  if (hits.length) tags.push(`<span class="tag tag-red">⚠ ${esc(hits[0])}</span>`);
  for (const t of d.textures) {
    if (tags.length >= 2) break;
    const k = textureKey(t);
    if (k && profile.avoid.includes(k)) continue;
    tags.push(`<span class="tag tag-gray">${esc(textureLabel(t))}</span>`);
  }
  if (tags.length < 2 && d.vegetarian) tags.push(`<span class="tag tag-green">🌱 vegetarian</span>`);
  if (tags.length < 2 && d.signature) tags.push(`<span class="tag tag-amber">👑 signature</span>`);
  return tags.join("");
}

/* ---------------- state ---------------- */
const order = new Map(); // id -> qty
let currentCat = "All";
let streamed = []; // dishes revealed so far
let waiterMode = false;
let waiterSeen = false; // guide banner shows until the user has switched to For waiter once
let scanSource = "camera"; // camera → mock 菜单纸；album → 真实菜单照片
let lastImages = [];
let lastPreviewUrls = [];
let analyzing = false;

/* ---------------- navigation ---------------- */
function go(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById("s-" + name).classList.remove("hidden");
  document.getElementById("s-" + name).scrollTop = 0;
}
function startScan(src) {
  scanSource = src;
  if (src === "album") pickAlbum();
  else go("camera");
}
function pickAlbum() {
  const input = document.getElementById("albumInput");
  if (!input) return;
  input.value = "";
  input.click();
}
function clearPreviewUrls() {
  for (const u of lastPreviewUrls) {
    try { URL.revokeObjectURL(u); } catch {}
  }
  lastPreviewUrls = [];
}
function showOrig() {
  const paper = document.getElementById("orig-paper");
  const gallery = document.getElementById("orig-gallery");
  const photo = document.getElementById("orig-photo");
  const urls = lastPreviewUrls.length ? lastPreviewUrls : lastImages;
  const hasAlbum = scanSource === "album" && urls.length > 0;
  paper.classList.toggle("hidden", hasAlbum);
  gallery.classList.toggle("hidden", !hasAlbum);
  if (photo) photo.classList.add("hidden");
  if (hasAlbum) {
    gallery.innerHTML = urls.map((u, i) =>
      `<img src="${u}" alt="Menu page ${i + 1}">`
    ).join("");
  } else {
    gallery.innerHTML = "";
  }
  document.getElementById("orig-mask").classList.remove("hidden");
}
function closeOrig(ev) {
  if (ev && ev.target !== document.getElementById("orig-mask") && ev.target?.tagName !== "BUTTON") return;
  document.getElementById("orig-mask").classList.add("hidden");
}

async function compressBlob(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.8);
}
async function compressFiles(files) {
  const list = [...files].slice(0, 9);
  const out = [];
  for (const file of list) {
    if (!file || !String(file.type || "").startsWith("image/")) continue;
    out.push(await compressBlob(file));
  }
  return out;
}
async function onAlbumSelected(ev) {
  const files = ev.target?.files;
  if (!files || !files.length) return;
  scanSource = "album";
  clearPreviewUrls();
  lastPreviewUrls = [...files].slice(0, 9).map((f) => URL.createObjectURL(f));
  try {
    const images = await compressFiles(files);
    if (!images.length) {
      lastImages = [];
      go("analyzing");
      return;
    }
    lastImages = images;
    await startAnalyze(images);
  } catch {
    go("analyzing");
  }
}

document.getElementById("albumInput")?.addEventListener("change", onAlbumSelected);
