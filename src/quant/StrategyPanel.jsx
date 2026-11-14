import { useEffect, useMemo, useState } from 'react';
import { QCard, QBar, QField, QInput, QSelect, QBtn, QBadge, QEmpty } from './QuantParts.jsx';
import { pct, signedPct, num, int, duration, STATUS_CN, STATUS_TONE, TYPE_CN } from './format.js';
import ParamForm from './ParamForm.jsx';

const DEFAULT_CONFIG = {
    startDate: '', endDate: '', capital: '1000000', maxPositions: '10', maxWeightPct: '10',
    slippagePct: '0.1', fillPrice: 'OPEN', marketFilter: 'NONE',
    boards: ['MAIN', 'GEM'], allowSt: false, allowNewListing: false,
    minAmount20Wan: '0', cooldownDays: '3', limitUpAction: 'CANCEL', forceCloseAtEnd: false,
    commissionPct: '0.025', minCommission: '5', stampPct: '0.05', transferPct: '0.001', rfRate: '0.02',
};

const BOARD_OPTIONS = [
    { value: 'MAIN', label: '主板' },
    { value: 'GEM', label: '创业板' },
    { value: 'STAR', label: '科创板' },
];

const TYPE_TONE = { LEFT: 'accent', RIGHT: 'info', HYBRID: 'warn' };

export default function StrategyPanel({
    strategies, overview, task, submitting, onSubmit, onCancel, recent, onOpenTask,
}) {
    const [selected, setSelected] = useState('');
    const [paramsByKey, setParamsByKey] = useState({});
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [dateInit, setDateInit] = useState(false);

    useEffect(() => {
        if (!strategies?.length) return;
        setSelected((prev) => prev || strategies[0].key);
        setParamsByKey((prev) => {
            const next = { ...prev };
            strategies.forEach((s) => {
                if (!next[s.key]) next[s.key] = { ...s.defaults };
            });
            return next;
        });
    }, [strategies]);

    useEffect(() => {
        if (dateInit || !overview?.loaded) return;
        setConfig((c) => ({ ...c, startDate: overview.dateFrom || '', endDate: overview.dateTo || '' }));
        setDateInit(true);
    }, [overview, dateInit]);

    const current = useMemo(
        () => (strategies || []).find((s) => s.key === selected) || null,
        [strategies, selected],
    );
    const params = paramsByKey[selected] || {};

    const setConfigValue = (key) => (v) => setConfig((c) => ({ ...c, [key]: v }));
    const toggleBoard = (value) => setConfig((c) => {
        const has = c.boards.includes(value);
        const next = has ? c.boards.filter((b) => b !== value) : [...c.boards, value];
        return { ...c, boards: next.length ? next : c.boards };
    });
    const resetParams = () => setParamsByKey((p) => ({ ...p, [selected]: { ...current.defaults } }));

    const running = task && (task.status === 'RUNNING' || task.status === 'PENDING');

    const submit = () => {
        if (!current) return;
        onSubmit({
            strategyKey: current.key,
            params,
            config: { ...config, boards: config.boards },
        });
    };

    return (
        <div className="quant-strategy-layout">
            <div className="quant-strategy-list">
                {(strategies || []).map((s) => (
                    <button key={s.key} type="button"
                            className={`quant-strategy-card${s.key === selected ? ' is-active' : ''}`}
                            onClick={() => setSelected(s.key)}>
                        <div className="quant-strategy-head">
                            <strong>{s.name}</strong>
                            <QBadge tone={TYPE_TONE[s.type] || 'plain'}>{TYPE_CN[s.type] || s.type}</QBadge>
                        </div>
                        <div className="quant-strategy-key">{s.key} · v{s.version}</div>
                        <p className="quant-strategy-desc">{s.description}</p>
                        <div className="quant-strategy-meta">
                            <span>预热 {s.warmupBars} 日</span>
                            <span>{s.paramDefs.length} 个参数</span>
                            {s.lastBacktest?.metrics ? (
                                <span className={Number(s.lastBacktest.metrics.totalReturn) >= 0 ? 'ga-up' : 'ga-down'}>
                                    最近 {signedPct(s.lastBacktest.metrics.totalReturn, 1)}
                                </span>
                            ) : <span>未回测</span>}
                        </div>
                    </button>
                ))}
                {!strategies?.length ? <QEmpty text="策略尚未加载"/> : null}
            </div>

            <div className="quant-stack">
                {current ? (
                    <>
                        <QCard title="回测配置"
                               extra={<span className="ga-muted">T 日收盘出信号 · T+1 开盘成交</span>}>
                            <QBar>
                                <QField label="起始日期">
                                    <QInput type="date" value={config.startDate}
                                            onChange={setConfigValue('startDate')}/>
                                </QField>
                                <QField label="结束日期">
                                    <QInput type="date" value={config.endDate}
                                            onChange={setConfigValue('endDate')}/>
                                </QField>
                                <QField label="初始资金" hint="元">
                                    <QInput type="number" min="10000" value={config.capital}
                                            onChange={setConfigValue('capital')}/>
                                </QField>
                                <QField label="最大持仓" hint="只">
                                    <QInput type="number" min="1" max="50" value={config.maxPositions}
                                            onChange={setConfigValue('maxPositions')}/>
                                </QField>
                                <QField label="单票上限" hint="% 总资产">
                                    <QInput type="number" min="1" max="100" step="1"
                                            value={config.maxWeightPct}
                                            onChange={setConfigValue('maxWeightPct')}/>
                                </QField>
                                <QField label="滑点" hint="%">
                                    <QInput type="number" min="0" max="5" step="0.05"
                                            value={config.slippagePct}
                                            onChange={setConfigValue('slippagePct')}/>
                                </QField>
                                <QField label="成交价">
                                    <QSelect value={config.fillPrice} onChange={setConfigValue('fillPrice')}
                                             options={[
                                                 { value: 'OPEN', label: 'T+1 开盘价' },
                                                 { value: 'VWAP', label: 'T+1 均价（额/量）' },
                                                 { value: 'CLOSE', label: 'T+1 收盘价' },
                                             ]}/>
                                </QField>
                                <QField label="大盘过滤" hint="等权指数 vs MA60">
                                    <QSelect value={config.marketFilter}
                                             onChange={setConfigValue('marketFilter')}
                                             options={[
                                                 { value: 'NONE', label: '不过滤' },
                                                 { value: 'BULL_ONLY', label: '仅多头市场开仓' },
                                                 { value: 'BEAR_ONLY', label: '仅空头市场开仓' },
                                             ]}/>
                                </QField>
                                <QField label="板块">
                                    <div className="ga-row">
                                        {BOARD_OPTIONS.map((b) => (
                                            <label key={b.value} className="ga-toggle">
                                                <input type="checkbox" checked={config.boards.includes(b.value)}
                                                       onChange={() => toggleBoard(b.value)}/>
                                                {b.label}
                                            </label>
                                        ))}
                                    </div>
                                </QField>
                                <QField label="股票池">
                                    <div className="ga-row">
                                        <label className="ga-toggle">
                                            <input type="checkbox" checked={config.allowSt}
                                                   onChange={(e) => setConfigValue('allowSt')(e.target.checked)}/>
                                            含 ST
                                        </label>
                                        <label className="ga-toggle">
                                            <input type="checkbox" checked={config.allowNewListing}
                                                   onChange={(e) => setConfigValue('allowNewListing')(e.target.checked)}/>
                                            含次新
                                        </label>
                                        <label className="ga-toggle">
                                            <input type="checkbox" checked={config.forceCloseAtEnd}
                                                   onChange={(e) => setConfigValue('forceCloseAtEnd')(e.target.checked)}/>
                                            期末强平
                                        </label>
                                    </div>
                                </QField>
                                <QField label="成交额下限" hint="20 日均额（万元）">
                                    <QInput type="number" min="0" step="500"
                                            value={config.minAmount20Wan}
                                            onChange={setConfigValue('minAmount20Wan')}/>
                                </QField>
                            </QBar>

                            <details className="quant-advanced">
                                <summary>成本与撮合细节（默认按现行标准）</summary>
                                <QBar>
                                    <QField label="佣金" hint="% 双向">
                                        <QInput type="number" step="0.001" value={config.commissionPct}
                                                onChange={setConfigValue('commissionPct')}/>
                                    </QField>
                                    <QField label="最低佣金" hint="元">
                                        <QInput type="number" step="1" value={config.minCommission}
                                                onChange={setConfigValue('minCommission')}/>
                                    </QField>
                                    <QField label="印花税" hint="% 卖出">
                                        <QInput type="number" step="0.001" value={config.stampPct}
                                                onChange={setConfigValue('stampPct')}/>
                                    </QField>
                                    <QField label="过户费" hint="% 双向">
                                        <QInput type="number" step="0.001" value={config.transferPct}
                                                onChange={setConfigValue('transferPct')}/>
                                    </QField>
                                    <QField label="涨停处理">
                                        <QSelect value={config.limitUpAction}
                                                 onChange={setConfigValue('limitUpAction')}
                                                 options={[
                                                     { value: 'CANCEL', label: '取消订单' },
                                                     { value: 'DELAY', label: '顺延一日' },
                                                 ]}/>
                                    </QField>
                                    <QField label="再入场冷却" hint="交易日">
                                        <QInput type="number" min="0" max="60" value={config.cooldownDays}
                                                onChange={setConfigValue('cooldownDays')}/>
                                    </QField>
                                    <QField label="无风险利率" hint="% 年化">
                                        <QInput type="number" step="0.1" value={config.rfRate}
                                                onChange={setConfigValue('rfRate')}/>
                                    </QField>
                                </QBar>
                            </details>
                        </QCard>

                        <QCard title={<span>{current.name} · 参数</span>}
                               extra={<QBtn sm variant="ghost" onClick={resetParams}>恢复默认</QBtn>}>
                            <ParamForm defs={current.paramDefs} values={params}
                                       onChange={(v) => setParamsByKey((p) => ({ ...p, [selected]: v }))}/>
                            <div className="ga-note" style={{ marginTop: 10 }}>
                                {current.fit}
                                <span className="ga-muted">（参数变更会在下一次回测生效，历史结果仍按当时参数保留）</span>
                            </div>
                        </QCard>

                        <div className="quant-run-row">
                            <QBtn variant="primary" loading={!!submitting || running}
                                   loadingText={running ? '回测运行中…' : '提交中…'}
                                   onClick={submit}>
                                {running ? '回测运行中' : '开始回测（含事件研究）'}
                            </QBtn>
                            {running ? (
                                <QBtn variant="danger" sm onClick={onCancel}>取消任务</QBtn>
                            ) : null}
                            <span className="ga-muted">
                                全市场 {int(overview?.stockCount)} 只 / {int(overview?.dateCount)} 个交易日，
                                一次回测同时产出绩效与事件研究
                            </span>
                        </div>

                        {task ? (
                            <QCard title={`当前任务 #${task.id}`} extra={
                                <QBadge tone={STATUS_TONE[task.status] || 'plain'}>
                                    {STATUS_CN[task.status] || task.status}
                                </QBadge>
                            }>
                                <div className="quant-progress">
                                    <div className="quant-progress-track">
                                        <i style={{ width: `${Math.max(2, task.progress || 0)}%` }}/>
                                    </div>
                                    <span>{task.progress || 0}% · {task.stage || '—'}</span>
                                </div>
                                {task.errorMsg ? (
                                    <div className="ga-note ga-note--err">{task.errorMsg}</div>
                                ) : null}
                                {task.status === 'SUCCESS' ? (
                                    <div className="ga-row" style={{ marginTop: 8 }}>
                                        <QBtn sm variant="primary" onClick={() => onOpenTask(task.id)}>
                                            查看回测结果
                                        </QBtn>
                                        <span className="ga-muted">
                                            交易 {int(task.summary?.tradeCount)} 笔 ·
                                            用时 {duration(task.durationMs)}
                                        </span>
                                    </div>
                                ) : null}
                            </QCard>
                        ) : null}
                    </>
                ) : null}

                <QCard title="最近回测" flush extra={<span className="ga-muted">点击行查看结果</span>}>
                    {recent?.length ? (
                        <div className="ga-table-wrap">
                            <table className="ga-table">
                                <thead><tr>
                                    <th>#</th><th>策略</th><th>区间</th><th>状态</th>
                                    <th>总收益</th><th>夏普</th><th>交易</th><th>用时</th><th>创建时间</th>
                                </tr></thead>
                                <tbody>
                                {recent.map((r) => (
                                    <tr key={r.id} className="ga-row-link" onClick={() => onOpenTask(r.id)}>
                                        <td className="ga-mono">{r.id}</td>
                                        <td>{strategies?.find((s) => s.key === r.strategyKey)?.name || r.strategyKey}</td>
                                        <td>{r.startDate} ~ {r.endDate}</td>
                                        <td><QBadge tone={STATUS_TONE[r.status] || 'plain'}>
                                            {STATUS_CN[r.status] || r.status}
                                        </QBadge></td>
                                        <td className={(r.summary?.metrics?.totalReturn ?? 0) >= 0 ? 'ga-up' : 'ga-down'}>
                                            {r.summary?.metrics ? signedPct(r.summary.metrics.totalReturn, 1) : '-'}
                                        </td>
                                        <td className="ga-num">{r.summary?.metrics ? num(r.summary.metrics.sharpe, 2) : '-'}</td>
                                        <td className="ga-num">{r.summary?.metrics ? int(r.summary.metrics.tradeCount) : '-'}</td>
                                        <td>{duration(r.durationMs)}</td>
                                        <td className="ga-muted">{r.createdAt}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <QEmpty text="还没有回测记录"/>}
                </QCard>
            </div>
        </div>
    );
}
