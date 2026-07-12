# Chopstory 交接：直接迁移 `/api/analyze` 到 Vision OCR + Gemini

日期：2026-07-13（Asia/Shanghai）  
状态：**设计已定，等待下个任务实现**  
当前分支：`v0`  
当前 HEAD：`459aba4 docs: add post-UI-merge handoff for bugfix sessions`

## 1. 这次要做什么

直接替换现有生产 `POST /api/analyze` 的内部实现：

```text
菜单图片 -> Google Cloud Vision OCR -> Gemini -> 现有 Dish NDJSON
```

生产外部模型服务只有两个：

1. Google Cloud Vision `DOCUMENT_TEXT_DETECTION`：读取菜单上的中文、价格和版式文字。
2. Gemini：根据 OCR 文字生成现有完整 `Dish` 契约中的英文翻译、描述、配料、辣度、过敏原、texture 和 story。

不新增 `/api/analyze/v2`，不做 shadow 路由，不改变 API URL，不改变客户端请求/响应形状。UI 对齐 v0 最新版本是**下个对话**的独立工作。

## 2. 必须保持不变的 API 契约

`src/lib/contract.ts` 是当前冻结的 v1 契约。迁移后仍然是：

### 请求

```json
{ "images": ["data:image/jpeg;base64,..."] }
```

- 支持 1–9 张图片。
- 兼容旧字段 `{ "image": "data:image/..." }`。

### 响应

```text
{ "type": "dish", "data": Dish }
{ "type": "done", "total": number }
{ "type": "error", "code": "not_a_menu" | "unreadable" | "upstream_error" }
```

继续复用 `src/lib/pipeline.ts` 的 `modelTextToEvents()` 和 `src/lib/normalize.ts`。不要把 OCR 原文、bbox、内部 token、provider 信息或新事件类型泄露给现有产品 UI。

## 3. 简化后的生产内部流程

```mermaid
flowchart LR
  A[1-9 张 data URL] --> B[Vision OCR]
  B --> C[精简 OCR 文字证据]
  C --> D[Gemini text-only enrichment]
  D --> E[现有 normalizeDish]
  E --> F[/api/analyze 现有 NDJSON]
```

### Vision OCR

每页调用：

```text
POST https://vision.googleapis.com/v1/images:annotate
feature: DOCUMENT_TEXT_DETECTION
languageHints: ["zh"]
```

对 Gemini 只传紧凑 OCR 证据，不传原始图片：

```ts
interface OcrPage {
  page: number;
  fullText: string;
  blocks: Array<{
    text: string;
    bbox: [number, number, number, number];
    confidence: number | null;
  }>;
}
```

`fullText` 用于全文理解；`blocks` 给 Gemini 处理菜单跨栏、名称与价格分离的情况。不要将完整 Vision response JSON 直接送给 Gemini。

### Gemini

Gemini 改为**文字输入**，而不是现有的 `inlineData` 图片输入。

新 prompt 的核心规则：

- OCR 是唯一菜单事实来源，不能依赖原图或猜测不存在的菜。
- `nameCn` 和 `price` 只能从 OCR 证据复制；不确定价格为 `null`。
- 仍输出现有完整 `Dish` NDJSON schema。
- 英文译名、描述、典型配料、辣度、texture 和 story 才由 Gemini 生成。
- `thinkingConfig: { thinkingBudget: 0 }`；当前生产 `src/lib/gemini.ts` 缺少这一项，Lab adapter 已有同类配置。
- temperature 固定低值；先沿用当前 `0.2`，若完整 14 页验证显示更稳定，可统一降为 `0`。

这是一条两服务路径，不是本次就上线知识库、canonical dish、缓存或新的流式事件契约。

### 多页顺序与流式

本次直接切换只守住正确性：

- Vision 与 Gemini 可以按页并行，最多沿用当前 4 页并发上限。
- 最终必须按原始图片页序合并结果；不能因为第 2 页先完成就让其菜品排在第 1 页之前。
- 现有 v1 没有 `page_progress` 事件，因此本次不增加它。
- 真正的页级进度/渐进 UI 改造与 v0 UI 对齐一起留到下个对话。

## 4. 错误处理

保持现有用户可见错误码：

| 情况 | v1 行为 |
|---|---|
| Vision 鉴权失败、网络失败、5xx、不可恢复限流 | `upstream_error` |
| 所有页面 OCR 都没有可读文字 | `unreadable` |
| Gemini 明确返回非菜单 | `not_a_menu` |
| Gemini/解析失败 | `upstream_error` |

Vision 的 429/5xx 最多重试一次并带短退避；不要无限重试。任何错误日志都不得打印图片 base64、Bearer token、API key 或服务账号 PEM。

## 5. Cloudflare 上的 Vision OAuth

`GOOGLE_VISION_API_KEY` 实测不能完成当前 Vision 调用，不能用于本迁移。生产采用服务账号 OAuth：

| 名称 | Cloudflare 类型 | 用途 |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | Worker var | Vision quota/billing project |
| `GOOGLE_VISION_CLIENT_EMAIL` | Worker secret | 专用服务账号邮箱 |
| `GOOGLE_VISION_PRIVATE_KEY` | Worker secret | 服务账号 PEM 私钥 |
| `GOOGLE_API_KEY` 或 `GEMINI_API_KEY` | Worker secret | Gemini API |

Worker 实现：

1. 用 Web Crypto `RSASSA-PKCS1-v1_5` 对服务账号 JWT 签名。
2. 调 `https://oauth2.googleapis.com/token` 换取带 `cloud-vision` scope 的短期 access token。
3. 在 module scope 缓存 token；有效期剩余不足 5 分钟才刷新。
4. Vision 若返回 401，清除缓存并只重换一次 token。

使用只服务于 Chopstory 的专用账号和最小权限，不授予 Owner/Editor。私钥只存 Cloudflare secret，不进入 `.env.example`、仓库、测试或 benchmark 导出。

## 6. 需要修改的文件

| 文件 | 改动 |
|---|---|
| `src/lib/google-auth.ts`（新） | 服务账号 JWT、OAuth token 缓存、一次 401 刷新 |
| `src/lib/vision.ts`（新） | data URL -> Vision OCR -> `OcrPage` 压缩 |
| `src/lib/gemini.ts` | 增加 OCR-text Gemini stream；保留现有图片流直到迁移验证完成；关闭 thinking |
| `src/lib/prompt.ts` | 新增 OCR-to-Dish prompt，不改 v1 Dish schema |
| `src/app/api/analyze/route.ts` | 直接改为 Vision -> Gemini source，保持请求/响应接口不变 |
| `src/app/api/analyze/route.test.ts` | 覆盖 Vision 成功、OCR 空、Vision 失败、Gemini 输出、1/多图页序 |
| `.env.example` | 仅增加无秘密的变量名与说明 |
| `README.md` | 更新生产部署所需 secrets 与直接迁移说明 |

不要在这次修改：`public/app.html`、`public/js/*` 的 UI 行为、`src/lib/contract.ts`、`src/lib/pipeline.ts` 的 v1 事件类型。

## 7. 验证数据与验收

只使用当前已有的测试集，不扩展到“21 张”：

```text
/Users/kevin/Downloads/chopstory-test-data
14 张图片，625 条 gold 菜品
```

当前已有 OCR 基线：

| OCR | 严格菜名召回 | 近似菜名召回 | 备注 |
|---|---:|---:|---|
| Google Vision | 90.7% | 93.9% | 生产已选 |
| Paddle PP-OCRv6 | 91.0% | 93.0% | 仅留给 Lab 对照 |

本次真正要新增的评测是完整生产链：

```text
14 张图片 -> Vision OCR -> Gemini -> Dish NDJSON -> 现有 scorePredictions
```

至少报告：

- 14/14 是否都完成；
- 名称召回、名称精确率、价格严格一致；
- 幻觉菜数量；
- 单页/多页总耗时 P50/P95；
- 错误与零输出；
- 与旧的原图 Gemini 基线的差异。

完成前运行：

```bash
npm test
npm run build
```

然后本地真实 smoke：一张普通文字菜单、一张跨栏复杂菜单、一次两页菜单。确认后才部署。

## 8. Lab：保留，但独立于本次生产切换

Lab 仍然保留所有模型 API，不要因生产固定 Vision + Gemini 而删 catalog：

- OCR selector：Vision / Paddle。
- analysis selector：所有已配置模型。
- `OPENAI_API_KEY`：新增 OpenAI direct Lab 路径。
- `DEEPSEEK_API_KEY`：新增 DeepSeek direct Lab 路径；它只参加 OCR-text 分析，不参加图片直连赛道，除非实施当天官方确认图片能力。
- 现有 OpenRouter、Qwen、Doubao、MiniMax、StepFun、GLM、Gemini 路径继续保留。
- Direct vision 与 `shared OCR -> analysis` 分开统计，不共用排行榜。

这部分可以在生产 API 切换后做。Lab 不阻塞 `/api/analyze` 的直接迁移。

## 9. 明确延后的内容

以下内容合理，但不是本次直接切 API 的阻塞项：

- `ObservedMenuItem` 对外事件；
- `page_progress` / `item_extracted` / `item_enriched`；
- canonical dish 知识库；
- 感知缓存、菜品知识缓存、餐厅菜单缓存；
- `observed / typical / possible` 过敏风险 UI；
- v0 最新 UI 的交互与页面对齐。

下个对话优先做 UI align；在 API 稳定之后，再决定是否引入上述 v2 体验和知识层。

## 10. 当前工作区注意事项

工作区有用户和 POC 的未提交变更。不要 `reset --hard`、`checkout --` 或覆盖无关文件。

已存在的相关 POC：

- `docs/google-vision-benchmark-2026-07-13.md`
- `docs/paddle-ocr-v6-benchmark-2026-07-13.md`
- `scripts/google-vision-benchmark.mjs`
- `scripts/paddle-ocr-v6-benchmark.mjs`
- `src/app/api/workers-ai/`

开始前先运行：

```bash
git status --short
```

只暂存自己有意修改的文件。

## 11. 下个任务可直接粘贴的提示词

```text
在 /Users/kevin/Documents/menu-for-forieigner 的 v0 分支实现直接生产迁移。

先读 docs/HANDOFF-VISION-GEMINI-MIGRATION.md、AGENTS.md、src/lib/contract.ts、src/app/api/analyze/route.ts、src/lib/gemini.ts。

目标：直接替换 POST /api/analyze 的内部路径为 Vision OCR -> Gemini，同时保持 v1 请求与 NDJSON Dish/done/error 契约不变。不要新建 /api/analyze/v2，不做 shadow，不改 UI，不改 contract.ts。

Vision 使用 Cloudflare secret 中的服务账号 OAuth，Gemini 只吃 OCR 文本与紧凑 blocks，不吃原图。关闭 Gemini thinking。多页结果必须按图片页序合并。

验证只用 /Users/kevin/Downloads/chopstory-test-data 的 14 张 / 625 条 gold。跑 npm test、npm run build、真实 smoke 和完整数据集 benchmark。绝不打印或提交 secrets。当前 worktree 很脏，不能 reset 或覆盖无关改动。

UI 与 v0 最新版本对齐留给下一次任务。
```

## 12. 参考

- [Google Vision benchmark](./google-vision-benchmark-2026-07-13.md)
- [Paddle benchmark](./paddle-ocr-v6-benchmark-2026-07-13.md)
- [Lab provider handoff](./HANDOFF-LAB-8-PROVIDERS.md)
- [Cloud Vision `images:annotate`](https://docs.cloud.google.com/vision/docs/reference/rest/v1/images/annotate)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
