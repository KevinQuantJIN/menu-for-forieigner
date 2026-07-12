/* =====================================================================
   Chopstory — interactive UI prototype (mock data, no backend)
   Backend hookup later: replace streamDishes() with fetch('/api/analyze')
   reading NDJSON events {type:'dish',data}|{type:'done'} — same shapes.
   ===================================================================== */

/* 共享层：画像/个性化/全局状态/导航 —— 改动需协调 */
/* ---------------- profile (Jake defaults: peanut allergy, mild spice) ---------------- */
let profile = JSON.parse(localStorage.getItem("ml.profile") || "null") || {
  allergens: ["peanut"], avoid: [], spice: 1,
};
const ALLERGEN_LABEL = { peanut:"Peanut", tree_nut:"Tree nut", crustacean:"Shrimp/Crab", mollusk:"Shellfish", gluten:"Gluten", soy:"Soy", egg:"Egg", dairy:"Dairy", sesame:"Sesame", fish:"Fish" };
const AVOID_LABEL = { offal:"Organ meats", cilantro:"Cilantro", bone_in:"On the bone", fatty:"Fatty pork", whole_head:"Whole fish head", chicken_feet:"Chicken feet" };
const ALLERGEN_CN = { peanut:"花生", tree_nut:"坚果", crustacean:"虾蟹类", mollusk:"贝类", gluten:"麸质（面筋）", soy:"大豆", egg:"鸡蛋", dairy:"奶制品", sesame:"芝麻", fish:"鱼类" };
const AVOID_CN = { offal:"内脏", cilantro:"香菜", bone_in:"带骨的肉", fatty:"肥肉", whole_head:"整鱼", chicken_feet:"鸡爪" };
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
}
function toggleReq(k) { requests.has(k) ? requests.delete(k) : requests.add(k); renderOrder(); }
/* Heads-up section edit mode (order page §3) */
let orderEditing = false;
let customNote = "";
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
function personalHits(d) {
  const hits = [];
  for (const a of d.allergens) if (a.l === "contains" && profile.allergens.includes(a.t)) hits.push("contains " + ALLERGEN_LABEL[a.t].toLowerCase());
  for (const t of d.textures) if (profile.avoid.includes(t)) hits.push(AVOID_LABEL[t].toLowerCase());
  return hits;
}
const GENERIC_TAG = { offal:"🫀 organ meats", whole_head:"🐟 whole head", bone_in:"🦴 on the bone", fatty:"🥓 fatty cut", chicken_feet:"🐔 chicken feet", century_egg:"🥚 century egg", fishy_herb:"🌿 fishy herb — dare?" };
const HIDDEN_RISK_LABEL = { meat_broth:"🍲 made with meat broth", minced_pork:"🍖 usually has minced pork & dried shrimp" };
function previewTags(d) {
  const tags = [];
  const hits = personalHits(d);
  if (hits.length) tags.push(`<span class="tag tag-red">⚠ ${hits[0]}</span>`);
  for (const t of d.textures) { if (tags.length >= 2) break; if (!profile.avoid.includes(t)) tags.push(`<span class="tag tag-gray">${GENERIC_TAG[t]}</span>`); }
  if (tags.length < 2 && d.veg) tags.push(`<span class="tag tag-green">🌱 vegetarian</span>`);
  if (tags.length < 2 && d.signature) tags.push(`<span class="tag tag-amber">👑 signature</span>`);
  if (tags.length < 2 && d.uncertain) tags.push(`<span class="tag tag-amber">🤔 not sure</span>`);
  return tags.join("");
}

/* ---------------- state ---------------- */
const order = new Map(); // id -> qty
let currentCat = "All";
let streamed = []; // dishes revealed so far
let waiterMode = false;
let waiterSeen = false; // guide banner shows until the user has switched to For waiter once

/* ---------------- navigation ---------------- */
function go(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById("s-" + name).classList.remove("hidden");
  document.getElementById("s-" + name).scrollTop = 0;
}
let scanSource = "camera"; // camera → mock 菜单纸；album → 真实菜单照片
function startScan(src) {
  scanSource = src;
  if (src === "album") startAnalyze(); // 从相册选：跳过取景，直接进识别
  else go("camera");
}
function showOrig() {
  document.getElementById("orig-paper").classList.toggle("hidden", scanSource === "album");
  document.getElementById("orig-photo").classList.toggle("hidden", scanSource !== "album");
  document.getElementById("orig-mask").classList.remove("hidden");
}

