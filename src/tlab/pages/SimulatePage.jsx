import { useEffect, useMemo, useRef, useState } from 'react';
import EChart from '../components/EChart.jsx';
import StockCodeInput, { resolveStock } from '../components/StockCodeInput.jsx';
import { ErrorBanner, FieldLabel, Loading, Panel, StatCard } from '../components/UI.jsx';
import { equityOption, klineOption } from '../charts.js';
import { tLabApi as tApi } from '../../api/tLab.js';
import { usePersistedState } from '../../hooks/usePersistedState.js';
import { useCurrentStock, useGlobalStockSync } from '../../context/CurrentStockContext.jsx';
import { downloadCsv, fmtNum, money, pct, shiftDays, todayStr, toneClass } from '../utils.js';

const DEFAULT_FORM = {
    code: '600519',
    stockName: '贵州茅台',
    buyDate: shiftDays(todayStr(), -30),
    endDate: '',
    buyPrice: '',
    initQty: '',
    // 默认股票是贵州茅台（约 1400 元/股），初始金额需能买到 100 股整手，否则按规格「不足 100 股不操作」会未建仓
    initAmount: '180000',
    totalCapital: '1000000',
    availableCash: '800000',
    adjustFlag: '2',
};

const RATE_KEYS = new Set(['commissionRate', 'stampTaxRate', 'transferFeeRate', 'otherFeeRate',
    'maxPositionRatio', 'tReserveRatio', 'addRatios', 'bandMax', 'minNetProfitRate',
    'liquidityParticipation', 'targetProfitRate', 'maxLossRate', 'initPositionRatio']);

const ACTION_LABEL = {
    INIT: '初始建仓', ADD: '分档补仓', T_SELL: '做T高抛', T_BUY: '做T低吸/买回',
    BUYBACK: '遗留回补', SELL_PENDING: '遗留减仓', EXIT: '回本/达标离场',
    STOP: '止损/时间止损', FORCE_BUYBACK: '强制回补', CARRY_ABSORB: '遗留并入持仓',
};

/** 查询条件的中文提示，鼠标悬停问号查看，不占排版高度 */
const TIPS = {
    code: '支持 6 位代码或中文名（如 600519 / 贵州茅台），输入时自动联想；这里选定的股票会成为全站当前股票，回本实验室三页与其它页面自动跟随。行情取项目日线表（前复权可选）。',
    buyDate: '模拟起点。当日按「买入价」建仓，T+1 规则下当天不可卖出，只统计收盘持仓。',
    endDate: '回放到哪一天，留空表示一直回放到最新交易日。',
    buyPrice: '初始建仓成交价。留空则使用买入日的收盘价（按所选复权口径）。',
    initQty: '初始建仓股数，按 100 股整手向下取整；与「初始金额」二选一，填了股数就忽略金额。',
    initAmount: '按买入价折算初始股数，不足 100 股不建仓（会给出提示）。',
    totalCapital: '策略总资金，用于计算「占总资金」收益率等分母，不影响实际可用现金。',
    availableCash: '后续分档补仓、做T买回可动用的现金上限，超过则不再买入。',
    adjustFlag: '前复权适合策略回放（消除除权跳空）；不复权会按真实历史价格成交。',
};

/** 高级参数：把页面上的百分数还原成后端小数；列表字段用逗号分隔。 */
function buildParams(overrides) {
    const out = {};
    Object.entries(overrides).forEach(([key, raw]) => {
        if (raw === '' || raw === undefined || raw === null) return;
        if (key === 'addSteps' || key === 'addRatios') {
            const list = String(raw).split(/[,，\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);
            if (list.length) out[key] = list.map((v) => (RATE_KEYS.has(key) ? v / 100 : v));
            return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) out[key] = RATE_KEYS.has(key) ? n / 100 : n;
    });
    return out;
}

function formToPayload(form, overrides) {
    return {
        code: form.code.trim(),
        buyDate: form.buyDate || undefined,
        endDate: form.endDate || undefined,
        buyPrice: form.buyPrice ? Number(form.buyPrice) : undefined,
        initQty: form.initQty ? Number(form.initQty) : undefined,
        initAmount: !form.initQty && form.initAmount ? Number(form.initAmount) : undefined,
        totalCapital: Number(form.totalCapital),
        availableCash: Number(form.availableCash),
        params: { ...buildParams(overrides), adjustFlag: Number(form.adjustFlag) },
    };
}

export default function SimulatePage({ initialBuyDate, onConsumeInitial }) {
    const { stock: globalStock, setCurrentStock, adoptStock } = useCurrentStock();
    // 参数与上次结果都写进 sessionStorage：切到其他页面（或刷新）再回来不会被清空
    const [form, setForm] = usePersistedState('tlab:sim:form', {
        ...DEFAULT_FORM,
        code: globalStock.code || DEFAULT_FORM.code,
        stockName: globalStock.name || '',
    });
    const [overrides, setOverrides] = usePersistedState('tlab:sim:overrides', {});
    const [showAdvanced, setShowAdvanced] = usePersistedState('tlab:sim:advanced', false);
    const [paramDefs, setParamDefs] = useState([]);
    const [result, setResult] = usePersistedState('tlab:sim:result', null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [dailyOpen, setDailyOpen] = useState(false);
    const [tradesOpen, setTradesOpen] = useState(false);
    const [warnOpen, setWarnOpen] = useState(false);

    // 跟随全站当前股票；股票换掉时清掉上一只的结果，避免参数区与图表对不上
    const formCodeRef = useRef(form.code);
    formCodeRef.current = form.code;
    useGlobalStockSync((s) => {
        const changed = formCodeRef.current !== s.code;
        setForm((f) => (f.code === s.code && f.stockName === (s.name || ''))
            ? f : { ...f, code: s.code, stockName: s.name || '' });
        if (changed) setResult(null);
    });

    useEffect(() => { tApi.defaultParams().then(setParamDefs).catch(() => {}); }, []);

    // 扫描页点击某个买入日跳转过来时，自动带入该日期
    useEffect(() => {
        if (!initialBuyDate) return;
        setForm((f) => ({ ...f, buyDate: initialBuyDate }));
        onConsumeInitial?.();
    }, [initialBuyDate, onConsumeInitial]);

    const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

    const run = async (payloadOverride) => {
        setRunning(true);
        setError('');
        try {
            let payload = payloadOverride;
            if (!payload) {
                // 支持输入中文名：提交前先用现有联想接口解析成代码，并回填名称
                const picked = await resolveStock(form.code);
                setCurrentStock({ code: picked.code, name: picked.name || '' });
                if (picked.code !== form.code) {
                    setForm((f) => ({ ...f, code: picked.code, stockName: picked.name || f.stockName }));
                }
                payload = formToPayload({ ...form, code: picked.code }, overrides);
            }
            const data = await tApi.simulate(payload);
            setResult(data);
        } catch (e) {
            setError(e.message || '模拟失败');
        } finally {
            setRunning(false);
        }
    };

    const klineOpt = useMemo(() => result ? klineOption(result.kline, result.trades) : null, [result]);
    const equityOpt = useMemo(() => result ? equityOption(result.benchmarks) : null, [result]);
    const s = result?.summary || {};
    const trades = result?.trades || [];
    const filtered = actionFilter ? trades.filter((t) => t.action === actionFilter) : trades;
    const actions = [...new Set(trades.map((t) => t.action))];

    const exportTrades = () => downloadCsv('t-lab-交易明细.csv', [
        { label: '日期', get: (r) => r.tradeDate },
        { label: '动作', get: (r) => ACTION_LABEL[r.action] || r.action },
        { label: '价格', get: (r) => r.price },
        { label: '数量', get: (r) => r.qty },
        { label: '金额', get: (r) => r.amount },
        { label: '费用', get: (r) => r.fee },
        { label: '已实现盈亏', get: (r) => r.realizedPnl ?? '' },
        { label: '说明', get: (r) => r.note },
    ], filtered);

    return (
        <div className="sim-page">
            <Panel className="params-panel" title="模拟参数" extra={
                <button type="button" className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
                    {showAdvanced ? '收起高级参数' : '高级参数'}
                </button>
            }>
                <div className="form-grid compact">
                    <label className="field"><FieldLabel tip={TIPS.code}>股票代码 / 名称</FieldLabel>
                        <StockCodeInput
                            value={form.code}
                            name={form.stockName}
                            onChange={(v) => {
                                setForm((f) => ({ ...f, code: v, stockName: '' }));
                                if (/^\d{6}$/.test(v.trim())) adoptStock(v.trim());
                            }}
                            onPick={(item) => {
                                setForm((f) => ({ ...f, code: item.code, stockName: item.name }));
                                setCurrentStock({ code: item.code, name: item.name || '' });
                            }}
                        />
                    </label>
                    <label className="field"><FieldLabel tip={TIPS.buyDate}>买入日期</FieldLabel>
                        <input type="date" value={form.buyDate} onChange={(e) => update('buyDate', e.target.value)}/>
                    </label>
                    <label className="field"><FieldLabel tip={TIPS.endDate}>结束日期</FieldLabel>
                        <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)}
                               placeholder="留空至最新"/>
                    </label>
                    <label className="field"><FieldLabel tip={TIPS.buyPrice}>买入价（可空）</FieldLabel>
                        <input value={form.buyPrice} onChange={(e) => update('buyPrice', e.target.value)}
                               placeholder="留空用收盘价"/>
                    </label>
                    <label className="field"><FieldLabel tip={TIPS.initQty}>初始股数（二选一）</FieldLabel>
                        <input value={form.initQty} onChange={(e) => update('initQty', e.target.value)}
                               placeholder="留空用金额"/>
                    </label>
                    <label className="field"><FieldLabel tip={TIPS.initAmount}>初始金额（元）</FieldLabel>
                        <input value={form.initAmount} onChange={(e) => update('initAmount', e.target.value)}/>
                    </label>
                    <label className="field"><FieldLabel tip={TIPS.totalCapital}>总资金（元）</FieldLabel>
                        <input value={form.totalCapital} onChange={(e) => update('totalCapital', e.target.value)}/>
                    </label>
                    <label className="field"><FieldLabel tip={TIPS.availableCash}>可支配资金（元）</FieldLabel>
                        <input value={form.availableCash} onChange={(e) => update('availableCash', e.target.value)}/>
                    </label>
                    <label className="field"><FieldLabel tip={TIPS.adjustFlag}>复权口径</FieldLabel>
                        <select value={form.adjustFlag} onChange={(e) => update('adjustFlag', e.target.value)}>
                            <option value="2">前复权</option>
                            <option value="1">后复权</option>
                            <option value="3">不复权</option>
                        </select>
                    </label>
                    <button type="button" className="primary-btn grid-btn" disabled={running} onClick={() => run()}>
                        {running ? '模拟中…' : '开始模拟'}
                    </button>
                </div>

                {showAdvanced ? (
                    <div className="advanced">
                        <p className="advanced-note">仅填写需要覆盖的参数，留空使用后端默认值；比率类按百分数填写，多档用逗号分隔。</p>
                        <div className="advanced-grid">
                            {paramDefs.map((d) => (
                                <label className="field" key={d.key}>
                                    <FieldLabel tip={d.tip}>
                                        {d.label}{d.unit ? `（${d.unit}）` : ''}
                                    </FieldLabel>
                                    <input value={overrides[d.key] ?? ''}
                                           placeholder={`默认 ${fmtNum(d.value, 4)}`}
                                           onChange={(e) => setOverrides((o) => ({ ...o, [d.key]: e.target.value }))}/>
                                </label>
                            ))}
                        </div>
                    </div>
                ) : null}

            </Panel>

            <ErrorBanner message={error} onClose={() => setError('')}/>
            <Loading show={running}/>

            {!result && !running ? (
                <div className="empty-hint compact">
                    <h3>持仓回本模拟</h3>
                    <p>输入股票与买入条件，回放分档补仓、双向限价做T、回本离场全过程，
                       并对比「买入持有」「只补仓不做T」两个基准，看清做T到底贡献了多少。</p>
                </div>
            ) : null}

            {result ? (
                <>
                    <div className="result-meta">
                        <span>股票 <b>{result.code} {result.name}</b></span>
                        <span>买入日 <b>{result.buyDate}</b></span>
                        <span>结束日 <b>{result.endDate}</b></span>
                        <span>买入价 <b>¥{money(result.buyPrice)}</b></span>
                        <span>初始股数 <b>{result.initQty}</b></span>
                        <span>状态 <b>{s.status}</b></span>
                        <span>任务 <b>{result.taskId ?? '未持久化'}</b></span>
                    </div>

                    <div className="stat-grid compact">
                        <StatCard label="总盈亏" value={`¥${money(s.totalPnl)}`} tone={toneClass(s.totalPnl)}
                                  hint={`占最大占用 ${pct(s.pnlPctOnInvested)} / 占总资金 ${pct(s.pnlPctOnCapital)}`}/>
                        <StatCard label="回本日" value={s.recoverDate || '未回本'} tone="plain"
                                  hint={`耗时 ${s.recoverDays ?? '-'} 个交易日`}/>
                        <StatCard label="最大回撤" value={pct(s.maxDrawdown)} tone="down"
                                  hint={`按净值曲线 · 持仓 ${s.holdDays} 日`}/>
                        <StatCard label="做T往返" value={s.tRoundTrips} tone="plain"
                                  hint={`遗留 ${s.tPendingCount} 次 · 胜率 ${pct(s.tWinRate)}`}/>
                        <StatCard label="做T净利" value={`¥${money(s.tNetProfit)}`} tone={toneClass(s.tNetProfit)}
                                  hint={`补仓 ${s.addCount} 次 / ¥${money(s.addAmount)}`}/>
                        <StatCard label="手续费" value={`¥${money(s.feeTotal)}`} tone="plain"
                                  hint={`最大占用 ¥${money(s.maxInvested)}`}/>
                        <StatCard label="相对只补仓" value={pct(s.vsOnlyAdd)} tone={toneClass(s.vsOnlyAdd)}
                                  hint="做T贡献"/>
                        <StatCard label="相对买入持有" value={pct(s.vsBuyHold)} tone={toneClass(s.vsBuyHold)}
                                  hint="策略超额"/>
                    </div>

                    <div className="chart-row">
                        <Panel title="K线 · 摊薄成本 · 买卖点" extra={
                            <span className="muted">红涨绿跌 · 紫线为摊薄成本</span>
                        }>
                            <EChart option={klineOpt} height={300} empty={!result.kline?.length}/>
                        </Panel>

                        <Panel title="净值曲线对比" extra={
                            <span className="muted">做T / 只补仓 / 买入持有</span>
                        }>
                            <EChart option={equityOpt} height={300}
                                    empty={!result.benchmarks?.curves?.length}/>
                        </Panel>
                    </div>

                    <Panel title={`交易明细（${filtered.length} 笔）`} extra={
                        <button type="button" className="link-btn" onClick={() => setTradesOpen((v) => !v)}>
                            {tradesOpen ? '收起' : '展开'}
                        </button>
                    }>
                        {tradesOpen ? (
                            <>
                            <div className="trade-tools">
                                <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                                    <option value="">全部动作</option>
                                    {actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>)}
                                </select>
                                <button type="button" className="link-btn" onClick={exportTrades}>导出 CSV</button>
                            </div>
                            <div className="table-wrap short">
                                <table className="data-table">
                                    <thead><tr>
                                        <th>日期</th><th>动作</th><th>价格</th><th>数量</th>
                                        <th>金额</th><th>费用</th><th>已实现盈亏</th><th>说明</th>
                                    </tr></thead>
                                    <tbody>
                                    {filtered.map((t, i) => (
                                        <tr key={i}>
                                            <td>{t.tradeDate}</td>
                                            <td><span className={`tag tag-${t.action}`}>{ACTION_LABEL[t.action] || t.action}</span></td>
                                            <td>{money(t.price)}</td><td>{t.qty}</td>
                                            <td>{money(t.amount)}</td><td>{money(t.fee)}</td>
                                            <td className={toneClass(t.realizedPnl)}>{t.realizedPnl == null ? '-' : money(t.realizedPnl)}</td>
                                            <td className="note-cell" title={t.note}>{t.note}</td>
                                        </tr>
                                    ))}
                                    {!filtered.length ? <tr><td colSpan={8} className="empty-row">暂无成交</td></tr> : null}
                                    </tbody>
                                </table>
                            </div>
                            </>
                        ) : <p className="muted pad">共 {filtered.length} 笔成交，点击「展开」查看逐笔价格、数量与费用。</p>}
                    </Panel>

                    <Panel title="每日快照" extra={
                        <button type="button" className="link-btn" onClick={() => setDailyOpen((v) => !v)}>
                            {dailyOpen ? '收起' : `展开（${result.daily?.length || 0} 日）`}
                        </button>
                    }>
                        {dailyOpen ? (
                            <div className="table-wrap short">
                                <table className="data-table">
                                    <thead><tr>
                                        <th>日期</th><th>收盘</th><th>持仓</th><th>可卖</th>
                                        <th>现金</th><th>净值</th><th>摊薄成本</th><th>总盈亏</th><th>事件</th>
                                    </tr></thead>
                                    <tbody>
                                    {(result.daily || []).map((d, i) => (
                                        <tr key={i}>
                                            <td>{d.tradeDate}</td><td>{money(d.close)}</td>
                                            <td>{d.qty}</td><td>{d.sellableQty}</td>
                                            <td>{money(d.cash)}</td><td>{money(d.equity)}</td>
                                            <td>{money(d.dilutedCost)}</td>
                                            <td className={toneClass(d.totalPnl)}>{money(d.totalPnl)}</td>
                                            <td>{d.events}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="muted pad">点击展开查看每日持仓、摊薄成本与盈亏曲线数据。</p>}
                    </Panel>

                    {result.warnings?.length ? (
                        <div className="warnings">
                            <div className="warnings-head">
                                <span>{result.warnings.length} 条模型假设与风险提示</span>
                                <button type="button" className="link-btn" onClick={() => setWarnOpen((v) => !v)}>
                                    {warnOpen ? '收起' : '展开'}
                                </button>
                            </div>
                            {warnOpen ? result.warnings.map((w, i) => <p key={i}>· {w}</p>) : null}
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
