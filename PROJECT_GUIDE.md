# 📌 Market Pulse — 项目全景架构与关键技术实现说明

本文档对 **Market Pulse** 大盘走势与情绪/恐慌指数叠加对比系统的整体思路、架构设计、核心算法与模块职责进行全面梳理。

---

## 一、 项目概述 (Project Overview)

**Market Pulse** 是一个专注于 **A股、美股、黄金避险** 三大全球核心市场的数据可视化平台。通过将核心股票大盘指数与相对应的市场波动率/恐慌指数（VIX / VXFXI / GVZ）进行同框叠加对比，帮助投资者快速识别市场情绪拐点、超买超卖区间及避险情绪升温状态。

### 核心技术栈
* **前端核心**：HTML5 + 原生 Vanilla JavaScript（无框架、无构建步骤）
* **设计系统**：原生 Vanilla CSS（极简深色玻璃拟态 Glassmorphism 设计，无 Tailwind 依赖）
* **图表引擎**：[Chart.js 4.4.3](https://www.chartjs.org/) HTML5 Canvas 渲染（CDN 引入）
* **后端代理**：Node.js 原生 `http` 模块，**零 npm 运行时依赖**
* **数据来源**：Yahoo Finance（主源）+ 东方财富（备选源），磁盘 JSON 持久化缓存

---

## 二、 核心架构设计与解耦思路 (Architecture & Design)

```
                     ┌───────────────────────────────────────┐
                     │          浏览器前端 (app.js)           │
                     └──────────────────┬────────────────────┘
                                        │ /api/merged?symbol=...
                          ┌─────────────┴─────────────┐
                          ▼                           ▼
                 ┌─────────────────┐        ┌──────────────────┐
                 │ 本地 server.js   │        │ Vercel           │
                 │ (静态托管 + API) │        │ api/merged.js    │
                 └────────┬────────┘        └────────┬─────────┘
                          └────────────┬─────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │    lib/datasource.js         │  ← 取数/缓存/合并的唯一实现
                        └───────┬──────────────┬───────┘
                                ▼              ▼
                  ┌──────────────────┐  ┌──────────────────┐
                  │  Yahoo Finance   │  │   东方财富 K 线   │
                  │ (query1, 10y)    │  │ (push2his, 日K)  │
                  └──────────────────┘  └──────────────────┘
                                │              │
                                ▼              ▼
                       data/cache_*.json  data/backup_*.json
```

> **⚠️ 关键约束**：`server.js` 与 `api/merged.js` **不得各自实现取数逻辑**。两者只负责各自运行时的 HTTP 外壳（Node http server / Vercel handler），所有数据行为一律走 `lib/datasource.js`。历史上这两处曾各写一份，导致线上缺少部分标的的备选源映射。

### 1. 三板块多市场系统 (Multi-Market Architecture)
系统采用配置驱动架构（`app.js` 中的 `MARKETS` 配置字典），支持三大板块一键无缝切换：

| 市场板块 | 包含核心指数 / 恐慌指标 | 主题色彩 |
| :--- | :--- | :--- |
| **🇨🇳 A股市场 (`cn`)** | • 沪深 300 (`000300.SS`)<br>• 上证综指 (`000001.SS`)<br>• 科创 50 (`000688.SS`)<br>• 中国概念恐慌 (`^VXFXI`) | 帝王金 / 青 / 品红 (`#F59E0B` / `#06B6D4` / `#EC4899`) |
| **🇺🇸 美股市场 (`us`)** | • 纳斯达克 100 (`^NDX`)<br>• 费城半导体 (`^SOX`)<br>• 标普 500 (`^GSPC`)<br>• CBOE 恐慌指数 (`^VIX`) | 深空科技黑 (`#22d3ee` / `#c084fc` / `#F59E0B`) |
| **🪙 黄金避险 (`gold`)**| • COMEX 黄金期货 (`GC=F`)<br>• COMEX 白银期货 (`SI=F`)<br>• 黄金恐慌指数 (`^GVZ`) | 黑金奢华 (`#FBBF24` / `#94A3B8`) |

---

### 2. 数据源现状与可用性 (Data Source Status)

这是本项目最容易踩坑的部分，务必先读此表再改取数逻辑：

| 标的 | Yahoo 主源 | 东方财富备选源 | 说明 |
| :--- | :--- | :--- | :--- |
| `^NDX` | ✅ 完整 | ✅ `100.NDX100` | 两源数值实测完全一致 |
| `^GSPC` | ✅ 完整 | ✅ `100.SPX` | 同上 |
| `GC=F` | ✅ 完整 | ✅ `101.GC00Y` | 同上 |
| `SI=F` | ✅ 完整 | ✅ `101.SI00Y` | 同上 |
| `000300.SS` | ✅ 完整 | ✅ `1.000300` | |
| `000001.SS` | ✅ 完整 | ✅ `1.000001` | |
| `000688.SS` | ❌ **仅 1 个实时快照点** | ✅ `1.000688` | **完全依赖备选源**，备份缓存丢失时图上无线 |
| `^VIX` | ⚠️ 有约 95 个收盘价空洞 | ❌ 无 | 空洞处走灰色虚线段 |
| `^SOX` | ✅ 完整 | ❌ 无 | 东方财富无费城半导体 |
| `^GVZ` | ✅ 完整 | ❌ 无 | |
| `^VXFXI` | ❌ **仅 1 个实时快照点** | ❌ 无 | 触发 `calcRollingVolatility` 用沪深300 日收益率算 HV 顶替 |

**已废弃的数据源**：
* ~~Stooq (`stooq.com/q/d/l/`)~~ — 已上反爬 JS 校验，返回 HTTP 200 + 验证页 HTML，Node 侧无法绕过，全部标的返回 0 条。已从代码中移除。
* ~~`^VHSI`（恒指波动率）~~ — Yahoo 返回 404 `symbol may be delisted`，东方财富无对应品种，已从 `MARKETS.cn` 配置中移除。`app.js` 中的通用 `vix2` 渲染支路保留，日后接入可用源时只需在配置里加回 `symbols.vix2` 即可生效。

> 上表中标 ❌ 的缺口、以及当前正在发生的临时故障，详见 **[第五节 已知问题与待办](#五-已知问题与待办-known-issues)**。改动取数逻辑前请先读该节。

---

### 3. 缓存策略与限流保护 (`lib/datasource.js`)

* **两级 TTL**：
  - `CACHE_TTL_MS = 10 分钟` — Yahoo 盘中会变，需要高频刷新。
  - `BACKUP_TTL_MS = 6 小时` — 东方财富取的是**日 K 线，每天只收一次盘**，10 分钟重取纯属浪费且极易触发限流。
* **增量刷新（勿改回全量）**：缓存过期后**不重下全量历史**。
  - Yahoo 只拉 `range=5d`，按时间戳合并进本地 10y 缓存：已存在的点用非空新值原地更新（盘中最新价会变；null 不覆盖旧值，避免把历史好数据冲成空洞），新时间戳追加。
  - 备选源只拉最近 10 行（`lmt` / `datalen`），合并进已有的日期映射。
  - 仅无缓存或增量合并失败时才全量抓取（Yahoo 10y / 备选源 3000 行）兜底。
* **缓存优先响应 (`buildMerged`)**：只要磁盘上存在 Yahoo 缓存就**立即返回**（哪怕已过期），过期部分转入后台静默刷新。用户永远不等网络。
* **冷启动熔断**：无任何缓存时并行抓取双源，`COLD_START_MS = 4 秒`到点先返回已有内容，抓取任务继续跑完以写热缓存。
* **⚠️ 东方财富限流保护**（血泪教训，勿删）：
  - 该接口对短时间内的密集请求会**直接重置连接**（`socket hang up`），且封锁持续数十分钟，串行请求也照样拒绝。
  - `BACKUP_STAGGER_MS = 2 秒` — 批量刷新时各标的之间强制错峰，**禁止并发批量请求**。
  - `BACKUP_COOLDOWN_MS = 30 分钟` — 某标的抓取失败后进入冷却，期间跳过不再加压，避免在封锁期持续施压延长封锁时间。
* **失败不污染缓存**：备选源仅在成功解析出数据点时才写盘，抓取失败保留旧缓存。

---

### 4. 数据清洗、缺失标记与补全算法 (`app.js`)

* **双源合并 (`mergeAndValidate`)**：按自然日 `YYYY-MM-DD` 取两源并集，Yahoo 为主、备选补缺、都没有则标 `source: 'missing'`。两源同日收盘价偏差 `> 1%` 时记入 `crossValidation.discrepancies` 并输出服务端告警。
* **缺失数据断点感知 (`missingFlags` & `segment`)**：数据缺失时图表对应时间段呈现**灰色虚线**（Chart.js `segment` 着色），Tooltip 对应行标注「数据缺失」。
* **多源时间轴并集 (`alignData`)**：合并所有指数的自然日并集并做前值填充，防止因单标的缺数据导致整个交易日被丢弃。
* **历史滚动波动率补齐 (`calcRollingVolatility`)**：当恐慌指数仅有实时快照而无历史 K 线时（实时值少于 10 个点即触发），按日收益率计算 **20 日年化历史波动率 (HV %)**：
  $$HV_{20} = \sqrt{\frac{1}{20}\sum_{i=1}^{20}(r_i - \bar{r})^2} \times \sqrt{252} \times 100\%$$

---

### 5. 交互体验与 Chart.js 自定义扩展

* **独立十字线图层**：`crosshairCanvas` 覆盖在 Chart.js 主 canvas 之上，通过两者 `getBoundingClientRect()` 之差做坐标系偏移换算，绘制垂直虚线、各序列交点圆点与底部日期框，避免触发 Chart.js 重绘。
* **Y 轴百分比归一化 (`computeNormalizedRanges`)**：各指数量纲差异巨大（如纳指 28000 vs 白银 57），系统统一计算全局涨跌幅区间后反算各 Y 轴的 min/max，保证**相同视觉高度 = 相同涨跌幅**，这是叠加对比能成立的前提。
* **TradingView 式缩放平移 (`updateChartViewport`)**：滚轮缩放（默认右边缘锚定 / Ctrl 光标锚定）与左键拖拽平移，只改 `datasets[].data` 后 `update('none')`，**不重建 Chart 实例**。
* **跟随式 Tooltip**：固定贴在绘图区顶部内侧，水平跟随鼠标并做边缘 Clamp，绝不遮挡走势曲线；实时计算相较前一交易日的 `(+X.XX%)` 变化。
* **时间范围**：1个月 / 3个月 / 6个月 / 今年(YTD) / 1年 / 2年 / 5年 / 10年。

---

## 三、 项目目录与文件职责说明

```
vix-market-pulse/
├── index.html         # 页面 DOM：市场切换 Tab、KPI 栏、Chart 容器与 Tooltip 节点
├── style.css          # CSS 设计系统：三套主题变量 (.theme-cn / .theme-us / .theme-gold) 与玻璃拟态样式
├── app.js             # 前端主逻辑：MARKETS 配置、取数、波动率计算、时间轴对齐、Chart.js 渲染与交互
├── lib/
│   └── datasource.js  # ★ 取数/缓存/双源合并的唯一实现，被下面两者共用
├── server.js          # 本地开发服务器：静态托管 + /api/merged + /api/yahoo + 10 分钟定时刷新
├── api/
│   └── merged.js      # Vercel Serverless Function，仅做 HTTP 外壳
├── vercel.json        # 部署配置（注意 includeFiles 需带上 lib/**）
├── package.json       # 零运行时依赖，仅声明 start / dev 脚本
├── data/              # 运行期自动生成的缓存目录（已 gitignore，不入库）
└── PROJECT_GUIDE.md   # [本文件]
```

---

## 四、 快速启动与运维指南 (Getting Started)

### 1. 环境要求
* Node.js **v18** 或更高版本（用到 `AbortSignal.timeout`、原生 `fetch` 语义）
* 无需 `npm install`，项目零运行时依赖

### 2. 启动项目
```bash
npm start
```
* 访问：`http://localhost:3399`
* 数据接口：`http://localhost:3399/api/merged?symbol=^VIX`
* 缓存目录：`./data/`

### 3. 排障要点
* **图上某条线是空的** → 先查 `data/` 下对应的 `cache_*.json` 大小。若只有 1KB 左右，说明 Yahoo 只返回了实时快照，需要看该标的有没有备选源（见第二节表格）。
* **日志刷 `socket hang up` + `进入 30 分钟冷却`** → 东方财富限流了，等冷却期过自动恢复，**不要重启服务反复重试，那只会延长封锁**。
* **响应头自检**：`X-Data-Source`（disk-cache / live-fetch）、`X-Missing-Count`（缺失点数）、`X-Backup-Fill`（备选源补全点数）。
* **⚠️ 切勿手动删除 `data/backup_*.json`** — 该目录不入 git，删掉后只能重新向东方财富抓取，而抓取随时可能撞上限流，`000688.SS`（科创50）会因此长时间无数据。

### 4. Vercel 部署注意
* Serverless 的 `DATA_DIR` 指向 `/tmp`，**冷启动即清空**，且 `data/` 不随代码部署。因此线上每个新实例的首个请求都会走实时抓取路径（由 4 秒熔断兜底），无法享受本地那样的 0ms 磁盘缓存。
* 若要线上也具备持久缓存，需引入外部存储（如 Vercel KV / Blob），当前版本未实现。

---

## 五、 已知问题与待办 (Known Issues)

> 记录于 **2026-08-01**。其中「临时状态」类条目会随时间自愈，接手前请按各条的「自查方式」确认当前实际状况，不要直接采信本文档的结论。

### 🔴 A. 数据源缺口（结构性，非接入新数据源无法解决）

| # | 问题 | 影响 | 现状 |
| :-- | :--- | :--- | :--- |
| A1 | `^VIX` Yahoo 返回的 2610 个时间戳中有约 **95 个收盘价为 null**，且无备选源可补 | 美股图上 VIX 线在这些日期呈灰色虚线段 | 无解，已按缺失渲染 |
| A2 | `^SOX`、`^GVZ` **无任何备选源**（东方财富无对应品种，`100.SOX` / `100.SOXX` / `100.PHLX` / `124.SOX` / `100.GVZ` 等候选 secid 均返回 0 条） | Yahoo 一旦对这两个标的失效，对应曲线直接断供，无降级路径 | 单源运行 |
| A3 | `^VXFXI` Yahoo **仅返回 1 个实时快照点**（`firstTradeDate: null`），无历史 K 线 | 图上画的其实是 `calcRollingVolatility` 用沪深300 日收益率算出的 **20 日历史波动率 (HV)**，而非 CBOE 的隐含波动率 | 语义与 KPI 标签「中国概念恐慌 (VXFXI)」**不完全相符**，待决策是否改标签或接入真实源 |
| A4 | `000688.SS`（科创50）Yahoo 同样只有 1 个快照点 | **完全依赖东方财富备选源**，备份缓存一旦缺失即无历史曲线 | 见 B1 |

**自查方式**：`node -e "const j=require('./data/cache_vix.json');const r=j.chart.result[0];console.log(r.timestamp.length, r.indicators.quote[0].close.filter(v=>v!=null).length)"` — 两数差值即为空洞数。

### 🟡 B. 临时状态（会自愈，勿手动干预）

| # | 问题 | 影响 | 处置 |
| :-- | :--- | :--- | :--- |
| B1 | **东方财富处于限流封锁中**（`socket hang up`）。起因：2026-08-01 排查数据源时短时间内发起数十次探测请求触发风控。同期 `data/backup_*.json` 被清空且无法恢复（该目录不入 git） | 科创50 无历史曲线；沪深300 最近 8 个交易日的 Yahoo 空洞补不上，KPI 显示 07-17 的滞后值 | **等待自动恢复**。cron 每 10 分钟重试一次，成功即自动补全。<br>⚠️ **切勿重启服务反复重试**——重启会重置 30 分钟冷却计时，反而持续加压延长封锁 |

**自查方式**：看服务端日志有无 `[eastmoney] ... 进入 30 分钟冷却`；或单次探测（**只跑一次，不要循环**）：
```bash
node -e "require('http').get('http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000300&fields1=f1&fields2=f51,f53&klt=101&fqt=1&end=20500101&lmt=3',r=>{let s='';r.on('data',c=>s+=c);r.on('end',()=>console.log((JSON.parse(s)?.data?.klines||[]).length?'已恢复':'仍限流'))}).on('error',e=>console.log('仍限流'))"
```

### 🟠 C. 架构性欠账（已知取舍，非缺陷）

| # | 问题 | 说明 |
| :-- | :--- | :--- |
| C1 | **Vercel 线上无持久缓存** | `/tmp` 冷启动即清空，每个新实例首个请求都要实时抓取。需接 Vercel KV / Blob 才能解决，当前未实现。详见第四节。 |
| C2 | **Vercel 上的后台静默刷新不保证完成** | `buildMerged` 在缓存过期时会先响应、再后台刷新，但 Serverless 实例可能在响应后被冻结，导致缓存写入中断。本地 `server.js` 无此问题。 |
| C3 | **`data/` 无任何冗余备份** | 已 gitignore 且无副本，误删即只能重抓（重抓又可能撞限流，见 B1）。`000688.SS` 这类单源标的风险最大。如需加固可考虑将 `backup_*.json` 纳入版本管理。 |
| C4 | **`vix2` 渲染支路当前无市场使用** | `^VHSI` 移除后（Yahoo 404 下架、东方财富无对应品种），`app.js` 中 `getSlicedAligned` / `alignData` / `renderKPIs` / `buildChart` / `updateChartViewport` / `updateTooltipContent` 里的 `vix2` 分支全部处于未激活状态。**刻意保留**，日后接入第二恐慌指标时在 `MARKETS` 配置里加回 `symbols.vix2` 即可生效，勿当死代码清理。 |
| C5 | `server.js` 仍使用已弃用的 `url.parse()` | 启动时产生 `DEP0169` 警告。功能正常，可择机换成 WHATWG `URL`。 |

### ⚪ D. 未验证项

| # | 项 | 说明 |
| :-- | :--- | :--- |
| D1 | KPI「滞后」标记的视觉样式 | 逻辑已通过 DOM 断言验证（11 条序列中仅沪深300 触发，无误报，title 文案正确），但 `.kpi-stale` 的实际渲染效果**未经肉眼确认**，配色与间距可能需要微调。 |
