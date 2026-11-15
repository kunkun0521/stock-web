/** 页面 1：概率总览（榜单）。周期切换、多维排序筛选、q05–q95 区间条、点击进入个股。 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { getOverview, getPredictions } from './api.js';
import F from './FormulaTerm.jsx';
import { PAsync, PBadge, PBar, PBtn, PCard, PField, PKpi, PPager, PSelect } from './ProbParts.jsx';
import { GRADE_HINT, GRADE_TONE, RISK_LABEL, RISK_TONE, dateStr, intervalBar,
    pct, signedPct, tone, num } from './format.js';

const SCROLL_KEY = 'prob:overview:scroll';
const HORIZONS = [1, 3, 5, 10];
const SORTS = [
    { value: 'p_up', label: '上涨概率' },
    { value: 'exp_ret', label: '期望收益' },
    { value: 'exp_ret/vol_h', label: '收益/波动' },
    { value: 'prob_drop_5', label: '大跌概率' },
    { value: 'risk_level', label: '风险等级' },
    { value: 'reliability_grade', label: '可靠性等级' },
    { value: 'vol_h', label: '预测波动' },
    { value: 'cvar95', label: 'CVaR95' },
];

function IntervalCell({ row }) {
    const bar = intervalBar(row);
    if (!bar) return <span className="prob-muted">—</span>;
    return (
        <div className="prob-interval" title={`q05 ${signedPct(row.q05)} · q50 ${signedPct(row.q50)} · q95 ${signedPct(row.q95)}`}>
            <div className="prob-interval-zero"/>
            <div className="prob-interval-band" style={{ left: `${bar.q05}%`, width: `${Math.max(0, bar.q95 - bar.q05)}%` }}/>
            <div className="prob-interval-mid" style={{ left: `${bar.q50}%` }}/>
        </div>
    );
}

export default function OverviewPanel({ params, patch, refreshKey }) {
    const navigate = useNavigate();
    const horizon = Number(params.get('h') || 1);
    const sort = params.get('sort') || 'p_up';
    const order = params.get('order') || 'desc';
    const [riskLevel, setRiskLevel] = useState(params.get('risk') || '');
    const [minGrade, setMinGrade] = useState(params.get('grade') || '');
    const [keyword, setKeyword] = useState(params.get('q') || '');
    const [excludeHighVol, setExcludeHighVol] = useState(params.get('hv') === '1');
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);

    const overview = useApi(getOverview, [refreshKey]);
    const list = useApi(() => getPredictions({
        horizon, sort, order, riskLevel, minGrade, keyword,
        excludeHighVol: excludeHighVol ? 'true' : 'false', page, size,
    }), [horizon, sort, order, riskLevel, minGrade, keyword, excludeHighVol, page, size, refreshKey]);

    // 从个股/K线返回时恢复滚动位置
    useEffect(() => {
        const y = Number(window.sessionStorage.getItem(SCROLL_KEY) || 0);
        if (y > 0) window.scrollTo({ top: y, behavior: 'instant' });
        return () => window.sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    }, []);

    const openStock = (row) => {
        window.sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
        patch({ tab: 'stock', code: row.code, market: row.market, h: horizon });
    };

    const items = list.data?.items || [];
    const ov = overview.data || {};
    const riskBuckets = ov.riskBuckets || [];
    const gradeBuckets = ov.gradeBuckets || [];
    const noData = list.data && list.data.total === 0;

    const kpis = useMemo(() => [
        { label: '预测基准日', value: dateStr(ov.asof), hint: `模型版本 ${ov.modelVersion || '—'}` },
        { label: '股票池 / 预测条数', value: `${Number(ov.nUniverse || 0).toLocaleString()} / ${Number(ov.nPredictions || 0).toLocaleString()}`, hint: '每只股票 4 个周期' },
        { label: '平均上涨概率', value: pct(ov.avgPUp), hint: '全部周期混合' },
        { label: '偏多预测占比', value: pct((ov.nBullish || 0) / Math.max(ov.nPredictions || 1, 1)), hint: 'p_up > 0.5 的比例' },
        { label: 'GARCH 收敛率', value: pct(ov.garchRate), hint: '其余回退 EWMA' },
        { label: '已结算样本', value: Number(ov.nSettled || 0).toLocaleString(), hint: `样本外 ${Number(ov.nOos || 0).toLocaleString()} 条` },
    ], [ov]);

    return (
        <>
            <PCard title="样本外状态" extra={<span className="prob-muted">每个交易日收盘后自动更新</span>}>
                <div className="ga-kpi-grid">
                    {kpis.map((k) => <PKpi key={k.label} {...k}/>)}
                </div>
                {!ov.ready ? (
                    <div className="prob-onboard">
                        <b>还没有预测数据。</b> 到「任务与参数」页点一次「一键运行日常任务」，
                        系统会自动完成数据准备 → 滚动评估 → 训练 → 全市场预测 → 结算 → 复盘 → 回测。
                        <PBtn variant="primary" onClick={() => patch({ tab: 'runs' })}>去运行</PBtn>
                    </div>
                ) : null}
            </PCard>

            <PCard title="概率榜单" extra={
                <span className="prob-muted">红涨绿跌 · 所有数值均为统计估计</span>
            }>
                <PBar>
                    <PField label="预测周期">
                        <PSelect value={horizon} onChange={(v) => { patch({ h: v }); setPage(1); }}
                                 options={HORIZONS.map((h) => ({ value: h, label: `${h} 个交易日` }))}/>
                    </PField>
                    <PField label="排序">
                        <PSelect value={sort} onChange={(v) => { patch({ sort: v }); setPage(1); }}
                                 options={SORTS}/>
                    </PField>
                    <PField label="方向">
                        <PSelect value={order} onChange={(v) => patch({ order: v })}
                                 options={[{ value: 'desc', label: '从大到小' }, { value: 'asc', label: '从小到大' }]}/>
                    </PField>
                    <PField label="风险等级">
                        <PSelect value={riskLevel} onChange={(v) => { setRiskLevel(v); setPage(1); }}
                                 options={[{ value: '', label: '全部' }, ...[1, 2, 3, 4].map((n) => ({ value: n, label: RISK_LABEL[n] }))]}/>
                    </PField>
                    <PField label="最低可靠性">
                        <PSelect value={minGrade} onChange={(v) => { setMinGrade(v); setPage(1); }}
                                 options={[{ value: '', label: '不限' }, ...'ABCD'.split('').map((g) => ({ value: g, label: `${g} 及以上` }))]}/>
                    </PField>
                    <PField label="代码搜索">
                        <input className="ga-input" value={keyword} placeholder="如 600519"
                               onChange={(e) => { setKeyword(e.target.value); setPage(1); }}/>
                    </PField>
                    <label className="prob-check">
                        <input type="checkbox" checked={excludeHighVol}
                               onChange={(e) => { setExcludeHighVol(e.target.checked); setPage(1); }}/>
                        剔除高波动
                    </label>
                    <PBtn onClick={() => list.reload()}>刷新</PBtn>
                </PBar>

                <div className="prob-legend">
                    <span>风险分布：</span>
                    {riskBuckets.length ? riskBuckets.map((b) => (
                        <PBadge key={b.risk_level} tone={RISK_TONE[b.risk_level] || 'plain'}>
                            {RISK_LABEL[b.risk_level] || b.risk_level} {b.n}
                        </PBadge>
                    )) : <span className="prob-muted">—</span>}
                    <span className="prob-legend-sep">可靠性分布：</span>
                    {gradeBuckets.length ? gradeBuckets.map((b) => (
                        <PBadge key={b.reliability_grade} tone={GRADE_TONE[b.reliability_grade] || 'plain'}
                                title={GRADE_HINT[b.reliability_grade]}>
                            {b.reliability_grade} {b.n}
                        </PBadge>
                    )) : <span className="prob-muted">—</span>}
                </div>

                <PAsync state={list} isEmpty={() => noData}
                        emptyText="当前筛选条件下没有预测记录；可以放宽风险等级 / 可靠性，或先运行日常任务">
                    {() => (
                        <>
                            <div className="ga-table-wrap">
                                <table className="ga-table prob-table">
                                    <thead>
                                        <tr>
                                            <th>代码</th>
                                            <th><F id="calibration">上涨概率</F></th>
                                            <th><F id="m5_expectation">期望收益</F></th>
                                            <th><F id="pinball">分位区间 q05–q95</F></th>
                                            <th><F id="garch_h">预测波动</F></th>
                                            <th><F id="fhs">大跌概率</F></th>
                                            <th><F id="var_cvar">VaR95</F></th>
                                            <th><F id="risk_level">风险</F></th>
                                            <th><F id="grade">可靠性</F></th>
                                            <th>模型 / 标记</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((r) => (
                                            <tr key={`${r.code}-${r.market}-${r.horizon}`}>
                                                <td><button type="button" className="prob-code" onClick={() => openStock(r)}>{r.code}</button>
                                                    <span className="prob-market">{r.market}</span></td>
                                                <td>
                                                    <div className={`prob-pup ga-tone-${Number(r.p_up) > 0.5 ? 'up' : 'down'}`}>
                                                        <b>{pct(r.p_up)}</b>
                                                        <div className="prob-pup-bar"><i style={{ width: `${Number(r.p_up) * 100}%` }}/></div>
                                                    </div>
                                                </td>
                                                <td className={`ga-tone-${tone(r.exp_ret)}`}>{signedPct(r.exp_ret)}</td>
                                                <td><IntervalCell row={r}/></td>
                                                <td>{pct(r.vol_h)}</td>
                                                <td>{pct(r.prob_drop_5)}</td>
                                                <td>{pct(r.var95)}</td>
                                                <td><PBadge tone={RISK_TONE[r.risk_level] || 'plain'}>{RISK_LABEL[r.risk_level] || '—'}</PBadge></td>
                                                <td><PBadge tone={GRADE_TONE[r.reliability_grade] || 'plain'}
                                                            title={GRADE_HINT[r.reliability_grade]}>{r.reliability_grade || '—'}</PBadge></td>
                                                <td className="prob-small">
                                                    <span>{r.vol_model === 'GARCH' ? 'GARCH-t' : 'EWMA'}</span>
                                                    {r.flags ? <span className="prob-flags" title={r.flags}>{String(r.flags).split(',').length} 项标记</span> : null}
                                                </td>
                                                <td>
                                                    <PBtn sm onClick={() => openStock(r)}>详情</PBtn>
                                                    <PBtn sm variant="ghost" onClick={() => {
                                                        window.sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
                                                        navigate(`/stocks/${r.code}`, {
                                                            state: { from: window.location.pathname + window.location.search,
                                                                     fromLabel: '概率总览' },
                                                        });
                                                    }}>K 线</PBtn>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <PPager page={list.data?.page} size={size} total={list.data?.total}
                                    pages={list.data?.pages} onPage={setPage}
                                    onSize={(s) => { setSize(s); setPage(1); }}/>
                        </>
                    )}
                </PAsync>
            </PCard>
        </>
    );
}
