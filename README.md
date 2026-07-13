# MenuLens

拍一张中文菜单，AI 流式返回每道菜的译名、拼音、一句话介绍、过敏原、成分、辣度。为来华外国游客打造的点菜小工具。

- 产品/技术设计：`docs/concept.md`
- UI 交接文档：`docs/HANDOVER.md`
- 当前生产迁移交接：`docs/HANDOFF-VISION-GEMINI-MIGRATION.md`
- 线上 Demo： https://menulens.web3-fintech-op-service.workers.dev
- 参考菜单数据包：`reference-menu-data.zip`

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000 。

生产路径 `POST /api/analyze` 现为：

```text
menu images → Google Cloud Vision OCR → text-only Gemini enrichment → NDJSON dish stream
```

**Mock 仅在显式设置 `MOCK_LLM=1` 时启用。** 缺少 Vision 或 Gemini 凭证时不会静默返回演示菜品，而是返回 `upstream_error`。

也可以直接双击打开 `public/index.html` 调 UI。`file://` 模式下点击 Scan Menu 会直接走浏览器内置 mock。

Mock 数据当前覆盖三家店（需 `MOCK_LLM=1`）：

| 店 | 菜系 | Mock 菜品数 | 图片目录 |
|---|---|---|---|
| 马旺子 | 川菜 | 54 | `reference-menu-data/mawangzi-sichuan/images` |
| 利苑酒家 | 粤菜 | 72 | `reference-menu-data/lei-garden-cantonese/images` |
| 北京菜餐厅 | 北京菜 | 60 | `reference-menu-data/beijing-cuisine/images` |

真实模型：复制无秘密模板，在仓库根创建 `.env.local`：

```bash
cp .env.example .env.local
```

本地 live 验证至少需要：

```text
GOOGLE_API_KEY=...
GOOGLE_CLOUD_PROJECT=...
GOOGLE_VISION_CLIENT_EMAIL=...
GOOGLE_VISION_PRIVATE_KEY=...   # PKCS#8 PEM; real newlines or escaped \n both OK
```

不要把私钥写进 `.env.example` 或提交到 Git。临时凭证用完后从本机删除。

## 环境变量

### 生产 analyze 路径

| 用途 | 变量 |
|---|---|
| Gemini 文本富化 | `GOOGLE_API_KEY`（或 `GEMINI_API_KEY`） |
| Vision 配额项目 | `GOOGLE_CLOUD_PROJECT` |
| Vision 服务账号 | `GOOGLE_VISION_CLIENT_EMAIL`、`GOOGLE_VISION_PRIVATE_KEY`（Cloudflare secrets） |
| 显式 mock | `MOCK_LLM=1`、`MOCK_DELAY_MS` |
| 模型覆盖 | `MENULENS_MODEL`（默认 `gemini-2.5-flash`） |

最低 IAM：在 `GOOGLE_CLOUD_PROJECT` 上启用 Cloud Vision API，服务账号仅需 `roles/serviceusage.serviceUsageConsumer`（或含 `serviceusage.services.use` 的自定义角色）。不要授予 Owner/Editor。

### Lab

Lab 的 8 家逻辑 provider 使用两类 transport：

| Provider | Transport | 必需变量 |
|---|---|---|
| OpenAI / Qwen / MiniMax / StepFun / GLM / DeepSeek | OpenRouter variants | `OPENROUTER_API_KEY` |
| Qwen Beijing / Singapore / Virginia | DashScope direct variants | `DASHSCOPE_API_KEY` / `DASHSCOPE_INTL_API_KEY` / `DASHSCOPE_US_API_KEY` |
| Google Gemini | 官方直连 | `GOOGLE_API_KEY` |
| MiniMax | 官方直连 | `MINIMAX_API_KEY` |
| StepFun | 官方直连 | `STEPFUN_API_KEY` |
| Volcengine Doubao | 官方直连 | `ARK_API_KEY`、`ARK_BASE_URL`、`DOUBAO_MODEL` |

Cloudflare 上的 `POST /api/lab` 还需要 `LAB_ACCESS_TOKEN`，避免公开 URL 被滥用产生模型费用。打开 Lab 后把本机 `.env.local` 中的该值粘贴到 “Lab access token”；它只保存在当前浏览器标签页的 `sessionStorage`。

模型和 base URL 的可选覆盖项见 `.env.example`。所有变量只在服务端读取，不要提交 `.env.local`。

MiniMax 的 `MINIMAX_BASE_URL` 留空时默认国内站 `https://api.minimaxi.com/v1`；国际站 Key 才设置 `https://api.minimax.io/v1`，二者不能混用。Doubao 的 `DOUBAO_MODEL` 必须是已在方舟控制台开通的对话/视觉模型或推理接入点，Seedream 图片生成模型不能用于菜单识别。

DeepSeek 当前在 OpenRouter 只有文本输入模型，因此会显示在 catalog，但不能参加端到端图片 benchmark。它需要未来的共享 OCR 文本赛道，不能与直接看菜单图片的模型混用一个召回榜。

Lab 把 `transport` 作为独立 benchmark 维度。同一厂商的 direct 与 OpenRouter 路径会分别统计和导出；如果两条路径使用不同 model ID，结果只能看作“路径 + 模型组合”，不能归因为纯网络差异。OpenRouter 当前没有等价的 Doubao 视觉模型，Ark 提供的 GLM 4.7/5.2 也不是 GLM-V，因此不会伪造这两条图片路径。

## 多模型 Lab

```bash
npm run dev
```

打开 http://localhost:3000/lab.html 。Lab 支持单次运行、多模型 repeats、NDJSON 实时事件、gold CSV 评分以及 JSON/CSV 导出。

直接打开 `public/lab.html` 的 `file://` 页面只能查看静态 UI，不能调用真实服务端 API。

## 测试

```bash
npm test
npm run build
```

## 部署

先确认 Worker 已配置生产路径所需的四个 secret（命令只显示名称，不显示值）：

```bash
npx wrangler login
npx wrangler secret list
npx wrangler secret put GOOGLE_API_KEY
npx wrangler secret put GOOGLE_CLOUD_PROJECT
npx wrangler secret put GOOGLE_VISION_CLIENT_EMAIL
npx wrangler secret put GOOGLE_VISION_PRIVATE_KEY
npm run configure:lab-access
```

部署前在本地完成发布门禁，再使用现有 Cloudflare/OpenNext 脚本：

```bash
npm test
npx tsc --noEmit
npm run build
npm run deploy
```

部署输出会给出 Worker URL。至少验证首页可访问、浏览器控制台无关键错误，并用一张普通菜单、一张密集菜单和一组多页菜单实测 `POST /api/analyze`；响应必须只有合法 `dish` 事件和唯一的 `done` 终态，不能暴露 OCR/page/provider 内部字段。固定数据集验收命令见 `scripts/vision-gemini-production-benchmark.mjs`。

部署脚本在构建期间会暂时把 `.env.local` 移出构建目录。Provider 凭证必须保存在 Cloudflare Worker secrets 中，不应被打包进部署产物。

如线上验证失败，先停止继续放量；在 `v0` 上 `git revert <migration-commit>` 生成可审计的回滚提交，推送后重新执行 `npm run deploy`。除非怀疑密钥泄露，回滚旧代码时可暂时保留 Vision secrets；若怀疑泄露，应先禁用服务账号密钥并轮换 Cloudflare secrets。
