import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getPool, getPoolLog, postPoolOverride } from './api.js';
import {
    MUTED, ACTION_OPTIONS, asArray, asObject, num,
    fmtRate, fmtInt, fmtText,
} from './gaUtils.js';
import GaChart from './GaChart.jsx';
import Term from './GlossaryTerm.jsx';
import {
    Card, KpiGrid, KpiCard, FilterBar, Field, Select, Input, Btn,
    AsyncPanel, Pager, Badge, Empty, Timeline, RefreshBtn,
} from './GaParts.jsx';

/** 淘汰原因代码 → 中文（英文原值保留在 title 里）。 */
const REASON_CN = {
    NEW_LISTING: '次新股', ST: '风险警示股', LOW_LIQUIDITY: '流动性不足',
    SUSPENDED: '停牌', EXTREME_VOL: '极端波动', DATA_MISSING: '数据缺失',
    POOR_PREDICTABILITY: '历史难预测', LIMIT_TOUCH: '涨跌停',
};
const POOL_STATUS_CN = {
    ACTIVE: '在池', ELIMINATED: '已淘汰', WHITELIST: '白名单',
    COOLDOWN: '冷却中', SHADOW: '影子观察',
};

const AXIS_LINE = { lineStyle: { color: '#e6e8eb' } };
const SPLIT_LINE = { lineStyle: { color: '#f0f1f3' } };

// 淘汰管理默认只看「已淘汰」：默认全部会把 3000+ 在池标的混进来，列表基本不可用。
const DEFAULT_FILTERS = { status: 'ELIMINATED', reason: '', page: 1, size: 50, kw: '' };
const STATUS_OPTIONS = [
    { value: 'ELIMINATED', label: '已淘汰 ELIMINATED' },
    { value: 'ACTIVE', label: '在池 ACTIVE' },
    { value: 'WHITELIST', label: '白名单 WHITELIST' },
    { value: '', label: '全部状态' },
];

/** 淘汰原因横向条形图：比饼图更容易比较数量。 */
function reasonOption(rows) {
    const list = [...asArray(rows)].sort((a, b) => (num(b.n) || 0) - (num(a.n) || 0));
    return {
        animation: false,
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 100, right: 56, top: 8, bottom: 8 },
        xAxis: { type: 'value', axisLabel: { color: MUTED, fontSize: 10 }, splitLine: SPLIT_LINE },
        yAxis: {
            type: 'category', data: list.map((x) => REASON_CN[x.reasonCode] || fmtText(x.reasonCode)),
            axisLabel: { color: MUTED, fontSize: 11 }, axisLine: AXIS_LINE,
        },
        series: [{
            type: 'bar', barMaxWidth: 16,
            data: list.map((x) => num(x.n) || 0),
            itemStyle: { color: '#e8a33d', borderRadius: [0, 3, 3, 0] },
            label: { show: true, position: 'right', color: MUTED, fontSize: 10 },
        }],
    };
}

function statusTone(s) {
    const v = String(s ?? '').toUpperCase();
    if (v.includes('ELIM') || v.includes('OUT')) return 'up';
    if (v.includes('WHITE')) return 'info';
    if (v.includes('ACTIVE') || v.includes('IN')) return 'down';
    return 'plain';
}

const isEliminated = (r) => String(r?.poolStatus ?? '').toUpperCase() === 'ELIMINATED';
const isActive = (r) => String(r?.poolStatus ?? '').toUpperCase() === 'ACTIVE';

/**
 * 淘汰管理：默认只看已淘汰；KPI 汇总 + 原因下拉筛选 + 列表与干预面板并排。
 * 行内可直接发起复活/淘汰/白名单，选中后右侧填备注提交，事件日志就在下方。
 */
export default function PoolPage() {
    const [f, setF] = usePersistedState('ga:pool:filters:v2', DEFAULT_FILTERS);
    const [logF, setLogF] = usePersistedState('ga:pool:logFilters', { from: '', to: '' });
    const [selected, setSelected] = useState(null);
    const [action, setAction] = useState('RESTORE');
    const [remark, setRemark] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const setFilter = (key) => (v) => setF((prev) => ({ ...prev, [key]: v, page: 1 }));
    // 原因只对已淘汰标的有意义；切到在池/白名单时顺手清掉，避免筛出空列表。
    const setStatus = (v) => setF((prev) => ({
        ...prev, status: v, page: 1, reason: v && v !== 'ELIMINATED' ? '' : prev.reason,
    }));
    const setPage = (p) => setF((prev) => ({ ...prev, page: p }));
    const setSize = (s) => setF((prev) => ({ ...prev, size: s, page: 1 }));

    const list = useApi(
        () => getPool({ status: f.status, reason: f.reason, page: f.page, size: f.size }),
        [f.status, f.reason, f.page, f.size],
    );
    // 轻量汇总：只取 total，用于「在池」KPI；已淘汰总数直接用 distribution 求和。
    const activeSummary = useApi(() => getPool({ status: 'ACTIVE', page: 1, size: 1 }), []);
    const log = useApi(
        () => (selected
            ? getPoolLog({ code: selected.code, market: selected.market, from: logF.from, to: logF.to })
            : Promise.resolve([])),
        [selected?.code, selected?.market, logF.from, logF.to],
    );

    const data = asObject(list.data);
    const items = asArray(data.items);
    const distribution = asArray(data.distribution);
    const page = Number(data.page) || f.page;
    const pages = Math.max(1, Number(data.pages) || 1);
    const total = Number(data.total) || 0;
    const size = Number(data.size) || f.size;
    const elimTotal = distribution.reduce((s, d) => s + (num(d.n) || 0), 0);
    const activeTotal = num(asObject(activeSummary.data).total) || 0;

    const reasonOptions = [
        { value: '', label: `全部原因（${fmtInt(elimTotal)}）` },
        ...distribution.map((d) => ({
            value: d.reasonCode,
            label: `${REASON_CN[d.reasonCode] || fmtText(d.reasonCode)}（${fmtInt(d.n)}）`,
        })),
    ];

    const kw = String(f.kw || '').trim().toLowerCase();
    const visible = items.filter((r) => !kw
        || String(r.code ?? '').toLowerCase().includes(kw)
        || String(r.market ?? '').toLowerCase().includes(kw));

    // 可复活候选：仅基于当前页，阈值参考 pool_restore_hit(0.52)。
    const restoreCandidates = items
        .filter((r) => isEliminated(r) && (num(r.shadowN20) || 0) >= 10 && (num(r.shadowHitRate20) || 0) >= 0.52)
        .sort((a, b) => (num(b.shadowHitRate20) || 0) - (num(a.shadowHitRate20) || 0))
        .slice(0, 10);

    const logItems = asArray(log.data).map((e) => ({
        date: `${fmtText(e.eventDate)} · ${fmtText(e.eventType)}${e.operator ? ` · ${fmtText(e.operator)}` : ''}`,
        text: `${REASON_CN[e.reasonCode] || fmtText(e.reasonCode)}${e.reasonDetail ? ` — ${fmtText(e.reasonDetail)}` : ''}`
            + (e.metricJson ? ` · ${fmtText(typeof e.metricJson === 'string' ? e.metricJson : JSON.stringify(e.metricJson))}` : ''),
    }));

    const pick = (row, act) => {
        setSelected(asObject(row));
        if (act) setAction(act);
        setMsg(null);
        setTimeout(() => document.getElementById('ga-pool-action')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
    };

    const submit = async () => {
        if (!selected) { setMsg({ tone: 'err', text: '请先在列表里点选一只股票' }); return; }
        if (!remark.trim()) { setMsg({ tone: 'err', text: '操作必须填写备注' }); return; }
        setBusy(true);
        setMsg(null);
        try {
            await postPoolOverride({
                code: selected.code, market: selected.market, action, remark: remark.trim(),
            });
            setMsg({ tone: 'ok', text: `已提交：${selected.code} ${ACTION_OPTIONS.find((a) => a.value === action)?.label || action}` });
            setRemark('');
            list.reload();
            activeSummary.reload();
            log.reload();
        } catch (e) {
            setMsg({ tone: 'err', text: e.message || '操作失败' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ga-page">
            <KpiGrid>
                <KpiCard label="已淘汰" value={fmtInt(elimTotal)} tone="up"
                         hint="pool_status=ELIMINATED" term="poolStatus"/>
                <KpiCard label="在池" value={fmtInt(activeTotal)} tone="down"
                         hint="可正常预测的标的" term="poolStatus"/>
                <KpiCard label="淘汰原因" value={fmtInt(distribution.length)} tone="plain"
                         hint="当前有记录的原因种类" term="reasonCode"/>
                <KpiCard label="当前筛选" value={fmtInt(total)} tone="accent"
                         hint={f.status ? `状态 ${f.status}` : '全部状态'} term="poolStatus"/>
            </KpiGrid>

            <FilterBar>
                <Field label={<span>状态 <Term id="poolStatus"/></span>}>
                    <Select value={f.status} onChange={setStatus} options={STATUS_OPTIONS}/>
                </Field>
                {f.status === '' || f.status === 'ELIMINATED' ? (
                    <Field label={<span>原因 <Term id="reasonCode"/></span>} hint="带当前数量">
                        <Select value={f.reason} onChange={setFilter('reason')} options={reasonOptions}/>
                    </Field>
                ) : null}
                <Field label="本页搜索" hint="代码 / 市场">
                    <Input value={f.kw} onChange={setFilter('kw')} placeholder="如 002172"/>
                </Field>
                <RefreshBtn states={[list, activeSummary, log]}/>
            </FilterBar>

            <AsyncPanel state={list} isEmpty={() => false}>
                {() => (
                    <>
                        <div className="ga-pool-main">
                            <Card title="淘汰池列表" flush
                                  extra={<span className="ga-muted">共 {fmtInt(total)} 条{kw ? ` · 本页命中 ${visible.length}` : ''}</span>}>
                                {items.length ? (
                                    visible.length ? (
                                        <>
                                            <div className="ga-table-wrap">
                                                <table className="ga-table ga-pool-table">
                                                    <thead><tr>
                                                        <th>代码 / 市场</th>
                                                        <th><Term id="poolStatus">状态</Term></th>
                                                        <th><Term id="reasonCode">原因</Term></th>
                                                        <th>说明</th>
                                                        <th>起始日</th>
                                                        <th><Term id="hitRate60">命中率60 / 样本</Term></th>
                                                        <th><Term id="shadowHitRate20">影子20 / 样本</Term></th>
                                                        <th>最近评估</th>
                                                        <th>操作</th>
                                                    </tr></thead>
                                                    <tbody>
                                                    {visible.map((row) => {
                                                        const r = asObject(row);
                                                        const on = selected?.code === r.code && selected?.market === r.market;
                                                        return (
                                                            <tr key={`${r.market}|${r.code}`}
                                                                className="ga-row-link ga-picks-row"
                                                                tabIndex={0} role="button"
                                                                title={r.reasonDetail ? `点击查看日志：${r.reasonDetail}` : '点击查看事件日志'}
                                                                style={on ? { background: '#eaf1ff' } : undefined}
                                                                onClick={() => pick(r)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                                        e.preventDefault();
                                                                        pick(r);
                                                                    }
                                                                }}>
                                                                <td>
                                                                    <div className="ga-picks-name">
                                                                        <span className="ga-mono">{fmtText(r.code)}</span>
                                                                        <span className="ga-picks-cn ga-muted">{fmtText(r.market)}</span>
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <Badge tone={statusTone(r.poolStatus)}
                                                                           title={`英文原值：${fmtText(r.poolStatus)}`}>
                                                                        {POOL_STATUS_CN[r.poolStatus] || fmtText(r.poolStatus)}
                                                                    </Badge>
                                                                </td>
                                                                <td title={fmtText(r.reasonCode)}>
                                                                    {REASON_CN[r.reasonCode] || fmtText(r.reasonCode)}
                                                                </td>
                                                                <td className="ga-wrap ga-pool-detail">{fmtText(r.reasonDetail)}</td>
                                                                <td>{fmtText(r.sinceDate)}</td>
                                                                <td className="ga-num">
                                                                    <div className="ga-pool-rate">
                                                                        <span>{fmtRate(r.hitRate60)}</span>
                                                                        <small>样本 {fmtInt(r.nVerified60)}</small>
                                                                    </div>
                                                                </td>
                                                                <td className="ga-num">
                                                                    <div className="ga-pool-rate">
                                                                        <span>{fmtRate(r.shadowHitRate20)}</span>
                                                                        <small>样本 {fmtInt(r.shadowN20)}</small>
                                                                    </div>
                                                                </td>
                                                                <td>{fmtText(r.lastEvalDate)}</td>
                                                                <td onClick={(e) => e.stopPropagation()}>
                                                                    <div className="ga-actions">
                                                                        {isEliminated(r)
                                                                            ? <Btn sm variant="ghost" onClick={() => pick(r, 'RESTORE')}>复活</Btn>
                                                                            : null}
                                                                        {isActive(r)
                                                                            ? <Btn sm variant="ghost" onClick={() => pick(r, 'ELIMINATE')}>淘汰</Btn>
                                                                            : null}
                                                                        <Btn sm variant="ghost" onClick={() => pick(r, 'WHITELIST')}>白名单</Btn>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <Pager page={page} size={size} total={total} pages={pages}
                                                   onPage={setPage} onSize={setSize}/>
                                            <div className="ga-pool-note">
                                                                        命中率60 / 影子20 只对已淘汰标的计算；在池标的显示「-」属正常。
                                                                        冷却期由 pool_cooldown_days 控制，不在本表字段内，故不再展示。
                                            </div>
                                        </>
                                    ) : <Empty text="本页没有匹配的代码，试试清空「本页搜索」"/>
                                ) : (
                                    <div className="ga-pool-empty">
                                        <Empty text="当前筛选下没有记录"/>
                                        <Btn sm onClick={() => setF({ ...DEFAULT_FILTERS, size: f.size })}>恢复默认筛选</Btn>
                                    </div>
                                )}
                            </Card>

                            <div className="ga-stack">
                                <div id="ga-pool-action">
                                <Card title="手动干预"
                                      extra={selected ? <Badge tone="accent">{selected.market} / {selected.code}</Badge> : null}>
                                    {selected ? (
                                        <>
                                            <div className="ga-pool-selected">
                                                <div><span className="ga-muted">状态</span>
                                                    <b><Badge tone={statusTone(selected.poolStatus)}>
                                                        {POOL_STATUS_CN[selected.poolStatus] || fmtText(selected.poolStatus)}
                                                    </Badge></b></div>
                                                <div><span className="ga-muted">原因</span>
                                                    <b title={fmtText(selected.reasonCode)}>
                                                        {REASON_CN[selected.reasonCode] || fmtText(selected.reasonCode)}
                                                    </b></div>
                                                <div><span className="ga-muted">命中率60</span>
                                                    <b>{fmtRate(selected.hitRate60)} · {fmtInt(selected.nVerified60)} 条</b></div>
                                                <div><span className="ga-muted">影子命中20</span>
                                                    <b>{fmtRate(selected.shadowHitRate20)} · {fmtInt(selected.shadowN20)} 条</b></div>
                                                <div><span className="ga-muted">起始日</span><b>{fmtText(selected.sinceDate)}</b></div>
                                                <div><span className="ga-muted">最近评估</span><b>{fmtText(selected.lastEvalDate)}</b></div>
                                            </div>
                                            <div className="ga-stack">
                                                <Field label="操作"><Select value={action} onChange={setAction} options={ACTION_OPTIONS}/></Field>
                                                <Field label="备注（必填）">
                                                    <Input value={remark} onChange={setRemark} placeholder="请填写干预原因"/>
                                                </Field>
                                                <Btn variant="primary" loading={busy}
                                                     loadingText="提交中…" onClick={submit}>提交</Btn>
                                            </div>
                                        </>
                                    ) : <Empty text="在左侧列表点选一只标的"/>}
                                    {msg ? <div className={`ga-note ga-note--${msg.tone}`}>{msg.text}</div> : null}
                                </Card>
                                </div>

                                <Card title="事件日志" extra={
                                    <div className="ga-row">
                                        <Input type="date" value={logF.from} onChange={(v) => setLogF((p) => ({ ...p, from: v }))}/>
                                        <Input type="date" value={logF.to} onChange={(v) => setLogF((p) => ({ ...p, to: v }))}/>
                                    </div>
                                }>
                                    <div className="ga-note">
                                        {selected ? `当前标的 ${fmtText(selected.market)} / ${fmtText(selected.code)}` : '请先在左侧点选一行'}
                                    </div>
                                    <AsyncPanel state={log} isEmpty={(d) => asArray(d).length === 0}
                                                emptyText="该标的暂无事件日志">
                                        {() => <Timeline items={logItems}/>}
                                    </AsyncPanel>
                                </Card>
                            </div>
                        </div>

                        <div className="ga-grid-2">
                            <Card title="淘汰原因分布"
                                  extra={<span className="ga-muted">合计 {fmtInt(elimTotal)} 只</span>}>
                                {distribution.length
                                    ? <GaChart option={reasonOption(distribution)} height={280}/>
                                    : <Empty text="暂无原因分布数据"/>}
                            </Card>

                            <Card title="可复活候选（本页）"
                                  extra={<span className="ga-muted">影子命中20 ≥ 52% 且样本 ≥ 10</span>}>
                                {restoreCandidates.length ? (
                                    <div className="ga-table-wrap">
                                        <table className="ga-table">
                                            <thead><tr>
                                                <th>代码</th><th>影子命中20</th><th>影子样本</th><th>命中率60</th><th>操作</th>
                                            </tr></thead>
                                            <tbody>
                                            {restoreCandidates.map((r) => (
                                                <tr key={`${r.market}|${r.code}`} className="ga-row-link"
                                                    title="点击选中并填写复活备注" onClick={() => pick(r, 'RESTORE')}>
                                                    <td className="ga-mono">{fmtText(r.code)}</td>
                                                    <td className="ga-num">{fmtRate(r.shadowHitRate20)}</td>
                                                    <td className="ga-num">{fmtInt(r.shadowN20)}</td>
                                                    <td className="ga-num">{fmtRate(r.hitRate60)}</td>
                                                    <td><Btn sm variant="ghost" onClick={(e) => { e.stopPropagation(); pick(r, 'RESTORE'); }}>复活</Btn></td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : <Empty text="当前页没有达到复活阈值的标的（仅统计本页已淘汰标的）"/>}
                            </Card>
                        </div>
                    </>
                )}
            </AsyncPanel>
        </div>
    );
}
