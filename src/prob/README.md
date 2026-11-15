# 股票概率预测引擎 · 前端模块（`/prob`）

> 路由与侧栏入口已接在 `src/App.jsx` / `src/components/Header.jsx`。
> 页面顶部固定免责声明；概率显示百分比 1 位小数，收益率 `+2.3%` 形式，红涨绿跌；
> 文案一律用「概率」「估计」，不出现「买入/卖出/推荐」等建议性措辞。

## 目录

```
src/prob/
  ProbApp.jsx          容器：5 个 Tab、URL 状态、免责声明、全局公式入口、刷新
  OverviewPanel.jsx    概率总览（榜单）
  StockPanel.jsx       个股详情
  EvalPanel.jsx        可靠性与复盘
  BacktestPanel.jsx    回测
  RunsPanel.jsx        任务与参数（一键运行 / 配置 / 特征注册表 / 模型产物）
  formulas.js          ★ 公式说明书数据（40 条 × 8 分组）
  FormulaContext.jsx   弹窗上下文
  FormulaTerm.jsx      就地 <F id="..."/> 的 ? 按钮
  FormulaModal.jsx     公式说明弹窗
  api.js               /api/prob 接口封装
  format.js            格式化、风险/等级/状态映射、区间条
  ProbParts.jsx        基础 UI（复用 ga.css）
  prob.css             样式
```

## 公式弹窗（本次重点）

- 顶部按钮「公式说明 · 参数来源」打开全局弹窗；页面里带 **?** 的指标（`<F id="garch"/>`）点击后直接定位到该条。
- 弹窗每条包含：**公式表达式 → 含义 → 参数表（符号 / 来自哪张表哪个字段 / 入参怎么统计）→ 入参统计口径 → 输出落到哪个字段 → 可复现示例 → 文档章节 → 注意事项**。
- 新增公式只需在 `formulas.js` 的 `FORMULAS` 数组里加一项：

```js
{
  id: 'my_formula', term: '...', cn: '...', group: 'dist',
  expr: '...', meaning: '...',
  params: [P('符号', '来自哪个表/字段', '窗口、加权、purge、缺失处理等统计口径')],
  inputStats: '整体样本构造说明',
  output: '落到哪个输出', table: '落到哪张表',
  example: '可复现数值', doc: '§x.y', caution: '可选注意事项',
}
```

分组用 `FORMULA_GROUPS`；页面引用 `<F id="my_formula">显示文本</F>`。
引擎侧公式实现在 `engine/formulas.py`，后端字段在 `docs/PROB_API.md`，三处口径需保持一致。

- 另一个同源视图：「任务与参数 → 特征注册表」直接展示 `features.yaml`，列出每个特征的
  公式、回看天数、**入参来自 stock_daily 的哪些字段**、**统计口径**（预热/缺失/百分数÷100/横截面排名）。

## 页面要点

| 页面 | 关键交互 |
| --- | --- |
| 概率总览 | 周期 h / 8 种排序 / 风险等级 / 最低可靠性 / 剔除高波动 / 代码搜索 / 分页；每行 q05–q95 区间条；点击代码进个股 |
| 个股详情 | 周期表可点选切换拆解所用 h；分位扇形图叠加近 60 日价格；波动预测 vs 已实现；M1/M2/M3 分项与因子贡献条；马尔可夫矩阵热力；信号命中率；历史复盘；风险卡 |
| 可靠性与复盘 | 校准曲线、指标趋势、8 张指标卡、B0/B1/B2 对比、方法择优、全部指标表（按范围筛选） |
| 回测 | 净值/基准曲线 + 回撤曲线、绩效卡、参数快照、成交明细、样本期局限提示 |
| 任务与参数 | 一键 daily + 7 个分步任务、2.5 秒进度轮询、运行记录、配置/特征/模型三个视图 |

**状态保持**：Tab、代码、市场、周期、排序都写在 URL query 上；从榜单进入个股或跳 K 线时把滚动位置存进
`sessionStorage['prob:overview:scroll']`，返回后恢复。K 线跳转会带 `state.from/fromLabel`，与站内返回条一致。

**加载反馈**：全局 `PActivityBar` 订阅 `useApi` 的在途请求数；刷新按钮、任务提交按钮都有 loading 态；
任务提交后轮询 `prob_run` 状态直到终态。

## 图表

复用 `src/components/EChart.jsx`（按需注册 Line/Bar/Candlestick 等），本模块只用到 Line 与 Bar：
分位扇形图（stack 面积带）、波动对比、校准曲线、指标趋势、净值曲线、回撤曲线。
马尔可夫矩阵用 HTML table + 背景色实现热力，不额外引入 heatmap 组件。

## 依赖与构建

```bash
cd D:/code/WebStormProject/stock-web
npm install
npm run build        # 实测 682 模块构建通过
npm run dev          # 5173，/api 代理到 8080（VITE_BACKEND 可覆盖）
```

后端地址解析沿用 `src/api/client.js` 的多级回退；接口统一返回 `{code,message,data,disclaimer}`，
`client.js` 剥离外壳后页面只拿 `data`。

## 免责声明

> 本系统输出为基于历史数据的统计估计，仅供量化研究参考，不构成任何投资建议。历史概率不代表未来表现，投资有风险。
