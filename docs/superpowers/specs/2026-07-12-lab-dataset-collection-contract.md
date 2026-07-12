# Chopstory Lab 测试数据集采集契约 v1

日期：2026-07-12  
版本：`chopstory-menu-benchmark/1.0`  
用途：菜单视觉提取与完整菜品卡模型评测  
数据性质：内部评测，不用于模型训练或对外分发

## 1. 交付目标

采集方交付一个 ZIP 包，解压后必须符合本契约。数据分成两层：

1. **视觉事实金标**：图片上客观可见的菜名、价格、分类和顺序，用于自动评分。
2. **菜品知识评审**：对部分代表菜的英文解释、典型配料和风险提示做人工评审，用于 Full Dish 赛道；不得冒充餐厅实际配方。

禁止用某个待测模型的输出直接充当金标。模型或 OCR 可以辅助初标，但所有正式金标必须由人逐项对照原图确认。

## 2. 目录结构

```text
chopstory-menu-benchmark-v1/
├── dataset.json
├── pages.jsonl
├── items.jsonl
├── knowledge-reviews.jsonl
├── images/
│   ├── cn-shanghai-sichuan-0001-p01.jpg
│   ├── cn-shanghai-sichuan-0001-p02.jpg
│   └── ...
└── README.md
```

- `dataset.json`：整包元数据和统计。
- `pages.jsonl`：一行对应一张菜单图片。
- `items.jsonl`：一行对应图片中一个菜品条目。
- `knowledge-reviews.jsonl`：一行对应一个人工评审过的标准菜品；首批允许为空文件，但 Full Dish 正式评测前必须补齐。
- `images/`：原始图片，不要在交付前统一压缩或缩放。
- 所有文本文件使用 UTF-8、LF 换行。

## 3. ID 规则

### 3.1 menuSetId

同一次拍摄、属于同一份菜单的多页图片共享一个 `menuSetId`：

```text
cn-<city>-<cuisine>-<4位序号>
```

示例：`cn-chengdu-sichuan-0007`

### 3.2 sampleId

每张图片的唯一 ID：

```text
<menuSetId>-p<2位页码>
```

示例：`cn-chengdu-sichuan-0007-p02`

### 3.3 itemId

每个视觉菜品条目的唯一 ID：

```text
<sampleId>-i<3位顺序号>
```

示例：`cn-chengdu-sichuan-0007-p02-i013`

ID 一经交付不得因修正文案而改变。删除错误记录时保留 changelog，不复用 ID。

## 4. dataset.json

```json
{
  "schemaVersion": "chopstory-menu-benchmark/1.0",
  "datasetId": "chopstory-benchmark-2026-07-a",
  "createdAt": "2026-07-20T12:00:00Z",
  "usage": "internal_evaluation_only",
  "defaultLocale": "zh-CN",
  "counts": {
    "menuSets": 20,
    "pages": 81,
    "readableItems": 1500,
    "knowledgeReviews": 50
  },
  "splits": {
    "calibrationPages": 21,
    "holdoutPages": 60
  },
  "collector": "team-or-vendor-name",
  "notes": "Existing 21 project images are calibration only."
}
```

所有计数必须与 JSONL 文件实际内容一致。

## 5. pages.jsonl

每行一个 JSON 对象：

```json
{"schemaVersion":"1.0","sampleId":"cn-chengdu-sichuan-0007-p02","menuSetId":"cn-chengdu-sichuan-0007","imagePath":"images/cn-chengdu-sichuan-0007-p02.jpg","imageSha256":"64-char-lowercase-hex","split":"holdout","pageIndex":2,"pageCount":4,"restaurant":{"id":"restaurant-anonymous-0007","nameCn":"马旺子","city":"成都","province":"四川","cuisineFamily":"sichuan"},"capture":{"sourceType":"phone_photo","menuMedium":"paper","capturedAt":"2026-07-18T11:30:00+08:00","originalWidth":3024,"originalHeight":4032,"originalBytes":2840192},"layout":{"type":"multi_column","density":"dense"},"difficulty":{"overall":"medium","blur":0,"glare":1,"skew":1,"occlusion":0,"lowLight":0},"readableItemCount":24,"partiallyReadableItemCount":1,"verifiedBy":"reviewer-02","verifiedAt":"2026-07-19T09:00:00Z","usageRights":"internal_evaluation","notes":null}
```

### 5.1 必填字段

| 字段 | 类型 | 规则 |
|---|---|---|
| `schemaVersion` | string | 固定 `1.0` |
| `sampleId` | string | 全局唯一，与文件名主干一致 |
| `menuSetId` | string | 同一菜单多页共享 |
| `imagePath` | string | ZIP 内相对路径 |
| `imageSha256` | string | 原始文件 SHA-256，小写十六进制 |
| `split` | enum | `calibration` 或 `holdout` |
| `pageIndex` | integer | 从 1 开始 |
| `pageCount` | integer | 同一 menuSet 总页数 |
| `restaurant.city` | string | 城市中文名 |
| `restaurant.province` | string | 省级行政区中文名 |
| `restaurant.cuisineFamily` | enum | 见下方枚举 |
| `capture.sourceType` | enum | 见下方枚举 |
| `capture.menuMedium` | enum | 见下方枚举 |
| `capture.originalWidth` | integer | 原图像素宽 |
| `capture.originalHeight` | integer | 原图像素高 |
| `capture.originalBytes` | integer | 原文件字节数 |
| `layout.type` | enum | 见下方枚举 |
| `layout.density` | enum | `sparse`、`normal`、`dense` |
| `difficulty.*` | enum/integer | overall 见枚举；各缺陷为 0–3 |
| `readableItemCount` | integer | 与 items 中 readable 数一致 |
| `verifiedBy` | string | 人工复核者 ID，不写敏感个人信息 |
| `verifiedAt` | ISO 8601 | 完成人工复核的时间 |
| `usageRights` | enum | 固定 `internal_evaluation` |

餐厅名称可以为 null 或匿名化；城市、菜系和版式属性不可缺。

### 5.2 枚举

`cuisineFamily`：

```text
sichuan
cantonese
beijing_northern
hunan
jiangsu_zhejiang_shanghai
fujian
shandong
anhui
xinjiang_northwest
yunnan_guizhou
hotpot
mixed_other
```

`sourceType`：

```text
phone_photo
screenshot
scan
```

`menuMedium`：

```text
paper
tablet
wall_board
qr_web
mini_program
delivery_app
other
```

`layout.type`：

```text
single_column
multi_column
grid
mixed
```

`difficulty.overall`：

```text
easy
medium
hard
```

各图像缺陷评分：`0=无`、`1=轻微`、`2=明显`、`3=严重但仍有可读内容`。

## 6. items.jsonl

每行是图片中一个视觉条目，必须严格按图片从上到下、从左到右编号：

```json
{"schemaVersion":"1.0","itemId":"cn-chengdu-sichuan-0007-p02-i013","sampleId":"cn-chengdu-sichuan-0007-p02","ordinal":13,"legibility":"readable","categoryCn":"荤菜","categorySource":"printed","nameCn":"酸汤蛤蜊煮生蚝","price":"¥139","sourceText":"酸汤蛤蜊煮生蚝 ¥139","bbox":[0.205,0.311,0.934,0.348],"duplicateOfItemId":null,"notes":null}
```

### 6.1 字段规则

| 字段 | 类型 | 规则 |
|---|---|---|
| `itemId` | string | 全局唯一 |
| `sampleId` | string | 必须存在于 pages.jsonl |
| `ordinal` | integer | 每页从 1 连续递增 |
| `legibility` | enum | `readable`、`partial`、`unreadable` |
| `categoryCn` | string/null | 只抄图片明确显示的分类，不推断 |
| `categorySource` | enum | `printed`、`selected_tab`、`none` |
| `nameCn` | string/null | 按原图逐字抄录；无法确认则 null |
| `price` | string/null | 原样保留货币符号、单位、规格和斜杠 |
| `sourceText` | string/null | 菜名所在整行的可见文字 |
| `bbox` | number[4]/null | 可选，归一化 `[x1,y1,x2,y2]`，范围 0–1 |
| `duplicateOfItemId` | string/null | 图片中明确重复时指向首次出现条目 |

禁止做以下清洗：

- 不把繁体改成简体
- 不修正餐厅自己写的错别字
- 不补全图片中没有出现的币种或单位
- 不把 `38/58` 拆成两个价格
- 不将套餐内容擅自拆成独立菜，除非视觉上它们是可单点条目
- 不因同名而删除视觉重复；用 `duplicateOfItemId` 标记

自动评分的默认分母只包括 `legibility=readable`。`partial` 和 `unreadable` 用于分析失败边界，不计入主召回率。

## 7. knowledge-reviews.jsonl

此文件评估模型的知识输出，与视觉金标分开。每行对应一个标准菜品：

```json
{"schemaVersion":"1.0","canonicalDishId":"cn-dish-mapo-tofu","aliasesCn":["麻婆豆腐"],"pinyin":"má pó dòu fu","preferredNameEn":"Mapo tofu","acceptableNamesEn":["Mapo bean curd"],"decisionDescriptionEn":"Soft tofu and minced meat in a spicy, numbing Sichuan chili-bean sauce.","typicalIngredients":["tofu","minced pork or beef","doubanjiang","Sichuan pepper"],"spicyRange":[2,3],"textures":[],"allergenRisks":[{"type":"soy","risk":"typical","evidence":"canonical_recipe","note":"Tofu and doubanjiang are soy-based."}],"story":{"status":"verified","text":"The dish is traditionally associated with a Chengdu restaurateur nicknamed Mapo.","source":"human-reviewed reference"},"reviewStatus":"human_verified","reviewers":["food-reviewer-01","safety-reviewer-01"],"reviewedAt":"2026-07-19T12:00:00Z"}
```

规则：

- `allergenRisks.risk` 只能是 `observed`、`typical`、`possible`。
- `typical` 不等于这家餐厅实际使用；不得写成餐厅已确认事实。
- `story.status` 只能是 `verified` 或 `omit`；不确定就 omit。
- 过敏风险必须由第二位 reviewer 复核。
- 知识评审至少覆盖 50 道菜，其中至少 20 道包含文化菜名、内脏、骨头、特殊口感或常见隐藏过敏风险。

## 8. 数量和覆盖要求

### 8.1 v1 硬性目标

- 项目已有 21 页全部标为 `calibration`
- 新增至少 60 页，全部标为 `holdout`
- 总计至少 20 个 menu set
- 至少 1,200 个 readable 菜品条目，目标 1,500+
- 至少 6 个 cuisineFamily
- 至少 4 个城市
- 至少 10 个多页 menu set
- 新增图片中至少 50% 为真实手机拍摄
- 新增图片中至少 25% 标为 hard
- 新增图片中至少 30% 为 dense
- 至少 50 道 knowledge review

### 8.2 难度分布

新增 60 页建议分布：

| 难度 | 页数 | 特征 |
|---|---:|---|
| easy | 15 | 正拍、清晰、单列或简单网格 |
| medium | 30 | 多列、小字、轻微反光或倾斜 |
| hard | 15 | 密集小字、明显反光/透视/局部遮挡，但人仍可读 |

不要为了凑 hard 收集人眼也无法识别的废片。完全不可用图片可以另存 failure corpus，但不计入 60 页。

## 9. 图片采集规则

- 保留相机或截图原始文件；不要先压成项目当前的 1000px JPEG
- 单张图片只包含一页或一个连续菜单视图
- 多页必须按真实页序设置 pageIndex
- 允许拍摄倾斜、反光和暗光样本，但必须保留可读区域
- 不收 AI 生成菜单
- 不收已叠加 OCR 框、翻译或标注的图片作为原图
- 去除或裁掉手机号、地址、订单号、头像、支付信息等个人数据
- 不应包含可识别的顾客或工作人员面部；无法避开时先做隐私处理，并在 notes 记录
- 确认图片可用于内部产品评测，`usageRights=internal_evaluation`

## 10. Calibration 与 Holdout

- `calibration`：允许开发者查看金标、调 prompt 和调 parser；现有 21 张图全部属于此组。
- `holdout`：不得用于逐图调 prompt。只允许评测脚本读取金标并输出聚合结果。
- 同一 menuSet 的所有页面必须处于同一 split。
- 同一家餐厅同一版本菜单不得横跨两个 split。

## 11. 人工标注流程

1. Collector 上传原图并填 pages 元数据。
2. Labeler 逐图录入 items，可使用 OCR 做初稿。
3. Reviewer 对照原图逐项检查菜名、价格、顺序和分类。
4. 验证脚本检查 schema、hash、计数和引用关系。
5. Holdout 抽取至少 20% 页面由第二人复核；发现单页超过 1 个错误时，该批次扩大到 100% 复核。
6. Knowledge review 由菜品内容 reviewer 和安全 reviewer 双人确认。

`verifiedBy` 不能填写自动化工具或模型名称。

## 12. 自动验收规则

交付包必须通过以下检查：

- 所有 JSON/JSONL 可解析
- schemaVersion 正确
- sampleId、itemId 全局唯一
- imagePath 存在且 SHA-256 匹配
- 图片尺寸和字节数与 pages 记录一致
- 同一 menuSet 的 pageIndex 从 1 连续到 pageCount
- 每页 ordinal 从 1 连续递增
- readableItemCount 与 items 实际数量一致
- duplicateOfItemId 引用有效且位于同一 menuSet
- calibration/holdout 没有餐厅菜单泄漏
- 数据量与覆盖配额满足第 8 节
- 不包含明显个人敏感信息

验收失败时，采集方提交修正版并在 README 的 changelog 中记录修改，不直接覆盖后不留痕迹。

## 13. 最小交付示例

采集团队可先交一个 2 页 pilot 包进行格式验收。Pilot 通过后再开始大规模采集，避免 60 页完成后才发现 ID、页序或价格抄录规则不一致。

