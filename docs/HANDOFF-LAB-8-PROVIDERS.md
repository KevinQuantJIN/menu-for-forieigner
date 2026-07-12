# Chopstory Lab · 8 家模型评测交接（2026-07-12）

> 给新 session 直接接手。本文只覆盖当前 Lab 与“扩展到 8 家中国/海外模型”的任务；产品主线背景仍看 `docs/HANDOFF-v0.md`。

## 0. 当前准确状态

- 仓库：`/Users/kevin/Documents/menu-for-forieigner`
- 分支：`v0`
- HEAD：`8eaf787 Expand Lab into a multi-model benchmark console`
- 远端：`v0` 已与 `origin/v0` 同步
- 工作区：干净
- 验证：`npm test` → **12 files / 53 tests passed**
- Lab 页面：`http://localhost:3000/lab.html`
- 用户当前浏览器也停在 `public/lab.html` 的本地文件页；实际跑 API 请用 dev server URL，不要用 `file://`。
- 用户要求：**不要再使用 brainstorming skill**。

## 1. 用户最新目标

把 Lab 扩展成 8 家模型的统一菜单识别 benchmark，方便用户逐家申请 API Key 后横向测试：

1. Google Gemini
2. 阿里 Qwen
3. 字节豆包
4. OpenAI
5. MiniMax
6. 阶跃星辰 StepFun
7. 智谱 GLM
8. DeepSeek

用户原话的意图不是只把名字放进下拉框，而是：

- 每家能配置独立 API Key / base URL / model；
- 同一批菜单图片、同一 prompt、同一输出契约下运行；
- 看首条延迟、总耗时、召回率、价格准确率、幻觉数、错误数；
- 支持多模型多次 benchmark 和 JSON / CSV 导出；
- 最终提交并 push 到 `v0`。

## 2. 已有 Lab 能力（已经实现并 push）

### 页面

`public/lab.html` 是一个紧凑的单文件 benchmark console，已有：

- provider / model / mode 选择；
- `extract_only` 与 `full_dish` 两条模式；
- 1–9 张菜单图片；
- temperature、max tokens、自定义 system/user prompt；
- gold CSV 上传；
- 单次运行、Stop、选择多个模型 × 1–5 repeats；
- NDJSON 实时事件、逐条 item、raw stream、errors；
- Provider / Model / runtime / headers / first item / total / tokens 等指标；
- benchmark 汇总 P50 / P95；
- JSON / CSV 导出。

### 服务端

- `GET /api/lab`：返回 provider、model、prompt、默认值和目标延迟。
- `POST /api/lab`：运行一个 provider/model，多页并行，NDJSON 流返回。
- `POST /api/lab/score`：用六列 gold CSV 对 name/price 评分。
- 每页单独调用模型，最多 4 页并行；这样比把多页一次塞给模型更不容易漏菜。
- runner 会把 provider 的文本增量解析成 item 事件，并保留 page / ordinal / raw / timing / usage。

### 当前已接 provider（只有 4 家）

| Provider | Adapter | 当前模型 |
|---|---|---|
| Gemini | 原生 Gemini `streamGenerateContent` | `gemini-2.5-flash`、`gemini-2.5-flash-lite` |
| Qwen | OpenAI-compatible chat completions | `qwen3.6-flash-2026-04-16`、`qwen3.7-plus-2026-05-26`、`qwen-vl-ocr` |
| Doubao | OpenAI-compatible chat completions | `DOUBAO_MODEL` 环境变量指定的 endpoint/model |
| OpenAI | OpenAI chat completions | `gpt-5.4-mini-2026-03-17` |

注意：上表模型名来自上一轮实现时的目标配置，**新 session 必须再按官方控制台实际可用模型核对**，不要盲信未来日期 snapshot 名。

## 3. 关键代码地图

| 文件 | 作用 |
|---|---|
| `src/lib/lab/types.ts` | `LabProviderId`、request/event/catalog/score 类型 |
| `src/lib/lab/catalog.ts` | provider 配置状态与模型清单；扩 8 家的主要入口 |
| `src/lib/lab/providers/index.ts` | adapter 路由 |
| `src/lib/lab/providers/gemini.ts` | Gemini 原生 SSE |
| `src/lib/lab/providers/openai-compatible.ts` | 当前 Qwen / Doubao 共用 adapter |
| `src/lib/lab/providers/openai.ts` | OpenAI adapter |
| `src/lib/lab/runner.ts` | 多页并发、事件归一化、增量 JSON 行解析 |
| `src/lib/lab/prompts.ts` | `extract_only` / `full_dish` prompt |
| `src/lib/lab/scoring.ts` | gold CSV 解析与评分 |
| `src/app/api/lab/route.ts` | catalog + run API；目前 provider 白名单也是 4 家 |
| `src/app/api/lab/score/route.ts` | 评分 API |
| `public/lab.html` | 全部 Lab UI 与浏览器端运行逻辑 |
| `src/lib/lab/providers/providers.test.ts` | adapter 请求格式测试 |
| `src/app/api/lab/route.test.ts` | API/catalog/校验测试 |
| `src/lib/lab/ui-contract.test.ts` | Lab UI 静态契约测试 |

## 4. 下一 session 应怎么实现

### A. 先确认能力边界，不要把不同任务混成一个榜

菜单 benchmark 的输入是图片。只有支持视觉理解 / image input 的模型，才能公平参加“端到端菜单识别”。

- StepFun：官方文档已确认 `Step 3.7 Flash` 原生支持图片/视频；也有 `Step-1o Turbo Vision`。优先用当前控制台可申请且便宜的视觉模型。
- GLM：用官方当前可用的 GLM-V 系列视觉理解模型，核对精确 model id 和 OpenAI-compatible 请求格式。
- MiniMax：必须确认开放平台是否提供可直接用 API Key 调用的**视觉理解** chat endpoint。`image-01` 是图片生成，不是菜单 OCR/VLM，不能拿来参赛。
- DeepSeek：必须确认官方 API 是否已支持 image input。若官方仍是 text-only，则不能假装发送图片；UI 应把它标成 `text-only / requires OCR input` 或不允许参加 image benchmark。

若要让 text-only 模型也参赛，正确设计是新增显式赛道，例如：

1. `vision_end_to_end`：模型直接看原图；
2. `text_after_shared_ocr`：所有 text-only 模型吃同一份固定 OCR 文本。

不要让 DeepSeek 先吃另一家 VLM 的 OCR，却仍与端到端模型共用同一个召回榜而不标注。

### B. 类型与 catalog

1. 把 `LabProviderId` 扩成：

```ts
"gemini" | "qwen" | "doubao" | "openai" |
"minimax" | "stepfun" | "glm" | "deepseek"
```

2. `catalog.ts` 为每家加入：

- label；
- `configured` 判断；
- 官方准确 model id；
- 支持的 modes；
- snapshot / moving alias；
- 最好再增加 `input: "vision" | "text"` 或 capabilities，供 UI 禁用不兼容赛道。

3. `route.ts` 的 `PROVIDERS` 同步扩展，最好以后从统一常量派生，避免类型/catalog/route 三处漂移。

### C. Adapter 设计

优先复用 OpenAI-compatible 协议，但不要假定 7 家 body 完全相同。建议把当前 adapter 抽成配置驱动：

```ts
type CompatibleConfig = {
  apiKey: string;
  baseUrl: string;
  imageContentShape: "openai-image-url" | "provider-specific";
  maxTokenField: "max_tokens" | "max_completion_tokens";
  extraBody?: Record<string, unknown>;
};
```

逐家处理：

- 不同 base URL；
- `image_url` 是否支持 data URL；
- token 参数名；
- thinking/reasoning 开关；
- usage 字段和 request-id header；
- SSE delta 结构；
- 是否支持 JSON mode；
- Cloudflare Worker 能否直接访问国内 endpoint。

每加一家先补 provider adapter 单测，再接 catalog/UI。

### D. 建议环境变量命名

当前已有：

```bash
GOOGLE_API_KEY=
GOOGLE_API_BASE_URL=                  # optional
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=
ARK_API_KEY=
ARK_BASE_URL=
DOUBAO_MODEL=
OPENAI_API_KEY=
OPENAI_BASE_URL=                      # optional
```

建议新增（最终以官方命名和实现为准）：

```bash
MINIMAX_API_KEY=
MINIMAX_BASE_URL=
MINIMAX_MODEL=

STEPFUN_API_KEY=
STEPFUN_BASE_URL=https://api.stepfun.com/v1
STEPFUN_MODEL=

ZHIPU_API_KEY=
ZHIPU_BASE_URL=
ZHIPU_MODEL=

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=
```

不要提交 `.env.local` 或任何真实 Key。部署时用 `npx wrangler secret put NAME`。

### E. README / UI

- 更新 README，旧文档仍写 DashScope 是主模型，已经过时。
- Lab 顶部应显示 `ready/total`，扩完后是 `x/8 providers ready`。
- 未配置 provider/model 保留可见但禁用，提示缺哪个环境变量。
- 对不支持图片的模型明确显示 capability，不要只报模糊的 `invalid_model`。
- file:// 只能看静态页面，真实 benchmark 必须在 `npm run dev` 后访问 `/lab.html`。

## 5. Gold 数据注意事项

Lab 评分 API 要的是简单六列 CSV：

```csv
menu_id,image_file,dish_order,name_cn,price,note
```

当前解压后的 `reference-menu-data/` 只有图片和 `manifest.json`，没有 `dishes.csv`。仓库根可能有原始 zip 或数据生成来源；下一 session 应先 `rg --files | rg 'dishes\\.csv|reference-menu-data.*zip'` 查找。如果没有，就需要从现有数据源补 gold CSV，不能把 mock 输出当 gold。

## 6. 官方能力核实到一半的结果

上一 session 在写代码前开始查官方文档，但用户要求改为写交接，所以没有继续实现：

- StepFun 官方视觉模型页确认 `Step 3.7 Flash` 原生支持图片/视频，兼容 OpenAI 调用；图片支持 data URL，JPG/PNG/GIF/WebP。
- MiniMax 官方常规模型页主要列文本模型与**图片生成**模型；另有 CLI 的视觉理解能力，但尚未确认等价的公开 HTTP VLM endpoint/model id。必须继续查，不能用图片生成 API 顶替。
- GLM 官方存在 GLM-V 视觉模型文档，但精确 model id、请求 body、流式 usage 尚未整理进代码。
- DeepSeek 官方 image input 支持尚未确认。

建议只引用各家官方开发文档/控制台，不用聚合博客。模型名和能力变化快，实施当天重新核对。

## 7. 推荐执行顺序

1. `git checkout v0 && git pull --ff-only`
2. `npm install && npm test`
3. 查 4 家新增 provider 的官方视觉能力、model id、base URL、SSE 格式
4. 先做 StepFun + GLM（大概率直接支持 VLM）
5. 再做 MiniMax；若无公开 VLM API，catalog 显示能力限制，不伪接
6. 最后处理 DeepSeek；若 text-only，新增共享 OCR 赛道或明确禁用图片 benchmark
7. 更新 README / `.env.example`（若仓库没有可新建无秘密模板）/ Lab capability UI
8. 每家补 adapter + route + UI contract 测试
9. 跑 `npm test`、`npm run build`
10. 用至少 1 张真实菜单分别 smoke test 已配置的 provider；记录失败 body 时注意脱敏
11. commit，`git push origin v0`

## 8. 验收标准

- GET catalog 稳定返回 8 家 provider，配置状态正确且不泄露 key。
- 每个视觉 provider 能用同一张 data URL 菜单图跑通 NDJSON 流。
- 不支持视觉的 provider 不会被误标为可跑端到端图片识别。
- 单模型运行、Stop、多模型 repeats、评分、导出都仍工作。
- provider 错误可定位（HTTP 状态 + 截断且脱敏的消息），不会让整页无响应。
- 53 个现有测试不回归，并有新增 provider 覆盖。
- build 通过，分支已 push。

## 9. 现有提交历史（Lab）

```text
8eaf787 Expand Lab into a multi-model benchmark console
add7167 Score Lab runs against menu CSV gold data
8c22ecb Make Lab runs provider neutral and truly streaming
0e49ed3 Add streaming Lab model providers
b039c6d Build Lab benchmark domain and scoring
```

这些提交都已经在 `origin/v0`。
