import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getOverview, getOverviewTrend, getOverviewCalendar } from './api.js';
import {
    ACCENT, UP, DOWN, MUTED, GA_BASE,
    HORIZON_OPTIONS, BOARD_OPTIONS, STRICT_OPTIONS, REPLAY_OPTIONS,
    asArray, asObject, num, fmtRate, fmtNum, fmtInt, fmtText,
} from './gaUtils.js';
import GaChart from './GaChart.jsx';
import {
    Card, KpiGrid, KpiCard, FilterBar, Field, Select, Input, Btn, AsyncPanel, Empty,
} from './GaParts.jsx';

const PALETTE = [ACCENT, UP, DOWN, '#e8a33d', '#9b59b6', '#3f8cff'];
const DEFAULT_FILTERS = {
    horizon: '', from: '', to: '', board: '', strict: '', includeReplay: 'false', window: '20',
};
const AXIS_LINE = { lineStyle: { color: '#e6e8eb' } };
const SPLIT_LINE = { lineStyle: { color: '#f0f1f3' } };

/** 滚动命中率折线：每个周期一条线 + 0.5 基准虚线。 */
function trendOption(trend) {
    const t = asObject(trend);
    const dates = asArray(t.dates);
    const series = asArray(t.series);
    return {
        animation: false,
        tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '-' : fmtRate(v)) },
        legend: { top: 0, left: 4, type: 'scroll', textStyle: { color: MUTED, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
        grid: { left: 48, right: 16, top: 28, bottom: 26 },
        xAxis: { type: 'category', data: dates, axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: {
            type: 'value', min: 0, max: 1,
            axisLabel: { color: MUTED, formatter: (v) => `${(v * 100).toFixed(0)}%` },
            splitLine: SPLIT_LINE,
        },
        series: series.map((s, i) => ({
            name: `${fmtText(s.horizon)} 日`,
            type: 'line', smooth: true, showSymbol: false,
            data: asArray(s.values),
            lineStyle: { width: 1.6, color: PALETTE[i % PALETTE.length] },
            itemStyle: { color: PALETTE[i % PALETTE.length] },
            ...(i === 0 ? {
                markLine: {
                    silent: true, symbol: 'none',
                    lineStyle: { color: MUTED, type: 'dashed', width: 1 },
                    label: { formatter: '50% 基准', color: MUTED, fontSize: 10 },
                    data: [{ yAxis: 0.5 }],
                },
            } : {}),
        })),
    };
}

/**
 * 按月命中率柱：契约没有独立的月度接口，这里把 trend 的 dates/series
 * 按 yyyy-MM 聚合（所有周期、所有交易日的命中率取平均）。
 */
function monthlyAgg(trend) {
    const t = asObject(trend);
    const dates = asArray(t.dates);
    const series = asArray(t.series);
    const byMonth = new Map();
    dates.forEach((d, idx) => {
        const key = String(d ?? '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(key)) return;
        const vals = series.map((s) => num(asArray(s.values)[idx])).filter((v) => v !== null);
        if (!vals.length) return;
        const agg = byMonth.get(key) || { sum: 0, n: 0 };
        vals.forEach((v) => { agg.sum += v; agg.n += 1; });
        byMonth.set(key, agg);
    });
    const months = [...byMonth.keys()].sort();
    return { months, values: months.map((m) => byMonth.get(m).sum / byMonth.get(m).n) };
}

function monthlyOption(trend) {
    const { months, values } = monthlyAgg(trend);
    return {
        animation: false,
        tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '-' : fmtRate(v)) },
        grid: { left: 48, right: 16, top: 16, bottom: 28 },
        xAxis: { type: 'category', data: months, axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: {
            type: 'value', min: 0, max: 1,
            axisLabel: { color: MUTED, formatter: (v) => `${(v * 100).toFixed(0)}%` },
            splitLine: SPLIT_LINE,
        },
        series: [{
            type: 'bar', barMaxWidth: 34,
            data: values.map((v) => ({ value: v, itemStyle: { color: v >= 0.5 ? ACCENT : '#9aa6b8', borderRadius: [3, 3, 0, 0] } })),
            markLine: {
                silent: true, symbol: 'none',
                lineStyle: { color: MUTED, type: 'dashed', width: 1 },
                label: { formatter: '50%', color: MUTED, fontSize: 10 },
                data: [{ yAxis: 0.5 }],
            },
        }],
    };
}

/**
 * 总览：统一筛选条 + 8 张 KPI + 滚动命中率折线 + 按月命中率柱 + 日历热力图。
 * 日历点击有样本的某天会跳到预测复盘并带上该日期作为 from/to。
 */
export default function OverviewPage() {
    const navigate = useNavigate();
    const [f, setF] = usePersistedState('ga:overview:filters', DEFAULT_FILTERS);
    const [month, setMonth] = usePersistedState('ga:overview:month', new Date().toISOString().slice(0, 7));
    const set = (key) => (v) => setF((prev) => ({ ...prev, [key]: v }));

    const main = useApi(
        () => Promise.all([
            getOverview({
                horizon: f.horizon, from: f.from, to: f.to, board: f.board,
                strict: f.strict, includeReplay: f.includeReplay,
            }),
            getOverviewTrend({ horizon: f.horizon, window: f.window, from: f.from, to: f.to }),
        ]),
        [f.horizon, f.from, f.to, f.board, f.strict, f.includeReplay, f.window],
    );
    const cal = useApi(() => getOverviewCalendar({ horizon: f.horizon, month }), [f.horizon, month]);

    const [ov, trend] = Array.isArray(main.data) ? main.data : [];
    const kpi = asObject(ov?.kpi);
    const trendDates = asArray(asObject(trend).dates);
    const monthly = monthlyAgg(trend);

    const kpiCards = [
        { label: '整体命中率', value: fmtRate(kpi.hitRate), tone: 'accent', hint: '全部已验证样本' },
        { label: '看涨命中率', value: fmtRate(kpi.upHitRate), tone: 'up', hint: '预测上涨的样本' },
        { label: '看跌命中率', value: fmtRate(kpi.downHitRate), tone: 'down', hint: '预测下跌的样本' },
        { label: '覆盖率', value: fmtRate(kpi.coverage), tone: 'plain', hint: '有预测信号的占比' },
        { label: '平均 IC', value: fmtNum(kpi.avgIc, 4), tone: 'plain', hint: '预测与真实收益相关性' },
        { label: '已验证样本', value: fmtInt(kpi.nVerified), tone: 'plain', hint: '完成结果核对的条数' },
        { label: '冠军版本', value: fmtText(kpi.championVersion), tone: 'plain', hint: `生效 ${fmtText(kpi.effectiveFrom)}` },
        { label: '淘汰数量', value: fmtInt(kpi.eliminatedCount), tone: 'muted', hint: '当前被剔除的标的' },
    ];

    // 日历网格：周一为第一列。
    const [y, m] = String(month).split('-').map(Number);
    const validMonth = Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12;
    const cells = [];
    if (validMonth) {
        const startDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
        const days = new Date(y, m, 0).getDate();
        for (let i = 0; i < startDow; i += 1) cells.push(null);
        for (let d = 1; d <= days; d += 1) cells.push(d);
    }
    const byDate = new Map();
    asArray(cal.data).forEach((row) => byDate.set(String(row?.date), row));
    const weekHead = ['一', '二', '三', '四', '五', '六', '日'];

    const jumpToDay = (date) => navigate(`${GA_BASE}/predictions?from=${date}&to=${date}`);

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="周期"><Select value={f.horizon} onChange={set('horizon')} options={HORIZON_OPTIONS}/></Field>
                <Field label="起始日期"><Input type="date" value={f.from} onChange={set('from')}/></Field>
                <Field label="结束日期"><Input type="date" value={f.to} onChange={set('to')}/></Field>
                <Field label="板块"><Select value={f.board} onChange={set('board')} options={BOARD_OPTIONS}/></Field>
                <Field label="口径"><Select value={f.strict} onChange={set('strict')} options={STRICT_OPTIONS}/></Field>
                <Field label="回放"><Select value={f.includeReplay} onChange={set('includeReplay')} options={REPLAY_OPTIONS}/></Field>
                <Field label="滚动窗口" hint="交易日"><Input type="number" min="1" value={f.window} onChange={set('window')}/></Field>
                <Btn variant="primary" onClick={() => { main.reload(); cal.reload(); }}>刷新</Btn>
            </FilterBar>

            <AsyncPanel state={main} isEmpty={() => false}>
                {() => (
                    <>
                        <KpiGrid>
                            {kpiCards.map((c) => <KpiCard key={c.label} {...c}/>)}
                        </KpiGrid>
                        <div className="ga-grid-2" style={{ marginTop: 12 }}>
                            <Card title="滚动命中率（多周期）">
                                {trendDates.length
                                    ? <GaChart option={trendOption(trend)} height={280}/>
                                    : <Empty text="暂无趋势数据"/>}
                            </Card>
                            <Card title="按月命中率">
                                {monthly.months.length
                                    ? <GaChart option={monthlyOption(trend)} height={280}/>
                                    : <Empty text="暂无月度数据"/>}
                            </Card>
                        </div>
                    </>
                )}
            </AsyncPanel>

            <Card title="每日命中率日历" extra={
                <Field label="月份"><Input type="month" value={month} onChange={setMonth}/></Field>
            }>
                <AsyncPanel state={cal} isEmpty={(d) => !validMonth || asArray(d).length === 0}
                            emptyText="该月暂无样本数据">
                    {() => (
                        <>
                            <div className="ga-cal-grid">
                                {weekHead.map((w) => <div key={w} className="ga-cal-head">{w}</div>)}
                                {cells.map((d, i) => {
                                    if (d === null) return <div key={`e${i}`} className="ga-cal-cell ga-cal-cell--empty"/>;
                                    const date = `${String(month)}-${String(d).padStart(2, '0')}`;
                                    const row = byDate.get(date);
                                    const n = num(row?.n);
                                    const rate = num(row?.hitRate);
                                    const hasSample = !!row && (n === null || n > 0) && rate !== null;
                                    let cls = 'ga-cal-cell--none';
                                    let label = '-';
                                    if (hasSample) {
                                        if (rate > 0.55) cls = 'ga-cal-cell--good';
                                        else if (rate < 0.45) cls = 'ga-cal-cell--bad';
                                        else cls = 'ga-cal-cell--mid';
                                        label = fmtRate(rate);
                                    }
                                    return (
                                        <div key={date}
                                             className={`ga-cal-cell ${cls}${hasSample ? ' ga-cal-cell--hit' : ''}`}
                                             title={hasSample ? `${date} 命中率 ${fmtRate(rate)}，样本 ${n ?? '-'} 条，点击复盘` : `${date} 无样本`}
                                             onClick={hasSample ? () => jumpToDay(date) : undefined}>
                                            <span>{d}</span><small>{label}</small>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="ga-cal-legend">
                                <span>命中率 &gt; 55% 绿 · &lt; 45% 红 · 中间黄 · 无样本灰</span>
                                <span>点击有样本的日期跳转到预测复盘</span>
                            </div>
                        </>
                    )}
                </AsyncPanel>
            </Card>
        </div>
    );
}
