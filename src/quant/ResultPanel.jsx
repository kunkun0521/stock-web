import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import {
    getMetrics, getEquity, getTrades, getEvents, getBacktest,
} from './api.js';
import { QCard, QKpi, QBadge, QBtn, QAsync, QEmpty, QPager, QTabs, QSelect, QLoading } from './QuantParts.jsx';
import { pct, signedPct, num, int, duration, STATUS_CN, STATUS_TONE, tone } from './format.js';
import GaChart from '../ga/GaChart.jsx';

const SPLITS = [
    { value: 'ALL', label: '全样本' },
    { value: 'IS', label: '样本内 70%' },
    { value: 'OOS', label: '样本外 30%' },
];

const METRIC_ROWS = [
    { key: 'totalReturn', label: '总收益率', fmt: signedPct },
    { key: 'annualReturn', label: '年化收益率', fmt: signedPct },
    { key: 'benchmarkReturn', label: '基准收益（等权）', fmt: signedPct },
    { key: 'excessReturn', label: '超额收益', fmt: signedPct },
    { key: 'maxDrawdown', label: '最大回撤', fmt: signedPct },
    { key: 'volatility', label: '年化波动率', fmt: pct },
    { key: 'sharpe', label: '夏普比率', fmt: (v) => num(v, 2) },
    { key: 'sortino', label: '索提诺比率', fmt: (v) => num(v, 2) },
    { key: 'calmar', label: '卡玛比率', fmt: (v) => num(v, 2) },
    { key: 'winRate', label: '胜率', fmt: pct },
    { key: 'profitFactor', label: '盈亏比', fmt: (v) => num(v, 2) },
    { key: 'expectancy', label: '单笔期望', fmt: signedPct },
    { key: 'tradeCount', label: '交易笔数', fmt: int },
    { key: 'avgHoldDays', label: '平均持仓天数', fmt: (v) => num(v, 1) },
    { key: 'turnover', label: '年化换手率', fmt: (v) => `${num(v, 1)}x` },
    { key: 'avgPosition', label: '平均持仓数', fmt: (v) => num(v, 1) },
    { key: 'maxSingleLoss', label: '最大单笔亏损', fmt: signedPct },
    { key: 'maxConsecutiveLoss', label: '最大连续亏损', fmt: (v) => `${int(v)} 笔` },
];

/** 净值 vs 基准 + 回撤。 */
function equityOption(rows) {
    const dates = rows.map((r) => r.date);
    return {
        animation: false,
        tooltip: { trigger: 'axis' },
        legend: { top: 0, left: 4, textStyle: { color: '#6b7280', fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
        grid: { left: 56, right: 56, top: 30, bottom: 28 },
        xAxis: { type: 'category', data: dates, axisLabel: { color: '#6b7280', fontSize: 10 } },
        yAxis: [
            {
                type: 'value', name: '净值', scale: true,
                axisLabel: { color: '#6b7280', fontSize: 10 },
                splitLine: { lineStyle: { color: '#f0f1f3' } },
            },
            {
                type: 'value', name: '回撤', max: 0,
                axisLabel: { color: '#6b7280', fontSize: 10, formatter: (v) => `${(v * 100).toFixed(0)}%` },
                splitLine: { show: false },
            },
        ],
        series: [
            {
                name: '策略净值', type: 'line', showSymbol: false, data: rows.map((r) => r.nav),
                lineStyle: { width: 2, color: '#2f6fed' }, itemStyle: { color: '#2f6fed' },
            },
            {
                name: '等权基准', type: 'line', showSymbol: false, data: rows.map((r) => r.benchmarkNav),
                lineStyle: { width: 1.4, color: '#9aa6b8' }, itemStyle: { color: '#9aa6b8' },
            },
            {
                name: '回撤', type: 'line', yAxisIndex: 1, showSymbol: false,
                data: rows.map((r) => r.drawdown),
                lineStyle: { width: 0 }, itemStyle: { color: 'rgba(23,146,78,0.18)' },
                areaStyle: { color: 'rgba(23,146,78,0.18)' },
            },
        ],
    };
}

function monthlyCell(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return { bg: '#f7f8fa', text: '-' };
    const a = Math.min(0.75, 0.12 + Math.abs(n) * 4);
    const bg = n >= 0 ? `rgba(216,57,43,${a.toFixed(2)})` : `rgba(23,146,78,${a.toFixed(2)})`;
    return { bg, text: `${(n * 100).toFixed(1)}%` };
}

export default function ResultPanel({ taskId, onOpenTask }) {
    const [split, setSplit] = useState('ALL');
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const [horizon, setHorizon] = useState(5);

    const task = useApi(() => (taskId ? getBacktest(taskId) : Promise.resolve(null)), [taskId]);
    const metrics = useApi(
        () => (taskId ? getMetrics(taskId, split) : Promise.resolve({})),
        [taskId, split],
    );
    const metricsAll = useApi(() => (taskId ? getMetrics(taskId, 'ALL') : Promise.resolve({})), [taskId]);
    const metricsIs = useApi(() => (taskId ? getMetrics(taskId, 'IS') : Promise.resolve({})), [taskId]);
    const metricsOos = useApi(() => (taskId ? getMetrics(taskId, 'OOS') : Promise.resolve({})), [taskId]);
    const equity = useApi(() => (taskId ? getEquity(taskId) : Promise.resolve([])), [taskId]);
    const trades = useApi(
        () => (taskId ? getTrades(taskId, { page, size }) : Promise.resolve({ items: [] })),
        [taskId, page, size],
    );
    const events = useApi(() => (taskId ? getEvents(taskId) : Promise.resolve([])), [taskId]);

    useEffect(() => { setPage(1); }, [taskId]);

    const data = task.data || {};
    const eq = Array.isArray(equity.data) ? equity.data : [];
    const m = metrics.data || {};
    const tradePage = trades.data || {};
    const eventRows = Array.isArray(events.data) ? events.data : [];

    const horizons = useMemo(() => (
        [...new Set(eventRows.map((r) => r.horizon))].sort((a, b) => a - b)
    ), [eventRows]);

    useEffect(() => {
        if (horizons.length && !horizons.includes(horizon)) setHorizon(horizons[0]);
    }, [horizons, horizon]);

    const horizonRows = eventRows.filter((r) => r.horizon === horizon);
    const allRow = horizonRows.find((r) => r.splitKey === 'ALL');
    const splitRows = horizonRows.filter((r) => r.splitKey !== 'ALL');
    const all = metricsAll.data || {};
    const monthly = all.monthlyReturns && typeof all.monthlyReturns === 'object'
        ? Object.entries(all.monthlyReturns).sort(([a], [b]) => a.localeCompare(b)) : [];

    if (!taskId) {
        return <QEmpty text="先在上方选择或运行一次回测"/>;
    }

    const running = data.status === 'RUNNING' || data.status === 'PENDING';

    return (
        <div className="quant-stack">
            <QCard title={`回测 #${taskId} · ${data.strategyKey || ''}`}
                   extra={<div className="ga-row">
                       <QBadge tone={STATUS_TONE[data.status] || 'plain'}>
                           {STATUS_CN[data.status] || data.status || '加载中'}
                       </QBadge>
                       <span className="ga-muted">{data.startDate} ~ {data.endDate}</span>
                       {data.dataSnapshot ? <span className="ga-muted">快照 {data.dataSnapshot}</span> : null}
                   </div>}>
                {running ? (
                    <div className="quant-progress">
                        <div className="quant-progress-track">
                            <i style={{ width: `${Math.max(2, data.progress || 0)}%` }}/>
                        </div>
                        <span>{data.progress || 0}% · {data.stage || '运行中'}</span>
                    </div>
                ) : null}
                {data.errorMsg ? <div className="ga-note ga-note--err">{data.errorMsg}</div> : null}
                {data.status === 'SUCCESS' ? (
                    <div className="quant-metrics-head">
                        <QTabs items={SPLITS} value={split} onChange={setSplit}/>
                        <span className="ga-muted">
                            运行用时 {duration(data.durationMs)} · 交易 {int(data.summary?.tradeCount)} 笔
                            {data.summary?.openPositions ? ` · 期末持仓 ${int(data.summary.openPositions)} 只` : ''}
                        </span>
                    </div>
                ) : null}
            </QCard>

            {data.status === 'SUCCESS' ? (
                <>
                    <div className="ga-kpi-grid quant-kpi-grid">
                        <QKpi label="总收益率" value={signedPct(m.totalReturn)} tone={tone(m.totalReturn) === 'ga-up' ? 'up' : 'down'}
                              hint={`基准 ${signedPct(m.benchmarkReturn)}`}/>
                        <QKpi label="年化收益" value={signedPct(m.annualReturn)} tone={tone(m.annualReturn) === 'ga-up' ? 'up' : 'down'}
                              hint={`${int(m.tradingDays)} 个交易日`}/>
                        <QKpi label="最大回撤" value={signedPct(m.maxDrawdown)} tone="down"
                              hint={`${m.maxDrawdownStart || '-'} → ${m.maxDrawdownEnd || '-'}`}/>
                        <QKpi label="夏普 / 卡玛" value={`${num(m.sharpe, 2)} / ${num(m.calmar, 2)}`} tone="plain"
                              hint={`波动 ${pct(m.volatility)}`}/>
                        <QKpi label="胜率" value={pct(m.winRate)} tone="plain"
                              hint={`盈亏比 ${num(m.profitFactor, 2)}`}/>
                        <QKpi label="超额收益" value={signedPct(m.excessReturn)} tone={tone(m.excessReturn) === 'ga-up' ? 'up' : 'down'}
                              hint="相对股票池等权指数"/>
                        <QKpi label="交易笔数" value={int(m.tradeCount)} tone="plain"
                              hint={m.isSignificant ? '样本量充足' : '样本 < 30，统计不显著'}/>
                        <QKpi label="平均持仓" value={`${num(m.avgPosition, 1)} 只`} tone="plain"
                              hint={`平均持有 ${num(m.avgHoldDays, 1)} 日`}/>
                    </div>

                    {!m.isSignificant ? (
                        <div className="ga-note ga-note--warn">
                            交易笔数少于 30，统计上不显著；结论请结合事件研究样本量与样本外表现一起看，
                            不要仅凭总收益判断策略优劣。
                        </div>
                    ) : null}

                    <div className="quant-grid-2">
                        <QCard title="净值 vs 基准">
                            <QAsync state={equity} isEmpty={(d) => !Array.isArray(d) || !d.length}
                                    emptyText="暂无净值数据">
                                {() => <GaChart option={equityOption(eq)} height={300}/>}
                            </QAsync>
                        </QCard>

                        <QCard title="关键指标（分段）">
                            <div className="ga-table-wrap">
                                <table className="ga-table quant-metric-table">
                                    <thead><tr>
                                        <th>指标</th><th>全样本</th><th>样本内</th><th>样本外</th>
                                    </tr></thead>
                                    <tbody>
                                    {METRIC_ROWS.map((r) => (
                                        <tr key={r.key}>
                                            <td>{r.label}</td>
                                            <td className="ga-num">{r.fmt(all[r.key])}</td>
                                            <td className="ga-num ga-muted">{r.fmt((metricsIs.data || {})[r.key])}</td>
                                            <td className="ga-num ga-muted">{r.fmt((metricsOos.data || {})[r.key])}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </QCard>
                    </div>

                    <QCard title="月度收益" extra={<span className="ga-muted">红涨绿跌，颜色越深幅度越大</span>}>
                        {monthly.length ? (
                            <div className="quant-month-grid">
                                {monthly.map(([month, v]) => {
                                    const c = monthlyCell(v);
                                    return (
                                        <div key={month} className="quant-month-cell"
                                             style={{ background: c.bg }}
                                             title={`${month} 收益 ${c.text}`}>
                                            <span>{month}</span>
                                            <b>{c.text}</b>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <QEmpty text="暂无月度数据"/>}
                    </QCard>

                    <QCard title="事件研究"
                           extra={<div className="ga-row">
                               <QSelect value={String(horizon)}
                                        onChange={(v) => setHorizon(Number(v))}
                                        options={horizons.map((h) => ({ value: String(h), label: `持有 ${h} 日` }))}/>
                               <span className="ga-muted">同一信号 T+1 开盘买入，扣双边成本</span>
                           </div>}>
                        {allRow ? (
                            <div className="quant-event-head">
                                <QKpi label="信号数" value={int(allRow.cnt)} tone="plain" hint="已剔除无法成交与重叠样本"/>
                                <QKpi label="平均收益" value={signedPct(allRow.meanRet)} tone={tone(allRow.meanRet) === 'ga-up' ? 'up' : 'down'}
                                      hint={`中位数 ${signedPct(allRow.medianRet)}`}/>
                                <QKpi label="胜率" value={pct(allRow.winRate)} tone="plain"
                                      hint={`平均盈利 ${signedPct(allRow.avgWin)} / 亏损 ${signedPct(allRow.avgLoss)}`}/>
                                <QKpi label="超额（vs 基准）" value={signedPct(allRow.excessMean)} tone={tone(allRow.excessMean) === 'ga-up' ? 'up' : 'down'}
                                      hint={`t 值 ${num(allRow.tStat, 2)}`}/>
                            </div>
                        ) : null}
                        {splitRows.length ? (
                            <div className="ga-table-wrap">
                                <table className="ga-table">
                                    <thead><tr>
                                        <th>拆分维度</th><th>样本</th><th>平均收益</th><th>中位</th>
                                        <th>胜率</th><th>超额</th><th>t 值</th><th>MFE</th><th>MAE</th>
                                    </tr></thead>
                                    <tbody>
                                    {splitRows.map((r) => (
                                        <tr key={r.splitKey}>
                                            <td className="ga-mono">{r.splitKey}</td>
                                            <td className="ga-num">{int(r.cnt)}</td>
                                            <td className={`ga-num ${tone(r.meanRet)}`}>{signedPct(r.meanRet)}</td>
                                            <td className="ga-num">{signedPct(r.medianRet)}</td>
                                            <td className="ga-num">{pct(r.winRate)}</td>
                                            <td className={`ga-num ${tone(r.excessMean)}`}>{signedPct(r.excessMean)}</td>
                                            <td className="ga-num">{num(r.tStat, 2)}</td>
                                            <td className="ga-num ga-up">{signedPct(r.mfeMean)}</td>
                                            <td className="ga-num ga-down">{signedPct(r.maeMean)}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <QEmpty text="暂无事件研究拆分数据"/>}
                    </QCard>

                    <QCard title="交易明细" flush extra={<span className="ga-muted">共 {int(tradePage.total)} 笔</span>}>
                        <QAsync state={trades} isEmpty={(d) => !d?.items?.length} emptyText="没有成交记录">
                            {() => (
                                <>
                                    <div className="ga-table-wrap">
                                        <table className="ga-table quant-trade-table">
                                            <thead><tr>
                                                <th>#</th><th>代码</th><th>买入日</th><th>买入价</th>
                                                <th>卖出日</th><th>卖出价</th><th>股数</th><th>盈亏</th>
                                                <th>收益率</th><th>持有</th><th>出场原因</th><th>MAE</th><th>MFE</th>
                                            </tr></thead>
                                            <tbody>
                                            {(tradePage.items || []).map((t) => (
                                                <tr key={t.seq}>
                                                    <td className="ga-mono">{t.seq}</td>
                                                    <td className="ga-mono">{t.code}</td>
                                                    <td>{t.entryDate}</td>
                                                    <td className="ga-num">{num(t.entryPrice, 2)}</td>
                                                    <td>{t.exitDate || '-'}</td>
                                                    <td className="ga-num">{num(t.exitPrice, 2)}</td>
                                                    <td className="ga-num">{num(t.shares, 0)}</td>
                                                    <td className={`ga-num ${tone(t.pnl)}`}>{signedPct(t.pnlPct)}</td>
                                                    <td className={`ga-num ${tone(t.pnlPct)}`}>{signedPct(t.pnlPct)}</td>
                                                    <td className="ga-num">{t.holdDays} 日</td>
                                                    <td>{t.exitReason || '-'}</td>
                                                    <td className="ga-num ga-down">{signedPct(t.mae)}</td>
                                                    <td className="ga-num ga-up">{signedPct(t.mfe)}</td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <QPager page={tradePage.page || page} size={tradePage.size || size}
                                            total={tradePage.total || 0} pages={tradePage.pages || 1}
                                            onPage={setPage} onSize={(s) => { setSize(s); setPage(1); }}/>
                                </>
                            )}
                        </QAsync>
                    </QCard>
                </>
            ) : null}

            {data.status === 'FAILED' || data.status === 'CANCELED' ? (
                <QCard title="任务未完成">
                    <div className={data.status === 'FAILED' ? 'ga-note ga-note--err' : 'ga-note'}>
                        {data.errorMsg || (data.status === 'CANCELED' ? '任务已取消' : '任务失败，请调整参数后重试')}
                    </div>
                </QCard>
            ) : null}
            {task.loading && !data.status ? <QLoading text="读取任务状态…"/> : null}
        </div>
    );
}
