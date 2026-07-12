/* ChopStory · S4：历史 + ECharts 食迹地图 */
/* ---------------- history ---------------- */
function histView(v) {
  document.getElementById("ht-list").classList.toggle("on", v === "list");
  document.getElementById("ht-map").classList.toggle("on", v === "map");
  document.getElementById("hist-list").classList.toggle("hidden", v !== "list");
  document.getElementById("foodmap").classList.toggle("hidden", v !== "map");
  if (v === "map") renderChinaMap();
}

/* ---------------- Food Map: ECharts China map, 中国风 (lazy-loaded) ----------------
   Lib: Apache ECharts via CDN · Map data: Aliyun DataV GeoJSON (free, no key)
   风格：宣纸底 + 墨线省界 + 吃过的省份整块点亮（朱砂赭色）+ 城市涟漪点
   Offline / CDN failure → falls back to the CSS pixel map (#map-fallback). */
const VISITS = [
  { city:"Chengdu", cn:"成都", coord:[104.07,30.67], emoji:"🍜", restoEn:"Ma Wang Zi", restoCn:"马旺子", date:"TODAY" },
  { city:"Beijing", cn:"北京", coord:[116.40,39.90], emoji:"🦆", restoEn:"Siji Minfu", restoCn:"四季民福", date:"JUL 09" },
];
const LIT_PROVINCES = ["四川省", "北京市"]; // 按省点亮（与 VISITS 城市对应）
const OTHER_CITIES = [
  ["Shanghai",121.47,31.23],["Guangzhou",113.26,23.13],["Shenzhen",114.06,22.54],["Xi'an",108.94,34.34],
  ["Chongqing",106.55,29.56],["Hangzhou",120.15,30.27],["Kunming",102.83,24.88],["Guilin",110.29,25.27],
  ["Harbin",126.53,45.80],["Lhasa",91.11,29.97],["Urumqi",87.62,43.83],["Qingdao",120.38,36.07],
  ["Xiamen",118.09,24.48],["Dali",100.27,25.61],["Wuhan",114.31,30.59],["Changsha",112.94,28.23],
];
function chinaGeoOption(interactive) {
  return {
    map: "china", roam: interactive, zoom: interactive ? 1.6 : 2.4, center: interactive ? [105, 33] : [105, 32],
    itemStyle: { areaColor: "#ece3cc", borderColor: "rgba(38,32,25,.35)", borderWidth: .6 },
    emphasis: { disabled: true }, select: { disabled: true }, label: { show: false },
    regions: LIT_PROVINCES.map(n => ({ name: n, itemStyle: { areaColor: "#b23a2f", borderColor: "#7e241c", borderWidth: 1 } })),
  };
}
let chinaAssets = null; // Promise<bool>
function ensureChinaAssets() {
  if (chinaAssets) return chinaAssets;
  chinaAssets = (async () => {
    try {
      if (!window.echarts) await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
      const geo = await (await fetch("https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json")).json();
      echarts.registerMap("china", geo);
      return true;
    } catch { return false; }
  })();
  return chinaAssets;
}
let fullMapInit = false, homeMapInit = false;
async function renderChinaMap() { // 全屏地图（可拖拽缩放，去过的点常显小卡片：店名+日期）
  if (fullMapInit) return;
  const ok = await ensureChinaAssets();
  if (!ok) {
    document.getElementById("chinamap").classList.add("hidden");
    document.getElementById("map-fallback").classList.remove("hidden");
    return;
  }
  fullMapInit = true;
  const chart = echarts.init(document.getElementById("chinamap"));
  chart.setOption({
    backgroundColor: "transparent",
    geo: chinaGeoOption(true),
    series: [
      { type: "scatter", coordinateSystem: "geo", symbolSize: 4, silent: true,
        itemStyle: { color: "#b9ad97" },
        data: OTHER_CITIES.map(c => ({ name: c[0], value: [c[1], c[2]] })) },
      { type: "effectScatter", coordinateSystem: "geo", symbolSize: 9, zlevel: 2, silent: true,
        rippleEffect: { brushType: "stroke", scale: 3.4, period: 4 },
        itemStyle: { color: "#7e241c" },
        data: VISITS.map(v => ({ name: v.city, value: v.coord })) },
    ],
  });
  /* 拍立得小卡（map-card-lab 方案A）：ECharts label 画不出白框+底部三角，
     改用 HTML overlay，convertToPixel 定位，拖拽/缩放时跟随坐标点 */
  const wrap = document.getElementById("map-pins");
  wrap.innerHTML = VISITS.map((v, i) => `
    <div class="map-pola" id="map-pin-${i}" style="--rot:${i % 2 ? "2.5deg" : "-3deg"}">
      <div class="ph">${v.emoji}</div>
      <div class="nm">${v.restoEn}<br>${v.restoCn}</div>
      <div class="dt">${v.date}</div>
    </div>`).join("");
  const place = () => VISITS.forEach((v, i) => {
    const [x, y] = chart.convertToPixel("geo", v.coord);
    const el = document.getElementById("map-pin-" + i);
    el.style.left = x + "px"; el.style.top = y + "px";
  });
  chart.on("georoam", place);
  place(); // convertToPixel 在 setOption 后即可用（涟漪动画常驻，"finished" 永不触发，不能依赖它）
}
async function renderHomeMap() { // 首页迷你预览（静态，点击进全屏）
  if (homeMapInit) return;
  const ok = await ensureChinaAssets();
  if (!ok) return; // 保留 #home-map-fb 的文字兜底
  homeMapInit = true;
  document.getElementById("home-map-fb").classList.add("hidden");
  echarts.init(document.getElementById("homechinamap")).setOption({
    backgroundColor: "transparent",
    geo: chinaGeoOption(false),
    series: [{ type: "effectScatter", coordinateSystem: "geo", symbolSize: 6, silent: true, zlevel: 2,
      rippleEffect: { brushType: "stroke", scale: 3, period: 4 },
      itemStyle: { color: "#7e241c" },
      data: VISITS.map(v => ({ name: v.city, value: v.coord })) }],
  });
}

