# Chopstory 交接文档 · 分支 `v0`（2026-07-12）

> 给**新对话 / 下一位**用的满上下文包。读完应能不靠旧聊天继续干活。  
> 当前工作分支：**`v0`**（基于 `ui-prototype` 切出）。**不要把契约改动合回 `ui-prototype`，除非明确要求。**

---

## 1. 仓库与分支

| 分支 | 状态 | 用途 |
|---|---|---|
| `main` | 旧 MenuLens demo 基线 | 线上早期 demo |
| `ui-prototype` | 同事 UI 原型 + 设计文档同步；**保持干净** | 纯 UI / 视觉 / PRD 源 |
| **`v0`（当前）** | = `ui-prototype` + **后端契约 v1 落地** | 产品实现主线起点 |
| `tech-design` | 旧技术讨论痕迹 | 可忽略 |

- 最新提交（v0）：`c13a11a` — *Freeze Chopstory analyze contract v1 on backend*  
- 基线：`fb3448a` — *Sync team docs + demo stage page for handoff*  
- **`v0` 尚未 push 远端**（需要时：`git push -u origin v0`）

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

原型与演示页（**未接新契约 API**）：

| 路径 | 角色 |
|---|---|
| `public/app.html` | 可交互全流程 mock UI（字段比契约肥：flavorBars 等） |
| `public/stage.html` | 演示舞台壳，iframe 嵌 app.html |
| `public/index.html` | 旧单页参考 UI |
| `public/real-menu-mawangzi.jpg` | 相册真图 demo 用 |

后端：

| 路径 | 角色 |
|---|---|
| `src/lib/contract.ts` | **契约事实来源** |
| `src/lib/normalize.ts` | 模型脏输出 → Dish |
| `src/lib/prompt.ts` | 系统 prompt（英文 only、多图） |
| `src/lib/pipeline.ts` | NDJSON 流 → 契约事件 |
| `src/lib/dashscope.ts` | 调 qwen-vl-max，多图 |
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

### 已完成（v0 提交 c13a11a）

- [x] 产品契约讨论并冻结 v1  
- [x] `contract` / `normalize` / `prompt` / `dashscope` / `route` / mock / 测试对齐  
- [x] 多图 1–9、英文 only、textures + story  
- [x] 从 `ui-prototype` 切出 `v0`，**未污染 ui-prototype 工作区提交**

### 未完成（建议新对话优先）

1. **前端接线**  
   - `public/app.html` 仍用内存 `DISHES` mock，字段多于契约（`flavorBars`/`howToEat`/`signature`/`catOriginal` 等）  
   - 应：`streamDishes()` → `POST /api/analyze`（`images[]`）  
   - 进度页消费流式计数；`done` 后整单 cascade  
   - UI 字段对齐契约：去掉麻/油腻条或仅 mock 展示；`story` null 隐藏  

2. **Demo 金标数据**  
   - `demo-menu-plan.md` 14 道 vs 后端 `mockData` 三家店大批量截图菜  
   - 应用一份与 PRD 演示点一致的 mock（或 mockRestaurant 增加 `demo-sichuan-14`）

3. **契约文档回写 PRD**  
   - PRD 仍写着旧「Kevin 新增字段」列表（catStd、flavorBars…），与 v1 不一致  
   - 应把 PRD §数据契约改成 v1，或注明「以 `contract.ts` + 本文为准」

4. **远端**  
   - `git push -u origin v0`  
   - 是否从 v0 开 PR 到 main / 是否保留 ui-prototype 纯 UI  

5. **可选增强**  
   - normalize 层跨页同名去重（现仅靠 prompt）  
   - story grounding 二段式（现单次 VLM）  
   - `app.html` 与雕版 token 继续打磨（UI 同事主场）

---

## 7. 前后端边界（防再次扯皮）

| 层 | 内容 |
|---|---|
| **契约 / API** | 识别结果 Dish + 事件流；无用户档案 |
| **客户端** | 画像（过敏/忌口 localStorage）、折叠、My Order、For waiter 双视图、≈$ 汇率、emoji、食迹地图 |
| **UI 文件** | 继续以 `public/app.html` 为交互基准；视觉以 UI-DESIGN + style-lab 方案一 |

旧 `src/lib/contract` 的多语言 `LANGS` **已删除**。旧 `public/index.html` / concept 仍可能写 `lang`——以 v0 API 为准。

---

## 8. 新对话建议开场白（可复制）

```
继续 Chopstory 分支 v0。
先读 docs/HANDOFF-v0.md 与 src/lib/contract.ts。
当前契约 v1 已冻结并在后端落地；ui-prototype 不要动。
下一步：________（例如：把 app.html 接到 /api/analyze，或补 14 道 demo mock）
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
| 输入 | images 1–9 |
| 分支策略 | 实现走 v0；ui-prototype 留给 UI 文档/原型 |

---

*本文随 v0 工程状态编写；实现变更后请同步改本节「已完成/未完成」与契约表。*
