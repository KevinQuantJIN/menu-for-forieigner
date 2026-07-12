# Chopstory 本地直连模型基准报告

生成时间：2026-07-12T16:45:35.921Z

## 结论

1. **质量优先：Qwen 3.6 Flash 北京直连。** 全部 14 张均有效输出，625 条 gold 上严格名称召回 87.7%、精确率 85.5%，是本轮综合质量第一；首条 P50 1.42s。
2. **整页完成速度优先：Gemini 2.5 Flash。** 14/14 有效，总耗时 P50 9.10s，约为 Qwen/MiniMax 的一半；名称召回 81.3%。首条内容则是 Qwen 更快。
3. **均衡备选：MiniMax M3 直连。** 14/14 有效，名称召回 85.4%，接近 Qwen，但精确率和速度略逊。
4. **暂不作为主路径：Doubao、StepFun、Gemini Flash-Lite。** Doubao 只有 10/14 有效且首条 P50 超过 20 秒；StepFun 有超时且严格名称质量低；Flash-Lite 虽无技术错误，但输出质量波动大。

## 测试口径

- 数据集：`/Users/kevin/Downloads/chopstory-test-data`
- 14 张菜单图片，625 条 gold 菜品。
- 每个模型逐图片运行一次，共 6 个本地直连 model+transport、84 次模型请求。
- 模式：`extract_only`；temperature 0；max output tokens 8192；单图服务端超时 80 秒，客户端上限 95 秒。
- 失败、超时和零输出均按 0 召回计入全数据集质量，不只统计成功样本。
- 延迟 P50/P95 只基于无错误且至少输出一道菜的请求，并同时单列有效率。
- 按用户最终指示，Cloudflare 与 OpenRouter 不运行/不纳入本报告。

## 总表

| Provider | Model | 有效请求 | 名称召回 | 名称精确率 | 价格严格一致 | 首条 P50 / P95 | 总耗时 P50 / P95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen | `qwen3.6-flash` | 14/14 (100.0%) | 87.7% | 85.5% | 66.0% | 1.42s / 2.57s | 19.41s / 54.09s |
| minimax | `MiniMax-M3` | 14/14 (100.0%) | 85.4% | 75.6% | 66.5% | 4.41s / 6.72s | 19.22s / 49.32s |
| gemini | `gemini-2.5-flash` | 14/14 (100.0%) | 81.3% | 74.8% | 70.9% | 2.94s / 5.19s | 9.10s / 29.51s |
| doubao | `doubao-seed-2-0-lite-260428` | 10/14 (71.4%) | 57.1% | 86.9% | 74.1% | 21.61s / 41.68s | 45.12s / 79.73s |
| gemini | `gemini-2.5-flash-lite` | 14/14 (100.0%) | 49.1% | 44.9% | 69.1% | 4.21s / 13.03s | 12.77s / 32.21s |
| stepfun | `step-1o-turbo-vision` | 12/14 (85.7%) | 35.2% | 41.0% | 57.8% | 1.57s / 3.95s | 30.55s / 70.65s |

## 稳定性

| 路径 | 错误请求 | 零输出 | 错误类型 |
| --- | ---: | ---: | --- |
| qwen / qwen3.6-flash | 0 | 0 | — |
| minimax / MiniMax-M3 | 0 | 0 | — |
| gemini / gemini-2.5-flash | 0 | 0 | — |
| doubao / doubao-seed-2-0-lite-260428 | 4 | 2 | provider_http_500 × 1; timeout_or_abort × 3 |
| gemini / gemini-2.5-flash-lite | 0 | 0 | — |
| stepfun / step-1o-turbo-vision | 2 | 0 | timeout_or_abort × 2 |

## 最差样本证据

- **qwen / qwen3.6-flash**
  - M001_P03.jpg: recall 41.7%, 15 predictions
  - M004_P01.jpg: recall 55.6%, 64 predictions
  - M001_P04.jpg: recall 84.6%, 15 predictions
- **minimax / MiniMax-M3**
  - M004_P01.jpg: recall 56.9%, 65 predictions
  - M001_P01.jpg: recall 71.4%, 14 predictions
  - M001_P04.jpg: recall 76.9%, 13 predictions
- **gemini / gemini-2.5-flash**
  - M001_P03.jpg: recall 41.7%, 13 predictions
  - M004_P01.jpg: recall 51.4%, 65 predictions
  - M001_P04.jpg: recall 53.8%, 14 predictions
- **doubao / doubao-seed-2-0-lite-260428**
  - M001_P06.jpg: recall 0.0%, 0 predictions, provider_rejected:HTTP 500
  - M006_P01.jpg: recall 0.0%, 0 predictions, aborted:aborted
  - M004_P01.jpg: recall 2.8%, 10 predictions, aborted:aborted
- **gemini / gemini-2.5-flash-lite**
  - M001_P03.jpg: recall 0.0%, 16 predictions
  - M001_P04.jpg: recall 0.0%, 15 predictions
  - M005_P01.jpg: recall 1.8%, 1 predictions
- **stepfun / step-1o-turbo-vision**
  - M008_P01.jpg: recall 0.0%, 48 predictions, aborted:aborted
  - M001_P04.jpg: recall 7.7%, 24 predictions
  - M006_P01.jpg: recall 7.8%, 51 predictions

## 评分边界

- 名称评分使用 NFKC、大小写与常见标点/空格归一化后的精确匹配；不自动处理简繁体转换、同义词或菜名语义近似。因此这是严格可复现分数，不等同于人工语义召回。
- 价格评分是 NFKC + trim 后的严格字符串一致，例如 `¥38`、`38元`、`38` 会被视为不同。价格分适合发现输出格式不一致，不应单独代表视觉识别能力。
- Gemini Flash-Lite 与部分模型存在“技术上完整返回，但内容重复/拆分异常”的情况；有效请求率不会捕捉这类质量故障，必须结合召回和精确率。
- 本报告每个模型只跑一轮。质量覆盖完整数据集，但延迟仍会受当时网络与服务负载影响；上线前建议对前三名再做 3 轮重复测试。

## 建议

- 默认识别路径：**Qwen 3.6 Flash 北京直连**。
- 对首条内容与质量都敏感时使用 **Qwen**；更看重整页尽快完成时使用 **Gemini 2.5 Flash**。
- 保留 **MiniMax M3** 作为第三路故障切换与交叉验证候选。
- 在进入生产前，把价格输出规范化为统一结构（数值、币种、单位、时价标志），再重新评估价格准确率。

机器可读汇总：`docs/lab-local-direct-benchmark-2026-07-12.json`
原始逐图结果：`.gstack/benchmark-reports/raw/local-results.jsonl`（报告只使用非 OpenRouter 行）
