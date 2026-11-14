import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getFactorsIc } from './api.js';
import {
    UP, MUTED, ACCENT, HORIZONS, asArray, num, fmtNum, fmtText,
} from './gaUtils.js';
import GaChart from './GaChart.jsx';
import Term from './GlossaryTerm.jsx';
import { Card, FilterBar, Field, Input, AsyncPanel, Empty, RefreshBtn } from './GaParts.jsx';

const DEFAULT_FILTERS = { days: '60' };
const SPLIT_LINE = { lineStyle: { color: '#f0f1f3' } };
const AXIS_LINE = { lineStyle: { color: '#e6e8eb' } };

/** ic60 着色：正红负绿，绝对值越大越深（A 股涨红跌绿）。 */
function icColor(v) {
    const n = num(v);
    if (n === null) return '#f7f8fa';
    const a = Math.min(0.7, 0.1 + Math.abs(n) * 2.5);
    return n >= 0 ? `rgba(216,57,43,${a.toFixed(2)})` : `rgba(23,146,78,${a.toFixed(2)})`;
}

/** decayFlag 兼容布尔、1、'true'、'DECAY' 等写法。 */
function isDecay(flag) {
    return flag === true || flag === 1 || /^(1|true|yes|y|decay|衰减)$/i.test(String(flag ?? ''));
}

/** 单因子跨周期 ic20 / ic60 序列折线。 */
function factorSeriesOption(rec) {
    return {
        animation: false,
        tooltip: { trigger: 'axis' },
        legend: { top: 0, left: 4, textStyle: { color: MUTED, fontSize: 11 }, data: ['近 20 日 IC', '近 60 日 IC'] },
        grid: { left: 48, right: 16, top: 28, bottom: 26 },
        xAxis: { type: 'category', data: HORIZONS.map((h) => `${h} 日`), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: { type: 'value', axisLabel: { color: MUTED }, splitLine: SPLIT_LINE },
        series: [
            {
                name: '近 20 日 IC', type: 'line', smooth: true,
                data: HORIZONS.map((h) => num(rec[h]?.ic20)),
                lineStyle: { width: 1.6, color: '#e8a33d' }, itemStyle: { color: '#e8a33d' },
            },
            {
                name: '近 60 日 IC', type: 'line', smooth: true,
                data: HORIZONS.map((h) => num(rec[h]?.ic60)),
                lineStyle: { width: 1.8, color: ACCENT }, itemStyle: { color: ACCENT },
                markLine: {
                    silent: true, symbol: 'none', lineStyle: { color: MUTED, type: 'dashed', width: 1 },
                    data: [{ yAxis: 0 }],
                },
            },
        ],
    };
}

/**
 * 因子体检：契约接口按单个 horizon 返回，这里对 5 个周期分别请求后拼成
 * 特征 × 周期热力图（ic60 着色，decayFlag 带红框）；点某行查看该因子跨周期 ic20/ic60。
 */
export default function FactorsPage() {
    const [f, setF] = usePersistedState('ga:factors:filters', DEFAULT_FILTERS);
    const [feature, setFeature] = usePersistedState('ga:factors:feature', '');

    const matrix = useApi(
        () => Promise.all(HORIZONS.map((h) => getFactorsIc({ horizon: h, days: f.days }))),
        [f.days],
    );

    const perHorizon = Array.isArray(matrix.data) ? matrix.data : [];
    const featureMap = new Map();
    HORIZONS.forEach((h, hi) => {
        asArray(perHorizon[hi]).forEach((row) => {
            const name = String(row?.featureName ?? '');
            if (!name) return;
            if (!featureMap.has(name)) featureMap.set(name, {});
            featureMap.get(name)[h] = row;
        });
    });
    const features = [...featureMap.keys()];
    const activeFeature = feature && featureMap.has(feature) ? feature : features[0];

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="统计天数" hint="交易日前推窗口"><Input type="number" min="1" value={f.days}
                                                       onChange={(v) => setF((p) => ({ ...p, days: v }))}/></Field>
                <RefreshBtn state={matrix}/>
            </FilterBar>

            <AsyncPanel state={matrix} isEmpty={() => features.length === 0} emptyText="暂无因子 IC 数据">
                {() => (
                    <>
                        <Card title={<span>特征 × 周期 <Term id="ic60">IC</Term> 热力图
                            （<Term id="ic60">ic60</Term> 着色，红框 = <Term id="decayFlag">decayFlag</Term> 衰减）</span>}>
                            <div className="ga-table-wrap">
                                <table className="ga-heat-table">
                                    <thead>
                                    <tr>
                                        <th>特征</th>
                                        {HORIZONS.map((h) => <th key={h}>{h} 日</th>)}
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {features.map((name) => {
                                        const rec = featureMap.get(name);
                                        return (
                                            <tr key={name} className="ga-row-link" onClick={() => setFeature(name)}>
                                                <td className="ga-heat-rowhead"
                                                    style={activeFeature === name ? { background: '#eaf1ff' } : undefined}>
                                                    {name}
                                                </td>
                                                {HORIZONS.map((h) => {
                                                    const r = rec[h];
                                                    return (
                                                        <td key={h}
                                                            className={`ga-heat-cell${r && isDecay(r.decayFlag) ? ' ga-heat-decay' : ''}`}
                                                            style={{ background: icColor(r?.ic60) }}
                                                            title={`${name} / ${h}日周期\n近60日 IC = ${fmtNum(r?.ic60, 4)}\n近20日 IC = ${fmtNum(r?.ic20, 4)}\nIC 信息比率 = ${fmtNum(r?.icir60, 3)}\n衰减标记 = ${r && isDecay(r.decayFlag) ? '是' : '否'}`}>
                                                            {r ? fmtNum(r.ic60, 3) : '-'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="ga-heat-legend">
                                <span><i style={{ background: 'rgba(216,57,43,0.5)' }}/> <Term id="ic60">ic60</Term> 为正（红）</span>
                                <span><i style={{ background: 'rgba(23,146,78,0.5)' }}/> <Term id="ic60">ic60</Term> 为负（绿）</span>
                                <span><i style={{ background: '#f7f8fa', outline: `2px solid ${UP}` }}/> 红框 = <Term id="decayFlag">decayFlag</Term> 衰减标记</span>
                                <span>点击任意行查看下方序列 · <Term id="icir60">icir60</Term> 与 <Term id="ic20">ic20</Term> 见格子悬停提示</span>
                            </div>
                        </Card>

                        <Card title={<span>因子 {fmtText(activeFeature)} 的 <Term id="ic20">ic20</Term> /
                            <Term id="ic60">ic60</Term> 序列（跨周期）</span>}>
                            {activeFeature
                                ? <GaChart option={factorSeriesOption(featureMap.get(activeFeature) || {})} height={280}/>
                                : <Empty text="点击上方热力图任意一行查看该因子序列"/>}
                        </Card>
                    </>
                )}
            </AsyncPanel>
        </div>
    );
}
