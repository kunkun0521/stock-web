import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import {
    getAnalysisBuckets, getAnalysisReliability, getAnalysisConfusion,
    getAnalysisTopErrors, getAnalysisQuantile,
} from './api.js';
import {
    UP, DOWN, MUTED, ACCENT, HORIZON_OPTIONS, DIM_OPTIONS,
    asArray, asObject, num, fmtRate, fmtNum, fmtInt, fmtText, formatPct,
} from './gaUtils.js';
import GaChart from './GaChart.jsx';
import Term from './GlossaryTerm.jsx';
import {
    FilterBar, Field, Select, Input, Btn, GaTabs, AsyncPanel, Badge,
} from './GaParts.jsx';

const TABS = [
    { value: 'buckets', label: '分桶命中率' },
    { value: 'reliability', label: '可靠性曲线' },
    { value: 'confusion', label: '混淆矩阵' },
    { value: 'errors', label: '高置信错误 Top20' },
    { value: 'quantile', label: '分层回测' },
];
const DEFAULT_FILTERS = { horizon: '', from: '', to: '' };
const AXIS_LINE = { lineStyle: { color: '#e6e8eb' } };
const SPLIT_LINE = { lineStyle: { color: '#f0f1f3' } };
const LEGEND = { top: 0, left: 4, textStyle: { color: MUTED, fontSize: 11 }, itemWidth: 12, itemHeight: 8 };
const PERCENT_Y = () => ({ type: 'value', min: 0, max: 1, axisLabel: { color: MUTED, formatter: (v) => `${(v * 100).toFixed(0)}%` }, splitLine: SPLIT_LINE });

/** 分桶命中率柱 + 样本数折线（第二坐标轴）。 */
function bucketsOption(rows) {
    const r = asArray(rows);
    return {
        animation: false,
        tooltip: { trigger: 'axis' },
        legend: { ...LEGEND, data: ['命中率', '样本数'] },
        grid: { left: 48, right: 56, top: 28, bottom: 42 },
        xAxis: { type: 'category', data: r.map((x) => fmtText(x.bucket)), axisLabel: { color: MUTED, fontSize: 10, rotate: 20 }, axisLine: AXIS_LINE },
        yAxis: [PERCENT_Y(), { type: 'value', name: '样本', nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel: { color: MUTED }, splitLine: { show: false } }],
        series: [
            {
                name: '命中率', type: 'bar', barMaxWidth: 30,
                data: r.map((x) => ({ value: num(x.hitRate), itemStyle: { color: num(x.hitRate) >= 0.5 ? ACCENT : '#9aa6b8', borderRadius: [3, 3, 0, 0] } })),
            },
            {
                name: '样本数', type: 'line', yAxisIndex: 1, smooth: true,
                data: r.map((x) => num(x.n)), lineStyle: { color: '#e8a33d', width: 1.6 }, itemStyle: { color: '#e8a33d' },
            },
        ],
    };
}

/** 可靠性曲线：实际命中率 vs 理想校准（预测概率），配对角参考。 */
function reliabilityOption(data) {
    const pts = asArray(asObject(data).points);
    return {
        animation: false,
        tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '-' : fmtRate(v)) },
        legend: { ...LEGEND, data: ['实际命中率', '理想校准'] },
        grid: { left: 48, right: 16, top: 28, bottom: 28 },
        xAxis: { type: 'category', data: pts.map((p) => fmtText(p.bin)), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: PERCENT_Y(),
        series: [
            {
                name: '实际命中率', type: 'line', smooth: true,
                data: pts.map((p) => num(p.actualRate)), lineStyle: { color: ACCENT, width: 2 }, itemStyle: { color: ACCENT },
            },
            {
                name: '理想校准', type: 'line', smooth: true,
                data: pts.map((p) => num(p.avgProb)), lineStyle: { color: MUTED, type: 'dashed', width: 1 }, itemStyle: { color: MUTED },
            },
        ],
    };
}

/** 分层回测：平均收益柱（涨红跌绿）+ 累计价差折线。 */
function quantileOption(data) {
    const g = asArray(asObject(data).groups);
    let acc = 0;
    const cum = g.map((x) => { acc += num(x.avgRet) || 0; return acc; });
    return {
        animation: false,
        tooltip: { trigger: 'axis' },
        legend: { ...LEGEND, data: ['平均收益', '累计价差'] },
        grid: { left: 48, right: 56, top: 28, bottom: 28 },
        xAxis: { type: 'category', data: g.map((x) => fmtText(x.group)), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: [
            { type: 'value', name: '收益%', nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel: { color: MUTED }, splitLine: SPLIT_LINE },
            { type: 'value', name: '累计', nameTextStyle: { color: MUTED, fontSize: 10 }, axisLabel: { color: MUTED }, splitLine: { show: false } },
        ],
        series: [
            {
                name: '平均收益', type: 'bar', barMaxWidth: 30,
                data: g.map((x) => ({ value: num(x.avgRet), itemStyle: { color: (num(x.avgRet) || 0) >= 0 ? UP : DOWN } })),
            },
            {
                name: '累计价差', type: 'line', yAxisIndex: 1, smooth: true,
                data: cum, lineStyle: { color: ACCENT, width: 1.8 }, itemStyle: { color: ACCENT },
            },
        ],
    };
}

/** 混淆矩阵单元格底色：数值越大蓝越深。 */
function confusionColor(v, max) {
    const n = num(v) || 0;
    const a = max > 0 ? 0.08 + 0.62 * (n / max) : 0.08;
    return `rgba(47,111,237,${a.toFixed(2)})`;
}

/** 高置信错误 explain 字段可能是数组/对象/字符串，统一转成可读文本。 */
function explainText(e) {
    if (Array.isArray(e)) return e.map((x) => `${fmtText(x?.f)}:${fmtNum(x?.c, 2)}`).join('、');
    if (e && typeof e === 'object') return Object.entries(e).map(([k, v]) => `${k}:${fmtText(v)}`).join('、');
    return e == null ? '-' : String(e);
}

/**
 * 错误分析：5 个标签页共用周期/日期筛选，切换标签时只拉对应接口。
 * 覆盖分桶、可靠性、混淆矩阵、高置信错误、分层回测五类诊断。
 */
export default function AnalysisPage() {
    const [f, setF] = usePersistedState('ga:analysis:filters', DEFAULT_FILTERS);
    const [tab, setTab] = usePersistedState('ga:analysis:tab', 'buckets');
    const [dim, setDim] = usePersistedState('ga:analysis:dim', 'vol');
    const [topN, setTopN] = usePersistedState('ga:analysis:topN', '20');
    const set = (key) => (v) => setF((prev) => ({ ...prev, [key]: v }));

    const base = { horizon: f.horizon, from: f.from, to: f.to };
    const main = useApi(() => {
        switch (tab) {
            case 'buckets': return getAnalysisBuckets({ ...base, dim });
            case 'reliability': return getAnalysisReliability(base);
            case 'confusion': return getAnalysisConfusion(base);
            case 'errors': return getAnalysisTopErrors({ horizon: f.horizon, topN });
            case 'quantile': return getAnalysisQuantile(base);
            default: return Promise.resolve(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, f.horizon, f.from, f.to, dim, topN]);

    const isEmpty = (d) => {
        if (tab === 'buckets' || tab === 'errors') return asArray(d).length === 0;
        if (tab === 'confusion') return asArray(asObject(d).matrix).length === 0;
        if (tab === 'reliability') return asArray(asObject(d).points).length === 0;
        if (tab === 'quantile') return asArray(asObject(d).groups).length === 0;
        return !d;
    };

    const renderTab = (d) => {
        if (tab === 'buckets') {
            return (
                <>
                    <div className="ga-row" style={{ marginBottom: 8 }}>
                        <span className="ga-muted">分桶维度</span>
                        <Select value={dim} onChange={setDim} options={DIM_OPTIONS}/>
                    </div>
                    <GaChart option={bucketsOption(d)} height={320}/>
                </>
            );
        }
        if (tab === 'reliability') {
            const rel = asObject(d);
            return (
                <>
                    <div className="ga-row" style={{ marginBottom: 8 }}>
                        <Badge tone="accent">ECE（校准误差） {fmtNum(rel.ece, 4)}</Badge>
                        <Term id="ECE">ECE</Term>
                        <span className="ga-muted">越接近 0 表示预测概率越可信；超 0.05 建议跑 CalibrateJob</span>
                    </div>
                    <GaChart option={reliabilityOption(rel)} height={320}/>
                </>
            );
        }
        if (tab === 'confusion') {
            const conf = asObject(d);
            const matrix = asArray(conf.matrix);
            const labels = asArray(conf.labels);
            const labelAt = (i) => (labels[i] !== undefined ? fmtText(labels[i]) : `类别${i + 1}`);
            const max = Math.max(0, ...matrix.flatMap((row) => asArray(row).map((v) => num(v) || 0)));
            return (
                <div className="ga-table-wrap">
                    <table className="ga-heat-table">
                        <thead>
                        <tr><th>预测 / 实际</th>{matrix.map((_, j) => <th key={j}>{labelAt(j)}</th>)}</tr>
                        </thead>
                        <tbody>
                        {matrix.map((row, i) => (
                            <tr key={i}>
                                <td className="ga-heat-rowhead">{labelAt(i)}</td>
                                {asArray(row).map((v, j) => (
                                    <td key={j} style={{ background: confusionColor(v, max) }}>{fmtInt(v)}</td>
                                ))}
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            );
        }
        if (tab === 'errors') {
            return (
                <>
                    <div className="ga-row" style={{ marginBottom: 8 }}>
                        <Term id="TopN">Top N</Term>
                        <Input type="number" min="1" max="100" value={topN} onChange={setTopN}/>
                    </div>
                    <div className="ga-table-wrap">
                        <table className="ga-table">
                            <thead><tr>
                                <th>代码</th><th>交易日</th><th><Term id="horizon">周期</Term></th><th><Term id="probUp">上涨概率</Term></th>
                                <th><Term id="confidence">置信度</Term></th><th><Term id="actualReturn">真实收益</Term></th><th><Term id="explain">主要解释</Term></th>
                            </tr></thead>
                            <tbody>
                            {asArray(d).map((e, i) => (
                                <tr key={i}>
                                    <td className="ga-mono">{fmtText(e.code)}</td>
                                    <td>{fmtText(e.tradeDate)}</td>
                                    <td>{fmtText(e.horizon)}</td>
                                    <td className="ga-num">{fmtRate(e.probUp)}</td>
                                    <td className="ga-num">{fmtRate(e.confidence)}</td>
                                    <td className="ga-num">{formatPct(e.actualReturn)}</td>
                                    <td className="ga-wrap ga-mono">{explainText(e.explain)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </>
            );
        }
        // quantile
        const q = asObject(d);
        return (
            <>
                <div className="ga-row" style={{ marginBottom: 8 }}>
                    <Badge tone="info">单调性 {fmtNum(q.monotonicity, 3)}</Badge>
                    <Badge tone="info">多空价差 {fmtNum(q.spread, 3)}</Badge>
                    <Term id="monotonicity">单调性</Term>
                    <Term id="spread">多空价差</Term>
                    <Term id="quantile">分层回测</Term>
                </div>
                <GaChart option={quantileOption(q)} height={320}/>
            </>
        );
    };

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="周期"><Select value={f.horizon} onChange={set('horizon')} options={HORIZON_OPTIONS}/></Field>
                <Field label="起始日期"><Input type="date" value={f.from} onChange={set('from')}/></Field>
                <Field label="结束日期"><Input type="date" value={f.to} onChange={set('to')}/></Field>
                <Btn variant="primary" onClick={main.reload}>刷新</Btn>
            </FilterBar>

            <div className="ga-card">
                <GaTabs items={TABS} value={tab} onChange={setTab}/>
                <div className="ga-card-body">
                    <AsyncPanel state={main} isEmpty={isEmpty} emptyText="当前条件下暂无分析数据">
                        {(d) => renderTab(d)}
                    </AsyncPanel>
                </div>
            </div>
        </div>
    );
}
