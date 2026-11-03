# 股票数据可视化前端

React + Vite + ECharts，对接后端 Spring Boot 项目（`stock` 模块）的 `/api/**` 接口。

项目路径：`D:\code\WebStormProject\stock-web`

## 启动

```bash
npm install
npm run dev        # 默认 http://localhost:5173
```

后端默认跑在 `http://localhost:8080`；如果后端端口不同：

```bash
VITE_BACKEND=http://localhost:18080 npm run dev
```

或者直接改 `vite.config.js` 里的 `BACKEND` 常量。生产构建：`npm run build`（产物在 `dist/`）。

> 后端 `WebConfig` 已放开 `/api/**` 跨域，前端单独部署到别的端口也能直连；此时把 `VITE_API_BASE` 设成完整地址即可（默认 `/api`，走 dev 代理）。

## 页面

| 路由 | 页面 | 主要接口 |
| --- | --- | --- |
| `/` | 市场看板：概览卡片、涨跌幅分布、板块/行业表现、个股榜单、市场宽度 | `/api/market/overview`、`distribution`、`sectors`、`ranking`、`breadth`、`calendar` |
| `/stocks` | 股票列表：关键字/板块/行业/交易所/市场筛选 + 排序 + 分页 | `/api/stocks`、`/api/stocks/filters` |
| `/stocks/:code` | 股票详情：报价卡 + K线（日/周/月 + MA/MACD/BOLL）+ 区间统计 + 日线明细 | `/api/stocks/{code}/quote`、`kline`、`stats`、`daily`、`data-range` |
| `/scores` | 量化评分排行：日期/复权口径/关键词/最低分筛选，展示综合分和五类因子分项 | `/api/rankings/scores`、`/api/rankings/scores/dates` |
| `/short-term` | 短期持有预测：5/10/15/20 个交易日预估收益、达到15%概率、置信度和历史相似样本数 | `/api/short-term/forecasts`、`/api/short-term/forecasts/rebuild` |

顶栏搜索框调用 `/api/stocks/suggest` 做联想，回车直达详情。

## 目录结构

```
src/
├─ api/          client.js（统一解包 {code,message,data}）、stock.js、market.js、score.js
├─ charts/       options.js（K线/分布/板块/宽度 的 ECharts option 构造）
├─ components/   EChart 图表容器、Panel、Tabs、StatCard、Pagination、Header
├─ hooks/        useApi（loading / error / reload）
├─ pages/        MarketDashboard、StockList、StockDetail、ScoreRanking
├─ utils/        format.js（红涨绿跌、金额/百分比/价格格式化）
└─ styles/       global.css
```

## 约定

- **涨红跌绿**：`--up: #d8392b`、`--down: #17924e`，格式化函数统一在 `utils/format.js`。
- 后端空值字段不返回（`default-property-inclusion: non_null`），页面所有字段都按 `null/undefined` 兜底显示 `-`。
- K 线数据顺序 `[open, close, low, high]` 直接对应 ECharts candlestick。
- 同一交易日可能存在多个复权口径记录，后端已默认取该股票主口径，页面 `复权` 列会显示实际口径值。
