# 遗传算法涨跌预测（ga 模块）

独立前端模块，全部文件位于 `src/ga/`，不依赖任何新第三方库。业务代码不侵入主站页面，
只在主站挂了 3 处入口：`App.jsx` 的路由与标题、`components/Header.jsx` 的侧栏菜单、
`gaUtils.js` 的周期常量（与后端 `ga_config.horizons` 对齐为 1/3/5/10/15）。
模块自己引入 `./ga.css`，所有样式类以 `.ga-` 前缀开头，颜色沿用主站 `global.css` 的 CSS 变量
（`--up/--down/--accent/--muted/...`，A 股涨红跌绿），并自带 fallback。

## 挂载方式（已挂载）

主站已按下面的方式挂在 `/ga/*`（父路由必须带 `*` splat，否则内部二级 `<Routes>` 匹配不到子路径）：

```jsx
import GaApp from './ga/GaApp.jsx';
// 在 App.jsx 的 <Routes> 内：
<Route path="/ga/*" element={<GaApp/>}/>
```

`GaApp` 内部用相对路径的二级 `<Routes>`，默认跳转 `overview`。
顶部标签导航与「个股详情」跳转使用绝对路径 `${GA_BASE}/...`，`GA_BASE` 集中定义在
`gaUtils.js`（默认 `/ga`）。**若挂到别的前缀，只需改这一处常量。**

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `GaApp.jsx` | 默认导出组件：外壳、标题/免责声明、连接状态与全局刷新、告警条、顶部导航、二级相对路由 |
| `api.js` | 所有接口集中封装（参数一律用对象；PUT 走 `apiPut`、CSV 用 `apiUrl` 直链） |
| `gaUtils.js` | 共享常量（周期/板块/枚举选项）、格式化、防御性兜底、`GA_BASE`、`guessMarket` |
| `ga.css` | 全部 `.ga-` 前缀样式，浅色紧凑，窄屏表格横向滚动、栅格降为单列 |
| `GaChart.jsx` | ECharts 封装（整包 `echarts`，init + ResizeObserver + 卸载 dispose） |
| `GaParts.jsx` | 共享 UI：Card / KpiCard / Badge / FilterBar / Field / Select / Input / Btn / GaTabs / Pager / MiniBar / Timeline / Empty / Loading / ErrorBox / AsyncPanel |
| `OverviewPage.jsx` | 总览 |
| `PredictionsPage.jsx` | 预测复盘 |
| `AnalysisPage.jsx` | 错误分析 |
| `PoolPage.jsx` | 淘汰管理 |
| `EvolutionPage.jsx` | 进化监控 |
| `FactorsPage.jsx` | 因子体检 |
| `PicksPage.jsx` | 每日选股 |
| `ConfigPage.jsx` | 参数配置（作用域切换 / 搜索 / 批量保存 / 恢复默认） |
| `JobsPage.jsx` | **后台任务独立页**：定时调度、任务清单、运行历史、触发结果跟踪 |
| `kline.js` | 个股 K 线：前端推导 MA5/10/20/60、量能 MA5、MACD(12,26,9)，构造三宫格 ECharts option 与 tooltip；`isVerified/isCorrect` 兼容 tinyint 1/0 |
| `StockPage.jsx` | 个股详情：K 线独占整行（三宫格 + 预测标记 + 缩放），最新预测/因子贡献、命中率、时间线、口径说明 |
| `glossary.js` | **指标说明书数据源**：8 个分组的静态术语（英文原名 / 中文名 / 定义 / 公式 / 怎么看）+ 4 类告警处置 SOP |
| `GlossaryContext.jsx` | 弹窗全局开关（Context），支持 `?glossary=1` / `?glossary=terms` / `#ga-glossary` 深链 |
| `GlossaryTerm.jsx` | `<Term id="ic60"/>`：页面里就地解释英文指标，悬停给中文、点击打开弹窗并定位词条 |
| `GlossaryModal.jsx` | **指标说明弹窗**：告警处置指引（分步骤 + 操作位置）、术语搜索、分组切换；`ga_config` 全部参数键从接口实时补入术语表 |
| `README.md` | 本文件 |

## 指标说明弹窗与术语表

**入口**（三个，指向同一个弹窗）：

1. 模块顶部「**? 指标说明**」→ 直接进术语表；
2. 顶部告警条右侧「**怎么处理？**」→ 自动定位到该告警的处置指引（如「近区间命中率偏低 / 模型可能退化」）；
3. 页面里任意带 <kbd>?</kbd> 角标的英文指标（KPI 卡、表头、图表标题、筛选标签）→ 打开弹窗并滚动高亮该词条。

**内容**：

- 术语分 8 组：总览指标、预测与结果、进化与适应度、因子与校准、股票池状态、任务与调度、参数键、数据表与口径。
  每条含英文原名、中文名、定义、公式 / 口径、「怎么看」的正常范围与异常处理方向。搜索框支持中文、英文、别名，
  有搜索词时自动跨全部分组。
- 「参数键」分组除了静态常用阈值，还会**实时读取 `/api/ga/config`**（不限作用域）把 100+ 个 `paramKey`、
  中文 `description`、当前值与代码内置默认值全部补进术语表，因此配置页里任何英文参数都能搜到解释。
  注意后端把 `scope=ALL` 当成真实作用域查询（返回 0 行），必须传**空字符串**才是「不限作用域」。
- 告警 SOP 用 `glossary.js` 的 `ALERT_SOPS` 维护，目前覆盖：低命中率 / 模型退化（7 步）、
  特征缺失、价格口径、无已验证数据。低命中率 SOP 明确写了「先确认口径与样本量 → 排除任务失败 →
  定位失效位置 → 查进化监控 → 换掉回放冠军 → 校准与影子期 → 闭环验证」，并逐步标注前端操作位置。
- 深链：`/ga?glossary=1`（处置指引）、`/ga?glossary=terms`（术语表）、`/ga#ga-glossary`（同处置指引），
  便于分享与回归验证；关闭弹窗会清掉参数。

新增前端英文指标时，只需在 `glossary.js` 的 `TERMS` 加一条，再在页面用 `<Term id="...">` 包住即可，
弹窗与就地解释同时生效；`Term` 找不到 id 会原样输出文本，不会报错。

## 页面覆盖的契约接口

| 页面 | 接口 |
| --- | --- |
| `GaApp`（顶部告警条） | `GET /api/ga/overview` → `alerts` |
| 总览 | `GET /api/ga/overview`、`GET /api/ga/overview/trend`、`GET /api/ga/overview/calendar` |
| 预测复盘 | `GET /api/ga/predictions`、`GET /api/ga/predictions/export`（CSV 直链） |
| 个股详情 | `GET /api/ga/stock/{market}/{code}` |
| 错误分析 | `GET /api/ga/analysis/buckets`、`/reliability`、`/confusion`、`/top-errors`、`/quantile` |
| 淘汰管理 | `GET /api/ga/pool`、`GET /api/ga/pool/log`、`POST /api/ga/pool/override` |
| 进化监控 | `GET /api/ga/evolution/runs`、`GET /api/ga/evolution/runs/{runId}/generations`、`GET /api/ga/individuals`、`GET /api/ga/champions`、`POST /api/ga/evolution/run`、`POST /api/ga/evolution/replay`、`POST /api/ga/champions/promote`、`POST /api/ga/champions/rollback` |
| 因子体检 | `GET /api/ga/factors/ic`（对 5 个周期各请求一次） |
| 每日选股 | `GET /api/ga/picks`（看涨 / 看跌各请求一次） |
| 参数配置 | `GET /api/ga/config`、`PUT /api/ga/config` |
| 后台任务 | `GET /api/ga/jobs/status`、`POST /api/ga/jobs/run`、`GET /api/ga/jobs/log`、`GET /api/ga/jobs/schedule`、`POST /api/ga/jobs/schedule/toggle`、`POST /api/ga/jobs/schedule/fire` |

所有查询走 `src/api/client.js` 的 `apiGet / apiPost / apiPut`，外壳 `{code,message,data}` 由它剥掉。
`client.js` 的接口基址自带 `/api`，所以 `api.js` 里路径统一用 `/ga/...`（拼出来正好是 `/api/ga/...`）。

- `PUT /api/ga/config`：统一走 `apiPut`，与其它方法共用基址探测/回退与业务错误解析。**不要改回原生 fetch**——
  直连后端时浏览器的 CORS 预检一旦被拦，页面只会报「保存失败」，拿不到后端真实原因。
- `vite.config.js` 的 `/api` 代理会移除 `Origin` 头：浏览器对同源 POST/PUT 也会带 Origin，
  后端旧 CORS 配置（`allowedMethods` 不含 PUT）会据此返回 403，导致配置保存失败。
  后端 `WebConfig` 已放行 PUT，供非代理的跨域直连场景使用。
- CSV 导出：`client.js` 会按 JSON 解析响应，故用 `apiUrl()` 生成带参数的绝对链接直接打开
  （`<a target="_blank">`），可用 `VITE_API_BASE` 兜底。
- 后端尚未包含 `jobs/log`、`jobs/schedule*` 时（旧版本未重启），后台任务页自动降级：
  运行历史改用 `jobs/status` 的每任务最后一次结果，定时卡片显示静态 cron 说明与「立即执行」按钮，
  并在页面上提供「重新检测」。重启后自动显示 cron、下次触发时间、运行时开关与完整历史。
- POST 带 query 的接口（`evolution/run?horizon=`、`champions/promote?runId=&horizon=`）：`apiPost` 不支持
  query 对象，故把 query 拼进 path 字符串，body 传 `{}`。

## 通用约定

- **错误与空态**：每个请求都经 `AsyncPanel` 统一渲染——失败显示 `ErrorBox`（原因 + 排查 + 重试）、
  首次加载显示 Loading、数据为空显示 Empty，页面骨架不白屏。写操作（override / 进化 / 回放 / 晋升 /
  回滚 / 保存配置 / 运行任务）用 try/catch 后在页面内提示成功或失败。
- **防御性兜底**：`asArray / asObject / num / fmtXxx` 保证字段缺失或类型不符时不报错，缺值显示 `-`。
- **筛选持久化**：全部用 `usePersistedState`，key 统一 `ga:` 前缀，例如
  `ga:overview:filters`、`ga:predictions:filters`、`ga:analysis:tab`、`ga:picks:filters` 等。
- **日历跳转**：总览日历点有样本的日期 → `${GA_BASE}/predictions?from=&to=`；预测复盘读取 URL 参数覆盖日期筛选。
- **个股跳转**：预测复盘 / 每日选股行点击 → `${GA_BASE}/stock/{market}/{code}`。

## 契约歧义与前端假设（后端实现时可对照）

1. **比例类字段量纲**：`hitRate / upHitRate / downHitRate / coverage / probUp / confidence / avgProb /
   actualRate / upRate / hitRate60 / shadowHitRate20` 契约未说明是 `0~1` 还是 `0~100`。前端 `fmtRate`
   按 `0~1` 处理（绝对值 ≤1 视为比例 ×100，>1 视为已是百分数）；趋势/月度柱的 y 轴固定 `0~1` 并画
   `0.5` 基准线，日历阈值也用 `>0.55 / <0.45`，均按 `0~1` 假设。若后端统一返回百分数，请告知以便调整。
2. **收益类字段量纲**：`actualReturn / avgRet` 未说明是百分数数值（如 `2.5` = 2.5%）还是小数
   （`0.025`）。前端按「百分数数值」直接用 `formatPct` 加正负号与 `%`，分层回测柱按此正负着色。
3. **`market` 路径变量取值**：`/api/ga/stock/{market}/{code}` 里 `market` 取值（`SH/SZ/BJ`、
   `1/0` 还是其它）未定义；且 `predictions` / `picks` 的返回项**不含 `market` 字段**。前端
   `marketOf(item)` 优先取 `item.market`，否则按代码推断（`6/5/9`→`SH`，`4/8`→`BJ`，其余→`SZ`，
   见 `gaUtils.guessMarket`）。后端可按代码忽略该段，或按同样约定解析。
4. **枚举字段取值未给出**：`board / strict / result / inPool / sort / runType / pool.status /
   pool.reason / individuals.status / config.scope` 等。前端给出常见候选下拉或自由输入，实际取值以后端为准：
   - `board`：`MAIN/GEM/STAR/BJ`；`strict`、`inPool`、`includeReplay`：`true/false`；
   - `result`：`correct/wrong/pending`；`sort`：`字段,方向`（如 `tradeDate,desc`）；
   - `runType / status / reason / scope` 用自由文本输入，不写死枚举。
5. **「按月命中率柱」没有独立接口**：契约只有 `overview/trend`（日序列）与 `overview/calendar`（单月逐日）。
   前端把 `trend` 的 `dates/series` 按 `yyyy-MM` 聚合（所有周期、所有交易日命中率取平均）得到月度柱。
6. **「特征 × 周期热力图」没有多周期接口**：`factors/ic?horizon&days` 是单周期。前端对 5 个周期
   分别请求再拼矩阵；「点因子看 ic20/ic60 序列」用**跨周期**的 ic20 / ic60 两条折线展示（契约没有
   单因子的历史时间序列接口）。
7. **「可预测性排行」没有独立接口**：淘汰管理页用当前 `pool` 列表按 `hitRate60` 降序取前 10。
8. **`chromosomeJson` 结构未定义**：基因权重条形图用 `parseChromosome` 容错解析（对象
   `{feature:weight}` / 数组 `[{name,weight}]` / 纯数值数组），解析失败显示空态。
9. **`explain[].c` 量纲未定义**：最新周期卡片的贡献条按该卡内 `|c|` 最大值归一化，正红负绿。
10. **`POST /api/ga/evolution/replay` 的 `horizons` 类型**：未说明是数组还是字符串；前端把逗号分隔
    文本解析成数字数组（如 `1,3,5,10,20`）发送。`step` 转数字。
11. **`limitFlag` 语义**：只给了布尔。前端把 `true` 一律显示为「追高风险」(每日选股) / 「涨停」
    (预测复盘)；若要区分涨停 / 跌停 / 一字板，需要后端给更细的取值。
12. **`isCorrect` 与 `status` 并存**：预测结果前端优先用 `isCorrect`，缺失时从 `status` 文本推断
    （命中 / 未命中 / 待验证）。注意 `is_correct` 是 MySQL tinyint，JDBC 返回 **1/0 而不是布尔**，
    `PredictionsPage.resultInfo` 与 `StockPage` 都复用 `kline.js` 的 `isVerified/isCorrect` 兼容判断，
    不能写 `=== true`，否则全部行都会被误显示成「待验证」。
13. **`confusion.labels` 与 `matrix` 维度对应关系未说明**：前端用同一组 labels 作行、列表头，
    缺失时回退「类别N」。
14. **日历配色按需求特意区分于涨跌色**：`>0.55` 绿（好）、`<0.45` 红（差）、中间黄、无样本灰；
    这是绩效色，与 K 线「涨红跌绿」不是同一套语义。

## 备注

- 已挂载并完成 `npm run build`（Vite 8，658 个模块，构建通过）。
- **个股 K 线**：后端 `/stock/{market}/{code}` 只给 `open/close/high/low/volume`，均线与 MACD 在
  `kline.js` 前端推导。标记默认「每日共识」（一天一个三角，多周期投票），可切「逐周期展开」；
  三角颜色只表示方向（红涨绿跌），实心=已验证、空心=待验证，悬停 tooltip 列出当日全部周期。
  `is_correct` 是 MySQL tinyint，JDBC 返回 **1/0 而非布尔**，`kline.js` 的 `isVerified/isCorrect`
  做了兼容，判断时不要用 `=== true`。
  后端接口全部在 `/api/ga/**`，走 `api.js` → `src/api/client.js`，统一 `ApiResponse` 外壳。
  后端启动时会由 `GaSchemaInitializer` 幂等创建 14 张 `ga_` 表并补齐 `ga_config` 默认参数。
- 「后台任务」是独立页 `/ga/jobs`：提交任务时记录基线 `lastRunAt`，轮询 `jobs/status` 直到
  「结果时间变化且不再运行」，把成功/失败与后端 message 直接展示出来，触发不再只是一句「已触发」。
- 后端 `@Scheduled` 日链路（17:30）与周进化（周六 02:00）由 `stock.ga.enabled` 与页面运行时开关共同控制；
  「按定时规则执行」走与 cron 完全相同的提交路径，可即时验证定时触发是否有效。
  手动「立即运行」始终可用，非交易日定时链路会跳过并在日志里记录原因。
- **冷启动数据**：看板默认「仅实盘」只查 `is_replay=0`，历史回放数据不计入总览/趋势/日历/选股。
  后端启动后会自动检查一次 `InitJob`（`stock.ga.init-enabled`，默认开），把最近 `init_days`（默认 10）
  个交易日补成实盘预测 + 回填 + 指标 + 因子 IC，数据齐了就不再跑；也可在「后台任务」页手动运行 `InitJob`。
  该任务用当前冠军模型回灌历史真实行情，仅供看板展示，不是实盘业绩。
  `jobs/schedule` 返回 `initEnabled`/`initReady` 便于诊断是否已完成初始化。
- 代码注释使用中文；未写入占位 TODO 或假数据；每个页面都有空态。
- 仅用于研究与复盘，输出不构成投资建议。
