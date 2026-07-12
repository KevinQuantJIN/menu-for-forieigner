# MenuLens

拍一张中文菜单，AI 流式返回每道菜的译名、拼音、一句话介绍、过敏原、成分、辣度。为来华外国游客打造的点菜小工具。

- 产品/技术设计：`docs/concept.md`
- UI 交接文档：`docs/HANDOVER.md`
- 线上 Demo： https://menulens.web3-fintech-op-service.workers.dev
- 参考菜单数据包：`reference-menu-data.zip`

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000 。没有配置 API Key 时服务端自动进入 mock 模式，随便选一张图片即可看到所选餐厅的完整可见菜品列表流式返回。

也可以直接双击打开 `public/index.html` 调 UI。`file://` 模式下点击 Scan Menu 会直接走浏览器内置 mock。

Mock 数据当前覆盖三家店：

| 店 | 菜系 | Mock 菜品数 | 图片目录 |
|---|---|---|---|
| 马旺子 | 川菜 | 54 | `reference-menu-data/mawangzi-sichuan/images` |
| 利苑酒家 | 粤菜 | 72 | `reference-menu-data/lei-garden-cantonese/images` |
| 北京菜餐厅 | 北京菜 | 60 | `reference-menu-data/beijing-cuisine/images` |

真实模型：复制无秘密模板，在仓库根创建 `.env.local`：

```bash
cp .env.example .env.local
```

## 环境变量

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

主产品的 mock 开关仍为 `MOCK_LLM`、`MOCK_DELAY_MS` 和 `MENULENS_MODEL`。

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

Cloudflare Workers 配置已包含：

```bash
npx wrangler login
npx wrangler secret put GOOGLE_API_KEY
npm run configure:lab-access
npm run deploy
```

The deploy script temporarily isolates `.env.local` while building. Provider
credentials must be configured as Cloudflare Worker secrets; they are never
intended to be bundled into the deployment artifact.
