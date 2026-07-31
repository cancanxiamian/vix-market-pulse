# 📌 Market Pulse — 项目全景架构与关键技术实现说明

本文档对 **Market Pulse** 大盘走势与情绪/恐慌指数叠加对比系统的整体思路、架构设计、核心算法与模块职责进行全面梳理。

---

## 一、 项目概述 (Project Overview)

**Market Pulse** 是一个专注于 **A股、美股、黄金避险** 三大全球核心市场的现代高阶数据可视化平台。通过将核心股票大盘指数与相对应的市场波动率/恐慌指数（VIX / VXFXI / GVZ）进行同框叠加对比，帮助投资者快速识别市场情绪拐点、超买超卖区间及避险情绪升温状态。

### 核心技术栈
* **前端核心**：HTML5 + 原生 Vanilla JavaScript (ES6+ 模块化封装)
* **设计系统**：原生 Vanilla CSS（极简深色玻璃拟态 Glassmorphism 设计，无 Tailwind 依赖）
* **图表引擎**：[Chart.js 4.x](https://www.chartjs.org/) HTML5 Canvas 高性能实时渲染
* **后端代理**：Node.js 本地轻量代理服务 (Express / HTTP)，支持 CORS 代理与磁盘 JSON 持久化缓存
* **数据来源**：Yahoo Finance API 自动化代理拉取与本地缓存

---

## 二、 核心架构设计与解耦思路 (Architecture & Design)

```
                     ┌───────────────────────────────────────┐
                     │          浏览器前端 (app.js)           │
                     └──────────────────┬────────────────────┘
                                        │ /api/yahoo?symbol=...
                                        ▼
                     ┌───────────────────────────────────────┐
                     │        Node.js 代理服务 (server.js)     │
                     └──────┬─────────────────────────┬──────┘
                            │                         │
            < 10 min 缓存 valid                       │ 超时 / 异常 / 首次
                            ▼                         ▼
             ┌────────────────────────┐    ┌────────────────────────┐
             │ 本地磁盘 JSON 缓存目录  │    │   Yahoo Finance API    │
             │   (./data/cache_*.json)│    │(query1.finance.yahoo)  │
             └────────────────────────┘    └────────────────────────┘
```

### 1. 三板块多市场系统 (Multi-Market Architecture)
系统采用配置驱动架构 (`MARKETS` 配置字典)，支持三大板块一键无缝切换：

| 市场板块 | 包含核心指数 / 恐慌指标 | 主题色彩与视觉意象 |
| :--- | :--- | :--- |
| **🇨🇳 A股市场 (`cn`)** | • 沪深 300 (`000300.SS`)<br>• 上证指数 (`000001.SS`)<br>• 中国概念恐慌指数 (`^VXFXI`) | **朱砂红 & 帝王金** 主题 (`#f43f5e` / `#eab308` / `#10b981`)，搭配极简东方金红暗影网格。 |
| **🇺🇸 美股市场 (`us`)** | • 纳斯达克 100 (`^NDX`)<br>• 费城半导体 (`^SOX`)<br>• CBOE 恐慌指数 (`^VIX`) | **深空科技黑** 主题 (`#22d3ee` / `#a855f7` / `#f97316`)，赛博蓝紫发光背景。 |
| **🪙 黄金避险 (`gold`)**| • COMEX 黄金期货 (`GC=F`)<br>• COMEX 白银期货 (`SI=F`)<br>• 黄金恐慌指数 (`^GVZ`) | **黑金奢华** 主题 (`#fbbf24` / `#94a3b8` / `#f59e0b`)，金色高贵金属微光。 |

---

### 2. 本地磁盘 JSON 缓存、双源校验与 10 分钟自动更新 (`server.js`)
* **零 CORS 跨域瓶颈**：本地 Node.js 服务器暴露 `/api/merged?symbol=...` 代理路由。
* **磁盘持久化缓存 (`data/cache_*.json` & `data/stooq_*.json`)**：雅虎财经与 Stooq 备选源数据均自动保存至本地磁盘。
* **0ms 响应**：若磁盘缓存文件修改时间 `< 10 分钟`，直接读取本地文件返回（0ms 延迟，零 API 消耗）。
* **多源备份与互相校验 (Yahoo + Stooq)**：
  - 以 Yahoo Finance 为主要数据源，当 Yahoo 缺失数据（如 `NULL`）时，自动使用 Stooq 备选数据补全。
  - 两源均有数据时，后端自动对比收盘价，若偏差 `> 1%` 会在服务端控制台输出校验警报 (`⚠️ [校验] 偏差`)。
* **后台 Periodic Cron 校验**：Node.js 后台每 **10 分钟** 自动对所有标的进行后台静默轮询与增量更新。

---

### 3. 数据清洗、缺失标记与补全算法 (`app.js`)
为解决数据源缺失、跨国/跨交易所时区差异（如 GMT+8 沪深与 EST 纽约）以及部分衍生品无完整历史 K 线的问题，系统实现了以下核心算法：

* **缺失数据断点感知与灰色走势线 (`missingFlags` & `segment`)**：
  - 数据缺失时（如 Yahoo 数据为空且无备选补全），图表对应时间段走势线呈现**灰色虚暗沉线条**（`segment` 着色）。
  - Tooltip 上方对应标的明确标注 **“数据缺失”**。
* **多源时间轴并集 (`uniqueTs`)**：
  合并所有指数的时间戳并集，防止因单标的数据缺失导致整张图表丢弃交易日。
* **历史滚动波动率补齐算法 (`calcRollingVolatility`)**：
  当部分恐慌指数（如 `^VXFXI`）在雅虎上仅有实时快照而缺乏 5 年历史 K 线时，系统自动根据指数日收益率公式计算 **20 日年化 Rolling Volatility (HV %)**：
  $$HV_{20} = \sqrt{\frac{1}{20}\sum_{i=1}^{20}(r_i - \bar{r})^2} \times \sqrt{252} \times 100\%$$
  从而自动补齐 1180+ 交易日的完整历史趋势线。

---

### 4. 交互体验与 Chart.js 自定义扩展
* **十字虚线 Crosshair Plugin**：自定义 HTML5 Canvas 插件，鼠标悬停时绘制垂直白色虚线，并在 x 轴正下方吸附渲染醒目的日期框。
* **跟随式顶部 Tooltip**：固定显示在绘图区顶部（`chartArea.top`），水平方向跟随鼠标并自动进行边缘 Clamp 边界限制，绝不遮挡走势曲线。
* **单日涨跌幅 `(+X.XX%)` 计算**：Tooltip 实时计算并高亮显示相较于前一交易日的数值变化与百分比。
* **零位移顶栏布局 (Zero Layout Shift)**：使用 3 栏 Flex 平行布局与 CSS 盒模型锁定，确保切换板块时 LOGO 标题与中间 Tabs 绝对静止（0 像素偏移）。

---

## 三、 项目目录与文件职责说明

```
d:\frontedProjects\myVibecoding\vix\
├── index.html         # 页面 DOM 结构：包含市场切换 Tab、KPI 顶部卡片、Chart 容器与 Tooltip 节点
├── style.css          # CSS 设计系统：包含三套主题变量 (.theme-cn / .theme-us / .theme-gold) 及玻璃拟态样式
├── app.js             # 前端主逻辑：数据获取、波动率计算、时间轴并集对齐、Chart.js 渲染与交互事件
├── server.js          # 后端服务：Node.js 本地代理、磁盘 JSON 缓存读写、10 分钟定时 Cron 轮询
├── package.json       # 项目依赖配置
├── data/              # 运行期自动生成的缓存目录，存储 cache_*.json 文件
└── PROJECT_GUIDE.md   # [本文件] 项目全景架构与关键实现技术说明
```

---

## 四、 快速启动与运维指南 (Getting Started)

### 1. 环境要求
* Node.js v14.0.0 或更高版本

### 2. 启动项目
在项目根目录下运行：
```bash
npm start
```
* 服务启动后访问：`http://localhost:3399`
* 数据代理接口：`http://localhost:3399/api/yahoo?symbol=^VIX`
* 本地缓存路径：`d:\frontedProjects\myVibecoding\vix\data\`
