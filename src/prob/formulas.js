/**
 * 概率引擎「公式说明书」——前端弹窗的唯一数据源。
 *
 * 每一条都回答四个问题：
 *   ① 公式长什么样（expr）
 *   ② 每个符号是什么、来自哪张表/哪个字段（params[].from）
 *   ③ 入参是怎么统计出来的：窗口、样本、加权、purge、缺失与极值处理（params[].stat / inputStats）
 *   ④ 算完落到哪个库表字段、页面上在哪看（output / table）
 * 另外给出可复现的示例（多数取自需求文档 §14 的测试基准）与文档章节，方便对照源码。
 *
 * 纯数据、无 JSX、无副作用，弹窗 <FormulaModal> 与就地 <F id="..."> 共用这一份。
 */

export const FORMULA_GROUPS = [
    { id: 'data', label: '数据与口径', desc: '行情读取、标签、样本切分与清洗' },
    { id: 'direction', label: '方向模型', desc: 'M1 贝叶斯、M2 逻辑回归、M3 马尔可夫' },
    { id: 'vol', label: '波动模型', desc: 'M4 GARCH(1,1)-t 与 EWMA 回退' },
    { id: 'dist', label: '幅度与分布', desc: 'M5 期望、M6 分位数回归、M7 蒙特卡洛' },
    { id: 'risk', label: '风险模型', desc: 'M8 VaR/CVaR、M9 EVT、风险等级' },
    { id: 'fusion', label: '融合校准与评估', desc: 'M10 stacking、校准、样本外指标、可靠性' },
    { id: 'backtest', label: '回测', desc: '成交、成本、净值与绩效' },
    { id: 'ops', label: '自动化与审计', desc: 'daily 全链路、断点续跑、配置与版本' },
];

/** @typedef {{sym:string, from:string, stat:string}} Param */
const P = (sym, from, stat) => ({ sym, from, stat });

export const FORMULAS = [
    /* ------------------------------------------------------------ 数据与口径 */
    {
        id: 'log_return', term: 'r_t = ln(C_t / C_{t-1})', cn: '对数收益', group: 'data',
        expr: 'r_t = ln(C_t / C_{t-1})；对外输出统一用 exp(R)-1 转回简单收益率',
        meaning: '所有模型内部都用对数收益（可加、便于多期累加），界面与数据库里看到的是简单收益率，例如 0.023 表示 +2.3%。',
        params: [
            P('C_t', 'stock_daily.close（前复权 adjustflag=2）', '一次读取完整 500 日窗口的同一份前复权快照；绝不把不同次读取的价格拼在一起，因为前复权价会被后续除权除息整体改写'),
            P('C_{t-1}', '同一快照里的上一有效交易日收盘价', '停牌日不参与收益计算；复牌首日跨越停牌区间的收益不用于 GARCH 拟合'),
            P('pct_chg', 'stock_daily.pct_chg（百分数÷100）', '只用于涨跌停判定与交叉校验：|r_t − ln(1+pct_chg)| > 0.001 计入 prob_run.data_warn_count'),
        ],
        inputStats: '窗口 = 表内 trade_date 去重后降序取前 lookback_days(500) 个交易日；交易日历直接来自表本身。每次运行重新读全窗口。',
        output: 'features.yaml 的 ret_1/3/5/10/20；标签 R_h；模型拟合的收益序列',
        table: 'stock_daily → engine/data.py → prob_stock_model_state',
        example: 'C_t=10.23、C_{t-1}=10.00 → r_t=+2.27%，简单收益 exp(0.0227)-1=+2.30%',
        doc: '§4.3、§5.1', caution: '前复权快照改变会让历史收益整体变化，所以结算 settle 也必须用当次快照重算。',
    },
    {
        id: 'label', term: 'R_h(t), Y_h(t)', cn: '预测目标与标签', group: 'data',
        expr: 'R_h(t) = ln(C_{t+h} / C_t)；Y_h(t) = 1[R_h(t) > 0]',
        meaning: '信号在 t 日收盘后生成，只使用 t 及以前的数据；标签用 t+h 日收盘价计算，h ∈ {1,3,5,10}。',
        params: [
            P('h', 'config.yaml 的 horizons', '默认 [1,3,5,10]，可增加 20；每个周期单独训练一套合并模型'),
            P('t', '窗口内交易日序号', '只取 t 和 t+h 都是有效交易日、且 (t,t+h] 内没有停牌日的样本'),
            P('¥', 'Y_h 的方向标签', '严格大于 0 记 1，等于 0 记 0；用于 Brier / LogLoss / AUC / 校准曲线'),
        ],
        inputStats: '训练样本按「股票×日期」拉直；前向窗口含停牌日的样本默认剔除（allow_suspension_in_window=false）。',
        output: '训练标签 y 与 realized_ret；结算后写 prob_prediction.realized_up / realized_ret',
        table: 'prob_prediction',
        doc: '§5.1、§8.1', caution: '多日标签互相重叠，评估的显著性检验必须按交易日做 block bootstrap，不能当独立样本。',
    },
    {
        id: 'purge', term: 'purge', cn: '样本外切分与泄漏隔离', group: 'data',
        expr: '训练样本必须满足 t ≤ test_start − h − 1；窗口序号 1–60 预热、61–240 初始训练、241–500−h 逐块样本外',
        meaning: 'walk-forward 按时间顺序滚动：训练集 = 测试块之前的全部有效样本，并剔除标签与测试块重叠的最后 h 日。L2 融合只用此前样本外块的预测训练。',
        params: [
            P('test_start', 'walkforward.oos_start_day / oos_max_days / oos_stride', '默认从第 241 个交易日起，最多覆盖 40 天，每 5 天一个块；按 asof_date 写 checkpoint 支持断点续跑'),
            P('train_positions', 'labels.training_positions()', 'LIVE 训练截止到 asof−h，天然不含未到期标签'),
        ],
        inputStats: '特征标准化统计量、winsorize 分位点、缺失中位数、先验 p0 全部只用训练期统计；测试日之后的数据根本不读进内存。',
        output: 'pred_type=OOS / LIVE 两类预测分别落库',
        table: 'prob_prediction.pred_type',
        doc: '§8.1、§13', caution: '验收要求：把 asof 之后的数据随机篡改，该 asof 的预测必须完全不变。',
    },
    {
        id: 'market_proxy', term: 'market_ret_1', cn: '市场代理收益', group: 'data',
        expr: 'market_ret_1(t) = mean_i( r_{i,t} )  （等权）或 Σ w_i·r_i / Σ w_i（成交额加权）',
        meaning: 'stock_daily 没有大盘指数，用当日股票池内全部有效个股收益的横截面平均代替市场收益。',
        params: [
            P('r_{i,t}', '每只股票的对数收益', '只取当日 valid=True 的格子，停牌、无效价格行不计入'),
            P('w_i', 'stock_daily.amount（可配置）', 'config.market_proxy = amount_weighted 时启用'),
        ],
        inputStats: '按交易日逐行计算，只用当日截面，没有未来数据；market_ret_5 为最近 5 日逐日等权收益之和。',
        output: 'market_ret_1/5、excess_ret_1、corr_60、beta_60 等市场联动特征',
        table: 'features.yaml / prob_prediction.components_json',
        doc: '§3.3、§6', caution: '这是等权股票池代理，不是真实指数；跨市场比较时不要当成沪深 300。',
    },
    {
        id: 'zscore', term: 'Z = (X − μ) / σ', cn: 'Z-Score 标准化', group: 'data',
        expr: 'Z = (X_t − μ_20) / σ_20',
        meaning: '把当日收益、成交量、换手率、振幅转换成「相对自身过去 20 日」的标准差倍数，消除个股量纲差异。',
        params: [
            P('X_t', 'ret_1 / volume / turnover / amplitude', '百分数类字段入口统一除以 100 转小数'),
            P('μ_20, σ_20', '该股过去 20 个有效交易日的均值与样本标准差', 'rolling(20, min_periods=10)，标准差 ddof=1；σ=0 记缺失'),
        ],
        inputStats: '只用 t 及以前的滚动窗口，不使用 center=True；预热不足记 NaN，由训练期横截面中位数填充。',
        output: 'z_ret_1 / z_volume_20 / z_turnover_20 / z_amplitude_20',
        table: 'features.yaml',
        example: 'μ=0.2%、σ=1.5%、X=3% → Z=(0.03−0.002)/0.015=1.8667（§14 基准）',
        doc: '§6、§14',
    },
    {
        id: 'cross_section', term: 'rank_pct / cs_z', cn: '横截面排名与 z 值', group: 'data',
        expr: 'cs_rank(X) = rank_i(X_i,t) / N_t；cs_z(X) = (X_i,t − mean_t) / std_t',
        meaning: '把关键特征转成「当日全市场百分位」，让模型跨股票、跨行情阶段可比，缓解单一行情阶段的风格偏差。',
        params: [
            P('N_t', '当日股票池内有效样本数', '每日横截面独立计算，排名 0~1'),
            P('mean_t, std_t', '当日截面均值/标准差', '只在训练期统计 winsorize 分位点；不引入未来数据'),
        ],
        inputStats: '按交易日逐行 rank(axis=1)；被排除的股票不参与当日排名。',
        output: 'cs_rank_ret_5、cs_z_ret_5、cs_rank_vol_20、cs_rank_rsi14、cs_rank_vol_ratio_20 等',
        table: 'features.yaml',
        doc: '§3.2、§6',
    },
    {
        id: 'winsor', term: 'winsorize / 缺失填充', cn: '极值与缺失处理', group: 'data',
        expr: 'X′ = clip(X, Q_01, Q_99)；缺失率 > 30% 的特征整体剔除，其余用训练期横截面中位数填充并保留缺失标志',
        meaning: '避免个别异常值主导线性模型；估值类（pe/pb/ps）非正或为空视为缺失，不得填 0。',
        params: [
            P('Q_01, Q_99', '训练集特征矩阵的 1%/99% 分位', 'config.winsor_pct，分位点只在训练期统计'),
            P('median', '训练集横截面中位数', 'Preprocessor.medians，预测时复用同一组统计量'),
        ],
        inputStats: '每列计算缺失率；被保留列填中位数后再标准化 (X−mean)/std，统计量来自训练期。',
        output: 'Preprocessor 参数写进 prob_model_registry.params_json',
        table: 'prob_model_registry',
        doc: '§4.2、§8.1',
    },

    /* ------------------------------------------------------------ 方向模型 */
    {
        id: 'normal_base', term: 'Φ(μ/σ)', cn: '正态基线 B1 与 p_base', group: 'direction',
        expr: 'P(R_h > 0) = Φ(μ_h / σ_h)；P(R_h > x) = 1 − Φ((x − μ_h)/σ_h)',
        meaning: '最朴素的参考分布：假设 h 日累计收益服从正态分布，作为 M10 融合的一个输入，也是评估报告里的基准 B1。',
        params: [
            P('μ_h', '训练期合并样本 R_h 的均值', '按交易日等权、经 purge 的全部样本；写进 prob_model_registry.metrics_json.mu_train'),
            P('σ_h', 'M4 给出的 h 日预测波动 vol_h', 'GARCH 递推或 EWMA：σ_h = sqrt(Σ_{k=1..h} E[σ²_{t+k}])'),
        ],
        inputStats: 'μ 来自训练期（不含测试块）；σ 来自 t 日及以前的单股波动模型，都不含未来数据。',
        output: 'components_json.p_base → M10 stacking 的 logit 输入',
        table: 'prob_prediction.components_json',
        example: 'μ=0.3%、σ=2% → P(R>0)=55.96%、P(R>2%)=19.77%、P(R<−2%)=12.51%、P(R>4%)=3.22%、P(R<−4%)=1.58%（§14）',
        doc: '§8.3 B1、§14',
    },
    {
        id: 'bayes', term: 'P(Y=1|S)', cn: 'M1 条件概率与贝叶斯', group: 'direction',
        expr: 'P(Y_h=1 | S) = P(S|up)·p0 / ( P(S|up)·p0 + P(S|down)·(1−p0) )',
        meaning: '把离散信号（MACD 金叉、RSI<30、量比>2 等）看成证据，用训练期的条件频率更新基础上涨率。',
        params: [
            P('p0', '训练期基础上涨率', '所有可用训练样本中 Y_h=1 的比例，按交易日等权'),
            P('P(S|up), P(S|down)', '信号在上涨/下跌样本中的出现频率', '由 prob_signal_stat 的 n、k 与衰减权重反推'),
        ],
        inputStats: '12 个布尔信号来自 features.yaml.signals；单信号与不超过 3 个信号的组合分别统计，组合有效样本 n_eff < min_n(30) 时回退到父级单信号。',
        output: 'prob_signal_stat（n/k/n_eff/p_hat/ci）、components_json.p_m1',
        table: 'prob_signal_stat / prob_prediction.components_json',
        example: '先验 0.5、P(S|up)=0.7、P(S|down)=0.3 → 后验 70%（§14）',
        doc: '§7.2 M1、§14', caution: '指标之间相关，朴素贝叶斯输出只作为 M10 的输入，不能直接对外发布。',
    },
    {
        id: 'beta_prior', term: '(k + m·p0)/(n + m)', cn: 'Beta 先验的后验均值', group: 'direction',
        expr: 'p̂_S = (k + m·p0) / (n + m)，即 Beta(m·p0, m·(1−p0)) 先验下的后验均值',
        meaning: '信号样本少时把命中率向基础上涨率收缩，避免 3 次全中就输出 100%。',
        params: [
            P('m', 'config.prior_strength = 20', '先验强度，越大越保守；写入 prob_signal_stat.prior_strength'),
            P('n, k', '信号出现次数与其中上涨次数', '样本按 w=0.5^(age/half_life) 加权后再累计，half_life=60 个交易日；n 为加权有效样本 n_eff'),
            P('age', 'train_end_pos − 样本交易日序号', '越老的样本权重越低，让新信息权重更高'),
        ],
        inputStats: '按交易日分组累计加权 k、n；Wilson 区间给出 ci_low/ci_high。',
        output: 'prob_signal_stat.posterior_mean / n_eff / ci_low / ci_high',
        table: 'prob_signal_stat',
        example: 'p0=0.5、m=20、n=10、k=8 → (8+10)/(10+20)=0.60（§14）',
        doc: '§7.2 M1、§14',
    },
    {
        id: 'naive_logodds', term: 'logit(p) = logit(p0) + Σ(...)', cn: '多信号 log-odds 合并', group: 'direction',
        expr: 'logit(p) = logit(p0) + Σ_i [ logit(p_i) − logit(p0) ]；logit(x)=ln(x/(1−x))',
        meaning: '把多个信号的后验概率在对数赔率空间相加，得到 M1 的单项概率 p_m1。',
        params: [
            P('p_i', '各单信号/组合信号的 posterior_mean', '只取 n_eff ≥ min_n 的项；组合命中时优先用组合统计'),
            P('p0', '训练期基础上涨率', '与 Beta 先验同一个 p0'),
        ],
        inputStats: '最多取 signal_max_combo=3 个信号；结果截断到 [p_min, p_max]=[0.05,0.95] 防止 logit 溢出。',
        output: 'components_json.p_m1 → M10',
        table: 'prob_prediction.components_json',
        doc: '§7.2 M1', caution: '独立性假设通常不成立，禁止把相关指标的概率直接相乘。',
    },
    {
        id: 'logit_m2', term: 'P(Y=1|X) = σ(β₀+ΣβⱼXⱼ)', cn: 'M2 逻辑回归', group: 'direction',
        expr: 'P(Y_h=1|X) = 1 / (1 + exp(−z))，z = β₀ + β₁X₁ + … + βₙXₙ',
        meaning: '用全市场合并样本训练的线性方向模型，每个周期一个模型；系数可直接解释成「因子贡献」。',
        params: [
            P('X_j', 'features.yaml 中 40+ 个标准化特征（含横截面排名）', '训练期 winsorize → 中位数填充 → z 标准化；缺失率>30% 的列剔除'),
            P('β_j', '带 L2 正则的系数', 'C 用带 purge 的时间序列交叉验证从 l2_c_grid 里选；样本按交易日等权，避免股票多的日子权重过大'),
            P('sample_weight', '1 / 当日样本数', '每个交易日总权重相等，再归一化到均值 1'),
        ],
        inputStats: 'max_train_samples=150000，按日在股票维度均匀抽样；CV 把训练日按时间切 3 折，训练折需再剔除与测试折标签重叠的 h 日。',
        output: 'components_json.p_m2、contributions（βⱼ·Xⱼ 前 10 项）、prob_model_registry.params_json.coef',
        table: 'prob_model_registry / prob_prediction.components_json',
        doc: '§7.2 M2、§8.1', caution: '系数是标准化尺度上的贡献，不是「涨多少百分点」。',
    },
    {
        id: 'markov', term: 'P_ij = (n_ij+1)/(Σn_ij+3)', cn: 'M3 马尔可夫转移矩阵', group: 'direction',
        expr: 'P_ij = (n_ij + 1) / (Σ_j n_ij + 3)；π_h = π_1 · P^(h−1)',
        meaning: '把每日收益按自适应阈值分成涨 U / 平 F / 跌 D 三状态，估计状态转移概率并外推到第 h 天。',
        params: [
            P('θ_t', 'κ·σ_t，κ=0.5', 'σ_t 取 M4 条件波动（不可用则 20 日滚动标准差）；r_t>θ 记 U，r_t<−θ 记 D，其余 F'),
            P('n_ij', '该股窗口内全部有效转移计数', '拉普拉斯平滑 +1；p>0.10 的卡方独立性检验不显著时，每行与无条件状态分布各占 50% 收缩'),
            P('π_1', '当前状态 one-hot', '例如当前 U → [1,0,0]'),
        ],
        inputStats: '只用单股窗口内 t 日及以前的有效转移；π_h 是「第 h 天当天上涨」的概率，不等于 h 日累计收益>0 的概率。',
        output: 'components_json.p_markov_h、markov_matrix、markov_pvalue、p_uu/p_dd、期望连涨 1/(1−P_UU)',
        table: 'prob_stock_model_state / prob_prediction.components_json',
        example: 'P=[[0.65,0.20,0.15],[0.35,0.40,0.25],[0.25,0.25,0.50]]，π1=[0.65,0.20,0.15] → π2=[0.53,0.2475,0.2225]（§14）',
        doc: '§7.2 M3、§14', caution: 'p_markov_h 只作为 M10 输入，不得直接当作 p_up 发布。',
    },
    {
        id: 'binomial', term: 'C(n,k)pᵏ(1−p)ⁿ⁻ᵏ', cn: '伯努利与二项分布', group: 'direction',
        expr: 'Y_h ~ Bernoulli(p_up)；P(X=k) = C(n,k)·p^k·(1−p)^(n−k)',
        meaning: '伯努利只负责方向；二项分布仅用于展示「未来 n 日中上涨 k 天」的概率与策略胜率的显著性检验，不做主预测。',
        params: [
            P('p', 'p_up 或基础上涨率', '展示用 p_up；胜率检验 H0 用 0.5 或训练期基础上涨率'),
            P('n, k', '回测交易笔数与盈利笔数', '来自 prob_backtest_trade.net_return > 0'),
        ],
        inputStats: '「未来 n 日中上涨 k 天」假设每日独立同分布，界面必须注明这是简化假设。',
        output: '回测页 win_pvalue（双侧二项检验）',
        table: 'prob_backtest_summary.win_pvalue',
        example: 'n=5、k=3、p=0.6 → 34.56%（§14）',
        doc: '§7.2、§8.5、§14',
    },

    /* ------------------------------------------------------------ 波动模型 */
    {
        id: 'garch', term: 'GARCH(1,1)-t', cn: 'M4 条件波动', group: 'vol',
        expr: 'r_t = μ + ε_t，ε_t = σ_t·z_t，z_t ~ 标准化 t(ν)；σ_t² = ω + α·ε²_{t−1} + β·σ²_{t−1}',
        meaning: '用单股自己的收益序列拟合波动聚集与厚尾，参数只有 ω/α/β/ν 四个，500 个样本不容易过拟合。',
        params: [
            P('r_t', '该股有效交易日的对数收益 ×100', '最近 500 个有效收益（至少 garch_min_obs=250）；乘 100 拟合再还原，提高数值稳定性'),
            P('ω, α, β, ν', '极大似然估计（Standardized Student-t 对数似然）', '约束 ω>0、α≥0、β≥0、α+β<1、2.1<ν≤30；不收敛/触边/α+β≥0.999 回退 EWMA'),
            P('scale', 'sqrt((ν−2)/ν)', '把 t(ν) 标准化成方差 1；ν 越小尾部越厚'),
        ],
        inputStats: '方差递推 σ²_t=ω+αr²_{t−1}+βσ²_{t−1} 是线性的，用 scipy.signal.lfilter 向量化；每日重拟合（garch_refit_every=1）。',
        output: 'prob_stock_model_state（omega/alpha/beta/nu/loglik/converged/n_obs/lb_pvalue/jb_pvalue/sigma_1d_next）',
        table: 'prob_stock_model_state',
        doc: '§7.3', caution: '标准化残差平方的 Ljung-Box 与 Jarque-Bera p 值是诊断，不是模型是否可用的唯一标准。',
    },
    {
        id: 'ewma', term: 'σ²_t = λσ²_{t−1} + (1−λ)r²_{t−1}', cn: 'EWMA 回退', group: 'vol',
        expr: 'σ²_t = λ·σ²_{t−1} + (1−λ)·r²_{t−1}，λ=0.94；σ_h² = h·σ²_{t+1}',
        meaning: 'GARCH 拟合失败或样本不足时的保守回退；个股可靠性评级会因此降一档并标记 VOL_EWMA。',
        params: [
            P('λ', 'config.ewma_lambda = 0.94', '固定衰减系数；初值用前 20 个收益的方差'),
            P('ν', '全市场合并估计值，默认 8', 'EWMA 没有分布参数，用固定厚尾自由度'),
        ],
        inputStats: '逐收益递推；walk-forward 快速模式（oos_fast=true）为控制耗时有意使用 EWMA，此时不视为个股模型失败。',
        output: 'prob_prediction.vol_model="EWMA"、flags 含 VOL_EWMA',
        table: 'prob_prediction / prob_stock_model_state',
        doc: '§7.3',
    },
    {
        id: 'garch_h', term: 'σ_h² = Σ E[σ²_{t+k}]', cn: 'h 日波动递推', group: 'vol',
        expr: 'σ̄² = ω/(1−α−β)；E[σ²_{t+k}] = σ̄² + (α+β)^(k−1)·(σ²_{t+1} − σ̄²)；σ_h² = Σ_{k=1..h} E[σ²_{t+k}]；vol_h = sqrt(σ_h²)',
        meaning: '把次日条件波动按 GARCH 均值回复速度外推到 h 个交易日，得到分位数与风险指标共同使用的尺度参数。',
        params: [
            P('σ²_{t+1}', 'ω + α·r²_t + β·σ²_t', 't 日及以前的信息'),
            P('α+β', '波动持续性', '越接近 1，波动冲击衰减越慢'),
        ],
        inputStats: '逐日增量由 h 日累计方差反推，用于 FHS 逐日波动更新；恒正处理避免数值下溢。',
        output: 'prob_prediction.vol_1d_next / vol_h；components_json.sigma_h',
        table: 'prob_prediction',
        example: 'ω=0.05、α=0.05、β=0.90、σ²_{t+1}=2.0 → σ̄²=1.0、E[σ²_{t+2}]=1.95、h=2 时 σ_h²=3.95（§14）',
        doc: '§7.3、§14',
    },
    {
        id: 'qlike', term: 'QLIKE', cn: '波动率择优指标', group: 'vol',
        expr: 'QLIKE = mean( ln(σ²_forecast) + σ²_realized / σ²_forecast )',
        meaning: '比较 GARCH-t 与 EWMA 的样本外波动预测质量，越小越好。',
        params: [
            P('σ²_realized', '已实现波动 = h 日内 sqrt(Σ r²)', '评估阶段用结算后的实现收益近似'),
            P('σ²_forecast', 'vol_h²', '来自 prob_prediction.vol_h'),
        ],
        inputStats: '按周期、全市场样本外样本求均值；与基准差异一并写入 prob_eval_metric。',
        output: 'prob_eval_metric (metric_name="QLIKE")',
        table: 'prob_eval_metric',
        doc: '§7.7、§8.2',
    },

    /* ------------------------------------------------------------ 幅度与分布 */
    {
        id: 'm5_expectation', term: 'E[R_h] = p_up·m_up + (1−p_up)·m_dn', cn: 'M5 条件期望', group: 'dist',
        expr: 'E[R_h] = p_up·m_up + (1−p_up)·m_dn；m_up = k_up·σ_h，m_dn = k_dn·σ_h',
        meaning: '把「胜率」与「盈亏幅度」合起来，避免只看概率：高胜率但亏起来一次抹平多次小赚，期望仍可能为负。',
        params: [
            P('k_up', 'E[R_h/σ_h | R_h>0]', '全市场合并训练样本、按日等权；估计前先对 R_h/σ_h 做 1%/99% winsorize'),
            P('k_dn', 'E[R_h/σ_h | R_h≤0]', '同上，通常为负值；写进 prob_model_registry.params_json'),
            P('p_up', 'M10 最终校准概率', '不是 M1/M2 的原始概率'),
            P('σ_h', 'vol_h', 'M4 给出的 h 日波动'),
        ],
        inputStats: 'k_up/k_dn 按交易日等权（每天先求均值再平均），避免股票多的日子主导；样本必须 purge。',
        output: 'components_json.exp_ret_cond（交叉检验用）；最终 exp_ret 取一致性分布均值',
        table: 'prob_model_registry / prob_prediction.components_json',
        example: 'A：p=0.8、涨+1%、跌−5% → −0.2%；B：p=0.6、涨+5%、跌−2% → +2.2%（§14）；离散 E=Σpᵢxᵢ：0.2×5%+0.4×2%+0.4×(−3%)=+0.6%',
        doc: '§7.4 M5、§14', caution: 'exp_ret_cond 与分布均值符号相反时记 flags=EXP_SIGN_MISMATCH 并降级。',
    },
    {
        id: 'pinball', term: 'ρ_τ(u) = u(τ − 1[u<0])', cn: 'M6 分位数回归损失', group: 'dist',
        expr: 'ρ_τ(u) = u·(τ − 1[u<0])；目标变量为标准化收益 R_h/σ_h，τ ∈ {0.05,0.25,0.5,0.75,0.95}',
        meaning: '分别拟合 5 个分位，得到收益率分位区间；损失对高估/低估不对称，因此能直接学出 q05/q95。',
        params: [
            P('X', '精简特征子集（≤20 个：动量、z 值、波动分位、量能、估值分位、相对市场）', '与 M2 共用训练期预处理器；预测分位 = σ_h × 标准化分位'),
            P('τ', 'config.quantile_taus', '分位水平；出现交叉时排序修正，保证 q05≤…≤q95'),
            P('epochs/lr/l2', 'quantile_epochs=60、learning_rate=0.05、l2=0.001', '向量化 mini-batch SGD（4096 行/批），纯 numpy，无额外依赖'),
        ],
        inputStats: '合并样本按日等权；标签先除以 σ_h 标准化并 winsorize；固定随机种子保证可复现。',
        output: 'components_json.q_quantreg（参与方法择优）；prob_model_registry.params_json.coef',
        table: 'prob_model_registry / prob_prediction.components_json',
        doc: '§7.4 M6', caution: '分位点是统计估计，不代表未来一定落在 q05–q95 区间内。',
    },
    {
        id: 'gbm', term: 'GBM 蒙特卡洛', cn: '基线几何布朗运动', group: 'dist',
        expr: 'S_{t+Δ} = S_t · exp[(μ − σ²/2)·Δ + σ·√Δ·Z]，Δ = 1/trading_days_per_year',
        meaning: '作为 M7 的对照基线；默认实际使用 FHS（过滤历史模拟）以同时体现厚尾与波动聚集。',
        params: [
            P('μ', 'M5 的 E[R_h] 折算', '年化漂移'),
            P('σ', 'vol_1d_next × √244', '日波动年化后用于 Δ=1/244 的步长'),
            P('Z', '标准正态随机数', '固定种子 = hash(code, asof_date, seed_base)'),
        ],
        inputStats: '100000 条路径向量化；解析终值均值 E[S_T]=S0·exp(μT) 用于校验。',
        output: '分布方法的候选之一；selected_method 中记录',
        table: 'prob_prediction.selected_method',
        example: 'S0=100、μ=10%、σ=30%、T=20/244、100000 条路径 → 终值均值 ≈ 100.82（§14）',
        doc: '§7.4 M7、§14',
    },
    {
        id: 'fhs', term: 'r_{t+k} = μ_d + σ_{t+k}·z*_k', cn: 'M7 FHS 过滤历史模拟', group: 'dist',
        expr: 'r_{t+k} = μ_d + σ_{t+k}·z*_k，z*_k 从 M4 标准化残差池有放回抽样；R_h = Σ_{k=1..h} ln(1+clip(exp(r_k)−1, −L, +L))',
        meaning: '逐日按 GARCH 递推更新波动，用真实残差（而非正态随机数）抽样，同时保留厚尾和波动聚集；再按涨跌停逐日截断。',
        params: [
            P('z*_k', 'vol.residual_pool（标准化残差）', '该股自身残差，可配置混入全市场合并残差；有放回抽样'),
            P('σ_{t+k}', '由 σ_h² 递推反推的逐日条件波动', '见「h 日波动递推」公式'),
            P('L', 'config.limit_pct 按板块/ST 查表', '主板 10%、创业板 20%、ST 5%；涨跌停判定还要 close==high / close==low'),
            P('n_paths', 'config.n_paths = 10000', '可配置 50000/100000；numpy 向量化，按股票分批'),
            P('seed', 'hash(code, asof_date, seed_base)', '同一输入两次运行输出完全一致'),
        ],
        inputStats: '所有候选漂移共用同一批随机数，保证 P(R_h>0) 关于 μ_d 单调平滑；统计 P(R>0)、P(R≤−5%/≤−10%)、P(R≥+5%/≥+10%)、分位、均值、VaR/CVaR。',
        output: 'prob_prediction 的 q05–q95、prob_drop_*/prob_rise_*、exp_ret、var95/var99/cvar95',
        table: 'prob_prediction',
        doc: '§4.4、§7.4 M7',
    },
    {
        id: 'consistency', term: 'P_sim(R_h>0) = p_up', cn: '联合一致性（漂移求根）', group: 'dist',
        expr: '二分法求 μ_d 使模拟的 P(R_h>0) = 最终 p_up；分布均值作为 exp_ret',
        meaning: '防止「方向模型说 70% 上涨、模拟分布却只有 45% 上涨」的自相矛盾；consistency_mode=expectation 时改为用 M5 期望折算漂移。',
        params: [
            P('p_up', 'M10 校准并截断后的最终概率', '目标值，截断到 [0.05,0.95]'),
            P('μ_d', '逐日漂移', '初值取未截断分布的解析分位解，再做二分；涨跌停截断导致二分无法收敛时，对同一批路径做位置平移等价求根'),
            P('exp_ret_cond', 'M5 条件期望', '符号与分布均值相反时记 EXP_SIGN_MISMATCH'),
        ],
        inputStats: '同一批随机数下 P(R>0) 随 μ_d 单调递增；验收要求 |P_sim − p_up| ≤ 0.002（n_paths=10000）。',
        output: 'components_json.sim_p_up / mu_d；prob_prediction.flags',
        table: 'prob_prediction.components_json',
        doc: '§7.6 第 4 步、§14 性质测试',
    },
    {
        id: 'location_t', term: 'R_h = μ_h + σ_h·t(ν)', cn: 'location-scale t 解析分布', group: 'dist',
        expr: 'R_h = μ_h + σ_h·z，z ~ 标准化 t(ν)；q_τ = μ_h + σ_h·sqrt((ν−2)/ν)·t_ν^{-1}(τ)',
        meaning: '分位数有解析解，walk-forward 的快速 OOS 用它代替 10000 条路径，让样本外区间能覆盖全市场；也是方法择优的候选之一。',
        params: [
            P('μ_h', '由 p_up 反解：μ_h = −σ_h·scale·t_ν^{-1}(1−p_up)', '保证解析分布的 P(R>0) 也等于最终 p_up'),
            P('ν', 'M4 拟合的自由度（EWMA 回退时 8）', 'ν 越小尾部越厚'),
        ],
        inputStats: 'VaR/CVaR 用解析分位 + 400 点下尾数值积分；不消耗随机数，秒级完成。',
        output: 'OOS 预测的 q05–q95、var95/var99/cvar95；selected_method=location_scale_t',
        table: 'prob_prediction.selected_method',
        doc: '§7.7、docs/decisions.md',
    },

    /* ------------------------------------------------------------ 风险模型 */
    {
        id: 'var_cvar', term: 'VaR_α / CVaR_α', cn: 'M8 风险度量', group: 'risk',
        expr: 'VaR_α = −Q_{1−α}(R_h)；CVaR_α = −E[ R_h | R_h ≤ Q_{1−α} ]',
        meaning: '以正数损失率表示：var95=0.035 表示在分布假设下 5% 的情形会亏超过 3.5%；cvar95 是这些最差情形的平均亏损。',
        params: [
            P('R_h', 'M7 / location-scale t 给出的简单收益分布', '10000 条路径或解析分位'),
            P('α', '0.95 / 0.99', '对应 q05 / q01 下尾'),
        ],
        inputStats: 'CVaR 对下尾样本求均值（模拟）或 400 点数值积分（解析）；结算后 breach_var95 记实际收益是否突破。',
        output: 'prob_prediction.var95 / var99 / cvar95 / breach_var95',
        table: 'prob_prediction',
        doc: '§7.5 M8、§8.2',
    },
    {
        id: 'evt', term: 'GPD / POT', cn: 'M9 极值理论', group: 'risk',
        expr: 'L = −z；超限量 y = L − u ~ GPD(ξ,β)，F(y)=1−(1+ξy/β)^(−1/ξ)；VaR_p = u + (β/ξ)[((n/N_u)(1−p))^(−ξ) − 1]；ES_p = (VaR_p + β − ξu)/(1−ξ)',
        meaning: '单股尾部样本太少，用全市场合并的标准化残差下尾拟合广义帕累托分布，估计 1 日 99%/99.5% 的极端 VaR/ES。',
        params: [
            P('u', '合并残差损失的 90% 分位', 'config.evt_tail_quantile；每组独立取阈值'),
            P('N_u', '超过 u 的样本数', '合并后 < evt_min_exceedances(50) 时回退 Student-t'),
            P('ξ, β', 'scipy.stats.genpareto 极大似然拟合（loc=0）', '按波动率低/中/高三个分组合并拟合，ξ 截断到 [−0.5,0.9]'),
        ],
        inputStats: '残差来自每只股票 M4 拟合后的标准化残差；按 sigma_1d_next 排序三等分后合并。',
        output: 'prob_model_registry (M9_evt_*) 与 prob_method_choice (VaR_evt_*)',
        table: 'prob_model_registry / prob_method_choice',
        example: 'u=2、β=1、ξ=0.1、n=1000、N_u=100、p=0.99 → VaR≈4.589、ES≈5.988（§14）',
        doc: '§7.5 M9、§14',
    },
    {
        id: 'risk_level', term: 'risk_level', cn: '风险等级', group: 'risk',
        expr: 'pct = max( 当日 vol_h 横截面分位, 当日 cvar95 横截面分位 )；<30% 低(1)、30–70% 中(2)、70–90% 高(3)、>90% 极高(4)',
        meaning: '同时考虑波动与尾部损失，取两者中更危险的排名，避免只看波动漏掉厚尾个股。',
        params: [
            P('vol_h 分位', '当日全市场 rank(pct=True)', '按同一 horizon 内所有股票计算'),
            P('cvar95 分位', '当日全市场 rank(pct=True)', '同上'),
        ],
        inputStats: '在每个 asof/horizon 的横截面上计算，阈值 risk_low_cut / risk_mid_cut / risk_high_cut 可配置。',
        output: 'prob_prediction.risk_level；components_json.vol_pctile_mkt',
        table: 'prob_prediction',
        doc: '§7.5',
    },
    {
        id: 'mdd_sharpe', term: 'MDD / Sharpe', cn: '历史描述指标', group: 'risk',
        expr: 'MDD = max_t (Peak_t − Price_t)/Peak_t；Sharpe = (E[R] − rf)/σ · √244；年化波动 = std(r)·√244',
        meaning: '只用最近 250 个交易日的已实现收益，描述该股历史风险收益特征，不参与任何预测。',
        params: [
            P('Price_t', 'exp(cumsum(r))', '由该股有效交易日对数收益累积构造'),
            P('rf', 'config.rf = 0.02（年化）', '折算成日频 rf/244'),
        ],
        inputStats: '窗口 250 日；样本 <20 记 0。',
        output: 'prob_stock_model_state.mdd_250 / sharpe_250 / ann_vol_250',
        table: 'prob_stock_model_state',
        doc: '§7.5', caution: '仅供历史描述，不代表未来。',
    },
    {
        id: 'kupiec', term: 'Kupiec POF', cn: 'VaR 突破率检验', group: 'risk',
        expr: 'LR = 2·[ ln((1−x/n)^(n−x)·(x/n)^x) − ln((1−p)^(n−x)·p^x) ] ~ χ²(1)，p=1−α',
        meaning: '检验实际突破 VaR95 的比例是否接近名义 5%；p 值过小说明风险被系统性低估。',
        params: [
            P('x', 'prob_prediction.breach_var95 之和', '结算后按 horizon 汇总'),
            P('n', '已结算的样本数', 'OOS 样本'),
        ],
        inputStats: '按周期、全市场样本外样本计算；同时写入突破率本身。',
        output: 'prob_eval_metric (var95_breach / kupiec_pvalue)',
        table: 'prob_eval_metric',
        doc: '§8.2、§8.4', caution: '近 120 日突破率超出 Kupiec 95% 接受区间的个股，可靠性降一档。',
    },

    /* ------------------------------------------------------------ 融合校准与评估 */
    {
        id: 'stacking', term: 'M10 Stacking', cn: '融合元模型', group: 'fusion',
        expr: 'p_raw = σ( b + w₁·logit(p_m1) + w₂·logit(p_m2) + w₃·logit(p_markov) + w₄·logit(p_base) + w₅·vol_pctile_self )',
        meaning: '元模型是带非负系数约束的逻辑回归，只用 L1 模型的样本外预测训练；禁止把相关指标的概率直接相乘或简单平均。',
        params: [
            P('logit(p_m1/m2/markov/base)', 'components_json 的 4 个分项概率', '全部来自样本外 OOS 预测，滚动 L2 只用当前测试块之前的样本'),
            P('w', 'scipy.optimize 带 bounds≥0 的极大似然解', '70% 样本训练、30% 样本拟合校准器'),
            P('vol_pctile_self', '该股历史条件波动分位', 'M4 输出的 vol_pctile_self'),
        ],
        inputStats: '样本外样本 ≥200 才训练；每 20 个交易日随样本外块滚动重训，实现「越往后信息越多」。',
        output: 'components_json.p_stack_raw → 校准后 p_up',
        table: 'prob_prediction.components_json',
        doc: '§7.6 第 1 步、§8.1',
    },
    {
        id: 'calibration', term: 'Platt / Isotonic', cn: '概率校准', group: 'fusion',
        expr: '样本外样本 ≥ isotonic_min_samples(5000) 用保序回归 isotonic；否则 Platt：p = σ(a·logit(p_raw)+b)',
        meaning: '把融合输出的原始分数映射到真实上涨频率，降低 ECE；校准器同样按时间顺序拟合，并用最近一个样本外块评估 ECE。',
        params: [
            P('p_raw', 'stacking 输出', '训练 70% 之后的 30% 样本外块用于拟合'),
            P('a,b', 'Platt 的一维逻辑回归系数', 'C=1e6（近似无正则）'),
        ],
        inputStats: '按时间顺序切分，绝不随机打乱；输出再截断到 [p_min,p_max]=[0.05,0.95]。',
        output: 'prob_prediction.p_up；FusionModel.ece_before/ece_after',
        table: 'prob_prediction / 引擎日志',
        doc: '§7.6 第 2–3 步', example: '本次全量运行日志可见 h=1 的 ECE 由 0.0519 降到 0.0012。',
    },
    {
        id: 'brier_bss', term: 'Brier / BSS / LogLoss / AUC', cn: '方向评估指标', group: 'fusion',
        expr: 'Brier = mean((p−y)²)；BSS = 1 − Brier_model/Brier_base；LogLoss = −mean(y·ln p + (1−y)·ln(1−p))；AUC 按交易日在横截面计算后取均值',
        meaning: 'BSS>0 才说明模型相对「永远猜基础上涨率」有样本外优势；验收不以胜率或 AUC 高为准，而以校准良好、不劣于基准为准。',
        params: [
            P('y', 'prob_prediction.realized_up', '只取 OOS 且 status=SETTLED'),
            P('p_base', '训练期基础上涨率', '基准 B0；B1 为正态基线、B2 为常数 0.5'),
        ],
        inputStats: '按全市场、分月、波动率分组、预测周期分别输出；相对基准的差异写 delta。',
        output: 'prob_eval_metric (Brier/LogLoss/AUC/BSS/ECE/RankIC/QLIKE/...)',
        table: 'prob_eval_metric',
        doc: '§8.2、§8.3、§13', caution: '样本外没有优势的周期必须标 C/D 级，界面会明确写「无样本外预测优势」。',
    },
    {
        id: 'ece', term: 'ECE / 校准曲线', cn: '校准误差与分箱', group: 'fusion',
        expr: 'ECE = Σ_b (n_b/N)·| mean_pred_b − freq_up_b |，10 等分箱',
        meaning: '预测 70% 的一组样本，实际是否约 70% 上涨；校准曲线越贴近对角线越好。',
        params: [
            P('mean_pred_b', '该箱 p_up 均值', 'bin_no 1..10，bin_low/bin_high 为 0.1 宽度'),
            P('freq_up_b', '该箱 realized_up 均值', '样本外已结算样本'),
        ],
        inputStats: '每个 horizon、每个 model 分别分箱；写入 prob_calibration_bin，前端画校准曲线。',
        output: 'prob_eval_metric.ECE、prob_calibration_bin',
        table: 'prob_calibration_bin / prob_eval_metric',
        doc: '§8.2',
    },
    {
        id: 'rank_ic', term: 'Rank IC / IC_IR', cn: '横截面秩相关', group: 'fusion',
        expr: 'IC_t = Spearman( exp_ret_{i,t}, realized_ret_{i,t} )；IC_IR = mean(IC)/std(IC)',
        meaning: '衡量期望收益排序在当日横截面上是否真有区分力；五分位分层的平均实现收益可进一步看单调性。',
        params: [
            P('exp_ret', 'prob_prediction.exp_ret', '预测期望收益'),
            P('realized_ret', '结算后的已实现简单收益', '同一 asof+h'),
        ],
        inputStats: '按交易日计算（当日样本 ≥5 才计），再取均值与标准差。',
        output: 'prob_eval_metric (RankIC / IC_IR)',
        table: 'prob_eval_metric',
        doc: '§8.2',
    },
    {
        id: 'coverage', term: '分位覆盖率 / bootstrap', cn: '区间与显著性', group: 'fusion',
        expr: 'P(R<q05)≈5%、P(R<q95)≈95%、P(q05≤R≤q95)≈90%；BSS 的 95% 区间用按交易日 block bootstrap（block 长度 = h）',
        meaning: '区间是否名副其实；因为 h 日标签重叠，显著性检验必须以交易日为单位成块重采样，不能逐样本独立 bootstrap。',
        params: [
            P('below_q05 / above_q95', '结算时写入的 0/1 标记', 'prob_prediction'),
            P('block', 'h（标签重叠长度）', 'n_boot=300，固定种子'),
        ],
        inputStats: '按周期汇总；ci_low/ci_high 写进 prob_eval_metric。',
        output: 'prob_eval_metric (q05_coverage / q95_coverage / interval_coverage / BSS.ci_*)',
        table: 'prob_eval_metric',
        doc: '§8.2、§8.4',
    },
    {
        id: 'grade', term: 'reliability_grade', cn: '可靠性评级', group: 'fusion',
        expr: '周期层：BSS>0 且 bootstrap 95% 下界>0 → A；BSS>0 但区间含 0 → B；BSS≤0 → C。个股每命中一项降一档，最低 D',
        meaning: '如实表达不确定性：模型样本外没有优势时必须标出来，而不是输出看似自信的概率。',
        params: [
            P('降级项', 'vol_model=EWMA、有效样本<300、近120日 VaR 突破率超 Kupiec 区间、flags 含 EXP_SIGN_MISMATCH、近20日有停牌或涨停≥3次', '每项降一档，最低 D'),
            P('period_grade', 'evaluate() 按周期算出的基础等级', '写进 prob_eval_metric.reliability_grade_num'),
        ],
        inputStats: 'LIVE 预测按完整规则降级；OOS 快速模式有意用 EWMA/截断窗口，属于工程近似，不计入个股降级（见 docs/decisions.md）。',
        output: 'prob_prediction.reliability_grade / flags',
        table: 'prob_prediction',
        doc: '§8.4、§13',
    },
    {
        id: 'method_choice', term: '方法择优', cn: '多样本外方法比较', group: 'fusion',
        expr: '对每个输出按样本外指标选最小/最优方法：p_up→Brier、exp_ret→MAE/RankIC、分位→pinball、波动→QLIKE、VaR→Kupiec',
        meaning: '同一个输出有多个候选方法时，不预设谁赢；选中的方法写入 selected_method，每 20 个交易日重评一次。',
        params: [
            P('candidates_json', '各候选方法的样本外得分', '例如 {M10:0.23, M1:0.25, M2:0.24}'),
            P('eval_date', '评估日期', '前端「可靠性与复盘」页展示'),
        ],
        inputStats: '在全部已结算 OOS 样本上按 horizon 计算。',
        output: 'prob_method_choice、prob_prediction.selected_method',
        table: 'prob_method_choice',
        doc: '§7.7',
    },

    /* ------------------------------------------------------------ 回测 */
    {
        id: 'bt_trade', term: 'net_return', cn: '单笔成交与成本', group: 'backtest',
        expr: '净收益 = [ sell·(1−commission−stamp_duty−slippage) ] / [ buy·(1+commission+slippage) ] − 1',
        meaning: 't+1 开盘买入、t+1+h 收盘卖出（满足 T+1，比标签口径更保守）；买入日一字涨停视为买不到，卖出日跌停顺延。',
        params: [
            P('buy', 'stock_daily.open（t+1）', '一字涨停判定：open ≥ preclose×(1+L)−ε 且 high==low'),
            P('sell', 'stock_daily.close（t+1+h）', '跌停顺延到下一个可卖交易日，最多 5 天'),
            P('commission', 'config.commission = 0.00025', '双边'),
            P('stamp_duty', 'config.stamp_duty = 0.0005', '仅卖出'),
            P('slippage', 'config.slippage = 0.001', '单边'),
        ],
        inputStats: '每日在股票池按 p_up（或 exp_ret/vol_h）取 top_n=20，要求 reliability_grade 不低于 backtest.min_grade。',
        output: 'prob_backtest_trade.net_return / skipped',
        table: 'prob_backtest_trade',
        doc: '§8.5', caution: '回测只用于检验样本外预测是否可交易，样本期仅约两年且行情阶段单一。',
    },
    {
        id: 'bt_nav', term: 'NAV / 年化指标', cn: '组合净值与绩效', group: 'backtest',
        expr: '每日组合收益 r_t = mean(当日平仓交易净收益)/h；nav_t = Π(1+r_t)；年化收益 = (nav_T/nav_0)^(244/T)−1；Sharpe=(mean(r)−rf/244)/std(r)·√244；MDD=max(Peak−NAV)/Peak',
        meaning: '等权组合，每日新开仓、持仓相互重叠（每笔占 1/h 资金）；基准为全市场等权收益净值。',
        params: [
            P('h', 'backtest.horizon', '默认 1，可配置为 3/5/10'),
            P('bench', 'market proxy 逐日等权收益', '来自 stock_daily 自身'),
        ],
        inputStats: '按交易日累积；换手 = 平均每日成交笔数 / top_n；胜率显著性用双侧二项检验。',
        output: 'prob_backtest_summary、prob_backtest_nav（nav/bench_nav/drawdown）',
        table: 'prob_backtest_summary / prob_backtest_nav',
        doc: '§8.5',
    },

    /* ------------------------------------------------------------ 自动化与审计 */
    {
        id: 'daily', term: 'engine daily', cn: '一键全链路', group: 'ops',
        expr: 'prepare →（按间隔）walkforward → train → LIVE predict → settle → evaluate → EVT → backtest',
        meaning: '一条命令跑完全链路，人工操作最少；后端点「一键运行」也是拉起同一个 CLI，并把进度写进 prob_run。',
        params: [
            P('retrain_every', 'config.retrain_every = 20', '距上次滚动评估 ≥20 个交易日或 OOS 样本 <1000 时自动重跑 walkforward'),
            P('checkpoint', 'walkforward.checkpoint_file', '记录已完成的测试块；同一 asof 重跑会跳过已完成部分，支持断点续跑'),
            P('fail_rate_alert', 'engine.fail_rate_alert = 0.05', '单只股票失败不中断整体；失败率超阈值告警'),
        ],
        inputStats: '每一步都写 prob_run（run_type、配置快照、模型版本、成功/失败数、耗时、排除原因）；同一主键重跑覆盖（upsert）。',
        output: 'prob_run、prob_* 全部表、artifacts/ 模型产物',
        table: 'prob_run',
        doc: '§10.1、§10.2、§13',
    },
    {
        id: 'version', term: 'model_version', cn: '可复现与审计', group: 'ops',
        expr: 'model_version = engine_code_version + "-" + sha1(完整配置 JSON)[:10]',
        meaning: '每条预测都能通过 run_id / model_version 追溯到当时的配置快照与代码版本；配置一改，版本号就变，不会和旧预测混在一起。',
        params: [
            P('config_json', 'prob_run.config_json', '本次运行的完整配置快照'),
            P('seed', 'hash(code, asof_date, seed_base)', '固定随机种子，同一输入两次运行完全一致'),
        ],
        inputStats: '所有「可配置」参数都在 config.yaml，不写死在代码里；模型产物按 artifacts/{model}/{horizon}/{train_end_date}/ 存放，数据库只登记路径。',
        output: 'prob_run.model_version / config_json、prob_prediction.model_version',
        table: 'prob_run / prob_prediction / prob_model_registry',
        doc: '§0、§9.3、§12.2、§13',
    },
    {
        id: 'disclaimer', term: '免责声明', cn: '口径与边界', group: 'ops',
        expr: '所有输出都是统计估计，不构成投资建议',
        meaning: '样本只有约两年、行情阶段单一；历史概率不能保证未来；表内没有行业、资金流、指数和股票名称，v1 只用 stock_daily 自身衍生的信息。',
        params: [
            P('样本窗口', '500 个交易日（约两年）', '特征预热约 60 日，有效样本约 440 日；单股只拟合低参数模型'),
            P('免责文案', 'config.disclaimer', '接口、页面顶部、报告统一使用'),
        ],
        inputStats: '方向、幅度、风险分别建模；不以「胜率/AUC 达到某个高值」验收，而看校准、覆盖率、可靠性标注是否如实。',
        output: '每个接口响应 disclaimer 字段、每个页面顶部固定免责条',
        table: 'ProbResponse.disclaimer',
        doc: '§1、§13、§15',
    },
];

export const FORMULA_MAP = Object.fromEntries(FORMULAS.map((f) => [f.id, f]));

export function findFormula(id) {
    return FORMULA_MAP[id] || null;
}

export function groupCount(id) {
    return id === 'all' ? FORMULAS.length : FORMULAS.filter((f) => f.group === id).length;
}
