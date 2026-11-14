import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getPicks } from './api.js';
import {
    GA_BASE, HORIZONS, asArray, asObject, num, fmtRate, fmtInt, fmtText,
    dirTone, dirLabel, isUpDir, isDownDir, marketOf,
} from './gaUtils.js';
import Term from './GlossaryTerm.jsx';
import {
    Card, KpiGrid, KpiCard, FilterBar, Field, Input, Select, Btn,
    AsyncPanel, Badge, Empty, GaTabs, RefreshBtn,
} from './GaParts.jsx';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 本地 yyyy-MM-dd：不用 toISOString，避免时区把日期减一天。 */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 今天若不是工作日，退回最近的周五，避免一进页面就是空白。 */
function lastWorkday() {
    const d = new Date();
    const dow = d.getDay();
    if (dow === 6) d.setDate(d.getDate() - 1);
    else if (dow === 0) d.setDate(d.getDate() - 2);
    return ymd(d);
}

/** 解析所选日期的星期信息；周末用于给出「通常无数据」的提示。 */
function dayInfo(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const dow = d.getDay();
    return { dow, label: WEEK[dow], weekend: dow === 0 || dow === 6 };
}

const DEFAULT_FILTERS = {
    date: lastWorkday(), topN: '20', minConsensus: '4',
    hideLimit: false, tab: 'up', sort: 'rank',
};

const SORT_CHOICES = [
    { value: 'rank', label: '共振 ↓' },
    { value: 'conf', label: '置信 ↓' },
    { value: 'hit', label: '命中率 ↓' },
    { value: 'code', label: '代码 ↑' },
];

/** 周期列：默认 5 个周期，同时并入接口实际返回的周期，配置调整时不会漏显示。 */
function horizonsOf(dirs) {
    const extra = Object.keys(dirs).map(Number).filter((n) => Number.isFinite(n));
    return [...new Set([...HORIZONS, ...extra])].sort((a, b) => a - b);
}

/** 共振刻度：5 个周期各一格，颜色表示该周期方向。 */
function ConsensusMeter({ directions, value }) {
    const dirs = asObject(directions);
    const cons = num(value);
    const tone = cons === null ? 'ga-muted' : cons > 0 ? 'ga-up' : cons < 0 ? 'ga-down' : 'ga-muted';
    return (
        <div className="ga-cons">
            <span className={`ga-cons-num ${tone}`}>{cons === null ? '-' : `${cons > 0 ? '+' : ''}${cons}`}</span>
            <span className="ga-cons-segs">
                {horizonsOf(dirs).map((h) => {
                    const d = dirs[String(h)];
                    const t = isUpDir(d) ? 'up' : isDownDir(d) ? 'down' : 'flat';
                    return <i key={h} className={`ga-cons-seg ga-cons-seg--${t}`}/>;
                })}
            </span>
        </div>
    );
}

/** 平均置信：数值 + 细条。avgConf 为 0~1 比例。 */
function ConfMeter({ value }) {
    const v = num(value);
    const w = v === null ? 0 : Math.min(100, Math.max(0, v * 100));
    return (
        <div className="ga-conf">
            <span className="ga-num">{fmtRate(v)}</span>
            <span className="ga-conf-track"><i style={{ width: `${w}%` }}/></span>
        </div>
    );
}

/** 每周期信号：方向箭头 + 该周期 P↑，一眼看出多空一致性。 */
function SignalStrip({ directions, probUps }) {
    const dirs = asObject(directions);
    const probs = asObject(probUps);
    return (
        <div className="ga-signals">
            {horizonsOf(dirs).map((h) => {
                const key = String(h);
                const d = dirs[key];
                const p = num(probs[key]);
                const t = dirTone(d);
                const arrow = isUpDir(d) ? '↑' : isDownDir(d) ? '↓' : '·';
                return (
                    <span key={key} className={`ga-signal ga-signal--${t}`}
                          title={`H${h}（${h} 日）${dirLabel(d)}${p === null ? '' : ` · P↑ ${fmtRate(p)}`}`}>
                        <i className="ga-signal-h">H{h}</i>
                        <i className="ga-signal-d">{arrow}</i>
                        <i className="ga-signal-p">{p === null ? '-' : fmtRate(p, 0)}</i>
                    </span>
                );
            })}
        </div>
    );
}

/** 单榜表格；行可点击且支持键盘 Enter / Space 进入个股详情。 */
function PickTable({ rows, emptyText, openStock }) {
    if (!rows.length) return <Empty text={emptyText}/>;
    return (
        <div className="ga-table-wrap">
            <table className="ga-table ga-picks-table">
                <thead>
                <tr>
                    <th className="ga-picks-rank">#</th>
                    <th>代码 / 名称</th>
                    <th><Term id="minConsensus">共振</Term></th>
                    <th><Term id="confidence">平均置信</Term></th>
                    <th>各周期信号 <span className="ga-muted">H1→H15</span></th>
                    <th><Term id="hitRate60">命中率60</Term></th>
                    <th><Term id="limitFlag">风险</Term></th>
                </tr>
                </thead>
                <tbody>
                {rows.map((r, i) => {
                    const hr = num(r.hitRate60);
                    const hrTone = hr === null ? '' : hr >= 0.55 ? 'ga-up' : hr <= 0.45 ? 'ga-down' : '';
                    const open = () => openStock(r);
                    return (
                        <tr key={`${r.market ?? ''}|${r.code ?? i}`}
                            className="ga-row-link ga-picks-row"
                            tabIndex={0} role="button" title="点击查看个股详情"
                            onClick={open}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    open();
                                }
                            }}>
                            <td className="ga-picks-rank">{i + 1}</td>
                            <td>
                                <div className="ga-picks-name">
                                    <span className="ga-mono">{fmtText(r.code)}</span>
                                    <span className="ga-picks-cn">{fmtText(r.name)}</span>
                                </div>
                            </td>
                            <td><ConsensusMeter directions={r.directions} value={r.consensus}/></td>
                            <td><ConfMeter value={r.avgConf}/></td>
                            <td><SignalStrip directions={r.directions} probUps={r.probUps}/></td>
                            <td className="ga-num">
                                {hr === null
                                    ? <span className="ga-muted">样本不足</span>
                                    : <span className={hrTone}>{fmtRate(hr)}</span>}
                            </td>
                            <td>{r.limitFlag ? <Badge tone="warn">涨停·追高</Badge> : <span className="ga-muted">—</span>}</td>
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
}

/**
 * 选股为空的引导：把「为什么空」和「下一步做什么」直接放在页面上，
 * 而不是只显示一句「暂无数据」。
 */
function EmptyGuide({ date, info, minConsensus, onLatest, onRelax, onJobs }) {
    return (
        <div className="ga-picks-empty">
            <div className="ga-picks-empty-title">该日期没有选股结果</div>
            <p className="ga-muted" style={{ margin: '0 0 4px' }}>
                {info?.weekend
                    ? `${date} 是${info.label}，A 股通常没有交易与预测数据。`
                    : `${date} 没有符合当前条件的冠军预测。`}
            </p>
            <ol className="ga-picks-empty-list">
                <li><b>非交易日</b>：周末 / 节假日无行情，换一个交易日再试。</li>
                <li><b>PredictJob 未运行</b>：当天预测尚未生成，去「后台任务」执行一次。</li>
                <li><b>共振下限过高</b>：当前要求方向一致周期数 ≥ {minConsensus || 0}，可点「清空」或调低。</li>
                <li><b>无在池标的</b>：该日标的都被淘汰，去「淘汰管理」查看原因分布。</li>
            </ol>
            <div className="ga-row">
                <Btn variant="primary" sm onClick={onLatest}>改用最近工作日</Btn>
                <Btn sm onClick={onRelax}>清空共振下限</Btn>
                <Btn sm onClick={onJobs}>去后台任务</Btn>
            </div>
        </div>
    );
}

/**
 * 每日选股：看涨 / 看跌分榜，共用日期、TopN、共振下限。
 * 顶部 KPI 汇总，榜单支持搜索、排序与「隐藏涨停」，行点击进入个股详情。
 */
export default function PicksPage() {
    const navigate = useNavigate();
    const [f, setF] = usePersistedState('ga:picks:filters:v2', DEFAULT_FILTERS);
    const [kw, setKw] = useState('');
    const set = (key) => (v) => setF((prev) => ({ ...prev, [key]: v }));

    const cacheKey = `ga:picks:${f.date}:${f.topN}:${f.minConsensus}`;
    const main = useApi(
        () => Promise.all([
            getPicks({ date: f.date, topN: f.topN, direction: '1', minConsensus: f.minConsensus }),
            getPicks({ date: f.date, topN: f.topN, direction: '-1', minConsensus: f.minConsensus }),
        ]),
        [f.date, f.topN, f.minConsensus],
        { cacheKey },
    );

    const [ups, downs] = Array.isArray(main.data) ? main.data : [];
    const upList = asArray(ups);
    const downList = asArray(downs);
    const allRows = [...upList, ...downList];
    const info = dayInfo(f.date);

    const best = allRows.reduce((a, r) => (
        Math.abs(num(r.consensus) || 0) > Math.abs(num(a?.consensus) || 0) ? r : a
    ), null);
    const bestCons = num(best?.consensus);
    const avgConf = allRows.length
        ? allRows.reduce((s, r) => s + (num(r.avgConf) || 0), 0) / allRows.length
        : null;

    const current = f.tab === 'down' ? downList : upList;
    const keyword = kw.trim().toLowerCase();
    const visible = current
        .filter((r) => {
            if (f.hideLimit && Number(r.limitFlag) === 1) return false;
            if (!keyword) return true;
            return String(r.code ?? '').toLowerCase().includes(keyword)
                || String(r.name ?? '').toLowerCase().includes(keyword);
        })
        .sort((a, b) => {
            if (f.sort === 'conf') return (num(b.avgConf) || 0) - (num(a.avgConf) || 0);
            if (f.sort === 'hit') return (num(b.hitRate60) || 0) - (num(a.hitRate60) || 0);
            if (f.sort === 'code') return String(a.code ?? '').localeCompare(String(b.code ?? ''));
            return Math.abs(num(b.consensus) || 0) - Math.abs(num(a.consensus) || 0);
        });

    const openStock = (row) => navigate(`${GA_BASE}/stock/${marketOf(row)}/${String(row?.code ?? '')}`, {
        state: { from: `${GA_BASE}/picks`, fromLabel: '每日选股' },
    });
    const tabs = [
        { value: 'up', label: `看涨榜 ${upList.length}` },
        { value: 'down', label: `看跌榜 ${downList.length}` },
    ];

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="日期">
                    <div className="ga-field-row">
                        <Input type="date" value={f.date} onChange={set('date')}/>
                        <Btn sm onClick={(e) => { e.preventDefault(); set('date')(lastWorkday()); }}
                             title="跳到最近一个工作日（周末自动退回周五）">最近</Btn>
                    </div>
                </Field>
                <Field label={<span><Term id="TopN">Top N</Term> 每榜取前 N 名</span>}>
                    <Input type="number" min="1" max="200" value={f.topN} onChange={set('topN')}/>
                </Field>
                <Field label={<span>共振下限 <Term id="minConsensus"/></span>} hint="至少几个周期同向">
                    <div className="ga-field-row">
                        <Input type="number" step="1" min="0" max="5" value={f.minConsensus} onChange={set('minConsensus')}/>
                        <div className="ga-chip-group">
                            {[0, 2, 3, 4, 5].map((n) => (
                                <button key={n} type="button"
                                        className={`ga-chip${String(n) === String(num(f.minConsensus) || 0) ? ' is-active' : ''}`}
                                        onClick={(e) => { e.preventDefault(); set('minConsensus')(String(n)); }}>
                                    {n === 0 ? '全部' : `≥${n}`}
                                </button>
                            ))}
                        </div>
                    </div>
                </Field>
                <RefreshBtn state={main}/>
            </FilterBar>

            {info?.weekend ? (
                <div className="ga-note ga-note--warn">
                    所选日期 {f.date} 是{info.label}，A 股通常没有交易与预测数据。
                    <Btn sm variant="ghost" onClick={() => set('date')(lastWorkday())}
                         title="跳到最近一个工作日">改为最近工作日 {lastWorkday()}</Btn>
                </div>
            ) : null}

            <AsyncPanel state={main} isEmpty={() => false}>
                {() => (
                    <>
                        <KpiGrid>
                            <KpiCard label="看涨入选" value={fmtInt(upList.length)} tone="up"
                                     hint="方向净看涨的标的数" term="predDirection"/>
                            <KpiCard label="看跌入选" value={fmtInt(downList.length)} tone="down"
                                     hint="方向净看跌的标的数" term="predDirection"/>
                            <KpiCard label="最强共振"
                                     value={bestCons === null ? '-' : `${bestCons > 0 ? '+' : ''}${bestCons}`}
                                     tone="accent"
                                     hint={best ? `${fmtText(best.name) || best.code} · 置信 ${fmtRate(best.avgConf)}` : '暂无入选'}
                                     term="minConsensus"/>
                            <KpiCard label="平均置信" value={fmtRate(avgConf)} tone="plain"
                                     hint="入选标的平均把握程度" term="confidence"/>
                        </KpiGrid>

                        <Card
                            title={<span>每日选股 · <span className="ga-mono">{f.date}</span>{info ? `（${info.label}）` : ''}</span>}
                            extra={<span className="ga-muted">
                                {main.loading ? '刷新中…' : `共 ${allRows.length} 只入选`}
                            </span>}
                            flush>
                            {allRows.length === 0 ? (
                                <EmptyGuide date={f.date} info={info} minConsensus={f.minConsensus}
                                            onLatest={() => set('date')(lastWorkday())}
                                            onRelax={() => set('minConsensus')('0')}
                                            onJobs={() => navigate(`${GA_BASE}/jobs`)}/>
                            ) : (
                                <>
                                    <div className="ga-picks-toolbar">
                                        <GaTabs items={tabs} value={f.tab} onChange={set('tab')}/>
                                        <div className="ga-row" style={{ marginLeft: 'auto' }}>
                                            <Input className="ga-picks-search" placeholder="搜索代码 / 名称"
                                                   value={kw} onChange={setKw}/>
                                            <Select value={f.sort} onChange={set('sort')} options={SORT_CHOICES}/>
                                            <label className="ga-toggle">
                                                <input type="checkbox" checked={!!f.hideLimit}
                                                       onChange={(e) => set('hideLimit')(e.target.checked)}/>
                                                隐藏涨停
                                            </label>
                                        </div>
                                    </div>
                                    <PickTable rows={visible}
                                               emptyText={keyword || f.hideLimit
                                                   ? '当前搜索 / 筛选下没有标的，试试清空条件'
                                                   : '该榜单暂无入选标的'}
                                               openStock={openStock}/>
                                    <div className="ga-picks-legend">
                                        <span><b>↑</b> 看涨　<b>↓</b> 看跌　<b>·</b> 观望</span>
                                        <span>每格下方为该周期 P↑（上涨概率），格顶为 H1→H15</span>
                                        <span>口径：仅实盘 · 在池 · 冠军集 · 方向≠0</span>
                                        <span>点击行查看个股详情</span>
                                    </div>
                                </>
                            )}
                        </Card>
                    </>
                )}
            </AsyncPanel>
        </div>
    );
}
