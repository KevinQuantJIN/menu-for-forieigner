# Chopstory Cloudflare 三模型基准报告

生成时间：2026-07-12T17:04:15.020Z

## 结论

1. **当前 Cloudflare 部署只推荐 Gemini 2.5 Flash 作为主路径。** 14/14 请求有效，名称召回从本地 81.3% 变为 78.4%，总耗时 P50 8.91s，整体与本地接近。
2. **Qwen 北京直连不适合通过当前 Cloudflare Worker 长流转发。** 只有 6/14 请求有效；其余出现 incomplete stream 或 Cloudflare 503。成功样本的首条 P50 也从本地 1.42s 增至 11.48s。
3. **MiniMax 在 Cloudflare 上速度较好，但本轮质量不稳定。** 13/14 请求有效，总耗时 P50 10.88s；不过单轮严格名称召回从 85.4% 降到 54.6%，包括中英混写、重复条目和流截断。
4. 三模型并行把总墙钟时间降到最慢队列的一轮，但当前 Worker 对 Qwen 的流式响应存在明显平台瓶颈。生产上不要把本地最优模型直接等同为 Cloudflare 最优模型。

## Cloudflare 结果

| Model | 有效请求 | 名称召回 | 相对本地 | 首条 P50 | 总耗时 P50 | 错误请求 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `gemini-2.5-flash` | 14/14 (100.0%) | 78.4% | -2.9pp | 2.43s | 8.91s | 0 |
| `qwen3.6-flash` | 6/14 (42.9%) | 20.5% | -67.2pp | 11.48s | 17.58s | 8 |
| `MiniMax-M3` | 13/14 (92.9%) | 54.6% | -30.9pp | 2.63s | 10.88s | 1 |

## 本地 → Cloudflare

| Model | 有效率 | 名称召回 | 首条 P50 | 总耗时 P50 |
| --- | ---: | ---: | ---: | ---: |
| `gemini-2.5-flash` | 100.0% → 100.0% | 81.3% → 78.4% | 2.94s → 2.43s | 9.10s → 8.91s |
| `qwen3.6-flash` | 100.0% → 42.9% | 87.7% → 20.5% | 1.42s → 11.48s | 19.41s → 17.58s |
| `MiniMax-M3` | 100.0% → 92.9% | 85.4% → 54.6% | 4.41s → 2.63s | 19.22s → 10.88s |

注意：Cloudflare 延迟只对无错误且至少输出一道菜的请求计算。Qwen 的延迟属于成功样本，不能代表失败请求的用户体验。

## 失败证据

- **gemini-2.5-flash**：无失败
- **qwen3.6-flash**：M002_P01.jpg (incomplete_stream)；M003_P01.jpg (incomplete_stream)；M004_P01.jpg (lab_http_503)；M005_P01.jpg (incomplete_stream)；M006_P01.jpg (incomplete_stream)；M007_P01.jpg (incomplete_stream)；M007_P02.jpg (incomplete_stream)；M008_P01.jpg (lab_http_503)
- **MiniMax-M3**：M008_P01.jpg (incomplete_stream)

## 测试口径与限制

- 14 张相同菜单图片、625 条 gold；每个模型逐图片运行一次。
- 三个模型并行，单个模型内部串行，因此这是并发度 3 的部署负载测试；本地基线此前为模型间串行。
- 模式为 `extract_only`，temperature 0，max output tokens 8192。
- 失败和流截断按 0 召回计入质量，避免幸存者偏差。
- 这是单轮结果。MiniMax 的内容差异不能仅凭本轮断言由 Cloudflare 导致，但它证明当前链路缺少稳定输出保证。

## 部署建议

- Cloudflare 默认：**Gemini 2.5 Flash**。
- MiniMax：可作为实验性 fallback，但必须增加输出完整性校验；低于预期菜品数时重试或切 Gemini。
- Qwen：保留本地/独立后端直连；如果必须走 Cloudflare，需要提高 Worker CPU 配额或改变长流转发架构后重新测试。
- 不建议在 Cloudflare 上三模型全量并行调用。生产只调用主模型，低置信度或失败时再 fallback。

机器可读结果：`docs/lab-cloudflare-three-model-benchmark-2026-07-13.json`
