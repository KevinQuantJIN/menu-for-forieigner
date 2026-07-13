# Chopstory Vision OCR + Gemini 二次修复交接

> 给下一个 Codex 对话的执行文档。请完整读完本文件和 `AGENTS.md` 后再改代码。

日期：2026-07-13（Asia/Shanghai）

分支：`vision-gemini-migration`

基线：`v0`

交接时 HEAD：`6318feb`

交接时结论：**NOT PRODUCTION-READY**

完成状态（2026-07-13）：本文列出的生产正确性与 benchmark 可信度问题已修复。最终 `final-v4` 三轮同哈希真实基准均通过工程硬门槛；最新结论与指标见 `docs/vision-gemini-production-readiness-2026-07-13.md`。后续用户已明确授权将修复合入 `v0` 并部署，因此本文早期的“不提交/不部署”限制仅记录交接当时的授权边界。

本轮范围：修复现有迁移实现、修正 benchmark、重新形成可信的生产就绪结论；不改 UI、不创建 v2 API、不部署生产。

## 0. 新对话的首条指令

复制下面这段作为新对话的第一条消息：

```text
在 /Users/kevin/Documents/menu-for-forieigner 的 vision-gemini-migration 分支继续修复。

先完整阅读：
1. AGENTS.md
2. docs/HANDOFF-VISION-GEMINI-MIGRATION.md
3. docs/superpowers/plans/2026-07-13-vision-gemini-production-migration.md

当前 worktree 包含大量未提交、未跟踪的迁移代码和 benchmark 产物。不得 reset、checkout --、clean、覆盖或删除不属于本次修复的用户文件；不要提交、推送或部署，除非我另行要求。

按交接文档的 Phase 0 到 Phase 4 执行：先修生产正确性和单元测试，再修 benchmark harness 并给它补测试，最后才允许产生新的付费 benchmark 结果。旧 run1/run2/run3 和 postfix-run1 不是最终验收依据，不要手工修改结果报告。

目标不是“测试绿”本身，而是满足文档中的全部停止条件：取消传播、严格嵌套 schema、有限鉴权重试、OAuth single-flight 隔离、API key 不进 URL、route cleanup、严格 NDJSON 状态机、同一时钟的延迟指标、可解释的页序指标、可复现元数据，以及三次有效完整数据集重跑。
```

## 1. 执行摘要

迁移方向不变：

```text
1–9 张菜单图片
  -> Google Cloud Vision DOCUMENT_TEXT_DETECTION
  -> 紧凑 OCR 文字与 block/bbox 证据
  -> Gemini 文本生成
  -> 现有 Dish/done/error NDJSON 契约
```

第一轮审查发现的多个问题已经修复，但第二轮仍存在会影响成本、用户安全字段、鉴权稳定性和验收可信度的问题。最小正确方案不是重构整条链路，而是：

1. 保留当前模块边界和 v1 公共契约。
2. 补齐 6 个生产正确性缺口。
3. 把 benchmark 从“能跑”提升为“结果可证明”。
4. 只在纯函数测试、全量测试和构建全部通过后重跑付费数据集。
5. 以新生成的三次有效结果重建 readiness 文档。

当前代码质量约为 **6/10**：模块拆分和大部分错误语义合理，测试基础也不错；但 fail-fast、嵌套安全 schema、鉴权并发和 benchmark 可信度还未达到生产门槛。

## 2. 不可改变的边界

### 2.1 公共 API

继续使用 `POST /api/analyze`：

```json
{ "images": ["data:image/jpeg;base64,..."] }
```

- 支持 1–9 张图片。
- 兼容旧字段 `{ "image": "data:image/..." }`。
- 成功响应仍为逐行 NDJSON：

```json
{ "type": "dish", "data": {} }
{ "type": "done", "total": 1 }
```

- 失败只暴露既有用户错误：

```json
{ "type": "error", "code": "not_a_menu" }
{ "type": "error", "code": "unreadable" }
{ "type": "error", "code": "upstream_error" }
```

不得新增 `/api/analyze/v2`，不得增加页面 metadata、OCR 原文、bbox、provider 错误细节或 token 信息到公共流。

### 2.2 本次不做

- 不改 `public/app.html` 或 `public/js/*`。
- 不改 `src/lib/contract.ts` 的 v1 事件与 `Dish` 对外形状。
- 不引入数据库、缓存、知识库或新队列。
- 不重写 Lab provider catalog。
- 不做生产 deploy。
- 不为了“更整洁”重构无关代码。

## 3. 当前工作区快照

2026-07-13 本次交接检查时：

- 分支为 `vision-gemini-migration`。
- HEAD 为 `6318feb`，与迁移前基线一致；迁移代码仍未提交。
- `.env.example`、`README.md`、route、Gemini/prompt 等有修改。
- `vision.ts`、`google-auth.ts`、`vision-gemini.ts`、对应测试和 benchmark 脚本均为未跟踪文件。
- 后台 `vision-gemini-production-benchmark.mjs` 进程已经结束。
- 只有 `postfix-run1` 落盘，没有 `postfix-run2/3`。

开始和结束时都运行：

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
pgrep -f 'node scripts/vision-gemini-production-benchmark.mjs' || true
```

如果状态与本节不同，以实时状态为准。任何新出现的文件都先判断是否由用户或其他进程产生，不得直接覆盖。

## 4. 已确认完成的修复

下列内容第二轮已检查，不要无理由重做：

1. **Vision bbox 归一化**：`src/lib/vision.ts` 使用真实 page width/height 转换到 0–1000，并有非 1000 尺寸 fixture。
2. **Gemini 完整生成门槛**：OCR 路径只接受 `finishReason === "STOP"`；缺失、`UNSPECIFIED`、`MAX_TOKENS` 均失败。
3. **Vision google.rpc 临时错误**：4/8/10/13/14 被识别为可重试错误，顶层与 per-image annotation error 都处理。
4. **模型默认配置**：`.env.example` 不再把 Qwen 设为生产默认；Gemini override 仅作为注释示例。
5. **页面输出原子性**：同一 Gemini 页面不能同时包含 dish 和 error。
6. **严格 schema 骨架**：必填顶层字段已经开始验证，但嵌套内容尚未完成，见 P1-2。
7. **benchmark 基础能力**：已有真实流式读取、`done.total`、completed 判定、并发池和基础顺序分数；问题是严格性、计时证据、顺序解释与可复现性不足。

不要把这些“局部已修复”误写成“迁移已生产就绪”。

## 5. 第二轮必须修复的问题总表

| ID | 级别 | 问题 | 风险 | 主要文件 |
|---|---|---|---|---|
| P1-1 | P1 | fail-fast 的局部 abort signal 没有传进页面任务 | 一页失败后其他 Vision/Gemini 付费调用继续运行 | `src/lib/vision-gemini.ts` |
| P1-2 | P1 | allergen/数组/spicy 嵌套 schema fail-open | 未知过敏原可能被静默丢弃，错误风险被降级 | `src/lib/gemini.ts`, `src/lib/normalize.ts` |
| P1-3 | P1 | benchmark NDJSON 不是严格状态机 | terminal 后事件、未知事件可被当作有效结果 | benchmark 脚本 |
| P1-4 | P1 | benchmark 现有延迟结果无效且修复未验证 | P50 约 4ms，与响应 header 6–35s 矛盾 | benchmark 脚本与 postfix-run1 |
| P2-1 | P2 | 第二次 401 会进入通用 transient retry | 相同鉴权失败最多发出第三次请求 | `src/lib/vision.ts` |
| P2-2 | P2 | OAuth single-flight 绑定首个 caller 的 signal | 一个请求取消可能击穿其他健康请求的 token refresh | `src/lib/google-auth.ts` |
| P2-3 | P2 | Gemini API key 放在 URL query | key 更容易进入代理、访问日志和错误 URL | `src/lib/gemini.ts` |
| P2-4 | P2 | route abort/timeout/cleanup 缺少测试 | listener/timer 泄漏与断连传播没有证据 | route 与 route test |
| P2-5 | P2 | benchmark 缺少可复现 metadata 与单测 | 结果不能审计，脚本修复容易回归 | benchmark 脚本/测试 |
| P2-6 | P2 | 顺序指标混合页内与跨页问题 | 无法判断生产 page merge 是否真的错 | benchmark 脚本 |
| P2-7 | P2 | `scripts/check-api.cjs` 是临时调试副本 | OAuth 逻辑重复，可能输出 provider 原文 | debug 脚本 |

## 6. 生产代码修复规格

### P1-1：把 fail-fast signal 真正传到底层

当前 `mapConcurrentOrdered()` 正确把内部 `local.signal` 传给 worker：

```ts
results[index] = await worker(inputs[index], index, local.signal);
```

但 `analyzeWithVisionGemini()` 忽略第三个参数，仍把外部 `signal` 传给页面任务：

```ts
(image, index) => runPageJob(image, index + 1, signal, deps)
```

最小修复：

```ts
(image, index, workerSignal) =>
  runPageJob(image, index + 1, workerSignal, deps)
```

不要改并发上限 4，不需要引入新的任务库。

现有测试 `first page failure aborts remaining workers...` 是假阳性：`geminiCalls < 5` 允许另外 3 个已并发页面继续进入付费 Gemini。替换为可控的 deferred/abort-aware 测试：

- 初始只允许 4 个页面被 claim。
- page 1 失败后，page 2–4 收到 `signal.aborted === true`。
- page 5–6 永远不被 claim。
- 失败发生后没有新的 Gemini 调用启动。
- generator 拒绝为最初的 provider error，而不是次生 abort error。
- parent request abort 仍能取消所有在途调用。

停止条件：测试证明局部失败和父级取消都能到达 OCR/Gemini mock，且没有失败后的新付费工作。

### P1-2：严格验证嵌套 Dish 安全字段

`assertStrictOcrDish()` 当前只验证 `allergens`、`ingredients`、`textures` 是数组，并只要求 `spicy` 是有限数字。随后 `normalizeAllergens()` 会静默丢弃未知 type，并把非法 level 降级为 `may_contain`。例如：

```json
{ "type": "walnut", "level": "contains" }
```

可能通过 parser，最后变成空 allergen。这是安全字段 fail-open。

在 `assertStrictOcrDish()` 中逐项验证：

- `spicy` 必须是整数且位于 0–3。
- `ingredients` 每项必须是非空字符串。
- `textures` 每项必须是非空字符串。
- `allergens` 每项必须是普通对象。
- allergen `type` 必须属于 `ALLERGENS` 的 Big 9 枚举。
- allergen `level` 必须严格等于 `contains` 或 `may_contain`。
- 不允许缺失 type/level。
- 任何一个非法项使整个页面失败；不要静默过滤。
- 保持 `price/category/story` 现有 null/string 语义。

建议直接从 `contract.ts` 导入 `ALLERGENS`，不复制枚举。若选择 exact-key validation，需要确认 Gemini 输出和旧 rollback helper 不被误伤；本次最低必要范围是 OCR 路径的安全字段。

新增表驱动测试：

- 未知 allergen type。
- 缺失或非法 level。
- allergens 内非对象。
- ingredients/textures 内数字、null、空字符串。
- spicy 为 -1、4、1.5、NaN。
- 合法空 allergens 数组仍通过。
- 任一非法 dish 使整个页面不产生部分结果。

停止条件：所有结构性错误均产生 sanitized parse failure，不能被 normalization 修成“看起来有效”的菜。

### P2-1：第二次 401 不能再做第三次请求

当前第一次 unauthorized 会刷新 token；第二次 unauthorized 因为仍标记 retryable，会落入通用 transient retry，导致第三次 HTTP 调用。

最小控制流：

```ts
if (pe.kind === "unauthorized") {
  if (!authRefreshUsed) {
    authRefreshUsed = true;
    invalidateVisionAccessToken(token!);
    token = undefined;
    continue;
  }
  throw pe;
}

if (pe.retryable && !transientRetryUsed) {
  // only non-auth transient retry
}
```

HTTP 401 与 annotation RPC 16 都要覆盖：

- 连续 401：恰好 2 次 Vision fetch、2 次 token 获取路径，然后失败。
- 第一次 401，第二次成功：通过。
- 429/5xx 或 RPC 4/8/10/13/14：仍只消费自己的 transient retry budget。
- auth refresh 与 transient retry 是两个独立预算；理论最多 3 次只适用于“401 后成功换 token，再遇一次非 auth 临时错误”的组合，不适用于连续 401。

### P2-2：OAuth single-flight 与 caller cancellation 解耦

当前 `refreshInFlight` 由第一个调用者创建，`exchangeToken(jwt, signal)` 使用首个 caller 的 signal。后果：

- 首个 caller 取消会取消共享 refresh，健康 caller 一起失败。
- 后加入 caller 的 signal 不参与等待，自己的请求取消后仍会等待共享 promise。

目标语义：

1. token refresh 本身使用独立生命周期，不绑定任一 caller signal。
2. 所有 caller 共享同一个 refresh promise，只发生一次 OAuth token exchange。
3. 每个 caller 单独 race 自己的 abort；caller abort 只停止自己的等待。
4. caller abort 不清空一个仍在进行且可供其他请求使用的 refresh。
5. refresh 真失败时，`refreshInFlight` 正确清空，后续可重试。

可以实现一个小型 `awaitWithAbort(sharedPromise, signal)`；不要引入依赖。注意移除 abort listener，避免泄漏。

测试至少覆盖：

- A、B 并发取 token只发生 1 次 fetch。
- A 先发起后 abort，B 仍取得 token。
- B 后加入后 abort，A 仍取得 token。
- refresh 失败后下一次请求可以重新发起。
- cached token 快路径不受影响。

### P2-3：Gemini API key 从 URL 移到 header

当前两个 Gemini production/rollback helper 都使用：

```text
...?alt=sse&key=...
```

改为：

```ts
const url = `${base}/models/${model}:streamGenerateContent?alt=sse`;

headers: {
  "Content-Type": "application/json",
  "x-goog-api-key": apiKey,
}
```

两个 `streamGenerateContent` 调用都要改，不能只改新 OCR 路径。Google 当前官方 REST 参考也要求 `x-goog-api-key` header。

测试必须断言：

- request URL 不包含 key 值，也不包含 `key=`。
- header 中包含正确的 `x-goog-api-key`。
- thrown public error、snapshot、console/log 都没有 key。
- SSE 与模型参数行为不变。

### P2-4：补 route abort、timeout 与 cleanup 证据

`route.ts` 已建立 request listener、内部 AbortController 和 timer，并把 cleanup 交给 `modelTextToEvents()`；但测试只覆盖业务响应，没有证明资源生命周期。

使用 fake timers 和可观测 mock 覆盖：

- 请求 signal 预先 aborted：provider 收到已取消 signal。
- 客户端在流中途 abort：provider signal 被取消。
- 超时到达：provider signal 被取消。
- 正常读完 stream：timer 被清除、request abort listener 被移除。
- provider 抛错并转换为 `upstream_error`：同样 cleanup。
- cleanup 幂等：完成与 abort 竞争时不会重复副作用。
- mock 路径也清理 timer/listener。

如果测试发现 `Response` 返回后客户端从不读取 body 会长期保留 timer，这属于 stream 生命周期语义，应记录并用最小方案处理；不要先假设。

### P2-7：移除临时 debug 脚本

`scripts/check-api.cjs` 复制了 OAuth/请求逻辑、使用简化 dotenv parser，并可能打印 provider 原始响应。Occam 方案：**删除且不提交**。

只有用户明确要求保留 supported smoke tool 时，才把它改成复用生产模块、默认不打印响应正文、绝不打印 token/key/PEM，并补文档和测试。本次不需要两个 OAuth 实现。

## 7. Benchmark 修复规格

### 7.1 现有结果为何不能用于验收

`docs/vision-gemini-production-benchmark-2026-07-13-postfix-run1.json` 的主要质量结果是：

| 指标 | postfix-run1 |
|---|---:|
| 图片完成 | 14/14 |
| 名称召回 | 83.68% |
| 名称精确率 | 82.88% |
| 价格严格一致 | 64.23% |
| 幻觉数 | 108 |
| bad NDJSON | 0 |
| terminal issues | 0 |
| 单页顺序零 inversion | 4/14 |
| 多页顺序零 inversion | 0/2 |
| 报告的总延迟 P50 | 4.1ms（无效） |

其中单页 `M001_P01.jpg` 记录 `headerMs=12470.7`、`firstDishMs=1.2`、`totalMs=1.7`。`firstDishMs` 和 `totalMs` 小于 header time，不可能来自同一请求时钟，因此延迟数据无效。

时间戳又显示：

- postfix-run1 JSON 生成于 13:14:25。
- 当前 benchmark 脚本修改于 13:15:18。

当前脚本已经把原始 `t0` 传入 `parseNdjsonStream(res, t0)`，这是候选修复，但它晚于 run1，且没有单测、没有修复后产物，所以不能宣称计时问题已验证解决。

旧 `run1/run2/run3` 也由更早、不严格的 harness 生成，缺少 completed/terminal/order 的完整证明。它们只能作为历史参考，不能进入最终 acceptance 汇总。

### 7.2 建立单一时钟与计时不变量

把所有时间统一到 fetch 前的同一单调时钟起点：

- `requestStart`：调用 fetch 前。
- `headerMs`：fetch 返回 response headers 时。
- `firstDishMs`：从流中成功解析到首个合法 dish event 时。
- `totalMs`：body EOF/解析完成时。

建议使用 `performance.now()` 的绝对时间戳，或继续使用一个不可变的 `process.hrtime.bigint()`；不要在 parser 内创建新起点。

必须验证不变量：

```text
0 <= headerMs <= totalMs
firstDishMs == null，或 headerMs <= firstDishMs <= totalMs
```

对于非 200/network failure，也必须从相同 requestStart 计算 total。违反不变量时，该 run 标记为 invalid，不能进入 percentile。

补纯函数/流测试：

- response header 延迟 100ms、首个 dish 再延迟 50ms、EOF 再延迟 20ms。
- chunk boundary 把一行 JSON 切成多段。
- 多行在同一 chunk。
- 最后一行无换行。
- invalid JSON line。
- 无 dish 的 error terminal，firstDishMs 为 null。

### 7.3 用严格 NDJSON 状态机替代宽松分类

当前 `classifyEvents()` 忽略未知 object；`validateTerminal()` 只计数 done/error，不能拒绝：

```text
done -> dish
done -> unknown event
dish -> {"foo":"bar"} -> done
```

实现明确状态机：

```text
OPEN --dish--> OPEN
OPEN --done--> TERMINAL_DONE
OPEN --error--> TERMINAL_ERROR
TERMINAL_* --任何非空事件--> INVALID
EOF at OPEN --> INVALID
```

事件验证要求：

- 只允许 `dish`、`done`、`error` 三种 type。
- 每一非空行必须是合法 JSON object；invalid JSON 立即使 run invalid。
- dish 必须有 object `data`，至少能满足评分所需字段；最好复用/镜像公共契约的必要结构。
- done 必须是唯一 terminal、必须最后、`total` 为非负整数、且等于之前 dish 数。
- error 必须是唯一 terminal、必须最后、code 属于公共错误枚举，且之前没有 dish。
- terminal 后任何事件都失败。
- 未知 type/缺失 type 都失败，不能忽略。
- 不能同时 done 与 error。

把 parse 与 validate 合并为一次可测试的消费过程，或输出带严格 diagnostics 的结构。最终 `completed` 只能是：HTTP 200、无 network error、无 bad line、状态机有效、terminal=done、total 匹配。

### 7.4 分解页内顺序与跨页边界

当前 multi-page `order.inversions` 把以下两类错误混在一起：

1. 页内 Gemini/OCR reading order 与 gold 不一致。
2. page N+1 的菜出现在 page N 的已匹配菜之前，即生产 page merge 失败。

生产代码只承诺“页面批次按输入页序合并”，同时尽量保持页内自然顺序。benchmark 应分别报告：

- `crossPageBoundaryViolations`：已匹配 prediction 的 gold page index 是否出现下降。
- `crossPageOrderOk`：boundary violations 为 0。
- `withinPageInversions`：每页内部按 `dish_order` 的 inversion 数。
- `withinPageComparablePairs` 与 Kendall-style score。
- `combinedInversions`：仅作整体质量参考，不能替代上述两项。

由于公共响应没有 page metadata，只能通过匹配到 gold item 后推导其 gold page；必须在报告注明这是评测推断。未匹配 hallucination 不应伪造 page identity。

验收硬门槛：跨页边界必须 0 violation。页内 inversion 不应伪装成 page merge bug，但必须真实报告并评估是否为质量回归。

### 7.5 增加可复现 metadata

每个 JSON 产物至少记录：

- schema/harness version。
- benchmark 脚本 Git blob hash 或文件 SHA-256。
- git commit、branch、dirty 状态。
- Node version、platform。
- base URL；不得含 credential。
- 实际模型名和关键 generation config。
- dataset 绝对路径或稳定标识。
- gold CSV SHA-256、image list 与每张 image hash。
- concurrency、run label、开始/结束 UTC timestamp。
- public route contract version（当前 v1）。
- 是否 mock（最终必须 false）。

不要写 `gemini-2.5-flash (or env)` 这类不可审计文本；记录真正解析后的模型。任何环境值先使用 allowlist，禁止把整个 `process.env` 导出。

如果字段名是 `deltaVsBaseline.*Pp`，值必须使用百分点，例如 `0.8368 - 0.168 = 0.6688` 应写 `66.88` pp；否则把字段改名为 `deltaFraction`。单位必须在 JSON schema 与 Markdown 中一致。

### 7.6 给 benchmark 自己补测试

当前 Vitest 只覆盖 `src/**/*.test.ts`，benchmark 是不可 import 的一体化 CLI。最小可维护方案：

- 把纯函数提取到 `scripts/lib/vision-gemini-benchmark-core.mjs`，CLI 只处理 I/O；或导出函数并用 `import.meta.url` guard 防止 import 时执行。
- 新建能被 Vitest 收集的测试，例如 `src/lib/vision-gemini-benchmark.test.ts`，动态 import 纯 `.mjs`；若 TS 配置不适合，再最小调整 test include。

测试矩阵：

- CSV quoted fields 与 malformed row。
- NDJSON chunk boundary、invalid JSON、unknown event。
- terminal 缺失、重复、非最后、done/error 混合、done total mismatch。
- error-with-dishes。
- timing invariants。
- `mapPool` 最大并发与输出顺序。
- name/price matching和 hallucination 计数。
- single-page inversions。
- cross-page boundary 与 within-page inversion 分解。
- percentile 空数组/单元素/偶数样本。
- output path extension，避免把 `.json` 写成错误 `.md` 名。
- metadata hash 与 secret allowlist。

停止条件：不请求真实 API 的 synthetic suite 能证明 harness 会拒绝所有不完整/乱序 terminal 流，并能正确计算时间、顺序和汇总。

### 7.7 旧 baseline 的限制

原计划要求旧原图 Gemini 路径也跑三次。目前只有一份旧 baseline artifact。处理原则：

- 如果旧路径仍可安全、可复现运行，并且用户同意额外成本，再补三次。
- 如果模型、代码或环境已无法复现，明确标为 `legacy single-run baseline` / `not reproducible`。
- 不得把单次旧结果包装成三次对照。
- 新路径三次重跑本身仍是硬门槛。

## 8. 产物分类与处理

### 8.1 仅历史参考，不可作为最终验收

- `docs/gemini-image-production-baseline-2026-07-13.{json,md}`
- `docs/vision-gemini-production-benchmark-2026-07-13-run1.{json,md}`
- `docs/vision-gemini-production-benchmark-2026-07-13-run2.{json,md}`
- `docs/vision-gemini-production-benchmark-2026-07-13-run3.{json,md}`
- `docs/vision-gemini-production-benchmark-2026-07-13-postfix-run1.{json,md}`
- 当前聚合 `docs/vision-gemini-production-benchmark-2026-07-13.{json,md}`

不要删除或覆盖这些用户/历史证据。最终报告中注明它们使用旧 harness 或无效 timing。

### 8.2 当前 readiness 文档已过期

`docs/vision-gemini-production-readiness-2026-07-13.md` 当前至少有以下过期声明：

- 测试数仍写 134，而最近验证是 143。
- 把旧 harness 的三次跑数视为完整严格通过。
- 声称多页顺序通过，与 postfix-run1 的 0/2 不一致。
- 延迟结论无法与无效的 4ms timing 共存。

不要手工修几个数字就继续使用。完成三次新 run 后，从结构化 JSON 自动重建 Markdown readiness。

### 8.3 新结果命名

修复后的首次正式结果使用新前缀，避免与旧产物混淆，例如：

```text
docs/vision-gemini-production-benchmark-2026-07-13-final-run1.json
docs/vision-gemini-production-benchmark-2026-07-13-final-run1.md
docs/vision-gemini-production-benchmark-2026-07-13-final-run2.json
docs/vision-gemini-production-benchmark-2026-07-13-final-run2.md
docs/vision-gemini-production-benchmark-2026-07-13-final-run3.json
docs/vision-gemini-production-benchmark-2026-07-13-final-run3.md
```

如果日期跨天，使用真实执行日期。聚合器只接收 schema/harness version 相同且满足 strict completed 的 run。

## 9. 严格执行顺序

### Phase 0：保护现场与建立事实

1. 读取 `AGENTS.md`、本交接、完整 migration plan。
2. 运行工作区与进程检查命令。
3. 检查 diff，区分用户修改、迁移实现、benchmark 产物。
4. 不启动真实 API，不修改旧结果。
5. 建立任务清单，按本节顺序执行。

停止条件：确认没有活跃 benchmark 写文件，知道每个待改文件的归属。

### Phase 1：生产正确性

按顺序修：

1. P1-1 signal forwarding + 强测试。
2. P1-2 嵌套 schema + 表驱动测试。
3. P2-1 连续 401 有限重试 + 测试。
4. P2-2 OAuth single-flight cancellation isolation + 测试。
5. P2-3 API key header + 两条 Gemini 路径测试。
6. P2-4 route abort/timeout/cleanup + 测试。
7. 删除 `scripts/check-api.cjs`。

先跑定向测试：

```bash
npx vitest run \
  src/lib/gemini.test.ts \
  src/lib/vision.test.ts \
  src/lib/vision-gemini.test.ts \
  src/lib/google-auth.test.ts \
  src/app/api/analyze/route.test.ts
```

停止条件：定向测试全部通过，测试真正断言调用次数、signal 状态和 secret 不出现在 URL/错误中。

### Phase 2：benchmark 可信度

1. 提取可测试的 benchmark core。
2. 完成严格 NDJSON 状态机。
3. 锁定单一计时起点与 timing invariants。
4. 分解 cross-page/within-page order。
5. 补齐 metadata、hash、单位。
6. 补 benchmark synthetic tests。
7. 用本地 fake HTTP stream 做 CLI smoke；不调用 provider。

停止条件：所有构造出来的坏流都被拒绝；计时满足不变量；顺序 fixture 能精确区分跨页和页内 inversion。

### Phase 3：全量静态与回归验证

```bash
npm test
npm run build
npx tsc --noEmit
node --check scripts/vision-gemini-production-benchmark.mjs
git diff --check v0
```

另外扫描 secrets，仅报告文件名/位置，不打印值：

```bash
rg -l --hidden --glob '!node_modules/**' --glob '!.git/**' \
  'BEGIN PRIVATE KEY|AIza[0-9A-Za-z_-]{20,}' .
```

预期测试数会高于此前 143；不能为了保持数量删除测试。

停止条件：全绿、无 TypeScript/build 错误、无 diff whitespace error、仓库无真实 credential。

### Phase 4：真实 benchmark 与 readiness

只有 Phase 1–3 完成后才允许：

1. 确认 `MOCK_LLM` 关闭。
2. 启动真实本地/preview API。
3. concurrency 默认 1，最多 2；不要 14 并发。
4. 用 `/Users/kevin/Downloads/chopstory-test-data` 的 14 图片/625 gold 跑 final-run1。
5. 自动检查 strict validity 与 timing invariants；失败就停止，不继续花钱跑 2/3。
6. run1 有效后再跑 run2、run3。
7. 从三份 JSON 自动生成聚合 Markdown 和 readiness。
8. 做一张普通菜单、一张复杂跨栏、一次两页菜单的人工 smoke。
9. 如要 Cloudflare preview，先获得用户对外部状态/费用的许可；生产 deploy 必须另行明确授权。

停止条件：三次 run 都使用相同 harness/schema、14/14 strict completed、报告完整且可复现。

## 10. 最终验收门槛

### 10.1 正确性硬门槛

- 三次 run 均 14/14 图片完成。
- 0 invalid JSON line。
- 0 unknown event。
- 0 missing/multiple/non-final terminal。
- 0 done.total mismatch。
- 0 error-with-dishes。
- 0 accepted incomplete generation / `MAX_TOKENS`。
- 0 cross-page boundary violation。
- 所有 timing 记录满足 `header <= firstDish <= total`。
- 任一页面失败时，不输出早先页面的部分 dish。
- 一页失败会取消其他在途页面并阻止新页面 claim。
- 未知 allergen/非法 level 不能静默降级。
- 连续 unauthorized 恰好两次请求后失败。
- caller cancellation 不影响其他 token refresh waiter。
- Gemini key 不出现在 URL、异常、日志、产物或 Git。

### 10.2 必须报告但不能凭空设门槛的质量指标

- 名称 recall/precision，三次均值、范围、P50。
- 价格严格一致率。
- hallucination count/rate。
- zero-output 和 public error 分布。
- 页内 inversion/Kendall score。
- 单页与多页 header/first-dish/total P50/P95。
- token/cost（若生产路径有可靠、无敏感的 usage 数据）。
- 相对旧 baseline 的差异，并标明旧 baseline 是否仅单次。

如果产品没有事先批准具体 recall/precision/price 阈值，不要自行把某个数字宣布为上线合格；给出证据、回归幅度和明确风险，由用户做产品决策。

## 11. 代码质量要求

- 保持 `route -> orchestrator -> providers` 的现有边界。
- 重试预算必须是显式、有限、可测试的状态，不做递归重试。
- provider error 对外必须 sanitized；内部也不记录请求正文或 credential。
- 测试优先用 deferred promise 和 fake timers，避免依赖真实 sleep。
- benchmark 的 parse/validate/score 保持纯函数，网络与文件 I/O 留在 CLI shell。
- 不复制 `Dish`/allergen 枚举；从 contract 引用。
- 不为了测试导出生产内部细节时，可提取小型 pure module，不引入框架。
- 不手工编辑 benchmark 数字；Markdown 由 JSON 生成。
- 任何新注释解释“为什么”，不复述代码。

## 12. 安全与操作禁令

- 禁止 `git reset --hard`、`git checkout --`、`git clean`。
- 禁止覆盖旧 benchmark 产物。
- 禁止打印或粘贴 `.env.local`、PEM、Bearer token、Google/Gemini key。
- 禁止把 key 放进命令行参数或 URL。
- 禁止在 synthetic harness 测试通过前运行付费 benchmark。
- 禁止把旧 run 的 4ms latency 写进 readiness。
- 禁止把 multi-page combined inversion 直接称为 page merge failure；先分解。
- 禁止在没有用户明确授权时部署 production。
- 禁止自动 commit/push；用户这次只要求交接与后续修复。

## 13. 当前验证记录

第二轮审查时已验证：

- `npm test`：16 files，143/143 passed。
- `npm run build`：通过，Next.js 16.2.10。
- `npx tsc --noEmit`：通过。
- 脚本 `node --check`：通过。
- `git diff --check v0`：通过。
- 仓库扫描未发现真实 secret；只有测试/代码里的 PEM marker 字符串。
- 未运行 Cloudflare preview。

这些是修复前的基线，不是最终验收。后续新增测试后必须重新运行并记录新的准确数量。

## 14. 关键文件索引

| 文件 | 作用 |
|---|---|
| `src/app/api/analyze/route.ts` | 公共请求解析、abort/timeout、NDJSON response |
| `src/app/api/analyze/route.test.ts` | route contract 和 lifecycle 测试 |
| `src/lib/vision-gemini.ts` | 并发页面编排、原子 batch、页序合并 |
| `src/lib/vision-gemini.test.ts` | 并发、顺序、失败原子性 |
| `src/lib/vision.ts` | Vision 请求、OCR 压缩、有限重试 |
| `src/lib/vision.test.ts` | bbox、RPC/HTTP error 与重试 |
| `src/lib/google-auth.ts` | 服务账号 JWT、token cache/single-flight |
| `src/lib/google-auth.test.ts` | token cache、并发、取消与失败恢复 |
| `src/lib/gemini.ts` | image rollback + OCR-text Gemini SSE、严格 parser |
| `src/lib/gemini.test.ts` | SSE、finish reason、schema、secret redaction |
| `src/lib/normalize.ts` | v1 Dish normalization；不得承担 OCR schema fail-open |
| `src/lib/contract.ts` | 冻结的 v1 API/Dish 枚举 |
| `scripts/vision-gemini-production-benchmark.mjs` | 公共 API 黑盒 benchmark CLI |
| `docs/superpowers/plans/2026-07-13-vision-gemini-production-migration.md` | 原始完整设计与验收依据 |
| `docs/vision-gemini-production-readiness-2026-07-13.md` | 已由 final-v4 三轮结构化结果重建 |

## 15. 官方接口参考

- [Gemini API reference：REST 请求使用 `x-goog-api-key` header](https://ai.google.dev/api)
- [Cloud Vision API setup](https://docs.cloud.google.com/vision/docs/setup)
- [Cloud Vision `images:annotate`](https://docs.cloud.google.com/vision/docs/reference/rest/v1/images/annotate)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 16. 最终交付格式

新对话完成后应给用户一份简洁、证据化的结果：

1. 修复了哪些问题，按 P1/P2 映射。
2. 修改的文件链接。
3. 定向测试、全量测试、build、tsc 的真实结果。
4. benchmark harness synthetic tests 证明了什么。
5. 三次 final run 的 exact metrics 与方差。
6. 旧 baseline 的可复现性限制。
7. 是否满足全部硬门槛。
8. 若仍不 ready，明确阻塞项；不得用“基本可以”代替。
9. 不 commit、不 push、不 deploy，除非用户随后明确要求。
