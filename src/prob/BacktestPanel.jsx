/** 页面 4：回测。净值/基准曲线、回撤、绩效指标、参数与成交明细；明确标注样本期局限。 */
import { useMemo, useState } from 'react';
import EChart from '../components/EChart.jsx';
import { useApi } from '../hooks/useApi.js';
import { getBacktest, getBacktests } from './api.js';
import F from './FormulaTerm.jsx';
import { PAsync, PBar, PBtn, PCard, PField, PKpi, PSelect } from './ProbParts.jsx';
import { asArray, asObject, dateStr, num, pct, signedPct, tone } from './format.js';

function NavOption(nav) {
    return {
        tooltip: { trigger: 'axis', valueFormatter: (v) => num(v, 3) },
        legend: { data: ['策略净值', '全市场等权基准'], bottom: 0, textStyle: { fontSize: 11 } },
        grid: { left: 56, right: 18, top: 18, bottom: 42 },
        xAxis: { type: 'category', data: nav.map((r) => dateStr(r.trade_date).slice(5)),
                 axisLabel: { fontSize: 10, interval: Math.max(1, Math.floor(nav.length / 12)) } },
        yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { opacity: 0.35 } } },
        series: [
            { name: '策略净值', type: 'line', data: nav.map((r) => Number(r.nav)), symbol: 'none',
              lineStyle: { width: 2, color: '#d8392b' }, itemStyle: { color: '#d8392b' },
              areaStyle: { color: 'rgba(216,57,43,0.08)' } },
            { name: '全市场等权基准', type: 'line', data: nav.map((r) => Number(r.bench_nav)), symbol: 'none',
              lineStyle: { width: 2, type: 'dashed', color: '#6b7280' } },
        ],
    };
}

function DdOption(nav) {
    return {
        tooltip: { trigger: 'axis', valueFormatter: (v) => pct(v) },
        grid: { left: 56, right: 18, top: 12, bottom: 32 },
        xAxis: { type: 'category', data: nav.map((r) => dateStr(r.trade_date).slice(5)),
                 axisLabel: { fontSize: 10, interval: Math.max(1, Math.floor(nav.length / 12)) } },
        yAxis: { type: 'value', axisLabel: { formatter: (v) => `${(v * 100).toFixed(0)}%` },
                 splitLine: { lineStyle: { opacity: 0.35 } } },
        series: [{ name: '回撤', type: 'line', data: nav.map((r) => Number(r.drawdown)), symbol: 'none',
                   lineStyle: { width: 2, color: '#17924e' },
                   areaStyle: { color: 'rgba(23,146,78,0.16)' } }],
    };
}

export default function BacktestPanel({ refreshKey }) {
    const list = useApi(() => getBacktests({ page: 1, size: 20 }), [refreshKey]);
    const [selected, setSelected] = useState(null);
    const items = asArray(list.data);
    const id = selected ?? (items[0]?.backtest_id ?? null);
    const detail = useApi(() => (id ? getBacktest(id) : Promise.resolve({})), [id, refreshKey]);
    const summary = detail.data?.summary || {};
    const nav = asArray(detail.data?.nav);
    const trades = asArray(detail.data?.trades);
    const params = asObject(summary.params_json);
    const navOpt = useMemo(() => nav.length ? NavOption(nav) : null, [nav]);
    const ddOpt = useMemo(() => nav.length ? DdOption(nav) : null, [nav]);

    return (
        <>
            <PCard title="回测任务" extra={<span className="prob-muted">只用于检验样本外预测是否可交易</span>}>
                <PBar>
                    <PField label="回测批次">
                        <PSelect value={id ?? ''} onChange={(v) => setSelected(Number(v))}
                                 options={items.length ? items.map((b) => ({
                                     value: b.backtest_id,
                                     label: `#${b.backtest_id} · h=${b.horizon} · ${dateStr(b.created_at).slice(0, 10)}`,
                                 })) : [{ value: '', label: '暂无回测' }]}/>
                    </PField>
                    <PBtn onClick={() => { list.reload(); detail.reload(); }}>刷新</PBtn>
                </PBar>
                {!items.length ? (
                    <div className="prob-onboard">
                        <b>还没有回测结果。</b> 运行日常任务后会自动生成一次；也可在「任务与参数」页单独触发 backtest。
                    </div>
                ) : null}
            </PCard>

            <PAsync state={detail} isEmpty={() => !nav.length} emptyText="该回测暂无净值数据">
                {() => (
                    <>
                        <PCard title="绩效指标" extra={<F id="bt_nav">净值口径</F>}>
                            <div className="ga-kpi-grid">
                                <PKpi label="总收益 / 基准" value={`${signedPct(summary.total_return)} / ${signedPct(summary.bench_total_return)}`}
                                      tone={tone(summary.total_return)} hint={`${dateStr(summary.start_date)} ~ ${dateStr(summary.end_date)}`}/>
                                <PKpi label="年化收益" value={signedPct(summary.annual_return)} tone={tone(summary.annual_return)}/>
                                <PKpi label="年化波动" value={pct(summary.annual_vol)}/>
                                <PKpi label="Sharpe" value={num(summary.sharpe, 2)} hint="rf=2%（年化）"/>
                                <PKpi label="最大回撤" value={pct(summary.max_drawdown)}/>
                                <PKpi label="胜率 / 二项检验 p" value={`${pct(summary.win_rate)} / ${num(summary.win_pvalue, 4)}`}
                                      hint={`${Number(summary.n_trades || 0).toLocaleString()} 笔`}/>
                                <PKpi label="基准年化" value={signedPct(summary.bench_annual_return)} tone={tone(summary.bench_annual_return)}/>
                                <PKpi label="换手" value={num(summary.turnover, 3)} hint="日均成交占比"/>
                            </div>
                        </PCard>

                        <PCard title="净值与回撤" extra={<F id="bt_trade">成交与成本口径</F>}>
                            <EChart option={navOpt} height={280} empty={!navOpt} emptyText="暂无净值曲线"/>
                            <EChart option={ddOpt} height={200} empty={!ddOpt} emptyText="暂无回撤曲线"/>
                        </PCard>

                        <div className="prob-grid-2">
                            <PCard title="回测参数" extra={<F id="bt_trade">全部可配置</F>}>
                                <div className="ga-table-wrap">
                                    <table className="ga-table prob-table">
                                        <tbody>
                                            {Object.entries(params).map(([k, v]) => (
                                                <tr key={k}><td><code>{k}</code></td>
                                                    <td>{typeof v === 'number' ? num(v, 6) : String(v)}</td></tr>
                                            ))}
                                            {!Object.keys(params).length ? <tr><td colSpan={2} className="prob-muted">暂无参数快照</td></tr> : null}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="prob-note">t+1 开盘买入、t+1+h 收盘卖出；买入日一字涨停视为买不到，卖出日跌停顺延；
                                    佣金双边、印花税仅卖出、滑点单边。每笔占 1/h 资金、每日新开仓。</p>
                            </PCard>
                            <PCard title="成交明细（最近 200 笔）">
                                <div className="ga-table-wrap prob-scroll-300">
                                    <table className="ga-table prob-table">
                                        <thead><tr><th>代码</th><th>信号日</th><th>p_up</th><th>买入</th>
                                            <th>卖出</th><th>净收益</th><th>状态</th></tr></thead>
                                        <tbody>
                                            {trades.map((t, i) => (
                                                <tr key={`${t.code}-${t.signal_date}-${i}`}>
                                                    <td>{t.code}</td><td>{dateStr(t.signal_date)}</td>
                                                    <td>{pct(t.p_up)}</td>
                                                    <td>{num(t.buy_price, 2)}</td><td>{num(t.sell_price, 2)}</td>
                                                    <td className={`ga-tone-${tone(t.net_return)}`}>{signedPct(t.net_return)}</td>
                                                    <td className="prob-small">{t.skipped || '成交'}</td>
                                                </tr>
                                            ))}
                                            {!trades.length ? <tr><td colSpan={7} className="prob-muted">暂无成交</td></tr> : null}
                                        </tbody>
                                    </table>
                                </div>
                            </PCard>
                        </div>

                        <div className="prob-grade-note is-warn">
                            ⚠ 样本期仅约两年且行情阶段单一，回测结果不能外推到其他市场阶段；
                            历史统计概率不代表未来表现。本页仅用于量化研究复盘，不构成任何投资建议。
                        </div>
                    </>
                )}
            </PAsync>
        </>
    );
}
