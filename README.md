# dsh-sorftime-research · Amazon 选品研究

9 套 Amazon 选品分析方法技能（Sorftime / 卖家精灵 / Sif / 西柚）+ 一本「研究记录」：
每次分析完把结论、用过的方法、报告路径存下来，下次直接翻。侧栏是「选品研究」工作台（布局对齐「投资尽调」）。

## 装了什么

| 能力 | 说明 |
|---|---|
| 9 个方法技能 | `product-research` 选品调研 · `category-selection` 品类选择 · `keyword-research` 关键词 · `review-analysis` 评论 · `amazon-analyse` 竞品 Listing 拆解 · `amazon-listing-builder` Listing 优化 · `sellersprite-amazon-research` 卖家精灵 · `sif-amazon-research` Sif · `xiyou-insight` 西柚 |
| `sorftime_module` | 查方法：`list` / `search` / `get` 取完整流程；**每次 get/search 都会记进生成历史** |
| `sorftime_research` | 研究记录：`save`（主题/类型/站点/ASIN/方法/结论 go·watch·no-go/核心发现/报告路径）、`list`、`get`、`delete`、`history`、`stats` |
| 侧栏工作台 | `/sorftime-research/`：概览 · 研究记录 · 生成历史 · 发起研究 · 方法技能库 · 研究流程 |

## 用法

对话里：

- **「分析下宠物用品类目的选品机会，看有没有低评论高需求的细分」**
- **「研究一下 B0XXXXXXX 这个竞品的流量结构和关键词布局」**
- **「这类目 top100 评论里用户最痛的是什么，退货原因是什么」**

模型先 `sorftime_module search` 匹配方法、`get` 拿完整流程 → 按流程取数分析 → 用 `sorftime_research save` 存一条结论卡。

## 侧栏工作台

| 页面 | 内容 |
|---|---|
| 概览 | 研究记录 / 已完成 / 查方法次数 / 历史事件 / 方法数；最近结论、最近动作 |
| 研究记录 | 结论卡列表：主题、类型、站点、ASIN、结论徽标（推荐/观望/放弃）、核心发现预览；可按类型/结论筛、搜索 |
| 记录详情 | 全部字段、核心发现、用过的方法（点进方法正文）、报告路径、这条记录的变更；继续研究 / 删除 |
| 生成历史 | 查方法 / 新建记录 / 更新 / 删除事件流，可按类型筛、搜关键词，点开看详情 |
| 发起研究 | 填主题/类型/站点/ASIN/类目/想回答的问题 → 打开新对话并带上「选方法 → 跑数据 → 存结论」指令 |
| 方法技能库 | 9 套方法按用途分组（选品 / 流量 / 竞品 / 转化 / 数据源），可搜索；点开看完整流程，可「用这个方法研究」 |
| 研究流程 | 四步流程、9 套方法对照表、数据源 MCP 说明、常见问题 |

## 数据目录

`$DSH_HOME/sorftime-research/`（默认 `C:\Users\<你>\.dsh\sorftime-research\`）

- `records.json`：研究记录（最多 200 条）
- `history.json`：生成历史（查方法 / 新建 / 更新 / 删除，最多 400 条）

## 数据源

正文里提到的 **Sorftime / 卖家精灵 / Sif / 西柚** 都是 MCP 服务，需要在 dsh 里配置对应 MCP 服务器与 token。
没配置时模型照样输出分析框架和公开数据部分，数据缺口标注 N/A——不会编数据。

## 自检

```bash
npm install
npm test                      # 9 个技能加载/搜索 + 工具 schema + 鉴权语义
npm run selftest              # 技能正文 + 面板 API 健康
node scripts/api-test.mjs     # 起本地 http 打一遍工作台接口（不碰真实数据）
npm run build                 # client.js → dist/client.js（宿主加载的是这个产物）
```

## 安装

```bash
dsh plugin --profile web add dsh-sorftime-research
```

本地开发（link 安装）时宿主只认 profile 的 `dsh.profile.bundles`；改了 `lib/`、`src/` 需要重启一次 DeepSeek Harness，
改了 `client.js` 要先 `npm run build` 再刷新页面。

## 许可

MIT（liangdabiao）
