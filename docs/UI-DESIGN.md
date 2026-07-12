# MenuLens — UI 设计规范（One Page）· 雕版食单版

> ⚠️ 同步副本（2026-07-13），源文件在 Julia 的 Hackathon 工作区，以源为准。


> 给所有做 UI 的 AI / 人的唯一样式事实来源。改样式先改这里，再改代码。
> 产品定义看 `PRD.md`；demo 菜品清单看 `demo-data/demo-menu-plan.md`；本文只管「长什么样、怎么动」。
> 2026-07-12 定稿：**主题 = 方案一「雕版食单」**（见 `ui-lab/style-lab-v2.html`），备选 =「大排档招牌」（见文末）。
> ✅ `public/app.html`（ui-prototype 分支，commit 01aa24f）**已完成主题迁移**（纯换肤，逻辑零改动），品牌已更为 Chopstory。后续改 UI 直接以 app.html 为现行基准。

## 新 AI 开工包（给我这些就能开始干活）

1. 本文件全文
2. `PRD.md` 中你负责那一屏的章节（S0–S4）
3. `ui-lab/style-lab-v2.html` 方案一的 mockup（视觉基准）+ 现行 `public/` 代码（交互基准）
4. 约束：无构建、无框架、无外部字体（普通 `<link>`/`<script src>` 多文件，file:// 双击可开）；改完在 393px 宽截图验证；落地后回写 PRD 对应章节

## 模块结构与认领规则（2026-07-12 拆分，commit 1c1b14a）

| 文件 | 管什么 | 谁能改 |
|---|---|---|
| `public/app.html` | HTML 骨架 + 引入清单 | ⚠️ 动之前群里说一声 |
| `css/tokens.css` | tokens/基础组件/弹层/chips | ⚠️ 只按本规范改，单一负责人 |
| `js/core.js` | 画像/个性化/全局状态/导航 | ⚠️ 改动需协调 |
| `js/data.js` | 汇率 + 14 道菜 + 文案标签常量 | 内容改动走这里 |
| `css/home.css` + `js/home.js` | S0 首页/相机/识别中/画像面板 | 认领后自由改 |
| `css/menu.css` + `js/menu.js` | S1 list + S2 详情弹层 + 购物车条 | 认领后自由改 |
| `css/order.css` + `js/order.js` | S3 点单卡双面 | 认领后自由改 |
| `css/map.css` + `js/map.js` | S4 历史 + 食迹地图 | 认领后自由改 |
| `public/stage.html`（及 stage-*.html 探索稿） | 舞台壳：背景/展示文案/跳屏时间轴 | 已认领（舞台线，Claude 单独迭代） |

**协作纪律**：① 只改自己认领的文件；② 改完当轮就 commit + push（冲突大多来自攒着不提交）；③ 动 ⚠️ 文件先协调；④ `stage.html` 舞台壳已被认领单独迭代；它跨 iframe 依赖 app 的全局函数 `go / startScan / startAnalyze / beginStream / openDetail / openOrder / addToOrder / histView / closeDetail / closeSheet`——改名或删除前先和舞台线同步。

## 设计立场：这是一册木刻印刷的食单

- **范式**：印刷品，不是 app 卡片堆。层级靠**线条工艺**，不靠阴影和色块
- **反 AI 纪律**（不可破）：禁纯黑（一律苍墨）、禁高饱和荧光、禁「白底+大圆角+浅阴影」万能卡、数字全部等宽、允许微小不齐（印章/贴纸微旋转 = Imperfect by Design）
- **朱红永不铺面**：只做印章、警示、关键动作，面积越小越贵
- **文化细节每屏 ≤1 处**：印章 / 鱼尾节标 / 点线引导，其余保持 HIG 简洁

## Design Tokens

```css
/* 色板 — 纸墨朱三色系统（+茶笺灰阶） */
--paper: #f7f2e6;      /* 纸白 · 页面底（唯一底色，无第二底色） */
--paper-2: #f3ecdb;    /* 笺色 · 地图/嵌入面 */
--ink: #262019;        /* 苍墨 · 主文字/主线条/主按钮（禁 #000） */
--ink-2: #4c4437;      /* 墨二 · 次级文字 */
--ink-3: #75695a;      /* 墨三 · 辅助文字（正文最浅） */
--ink-4: #b9ad97;      /* 墨四 · 失效/点线 */
--tea: #ece3cc;        /* 茶笺 · 填充面/未点亮省块 */
--zhu: #b23a2f;        /* 朱印 · 印章/警示/主行动，全局唯一彩色 */
--zhu-deep: #7e241c;   /* 朱印边 */
/* 语义（低饱和，禁荧光） */
--sem-warn: #8f6e1f;  --sem-warn-bg: #f3e9c9;   /* may contain / signature */
--sem-green: #5c7d46; --sem-green-bg: #e9edd8;  /* vegetarian */
/* contains 红 = 直接用 --zhu，语义与印章同源 */

/* 线条（本体系的核心，代替阴影分层） */
--rule-hair: 1px solid rgba(38,32,25,.22);   /* 发丝线 · 行分隔 */
--rule-mid: 1.5px solid var(--ink);          /* 中线 · 小框/按钮描边 */
--rule-heavy: 2.5px solid var(--ink);        /* 重线 · 大区块界线 */
--leader: 2px dotted rgba(38,32,25,.4);      /* 引导点线 · 菜名⋯价格 */

/* 圆角：印刷体系用小切角，禁大圆角 */
--r-btn: 5px; --r-tagpill: 999px（仅语义 tag 可胶囊）; 其余 0–6px;

/* 动效沿用：quart-out cubic-bezier(.25,1,.5,1) · 140/260ms · 只动 transform/opacity */
/* 阴影：原则性禁用。仅悬浮层（bottom sheet / 地图餐厅卡）允许 1.5px 墨框替代阴影 */
```

**纸纹颗粒**（全局必挂，墙感/纸感的来源）：
```css
.grain::after { content:""; position:absolute; inset:0; pointer-events:none; mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/><feColorMatrix type='saturate' values='0'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='.045'/></svg>"); }
```

## 字体

- **标题/刊头/地图/计数**：`"Songti SC","STSong",Georgia,serif`（宋体，中英混排都用它；英文落 Georgia 有书卷味）
- **正文/操作**：`"PingFang SC",-apple-system,sans-serif`
- **印章内文**：`"Kaiti SC","STKaiti",serif`（楷体）
- **所有数字/价格/时间**：`font-variant-numeric: tabular-nums` + `ui-monospace` 优先
- 中文刊头字距 `.15–.25em`（「食 迹 · MY FOOD STORY」）；英文标题不放大嗓门，靠衬线与下划线立层级
- 强调下划线：`box-shadow: inset 0 -2.5px 0 var(--zhu)`（朱线托底，不用 text-decoration）

## 线条与框（核心工艺，逐条照抄）

| 工艺 | 规格 | 用在哪 |
|---|---|---|
| **文武边**（外粗内细双线框） | `border:2.5px solid ink` + `outline:1px solid ink; outline-offset:-6.5px` | 地图容器、大区块、弹层 |
| **发丝线** | `--rule-hair` | 菜品行分隔、次级分区 |
| **引导点线 leader dots** | 行内 `flex:1; border-bottom:var(--leader); margin:0 7px 3px` | 菜名⋯⋯价格、店名⋯⋯日期 |
| **鱼尾节标** | 宋体 + `::before"【" ::after"】"` 朱色 | 菜单分类标题（【凉菜 COLD STARTERS】） |
| **重界线** | `--rule-heavy` 上/下边 | 餐厅信息条底、购物车条顶、页眉底 |
| **墨框小卡** | `border:1.5px solid ink`，直角或 ≤6px | 地图餐厅小卡片、＋按钮（20px 方框） |
| **描边卡单元**（7.12 晚混入方案C） | `.unit`：`background:paper; border:2px solid ink; radius:12px; box-shadow:3px 3px 0 rgba(178,58,47,.16)` | 菜品卡、点单区块等一切「UI 单元」（tokens.css 提供） |
| **零模糊投影** | 禁一切模糊 box-shadow；**朱调错位硬阴影**（套色工艺）是唯一允许的影 | 全局 |

## 组件映射（app.html 迁移对照）

| 现组件 | 雕版食单形态 |
|---|---|
| `.pcard` 菜品卡 | **描边单元卡**（UI.md 7.12：线太多看不清，混入方案C）：2px 墨框 + 朱调错位影 + 赭黄价签斜贴右上角；辣度 🌶 tag 在标签行；＋号 = 墨框小方章 |
| 分类 chips | 改为**鱼尾节标**分区（All 视图）；筛选 chips 保留但改墨线描边胶囊，选中 = 墨底纸字 |
| `.btn` 主按钮 | 墨底纸字，radius 5px；**关键动作**（下单/服务员视图切换）= 朱底纸字 |
| `.cart-bar` | 不再悬浮胶囊 → 页底**重界线 + 左合计(等宽) + 右朱底小按钮** |
| S3 点菜卡（7.13 定稿） | 单行三件套顶行（‹+双 tab，tab 按面本地化）；圆框金签单元（--gold 金签=内容区、朱签=警示区，标题带 icon 行内无 icon）；CTA 两面同款墨底+金框 CN/EN 徽标；规格见 ui-lab/order-card-final.html |
| 弹层 sheet | 保留 grabber，纸色底 + 顶部重界线，圆角收到 10px |
| 警示 tag | contains = 朱字或朱底（与折叠条同源）；may = 赭黄；素 = 松绿；一律小号、可胶囊 |
| 折叠条 | 上边 2.5px 朱线 + 下发丝线，朱字：「▸ 一道菜为你隐去 —— 含花生」 |
| 拍立得 | 保留（贴在纸上的照片本来就是印刷品逻辑），白框微旋转 |
| 印章 `.seal` | 30px 朱底楷体白字，rotate 2–3deg，inset 纸色细线；出现处：首页刊头右上、地图右上、订单完成态 |

## 食迹地图 = 集印册（替代原「点亮」概念）

- 纸底 `--paper-2`，省块 = 茶笺色 + inset 墨线（`box-shadow: inset 0 0 0 1px rgba(38,32,25,.28)`）
- **吃过的省 = 钤一方朱印**：省块变朱底 + 深朱边 + 中心楷体「食」字 + `rotate(-1~2deg)` 微旋转（每省角度不同，人手盖章感）
- 计数条（宋体字距拉开）：「已 钤 二 印 · 尝 八 味」
- 餐厅小卡片 = 墨线框纸卡 + 指向短线，**首页 preview 和全屏都常显**
- ECharts 实现：省 regions itemStyle 朱底深朱边；「食」字用 label/自定义 marker；纸底 #f3ecdb；城市点用小墨点
- 禁：霓虹、终端字体、黑底网格、渐变发光

## 文案语气（印刷品的措辞）

- 中文可用文言短语点睛：「已钤二印」「尝八味」「一道菜为你隐去」——每屏最多一处，其余照常英文 UI
- 英文保持轻幽默消除恐惧（"No lungs, promise"），禁 AI 腔（Elevate/Seamless/Unleash）

## 备选方案 C ·「大排档招牌」（封存待用）

启用时机：若 A 在真机上感觉太素、或小红书传播物料需要更跳的版本（两者组件结构同构，可整套切换）。元素速记：
- 色：食堂绿 #2F6D4F / 辣椒红 #C73A2C / 蛋黄 #F2B33D / 米瓷 #F5F1E6 / 苍墨 #27221C
- 线条：2px 墨线描边 + 3px 无模糊套色错位硬阴影（tinted）；大圆角 10–14px
- 招牌件：蛋黄底价签斜贴（价格挂卡片右上角）、贴纸徽章微旋转、图钉地图、楷体标题
- 完整 mockup 在 `ui-lab/style-lab-v2.html` 方案三

## Don'ts（本主题专属，叠加在通用红线上）

- 禁模糊投影卡片（错位硬阴影 `.unit` 除外）、禁大圆角（>12px 仅弹层）、禁第二底色、禁朱红大面积铺底
- Flavor bars 已废弃（UI.md 7.12）：辣度 = 🌶 icon；麻 numbing≥5 = Heads-up 标签；Heads-up 标签清单在 `js/data.js`（GENERIC_TAG/HIDDEN_RISK_LABEL）
- 禁 Inter / 纯黑 / 荧光饱和色 / 渐变大字
- 印章与价签的「微旋转」是设计资产，不要「修正」它
- 不删过敏免责声明；数字永远等宽；地图永远是集印册范式
