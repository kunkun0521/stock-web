import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { forecastApi } from '../api/forecast.js';
import { useApi } from '../hooks/useApi.js';
import { readPageState, writePageState } from '../hooks/usePersistedState.js';
import EChart from '../components/EChart.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import ParamLabel from '../components/ParamLabel.jsx';
import Tabs from '../components/Tabs.jsx';
import { rankIcOption, weightOption } from '../charts/options.js';
import { formatNum, formatPct, pctClass } from '../utils/format.js';

const STATUS_TABS = [
    { value: '', label: '全部' },
    { value: 'champion', label: '在役' },
    { value: 'candidate', label: '影子运行' },
    { value: 'retired', label: '已退役' },
];

const STATUS_LABEL = { champion: '在役', candidate: '影子运行', retired: '已退役' };

/** 筛选状态保存在会话内：页面内「返回」、侧边栏切页和浏览器后退都能还原之前的选择 */
const FILTER_KEY = 'forecast:filters';

const readSavedFilters = () => readPageState(FILTER_KEY) ?? null;

/** 常驻说明收进标题旁的悬停问号，避免占用版面高度 */
const PANEL_TIPS = {
    picks: '融合模型的入选名单：信号日收盘预测，下一交易日开盘买入，持有期到期后核对真实收益。鼠标停在表格行上可查看行业与预测区间。',
    rankIc: '柱子 = 单日 RankIC（红正绿负），蓝线 = 近 20 批滚动均值；蓝线稳定在 0 轴上方才算有效。可滚轮缩放查看更早批次。',
    weight: '各模型在融合决策中的话语权：近期表现越稳定权重越高，持续失效的自动降到 0；图中只显示权重大于 0 的模型。',
    board: '所有模型的成绩单。点击任意一行可切换上方 RankIC 走势对应的模型；把鼠标停在行上可看特征版本与训练区间。',
};

/** 页面顶部的新手术语说明（抽屉内） */
const GLOSSARY = [
    ['信号日', '模型"看图说话"的那一天：用当天收盘后的数据做预测，下一个交易日开盘才买入。'],
    ['持有期', '预测持有多少个交易日：10 日 ≈ 半个月，20 日 ≈ 一个月。到期后系统用真实行情自动对答案。'],
    ['上涨概率', '模型认为这只股票持有期内上涨的可能性。注意：50%~60% 已属有效，不会出现 80%、90%。'],
    ['预测收益', '模型预估的持有期涨跌幅（%）。q10~q90 是预测区间：悲观 ~ 乐观。'],
    ['真实收益 / 超额收益', '持有期到期后的实际涨跌幅；超额 = 真实收益 − 当天全市场平均，>0 说明跑赢了大盘。'],
    ['RankIC', '预测排名和真实涨跌排名的相关程度，越正越好：0.03~0.08 属正常有效，持续为负说明模型失效。'],
    ['ICIR', 'RankIC 的稳定性（均值÷波动），融合模型按它分配话语权：表现又准又稳的模型权重更高。'],
    ['在役 / 影子运行 / 已退役', '在役=正式参与选股；影子运行=只记录不采用，观察约 3 个月；已退役=持续失效被淘汰。'],
    ['融合模型（ensemble）', '把多个模型的预测按权重合成一份"集体智慧"，Top N 选股以它为准。'],
    ['Top N 选股', '通过概率门槛、成交额过滤、同行业不超过 3 只等规则后，最终入选的股票名单。'],
];

/** 五大模型的原理与关键参数（大白话版，对应 predict/models 下的实现） */
const MODEL_INFO = [
    {
        id: 'A · 因子打分',
        tag: 'factor_score · 基线模型',
        principle: '把 18 个指标（因子）各自和历史涨跌的相关性算出来，相关性越稳定的因子话语权越大；加权求和得到综合分，再把分数"翻译"成上涨概率。',
        params: [
            ['因子权重', '= 该因子近期"排序相关性"(RankIC)的稳定性(ICIR)；负相关的因子反着用（保留符号）。'],
            ['概率校准', '用保序回归(Isotonic)把分数映射到真实胜率，不假设任何分布。'],
            ['收益映射', '分数 → 预测收益 用最小二乘线性拟合（斜率/截距）。'],
        ],
    },
    {
        id: 'B · 逻辑回归',
        tag: 'logit · 线性概率模型',
        principle: '把 18 个因子当"证据"，用"是否上涨"当"结论"，学一个线性公式，直接输出上涨概率。',
        params: [
            ['弹性网络', 'l1_ratio=0.5, C=0.5：L1+L2 混合正则，防止因子太多导致过拟合。'],
            ['求解器', 'saga：适合弹性网络的优化器；max_iter=2000 保证收敛。'],
        ],
    },
    {
        id: 'C · LightGBM 三头',
        tag: 'lgbm · 梯度提升树',
        principle: '用很多棵决策树堆叠学习，一个头预测涨/跌概率，一个头预测涨多少，一个头预测涨跌幅的乐观/悲观区间（分位数回归）。',
        params: [
            ['树结构', 'num_leaves=31, min_child_samples=500, learning_rate=0.03, n_estimators=600（树的棵数）。'],
            ['抗过拟合', 'feature_fraction=0.7（每树随机用 70% 因子）、bagging_fraction=0.8（每轮抽 80% 样本）。'],
            ['近期加权', '越近的样本权重越大（线性递增到 2 倍）；回归目标用去极值(Winsorize 1%/99%)的超额收益。'],
        ],
    },
    {
        id: 'D · 排序学习',
        tag: 'lgbm_rank · LambdaRank',
        principle: '不预测"涨多少"，只预测"谁更该排前面"。每天把股票按未来表现分 5 档，训练模型让好股票排更靠前（优化 NDCG）。',
        params: [
            ['标签', '当天超额收益五分档(0~4)，每个交易日作为一个排序 group。'],
            ['截断', 'lambdarank_truncation_level=20：重点关注前 20 名是否排对。树参数同 C。'],
        ],
    },
    {
        id: 'E · 形态规则',
        tag: 'rule · 硬规则（无需训练）',
        principle: '用肉眼能懂的 4 条形态打分：多头排列、接近 20 日新高、温和放量、未超买。满足几条就得几分。',
        params: [
            ['四条规则', '①close>MA20>MA60 ②距20日新高≤0.5% ③量比1.5~3 ④RSI<80。'],
            ['打分', '每条 1 分，满分 4 → ÷4 归一化到[0,1]；prob_up=0.45+得分×0.05。predict 时直接从行情自算。'],
        ],
    },
];

/** 模型评估口径（对应 predict/evaluate.py） */
const EVAL_METRICS = [
    { name: '真实答案口径', desc: 't 日收盘后预测 → t+1 开盘买入 → t+H 收盘卖出；真实收益 = 卖价/买价 − 1，超额 = 减当天全市场平均。' },
    { name: 'RankIC', desc: '预测排名 vs 真实涨跌排名 的相关性（spearman）：越正越准。0.03~0.08 属有效，持续为负 = 失效。' },
    { name: 'ICIR', desc: 'RankIC 的稳定性 = 均值 ÷ 波动；融合权重按它分配（又准又稳的模型话语权更高）。' },
    { name: 'AUC', desc: '上涨概率对"是否上涨"的区分能力：0.5=瞎猜，0.52~0.58 属正常有效。' },
    { name: 'Brier', desc: '概率预测的平方误差，越小说明概率越准。' },
    { name: '分层单调性', desc: '按预测分数十分位，第 10 档均值 − 第 1 档 = decile_spread，验证高分组的确涨得更多。' },
    { name: 'TopN 超额 / 胜率', desc: '入选名单平均跑赢市场多少(超额)、以及里面上涨的比例(胜率)。' },
    { name: '自动淘汰', desc: '滚动 60 批 ICIR<0 且样本够 → 自动退役；影子候选表现超现任才晋升。' },
];

/** 模型输入的因子（特征）分组 */
const FEATURE_GROUPS = [
    { name: '收益率', items: 'ret_5 / 10 / 20 / 60（5、10、20、60 日收益率）' },
    { name: '趋势/均线', items: 'ma_bias_20（偏离20日均线）、macd_hist（MACD 柱）' },
    { name: '波动/风险', items: 'vol_20（收益波动）、atr_14（真实波幅）、amihud_20（非流动性）' },
    { name: '换手/量', items: 'turn_ma5 / 20（换手率均值）、vol_ratio（量比）' },
    { name: '估值倒数', items: 'ep=1/PE、bp=1/PB、sp=1/PS、cfp=1/PCF（天然处理负值）' },
    { name: '规模', items: 'log_mv（20 日均成交额对数，作规模因子）' },
];

/** 概览数字卡：口径说明收进 title，避免常驻小字撑高卡片 */
function MiniStat({ label, value, tone = 'plain', hint }) {
    return (
        <div className="fc-stat" title={hint}>
            <span className="fc-stat-label">{label}</span>
            <strong className={`fc-stat-value ${tone}`}>{value}</strong>
        </div>
    );
}

/** 说明文档抽屉：浮层不占页面文档流，展开时页面高度不变 */
function DocDrawer({ type, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [onClose]);

    return (
        <div className="fc-doc-mask" onClick={onClose}>
            <div className="fc-doc" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="fc-doc-head">
                    <h2>{type === 'glossary' ? '指标说明' : '模型原理'}</h2>
                    <button type="button" className="ghost" onClick={onClose}>关闭</button>
                </div>
                {type === 'glossary' ? (
                    <table className="data-table">
                        <tbody>
                        {GLOSSARY.map(([term, desc]) => (
                            <tr key={term}>
                                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{term}</td>
                                <td className="muted" style={{ whiteSpace: 'normal', textAlign: 'left' }}>{desc}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                ) : (
                    <>
                        <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
                            系统不是"一个模型算命"，而是 5 个风格不同的模型各自独立预测，
                            再把它们的意见按"谁更准更稳"加权合成最终名单（融合）。模型只用到收盘价、成交量这类公开量价数据，
                            不涉及任何内幕消息。下面用大白话解释每个模型的<strong>原理</strong>和<strong>关键参数</strong>。
                        </p>

                        <h3 className="explain-h3">一、五大模型：原理与关键参数</h3>
                        <div className="metric-explain-grid">
                            {MODEL_INFO.map((m) => (
                                <div key={m.id}>
                                    <strong>{m.id}</strong>
                                    <span className="model-tag">{m.tag}</span>
                                    <div style={{ margin: '6px 0' }}>🔧 <b style={{ color: 'var(--text)' }}>原理：</b>{m.principle}</div>
                                    <ul className="param-list">
                                        {m.params.map(([k, v]) => (
                                            <li key={k}><b>{k}</b>：{v}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        <h3 className="explain-h3">二、模型"看"的数据（输入特征 / 因子）</h3>
                        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                            所有特征只用比例类（收益率、价格/均线比值），不用价格绝对值，规避前复权跳变；
                            每个交易日做 1%/99% 去极值 + rank 标准化到 [-1,1]，保证横向可比、无未来函数。
                        </p>
                        <div className="feature-grid">
                            {FEATURE_GROUPS.map((g) => (
                                <div className="feature-group" key={g.name}>
                                    <b>{g.name}</b>
                                    <span>{g.items}</span>
                                </div>
                            ))}
                        </div>

                        <h3 className="explain-h3">三、模型如何评估数据（它怎么知道自己准不准？）</h3>
                        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                            真实"答案"是这样来的：信号 t 日收盘后出预测 → 下一交易日开盘买入 → 持有 H 日收盘卖出；
                            真实收益 = 卖出价 / 买入价 − 1，超额收益 = 减当天全市场平均。到期后系统用真实行情"对答案"，并逐批打分：
                        </p>
                        <div className="metric-explain-grid">
                            {EVAL_METRICS.map((e) => (
                                <div key={e.name}>
                                    <strong>{e.name}</strong>
                                    <span>{e.desc}</span>
                                </div>
                            ))}
                        </div>

                        <h3 className="explain-h3">四、融合与选股（最终名单怎么来的）</h3>
                        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                            各模型先把自己的分数转成"当天全市场百分比排名"，再按最近 60 批的 ICIR 做权重加权平均
                            （失效模型权重置 0），合成 ensemble 分数。最后按下述规则筛出 Top 25：
                        </p>
                        <ul className="param-list">
                            <li><b>概率门槛</b>：上涨概率 ≥ 0.55，且排在截面前 20%</li>
                            <li><b>数量上限</b>：取综合分最高的 25 只</li>
                            <li><b>行业分散</b>：同一行业最多入选 3 只，避免押注单一板块</li>
                        </ul>
                        <div className="forecast-warning">
                            ⚠️ 以上所有内容均为技术方案说明与历史回测展示，<b>不构成任何投资建议</b>。
                            日线量价模型 RankIC 稳定在 0.03~0.08 已属不错，单日 AUC 通常 0.52~0.58，请勿期待 70~80% 胜率；实盘盈亏自负。
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/** 表格行悬停信息：把次要字段从列里挪到 tooltip，减少横向拥挤 */
const pickTip = (p) => [
    `行业：${p.industry || '-'}`,
    `预测区间：${p.predQ10 != null && p.predQ90 != null
        ? `${formatPct(p.predQ10, 1)} ~ ${formatPct(p.predQ90, 1)}` : '-'}`,
    '点击查看 K 线',
].join(' · ');

const modelTip = (m) => [
    `特征版本：${m.featureVersion || '-'}`,
    `训练区间：${m.trainStart && m.trainEnd ? `${m.trainStart} ~ ${m.trainEnd}` : '-'}`,
    '点击查看 RankIC 走势',
].join(' · ');

export default function ForecastDashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    // 优先用详情页返回时带回的状态；否则用会话内保存的筛选（兼容浏览器后退 / 重新进入）
    const saved = location.state?.restore ?? readSavedFilters();
    const [horizon, setHorizon] = useState(() => saved?.horizon ?? 10);
    const [date, setDate] = useState(() => saved?.date ?? '');
    const [status, setStatus] = useState(() => saved?.status ?? '');
    const [modelId, setModelId] = useState(() => saved?.modelId ?? '');
    // 说明抽屉属于临时查看动作，不做跨页持久化，避免切回来被浮层挡住
    const [docType, setDocType] = useState(null);

    useEffect(() => {
        writePageState(FILTER_KEY, { horizon, date, status, modelId });
    }, [horizon, date, status, modelId]);

    const day = date || 'latest';
    const overview = useApi(() => forecastApi.overview(horizon), [horizon], { cacheKey: `fc:overview:${horizon}` });
    const models = useApi(() => forecastApi.models(horizon), [horizon], { cacheKey: `fc:models:${horizon}` });
    const dates = useApi(() => forecastApi.dates(60), [], { cacheKey: 'fc:dates:60' });
    const weights = useApi(() => forecastApi.weights(horizon), [horizon], { cacheKey: `fc:weights:${horizon}` });
    const picks = useApi(
        () => forecastApi.picks({ date: date || undefined, horizon, limit: 30 }),
        [date, horizon],
        { cacheKey: `fc:picks:${horizon}:${day}` },
    );
    const evalHistory = useApi(
        () => (modelId ? forecastApi.eval({ modelId, horizon, limit: 120 }) : Promise.resolve([])),
        [modelId, horizon],
        { cacheKey: modelId ? `fc:eval:${modelId}:${horizon}` : undefined },
    );

    // 模型列表加载后默认选中融合模型（无则第一个在役模型）
    useEffect(() => {
        if (modelId || !models.data?.length) return;
        const ensemble = models.data.find((m) => m.modelId.startsWith('ensemble'));
        const champion = models.data.find((m) => m.status === 'champion');
        setModelId((ensemble ?? champion ?? models.data[0]).modelId);
    }, [models.data, modelId]);

    const ov = overview.data;
    const modelRows = useMemo(
        () => (models.data ?? []).filter((m) => !status || m.status === status),
        [models.data, status],
    );

    const failed = [overview, models, dates, weights, picks].filter((r) => r.error);
    const errorText = failed.map((r) => r.error).join('；');

    const rankIcOpt = useMemo(() => rankIcOption(evalHistory.data), [evalHistory.data]);
    const weightOpt = useMemo(() => weightOption(weights.data), [weights.data]);

    const reloadAll = () => [overview, models, dates, weights, picks, evalHistory].forEach((r) => r.reload());
    const closeDoc = useCallback(() => setDocType(null), []);
    const toggleDoc = (type) => setDocType((current) => (current === type ? null : type));

    return (
        <div className="fc-page">
            <div className="toolbar">
                <label className="field">
                    持有期
                    <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                        <option value={10}>10 个交易日（半月）</option>
                        <option value={20}>20 个交易日（月度）</option>
                    </select>
                </label>
                <label className="field">
                    信号日
                    <select value={date} onChange={(e) => setDate(e.target.value)} disabled={dates.loading}>
                        <option value="">最新信号日</option>
                        {(dates.data ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
                <button type="button" className="ghost" onClick={reloadAll}>刷新</button>
                <button type="button" className="ghost" onClick={() => toggleDoc('glossary')}>指标说明</button>
                <button type="button" className="ghost" onClick={() => toggleDoc('model')}>模型原理</button>
            </div>

            <ErrorBanner
                message={errorText}
                onRetry={failed.length ? () => failed.forEach((r) => r.reload()) : undefined}
            />

            <div className="fc-stats">
                <MiniStat label="最新信号日" value={ov?.latestAsof ?? '-'} hint="用这天收盘数据做的预测"/>
                <MiniStat label="模型总数" value={ov ? ov.modelTotal : '-'}
                          hint={ov ? `在役 ${ov.championCount} 个` : ''}/>
                <MiniStat label="影子运行" value={ov ? ov.candidateCount : '-'} hint="只观察不参与选股"/>
                <MiniStat label="已退役" value={ov ? ov.retiredCount : '-'} hint="持续失效被淘汰"/>
                <MiniStat label="最新入选" value={ov ? `${ov.selectedCount} 只` : '-'} hint="融合模型今日选股"/>
                <MiniStat
                    label="RankIC(60批)"
                    value={ov?.avgRankIc60 != null ? formatNum(ov.avgRankIc60, 4) : '-'}
                    tone={ov?.avgRankIc60 != null ? pctClass(ov.avgRankIc60) : 'plain'}
                    hint="越正越好，0.03~0.08 属有效"
                />
            </div>

            <div className="fc-main-row">
                <Panel title={<ParamLabel tip={PANEL_TIPS.picks}>Top N 选股（{day === 'latest' ? '最新信号日' : day}）</ParamLabel>}>
                    <div className="table-wrap fc-table-tall">
                        <table className="data-table">
                            <thead>
                            <tr>
                                <th>排名</th>
                                <th>代码</th>
                                <th>名称</th>
                                <th>行业</th>
                                <th>上涨概率</th>
                                <th>预测收益</th>
                                <th>真实收益</th>
                                <th>超额收益</th>
                            </tr>
                            </thead>
                            <tbody>
                            {(picks.data ?? []).map((p) => (
                                <tr
                                    key={`${p.code}-${p.market}`}
                                    title={pickTip(p)}
                                    onClick={() => navigate(`/stocks/${p.code}`, {
                                        state: {
                                            from: location.pathname + location.search,
                                            back: { horizon, date, status, modelId },
                                        },
                                    })}
                                >
                                    <td>{p.rankAll ?? '-'}</td>
                                    <td>{p.code}</td>
                                    <td>{p.name || '-'}</td>
                                    <td>{p.industry || '-'}</td>
                                    <td>{p.probUp != null ? `${(Number(p.probUp) * 100).toFixed(1)}%` : '-'}</td>
                                    <td className={pctClass(p.predRet)}>{formatPct(p.predRet)}</td>
                                    <td className={pctClass(p.realRet)}>
                                        {p.outcomeFilled ? formatPct(p.realRet) : '未到期'}
                                    </td>
                                    <td className={pctClass(p.excessRet)}>
                                        {p.outcomeFilled ? formatPct(p.excessRet) : '-'}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                        {picks.loading ? <div className="empty">加载中…</div> : null}
                        {!picks.loading && !(picks.data?.length)
                            ? <div className="empty">暂无选股数据，请先运行 stock-predict 流水线（python -m predict.cli daily）</div>
                            : null}
                    </div>
                </Panel>

                <div className="fc-chart-col">
                    <Panel
                        title={<ParamLabel tip={PANEL_TIPS.rankIc}>RankIC 走势</ParamLabel>}
                        extra={(
                            <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                                {(models.data ?? []).map((m) => (
                                    <option key={m.modelId} value={m.modelId}>{m.modelId}</option>
                                ))}
                            </select>
                        )}
                    >
                        <EChart
                            height={180}
                            option={rankIcOpt}
                            loading={evalHistory.loading}
                            empty={!evalHistory.loading && !(evalHistory.data?.length)}
                            emptyText="该模型暂无到期评估批次"
                        />
                    </Panel>

                    <Panel title={<ParamLabel tip={PANEL_TIPS.weight}>融合权重</ParamLabel>}>
                        <EChart
                            height={180}
                            option={weightOpt}
                            loading={weights.loading}
                            empty={!weights.loading && !(weights.data?.length)}
                            emptyText="暂无融合权重"
                        />
                    </Panel>
                </div>
            </div>

            <Panel
                title={<ParamLabel tip={PANEL_TIPS.board}>模型榜单（{modelRows.length}）</ParamLabel>}
                extra={<Tabs items={STATUS_TABS} value={status} onChange={setStatus}/>}
            >
                <div className="table-wrap fc-table-short">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>模型</th>
                            <th>类型</th>
                            <th>状态</th>
                            <th>RankIC(60)</th>
                            <th>ICIR(60)</th>
                            <th>TopN 超额</th>
                            <th>评估批数</th>
                        </tr>
                        </thead>
                        <tbody>
                        {modelRows.map((m) => (
                            <tr key={m.modelId}
                                title={modelTip(m)}
                                className={m.modelId === modelId ? 'fc-row-active' : ''}
                                onClick={() => setModelId(m.modelId)}>
                                <td>{m.modelId}</td>
                                <td>{m.modelType}</td>
                                <td>{STATUS_LABEL[m.status] ?? m.status}</td>
                                <td className={pctClass(m.avgRankIc60)}>
                                    {m.avgRankIc60 != null ? formatNum(m.avgRankIc60, 4) : '-'}
                                </td>
                                <td className={pctClass(m.icir60)}>
                                    {m.icir60 != null ? formatNum(m.icir60, 3) : '-'}
                                </td>
                                <td className={pctClass(m.avgTopnExcess)}>{formatPct(m.avgTopnExcess)}</td>
                                <td>{m.evalCount ?? 0}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {models.loading ? <div className="empty">加载中…</div> : null}
                    {!models.loading && !modelRows.length ? <div className="empty">该状态下暂无模型</div> : null}
                </div>
            </Panel>

            {docType ? <DocDrawer type={docType} onClose={closeDoc}/> : null}
        </div>
    );
}
