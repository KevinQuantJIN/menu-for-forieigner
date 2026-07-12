# Chopstory 交接 · UI 合并后（`v0` · 2026-07-12）

> 给**新对话 / 修 bug session**用。读完应能不靠旧聊天继续干活。  
> 本文描述 **ui-prototype 最新视觉已合入 v0 并部署之后** 的状态。  
> 契约细节仍以 [`HANDOFF-v0.md`](./HANDOFF-v0.md) §4 与 `src/lib/contract.ts` 为准；**前端架构以本文为准**（旧文里「单文件 app.html」已过时）。

---

## 1. 当前分支与线上

| 项 | 值 |
|---|---|
| 分支 | `v0`（已与 `origin/v0` 同步） |
| HEAD（写本文时） | `1ea35c0` |
| 工作目录 | `/Users/kevin/Documents/menu-for-forieigner` |
| 线上 | https://menulens.web3-fintech-op-service.workers.dev |
| 应用入口 | `/` → `/app.html` |
| 舞台 | `/stage.html` |
| Lab | `/lab.html` |
| 部署 | `npm run deploy`（OpenNext + Cloudflare Workers） |

---

## 2. 本轮刚完成的事

把 **ui-prototype 最新视觉** 合进 **v0 真后端**。

**策略（不要回退）：**

1. 以 ui 模块化壳为底（`public/css/*` + `public/js/*` + 新 `app.html`）
2. 保留 v0 的 `/api/analyze` NDJSON、Lab、契约 v1
3. 按计划移植逻辑；**不动 CSS 视觉主规则、不动 `src/**` 业务**（除非 bug 明确在后端）

**计划文档（已入库）：**  
[`docs/superpowers/plans/2026-07-12-v0-ui-merge.md`](./superpowers/plans/2026-07-12-v0-ui-merge.md)

**关键提交链（在 `v0` 上）：**

| Commit | 内容 |
|---|---|
| `34c0342` | T0 merge ui-prototype 模块化基座 |
| `4f60fed` | T2 功能 DOM（album / err / thumbs / gallery） |
| `ec941e6` | T3 core 共享层 |
| `2abe955` | T4 home 接真分析流 |
| `eb5973f` | T5 menu 契约字段 |
| `e5d4e28` | T6 order + demo 数据 |
| `e7672a4` | T7 analyzing CSS 增量 |
| `1ea35c0` | 计划文档 + `.gitignore` worktree 忽略 |

---

## 3. 前端架构（修 bug 必看）

```
public/app.html          # 壳 + DOM（无大块业务脚本）
public/js/core.js        # 全局状态、esc/parsePrice、相册压缩、showOrig、normalizeDish
public/js/home.js        # startAnalyze / streamDishes / presentMenu / beginStream / profile sheet
public/js/menu.js        # renderCats / renderList / openDetail / 货币
public/js/order.js       # 下单卡、history
public/js/data.js        # DISHES demo + CURRENCIES / fx
public/css/tokens.css    # 设计 token（朱色是 --accent，不是 --zhu）
public/css/home.css      # 主视觉 + 末尾 T7 增量
public/stage.html        # 八站 journey，依赖全局函数契约
```

脚本加载顺序见 `public/app.html` 底部（data → core → home → menu → order）。

---

## 4. 必须守住的契约（stage 会炸的点）

- 数组名 **`streamed`**（禁止改回 `menuDishes`）
- **`beginStream()`** 必须存在（demo 直达列表，stage 用）
- 全局函数：`go` `startScan` `startAnalyze` `openDetail` `closeDetail` `openOrder` `addToOrder` `histView` `closeSheet` `openCurrency` `closeCurrency`
- 屏 id：`s-home` `s-camera` `s-analyzing` `s-list` `s-order` `s-history`
- 菜字段契约 v1：`category` `description` `vegetarian` `allergens[{type,level}]` `textures`
- 客户端可选（demo / 详情）：`signature` `howToEat` `catOriginal` `emoji`
- 过敏源 UI 用 **shellfish**（Big-9），兼容旧 `crustacean` / `mollusk`

---

## 5. 关键路径

| 路径 | 行为 |
|---|---|
| 相机快门无图 | `runDemoAnalyze` → 14 道 demo，店名「川辣小馆」 |
| 相册有图 | `POST /api/analyze` NDJSON；`start` / `dish` / `done` / `error` |
| `beginStream()` | 跳过动画直接 `presentMenu(demo)`（stage 用） |
| 多页相册 | `lastImages`；resto-bar 显示 `N pages · M dishes` |

分析 UI 钩子：

- 错误：`#anaErr` `#anaRetry` + `ERROR_COPY`
- 缩略条：`#anaThumbs`
- 相册：`#albumInput` + core 里 `compressFiles`
- 原图：`showOrig` / `closeOrig` + `#orig-gallery`

---

## 6. 红线（修 bug 时别破）

1. **不要大改 CSS 视觉**（柿漆金 v-final）；只允许局部增量  
2. **不要改 `src/**` 契约** 除非 bug 明确在后端  
3. **不要用 `DISHES.find` 当运行时源** — 用 `streamed`  
4. 价格一律 `parsePrice` / `priceLabel` / `fxN`  
5. 用户可见字符串过 `esc()`  

---

## 7. 实现细节 / 易出 bug 区

- `normalizeDish` 在 **core.js**：兼容旧字段输入，**不再写出** `cat` / `desc` / `veg` 别名  
- `menu.js` 分类来自 `categoryOrder(streamed)`，不再依赖已删的 `CATS`  
- 列表卡**没有**菜名 emoji（设计如此）；详情 hero 用 `dishEmoji(d)`  
- 无折叠逻辑（fold 已废弃）  
- 测试：`npm test` 当前 **74 绿**（偏后端/契约；前端主要靠手测 + stage）

---

## 8. 验证与命令

```bash
git checkout v0
npm install
npm test
MOCK_LLM=1 npm run dev          # 无 Key / 离线 mock 流
# 真 Key 相册：去掉 MOCK_LLM，依赖 .env.local 的 GOOGLE_API_KEY
npm run deploy                  # 确认后部署
```

手测入口：

- 本地：`http://localhost:3000/app.html`、`/stage.html`
- 线上：`https://menulens.web3-fintech-op-service.workers.dev/app.html`

---

## 9. 相关文档

| 路径 | 角色 |
|---|---|
| **本文** `docs/HANDOFF-v0-POST-UI-MERGE.md` | UI 合并后工程状态 + 修 bug 上下文 |
| `docs/HANDOFF-v0.md` | 契约 v1、后端、多页慢等历史交接（前端架构段落已过时） |
| `docs/superpowers/plans/2026-07-12-v0-ui-merge.md` | 本次合并执行计划 |
| `docs/UI-DESIGN.md` | 视觉：柿漆金 / 雕版食单 |
| `docs/PRD.md` | 产品事实 |
| `docs/demo-menu-plan.md` | 14 道 demo 弹药 |

Agent 注意：Next 版本有 breaking changes，改 Next 前先看 `node_modules/next/dist/docs/`。

---

## 10. 新对话建议开场白

```
在 v0 分支修 UI 合并后的 bug。
上下文见 docs/HANDOFF-v0-POST-UI-MERGE.md
（计划：docs/superpowers/plans/2026-07-12-v0-ui-merge.md）
前端在 public/js/{core,home,menu,order,data}.js + public/app.html
守住 streamed/beginStream/stage 契约，别动 src/** 和 CSS 主视觉。
Bug：
1) …
2) …
```

---

## 11. 已知未做 / 可后续

- 浏览器 stage 八站完整手点走查截图（合并时只做了契约与 mock 流验证）
- 真 Key 相册多页体感（后端多页仍可能「等齐再吐菜」，见 HANDOFF-v0 多页慢章节）
- 本文 HEAD 会随后续 commit 漂移；以 `git log -1` 与线上版本为准
