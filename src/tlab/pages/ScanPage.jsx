import { useMemo, useState } from 'react';
import EChart from '../components/EChart.jsx';
import StockCodeInput, { resolveStock } from '../components/StockCodeInput.jsx';
import { ErrorBanner, Loading, Panel, StatCard } from '../components/UI.jsx';
import { scanBarOption } from '../charts.js';
import { tLabApi as tApi } from '../../api/tLab.js';
import { fmtNum, money, pct, toneClass } from '../utils.js';

export default function ScanPage({ onJumpToSimulate }) {
    const [form, setForm] = useState({
        // 初始仓位 = totalCapital × initPositionRatio，需能买到 100 股整手，否则所有窗口都会「未建仓」
        code: '600519', stockName: '贵州茅台', totalCapital: '1000000', availableCash: '800000',
        holdDays: '20', initPositionRatio: '30', fromDate: '',
    });
    const [result, setResult] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [featureFilter, setFeatureFilter] = useState('');

    const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const run = async () => {
        setRunning(true);
        setError('');
        try {
            const picked = await resolveStock(form.code);
            if (picked.code !== form.code) {
                setForm((f) => ({ ...f, code: picked.code, stockName: picked.name || f.stockName }));
            }
            const data = await tApi.scan({
                code: picked.code,
                fromDate: form.fromDate || undefined,
                totalCapital: Number(form.totalCapital),
                availableCash: Number(form.availableCash),
                holdDays: Number(form.holdDays),
                initPositionRatio: Number(form.initPositionRatio) / 100,
            });
            setResult(data);
        } catch (e) {
            setError(e.message || '扫描失败');
        } finally {
            setRunning(false);
        }
    };

    const barOpt = useMemo(() => result ? scanBarOption(result.rows) : null, [result]);
    const buckets = (result?.featureBuckets || [])
        .filter((b) => !featureFilter || b.feature === featureFilter);
    const features = [...new Set((result?.featureBuckets || []).map((b) => b.feature))];
    const signal = result?.currentSignal || {};
    const stability = result?.stability || {};

    return (
        <div className="scan-layout">
            <Panel title="扫描参数" extra={<span className="muted">逐日假设买入并回放同一策略</span>}>
                <div className="form-grid inline">
                    <label className="field">股票代码 / 名称
                        <StockCodeInput value={form.code} name={form.stockName}
                                        onChange={(v) => setForm((f) => ({ ...f, code: v, stockName: '' }))}
                                        onPick={(item) => setForm((f) => ({ ...f, code: item.code, stockName: item.name }))}/>
                    </label>
                    <label className="field">总资金（元）
                        <input value={form.totalCapital} onChange={(e) => update('totalCapital', e.target.value)}/>
                    </label>
                    <label className="field">可支配资金（元）
                        <input value={form.availableCash} onChange={(e) => update('availableCash', e.target.value)}/>
                    </label>
                    <label className="field">持有交易日
                        <input value={form.holdDays} onChange={(e) => update('holdDays', e.target.value)}/>
                    </label>
                    <label className="field">初始仓位（%）
                        <input value={form.initPositionRatio} onChange={(e) => update('initPositionRatio', e.target.value)}/>
                    </label>
                    <label className="field">扫描起点
                        <input type="date" value={form.fromDate} onChange={(e) => update('fromDate', e.target.value)}/>
                    </label>
                    <button type="button" className="primary-btn" disabled={running} onClick={run}>
                        {running ? '扫描中…' : '开始扫描'}
                    </button>
                </div>
            </Panel>

            <ErrorBanner message={error} onClose={() => setError('')}/>
            <Loading show={running}/>

            {!result && !running ? (
                <div className="empty-hint">
                    <h3>买入日扫描</h3>
                    <p>对每个交易日假设「次一交易日开盘买入」并回放 holdDays 天，
                       统计买入日特征（RSI、偏离均线、前期涨跌幅等）与结果的关系，并回答当前是否处于有利条件。</p>
                </div>
            ) : null}

            {result ? (
                <>
                    <div className="stat-grid four">
                        <StatCard label="股票" value={`${result.code} ${result.name}`} tone="plain"
                                  hint={`持有 ${result.holdDays} 个交易日`}/>
                        <StatCard label="窗口数" value={result.windowCount} tone="plain"
                                  hint={`${result.rangeStart || '-'} ~ ${result.rangeEnd || '-'}`}/>
                        <StatCard label="前70%平均收益" value={pct(stability.firstPeriodAvgReturn)}
                                  tone={toneClass(stability.firstPeriodAvgReturn)} hint="训练段"/>
                        <StatCard label="后30%平均收益" value={pct(stability.secondPeriodAvgReturn)}
                                  tone={toneClass(stability.secondPeriodAvgReturn)} hint="验证段"/>
                    </div>

                    <div className="two-cols">
                        <Panel title={`各买入日策略收益（${result.rows?.length || 0} 个窗口）`}
                               extra={<span className="muted">红涨绿跌 · 点击柱条跳转该日回本模拟</span>}>
                            <EChart option={barOpt} height={240} empty={!result.rows?.length}
                                    onClick={(p) => {
                                        const row = result.rows?.[p.dataIndex];
                                        if (row?.buyDate) onJumpToSimulate?.(row.buyDate);
                                    }}/>
                        </Panel>

                        <Panel title="当前信号" extra={<span className="muted">{signal.date || '-'}</span>}>
                            <div className={`signal-card ${signal.favorable ? 'favorable' : 'unfavorable'}`}>
                                <div className="signal-title">{signal.favorable ? '当前特征偏有利' : '当前特征不构成买入依据'}</div>
                                <div className="signal-value">历史分桶平均收益 {pct(signal.avgExpectedReturn)}</div>
                                <p>{signal.verdict}</p>
                            </div>
                            <div className="table-wrap mini">
                                <table className="data-table">
                                    <thead><tr><th>特征</th><th>当前值</th><th>样本</th><th>胜率</th><th>平均收益</th></tr></thead>
                                    <tbody>
                                    {(signal.hits || []).map((h, i) => (
                                        <tr key={i}>
                                            <td>{h.featureLabel}{h.insufficient ? <em className="muted"> 样本不足</em> : null}</td>
                                            <td>{fmtNum(h.value, 4)}</td>
                                            <td>{h.samples}</td>
                                            <td>{pct(h.winRate)}</td>
                                            <td className={toneClass(h.avgReturn)}>{pct(h.avgReturn)}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    </div>

                    <div className={`stability ${stability.consistent ? '' : 'warn'}`}>
                        <b>稳健性：</b>{stability.message}
                    </div>

                    <div className="two-cols">
                        <Panel title="推荐买入日" extra={<span className="muted">按综合得分 · 点击跳转</span>}>
                            <div className="table-wrap mini">
                                <table className="data-table">
                                    <thead><tr><th>买入日</th><th>得分</th><th>策略收益</th><th>最大回撤</th><th>回本天数</th><th>做T</th></tr></thead>
                                    <tbody>
                                    {(result.recommendations || []).map((r, i) => (
                                        <tr key={i} className="clickable" onClick={() => onJumpToSimulate?.(r.buyDate)}>
                                            <td>{r.buyDate}</td><td>{fmtNum(r.score, 2)}</td>
                                            <td className={toneClass(r.finalPnlPct)}>{pct(r.finalPnlPct)}</td>
                                            <td>{pct(r.maxDrawdown)}</td>
                                            <td>{r.recoverDays ?? '-'}</td><td>{r.tCount}</td>
                                        </tr>
                                    ))}
                                    {!result.recommendations?.length ? <tr><td colSpan={6} className="empty-row">无推荐</td></tr> : null}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>

                        <Panel title="特征分桶统计" extra={
                            <select value={featureFilter} onChange={(e) => setFeatureFilter(e.target.value)}>
                                <option value="">全部特征</option>
                                {features.map((f) => <option key={f} value={f}>
                                    {(result.featureBuckets.find((b) => b.feature === f) || {}).featureLabel || f}
                                </option>)}
                            </select>
                        }>
                            <div className="table-wrap mini">
                                <table className="data-table">
                                    <thead><tr><th>特征</th><th>区间</th><th>样本</th><th>胜率</th><th>平均收益</th><th>平均回撤</th></tr></thead>
                                    <tbody>
                                    {buckets.map((b, i) => (
                                        <tr key={i} className={b.insufficient ? 'insufficient' : ''}>
                                            <td>{b.featureLabel}{b.insufficient ? <em className="muted"> 样本不足</em> : null}</td>
                                            <td>{b.range}</td><td>{b.samples}</td>
                                            <td>{pct(b.winRate)}</td>
                                            <td className={toneClass(b.avgReturn)}>{pct(b.avgReturn)}</td>
                                            <td>{pct(b.avgDrawdown)}</td>
                                        </tr>
                                    ))}
                                    {!buckets.length ? <tr><td colSpan={6} className="empty-row">暂无分桶</td></tr> : null}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    </div>

                    {result.warnings?.length ? (
                        <div className="warnings">{result.warnings.map((w, i) => <p key={i}>· {w}</p>)}</div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
