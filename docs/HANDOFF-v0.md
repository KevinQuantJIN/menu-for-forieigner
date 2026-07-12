# Chopstory 交接文档 · 分支 `v0`（2026-07-12）

> 给**新对话 / 下一位**用的满上下文包。读完应能不靠旧聊天继续干活。  
> 当前工作分支：**`v0`**。**不要把契约改动合回 `ui-prototype`，除非明确要求。**
>
> ⚠️ **2026-07-12 晚：ui-prototype 最新视觉已合入 `v0` 并部署。**  
> **修 UI / 模块化前端 bug 请优先读 → [`HANDOFF-v0-POST-UI-MERGE.md`](./HANDOFF-v0-POST-UI-MERGE.md)**  
> 本文 §3 原型路径、§6 部分「单文件 app.html」描述已过时；**契约 v1（§4）与后端仍以本文 + `src/lib/contract.ts` 为准。**

---

## 1. 仓库与分支

| 分支 | 状态 | 用途 |
|---|---|---|
| `main` | 旧 MenuLens demo 基线 | 线上早期 demo |
| `ui-prototype` | 同事 UI 原型 + 设计文档同步；**保持干净** | 纯 UI / 视觉 / PRD 源 |
| **`v0`（当前）** | 契约 v1 后端 + **已合并** 模块化新 UI | 产品实现主线 |
| `tech-design` | 旧技术讨论痕迹 | 可忽略 |

- 最新状态见 [`HANDOFF-v0-POST-UI-MERGE.md`](./HANDOFF-v0-POST-UI-MERGE.md)（合并后 HEAD / 线上 / 前端架构）  
- `v0` 已 push 远端；线上：`https://menulens.web3-fintech-op-service.workers.dev`

工作目录：`/Users/kevin/Documents/menu-for-forieigner`  
注意：目录名拼写是 `menu-for-forieigner`（foreigner 拼错是历史包袱）。

---

## 2. 产品一句话（已从 MenuLens 升级）

**Chopstory**（chopstick + story）：外国人在中国**到店用餐**伙伴。

拍中文菜单 → 英文读懂 → 放心下单 → 点单卡递给服务员 → 吃懂一点文化 → 留下食迹。

- Slogan：*Taste China, order like a local.*  
- 副定位：*Not just translated. Understood.*  
- 场景只有：**线下到店点单**  
- 明确不做：账号、服务端历史库、菜单重排推荐、AI 生成菜图  

用户故事主角 **Jake**：花生过敏、怕辣、第一次成都。主线 demo 菜：宫保鸡丁（花生）、夫妻肺片（消除恐惧）、麻婆（文案讲麻，**契约不单独要麻度**）等 14 道，见 `docs/demo-menu-plan.md`。

---

## 3. 关键文档地图

| 路径 | 角色 |
|---|---|
| `docs/PRD.md` | 产品事实来源（同步副本，源在 Julia 工作区） |
| `docs/UI-DESIGN.md` | 视觉：雕版食单（纸墨朱、零阴影） |
| `docs/demo-menu-plan.md` | 14 道 demo 弹药库 |
| `docs/style-lab-v2.html` | 视觉方案实验室；定稿方案一 |
| `docs/concept.md` / `docs/HANDOVER.md` | **旧** MenuLens 设计/UI 交接，字段已过时，仅作历史 |
| **`docs/HANDOFF-v0.md`（本文）** | 工程 + 契约 v1 交接 |

原型与演示页：

| 路径 | 角色 | API |
|---|---|---|
| **`public/app.html`** | **交互基准** · 全流程雕版 UI（~1282 行，单文件） | **未接**；内存 `DISHES` mock |
| `public/stage.html` | 演示舞台壳，iframe 嵌 app.html | — |
| `public/index.html` | 旧单页 UI（语言选择 + 流式卡片） | **已接** `/api/analyze`（可真模型） |
| `public/real-menu-mawangzi.jpg` | 相册 demo 真图 | — |

后端：

| 路径 | 角色 |
|---|---|
| `src/lib/contract.ts` | **契约事实来源** |
| `src/lib/normalize.ts` | 模型脏输出 → Dish |
| `src/lib/prompt.ts` | 系统 prompt（英文 only、多图） |
| `src/lib/pipeline.ts` | NDJSON 流 → 契约事件 |
| `src/lib/gemini.ts` | 调 Google Gemini（默认 gemini-2.5-flash），多图 |
| `src/lib/mock.ts` + `mockData.ts` | 无 Key / MOCK_LLM 时的流 |
| `src/app/api/analyze/route.ts` | 唯一 API |

技术栈：Next.js 16 + Cloudflare OpenNext；UI 约定是**单文件 HTML、无框架**（见 UI-DESIGN）。  
仓库规则：改 Next 前先看 `node_modules/next/dist/docs/`（与训练数据可能不一致）。

---

## 4. 契约 v1（已冻结 · 已实现）

产品讨论结论（奥卡姆）：

- **砍掉**：隐藏雷、麻度、油腻度、招牌字段、拿不准标记、多语言、`catOriginal` / `cuisine` / `howToEat` 独立字段、`customizable`  
- **分类**：模型**自由英文类名**，但**同一次识别内同类字面必须一致**（策略 A）  
- **质地雷点**：模型自由短英文标签数组，可空  
- **故事**：进契约，**允许 null**（宁缺毋滥）  
- **过敏原**：美国 **Big 9**；`shellfish` = 虾蟹贝合并  
- **语言**：**英文 only**  
- **图片**：**1～9 张**有序，合并成一份菜单  

### 4.1 请求

```json
{ "images": ["data:image/jpeg;base64,..."] }
```

- 1～9 张；顺序 = 页序  
- 兼容旧字段：`{ "image": "data:image/..." }` → 视为单张  
- **不传**用户忌口档案（折叠/红标前端算）  
- **不再要** `lang`  

400 JSON（非 NDJSON）：`invalid_json` | `invalid_images` | `too_many_images`

### 4.2 响应（NDJSON 流）

```
{ "type": "dish", "data": Dish }
{ "type": "done", "total": number }
{ "type": "error", "code": "not_a_menu" | "unreadable" | "upstream_error" }
```

- 成功：0..n 条 dish → done  
- 或若干 dish 后 error 终止  
- 脏行丢弃；认不出的菜不出卡、不编  

**产品呈现**：UI 要「整单攒齐再 cascade」；后端仍可流式推 dish，进度页可数 N。

### 4.3 Dish 字段（业务名 → 代码）

| 业务 | 字段 | 规则 |
|---|---|---|
| 顺序号 | `id` | 服务端 1-based，合并多图后全局序 |
| 分类名 | `category` | 自由英文；同请求内同类全等；可 null |
| 中文名 | `nameCn` | 照菜单 |
| 拼音 | `pinyin` | 带声调 |
| 英文名 | `name` | 自然译名 |
| 一句话 | `description` | 必填向；决策用，消除恐惧 |
| 价格原文 | `price` | string \| null，as reported |
| 辣度 | `spicy` | 0–3，西方基线 |
| 是否素 | `vegetarian` | 灰区算 false |
| 过敏原 | `allergens[]` | Big 9 + contains \| may_contain |
| 质地雷点 | `textures[]` | 自由短标签，可 [] |
| 成分 | `ingredients[]` | 3–5 英文词 |
| 文化故事 | `story` | string \| null；null 则 UI 隐藏整块 |

**Big 9 枚举**：`peanut | tree_nut | egg | dairy | fish | shellfish | soy | gluten | sesame`

**明确不进契约**：numbing / richness / hiddenRisks / signature / uncertain / emoji / 美元价 / 个人命中 / howToEat 独立字段 / catStd 封闭枚举

类型定义：[`src/lib/contract.ts`](../src/lib/contract.ts)

### 4.4 多图业务规则

1. 1–9 张合成**一次**识别、**一份** list  
2. 出菜序：图1 版式序 → 图2 → …  
3. 分类一致性范围 = 这一次请求  
4. 跨页明显重复菜：只保留先出现的（prompt 约束；normalize 未做硬去重）  
5. 全部都不像菜单 → `not_a_menu`

### 4.5 红线

1. 认不出就不出卡  
2. 过敏不滥标、不装确定  
3. story 宁 null 不编  
4. 价格不装精确汇率  
5. 分类自由但同单一致  

---

## 5. 本地开发

```bash
git checkout v0
npm install
npm run dev          # http://localhost:3000
npm test             # 当前 27 tests 应全绿
```

- 无 `DASHSCOPE_API_KEY` 或 `MOCK_LLM=1` → mock 流  
- 真模型：根目录 `.env.local` 写 `DASHSCOPE_API_KEY=...`  
- 可选：`DASHSCOPE_BASE_URL`、`MENULENS_MODEL`、`MOCK_DELAY_MS`  
- UI 原型：`/app.html` 或 `/stage.html`  
- 部署脚本仍在：`npm run deploy`（Cloudflare OpenNext）

---

## 6. 已完成 vs 未完成

### 已完成（v0 提交 c13a11a + 本轮）

- [x] 产品契约讨论并冻结 v1  
- [x] `contract` / `normalize` / `prompt` / `route` / mock / 测试对齐  
- [x] 多图 1–9、英文 only、textures + story  
- [x] 从 `ui-prototype` 切出 `v0`，**未污染 ui-prototype 工作区提交**  
- [x] **模型：DashScope/qwen → Google Gemini `gemini-2.5-flash`**（`src/lib/gemini.ts`）  
- [x] **已部署 Cloudflare**：`https://menulens.web3-fintech-op-service.workers.dev`  
- [x] **真菜单图联调通过**（本地 + 线上）：马旺子 `IMG_2823` → 8 道菜 NDJSON，含拼音/过敏原/textures  

环境：
- 本地 `.env.local`：`GOOGLE_API_KEY`（gitignore，勿提交）  
- Cloudflare secret：`GOOGLE_API_KEY`  
- 无 Key 或 `MOCK_LLM=1` 仍走 mock  

### 本轮已完成（2026-07-12 · UI 接线 + 多图 + 部署）

- [x] `public/app.html` 对齐契约 v1（去掉 flavorBars/signature/howToEat/catOriginal 等）  
- [x] **产品入口** = `public/app.html`（`/` 与 `index.html` 跳到它）  
- [x] Camera：离线 14 道 `DEMO_DISHES`  
- [x] Album：**真实文件选择**（`#albumInput` multi，1–9 张）→ 压缩 → `POST /api/analyze`  
- [x] 多图预览：分析页横滑缩略条；View original 多图画廊  
- [x] 后端改为 **每页单独 Gemini 调用再合并**（一次塞多图会严重漏菜）  
- [x] 模型源：`src/lib/gemini.ts`（已替掉 dashscope）  
- [x] 线上：`https://menulens.web3-fintech-op-service.workers.dev`  

### 当前阻塞 / 下一 session 主目标：**多页体感慢**

#### 现象与本地基准（必读）

测试图（北京菜电子菜单截图 2 页）：

- `reference-menu-data/beijing-cuisine/images/IMG_2816.jpg`（~58KB）
- `reference-menu-data/beijing-cuisine/images/IMG_2817.jpg`（~47KB）

| 实验 | 结果 |
|---|---|
| 两图**一次**塞进 Gemini | 只出 **2** 道（漏菜严重）→ 已废弃 |
| 两图**分页并行**（现状） | **~34s**，出 **43** 道 |
| 单页 2816 | ~39s，约 3+ 道（早期测） |
| 单页 2817 | ~37s，约 4 道（早期测） |

**现状流式特征（关键）：**

```
headers_ms ≈ total_ms ≈ 34s
first_dish_ms ≈ last_dish_ms ≈ done_ms
```

→ 前端会干等半分钟，进度计数一直是 0，然后菜突然全到。  
原因在 `src/lib/gemini.ts`：

```ts
// 多页路径
const pages = await Promise.all(images.map(collectPageText)); // 等齐
// 然后才 yield 菜行
```

`collectPageText` 把整页 SSE 收完才返回；`Promise.all` 再等最慢页。  
**单页路径** `yield* geminiStreamOne` 是真流式；**多页路径不是**。

#### 建议优化方向（按优先级）

1. **页完成即推流（最大体感提升）**  
   - 每页独立 `geminiStreamOne` 并行  
   - 哪页先完整解析出 dish 行就先 `yield`（可带 page index）  
   - 全部页结束后再 `done`  
   - 目标：首菜 ~15–20s 出现，不必等 34s  

2. **真增量流（更难）**  
   - 页内 SSE 边到边 parse 边 emit（注意跨 chunk 半行 JSON）  
   - 现有 `pipeline.modelTextToEvents` + `createLineSplitter` 已支持跨块行  

3. **模型 / 输出成本**  
   - 默认 `gemini-2.5-flash`（`MENULENS_MODEL`）  
   - 每道 dish 字段多（description/story/allergens…）→ token 多、慢  
   - 可试验：story 默认 null、description 更短、或两阶段（先名+价+过敏，详情后补）— **会动契约/产品，需确认**  

4. **前端体感**  
   - 多页时文案别写 “usually under 10 seconds”  
   - 显示 “page 1/2 done…” 需后端额外 progress 事件（契约现无；可先只靠 dish 计数）  
   - 现状 UI 已是：dish 事件累加计数，`done` 后整单 cascade 列表  

5. **正确性旁路**  
   - 跨页同名去重：现状靠 prompt，normalize 未做  
   - 北京菜图含侧边栏分类 + 长列表，模型会多抽/幻觉个别菜名，需抽查  

#### 复现命令（新 session 可直接跑）

```bash
# 本地 dev 已起：npm run dev → :3000
node /tmp/time_analyze.js   # 或自写：POST /api/analyze with 两图 dataURL
# 关注 first_dish_ms vs total_ms
```

关键文件：

| 文件 | 改什么 |
|---|---|
| **`src/lib/gemini.ts`** | 多页 `Promise.all` → 页完成即 yield |
| `src/app/api/analyze/route.ts` | timeout 现 `min(240s, 90s+30s*n)` |
| `src/lib/pipeline.ts` | 已支持流式行切；多半不用大改 |
| `public/app.html` | `streamDishes` / 进度文案 / 多图预览 |

### 其它未完成

1. Demo 金标：`demo-menu-plan` 14 道 vs `mockData` 三家店  
2. PRD 数据契约回写 v1  
3. `git push -u origin v0`（本地有大量未提交改动，见 `git status`）  
4. 跨页 normalize 去重；story grounding  

### 工作树注意

- 分支：**`v0`**（未 push）  
- 未提交：`public/app.html`、`src/lib/gemini.ts`（新文件）、`route.ts`、`prompt.ts`、`index.html` 等  
- 已删：`src/lib/dashscope.ts`（改用 gemini）  
- 环境：`.env.local` 有 `GOOGLE_API_KEY` / `GEMINI_API_KEY`  

---

## 7. 前后端边界（防再次扯皮）

| 层 | 内容 |
|---|---|
| **契约 / API** | 识别结果 Dish + 事件流；无用户档案 |
| **客户端** | 画像（过敏/忌口 localStorage）、折叠、My Order、For waiter 双视图、≈$ 汇率、emoji、食迹地图 |
| **UI 文件** | 继续以 `public/app.html` 为交互基准；视觉以 UI-DESIGN + style-lab 方案一 |

旧 `src/lib/contract` 的多语言 `LANGS` **已删除**。旧 `public/index.html` 仅跳转壳。

---

## 8. 新对话建议开场白（可复制）

```
继续 Chopstory 分支 v0。
先读 docs/HANDOFF-v0.md（尤其「多页体感慢」）与 src/lib/gemini.ts。
当前 app.html 已接 /api/analyze，多图会分页并行，但 Promise.all 等齐后才吐流。
本地基准：beijing-cuisine IMG_2816+2817 → ~34s / ~43 dishes，first_dish≈total。
本轮目标：多页「页完成即推流」，降低首菜等待；不要回退到单次多图调用（会漏菜）。
```

---

## 9. 决策日志（浓缩）

| 决策 | 结论 |
|---|---|
| 品牌 | Chopstory，非 MenuLens |
| 契约瘦身 | 砍隐藏雷/麻/油腻；story 可空；无 uncertain |
| 分类 | 自由英文名 + 同单一致，非封闭 catStd |
| 雷点 | 自由 textures[]，非封闭枚举 |
| 过敏 | Big 9，shellfish 合并 |
| 语言 | en only |
| 输入 | images 1–9，真文件上传 |
| 多图策略 | **分页识别**（召回），禁止一次塞多图（漏菜） |
| 分支策略 | 实现走 v0；ui-prototype 留给 UI 文档/原型 |

---

*本文随 v0 工程状态编写；实现变更后请同步改本节「已完成/未完成」与契约表。*
