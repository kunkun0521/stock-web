import { useMemo, useState } from 'react';
import { QCard, QBar, QBtn, QBadge, QEmpty, QTabs } from './QuantParts.jsx';
import { num, int, pct } from './format.js';

/**
 * 今日信号：对最新交易日跑所有策略，输出买入候选 + 触发明细 + 历史参考。
 * 数据由 /signals/scan 现算（同一快照 + 参数有 10 分钟缓存），也可查看已落库的历史信号。
 */
export default function SignalsPanel({ strategies, scan, scanning, onScan, onOpenStock }) {
    const [tab, setTab] = useState('');
    const items = scan?.items || [];
    const counts = scan?.counts || {};

    const tabs = useMemo(() => (strategies || []).map((s) => ({
        value: s.key,
        label: `${s.name} ${counts[s.key] ?? 0}`,
    })), [strategies, counts]);

    const active = tab || (tabs[0]?.value ?? '');
    const rows = items.filter((it) => it.strategyKey === active);
    const strategyName = strategies?.find((s) => s.key === active)?.name || active;
    const ref = rows[0]?.ref || null;
    const refText = ref
        ? ['H5', 'H10', 'H20']
            .filter((h) => ref[h])
            .map((h) => `${h.replace('H', '')}日 胜率 ${ref[h].winRate == null ? '-' : pct(ref[h].winRate, 0)}（${int(ref[h].cnt)} 次）`)
            .join(' · ')
        : '';

    return (
        <div className="quant-stack">
            <QBar>
                <QBtn variant="primary" loading={scanning} loadingText="扫描全市场…" onClick={onScan}>
                    扫描最新交易日
                </QBtn>
                <span className="ga-muted">
                    {scan?.scanDate ? `扫描日 ${scan.scanDate}` : '尚未扫描'}
                    {scan?.snapshot ? ` · 快照 ${scan.snapshot}` : ''}
                    {scan?.note ? ` · ${scan.note}` : ''}
                </span>
            </QBar>

            {!scan ? (
                <QCard title="今日信号">
                    <div className="quant-empty-guide">
                        <p>点击「扫描最新交易日」，系统会对全市场运行已启用的策略，输出次日买入候选。</p>
                        <ul className="ga-muted">
                            <li>信号在 T 日收盘后生成，T+1 开盘成交；页面展示的收盘价仅作参考。</li>
                            <li>每个候选附带触发条件明细（实际值 vs 阈值）、建议止损价与同策略历史胜率。</li>
                            <li>首次扫描需要计算全市场指标，约数秒；同一快照内重复扫描走缓存。</li>
                        </ul>
                    </div>
                </QCard>
            ) : (
                <QCard title={`候选清单 · ${strategyName}`} flush
                       extra={<span className="ga-muted">{rows.length} 只（每策略最多 50）</span>}>
                    <QTabs items={tabs} value={active} onChange={setTab}/>
                    {rows.length ? (
                        <div className="ga-table-wrap">
                            <table className="ga-table quant-signal-table">
                                <thead><tr>
                                    <th>代码 / 市场</th><th>评分</th><th>收盘</th><th>建议止损</th>
                                    <th>触发条件</th><th>风险</th>
                                </tr></thead>
                                <tbody>
                                {rows.map((r) => (
                                    <tr key={`${r.strategyKey}-${r.code}`} className={onOpenStock ? 'ga-row-link' : ''}
                                        onClick={onOpenStock ? () => onOpenStock(r) : undefined}>
                                        <td>
                                            <div className="ga-picks-name">
                                                <span className="ga-mono">{r.code}</span>
                                                <span className="ga-picks-cn ga-muted">{r.market} · {r.board}</span>
                                            </div>
                                        </td>
                                        <td className="ga-num">{num(r.score, 1)}</td>
                                        <td className="ga-num">{num(r.closePrice, 2)}</td>
                                        <td className="ga-num">{r.stopPrice ? num(r.stopPrice, 2) : '-'}</td>
                                        <td className="ga-wrap quant-signal-detail">{r.detail?.text || '-'}</td>
                                        <td>
                                            {r.risk?.length
                                                ? r.risk.map((t) => <QBadge key={t} tone="warn">{t}</QBadge>)
                                                : <span className="ga-muted">—</span>}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <QEmpty text="该策略今日没有候选；可换策略或等收盘数据更新后重扫"/>}
                    {refText ? (
                        <div className="quant-ref-strip">
                            历史参考（同策略同参数，事件研究去重后）：{refText}
                        </div>
                    ) : null}
                </QCard>
            )}
        </div>
    );
}
