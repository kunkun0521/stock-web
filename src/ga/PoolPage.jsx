import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getPool, getPoolLog, postPoolOverride } from './api.js';
import {
    MUTED, ACTION_OPTIONS, asArray, asObject, num,
    fmtRate, fmtInt, fmtText, marketOf,
} from './gaUtils.js';
import GaChart from './GaChart.jsx';
import Term from './GlossaryTerm.jsx';
import {
    Card, FilterBar, Field, Select, Input, Btn, AsyncPanel, Pager, Badge, Empty, Timeline,
} from './GaParts.jsx';

/** 淘汰原因代码 → 中文（英文原文保留在 title 里）。 */
const REASON_CN = {
    NEW_LISTING: '次新股', ST: '风险警示股', LOW_LIQUIDITY: '流动性不足',
    SUSPENDED: '停牌', EXTREME_VOL: '极端波动', DATA_MISSING: '数据缺失',
    POOR_PREDICTABILITY: '历史难预测', LIMIT_TOUCH: '涨跌停',
};
const POOL_STATUS_CN = {
    ACTIVE: '在池', ELIMINATED: '已淘汰', WHITELIST: '白名单',
    COOLDOWN: '冷却中', SHADOW: '影子观察',
};

const DEFAULT_FILTERS = { status: '', reason: '', page: 1, size: 20 };
// 状态取值契约未明确，给出常见候选，实际以 /api/ga/pool 支持的枚举为准。
const STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'ACTIVE', label: '在池 ACTIVE' },
    { value: 'ELIMINATED', label: '已淘汰 ELIMINATED' },
    { value: 'WHITELIST', label: '白名单 WHITELIST' },
    { value: 'COOLDOWN', label: '冷却 COOLDOWN' },
    { value: 'SHADOW', label: '影子 SHADOW' },
];

/** 淘汰原因分布饼图。 */
function distributionOption(rows) {
    return {
        animation: false,
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { type: 'scroll', bottom: 0, textStyle: { color: MUTED, fontSize: 10 } },
        series: [{
            type: 'pie', radius: ['36%', '62%'], center: ['50%', '43%'],
            data: asArray(rows).map((x) => ({
                name: REASON_CN[x.reasonCode] || fmtText(x.reasonCode), value: num(x.n) || 0,
            })),
            label: { fontSize: 10, color: MUTED },
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

/**
 * 淘汰管理：列表 + 原因分布饼图 + 事件日志时间线 + 可预测性排行 + 手动干预。
 * 手动淘汰/复活/白名单必须填写备注，提交后刷新列表与日志。
 */
export default function PoolPage() {
    const [f, setF] = usePersistedState('ga:pool:filters', DEFAULT_FILTERS);
    const [logF, setLogF] = usePersistedState('ga:pool:logFilters', { from: '', to: '' });
    const [selected, setSelected] = useState(null);
    const [action, setAction] = useState('ELIMINATE');
    const [remark, setRemark] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const setFilter = (key) => (v) => setF((prev) => ({ ...prev, [key]: v, page: 1 }));
    const setPage = (p) => setF((prev) => ({ ...prev, page: p }));
    const setSize = (s) => setF((prev) => ({ ...prev, size: s, page: 1 }));

    const list = useApi(
        () => getPool({ status: f.status, reason: f.reason, page: f.page, size: f.size }),
        [f.status, f.reason, f.page, f.size],
    );
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
    const total = Number(data.total) || items.length;
    const size = Number(data.size) || f.size;

    // 契约没有独立的可预测性排行接口，用当前列表按 hitRate60 降序取前 10。
    const ranking = [...items].sort((a, b) => (num(b.hitRate60) || 0) - (num(a.hitRate60) || 0)).slice(0, 10);

    const logItems = asArray(log.data).map((e) => ({
        date: `${fmtText(e.eventDate)} · ${fmtText(e.eventType)}${e.operator ? ` · ${fmtText(e.operator)}` : ''}`,
        text: `${fmtText(e.reasonCode)}${e.reasonDetail ? ` — ${fmtText(e.reasonDetail)}` : ''}`
            + (e.metricJson ? ` · ${fmtText(typeof e.metricJson === 'string' ? e.metricJson : JSON.stringify(e.metricJson))}` : ''),
    }));

    const submit = async () => {
        if (!selected) { setMsg({ tone: 'err', text: '请先在列表里点选一只股票' }); return; }
        if (!remark.trim()) { setMsg({ tone: 'err', text: '操作必须填写备注' }); return; }
        setBusy(true);
        setMsg(null);
        try {
            await postPoolOverride({
                code: selected.code, market: selected.market, action, remark: remark.trim(),
            });
            setMsg({ tone: 'ok', text: '操作已提交' });
            setRemark('');
            list.reload();
            log.reload();
        } catch (e) {
            setMsg({ tone: 'err', text: e.message || '操作失败' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label={<span>状态 <Term id="poolStatus"/></span>}><Select value={f.status} onChange={setFilter('status')} options={STATUS_OPTIONS}/></Field>
                <Field label={<span>原因代码 <Term id="reasonCode"/></span>}><Input value={f.reason} onChange={setFilter('reason')} placeholder="如 NEW_LISTING / ST"/></Field>
                <Btn variant="primary" onClick={list.reload}>刷新</Btn>
            </FilterBar>

            <AsyncPanel state={list} isEmpty={() => false}>
                {() => (
                    <>
                        <div className="ga-grid-2">
                            <Card title="淘汰池列表" flush>
                                {items.length ? (
                                    <>
                                        <div className="ga-table-wrap">
                                            <table className="ga-table">
                                                <thead><tr>
                                                    <th>代码</th><th>市场</th><th><Term id="poolStatus">状态</Term></th><th><Term id="reasonCode">原因</Term></th>
                                                    <th>说明</th><th>起始日</th><th><Term id="hitRate60">命中率60</Term></th><th><Term id="hitRate60">样本60</Term></th>
                                                    <th><Term id="shadowHitRate20">影子命中20</Term></th><th><Term id="shadowHitRate20">影子样本20</Term></th><th><Term id="cooldown">冷却剩余</Term></th>
                                                </tr></thead>
                                                <tbody>
                                                {items.map((row, i) => {
                                                    const r = asObject(row);
                                                    const on = selected?.code === r.code;
                                                    return (
                                                        <tr key={i} className="ga-row-link"
                                                            style={on ? { background: '#eaf1ff' } : undefined}
                                                            title="点击查看事件日志"
                                                            onClick={() => setSelected({ code: r.code, market: marketOf(r) })}>
                                                            <td className="ga-mono">{fmtText(r.code)}</td>
                                                            <td>{fmtText(r.market)}</td>
                                                            <td><Badge tone={statusTone(r.poolStatus)} title={`英文原值：${fmtText(r.poolStatus)}`}>{POOL_STATUS_CN[r.poolStatus] || fmtText(r.poolStatus)}</Badge></td>
                                                            <td title={fmtText(r.reasonCode)}>{REASON_CN[r.reasonCode] || fmtText(r.reasonCode)}</td>
                                                            <td className="ga-wrap">{fmtText(r.reasonDetail)}</td>
                                                            <td>{fmtText(r.sinceDate)}</td>
                                                            <td className="ga-num">{fmtRate(r.hitRate60)}</td>
                                                            <td className="ga-num">{fmtInt(r.nVerified60)}</td>
                                                            <td className="ga-num">{fmtRate(r.shadowHitRate20)}</td>
                                                            <td className="ga-num">{fmtInt(r.shadowN20)}</td>
                                                            <td className="ga-num">{fmtInt(r.cooldownLeft)}</td>
                                                        </tr>
                                                    );
                                                })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <Pager page={page} size={size} total={total} pages={pages}
                                               onPage={setPage} onSize={setSize}/>
                                    </>
                                ) : <Empty text="当前筛选下没有淘汰池记录"/>}
                            </Card>

                            <Card title="淘汰原因分布">
                                {distribution.length
                                    ? <GaChart option={distributionOption(distribution)} height={300}/>
                                    : <Empty text="暂无原因分布数据"/>}
                            </Card>
                        </div>

                        <div className="ga-grid-2" style={{ marginTop: 12 }}>
                            <Card title={<span>可预测性排行（按 <Term id="hitRate60">hitRate60</Term> 降序，取前 10）</span>}>
                                {ranking.length ? (
                                    <div className="ga-table-wrap">
                                        <table className="ga-table">
                                            <thead><tr><th>#</th><th>代码</th><th>命中率60</th><th>样本60</th><th>状态</th></tr></thead>
                                            <tbody>
                                            {ranking.map((r, i) => (
                                                <tr key={i}>
                                                    <td>{i + 1}</td>
                                                    <td className="ga-mono">{fmtText(r.code)}</td>
                                                    <td className="ga-num">{fmtRate(r.hitRate60)}</td>
                                                    <td className="ga-num">{fmtInt(r.nVerified60)}</td>
                                                    <td><Badge tone={statusTone(r.poolStatus)} title={`英文原值：${fmtText(r.poolStatus)}`}>{POOL_STATUS_CN[r.poolStatus] || fmtText(r.poolStatus)}</Badge></td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : <Empty text="暂无排行数据"/>}
                            </Card>

                            <Card title="事件日志时间线" extra={
                                <div className="ga-row">
                                    <Input type="date" value={logF.from} onChange={(v) => setLogF((p) => ({ ...p, from: v }))}/>
                                    <Input type="date" value={logF.to} onChange={(v) => setLogF((p) => ({ ...p, to: v }))}/>
                                </div>
                            }>
                                <div className="ga-note">
                                    {selected ? `当前标的 ${fmtText(selected.market)} / ${fmtText(selected.code)}` : '请先在列表点选一行'}
                                </div>
                                <AsyncPanel state={log} isEmpty={(d) => asArray(d).length === 0}
                                            emptyText="该标的暂无事件日志">
                                    {() => <Timeline items={logItems}/>}
                                </AsyncPanel>
                            </Card>
                        </div>

                        <Card title="手动干预（淘汰 / 复活 / 白名单）">
                            <div className="ga-inline-form">
                                <Field label="当前标的">
                                    <Badge tone="accent">
                                        {selected ? `${fmtText(selected.market)} / ${fmtText(selected.code)}` : '未选择'}
                                    </Badge>
                                </Field>
                                <Field label="操作"><Select value={action} onChange={setAction} options={ACTION_OPTIONS}/></Field>
                                <Field label="备注（必填）">
                                    <Input className="ga-input--wide" value={remark} onChange={setRemark}
                                           placeholder="请填写干预原因"/>
                                </Field>
                                <Btn variant="primary" disabled={busy} onClick={submit}>
                                    {busy ? '提交中…' : '提交'}
                                </Btn>
                            </div>
                            {msg ? <div className={`ga-note ga-note--${msg.tone}`}>{msg.text}</div> : null}
                        </Card>
                    </>
                )}
            </AsyncPanel>
        </div>
    );
}
