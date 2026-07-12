# ChopStory — UI 设计规范（One Page）· 雕版食单版

> ⚠️ 同步副本（2026-07-14），源文件在 Julia 的 Hackathon 工作区，以源为准。

> 给所有做 UI 的 AI / 人的唯一样式事实来源。改样式先改这里，再改代码。
> 产品定义看 `PRD.md`；demo 菜品清单看 `demo-data/demo-menu-plan.md`；本文只管「长什么样、怎么动」。
> 2026-07-12 定稿：**主题 = 方案一「雕版食单」**（见 `ui-lab/style-lab-v2.html`），备选 =「大排档招牌」（见文末）。
> ⚠️ **2026-07-13 更新（Julia 定稿）：S1 菜品列表 + S2 详情弹层改走「柿漆金排档 v-final」**，规范见文末新增章节，视觉基准 `ui-lab/style-lab-final.html`——该两屏以新章节为准，与上文冲突处新章节胜出。其他屏（S0/S3/S4）暂维持现规范。
> ✅ `public/app.html`（ui-prototype 分支，commit 01aa24f）**已完成主题迁移**（纯换肤，逻辑零改动），品牌已更为 ChopStory。后续改 UI 直接以 app.html 为现行基准。

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
| `public/stage.html`（定稿 7.12；stage-a/b/c.html 为历史探索稿） | 舞台壳：背景/展示文案/八站 journey 时间轴（含反向同步） | 已认领（舞台线，Claude 单独迭代） |

**协作纪律**：① 只改自己认领的文件；② 改完当轮就 commit + push（冲突大多来自攒着不提交）；③ 动 ⚠️ 文件先协调；④ `stage.html` 舞台壳已被认领单独迭代；它跨 iframe 依赖 app 的全局函数 `go / startScan / startAnalyze / beginStream / openDetail / openOrder / addToOrder / histView / closeDetail / closeSheet / openCurrency / closeCurrency`，并轮询 `#cur-mask / #detail-sheet / .screen` 的 id 与 hidden 状态做时间轴反向同步——改名或删除前先和舞台线同步。

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
| 首页 Scan CTA（7.14 定稿） | **朱印章钮**（ui-lab/scan-cta-lab.html 方案A）：朱底 + 深朱 2px 边 + 厚底座 `0 5px 0` + 印面内圈纸色细线 + 微倾 -0.8°；按下 = 盖章（下沉 5px 底座消失）；实现在 css/home.css `.scan-cta` |
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
- 餐厅小卡片（7.14 定稿）= **迷你拍立得**（ui-lab/map-card-lab.html 方案A）：白框 + 上图下字（emoji 照片区/店名双行/日期）+ 微旋转交替 ±3° + 底部小三角指向坐标点，与首页 history 拍立得同语言；**只在全屏地图常显，首页 preview 不放卡**（7.13 决定）
- 实现：ECharts label 画不出白框+三角 → **HTML overlay**（`#map-pins` 容器 + `convertToPixel` 定位，`georoam` 时跟随；注意涟漪动画常驻导致 `finished` 事件永不触发，初次定位必须在 setOption 后直接调用），见 js/map.js
- ECharts 其余：省 regions itemStyle 朱底深朱边；纸底 #f3ecdb；城市点用小墨点
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

---

## 🔶 2026-07-13 定稿 · S1 列表 + S2 详情「柿漆金排档 v-final」（本章覆盖上文对这两屏的规定）

> 视觉基准（唯一）：`ui-lab/style-lab-final.html`。过程稿 v4/v5/v6/story 仅存档。适用文件：`css/menu.css` + `js/menu.js`（tokens.css 增量新增变量，勿改旧变量语义）。

### 色板（柿漆金，本两屏局部生效）

```css
--sh-paper: #FBF6EA;     /* 屏底，178deg 微渐变至 #F6EFDD */
--sh-card:  #FFFDF6;     /* 卡底 */
--sh-ink:   #1C1A17;     /* 漆墨 */
--sh-sub:   #857A64;     /* 次要字 */
--sh-hot:   #D24B33;     /* 柿红：警示 tag / CTA / 加购态 / 辣度文字（仅此四处填色） */
--sh-gold:  #DCA842;     /* 鎏金：价签 / 招牌 tag / 文化题跋 */
--sh-gold-line: #C89A2E; /* 金细线 */
--sh-hairline: #CFC3A5;  /* 发丝线（chips 描边） */
```

### 字体（7.13 决议：豁免「无外部字体」约束，仅限以下两族，断网回退系统字体）

- EN 展示/标签/菜名：**Bricolage Grotesque**（Google Fonts `<link>`；fallback `-apple-system`）
- 数字/价格：**IBM Plex Mono** + `tabular-nums`（fallback `ui-monospace`）
- 中文一律 PingFang SC；宋体/楷体不再用于这两屏

### S1 菜品列表

- **卡容器**：`background:--sh-card; border:2px solid --sh-ink; border-radius:14px; box-shadow:3px 3px 0 rgba(28,26,23,.22)`；卡间距 14px，卡间零横线
- **价签**：鎏金实底 + 2px 墨框 + `rotate(2deg)`，骑卡右上出血（top:-10px）；`≈$` 主 + `¥` 小字两行
- **菜名行**：EN 14.5px/750 + 辣度 **🌶 icon 三档**缀菜名旁（10px；7.13 定：麻不在列表标注，仅详情 Heads-up）——无菜名前图标、无文字辣度标
- **第二行**：中文 · 拼音（**无 🔊**，语音入口只在详情页）
- **tag（白名单制）**：只显命中 `data.js` GENERIC_TAG / 个人过敏 / 招牌；样式：过敏 = 柿红描边+朱字+#FBEEEA 底、雷点 = 灰墨描边、招牌 = 金描边+#FAF3DD 底；胶囊 999px
- **加号**：24px 方钮 radius 8、柿红底墨框白 +；**加购态 = 墨底金字数量**（状态必须有视觉差）
- **分区标题**：EN 15.5px/800 + 中文 10px 附注，**无右侧延展线**（7.13 删）；**分区名与顶部 tab 完全同名，滑动 scrollspy 点亮对应 tab**
- **tabs**：胶囊 1.5px 墨框；active = 墨底金字
- **货币按钮（7.13 A 案）**：列表右上角鎏金币徽（34px 圆、显当前币符）→ 底部弹层选币：国旗+币名+代码+¥100 换算预览，当前项朱色勾选；副标题声明 convert for convenience + approximate/for reference only；¥ 原价永远保留，选择存 localStorage，价签/底栏/点单页联动
- **Order card 条**（7.13 增高）：墨底 radius 14 · padding 13px + 金色硬影 + 柿红「Order card ›」钮（无 icon）；文案 `Total ¥X ≈ $Y`；margin-top:auto 钉屏底；忌口**不折叠**（折叠逻辑 7.13 移除，行内红 tag 警示）

### S2 详情弹层

- **弹层无包边**：纸面 `--sh-card` 顶部 radius 22 + 柔和上抛影 `0 -14px 34px rgba(40,30,15,.22)`；grabber 保留
- **标题区两行封顶**：EN 24px/800 居中；中文·拼音·🔊。**无菜系行、无价格行**（价格只在 CTA）
- **What it is 块 = 页面主角**：`#FAF5E9` 底 + 1.25px 墨线单框 radius 10 + 朱底白字标签 `What it is`（**无中文**）骑框左上；关键词柿红加粗
- **常规字段**：标签 = EN 12px/800 + 中文 10px 小注（正文标签禁全大写）；Ingredients / Heads-up chips = 发丝线描边 `inset 0 0 0 1px --sh-hairline` + `#FAF5E9` 底 radius 6；Allergens：contains = 朱底白字、may = 金描边金字
- **The story = 页脚题跋（S2 方案定稿）**：出血茶笺色带 `#F4ECD7` 满宽，上缘 1px `--sh-gold-line` 金线（左右内缩 18px），小标 `THE STORY · 由来`（金字 10px/800 + 右延渐隐金线），正文 11.5px/1.7 `#55503F`；**底部零间距直接衔接 CTA**——「决策区（白）/文化区（茶）」用背景切换分层，不加框
- **CTA**：柿红满宽，`Add to order · ≈$X`（¥Y 小字），15px padding

### 纪律（继承全局）

横线配给制（分区双细线与题跋金线之外零横线）· 填色只给过敏/CTA/加购态/辣度文字 · 数字等宽 · 44px 触控 · 微旋转仅价签一处
- 不删过敏免责声明；数字永远等宽；地图永远是集印册范式
