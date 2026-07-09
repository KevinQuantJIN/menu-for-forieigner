# MenuLens UI 交接文档

你们只需要改一个文件：**`public/index.html`**。全部 UI（HTML/CSS/JS）都在里面，改完刷新浏览器即可生效。

## 跑起来

```bash
npm install
npm run dev
```

打开 http://localhost:3000 。没有配置 API Key 时服务端自动进入 **mock 模式**：随便选一张图片，就会按当前选择的餐厅流式吐出完整可见菜品列表，覆盖分组、过敏原两级标签、辣度、素食、无价格等 UI 形态。

也可以直接双击打开 `public/index.html`。在 `file://` 模式下，点 **Scan Menu** 会直接走浏览器内置 mock，不会弹文件选择器，也不会请求 `/api/analyze`。

当前 demo 有三家 mock 餐厅可选：

| 店 | 菜系 | Mock 菜品数 | 参考截图 |
|---|---|---|---|
| 马旺子 | 川菜 | 54 | `reference-menu-data/mawangzi-sichuan/images` |
| 利苑酒家 | 粤菜 | 72 | `reference-menu-data/lei-garden-cantonese/images` |
| 北京菜餐厅 | 北京菜 | 60 | `reference-menu-data/beijing-cuisine/images` |

完整压缩包在仓库根目录：`reference-menu-data.zip`。

- 手机真机预览：`npm run dev -- -H 0.0.0.0`，手机连同一 Wi-Fi 访问 `http://<电脑IP>:3000`
- 想让 mock 出卡更快或更慢：`MOCK_DELAY_MS=100 npm run dev`

## 数据怎么来的

页面 `analyze()` 函数 POST `/api/analyze`，响应是**流式 NDJSON**，每行一个事件：

| 事件 | 含义 |
|---|---|
| `{"type":"dish","data":Dish}` | 一道菜，按菜单出现顺序推送，来一条渲染一张卡 |
| `{"type":"error","code":...}` | 出错（`not_a_menu` / `unreadable` / `upstream_error`），流终止 |
| `{"type":"done","total":n}` | 正常结束 |

`Dish` 字段完整定义见 `src/lib/contract.ts`，这是唯一事实来源：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 菜单出现顺序，从 1 起，可当 key 用 |
| `category` | string \| null | 菜单自带分区的译名，分组 UI 靠它；无分区为 null |
| `nameCn` | string | 中文原名 |
| `pinyin` | string | 带声调拼音 |
| `name` | string | 目标语言译名 |
| `description` | string | 一句话介绍（目标语言） |
| `price` | string \| null | 菜单原样，如 `¥28` |
| `spicy` | 0-3 | 辣度 |
| `vegetarian` | boolean | 素食 |
| `allergens` | `{type, level}[]` | type 是 9 个固定枚举；level 是 `contains`（红）/ `may_contain`（黄） |
| `ingredients` | string[] | 主要成分 3-5 个 |

## 改 UI 时的边界

- 可以改：`public/index.html` 里的一切，包括布局、样式、卡片结构、分组交互、动效。
- 关键函数：`appendDish()`（分组渲染）、`dishCardHTML()`（卡片模板）、`showError()`（错误态）、`analyze()`（流式读取）。
- 保留：模型输出插入 DOM 前过 `esc()` 转义；坏行静默丢弃。
- 不要动：`src/lib/contract.ts` 里的字段名和枚举，除非三人同步契约。
- 所有数据都走 `/api/analyze`。
- 页面底部过敏原免责声明是产品要求，不要删除。

## 常见问题

- 卡片顺序：dish 按菜单顺序到达，分组按该组第一道菜出现的时间排序，保证首屏尽快出卡。
- UI 文案：界面文字用英文；菜品内容语言由右上角切换器控制。
- 真实模型：拿到 Key 后在仓库根建 `.env.local` 写 `DASHSCOPE_API_KEY=sk-xxx`，重启 dev server 即可，UI 代码不用改。
