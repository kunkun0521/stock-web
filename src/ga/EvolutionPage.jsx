import { Fragment, useEffect, useState } from 'react';
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
    Card, KpiGrid, KpiCard, FilterBar, Field, Select, Input, Btn,
    AsyncPanel, Pager, Badge, Empty, RefreshBtn,
} from './GaParts.jsx';

const DEFAULT_FILTERS = { horizon: '', runType: '', page: 1, size: 20 };
const RUN_TYPE_OPTIONS = [
    { value: '', label: '全部类型' },
    { value: 'EVOLVE', label: '进化 EVOLVE' },
    { value: 'REPLAY', label: '回放 REPLAY' },
];
const IND_STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'CHAMPION', label: '冠军 CHAMPION' },
    { value: 'CANDIDATE', label: '候选 CANDIDATE' },
    { value: 'HOF', label: '名人堂 HOF' },
    { value: 'RETIRED', label: '退役 RETIRED' },
];
const IND_SORT_OPTIONS = [
    { value: 'fitness', label: '适应度 ↓' },
    { value: 'fitValid', label: '验证 ↓' },
    { value: 'fitTrain', label: '训练 ↓' },
    { value: 'balaccValid', label: 'BalAcc ↓' },
    { value: 'icValid', label: 'IC ↓' },
];

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

/** 基因权重横向条形图（正红负绿，A 股口径）。 */
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

/** 运行时长：完成时刻 - 开始时刻；未结束返回「进行中」。 */
function duration(a, b) {
    if (!a) return '-';
    if (!b) return '进行中';
    const t0 = new Date(a).getTime();
    const t1 = new Date(b).getTime();
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return '-';
    const s = Math.round((t1 - t0) / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

function statusTone(s) {
    const v = String(s ?? '').toUpperCase();
    if (v.includes('SUCCESS') || v.includes('DONE')) return 'down';
    if (v.includes('FAIL') || v.includes('ERROR')) return 'up';
    if (v.includes('RUN')) return 'accent';
    if (v.includes('CHAMP')) return 'accent';
    if (v.includes('RETIRE') || v.includes('DEAD')) return 'muted';
    if (v.includes('CANDID') || v.includes('SHADOW')) return 'info';
    return 'plain';
}

/** ga_run.feature_set_json → 有序特征名；顺序即染色体 w 的下标。 */
function parseFeatureNames(raw) {
    if (!raw) return [];
    try {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(arr) ? arr.map(String) : [];
    } catch { return []; }
}

function parseParams(raw) {
    if (!raw) return {};
    try {
        const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return asObject(o);
    } catch { return {}; }
}

/**
 * 解析 chromosome_json。
 * 真实结构为 {b:偏置, m:[0/1掩码], w:[权重], delta:阈值偏移}，
 * 旧实现把 b/m/w/delta 当成特征名画图，等于完全画错；这里按 w 的下标与
 * feature_set_json 对齐，只保留 m=1 的激活因子。
 */
function parseChromosome(raw, names = []) {
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch { return { genes: [], bias: null, delta: null, nActive: 0, nTotal: 0 }; }
    }
    const bias = num(obj?.b);
    const delta = num(obj?.delta);

    if (Array.isArray(obj)) {
        const genes = obj.map((x, i) => ({
            name: fmtText(x?.name ?? x?.feature ?? x?.f ?? names[i] ?? `f${i}`),
            weight: num(x?.weight ?? x?.w ?? x) || 0,
        })).filter((g) => g.weight !== 0).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
        return { genes, bias, delta, nActive: genes.length, nTotal: obj.length };
    }

    const w = Array.isArray(obj?.w) ? obj.w : null;
    const m = Array.isArray(obj?.m) ? obj.m : null;
    if (w) {
        const genes = w.map((v, i) => ({
            name: names[i] ?? `f${i}`,
            weight: num(v) || 0,
            active: m ? Number(m[i]) === 1 : true,
        })).filter((g) => g.active && g.weight !== 0)
            .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
        const nActive = m ? m.filter((x) => Number(x) === 1).length : genes.length;
        return { genes, bias, delta, nActive, nTotal: w.length };
    }

    // 兼容 {feature: weight} 直出格式
    const genes = Object.entries(obj || {})
        .filter(([k]) => !['b', 'm', 'w', 'delta'].includes(k))
        .map(([k, v]) => ({ name: k, weight: num(v && typeof v === 'object' ? v.weight : v) || 0 }))
        .filter((g) => g.weight !== 0)
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    return { genes, bias, delta, nActive: genes.length, nTotal: genes.length };
}

/** 冠军集按 versionTag 聚合：一个版本原本是 5 行（每个成员一行）。 */
function groupChampions(list) {
    const map = new Map();
    asArray(list).forEach((row) => {
        const r = asObject(row);
        const tag = String(r.versionTag ?? '');
        if (!tag) return;
        if (!map.has(tag)) {
            map.set(tag, {
                versionTag: tag, horizon: r.horizon, isCurrent: Number(r.isCurrent) === 1,
                effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
                sourceRunId: r.sourceRunId, members: [], totalWeight: 0,
            });
        }
        const g = map.get(tag);
        g.members.push({ individualId: r.individualId, rankNo: num(r.rankNo) || 0, weight: num(r.weight) || 0 });
        g.totalWeight += num(r.weight) || 0;
        if (Number(r.isCurrent) === 1) g.isCurrent = true;
    });
    return [...map.values()]
        .map((g) => ({ ...g, members: g.members.sort((a, b) => a.rankNo - b.rankNo) }))
        .sort((a, b) => (Number(b.isCurrent) - Number(a.isCurrent))
            || String(b.effectiveFrom ?? '').localeCompare(String(a.effectiveFrom ?? ''))
            || String(b.versionTag).localeCompare(String(a.versionTag)));
}

/** 适应度单元格：数值 + 细条，快速比较个体强弱。 */
function FitCell({ value }) {
    const v = num(value);
    const w = v === null ? 0 : Math.min(100, Math.max(0, v * 100));
    return (
        <div className="ga-evo-fit">
            <span className="ga-num">{fmtNum(v, 4)}</span>
            <span className="ga-evo-fit-track"><i style={{ width: `${w}%` }}/></span>
        </div>
    );
}

const range = (a, b) => (a && b ? `${a} → ${b}` : '-');

/**
 * 进化监控：运行列表（自动选中最新一条）→ 运行概要 + 收敛诊断；
 * 个体表与基因权重并排；冠军版本按版本聚合，可展开成员并回滚；
 * 底部为手动触发进化 / 回放 / 晋升。
 */
export default function EvolutionPage() {
    const [f, setF] = usePersistedState('ga:evolution:filters:v2', DEFAULT_FILTERS);
    const [indStatus, setIndStatus] = usePersistedState('ga:evolution:indStatus:v2', '');
    const [indSort, setIndSort] = usePersistedState('ga:evolution:indSort', 'fitness');
    const [selectedRunId, setSelectedRunId] = useState('');
    const [selInd, setSelInd] = useState(null);
    const [expandedVersion, setExpandedVersion] = useState('');
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
    // 与筛选无关的「最新一条」，用于 KPI，避免翻页后最新运行被误读。
    const latest = useApi(() => getEvolutionRuns({ size: 1 }), []);
    const gens = useApi(
        () => (selectedRunId ? getEvolutionGenerations({ runId: selectedRunId }) : Promise.resolve([])),
        [selectedRunId],
    );
    const individuals = useApi(
        () => (selectedRunId
            ? getIndividuals({ runId: selectedRunId, horizon: f.horizon, status: indStatus })
            : Promise.resolve([])),
        [selectedRunId, f.horizon, indStatus],
    );
    const champions = useApi(() => getChampions({ horizon: f.horizon }), [f.horizon]);

    const runData = asObject(runs.data);
    const runItems = asArray(runData.items);
    const latestRun = asArray(asObject(latest.data).items)[0] || null;
    const selectedRun = runItems.find((r) => String(r.runId) === String(selectedRunId)) || null;

    // 运行列表变化时：当前选中项不存在就自动选第一条，页面不会一进来全是空图。
    useEffect(() => {
        const items = asArray(asObject(runs.data).items);
        if (!items.length) {
            if (selectedRunId) setSelectedRunId('');
            return;
        }
        const exists = items.some((r) => String(r.runId) === String(selectedRunId));
        if (!exists) setSelectedRunId(items[0].runId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runs.data]);

    // 切换运行后清掉上一个运行的个体选择，避免基因图张冠李戴。
    useEffect(() => { setSelInd(null); }, [selectedRunId]);

    const champGroups = groupChampions(champions.data);
    const currentVersionCount = champGroups.filter((g) => g.isCurrent).length;
    const hall = asArray(individuals.data)
        .slice()
        .sort((a, b) => (num(b[indSort]) || 0) - (num(a[indSort]) || 0));

    const params = parseParams(selectedRun?.paramsJson);
    const featureNames = parseFeatureNames(selectedRun?.featureSetJson);
    const geneInfo = selInd ? parseChromosome(selInd.chromosomeJson, featureNames) : { genes: [] };
    const genes = geneInfo.genes || [];
    const genRows = asArray(gens.data);

    const reloadAll = () => {
        runs.reload();
        latest.reload();
        gens.reload();
        individuals.reload();
        champions.reload();
    };

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
    const triggerReplay = () => {
        if (!replay.from || !replay.to) {
            setMsg({ tone: 'err', text: '回放需要填写起始与结束日期' });
            return;
        }
        if (replay.from > replay.to) {
            setMsg({ tone: 'err', text: '起始日期不能晚于结束日期' });
            return;
        }
        return doAction('replay', '触发回放', () => {
            const stepVal = Number(replay.step);
            const horizons = String(replay.horizons).split(',').map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n));
            return postEvolutionReplay({
                from: replay.from, to: replay.to,
                step: Number.isFinite(stepVal) ? stepVal : replay.step,
                horizons,
            });
        });
    };
    const triggerPromote = () => {
        const rid = promoteRunId || selectedRunId;
        if (!rid) { setMsg({ tone: 'err', text: '请先选择运行或填写 runId' }); return; }
        if (!f.horizon) { setMsg({ tone: 'err', text: '晋升前请先在筛选条选择具体周期（horizon）' }); return; }
        if (!window.confirm(`确认用 runId=${rid} 晋升 H${f.horizon} 的冠军集？`)) return;
        return doAction('promote', '晋升冠军', () => postChampionPromote({ runId: rid, horizon: f.horizon }));
    };
    const triggerRollback = (g) => {
        const h = g.horizon ?? f.horizon;
        if (!h) { setMsg({ tone: 'err', text: '该版本缺少周期，无法回滚' }); return; }
        if (!window.confirm(`确认回滚到 ${g.versionTag}？当前冠军集将被替换为这个版本。`)) return;
        return doAction(`rb-${g.versionTag}`, `回滚 ${g.versionTag}`,
            () => postChampionRollback({ horizon: h, versionTag: g.versionTag }));
    };

    const latestStatus = latestRun?.status;

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="周期"><Select value={f.horizon} onChange={setFilter('horizon')} options={HORIZON_OPTIONS}/></Field>
                <Field label={<span>运行类型 <Term id="runType"/></span>}>
                    <Select value={f.runType} onChange={setFilter('runType')} options={RUN_TYPE_OPTIONS}/>
                </Field>
                <Field label={<span>个体状态 <Term id="individualStatus"/></span>}>
                    <Select value={indStatus} onChange={setIndStatus} options={IND_STATUS_OPTIONS}/>
                </Field>
                <RefreshBtn states={[runs, latest, gens, individuals, champions]}/>
            </FilterBar>

            <KpiGrid>
                <KpiCard label="运行记录" value={fmtInt(runData.total)} tone="plain"
                         hint="当前筛选下的总数" term="runId"/>
                <KpiCard label="最新运行"
                         value={latestStatus ? fmtText(latestStatus) : '-'}
                         tone={['down', 'up', 'accent'].includes(statusTone(latestStatus)) ? statusTone(latestStatus) : 'plain'}
                         hint={latestRun ? `${fmtText(latestRun.runType)} · H${fmtText(latestRun.horizon)} · ${fmtText(latestRun.asOfDate)}` : '暂无运行'}
                         term="runStatus"/>
                <KpiCard label="最新最优适应度" value={fmtNum(latestRun?.bestFitness, 4)} tone="accent"
                         hint={latestRun ? `runId ${latestRun.runId}` : '暂无运行'} term="fitness"/>
                <KpiCard label="当前冠军版本" value={fmtInt(currentVersionCount)} tone="plain"
                         hint="is_current=1 的版本数" term="championVersion"/>
            </KpiGrid>

            <Card title="进化运行记录（点选一行查看收敛诊断）" flush
                  extra={<span className="ga-muted">共 {fmtInt(runData.total)} 条</span>}>
                <AsyncPanel state={runs} isEmpty={() => false}>
                    {() => (runItems.length ? (
                        <>
                            <div className="ga-table-wrap">
                                <table className="ga-table ga-evo-runs">
                                    <thead><tr>
                                        <th><Term id="runId">runId</Term></th>
                                        <th><Term id="horizon">周期</Term></th>
                                        <th><Term id="runType">类型</Term></th>
                                        <th>基准日</th>
                                        <th><Term id="generation">代数</Term></th>
                                        <th><Term id="fitness">最优适应度</Term></th>
                                        <th>用时</th>
                                        <th><Term id="runStatus">状态</Term></th>
                                        <th>异常</th>
                                    </tr></thead>
                                    <tbody>
                                    {runItems.map((row) => {
                                        const r = asObject(row);
                                        const on = String(selectedRunId) === String(r.runId);
                                        return (
                                            <tr key={r.runId}
                                                className="ga-row-link ga-picks-row"
                                                style={on ? { background: '#eaf1ff' } : undefined}
                                                title={r.errorMsg ? `错误：${r.errorMsg}` : r.warnMsg ? `告警：${r.warnMsg}` : '点击查看收敛诊断'}
                                                onClick={() => setSelectedRunId(r.runId)}>
                                                <td className="ga-mono">{fmtText(r.runId)}</td>
                                                <td>H{fmtText(r.horizon)}</td>
                                                <td>{fmtText(r.runType)}</td>
                                                <td>{fmtText(r.asOfDate)}</td>
                                                <td className="ga-num">{fmtInt(r.generationsDone)}</td>
                                                <td className="ga-num">{fmtNum(r.bestFitness, 4)}</td>
                                                <td className="ga-num">{duration(r.startedAt, r.finishedAt)}</td>
                                                <td><Badge tone={statusTone(r.status)}>{fmtText(r.status)}</Badge></td>
                                                <td>
                                                    {r.errorMsg ? <Badge tone="up" title={r.errorMsg}>错误</Badge>
                                                        : r.warnMsg ? <Badge tone="warn" title={r.warnMsg}>告警</Badge>
                                                            : <span className="ga-muted">—</span>}
                                                </td>
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
                    ) : <Empty text="当前筛选下没有运行记录"/>)}
                </AsyncPanel>
            </Card>

            {selectedRun ? (
                <Card title={<span>运行概要 <span className="ga-mono">runId {fmtText(selectedRun.runId)}</span></span>}
                      extra={<Badge tone={statusTone(selectedRun.status)}>{fmtText(selectedRun.status)}</Badge>}>
                    <div className="ga-run-summary">
                        <div><span>训练窗口</span><b>{range(selectedRun.trainStart, selectedRun.trainEnd)}</b></div>
                        <div><span>验证窗口</span><b>{range(selectedRun.validStart, selectedRun.validEnd)}</b></div>
                        <div><span>Hold-out 窗口</span><b>{range(selectedRun.holdoutStart, selectedRun.holdoutEnd)}</b></div>
                        <div><span>种群 / 最大代数</span><b>{fmtInt(selectedRun.popSize)} / {fmtText(params.gen)}</b></div>
                        <div><span>样本 / 折数</span><b>{fmtInt(params.samples)} / {fmtText(params.folds)}</b></div>
                        <div><span>最优个体 / 种子</span><b>{fmtText(selectedRun.bestIndividualId)} / {fmtText(selectedRun.randomSeed)}</b></div>
                    </div>
                </Card>
            ) : null}

            <Card title="收敛诊断"
                  extra={selectedRunId
                      ? <Badge tone="accent"><Term id="runId">runId</Term> {fmtText(selectedRunId)}</Badge>
                      : <span className="ga-muted">请先在上方列表点选一行</span>}>
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

            <div className="ga-grid-2 ga-evo-body">
                <Card title={selectedRunId ? `本运行个体（runId ${fmtText(selectedRunId)}）` : '个体（请先选择运行）'}
                      flush
                      extra={
                          <div className="ga-row">
                              <span className="ga-muted">共 {fmtInt(hall.length)} 条</span>
                              <Select value={indSort} onChange={setIndSort} options={IND_SORT_OPTIONS}/>
                          </div>
                      }>
                    <AsyncPanel state={individuals} isEmpty={(d) => asArray(d).length === 0} emptyText="暂无个体记录">
                        {() => (
                            <div className="ga-table-wrap ga-evo-hall">
                                <table className="ga-table">
                                    <thead><tr>
                                        <th>个体</th><th><Term id="generation">代</Term></th>
                                        <th><Term id="fitness">适应度</Term></th><th><Term id="fitTrain">训练</Term></th>
                                        <th><Term id="fitValid">验证</Term></th><th><Term id="BalAcc">BalAcc</Term></th>
                                        <th><Term id="IC">IC</Term></th><th><Term id="coverageValid">覆盖</Term></th>
                                        <th><Term id="Brier">Brier</Term></th><th><Term id="individualStatus">状态</Term></th>
                                        <th>激活</th>
                                    </tr></thead>
                                    <tbody>
                                    {hall.map((row) => {
                                        const r = asObject(row);
                                        const on = selInd === row;
                                        return (
                                            <tr key={r.individualId} className="ga-row-link ga-picks-row"
                                                style={on ? { background: '#eaf1ff' } : undefined}
                                                title={r.retireReason ? `退役原因：${r.retireReason}` : '点击查看基因权重'}
                                                onClick={() => setSelInd(row)}>
                                                <td className="ga-mono">{fmtText(r.individualId)}</td>
                                                <td className="ga-num">{fmtInt(r.generation)}</td>
                                                <td><FitCell value={r.fitness}/></td>
                                                <td className="ga-num">{fmtNum(r.fitTrain, 4)}</td>
                                                <td className="ga-num">{fmtNum(r.fitValid, 4)}</td>
                                                <td className="ga-num">{fmtNum(r.balaccValid, 3)}</td>
                                                <td className="ga-num">{fmtNum(r.icValid, 3)}</td>
                                                <td className="ga-num">{fmtNum(r.coverageValid, 3)}</td>
                                                <td className="ga-num">{fmtNum(r.brierValid, 3)}</td>
                                                <td><Badge tone={statusTone(r.status)}>{fmtText(r.status)}</Badge></td>
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

                <Card title="基因权重（选中个体）"
                      extra={selInd
                          ? <span className="ga-muted">个体 {fmtText(selInd.individualId)} · 代 {fmtText(selInd.generation)}</span>
                          : null}>
                    {genes.length ? (
                        <>
                            <GaChart option={genesOption(genes)} height={320}/>
                            <div className="ga-gene-meta">
                                <span>激活因子 <b>{fmtInt(geneInfo.nActive)}/{fmtInt(geneInfo.nTotal)}</b></span>
                                <span>偏置 b <b>{fmtNum(geneInfo.bias, 4)}</b></span>
                                <span>阈值偏移 δ <b>{fmtNum(geneInfo.delta, 4)}</b></span>
                                <span>按 |权重| 取前 {Math.min(30, genes.length)} 个</span>
                            </div>
                        </>
                    ) : <Empty text="请在下表点选一行以查看基因权重"/>}
                </Card>
            </div>

            <Card title="冠军版本对比与回滚"
                  extra={<span className="ga-muted">共 {fmtInt(champGroups.length)} 个版本 · 点击行展开成员</span>}>
                <AsyncPanel state={champions} isEmpty={(d) => asArray(d).length === 0} emptyText="暂无冠军版本">
                    {() => (
                        <div className="ga-table-wrap">
                            <table className="ga-table ga-champ-table">
                                <thead><tr>
                                    <th>版本</th><th>周期</th><th>成员</th><th>总权重</th><th>状态</th>
                                    <th>生效起</th><th>生效止</th><th>来源运行</th><th>操作</th>
                                </tr></thead>
                                <tbody>
                                {champGroups.map((g) => (
                                    <Fragment key={g.versionTag}>
                                        <tr className="ga-row-link ga-picks-row"
                                            onClick={() => setExpandedVersion(expandedVersion === g.versionTag ? '' : g.versionTag)}
                                            title="点击展开成员">
                                            <td className="ga-mono">{fmtText(g.versionTag)}</td>
                                            <td>H{fmtText(g.horizon)}</td>
                                            <td className="ga-num">{fmtInt(g.members.length)}</td>
                                            <td className="ga-num">{fmtNum(g.totalWeight, 3)}</td>
                                            <td>{g.isCurrent ? <Badge tone="accent">当前</Badge> : <Badge tone="muted">历史</Badge>}</td>
                                            <td>{fmtText(g.effectiveFrom)}</td>
                                            <td>{fmtText(g.effectiveTo)}</td>
                                            <td className="ga-mono">{fmtText(g.sourceRunId)}</td>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <Btn sm disabled={g.isCurrent}
                                                     loading={busy === `rb-${g.versionTag}`}
                                                     loadingText="回滚中…"
                                                     onClick={() => triggerRollback(g)}>
                                                    {g.isCurrent ? '当前版本' : '回滚'}
                                                </Btn>
                                            </td>
                                        </tr>
                                        {expandedVersion === g.versionTag ? (
                                            <tr>
                                                <td colSpan={9}>
                                                    <div className="ga-champ-members">
                                                        {g.members.map((m) => (
                                                            <span key={`${m.rankNo}-${m.individualId}`} className="ga-champ-member">
                                                                #{fmtInt(m.rankNo)}
                                                                <b>{fmtNum(m.weight, 3)}</b>
                                                                <span className="ga-mono ga-muted">{fmtText(m.individualId)}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : null}
                                    </Fragment>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </AsyncPanel>
            </Card>

            <Card title="手动操作（周期取自上方筛选条）">
                <div className="ga-stack">
                    <div>
                        <div className="ga-section-title">触发进化</div>
                        <div className="ga-inline-form">
                            <Badge tone="info"><Term id="horizon">horizon</Term> = {f.horizon || '全部'}</Badge>
                            <Btn variant="primary" loading={busy === 'run'} loadingText="提交中…"
                                 onClick={triggerRun}>触发进化</Btn>
                            {!f.horizon ? <span className="ga-muted">horizon 为空会依次跑全部周期，耗时较长。</span> : null}
                        </div>
                    </div>

                    <hr className="ga-hr"/>

                    <div>
                        <div className="ga-section-title">历史回放</div>
                        <div className="ga-inline-form">
                            <Field label="起始"><Input type="date" value={replay.from} onChange={(v) => setReplay((p) => ({ ...p, from: v }))}/></Field>
                            <Field label="结束"><Input type="date" value={replay.to} onChange={(v) => setReplay((p) => ({ ...p, to: v }))}/></Field>
                            <Field label="步长" hint="交易日"><Input type="number" min="1" value={replay.step} onChange={(v) => setReplay((p) => ({ ...p, step: v }))}/></Field>
                            <Field label="周期列表" hint="逗号分隔">
                                <Input className="ga-input--wide" value={replay.horizons}
                                       onChange={(v) => setReplay((p) => ({ ...p, horizons: v }))}/>
                            </Field>
                            <Btn loading={busy === 'replay'} loadingText="提交中…"
                                 onClick={triggerReplay}>触发回放</Btn>
                        </div>
                    </div>

                    <hr className="ga-hr"/>

                    <div>
                        <div className="ga-section-title">晋升冠军</div>
                        <div className="ga-inline-form">
                            <Field label={<span><Term id="runId">runId</Term> 运行编号</span>} hint="留空用当前选中运行">
                                <Input className="ga-input--wide" value={promoteRunId} onChange={setPromoteRunId}
                                       placeholder={selectedRunId ? String(selectedRunId) : '填写 runId'}/>
                            </Field>
                            <Btn loading={busy === 'promote'} loadingText="提交中…"
                                 disabled={!f.horizon} onClick={triggerPromote}>晋升冠军</Btn>
                            {!f.horizon ? <span className="ga-muted">请先选择具体周期，晋升接口必须带 horizon。</span> : null}
                        </div>
                    </div>

                    {msg ? <div className={`ga-note ga-note--${msg.tone}`}>{msg.text}</div> : null}
                </div>
            </Card>
        </div>
    );
}
