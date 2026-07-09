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

真实模型：仓库根建 `.env.local`：

```bash
DASHSCOPE_API_KEY=sk-xxx
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `DASHSCOPE_API_KEY` | 阿里云百炼 Key。缺省时自动走 mock |
| `DASHSCOPE_BASE_URL` | 可选。国际版 Key 设 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| `MOCK_LLM=1` | 强制 mock 模式 |
| `MOCK_DELAY_MS` | mock 每道菜的延迟，默认 80 |
| `MENULENS_MODEL` | 覆盖模型名，默认 `qwen-vl-max` |

## 测试

```bash
npm test
npm run build
```

## 部署

Cloudflare Workers 配置已包含：

```bash
npx wrangler login
npx wrangler secret put DASHSCOPE_API_KEY
npm run deploy
```
