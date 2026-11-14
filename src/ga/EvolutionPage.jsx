import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import {
    getEvolutionRuns, getEvolutionGenerations, getIndividuals, getChampions,
    postEvolutionRun, postEvolutionReplay, postChampionPromote, postChampionRollback,
} from './api.js';
import {
    UP, DOWN, MUTED, ACCENT, HORIZONS, HORIZON_OPTIONS,
    asArray, asObject, num, fmtNum, fmtInt, fmtText,
} from './gaUtils.js';
import GaChart from './GaChart.jsx';
import Term from './GlossaryTerm.jsx';
import {
    Card, FilterBar, Field, Select, Input, Btn, AsyncPanel, Pager, Badge, Empty,
} from './GaParts.jsx';

const DEFAULT_FILTERS = { horizon: '', runType: '', page: 1, size: 20 };
const AXIS_LINE = { lineStyle: { color: '#e6e8eb' } };
const SPLIT_LINE = { lineStyle: { color: '#f0f1f3' } };
const LEGEND = { top: 0, left: 4, textStyle: { color: MUTED, fontSize: 11 }, itemWidth: 12, itemHeight: 8 };

/** 收敛曲线：各代最优/平均/中位/最差适应度。 */
function convergenceOption(rows) {
    const r = asArray(rows);
    const line = (name, key, color) => ({
        name, type: 'line', smooth: true, showSymbol: false,
        data: r.map((x) => num(x[key])),
        lineStyle: { width: 1.4, color }, itemStyle: { color },
    });
    return {
        animation: false, tooltip: { trigger: 'axis' },
        legend: { ...LEGEND, data: ['最优', '平均', '中位', '最差'] },
        grid: { left: 52, right: 12, top: 26, bottom: 26 },
        xAxis: { type: 'category', data: r.map((x) => x.generation), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: { type: 'value', axisLabel: { color: MUTED }, splitLine: SPLIT_LINE },
        series: [
            line('最优', 'bestFitness', UP), line('平均', 'avgFitness', ACCENT),
            line('中位', 'medianFitness', '#e8a33d'), line('最差', 'worstFitness', DOWN),
        ],
    };
}

/** 多样性曲线：diversity 折线 + 每代移民数柱。 */
function diversityOption(rows) {
    const r = asArray(rows);
    return {
        animation: false, tooltip: { trigger: 'axis' },
        legend: { ...LEGEND, data: ['多样性', '移民数'] },
        grid: { left: 46, right: 42, top: 26, bottom: 26 },
        xAxis: { type: 'category', data: r.map((x) => x.generation), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: [
            { type: 'value', axisLabel: { color: MUTED }, splitLine: SPLIT_LINE },
            { type: 'value', axisLabel: { color: MUTED }, splitLine: { show: false } },
        ],
        series: [
            { name: '多样性', type: 'line', smooth: true, showSymbol: false, data: r.map((x) => num(x.diversity)), lineStyle: { width: 1.8, color: ACCENT }, itemStyle: { color: ACCENT } },
            { name: '移民数', type: 'bar', yAxisIndex: 1, barMaxWidth: 14, data: r.map((x) => num(x.immigrantsCount)), itemStyle: { color: '#c9d6f0' } },
        ],
    };
}

/** 每代淘汰数柱。 */
function culledOption(rows) {
    const r = asArray(rows);
    return {
        animation: false, tooltip: { trigger: 'axis' },
        grid: { left: 46, right: 12, top: 16, bottom: 26 },
        xAxis: { type: 'category', data: r.map((x) => x.generation), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: { type: 'value', axisLabel: { color: MUTED }, splitLine: SPLIT_LINE },
        series: [{ type: 'bar', barMaxWidth: 18, data: r.map((x) => num(x.culledCount)), itemStyle: { color: '#e8a33d' } }],
    };
}

/**
 * 解析 chromosomeJson：结构契约未定义，兼容对象 {feature:weight}、
 * 数组 [{name,weight}] 与纯数值数组，解析失败返回空。
 */
function parseChromosome(raw) {
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch { return []; }
    }
    if (Array.isArray(obj)) {
        return obj.map((x, i) => ({
            name: fmtText(x?.name ?? x?.feature ?? x?.f ?? `g${i}`),
            weight: num(x?.weight ?? x?.w ?? x) || 0,
        }));
    }
    if (obj && typeof obj === 'object') {
        return Object.entries(obj).map(([k, v]) => ({
            name: k, weight: num(v && typeof v === 'object' ? v.weight : v) || 0,
        }));
    }
    return [];
}

/** 基因权重横向条形图（正红负绿）。 */
function genesOption(genes) {
    const g = genes.slice(0, 30);
    return {
        animation: false, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 130, right: 30, top: 8, bottom: 20 },
        xAxis: { type: 'value', axisLabel: { color: MUTED, fontSize: 10 }, splitLine: SPLIT_LINE },
        yAxis: {
            type: 'category', data: g.map((x) => x.name),
            axisLabel: { color: MUTED, fontSize: 10, width: 122, overflow: 'truncate' }, axisLine: AXIS_LINE,
        },
        series: [{
            type: 'bar', barMaxWidth: 14,
            data: g.map((x) => ({ value: x.weight, itemStyle: { color: x.weight >= 0 ? UP : DOWN } })),
        }],
    };
}

function statusTone(s) {
    const v = String(s ?? '').toUpperCase();
    if (v.includes('CHAMP') || v.includes('ACTIVE')) return 'accent';
    if (v.includes('RETIRE') || v.includes('DEAD')) return 'muted';
    if (v.includes('CANDID') || v.includes('SHADOW')) return 'info';
    return 'plain';
}

/**
 * 进化监控：运行列表（点选）→ 收敛/多样性/淘汰数曲线；名人堂 + 基因权重；
 * 冠军版本对比与回滚；手动触发进化 / 回放 / 晋升。
 */
export default function EvolutionPage() {
    const [f, setF] = usePersistedState('ga:evolution:filters', DEFAULT_FILTERS);
    const [indStatus, setIndStatus] = usePersistedState('ga:evolution:indStatus', '');
    const [selectedRunId, setSelectedRunId] = useState('');
    const [selInd, setSelInd] = useState(null);
    const [replay, setReplay] = usePersistedState('ga:evolution:replay', {
        from: '', to: '', step: '5', horizons: HORIZONS.join(','),
    });
    const [promoteRunId, setPromoteRunId] = useState('');
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState(null);

    const setFilter = (key) => (v) => setF((prev) => ({ ...prev, [key]: v, page: 1 }));
    const setPage = (p) => setF((prev) => ({ ...prev, page: p }));
    const setSize = (s) => setF((prev) => ({ ...prev, size: s, page: 1 }));

    const runs = useApi(
        () => getEvolutionRuns({ horizon: f.horizon, runType: f.runType, page: f.page, size: f.size }),
        [f.horizon, f.runType, f.page, f.size],
    );
    const gens = useApi(
        () => (selectedRunId ? getEvolutionGenerations({ runId: selectedRunId }) : Promise.resolve([])),
        [selectedRunId],
    );
    const individuals = useApi(
        () => getIndividuals({ runId: selectedRunId || undefined, horizon: f.horizon, status: indStatus }),
        [selectedRunId, f.horizon, indStatus],
    );
    const champions = useApi(() => getChampions({ horizon: f.horizon }), [f.horizon]);

    const runData = asObject(runs.data);
    const runItems = asArray(runData.items);
    const hall = asArray(individuals.data).slice().sort((a, b) => (num(b.fitness) || 0) - (num(a.fitness) || 0));
    const champList = asArray(champions.data);
    const genes = selInd ? parseChromosome(selInd.chromosomeJson) : [];
    const genRows = asArray(gens.data);

    const reloadAll = () => { runs.reload(); gens.reload(); individuals.reload(); champions.reload(); };
    const doAction = async (key, label, fn) => {
        setBusy(key);
        setMsg(null);
        try {
            const r = await fn();
            setMsg({ tone: 'ok', text: `${label}：${r?.message || '已提交'}` });
            reloadAll();
        } catch (e) {
            setMsg({ tone: 'err', text: `${label}失败：${e.message || '接口异常'}` });
        } finally {
            setBusy('');
        }
    };

    const triggerRun = () => doAction('run', '触发进化', () => postEvolutionRun({ horizon: f.horizon }));
    const triggerReplay = () => doAction('replay', '触发回放', () => {
        const stepVal = Number(replay.step);
        const horizons = String(replay.horizons).split(',').map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n));
        return postEvolutionReplay({
            from: replay.from, to: replay.to,
            step: Number.isFinite(stepVal) ? stepVal : replay.step,
            horizons,
        });
    });
    const triggerPromote = () => {
        const rid = promoteRunId || selectedRunId;
        if (!rid) { setMsg({ tone: 'err', text: '请先选择运行或填写 runId' }); return; }
        return doAction('promote', '晋升冠军', () => postChampionPromote({ runId: rid, horizon: f.horizon }));
    };
    const triggerRollback = (row) => doAction(`rb-${row.id ?? row.versionTag}`, `回滚到 ${fmtText(row.versionTag)}`,
        () => postChampionRollback({ horizon: row.horizon ?? f.horizon, versionTag: row.versionTag }));

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="周期"><Select value={f.horizon} onChange={setFilter('horizon')} options={HORIZON_OPTIONS}/></Field>
                <Field label="运行类型" hint="取值依后端">
                    <Input value={f.runType} onChange={setFilter('runType')} placeholder="如 DAILY / REPLAY"/>
                </Field>
                <Field label="个体状态" hint="可空">
                    <Input value={indStatus} onChange={setIndStatus} placeholder="如 champion"/>
                </Field>
                <Btn variant="primary" onClick={reloadAll}>刷新</Btn>
            </FilterBar>

            <Card title="进化运行记录（点选一行查看收敛诊断）" flush>
                <AsyncPanel state={runs} isEmpty={() => false}>
                    {() => (runItems.length ? (
                        <>
                            <div className="ga-table-wrap">
                                <table className="ga-table">
                                    <thead><tr>
                                        <th><Term id="runId">runId</Term></th><th><Term id="horizon">周期</Term></th>
                                        <th><Term id="runType">类型</Term></th><th>基准日</th><th><Term id="generation">代数</Term></th>
                                        <th><Term id="fitness">最优适应度</Term></th><th><Term id="runStatus">状态</Term></th>
                                        <th>告警</th><th>错误</th><th>开始</th><th>结束</th>
                                    </tr></thead>
                                    <tbody>
                                    {runItems.map((row, i) => {
                                        const r = asObject(row);
                                        const on = String(selectedRunId) === String(r.runId);
                                        return (
                                            <tr key={r.runId ?? i} className="ga-row-link"
                                                style={on ? { background: '#eaf1ff' } : undefined}
                                                onClick={() => setSelectedRunId(r.runId)}>
                                                <td className="ga-mono">{fmtText(r.runId)}</td>
                                                <td>{fmtText(r.horizon)}</td>
                                                <td>{fmtText(r.runType)}</td>
                                                <td>{fmtText(r.asOfDate)}</td>
                                                <td className="ga-num">{fmtInt(r.generationsDone)}</td>
                                                <td className="ga-num">{fmtNum(r.bestFitness, 4)}</td>
                                                <td><Badge tone={statusTone(r.status)}>{fmtText(r.status)}</Badge></td>
                                                <td className="ga-wrap">{fmtText(r.warnMsg)}</td>
                                                <td className="ga-wrap">{fmtText(r.errorMsg)}</td>
                                                <td>{fmtText(r.startedAt)}</td>
                                                <td>{fmtText(r.finishedAt)}</td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                            <Pager page={Number(runData.page) || f.page} size={Number(runData.size) || f.size}
                                   total={Number(runData.total) || runItems.length}
                                   pages={Math.max(1, Number(runData.pages) || 1)}
                                   onPage={setPage} onSize={setSize}/>
                        </>
                    ) : <Empty text="暂无进化运行记录"/>)}
                </AsyncPanel>
            </Card>

            <Card title="收敛诊断" extra={
                selectedRunId ? <Badge tone="accent"><Term id="runId">runId</Term> {fmtText(selectedRunId)}</Badge> : <span className="ga-muted">请先在上方列表点选一行</span>
            }>
                <AsyncPanel state={gens} isEmpty={(d) => asArray(d).length === 0} emptyText="该运行暂无逐代数据">
                    {() => (
                        <div className="ga-grid-3">
                            <div>
                                <div className="ga-section-title">适应度收敛</div>
                                <GaChart option={convergenceOption(genRows)} height={220}/>
                            </div>
                            <div>
                                <div className="ga-section-title">种群多样性</div>
                                <GaChart option={diversityOption(genRows)} height={220}/>
                            </div>
                            <div>
                                <div className="ga-section-title">每代淘汰数</div>
                                <GaChart option={culledOption(genRows)} height={220}/>
                            </div>
                        </div>
                    )}
                </AsyncPanel>
            </Card>

            <div className="ga-grid-2">
                <Card title="名人堂 / 个体（点击行查看基因权重）" flush>
                    <AsyncPanel state={individuals} isEmpty={(d) => asArray(d).length === 0} emptyText="暂无个体记录">
                        {() => (
                            <div className="ga-table-wrap ga-scroll-y">
                                <table className="ga-table">
                                    <thead><tr>
                                        <th>个体</th><th><Term id="horizon">周期</Term></th><th><Term id="generation">代</Term></th>
                                        <th><Term id="fitness">适应度</Term></th><th><Term id="fitTrain">训练</Term></th>
                                        <th><Term id="fitValid">验证</Term></th><th><Term id="BalAcc">平衡准度</Term></th>
                                        <th><Term id="IC">IC</Term></th><th><Term id="coverageValid">覆盖</Term></th><th><Term id="Brier">Brier</Term></th>
                                        <th><Term id="individualStatus">状态</Term></th><th>退役原因</th><th>激活因子</th>
                                    </tr></thead>
                                    <tbody>
                                    {hall.map((row, i) => {
                                        const r = asObject(row);
                                        const on = selInd === row;
                                        return (
                                            <tr key={r.individualId ?? i} className="ga-row-link"
                                                style={on ? { background: '#eaf1ff' } : undefined}
                                                onClick={() => setSelInd(row)}>
                                                <td className="ga-mono">{fmtText(r.individualId)}</td>
                                                <td>{fmtText(r.horizon)}</td>
                                                <td className="ga-num">{fmtInt(r.generation)}</td>
                                                <td className="ga-num">{fmtNum(r.fitness, 4)}</td>
                                                <td className="ga-num">{fmtNum(r.fitTrain, 4)}</td>
                                                <td className="ga-num">{fmtNum(r.fitValid, 4)}</td>
                                                <td className="ga-num">{fmtNum(r.balaccValid, 3)}</td>
                                                <td className="ga-num">{fmtNum(r.icValid, 3)}</td>
                                                <td className="ga-num">{fmtNum(r.coverageValid, 3)}</td>
                                                <td className="ga-num">{fmtNum(r.brierValid, 3)}</td>
                                                <td><Badge tone={statusTone(r.status)}>{fmtText(r.status)}</Badge></td>
                                                <td className="ga-wrap">{fmtText(r.retireReason)}</td>
                                                <td className="ga-num">{fmtInt(r.nActiveFeatures)}</td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </AsyncPanel>
                </Card>

                <Card title="基因权重（选中个体）">
                    {genes.length
                        ? <GaChart option={genesOption(genes)} height={320}/>
                        : <Empty text="请在名人堂点选一行以查看基因权重"/>}
                </Card>
            </div>

            <Card title="冠军版本对比与回滚">
                <AsyncPanel state={champions} isEmpty={(d) => asArray(d).length === 0} emptyText="暂无冠军版本">
                    {() => (
                        <div className="ga-table-wrap">
                            <table className="ga-table">
                                <thead><tr>
                                    <th>版本</th><th>周期</th><th>排名</th><th>权重</th><th>是否当前</th>
                                    <th>生效起</th><th>生效止</th><th>个体</th><th>操作</th>
                                </tr></thead>
                                <tbody>
                                {champList.map((row, i) => {
                                    const r = asObject(row);
                                    const key = r.id ?? r.versionTag ?? i;
                                    return (
                                        <tr key={key}>
                                            <td className="ga-mono">{fmtText(r.versionTag)}</td>
                                            <td>{fmtText(r.horizon)}</td>
                                            <td className="ga-num">{fmtInt(r.rankNo)}</td>
                                            <td className="ga-num">{fmtNum(r.weight, 3)}</td>
                                            <td>{r.isCurrent ? <Badge tone="accent">当前</Badge> : <Badge tone="muted">历史</Badge>}</td>
                                            <td>{fmtText(r.effectiveFrom)}</td>
                                            <td>{fmtText(r.effectiveTo)}</td>
                                            <td className="ga-mono">{fmtText(r.individualId)}</td>
                                            <td>
                                                <Btn sm disabled={busy === `rb-${r.id ?? r.versionTag}`}
                                                     onClick={() => triggerRollback(r)}>回滚到此版本</Btn>
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </AsyncPanel>
            </Card>

            <Card title="手动操作（周期取自上方筛选条）">
                <div className="ga-stack">
                    <div className="ga-inline-form">
                        <span className="ga-muted" style={{ minWidth: 72 }}>触发进化</span>
                        <Badge tone="info"><Term id="horizon">horizon</Term> = {f.horizon || '全部'}</Badge>
                        <Btn variant="primary" disabled={busy === 'run'} onClick={triggerRun}>触发进化</Btn>
                    </div>
                    <div className="ga-inline-form">
                        <span className="ga-muted" style={{ minWidth: 72 }}>历史回放</span>
                        <Field label="起始"><Input type="date" value={replay.from} onChange={(v) => setReplay((p) => ({ ...p, from: v }))}/></Field>
                        <Field label="结束"><Input type="date" value={replay.to} onChange={(v) => setReplay((p) => ({ ...p, to: v }))}/></Field>
                        <Field label="步长"><Input type="number" min="1" value={replay.step} onChange={(v) => setReplay((p) => ({ ...p, step: v }))}/></Field>
                        <Field label="周期列表" hint="逗号分隔">
                            <Input className="ga-input--wide" value={replay.horizons}
                                   onChange={(v) => setReplay((p) => ({ ...p, horizons: v }))}/>
                        </Field>
                        <Btn disabled={busy === 'replay'} onClick={triggerReplay}>触发回放</Btn>
                    </div>
                    <div className="ga-inline-form">
                        <span className="ga-muted" style={{ minWidth: 72 }}>晋升冠军</span>
                        <Field label={<span><Term id="runId">runId</Term> 运行编号</span>} hint="留空用选中运行">
                            <Input className="ga-input--wide" value={promoteRunId} onChange={setPromoteRunId}
                                   placeholder={selectedRunId ? String(selectedRunId) : '填写 runId'}/>
                        </Field>
                        <Btn disabled={busy === 'promote'} onClick={triggerPromote}>晋升冠军</Btn>
                    </div>
                    {msg ? <div className={`ga-note ga-note--${msg.tone}`}>{msg.text}</div> : null}
                </div>
            </Card>
        </div>
    );
}
