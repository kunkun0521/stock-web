import { useState } from 'react';
import { ErrorBanner, Loading, Panel, StatCard } from '../components/UI.jsx';
import { tApi } from '../api.js';
import { fmtNum, money, pct, toneClass } from '../utils.js';

export default function PlanPage() {
    const [form, setForm] = useState({
        code: '600519', qty: '1000', sellableQty: '1000', avgCost: '1450',
        cash: '150000', totalCapital: '1600000', asOfDate: '',
    });
    const [result, setResult] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');

    const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const run = async () => {
        setRunning(true);
        setError('');
        try {
            const data = await tApi.plan({
                code: form.code.trim(),
                qty: Number(form.qty),
                sellableQty: Number(form.sellableQty),
                avgCost: Number(form.avgCost),
                cash: Number(form.cash),
                totalCapital: Number(form.totalCapital),
                asOfDate: form.asOfDate || undefined,
            });
            setResult(data);
        } catch (e) {
            setError(e.message || '生成计划失败');
        } finally {
            setRunning(false);
        }
    };

    const levels = result?.levels || {};
    const orders = result?.orders || [];

    return (
        <div className="plan-layout">
            <div className="two-cols">
                <Panel title="真实持仓" extra={<span className="muted">基于昨日及以前数据生成次日挂单</span>}>
                    <div className="form-grid">
                        <label className="field">股票代码
                            <input value={form.code} onChange={(e) => update('code', e.target.value)}/>
                        </label>
                        <label className="field">持仓股数
                            <input value={form.qty} onChange={(e) => update('qty', e.target.value)}/>
                        </label>
                        <label className="field">可卖股数（T+1）
                            <input value={form.sellableQty} onChange={(e) => update('sellableQty', e.target.value)}/>
                        </label>
                        <label className="field">持仓成本价（元）
                            <input value={form.avgCost} onChange={(e) => update('avgCost', e.target.value)}/>
                        </label>
                        <label className="field">可用现金（元）
                            <input value={form.cash} onChange={(e) => update('cash', e.target.value)}/>
                        </label>
                        <label className="field">总资金（元）
                            <input value={form.totalCapital} onChange={(e) => update('totalCapital', e.target.value)}/>
                        </label>
                        <label className="field">基准日（可空）
                            <input type="date" value={form.asOfDate} onChange={(e) => update('asOfDate', e.target.value)}/>
                        </label>
                    </div>
                    <button type="button" className="primary-btn" disabled={running} onClick={run}>
                        {running ? '生成中…' : '生成次日计划'}
                    </button>
                </Panel>

                <div>
                    <ErrorBanner message={error} onClose={() => setError('')}/>
                    <Loading show={running}/>
                    {!result && !running ? (
                        <div className="empty-hint">
                            <h3>次日操作计划</h3>
                            <p>给定当前真实持仓，直接复用策略引擎输出下一交易日的补仓价与数量、
                               做T买卖价、回本卖出价与止损价，并逐条解释触发或不触发的原因。</p>
                        </div>
                    ) : null}
                    {result ? (
                        <>
                            <div className="stat-grid four">
                                <StatCard label="股票" value={`${result.code} ${result.name}`} tone="plain"
                                          hint={`基准日 ${result.asOfDate}`}/>
                                <StatCard label="回本/达标卖出价" value={`¥${money(levels.exitPrice)}`} tone="plain"
                                          hint={`摊薄成本 ¥${money(levels.dilutedCost)}`}/>
                                <StatCard label="止损价" value={`¥${money(levels.stopPrice)}`} tone="down"
                                          hint={`涨跌停 ¥${money(levels.limitDown)} ~ ¥${money(levels.limitUp)}`}/>
                                <StatCard label="当前总盈亏" value={`¥${money(levels.totalPnlAtLastClose)}`}
                                          tone={toneClass(levels.totalPnlAtLastClose)} hint="按基准日收盘估值"/>
                            </div>
                            <Panel title="指标快照">
                                <div className="kv-list compact">
                                    {Object.entries(result.indicators || {}).map(([k, v]) => (
                                        <div key={k}><span>{IND_LABEL[k] || k}</span><b>{typeof v === 'number' ? fmtNum(v, 4) : String(v)}</b></div>
                                    ))}
                                </div>
                            </Panel>
                        </>
                    ) : null}
                </div>
            </div>

            {result ? (
                <>
                    <Panel title={`挂单卡片（${orders.length}）`}>
                        {orders.length ? (
                            <div className="order-cards">
                                {orders.map((o, i) => (
                                    <div className={`order-card ${o.type === 'T' ? 'accent' : ''}`} key={i}>
                                        <div className="order-head">
                                            <b>{o.label}</b>
                                            <span className="muted">{o.side}</span>
                                        </div>
                                        <div className="order-body">
                                            {o.type === 'T' ? (
                                                <>
                                                    <div><span>卖价</span><b>¥{money(o.sellPrice)}</b></div>
                                                    <div><span>买价</span><b>¥{money(o.buyPrice)}</b></div>
                                                </>
                                            ) : (
                                                <div><span>挂单价</span><b>¥{money(o.price)}</b></div>
                                            )}
                                            <div><span>数量</span><b>{o.qty} 股</b></div>
                                            <div><span>占用资金</span><b>¥{money(o.occupiedCash)}</b></div>
                                            {o.expectedNetProfit != null ? (
                                                <div><span>预期净利</span><b className={toneClass(o.expectedNetProfit)}>¥{money(o.expectedNetProfit)}</b></div>
                                            ) : null}
                                        </div>
                                        <div className="order-cond">{o.condition}</div>
                                        <div className="order-reason">{o.reason}</div>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="muted pad">当前条件下没有可生成的挂单，请看下方解释。</p>}
                    </Panel>

                    <Panel title="触发解释">
                        <ul className="explain-list">
                            {(result.explanations || []).map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    </Panel>

                    {result.warnings?.length ? (
                        <div className="warnings">{result.warnings.map((w, i) => <p key={i}>· {w}</p>)}</div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

const IND_LABEL = {
    date: '日期', close: '收盘', atrPct: 'ATR%', ma5: 'MA5', ma10: 'MA10', ma20: 'MA20',
    ma20Slope: 'MA20斜率', rsi14: 'RSI14', percentB: '布林%B', volRatio: '量比',
    ret5: '近5日涨跌', ret20: '近20日涨跌', devMa20: '偏离MA20', avgAmp20: '20日均振幅',
};
