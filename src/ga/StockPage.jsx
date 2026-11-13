import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getStock } from './api.js';
import {
    UP, DOWN, HORIZON_OPTIONS, asArray, asObject, num,
    fmtRate, fmtNum, fmtInt, fmtText, dirLabel, dirTone,
} from './gaUtils.js';
import { buildKlineOption, markSummary, isVerified } from './kline.js';
import GaChart from './GaChart.jsx';
import {
    Card, FilterBar, Field, Select, Input, Btn, AsyncPanel, Empty, Badge, MiniBar, Timeline,
} from './GaParts.jsx';

const DEFAULT_VIEW = {
    horizon: '', from: '', to: '',
    showMa: true, showMacd: true, showMarks: true, visibleBars: 80, markMode: 'day',
};

const MARK_MODE_OPTIONS = [
    { value: 'day', label: '每日共识' },
    { value: 'each', label: '逐周期展开' },
];

const RANGE_OPTIONS = [
    { days: 30, label: '近1月' },
    { days: 90, label: '近3月' },
    { days: 180, label: '近6月' },
    { days: 365, label: '近1年' },
];

const VIEW_OPTIONS = [
    { value: '40', label: '显示最近 40 根' },
    { value: '80', label: '显示最近 80 根' },
    { value: '120', label: '显示最近 120 根' },
    { value: '0', label: '全部显示' },
];

const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 个股详情：三宫格 K 线（K 线 + 均线 + 成交量 + MACD + 预测标记）独占整行，
 * 下方是最新 5 周期预测、分周期命中率与淘汰时间线。
 */
export default function StockPage() {
    const { market, code } = useParams();
    const [f, setF] = usePersistedState('ga:stock:filters', DEFAULT_VIEW);
    const [viewKey, setViewKey] = useState(0);
    const [selected, setSelected] = useState(null);
    const v = { ...DEFAULT_VIEW, ...asObject(f) };
    const set = (key) => (value) => setF((prev) => ({ ...DEFAULT_VIEW, ...asObject(prev), [key]: value }));

    const main = useApi(
        () => getStock({ market, code, horizon: v.horizon, from: v.from, to: v.to }),
        [market, code, v.horizon, v.from, v.to],
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

    // option 只在数据/配置真正变化时重建，避免父组件重渲染把用户的缩放位置重置掉
    const option = useMemo(() => buildKlineOption({
        bars: d.bars,
        marks: d.marks,
        horizon: v.horizon,
        height: 500,
        showMa: v.showMa,
        showMacd: v.showMacd,
        showMarks: v.showMarks,
        visibleBars: Number(v.visibleBars) || 0,
        markMode: v.markMode,
    }), [main.data, v.horizon, v.showMa, v.showMacd, v.showMarks, v.visibleBars, v.markMode, viewKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const championMarks = marks.filter((m) => {
        const o = asObject(m);
        return (!o.modelRole || o.modelRole === 'CHAMPION') && (!v.horizon || String(o.horizon) === String(v.horizon));
    });
    const verifiedMarks = championMarks.filter(isVerified);
    const markDays = new Set(championMarks.map((m) => String(asObject(m).tradeDate ?? ''))).size;

    const applyRange = (days) => {
        const anchor = bars.length ? String(asObject(bars[bars.length - 1]).tradeDate) : null;
        const base = anchor ? new Date(`${anchor}T00:00:00`) : new Date();
        if (days) base.setDate(base.getDate() - days);
        setF((prev) => ({
            ...DEFAULT_VIEW, ...asObject(prev),
            from: days ? dateStr(base) : '',
            to: '',
        }));
    };

    const onChartClick = (p) => {
        if (p?.seriesType === 'scatter' && p?.data?.mark) setSelected(asObject(p.data.mark));
    };

    const sm = selected ? markSummary(selected) : null;

    return (
        <div className="ga-page">
            <FilterBar>
                <div className="ga-field">
                    <span className="ga-field-label">个股</span>
                    <Badge tone="accent">{fmtText(market)} / {fmtText(code)}</Badge>
                </div>
                <Field label="周期"><Select value={v.horizon} onChange={set('horizon')} options={HORIZON_OPTIONS}/></Field>
                <Field label="起始日期"><Input type="date" value={v.from} onChange={set('from')}/></Field>
                <Field label="结束日期"><Input type="date" value={v.to} onChange={set('to')}/></Field>
                <div className="ga-field">
                    <span className="ga-field-label">快捷区间</span>
                    <div className="ga-btn-group">
                        {RANGE_OPTIONS.map((r) => (
                            <Btn key={r.days} onClick={() => applyRange(r.days)}>{r.label}</Btn>
                        ))}
                        <Btn onClick={() => applyRange(0)}>全部</Btn>
                    </div>
                </div>
                <Btn variant="primary" onClick={main.reload}>刷新</Btn>
            </FilterBar>

            <AsyncPanel state={main} isEmpty={() => false}>
                {() => (
                    <>
                        <div className="ga-kline-toolbar">
                            <div className="ga-toggle-group">
                                <label className="ga-toggle">
                                    <input type="checkbox" checked={v.showMa} onChange={(e) => set('showMa')(e.target.checked)}/>
                                    均线 MA
                                </label>
                                <label className="ga-toggle">
                                    <input type="checkbox" checked={v.showMacd} onChange={(e) => set('showMacd')(e.target.checked)}/>
                                    MACD
                                </label>
                                <label className="ga-toggle">
                                    <input type="checkbox" checked={v.showMarks} onChange={(e) => set('showMarks')(e.target.checked)}/>
                                    预测标记
                                </label>
                            </div>
                            <Field label="标记">
                                <Select value={v.markMode} onChange={set('markMode')} options={MARK_MODE_OPTIONS}/>
                            </Field>
                            <Field label="视窗">
                                <Select value={String(v.visibleBars)} onChange={set('visibleBars')} options={VIEW_OPTIONS}/>
                            </Field>
                            <Btn onClick={() => setViewKey((k) => k + 1)}>重置视图</Btn>
                            <div className="ga-kline-stat">
                                <span>{fmtInt(bars.length)} 根 K 线</span>
                                <span>·</span>
                                <span>{fmtInt(markDays)} 日有预测</span>
                                <span>·</span>
                                <span>{fmtInt(championMarks.length)} 条预测</span>
                                <span>·</span>
                                <span>{fmtInt(verifiedMarks.length)} 条已验证</span>
                            </div>
                        </div>

                        <Card title={`${fmtText(code)} 日线行情与 GA 预测（${fmtText(market)}）`}>
                            <GaChart
                                option={option}
                                height={500}
                                onClick={onChartClick}
                                empty={!bars.length}
                                emptyText="该区间暂无行情数据"
                                loading={main.loading}
                            />
                            <div className="ga-kline-legend">
                                <span><i className="ga-swatch" style={{ background: UP }}/> 红涨</span>
                                <span><i className="ga-swatch" style={{ background: DOWN }}/> 绿跌</span>
                                <span>▲ 看涨预测（K 线下方）</span>
                                <span>▼ 看跌预测（K 线上方）</span>
                                <span>实心 = 已验证（✓命中 / ✗未命中），空心 = 待验证</span>
                                <span>「每日共识」把当日多周期投票压成一个三角；切「逐周期展开」可看每个周期</span>
                                <span>滚轮缩放 · 拖动底部滑块平移 · 点击三角查看详情 · 悬停看当日全部周期</span>
                            </div>
                        </Card>

                        {sm ? (
                            <div className="ga-mark-detail">
                                <Badge tone="accent">{sm.date} · {sm.horizon}</Badge>
                                <Badge tone={dirTone(selected.predDirection)}>{sm.direction}</Badge>
                                <span>P↑ <b>{sm.probUp}</b></span>
                                <span>置信 <b>{sm.confidence}</b></span>
                                <span style={{ color: sm.verdictColor }}><b>{sm.verdict}</b></span>
                                <span>实际收益 <b>{sm.actualReturn}</b></span>
                                {sm.consensus ? <span className="ga-mark-consensus">{sm.consensus}</span> : null}
                                <Btn onClick={() => setSelected(null)}>关闭</Btn>
                            </div>
                        ) : null}

                        <div className="ga-grid-2" style={{ marginTop: 12 }}>
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
                                                        )) : <Empty text="暂无解释（该预测未记录因子贡献）"/>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : <Empty text="暂无最新预测"/>}
                            </Card>

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
                        </div>

                        <div className="ga-grid-2" style={{ marginTop: 12 }}>
                            <Card title="淘汰 / 状态变更时间线">
                                <Timeline items={timelineItems} emptyText="暂无状态变更记录"/>
                            </Card>
                            <Card title="口径说明">
                                <div className="ga-kline-notes">
                                    <p>行情取 <code>stock_daily_all</code> 中 <code>adjustflag=2</code>（前复权）日线，默认最近 180 天；
                                        MA/MACD 由前端按收盘价推导，不占用后端接口。</p>
                                    <p>预测标记来自 <code>ga_prediction</code> 的主榜（CHAMPION）记录；
                                        「已验证」指已由 VerifyJob 用真实行情回填，命中率仅统计已验证样本。</p>
                                    <p>回放（is_replay=1）与实盘（is_replay=0）预测共用同一张表，
                                        若同一天出现方向相反的标记，是不同周期的独立判断，可按「周期」筛选查看。</p>
                                </div>
                            </Card>
                        </div>
                    </>
                )}
            </AsyncPanel>
        </div>
    );
}
