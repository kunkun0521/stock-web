import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { forecastApi } from '../api/forecast.js';
import { useApi } from '../hooks/useApi.js';
import EChart from '../components/EChart.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import StatCard from '../components/StatCard.jsx';
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

/** 页面顶部的新手术语说明（可折叠） */
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

export default function ForecastDashboard() {
    const navigate = useNavigate();
    const [horizon, setHorizon] = useState(10);
    const [date, setDate] = useState('');
    const [status, setStatus] = useState('');
    const [modelId, setModelId] = useState('');
    const [showHelp, setShowHelp] = useState(false);

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

    return (
        <>
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
                <button type="button" className="ghost" onClick={() => setShowHelp((v) => !v)}>
                    {showHelp ? '收起说明' : '指标说明'}
                </button>
            </div>

            {showHelp ? (
                <Panel title="新手必读：这些指标是什么意思？">
                    <div className="table-wrap">
                        <table className="data-table">
                            <tbody>
                            {GLOSSARY.map(([term, desc]) => (
                                <tr key={term}>
                                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{term}</td>
                                    <td className="muted">{desc}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            ) : null}

            <ErrorBanner
                message={errorText}
                onRetry={failed.length ? () => failed.forEach((r) => r.reload()) : undefined}
            />

            <div className="stat-grid">
                <StatCard label="最新信号日" value={ov?.latestAsof ?? '-'} hint="用这天收盘数据做的预测"/>
                <StatCard label="模型总数" value={ov ? ov.modelTotal : '-'} hint={ov ? `在役 ${ov.championCount} 个` : ''}/>
                <StatCard label="影子运行" value={ov ? ov.candidateCount : '-'} hint="只观察不参与选股"/>
                <StatCard label="已退役" value={ov ? ov.retiredCount : '-'} hint="持续失效被淘汰"/>
                <StatCard label="最新入选" value={ov ? `${ov.selectedCount} 只` : '-'} hint="融合模型今日选股"/>
                <StatCard
                    label="近 60 批平均 RankIC"
                    value={ov?.avgRankIc60 != null ? formatNum(ov.avgRankIc60, 4) : '-'}
                    tone={ov?.avgRankIc60 != null ? pctClass(ov.avgRankIc60) : 'plain'}
                    hint="越正越好，0.03~0.08 属有效"
                />
            </div>

            <Panel
                title={`Top N 选股（${day === 'latest' ? '最新信号日' : day}）`}
            >
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
                    融合模型选出的名单：信号日收盘后预测，下一交易日开盘买入，持有 {horizon} 个交易日后系统自动核对真实收益。
                    仅供研究参考，不构成投资建议。
                </p>
                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>排名</th>
                            <th>代码</th>
                            <th>名称</th>
                            <th>行业</th>
                            <th>上涨概率</th>
                            <th>预测收益</th>
                            <th>预测区间</th>
                            <th>真实收益</th>
                            <th>超额收益</th>
                        </tr>
                        </thead>
                        <tbody>
                        {(picks.data ?? []).map((p) => (
                            <tr key={`${p.code}-${p.market}`} onClick={() => navigate(`/stocks/${p.code}`)}>
                                <td>{p.rankAll ?? '-'}</td>
                                <td>{p.code}</td>
                                <td>{p.name || '-'}</td>
                                <td>{p.industry || '-'}</td>
                                <td>{p.probUp != null ? `${(Number(p.probUp) * 100).toFixed(1)}%` : '-'}</td>
                                <td className={pctClass(p.predRet)}>{formatPct(p.predRet)}</td>
                                <td>
                                    {p.predQ10 != null && p.predQ90 != null
                                        ? `${formatPct(p.predQ10, 1)} ~ ${formatPct(p.predQ90, 1)}`
                                        : '-'}
                                </td>
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

            <div className="grid-2">
            <Panel
                title="模型 RankIC 走势"
                extra={(
                    <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                        {(models.data ?? []).map((m) => (
                            <option key={m.modelId} value={m.modelId}>{m.modelId}</option>
                        ))}
                    </select>
                )}
            >
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
                    每天预测准不准的历史记录：柱子 = 单日 RankIC（红正绿负），蓝线 = 近 20 天平均水平。蓝线稳定在 0 轴上方才算有效。
                </p>
                <EChart
                    height={300}
                    option={rankIcOpt}
                    loading={evalHistory.loading}
                    empty={!evalHistory.loading && !(evalHistory.data?.length)}
                    emptyText="该模型暂无到期评估批次（运行 python -m predict.cli shadow 可补历史）"
                />
            </Panel>

            <Panel title="融合权重（最新）">
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
                    各模型在"集体决策"中的话语权：近期表现越稳定的模型权重越高，持续失效的会被自动降到 0。
                </p>
                <EChart
                    height={300}
                    option={weightOpt}
                    loading={weights.loading}
                    empty={!weights.loading && !(weights.data?.length)}
                    emptyText="暂无融合权重（评估批次满 5 批后自动生成）"
                />
            </Panel>
            </div>

            <Panel
                title="模型榜单"
                extra={<Tabs items={STATUS_TABS} value={status} onChange={setStatus}/>}
            >
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
                    所有模型的成绩单，点击任意一行可在上方查看它的 RankIC 走势。TopN 超额 = 入选名单平均跑赢市场的幅度。
                </p>
                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>模型</th>
                            <th>类型</th>
                            <th>状态</th>
                            <th>特征版本</th>
                            <th>训练区间</th>
                            <th>近60批 RankIC</th>
                            <th>ICIR(60)</th>
                            <th>TopN 超额</th>
                            <th>评估批数</th>
                        </tr>
                        </thead>
                        <tbody>
                        {modelRows.map((m) => (
                            <tr key={m.modelId} onClick={() => setModelId(m.modelId)}>
                                <td>{m.modelId}</td>
                                <td>{m.modelType}</td>
                                <td>{STATUS_LABEL[m.status] ?? m.status}</td>
                                <td>{m.featureVersion}</td>
                                <td>{m.trainStart && m.trainEnd ? `${m.trainStart} ~ ${m.trainEnd}` : '-'}</td>
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
        </>
    );
}
