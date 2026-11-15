/** 页面 3：可靠性与复盘。校准曲线、样本外指标趋势、分位覆盖、VaR 检验、方法择优、基准对比。 */
import { useMemo, useState } from 'react';
import EChart from '../components/EChart.jsx';
import { useApi } from '../hooks/useApi.js';
import { getCalibration, getMetricSeries, getMethods, getMetrics } from './api.js';
import F from './FormulaTerm.jsx';
import { PAsync, PBadge, PBar, PBtn, PCard, PField, PKpi, PSelect } from './ProbParts.jsx';
import { asArray, dateStr, num, pct } from './format.js';

const HORIZONS = [1, 3, 5, 10];
const KEY_METRICS = [
    { key: 'Brier', label: 'Brier', fmt: (v) => num(v, 4), hint: '越小越好' },
    { key: 'BSS', label: 'BSS', fmt: (v) => num(v, 4), hint: '>0 才有样本外优势' },
    { key: 'AUC', label: 'AUC', fmt: (v) => num(v, 4), hint: '横截面日均' },
    { key: 'ECE', label: 'ECE', fmt: (v) => num(v, 4), hint: '校准误差' },
    { key: 'RankIC', label: 'Rank IC', fmt: (v) => num(v, 4), hint: '期望收益排序能力' },
    { key: 'interval_coverage', label: 'q05–q95 覆盖率', fmt: (v) => pct(v), hint: '名义 90%' },
    { key: 'var95_breach', label: 'VaR95 突破率', fmt: (v) => pct(v), hint: '名义 5%' },
    { key: 'kupiec_pvalue', label: 'Kupiec p 值', fmt: (v) => num(v, 4), hint: '过小说明低估风险' },
];

function CalibrationOption(items) {
    const xs = items.map((b) => `${(Number(b.bin_low) * 100).toFixed(0)}–${(Number(b.bin_high) * 100).toFixed(0)}%`);
    return {
        tooltip: { trigger: 'axis' },
        legend: { data: ['实际上涨频率', '预测概率均值', '理想校准'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 52, right: 16, top: 18, bottom: 46 },
        xAxis: { type: 'category', data: xs, axisLabel: { fontSize: 10, rotate: 30 }, name: '预测概率分箱' },
        yAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v) => `${(v * 100).toFixed(0)}%` },
                 splitLine: { lineStyle: { opacity: 0.35 } } },
        series: [
            { name: '样本数', type: 'bar', data: items.map((b) => Number(b.n || 0)), yAxisIndex: 0,
              itemStyle: { color: 'rgba(47,111,237,0.10)' }, silent: true, barWidth: '55%' },
            { name: '实际上涨频率', type: 'line', data: items.map((b) => Number(b.freq_up)),
              symbolSize: 7, lineStyle: { width: 2, color: '#d8392b' }, itemStyle: { color: '#d8392b' } },
            { name: '预测概率均值', type: 'line', data: items.map((b) => Number(b.mean_pred)),
              symbolSize: 6, lineStyle: { width: 2, type: 'dashed', color: '#2f6fed' }, itemStyle: { color: '#2f6fed' } },
            { name: '理想校准', type: 'line', data: items.map((b) => (Number(b.bin_low) + Number(b.bin_high)) / 2),
              symbol: 'none', lineStyle: { width: 1, type: 'dotted', color: '#9aa3af' } },
        ],
    };
}

function SeriesOption(items) {
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 18, top: 20, bottom: 40 },
        xAxis: { type: 'category', data: items.map((r) => dateStr(r.eval_date).slice(5)) },
        yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { opacity: 0.35 } } },
        series: [{ name: '指标值', type: 'line', data: items.map((r) => Number(r.value)),
                   symbolSize: 7, lineStyle: { width: 2, color: '#2f6fed' },
                   areaStyle: { color: 'rgba(47,111,237,0.12)' } }],
    };
}

export default function EvalPanel({ refreshKey }) {
    const [h, setH] = useState(1);
    const [metric, setMetric] = useState('Brier');
    const [scope, setScope] = useState('');
    const metrics = useApi(() => getMetrics({ horizon: h }), [h, refreshKey]);
    const calib = useApi(() => getCalibration({ horizon: h }), [h, refreshKey]);
    const methods = useApi(() => getMethods({ horizon: h }), [h, refreshKey]);
    const series = useApi(() => getMetricSeries({ metric, horizon: h }), [metric, h, refreshKey]);

    const items = asArray(metrics.data);
    const calibItems = asArray(calib.data);
    const methodItems = asArray(methods.data);
    const seriesItems = asArray(series.data);
    const pick = (name, model = 'M10', sc = 'ALL') =>
        items.find((r) => r.metric_name === name && r.model_name === model && r.scope === sc)?.value;
    const allScopes = [...new Set(items.map((r) => String(r.scope)))].sort();
    const shown = scope ? items.filter((r) => r.scope === scope) : items;
    const calOption = useMemo(() => calibItems.length ? CalibrationOption(calibItems) : null, [calibItems]);
    const serOption = useMemo(() => seriesItems.length ? SeriesOption(seriesItems) : null, [seriesItems]);
    const bss = pick('BSS');
    const bssRow = items.find((r) => r.metric_name === 'BSS' && r.model_name === 'M10' && r.scope === 'ALL');

    return (
        <>
            <PCard title="样本外可靠性" extra={<span className="prob-muted">评估日 {dateStr(metrics.data?.evalDate)}</span>}>
                <PBar>
                    <PField label="预测周期">
                        <PSelect value={h} onChange={(v) => setH(Number(v))}
                                 options={HORIZONS.map((x) => ({ value: x, label: `${x} 个交易日` }))}/>
                    </PField>
                    <PField label="指标趋势">
                        <PSelect value={metric} onChange={setMetric}
                                 options={KEY_METRICS.map((m) => ({ value: m.key, label: m.label }))}/>
                    </PField>
                    <PBtn onClick={() => { metrics.reload(); calib.reload(); methods.reload(); series.reload(); }}>刷新</PBtn>
                </PBar>
                <div className="ga-kpi-grid">
                    {KEY_METRICS.map((k) => {
                        const v = pick(k.key);
                        return <PKpi key={k.key} label={<F id={k.key === 'Brier' || k.key === 'BSS' ? 'brier_bss' :
                            k.key === 'ECE' ? 'ece' : k.key === 'RankIC' ? 'rank_ic' :
                            k.key === 'kupiec_pvalue' ? 'kupiec' : 'coverage'}>{k.label}</F>}
                                     value={v == null ? '—' : k.fmt(v)} hint={k.hint}
                                     tone={k.key === 'BSS' ? (Number(v) > 0 ? 'down' : 'up') : 'plain'}/>;
                    })}
                </div>
                <div className={`prob-grade-note ${Number(bss) > 0 ? 'is-ok' : 'is-warn'}`}>
                    <F id="grade">可靠性评级</F>：
                    {Number(bss) > 0
                        ? `本周期 BSS=${num(bss, 4)} > 0，模型相对基础上涨率有样本外优势；bootstrap 95% 下界 ${num(bssRow?.ci_low, 4)}。`
                        : `本周期 BSS=${num(bss, 4)} ≤ 0，无样本外预测优势，界面已如实标注为 C/D 级。`}
                    {' '}验收口径以「概率是否校准良好、是否不劣于基准、覆盖率是否合格」为准，而不是胜率或 AUC 高低。
                </div>
            </PCard>

            <div className="prob-grid-2">
                <PCard title="校准曲线" extra={<F id="ece">10 等分箱</F>}>
                    <EChart option={calOption} height={290} empty={!calOption} emptyText="暂无校准分箱数据"/>
                    <p className="prob-note">蓝虚线是箱内平均预测概率，红线是实际上涨频率，灰点线是理想校准。越贴近灰线越好；柱形为该箱样本数。</p>
                </PCard>
                <PCard title="指标时间趋势" extra={<F id="brier_bss">{metric}</F>}>
                    <EChart option={serOption} height={290} empty={!serOption} emptyText="暂无趋势数据"/>
                    <p className="prob-note">每次评估写一行；运行多天后会形成时间序列。当前数据主要来自同一评估日的分周期、分范围结果。</p>
                </PCard>
            </div>

            <div className="prob-grid-2">
                <PCard title="与基准对比（Brier）" extra={<F id="brier_bss">B0 / B1 / B2</F>}>
                    <div className="ga-table-wrap">
                        <table className="ga-table prob-table">
                            <thead><tr><th>模型</th><th>Brier</th><th>相对 M10</th><th>说明</th></tr></thead>
                            <tbody>
                                {items.filter((r) => r.metric_name === 'Brier' && r.scope === 'ALL')
                                    .map((r) => {
                                        const base = pick('Brier');
                                        const d = base == null || r.value == null ? null : Number(r.value) - Number(base);
                                        return (
                                            <tr key={r.model_name}>
                                                <td><b>{r.model_name}</b></td>
                                                <td>{num(r.value, 5)}</td>
                                                <td className={`ga-tone-${d == null ? 'plain' : (d > 0 ? 'up' : 'down')}`}>
                                                    {d == null ? '—' : (d > 0 ? '+' : '') + num(d, 5)}
                                                </td>
                                                <td className="prob-small">
                                                    {r.model_name === 'B0' ? '训练期基础上涨率（常数概率）' :
                                                     r.model_name === 'B1' ? '正态分布基线' :
                                                     r.model_name === 'B2' ? '随机游走 p=0.5' :
                                                     r.model_name === 'M10' ? '融合校准后的最终输出' : '单模型候选'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </PCard>
                <PCard title="方法择优结果" extra={<F id="method_choice">每 20 日重评</F>}>
                    <PAsync state={methods} isEmpty={() => !methodItems.length} emptyText="暂无择优结果">
                        {() => (
                            <div className="ga-table-wrap prob-scroll-260">
                                <table className="ga-table prob-table">
                                    <thead><tr><th>输出</th><th>选中方法</th><th>样本外得分</th><th>候选对比</th></tr></thead>
                                    <tbody>
                                        {methodItems.map((r, i) => (
                                            <tr key={`${r.output_name}-${i}`}>
                                                <td><code>{r.output_name}</code></td>
                                                <td><PBadge tone="accent">{r.selected_method}</PBadge></td>
                                                <td>{num(r.score, 5)}</td>
                                                <td className="prob-small">
                                                    {Object.entries(r.candidates_json || {})
                                                        .filter(([, v]) => typeof v === 'number')
                                                        .map(([k, v]) => `${k}=${num(v, 4)}`).join(' · ')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </PAsync>
                </PCard>
            </div>

            <PCard title="全部评估指标" extra={<PSelect value={scope} onChange={setScope}
                options={[{ value: '', label: '全部范围' }, ...allScopes.map((s) => ({ value: s, label: s }))]}/>}>
                <PAsync state={metrics} isEmpty={() => !shown.length} emptyText="暂无评估指标，请先运行日常任务">
                    {() => (
                        <div className="ga-table-wrap prob-scroll-360">
                            <table className="ga-table prob-table">
                                <thead><tr><th>范围</th><th>模型</th><th>指标</th><th>值</th><th>基准</th>
                                    <th>差异</th><th>CI 下界</th><th>CI 上界</th><th>样本数</th></tr></thead>
                                <tbody>
                                    {shown.map((r, i) => (
                                        <tr key={`${r.scope}-${r.model_name}-${r.metric_name}-${i}`}>
                                            <td className="prob-small">{r.scope}</td>
                                            <td>{r.model_name}</td>
                                            <td><F id="brier_bss">{r.metric_name}</F></td>
                                            <td><b>{num(r.value, 5)}</b></td>
                                            <td>{r.base_value == null ? '—' : num(r.base_value, 5)}</td>
                                            <td>{r.delta == null ? '—' : num(r.delta, 5)}</td>
                                            <td>{r.ci_low == null ? '—' : num(r.ci_low, 5)}</td>
                                            <td>{r.ci_high == null ? '—' : num(r.ci_high, 5)}</td>
                                            <td>{Number(r.n_samples || 0).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </PAsync>
                <p className="prob-note">指标按全市场（ALL）、分月（MONTH:YYYY-MM）、波动分组（BUCKET:low_vol / high_vol）分别输出；
                    BSS 的置信区间用按交易日 block bootstrap（block 长度 = h，因为多日标签重叠）。<F id="coverage"/></p>
            </PCard>
        </>
    );
}
