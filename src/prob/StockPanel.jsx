/** 页面 2：个股详情。各周期概率、分位扇形图、波动对比、方向拆解、马尔可夫、信号、复盘、风险。 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EChart from '../components/EChart.jsx';
import { useApi } from '../hooks/useApi.js';
import { getStock, getStockHistory, getStockSignals } from './api.js';
import StockSearch from './StockSearch.jsx';
import CoverageHint from './CoverageHint.jsx';
import F from './FormulaTerm.jsx';
import { PAsync, PBadge, PBar, PBtn, PCard, PKpi, PSelect } from './ProbParts.jsx';
import { GRADE_HINT, GRADE_TONE, RISK_LABEL, RISK_TONE, VOL_CN, asObject, dateStr,
    num, pct, signedPct, tone } from './format.js';

const HORIZONS = [1, 3, 5, 10];
const STATE_CN = { U: '涨', F: '平', D: '跌' };

function BarRow({ label, value, max = 1, hint }) {
    const v = Number(value) || 0;
    const w = Math.min(100, Math.abs(v) / max * 100);
    return (
        <div className="prob-bar-row" title={hint}>
            <span className="prob-bar-label">{label}</span>
            <div className="prob-bar-track"><i className={`prob-bar-fill ${v >= 0 ? 'is-up' : 'is-down'}`}
                                                style={{ width: `${w}%` }}/></div>
            <b>{num(v, 3)}</b>
        </div>
    );
}

function FanOption(data, horizon) {
    const prices = data.priceSeries || [];
    const preds = data.predictions || [];
    if (!prices.length || !preds.length) return null;
    const last = Number(prices[prices.length - 1].close) || 1;
    const histDates = prices.map((p) => String(p.trade_date).slice(5, 10));
    const futureDates = Array.from({ length: 10 }, (_, i) => `D+${i + 1}`);
    const xs = [...histDates, ...futureDates];
    const blank = new Array(histDates.length).fill(null);
    const at = (h, field) => {
        const row = preds.find((p) => Number(p.horizon) === h);
        return row ? last * (1 + Number(row[field] || 0)) : 0;
    };
    const q05 = futureDates.map((_, i) => at(i + 1, 'q05'));
    const q25 = futureDates.map((_, i) => at(i + 1, 'q25'));
    const q50 = futureDates.map((_, i) => at(i + 1, 'q50'));
    const q75 = futureDates.map((_, i) => at(i + 1, 'q75'));
    const q95 = futureDates.map((_, i) => at(i + 1, 'q95'));
    const join = (arr, anchor = true) => [...blank, ...(anchor ? [last, ...arr.slice(1)] : arr)];
    const stackOpts = { type: 'line', symbol: 'none', lineStyle: { opacity: 0 }, smooth: false, connectNulls: false };
    return {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '—' : Number(v).toFixed(2)) },
        legend: { data: ['历史收盘', '中位数', 'q05–q95', 'q25–q75'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 52, right: 16, top: 18, bottom: 42 },
        xAxis: { type: 'category', data: xs, axisLabel: { fontSize: 10, interval: Math.max(1, Math.floor(xs.length / 12)) } },
        yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { opacity: 0.35 } } },
        series: [
            { name: '历史收盘', type: 'line', data: [...prices.map((p) => Number(p.close)), ...new Array(10).fill(null)],
              symbol: 'none', lineStyle: { width: 2, color: '#2f6fed' }, itemStyle: { color: '#2f6fed' } },
            { name: 'q05–q95', ...stackOpts, stack: 'outer', data: join(q05),
              areaStyle: { opacity: 0 } },
            { name: 'q05–q95', ...stackOpts, stack: 'outer',
              data: [...blank, ...q95.map((v, i) => v - q05[i])],
              areaStyle: { color: 'rgba(47,111,237,0.16)' } },
            { name: 'q25–q75', ...stackOpts, stack: 'inner', data: join(q25),
              areaStyle: { opacity: 0 } },
            { name: 'q25–q75', ...stackOpts, stack: 'inner',
              data: [...blank, ...q75.map((v, i) => v - q25[i])],
              areaStyle: { color: 'rgba(47,111,237,0.30)' } },
            { name: '中位数', type: 'line', data: join(q50), symbol: 'none',
              lineStyle: { width: 2, type: 'dashed', color: '#d8392b' }, itemStyle: { color: '#d8392b' } },
        ],
    };
}

function VolOption(data) {
    const prices = data.priceSeries || [];
    const preds = data.predictions || [];
    if (!prices.length) return null;
    const xs = prices.map((p) => String(p.trade_date).slice(5, 10));
    const realized = prices.map((p) => Number(p.realizedVol20 || 0));
    const vol1 = preds.length ? Number(preds[0].vol_1d_next) : 0;
    return {
        tooltip: { trigger: 'axis', valueFormatter: (v) => pct(v) },
        legend: { data: ['20日已实现波动(年化)', '次日预测波动'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 52, right: 16, top: 18, bottom: 42 },
        xAxis: { type: 'category', data: xs, axisLabel: { fontSize: 10, interval: Math.max(1, Math.floor(xs.length / 10)) } },
        yAxis: { type: 'value', axisLabel: { formatter: (v) => `${(v * 100).toFixed(0)}%` }, splitLine: { lineStyle: { opacity: 0.35 } } },
        series: [
            { name: '20日已实现波动(年化)', type: 'line', data: realized, symbol: 'none',
              lineStyle: { width: 2, color: '#8a5a00' }, itemStyle: { color: '#8a5a00' } },
            { name: '次日预测波动', type: 'line', data: new Array(xs.length).fill(vol1), symbol: 'none',
              lineStyle: { width: 2, type: 'dashed', color: '#d8392b' } },
        ],
    };
}

export default function StockPanel({ params, patch, refreshKey }) {
    const navigate = useNavigate();
    const code = params.get('code') || '600519';
    const market = params.get('market') || (code.startsWith('6') ? 'SH' : 'SZ');
    const [draft, setDraft] = useState(code);
    const [pickedName, setPickedName] = useState('');
    const [h, setH] = useState(Number(params.get('sh') || 1));
    const stock = useApi(() => getStock(market, code), [market, code, refreshKey]);
    const history = useApi(() => getStockHistory(market, code, { horizon: h }), [market, code, h, refreshKey]);
    const signals = useApi(() => getStockSignals(market, code, { horizon: h }), [market, code, h, refreshKey]);

    const data = stock.data || {};
    const preds = data.predictions || [];
    const state = data.modelState || {};
    const cur = preds.find((p) => Number(p.horizon) === h) || {};
    const comp = useMemo(() => asObject(cur.components_json), [cur]);
    const sigState = signals.data?.modelState || {};
    const matrix = sigState.markovMatrix || (Array.isArray(state.markov_matrix_json) ? state.markov_matrix_json : null);
    const sigItems = signals.data?.items || [];
    const histItems = history.data?.items || [];
    const fan = useMemo(() => FanOption(data), [data]);
    const vol = useMemo(() => VolOption(data), [data]);
    const contrib = Array.isArray(comp.contributions) ? comp.contributions : [];
    const maxContrib = Math.max(0.001, ...contrib.map((c) => Math.abs(Number(c.value) || 0)));

    return (
        <>
            <div className="prob-backbar">
                <PBtn sm variant="ghost" onClick={() => patch({ tab: 'overview', code: '', market: '' })}>← 返回概率总览</PBtn>
                <span className="prob-muted">当前 {code}.{market}{pickedName ? ` · ${pickedName}` : ''} · 基准日 {dateStr(data.asof)}</span>
                <div className="prob-backbar-actions">
                    <StockSearch value={draft} onChange={(v) => { setDraft(v); setPickedName(''); }}
                                 onPick={(item) => {
                                     const c = String(item.code);
                                     const mk = item.exchange || (c.startsWith('6') ? 'SH' : 'SZ');
                                     setDraft(c);
                                     setPickedName(item.name || '');
                                     patch({ code: c, market: mk });
                                 }}
                                 pickedName={pickedName} showSubmit submitLabel="查询" width={210}
                                 placeholder="代码或中文名，如 600519 / 贵州茅台"/>
                    <PBtn sm variant="ghost" onClick={() => navigate(`/stocks/${code}`, {
                        state: { from: window.location.pathname + window.location.search, fromLabel: '概率个股详情' },
                    })}>查看 K 线</PBtn>
                    <PBtn sm onClick={() => { stock.reload(); history.reload(); signals.reload(); }}>刷新</PBtn>
                </div>
            </div>

            <PAsync state={stock} isEmpty={() => !preds.length}
                    emptyText="该代码暂无预测记录：可能不在本次预测股票池（新股、ST、长期停牌、历史不足 250 日、数据不完整会被剔除）。可换一只股票，或先运行日常任务">
                {() => (
                    <>
                        <PCard title="各周期概率与期望" extra={<F id="label">h 个交易日累计收益</F>}>
                            <div className="ga-table-wrap">
                                <table className="ga-table prob-table">
                                    <thead><tr>
                                        <th>周期</th><th><F id="calibration">p_up</F></th>
                                        <th>p_down</th><th><F id="m5_expectation">期望收益</F></th>
                                        <th>中位数</th><th>q05 / q95</th>
                                        <th><F id="garch_h">vol_h</F></th><th><F id="var_cvar">VaR95 / CVaR95</F></th>
                                        <th><F id="risk_level">风险</F></th><th><F id="grade">可靠性</F></th>
                                    </tr></thead>
                                    <tbody>
                                        {preds.map((p) => (
                                            <tr key={p.horizon} className={Number(p.horizon) === h ? 'is-active' : ''}
                                                onClick={() => setH(Number(p.horizon))}>
                                                <td><b>{p.horizon} 日</b></td>
                                                <td className={`ga-tone-${Number(p.p_up) > 0.5 ? 'up' : 'down'}`}><b>{pct(p.p_up)}</b></td>
                                                <td>{pct(p.p_down)}</td>
                                                <td className={`ga-tone-${tone(p.exp_ret)}`}>{signedPct(p.exp_ret)}</td>
                                                <td className={`ga-tone-${tone(p.q50)}`}>{signedPct(p.q50)}</td>
                                                <td>{signedPct(p.q05)} / {signedPct(p.q95)}</td>
                                                <td>{pct(p.vol_h)}</td>
                                                <td>{pct(p.var95)} / {pct(p.cvar95)}</td>
                                                <td><PBadge tone={RISK_TONE[p.risk_level]}>{RISK_LABEL[p.risk_level] || '—'}</PBadge></td>
                                                <td><PBadge tone={GRADE_TONE[p.reliability_grade]} title={GRADE_HINT[p.reliability_grade]}>{p.reliability_grade}</PBadge></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="prob-note">点击某一行可切换下方拆解所用的周期（当前 {h} 日）。分位区间是统计估计，不代表未来一定落在区间内。</p>
                        </PCard>

                        <div className="prob-grid-2">
                            <PCard title="未来 1–10 日分位扇形图" extra={<F id="location_t">分位口径</F>}>
                                <EChart option={fan} height={300} empty={!fan} emptyText="暂无价格与分位数据"/>
                                <p className="prob-note">近 60 日前复权收盘价 + 未来各周期 q05–q95 / q25–q75 分位带（价格按当日收盘价折算）。<F id="pinball"/></p>
                            </PCard>
                            <PCard title="波动率：预测 vs 已实现" extra={<F id="garch">GARCH-t</F>}>
                                <EChart option={vol} height={300} empty={!vol} emptyText="暂无波动数据"/>
                                <div className="prob-mini-kpis">
                                    <PKpi label="波动模型" value={VOL_CN[state.vol_model] || '—'} hint={`ν=${num(state.nu, 2)}`}/>
                                    <PKpi label="次日波动" value={pct(state.sigma_1d_next)} hint="日对数收益标准差"/>
                                    <PKpi label="自身历史分位" value={pct(state.vol_pctile_self)} hint=">80% 为高波动阶段"/>
                                    <PKpi label="全市场分位" value={pct(state.vol_pctile_mkt)} hint="当日横截面"/>
                                </div>
                            </PCard>
                        </div>

                        <div className="prob-grid-2">
                            <PCard title="方向模型拆解" extra={<F id="stacking">M10 融合</F>}>
                                <div className="prob-bar-list">
                                    <BarRow label="最终 p_up" value={comp.p_up ?? (preds.find((p) => Number(p.horizon) === h)?.p_up)} max={1} hint="校准并截断后的概率"/>
                                    <BarRow label="M1 贝叶斯" value={comp.p_m1} max={1}/>
                                    <BarRow label="M2 逻辑回归" value={comp.p_m2} max={1}/>
                                    <BarRow label="M3 马尔可夫" value={comp.p_markov} max={1}/>
                                    <BarRow label="正态基线 B1" value={comp.p_base} max={1}/>
                                    <BarRow label="融合原始分" value={comp.p_stack_raw} max={1}/>
                                </div>
                                <div className="prob-subhead"><F id="logit_m2">逻辑回归因子贡献 βⱼ·Xⱼ</F></div>
                                {contrib.length ? (
                                    <div className="prob-bar-list">
                                        {contrib.slice(0, 8).map((c) => (
                                            <BarRow key={c.name} label={c.name} value={c.value} max={maxContrib}/>
                                        ))}
                                    </div>
                                ) : <div className="prob-muted">暂无因子贡献数据</div>}
                                <p className="prob-note">M5 条件期望 {signedPct(comp.exp_ret_cond)}；模拟 P(R&gt;0) {pct(comp.sim_p_up)}，与最终 p_up 的差用于一致性校验。<F id="consistency"/></p>
                            </PCard>

                            <PCard title="马尔可夫转移矩阵" extra={<F id="markov">3 状态</F>}>
                                {Array.isArray(matrix) && matrix.length === 3 ? (
                                    <table className="prob-matrix">
                                        <thead><tr><th>从 \ 到</th>{['U 涨', 'F 平', 'D 跌'].map((x) => <th key={x}>{x}</th>)}</tr></thead>
                                        <tbody>
                                            {matrix.map((row, i) => (
                                                <tr key={i}>
                                                    <th>{['U 涨', 'F 平', 'D 跌'][i]}</th>
                                                    {row.map((v, j) => (
                                                        <td key={j} style={{ background: `rgba(47,111,237,${Math.min(0.72, Number(v) * 0.8)})` }}>
                                                            {pct(v)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : <div className="prob-muted">暂无转移矩阵</div>}
                                <div className="prob-mini-kpis">
                                    <PKpi label="当前状态" value={STATE_CN[sigState.markov_state] || sigState.markov_state || '—'}
                                          hint={`卡方 p=${num(sigState.markov_pvalue, 3)}`}/>
                                    <PKpi label="P_UU / P_DD" value={`${pct(comp.p_uu)} / ${pct(comp.p_dd)}`} hint="趋势延续概率"/>
                                    <PKpi label="期望连涨" value={num(comp.exp_up_streak, 2)} hint={`1/(1−P_UU)`} />
                                    <PKpi label="期望连跌" value={num(comp.exp_dn_streak, 2)} hint={`1/(1−P_DD)`} />
                                </div>
                                <p className="prob-note">π_h(U) 是「第 h 天当天上涨」的概率，不等于 h 日累计收益&gt;0 的概率，只作为融合输入。</p>
                            </PCard>
                        </div>

                        <PCard title="信号命中率" extra={<F id="beta_prior">后验均值口径</F>}>
                            <PAsync state={signals} isEmpty={() => !sigItems.length} emptyText="暂无信号统计">
                                {() => (
                                    <div className="ga-table-wrap">
                                        <table className="ga-table prob-table">
                                            <thead><tr><th>信号</th><th>有效样本 n_eff</th><th>原始命中率</th>
                                                <th>后验均值</th><th>95% 区间</th><th>先验强度 m</th><th>半衰期</th></tr></thead>
                                            <tbody>
                                                {sigItems.slice(0, 30).map((s) => (
                                                    <tr key={s.signal_key}>
                                                        <td><code>{s.signal_key}</code></td>
                                                        <td>{num(s.n_eff, 0)}</td>
                                                        <td>{pct(s.p_hat)}</td>
                                                        <td className={`ga-tone-${Number(s.posterior_mean) > Number(s.p0) ? 'up' : 'down'}`}><b>{pct(s.posterior_mean)}</b></td>
                                                        <td>{pct(s.ci_low)} ~ {pct(s.ci_high)}</td>
                                                        <td>{num(s.prior_strength, 0)}</td>
                                                        <td>{s.half_life} 日</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </PAsync>
                        </PCard>

                        <div className="prob-grid-2">
                            <PCard title="历史预测复盘" extra={<F id="coverage">区间与方向覆盖</F>}>
                                <PAsync state={history} isEmpty={() => !histItems.length} emptyText="该周期暂无已结算预测">
                                    {() => (
                                        <div className="ga-table-wrap prob-scroll-260">
                                            <table className="ga-table prob-table">
                                                <thead><tr><th>基准日</th><th>类型</th><th>p_up</th><th>实际收益</th>
                                                    <th>方向</th><th>低于 q05</th><th>高于 q95</th><th>VaR 突破</th></tr></thead>
                                                <tbody>
                                                    {histItems.slice(0, 60).map((r, i) => (
                                                        <tr key={`${r.asof_date}-${r.pred_type}-${i}`}>
                                                            <td>{dateStr(r.asof_date)}</td>
                                                            <td>{r.pred_type}</td>
                                                            <td>{pct(r.p_up)}</td>
                                                            <td className={`ga-tone-${tone(r.realized_ret)}`}>{signedPct(r.realized_ret)}</td>
                                                            <td>{r.hit_dir == null ? '—' : (r.hit_dir ? '✓' : '✗')}</td>
                                                            <td>{r.below_q05 ? '是' : '—'}</td>
                                                            <td>{r.above_q95 ? '是' : '—'}</td>
                                                            <td>{r.breach_var95 ? <span className="ga-tone-up">是</span> : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </PAsync>
                            </PCard>
                            <PCard title="风险与历史描述" extra={<F id="mdd_sharpe">仅历史描述</F>}>
                                <div className="ga-kpi-grid">
                                    <PKpi label="VaR95 / VaR99" value={`${pct(cur.var95)} / ${pct(cur.var99)}`}
                                          hint="正数损失率"/>
                                    <PKpi label="CVaR95" value={pct(cur.cvar95)} hint="最差 5% 的平均亏损"/>
                                    <PKpi label="近 250 日最大回撤" value={pct(state.mdd_250)} hint="历史描述，不参与预测"/>
                                    <PKpi label="年化 Sharpe" value={num(state.sharpe_250, 2)} hint={`rf=${pct(0.02, 0)}`}/>
                                    <PKpi label="年化波动" value={pct(state.ann_vol_250)} hint="近 250 日"/>
                                    <PKpi label="大跌 / 大涨概率" value={`${pct(cur.prob_drop_5)} / ${pct(cur.prob_rise_5)}`}
                                          hint="阈值 ±5%"/>
                                </div>
                                <p className="prob-note">风险等级取 vol_h 与 cvar95 在当日全市场分位中较大者；<F id="risk_level"/>。VaR 突破率检验见 <F id="kupiec"/>。</p>
                            </PCard>
                        </div>
                    </>
                )}
            </PAsync>
            {stock.data && !preds.length ? <CoverageHint code={code}/> : null}
        </>
    );
}
