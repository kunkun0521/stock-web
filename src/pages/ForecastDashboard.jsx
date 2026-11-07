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

export default function ForecastDashboard() {
    const navigate = useNavigate();
    const [horizon, setHorizon] = useState(10);
    const [date, setDate] = useState('');
    const [status, setStatus] = useState('');
    const [modelId, setModelId] = useState('');

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
            </div>

            <ErrorBanner
                message={errorText}
                onRetry={failed.length ? () => failed.forEach((r) => r.reload()) : undefined}
            />

            <div className="stat-grid">
                <StatCard label="最新信号日" value={ov?.latestAsof ?? '-'}/>
                <StatCard label="模型总数" value={ov ? ov.modelTotal : '-'} hint={ov ? `在役 ${ov.championCount}` : ''}/>
                <StatCard label="影子运行" value={ov ? ov.candidateCount : '-'}/>
                <StatCard label="已退役" value={ov ? ov.retiredCount : '-'}/>
                <StatCard label="最新入选" value={ov ? `${ov.selectedCount} 只` : '-'} hint="融合模型 Top N"/>
                <StatCard
                    label="近 60 批平均 RankIC"
                    value={ov?.avgRankIc60 != null ? formatNum(ov.avgRankIc60, 4) : '-'}
                    tone={ov?.avgRankIc60 != null ? pctClass(ov.avgRankIc60) : 'plain'}
                    hint="0.03~0.08 属正常水平"
                />
            </div>

            <Panel
                title={`Top N 选股（${day === 'latest' ? '最新信号日' : day}）`}
            >
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
                    <EChart
                        height={300}
                        option={rankIcOpt}
                        loading={evalHistory.loading}
                        empty={!evalHistory.loading && !(evalHistory.data?.length)}
                        emptyText="该模型暂无到期评估批次"
                    />
                </Panel>

                <Panel title="融合权重（最新）">
                    <EChart
                        height={300}
                        option={weightOpt}
                        loading={weights.loading}
                        empty={!weights.loading && !(weights.data?.length)}
                        emptyText="暂无融合权重（评估批次不足时各模型等权）"
                    />
                </Panel>
            </div>

            <Panel
                title="模型榜单"
                extra={<Tabs items={STATUS_TABS} value={status} onChange={setStatus}/>}
            >
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
