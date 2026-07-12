# Chopstory Lab 多模型评测与两阶段验证设计

日期：2026-07-12  
状态：待用户评审  
范围：仅 `public/lab.html`、`src/app/api/lab/` 及 Lab 专用支持代码

## 1. 决策摘要

Chopstory 当前把菜单视觉读取、翻译、菜品知识、过敏风险和文化故事放进一次长 VLM 生成。Lab 的目标不是简单增加模型下拉框，而是用可复现数据回答两个问题：

1. 在保持当前完整 Dish 契约时，哪个模型的速度、召回和内容质量最好？
2. 当任务缩小为只读取菜单事实时，是否能达到明显更高的速度和准确率，从而证明 `extract -> enrich` 两阶段架构值得进入生产设计？

本轮不修改生产 `/api/analyze`、产品 `public/app.html`、冻结的契约 v1，也不切换生产默认模型。

## 2. 成功标准

### 2.1 提取赛道硬指标

单页：

- 首条有效菜品：P50 <= 1.2 秒，P95 <= 2.5 秒
- 整页提取完成：P50 <= 2.5 秒，P95 <= 4 秒

两页并行：

- 首条有效菜品：P50 <= 1.5 秒，P95 <= 3 秒
- 两页提取完成：P50 <= 3.5 秒，P95 <= 6 秒

质量：

- 菜名召回率 >= 98%
- 价格精确率 >= 99%
- 幻觉菜率 <= 0.5%
- 页内顺序准确率 >= 98%

这些是选型门槛而不是对任一供应商的预先承诺。未达到时，Lab 必须显示距离目标的差值。

### 2.2 完整 Dish 赛道指标

- 单页首道 Dish：P50 <= 3 秒，P95 <= 6 秒
- 单页完成：P50 <= 7 秒，P95 <= 10 秒
- 两页完成：P50 <= 10 秒，P95 <= 15 秒
- 菜名、价格指标不得低于提取赛道 2 个百分点以上
- 所有输出必须通过契约 normalize；记录被丢弃行和截断原因

### 2.3 Cloudflare 开销指标

- Lab `meta` 事件：P50 <= 300ms，P95 <= 700ms
- Cloudflare 相对本地直连增加的服务端 P50 延迟 <= 500ms
- 若 Cloudflare 对某供应商增加 P95 > 1.5 秒，或出现区域性连接错误，则进入部署拓扑实验，不直接归因于模型

## 3. 评测赛道

### 3.1 Full Dish

沿用当前完整 Dish 语义，用于评估不改变生产架构时的能力上限。供应商可以使用原生 JSON Schema，但 normalize 后必须得到相同契约。

### 3.2 Extract Only

只读取照片中可观察的事实：

```ts
interface ObservedMenuItem {
  page: number;
  ordinal: number;
  categoryCn: string | null;
  nameCn: string;
  price: string | null;
  bbox?: [number, number, number, number];
  confidence: number;
  sourceText: string;
}
```

本赛道禁止翻译、推测配料、推测过敏原或生成故事。它验证的是视觉读取能力，而不是百科知识。

## 4. 首批模型

### 国外

- `gemini-2.5-flash`：当前基线，`thinkingBudget = 0`
- `gemini-2.5-flash-lite`：Google 速度候选，关闭 thinking
- `gpt-5.4-mini`：`reasoning.effort = none`，使用 Structured Outputs

### 国内

- `qwen3.6-flash`：非思考模式，速度/质量平衡候选
- `qwen3.7-plus`：非思考模式，国内质量上限候选
- `Doubao-Seed-2.0-Lite`：使用火山方舟实际可用 endpoint/model ID
- `qwen-vl-ocr`：只参加 Extract Only，作为专用 OCR 对照

Claude 和各家旗舰推理模型不进入首轮。只有当首轮模型的视觉提取合格、但英文知识补全明显不足时，才增加第二阶段文本质量模型。

## 5. 统一 Provider 边界

Lab 支持代码提供统一接口，供应商差异封装在 adapter 内：

```ts
type LabMode = "full_dish" | "extract_only";

interface LabModelRequest {
  images: string[];
  mode: LabMode;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  signal: AbortSignal;
}

interface LabProvider {
  id: "gemini" | "qwen" | "doubao" | "openai";
  stream(request: LabModelRequest): AsyncIterable<LabProviderEvent>;
}
```

Adapter 必须返回统一的增量文本、usage、finish reason、供应商 request ID 和错误分类。不得在 `gemini.ts` 中继续堆叠其他供应商分支。

供应商 API Key 只从服务端环境变量或 Cloudflare secrets 读取；GET 配置接口只返回 `configured: boolean`，绝不返回 key、错误响应中的 key 或完整鉴权 URL。

## 6. Lab 事件与顺序

Lab 使用独立事件，不更改生产契约：

```text
meta
page_started
provider_chunk
item
page_done
usage
done
error
```

多页可并行，但最大并发为 4。每条 item 带 `page` 和 `ordinal`。UI 可以即时展示先完成的页，同时最终结果按 `page, ordinal` 排序。某页失败不取消已成功页；最终结果标记 partial。

为防止模型 SSE chunk、NDJSON 行和 JSON 数组边界混淆，adapter 负责供应商协议解析，公共层只处理完整 provider event。

## 7. 公平比较规则

- 同一原始文件、同一客户端压缩结果
- 每页独立模型请求，多页使用同一并发策略
- temperature 为 0 或供应商允许的最低值
- thinking/reasoning 关闭
- 优先使用原生 JSON Schema
- 使用固定 snapshot；若供应商只提供 alias，结果中显式标记
- 每张图、每个配置至少重复 3 次，报告 P50/P95
- 原始响应、解析失败、usage、finish reason 和耗时全部保留在当前浏览器会话中供导出
- 默认不把原始菜单图或模型响应写入持久存储

Lab 同时显示单次结果和聚合结果。模型排名按多个指标展示，不合成为一个未经解释的总分。

## 8. 金标与评分

数据采集、目录结构、JSONL 字段、覆盖配额和人工复核流程以 [`2026-07-12-lab-dataset-collection-contract.md`](./2026-07-12-lab-dataset-collection-contract.md) 为唯一规范。

### 8.1 数据集

使用 `reference-menu-data` 的 21 张图作为 calibration。正式 v1 另采至少 60 张 holdout 图片。第一批实现先覆盖：

- 北京菜 2 页：当前 43 道性能样本
- 马旺子 2 页：川菜、文化菜名和过敏风险样本
- 利苑 2 页：粤菜、长菜名和价格格式样本

随后扩展到全部 calibration 和新采集 holdout。

### 8.2 金标格式

按图片保存只读评测事实：page、ordinal、categoryCn、nameCn、price。完整 Dish 的英文解释和风险字段单独人工评审，不混入 OCR 真值。现有图片不得进入 holdout。

### 8.3 自动指标

- 菜名 exact match 与规范化 match
- 菜名 precision / recall / F1
- 价格 exact match
- 幻觉菜数
- 页内顺序 Kendall tau 或等价顺序得分
- JSON/Schema 有效率
- normalize 保留率
- 首 item、页完成、总完成耗时
- 输入、输出、thinking token 与估算成本

过敏原、描述和故事不做伪自动正确率；Lab 提供人工盲评表：正确、可接受、错误、危险。

## 9. Cloudflare 部署设计

当前 Next.js 16 通过 OpenNext 运行在 Cloudflare Workers。网络等待不计 Worker CPU 时间，HTTP 请求只要客户端保持连接就可继续流式，因此平台不是当前 34 秒的直接根因。

需要纳入以下约束：

- Worker 内存 128 MB：不得同时缓存多份 base64 图片和完整 provider 响应
- 每次请求最多 6 个仍在等待响应头的外连：Lab 多页并发上限设为 4
- 日志单请求 256 KB：原始大响应不写 console
- 使用 ReadableStream 直接转发事件，避免收齐后再返回

### 9.1 延迟分解

Lab 分别记录：

1. 浏览器压缩耗时
2. 浏览器到 Worker/本地服务的请求耗时
3. Worker 校验和准备耗时
4. Worker 到模型供应商 headers 耗时
5. 模型首 token 与生成耗时
6. adapter 解析与 normalize 耗时
7. 最后事件到浏览器完成耗时

Cloudflare 环境尽量返回 colo、Ray ID 和 placement 信息；本地环境标为 `local`。

### 9.2 部署场景

首轮保留当前 Cloudflare 默认 placement，避免同时改变模型和网络两个变量。

若达到拓扑实验触发条件，使用独立 Lab 部署而不是修改生产 Worker：

1. Cloudflare 默认 placement
2. Cloudflare Smart Placement
3. Cloudflare 显式邻近区域 deployment
4. 可选区域容器/Serverless runner

不同部署使用相同代码、模型 snapshot、图片和 benchmark run ID。只有当替代部署在至少两个供应商上稳定降低 P95，且没有显著增加用户上传延迟时，才建议迁移 Lab 或未来生产后端。

## 10. Lab UI

Lab 增加：

- provider、model、mode 选择
- 当前 provider 是否已配置
- 单模型单次运行
- 选中多个配置的顺序 benchmark；默认不并发轰炸供应商
- 客户端、网络、模型、解析四段耗时
- 图片级结果、聚合 P50/P95、质量指标
- 原始事件查看和 JSON/CSV 导出
- 目标线与超标差值
- deployment/colo/placement 标签

Lab 不自动从浏览器把同一图片并行发送给所有供应商，避免意外费用、速率限制和 Cloudflare 外连拥塞。批量 benchmark 采用有上限的队列。

## 11. 测试与失败处理

- adapter 单元测试：供应商 SSE/stream chunk、错误、usage、finish reason
- 公共解析测试：跨 chunk、部分 JSON、schema 不合格、重复菜
- 路由测试：缺 key、非法 provider/model、图片数量、abort、partial page
- Cloudflare preview smoke test：流式首事件、外连、secret 缺失提示
- UI 测试：运行、取消、重跑、导出、部分失败

统一错误类型：

```text
missing_credentials
rate_limited
provider_timeout
provider_rejected
invalid_provider_output
partial_result
aborted
unknown_provider_error
```

Lab 展示经过清洗的错误；完整上游响应仅在确认不包含鉴权信息后进入浏览器调试面板。

## 12. 实施边界与停止条件

本轮完成条件：

1. Gemini、Qwen、OpenAI provider 可在 Lab 运行；Doubao 在凭证和 endpoint 可用时接入
2. Full Dish 和 Extract Only 均可运行
3. 至少 6 张金标图片可自动评分
4. 本地与 Cloudflare preview/部署能显示分段耗时
5. 能导出可复现 benchmark 结果
6. 生产 `/api/analyze`、`public/app.html` 和契约 v1 无行为变化

本轮不实现生产两阶段管线、知识库、持久缓存、过敏原 v2 语义或生产部署迁移。Lab 数据证明两阶段方案后，再单独设计生产迁移。
