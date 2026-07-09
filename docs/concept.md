# MenuLens — 菜单拍照识别 Demo 设计文档

- 日期：2026-07-09
- 场景：Hackathon demo
- 一句话：外国游客在中国拍菜单，AI 流式返回每道菜的译名、一句话介绍、过敏原、成分、辣度。

## 1. 背景与目标

外国人来中国旅游不会点菜：看不懂菜名、不知道菜里有什么、担心过敏原、被"夫妻肺片"这类文化菜名吓退。MenuLens 让用户拍一张菜单照片，几秒内得到每道菜的可读解释。

**Demo 成功标准**：评委用自己手机扫码 → 拍打印菜单 → 3 秒内第一张菜品卡片出现 → 30 秒内整单分析完成。

## 2. 已确认的产品决策

| 决策点 | 结论 |
|---|---|
| 载体 | 移动端 Web App（H5），扫码即用，无注册登录 |
| 个性化 | 不做。无过敏原档案、无历史记录、无账号 |
| 结果呈现 | 流式逐菜卡片，一屏给全信息，无详情页 |
| 输出语言 | 语言切换器：English（默认）/ 日本語 / 한국어 / Español / Français，存 localStorage |
| OCR | 不做独立 OCR，多模态视觉大模型一步到位 |
| 模型 | 阿里云百炼 DashScope `qwen-vl-max`（OpenAI 兼容协议，stream=true） |
| 服务端 | 薄代理，仅一个接口 `/api/analyze`，Key 只存服务端环境变量 |
| 部署 | Docker → 香港轻量云服务器（免 ICP 备案，国内手机直连可达，到 DashScope 通畅） |

**明确不做**：个性化档案、历史记录、点菜清单生成、多图拼接、账号体系、数据库。

## 3. 团队分工与边界

- **Kevin**：`/api/analyze` 完整实现（prompt + 模型调用 + 流式转发）、数据契约、一版跑通全流程的参考 UI。
- **两位队友**：基于数据契约对结果页 UI 做调整与分组重构。
- **分工边界 = 第 4 节的数据契约。** 契约冻结后，前后端可完全并行。

## 4. 数据契约（接口冻结项，改动需三人同步）

### 4.1 请求

```
POST /api/analyze
Content-Type: application/json

{
  "image": string, // dataURL（前端已压缩的 JPEG base64）
  "lang": "en" | "ja" | "ko" | "es" | "fr"
}
```

### 4.2 响应

`Content-Type: text/x-ndjson`，流式返回。每行一个独立 JSON 对象，为以下三种事件之一：

```
{ "type": "dish", "data": Dish } // 一道菜，按菜单出现顺序推送
{ "type": "error", "code": ErrorCode } // 出现即终止流
{ "type": "done", "total": number } // 正常结束标记，total = 菜品总数
```

```typescript
type ErrorCode = "not_a_menu" | "unreadable" | "upstream_error";

interface Dish {
  id: number; // 菜单出现顺序，从 1 起
  category: string | null; // 菜单自带分区的目标语言译名（如 "Cold Dishes"）；菜单无分区则 null
  nameCn: string; // 中文原名，照抄菜单
  pinyin: string; // 带声调拼音，供游客读给服务员
  name: string; // 目标语言译名
  description: string; // 一句话介绍，目标语言，见 5.2
  price: string | null; // 原样保留菜单写法，如 "¥28"、"28/份"；无价格为 null
  spicy: 0 | 1 | 2 | 3; // 0 不辣 … 3 很辣
  vegetarian: boolean;
  allergens: AllergenTag[];
  ingredients: string[]; // 主要成分 3-5 个，目标语言
}

interface AllergenTag {
  type: Allergen;
  level: "contains" | "may_contain"; // 见 5.3 置信度规则
}

type Allergen =
  | "peanut" | "tree_nut" | "gluten" | "soy" | "dairy"
  | "egg" | "fish" | "shellfish" | "sesame"; // 美国 Big 9，封闭枚举
```

### 4.3 契约约定

- 枚举封闭：`allergens.type`、`spicy`、`lang`、`error.code` 均为封闭集合，UI 可放心穷举。
- `category` 是 UI 分组的依据；同一分区的菜 `category` 字符串完全一致。
- 事件顺序：0..n 条 `dish` → 1 条 `done`；或若干 `dish` 后 1 条 `error`（流即终止）。
- 前端解析：按 ` ` 切分逐行 `JSON.parse`，忽略空行与解析失败的行（容忍模型偶发脏输出）。

## 5. AI 分析设计

### 5.1 单次调用

一次 `qwen-vl-max` 调用完成：读字 → 理解版式（菜名/价格/分区标题）→ 菜品知识推理 → 目标语言生成。无独立 OCR 环节。

### 5.2 一句话介绍的定位

任务不是翻译，而是**消除恐惧、建立期待**。文化菜名必须解释实质：例如"夫妻肺片" → "Don't worry — no lungs. Sliced beef offal in fragrant chili oil, a beloved Sichuan cold dish."

### 5.3 过敏原诚实性规则（写入 prompt）

- `contains`：菜名本身或几乎所有做法都含（宫保鸡丁 → peanut）。
- `may_contain`：常见变体或常见配料可能含。
- **禁止滥标**：不得为显得全面而给所有菜标 may_contain；"中餐普遍使用花生油/芝麻油"这一事实放页面级免责声明统一提示，不进卡片。
- 页面常驻免责声明："AI-estimated from typical recipes, not actual ingredients. Chinese kitchens commonly use peanut and sesame oil. If you have severe allergies, always confirm with staff."

### 5.4 输出格式约束（prompt 层）

- 强制 NDJSON：每行一个完整 JSON 对象，无 markdown 代码块、无前置总结、无尾注。
- 按菜单出现顺序输出，首道菜尽早输出（首 token 即首卡）。
- 图片不是菜单 → 仅输出 `{"type":"error","code":"not_a_menu"}`；全糊不可读 → `unreadable`。

## 6. 技术架构

```
评委手机（国内网络）
   │ HTTPS
   ▼
Next.js 15 全栈（香港轻量云服务器，Docker 部署）
   ├─ 前端（React + Tailwind CSS）
   │ · canvas 压缩：长边 1568px / JPEG q0.8 / 目标 ≤300KB
   │ · <input type="file" capture="environment"> 唤起相机
   │ · fetch ReadableStream 逐行解析 NDJSON → 逐卡渲染
   └─ POST /api/analyze
       · 校验请求 → 组装 prompt → 调 DashScope（stream=true）
       · 将模型增量输出规整为契约事件流透传
       · API Key 仅存服务端环境变量
   ▼
阿里云百炼 DashScope qwen-vl-max
```

### 速度优化（P0）

| 手段 | 收益 |
|---|---|
| 前端压缩后上传 | 4MB → ~300KB，弱网省 5-10 秒 |
| NDJSON 流式逐卡渲染 | 感知等待 ~20s → ~3s |
| Prompt 禁止前置总结 | 首 token 即首卡 |
| 拍照后立即显示缩略图 + 骨架屏 | 消除"点了没反应"焦虑 |
| 服务器↔DashScope 低 RTT | 流顺滑 |

### 错误处理

| 场景 | 行为 |
|---|---|
| 非菜单 / 全糊 | `error` 事件 → 前端友好提示重拍 |
| 模型超时 / 断流 | 已出卡片保留，展示 Retry 按钮 |
| 单请求硬超时 | 60s，服务端主动断开并发 `error` |
| 模型偶发脏行 | 前端逐行解析，坏行丢弃不崩 |

## 7. 交付物与演示准备

- 公网可扫码 URL + 二维码。
- 道具：打印 2 张真实中文菜单，其中一张包含"夫妻肺片、蚂蚁上树、宫保鸡丁"（文化梗 + 过敏原双记忆点）。
- 30 秒演示脚本：扫码 → 切日语 → 拍菜单 → 卡片流式蹦出 → 讲夫妻肺片的故事。

## 8. 依赖（需 Kevin 准备）

1. 阿里云百炼 API Key（服务端环境变量 `DASHSCOPE_API_KEY` 注入，不入库不入代码）。
2. 一台香港（或公司现成）可公网访问的服务器。


