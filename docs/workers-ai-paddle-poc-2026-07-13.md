# Cloudflare Workers AI + PaddleOCR 菜单识别 POC

日期：2026-07-13（Asia/Shanghai）

## 结论

密集中文菜单不要直接交给 Cloudflare 的 LLaVA 或 Moondream 做端到端抽取。当前最简单、最稳的路线是：

1. `PP-OCRv6` 提取文字、坐标和置信度；
2. Gemini、Qwen 或 MiniMax 根据 OCR 结果完成菜名与价格配对、翻译和面向外国用户的解释；
3. 原图只在 OCR 结果有歧义时交给视觉模型复核。

`PP-StructureV3` 可作为复杂版式的备选，但在本次菜单页上不如 `PP-OCRv6` 完整。`PaddleOCR-VL-1.6` 和两个 Cloudflare VLM 暂不进入主链路。

## 实测样本

- Cloudflare 首轮：`M007_P01.jpg`，标注 39 道菜。
- 横向对比：`M001_P05.jpg`，标注 8 道菜，包含中英文、图片、分栏和价格。

## 实测结果

| 模型 | 平台 | 样本 | 服务端耗时 | 结果 |
|---|---|---:|---:|---|
| LLaVA 1.5 7B | Cloudflare Workers AI | 39 道菜 | 3.51s | 只返回 `39 / 35`，把页面数字误当菜名价格，不可用 |
| Moondream 3.1 9B | Cloudflare Workers AI | 39 道菜 | 1.10s | 只返回 1 道不存在的菜，未完成菜单抽取 |
| Moondream 3.1 9B | Cloudflare Workers AI | 8 道菜 | 4.19s | 输出英文幻觉和大量重复价格，未识别正确中文菜名 |
| PaddleOCR-VL-1.6 | PaddleOCR API | 8 道菜 | 约 3s | 能还原页面大意，但漏掉多个中文菜名或价格 |
| PP-StructureV3 | PaddleOCR API | 8 道菜 | 约 6s | 约 6/8 道菜能形成完整菜名价格对，版式还原较好 |
| PP-OCRv6 | PaddleOCR API | 8 道菜 | 小于 1s | 8/8 菜名和价格均出现在 OCR 结果中；有少量重复、错字，仍需按坐标配对 |

耗时来自单次 POC，不能视为稳定 SLA。Paddle 时间取任务返回的 `startTime` / `endTime`，Cloudflare 时间取 Worker 内部计时。

## Cloudflare 接入

Wrangler 配置：

```json
{
  "ai": {
    "binding": "AI"
  }
}
```

Worker 中通过绑定调用：

```ts
const output = await env.AI.run(model, input);
```

本项目已增加受 `LAB_ACCESS_TOKEN` 保护的 `POST /api/workers-ai` POC 路由，支持：

- `@cf/llava-hf/llava-1.5-7b-hf`
- `@cf/moondream/moondream3.1-9B-A2B`

Cloudflare 当前实际返回 `{ result, usage }`，模型输出位于 `result`，不能直接从顶层读取 `answer`。

官方文档：

- [Workers AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [LLaVA 1.5 7B](https://developers.cloudflare.com/workers-ai/models/llava-1.5-7b-hf/)
- [Moondream 3.1 9B](https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/)

## Paddle 接入建议

Paddle API 是异步任务：

1. 上传图片到 `POST /api/v2/ocr/jobs`；
2. 使用 `jobId` 查询任务状态；
3. 完成后下载 `resultUrl.jsonUrl` 的 JSONL；
4. `PP-OCRv6` 读取 `ocrResults[].prunedResult` 中的 `rec_texts`、`rec_scores` 和坐标字段。

API token 应放在 Cloudflare Secret 中，不进入仓库。当前测试 token 没有写入代码或 `.env`；因为它已经出现在聊天记录中，建议测试后轮换。

## 下一步

只做一条新的 POC 链路即可：`图片 -> PP-OCRv6 -> 菜名/价格配对 -> 现有 LLM 翻译与解释`。先用完整 14 页数据集测召回率和端到端延迟，再决定是否接入产品。
