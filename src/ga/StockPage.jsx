import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getStock } from './api.js';
import {
    UP, DOWN, MUTED, HORIZON_OPTIONS, asArray, asObject, num,
    fmtRate, fmtNum, fmtInt, fmtText, dirLabel, dirTone, isUpDir,
} from './gaUtils.js';
import GaChart from './GaChart.jsx';
import {
    Card, FilterBar, Field, Select, Input, Btn, AsyncPanel, Empty, Badge, MiniBar, Timeline,
} from './GaParts.jsx';

const DEFAULT_FILTERS = { horizon: '', from: '', to: '' };
const AXIS_LINE = { lineStyle: { color: '#e6e8eb' } };
const SPLIT_LINE = { lineStyle: { color: '#f0f1f3' } };

/**
 * 蜡烛图 + 成交量 + 预测方向三角标记。
 * 看涨用向上红三角、看跌用向下绿三角；已验证(isCorrect 非空)叠加 ✓/✗，未验证画空心三角。
 */
function klineOption(bars, marks, horizon) {
    const rows = asArray(bars);
    const dates = rows.map((b) => b.tradeDate);
    const candle = rows.map((b) => [b.open, b.close, b.low, b.high]);
    const volumes = rows.map((b) => ({
        value: b.volume,
        itemStyle: { color: Number(b.close) >= Number(b.open) ? `${UP}aa` : `${DOWN}aa` },
    }));
    const dateIndex = new Map(rows.map((b, i) => [String(b.tradeDate), i]));
    const points = [];
    asArray(marks).forEach((m) => {
        if (horizon && String(m?.horizon) !== String(horizon)) return;
        const idx = dateIndex.get(String(m?.tradeDate));
        if (idx === undefined) return;
        const bar = rows[idx];
        const up = isUpDir(m?.predDirection);
        const y = up ? Number(bar.low) * 0.985 : Number(bar.high) * 1.015;
        const color = up ? UP : DOWN;
        const verified = m?.isCorrect === true || m?.isCorrect === false;
        points.push({
            value: [idx, y],
            symbol: 'triangle',
            symbolSize: 13,
            symbolRotate: up ? 0 : 180,
            itemStyle: { color: verified ? color : 'transparent', borderColor: color, borderWidth: 1.6 },
            label: verified
                ? { show: true, formatter: m.isCorrect ? '✓' : '✗', position: 'top', color, fontSize: 11, fontWeight: 'bold' }
                : { show: false },
            mark: m,
        });
    });

    return {
        animation: false,
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { top: 0, left: 4, textStyle: { color: MUTED, fontSize: 11 }, data: ['K线', '预测标记', '成交量'] },
        grid: [
            { left: 56, right: 16, top: 26, height: '60%' },
            { left: 56, right: 16, top: '76%', height: '16%' },
        ],
        xAxis: [
            { type: 'category', data: dates, gridIndex: 0, axisLabel: { show: false }, axisLine: AXIS_LINE },
            { type: 'category', data: dates, gridIndex: 1, axisLabel: { color: MUTED, fontSize: 10, rotate: 30 }, axisLine: AXIS_LINE },
        ],
        yAxis: [
            { scale: true, gridIndex: 0, axisLabel: { color: MUTED }, splitLine: SPLIT_LINE },
            { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
        ],
        dataZoom: [{ type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 }],
        series: [
            {
                name: 'K线', type: 'candlestick', data: candle,
                itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
            },
            { name: '预测标记', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, data: points },
            { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes },
        ],
    };
}

/**
 * 个股详情：蜡烛图 + 成交量 + 预测三角标记；右侧最新 5 周期卡片（含 explain 贡献条形）；
 * 分周期命中率表；淘汰/状态变更时间线。
 */
export default function StockPage() {
    const { market, code } = useParams();
    const [f, setF] = usePersistedState('ga:stock:filters', DEFAULT_FILTERS);
    const set = (key) => (v) => setF((prev) => ({ ...prev, [key]: v }));

    const main = useApi(
        () => getStock({ market, code, horizon: f.horizon, from: f.from, to: f.to }),
        [market, code, f.horizon, f.from, f.to],
    );

    const d = asObject(main.data);
    const bars = asArray(d.bars);
    const marks = asArray(d.marks);
    const latest = asArray(d.latest).slice(0, 5);
    const hitRates = asArray(d.hitRate);
    const timelineItems = asArray(d.timeline).map((t) => ({
        date: `${fmtText(t.eventDate)} · ${fmtText(t.eventType)}`,
        text: `${fmtText(t.reasonCode)}${t.reasonDetail ? ` — ${fmtText(t.reasonDetail)}` : ''}`,
    }));

    return (
        <div className="ga-page">
            <FilterBar>
                <div className="ga-field">
                    <span className="ga-field-label">个股</span>
                    <Badge tone="accent">{fmtText(market)} / {fmtText(code)}</Badge>
                </div>
                <Field label="周期"><Select value={f.horizon} onChange={set('horizon')} options={HORIZON_OPTIONS}/></Field>
                <Field label="起始日期"><Input type="date" value={f.from} onChange={set('from')}/></Field>
                <Field label="结束日期"><Input type="date" value={f.to} onChange={set('to')}/></Field>
                <Btn variant="primary" onClick={main.reload}>刷新</Btn>
            </FilterBar>

            <AsyncPanel state={main} isEmpty={() => false}>
                {() => (
                    <>
                        <div className="ga-grid-2">
                            <Card title={`${fmtText(code)} 日线行情（${fmtText(market)}）`}>
                                {bars.length
                                    ? <GaChart option={klineOption(bars, marks, f.horizon)} height={420}/>
                                    : <Empty text="暂无行情数据"/>}
                            </Card>
                            <Card title="最新 5 周期预测（含因子贡献）">
                                {latest.length ? (
                                    <div className="ga-scroll-y">
                                        {latest.map((it, i) => {
                                            const l = asObject(it);
                                            const ex = asArray(l.explain);
                                            const maxAbs = Math.max(1e-9, ...ex.map((e) => Math.abs(num(e?.c) || 0)));
                                            return (
                                                <div key={i} className="ga-card" style={{ marginBottom: 8 }}>
                                                    <div className="ga-card-body">
                                                        <div className="ga-row">
                                                            <Badge tone={dirTone(l.predDirection)}>
                                                                {fmtText(l.horizon)} 日 · {dirLabel(l.predDirection)}
                                                            </Badge>
                                                            <span className="ga-num">P↑ {fmtRate(l.probUp)}</span>
                                                            <span className="ga-muted">置信 {fmtRate(l.confidence)}</span>
                                                        </div>
                                                        <div className="ga-section-title" style={{ marginTop: 8 }}>因子贡献（c）</div>
                                                        {ex.length ? ex.map((e, j) => (
                                                            <MiniBar key={j}
                                                                     label={`${fmtText(e?.f)}${e?.z !== undefined ? ` (z=${fmtNum(e.z, 2)})` : ''}`}
                                                                     value={e?.c} max={maxAbs}/>
                                                        )) : <Empty text="暂无解释"/>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : <Empty text="暂无最新预测"/>}
                            </Card>
                        </div>

                        <div className="ga-grid-2" style={{ marginTop: 12 }}>
                            <Card title="分周期命中率">
                                {hitRates.length ? (
                                    <div className="ga-table-wrap">
                                        <table className="ga-table">
                                            <thead><tr><th>周期</th><th>样本数</th><th>命中率</th></tr></thead>
                                            <tbody>
                                            {hitRates.map((r, i) => (
                                                <tr key={i}>
                                                    <td>{fmtText(r.horizon)} 日</td>
                                                    <td className="ga-num">{fmtInt(r.n)}</td>
                                                    <td className={`ga-num ${Number(r.hitRate) >= 0.5 ? 'ga-up' : 'ga-down'}`}>
                                                        {fmtRate(r.hitRate)}
                                                    </td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : <Empty text="暂无命中率数据"/>}
                            </Card>
                            <Card title="淘汰 / 状态变更时间线">
                                <Timeline items={timelineItems} emptyText="暂无状态变更记录"/>
                            </Card>
                        </div>
                    </>
                )}
            </AsyncPanel>
        </div>
    );
}
