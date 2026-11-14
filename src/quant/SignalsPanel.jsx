import { useEffect, useMemo, useState } from 'react';
import { QCard, QBar, QKpi, QBtn, QBadge, QTabs, QSelect, QInput, QPager } from './QuantParts.jsx';
import { num, int, pct } from './format.js';

/**
 * 今日信号：对最新交易日跑所有策略，输出买入候选 + 触发明细 + 历史参考。
 * 数据由 /signals/scan 现算（同一快照 + 参数有 10 分钟缓存），也可查看已落库的历史信号。
 *
 * 当前策略受控于父组件（写进 URL 的 ?s=）：空字符串表示「全部策略」聚合视图，
 * 从个股 K 线返回时能停在同一策略标签上。
 */

/** 空字符串 = 全部策略（这也是默认视图，先看全景再下钻单个策略）。 */
const ALL = '';

const BOARD_OPTIONS = [
    { value: '', label: '全部板块' },
    { value: 'MAIN', label: '主板' },
    { value: 'GEM', label: '创业板' },
    { value: 'STAR', label: '科创板' },
];

const RISK_OPTIONS = [
    { value: '', label: '全部风险' },
    { value: 'any', label: '仅有风险提示' },
    { value: 'none', label: '仅无风险提示' },
    { value: '接近涨停', label: '接近涨停' },
    { value: '流动性偏低', label: '流动性偏低' },
    { value: 'ST', label: 'ST' },
];

const SORT_OPTIONS = [
    { value: 'score', label: '评分 ↓' },
    { value: 'gap', label: '止损空间 ↓' },
    { value: 'code', label: '代码 ↑' },
];

const BOARD_CN = { MAIN: '主板', GEM: '创业板', STAR: '科创板' };

const numOf = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** 建议止损距收盘的空间：正数表示再跌多少触发止损，越大越抗噪。 */
const stopGap = (r) => {
    const close = numOf(r?.closePrice);
    const stop = numOf(r?.stopPrice);
    if (!close || !stop || stop >= close) return null;
    return (close - stop) / close;
};

const median = (list) => {
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export default function SignalsPanel({
    strategies, scan, scanning, onScan, onOpenStock, active = '', onActiveChange,
}) {
    const [kw, setKw] = useState('');
    const [board, setBoard] = useState('');
    const [risk, setRisk] = useState('');
    const [sort, setSort] = useState('score');
    const [expanded, setExpanded] = useState(() => new Set());
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const [elapsed, setElapsed] = useState(0);
    const [toast, setToast] = useState('');

    const items = scan?.items || [];
    const counts = scan?.counts || {};
    const strategyName = (key) => strategies?.find((s) => s.key === key)?.name || key;

    // 扫描中显示已等待秒数：全市场指标计算通常 3 秒左右，慢的时候能确认没卡住
    useEffect(() => {
        if (!scanning) {
            setElapsed(0);
            return undefined;
        }
        const t0 = Date.now();
        const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
        return () => clearInterval(timer);
    }, [scanning]);

    // 换策略 / 重新扫描后收起所有展开行，避免看到别的策略的残留明细
    useEffect(() => {
        setExpanded(new Set());
    }, [scan, active]);

    useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(() => setToast(''), 2600);
        return () => clearTimeout(timer);
    }, [toast]);

    const tabs = useMemo(() => [
        { value: ALL, label: `全部 ${items.length}` },
        ...(strategies || []).map((s) => ({ value: s.key, label: `${s.name} ${counts[s.key] ?? 0}` })),
    ], [strategies, counts, items.length]);

    // 当前策略范围（KPI 与列表都基于它；搜索/板块/风险只影响列表）
    const baseRows = active ? items.filter((r) => r.strategyKey === active) : items;

    const keyword = kw.trim().toLowerCase();
    const rows = useMemo(() => {
        const filtered = baseRows.filter((r) => {
            if (board && r.board !== board) return false;
            if (keyword) {
                const hay = `${r.code ?? ''} ${r.market ?? ''} ${BOARD_CN[r.board] || ''} ${strategyName(r.strategyKey)}`
                    .toLowerCase();
                if (!hay.includes(keyword)) return false;
            }
            const riskList = r.risk || [];
            if (risk === 'any' && !riskList.length) return false;
            if (risk === 'none' && riskList.length) return false;
            if (risk && risk !== 'any' && risk !== 'none' && !riskList.includes(risk)) return false;
            return true;
        });
        return filtered.sort((a, b) => {
            if (sort === 'code') return String(a.code ?? '').localeCompare(String(b.code ?? ''));
            if (sort === 'gap') return (stopGap(b) ?? -1) - (stopGap(a) ?? -1);
            return (numOf(b.score) ?? 0) - (numOf(a.score) ?? 0);
        });
    }, [baseRows, board, keyword, risk, sort]); // eslint-disable-line react-hooks/exhaustive-deps

    // 换策略 / 改筛选 / 重新扫描都回到第 1 页
    useEffect(() => {
        setPage(1);
    }, [scan, active, keyword, board, risk, sort]);

    const pages = Math.max(1, Math.ceil(rows.length / size));
    const safePage = Math.min(page, pages);
    const pageRows = rows.slice((safePage - 1) * size, safePage * size);

    // ---- 汇总（只看当前策略范围，不受搜索影响，避免数字随输入跳动）
    const codeCount = new Set(baseRows.map((r) => `${r.market}/${r.code}`)).size;
    const withSignal = Object.values(counts).filter((n) => Number(n) > 0).length;
    const strategyTotal = (strategies || []).length;
    const bestScore = baseRows.reduce((max, r) => Math.max(max, numOf(r.score) ?? 0), 0);
    const gaps = baseRows.map(stopGap).filter((v) => v != null);
    const medGap = median(gaps);
    const risky = baseRows.filter((r) => (r.risk || []).length);
    const riskDetail = ['接近涨停', '流动性偏低', 'ST']
        .map((tag) => {
            const n = risky.filter((r) => (r.risk || []).includes(tag)).length;
            return n ? `${tag} ${n}` : null;
        })
        .filter(Boolean)
        .join(' · ');

    const ref = active ? (baseRows[0]?.ref || null) : null;
    const refText = ref
        ? ['H5', 'H10', 'H20']
            .filter((h) => ref[h])
            .map((h) => `${h.replace('H', '')}日 胜率 ${ref[h].winRate == null ? '-' : pct(ref[h].winRate, 0)}（${int(ref[h].cnt)} 次）`)
            .join(' · ')
        : '';

    const toggleRow = (key) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const copyCodes = async () => {
        if (!rows.length) return;
        try {
            await navigator.clipboard.writeText(rows.map((r) => r.code).join(','));
            setToast(`已复制 ${rows.length} 个代码`);
        } catch (e) {
            setToast('复制失败，可改用导出 CSV');
        }
    };

    const exportCsv = () => {
        if (!rows.length) return;
        const head = ['代码', '市场', '板块', '策略', '评分', '收盘', '建议止损', '止损空间%', '触发条件', '风险'];
        const body = rows.map((r) => {
            const gap = stopGap(r);
            return [
                r.code, r.market, BOARD_CN[r.board] || r.board || '', strategyName(r.strategyKey),
                numOf(r.score)?.toFixed(1) ?? '', numOf(r.closePrice)?.toFixed(2) ?? '',
                r.stopPrice ? numOf(r.stopPrice)?.toFixed(2) : '',
                gap == null ? '' : (gap * 100).toFixed(2),
                r.detail?.text || '', (r.risk || []).join(' / '),
            ];
        });
        const csv = `\ufeff${[head, ...body]
            .map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\r\n')}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `今日信号_${scan?.scanDate || 'scan'}_${active || '全部策略'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setToast(`已导出 ${rows.length} 条`);
    };

    const hasFilter = !!keyword || !!board || !!risk;

    return (
        <div className="quant-stack">
            <QBar>
                <QBtn variant="primary" loading={scanning}
                      loadingText={elapsed > 0 ? `扫描中 ${elapsed}s…` : '扫描全市场…'}
                      onClick={onScan}>
                    {scan ? '重新扫描' : '扫描最新交易日'}
                </QBtn>
                <span className="ga-muted">
                    {scan?.scanDate ? `扫描日 ${scan.scanDate}` : '尚未扫描'}
                    {scan?.snapshot ? ` · 快照 ${scan.snapshot}` : ''}
                    {scan ? ` · ${int(items.length)} 只候选 / ${int(strategyTotal)} 个策略` : ''}
                    {scan?.__savedAt ? ' · 已恢复上次扫描结果' : ''}
                </span>
                <span className="ga-muted quant-scan-hint">
                    {scanning
                        ? '正在计算全市场指标（约 3 秒），请勿重复点击'
                        : 'T 日收盘出信号，T+1 开盘成交；同一快照 10 分钟内重复扫描走缓存'}
                </span>
            </QBar>

            {!scan ? (
                <QCard title="今日信号">
                    <div className="quant-empty-guide">
                        <p>点击「扫描最新交易日」，系统会对全市场运行所有策略，输出次一交易日的买入候选。</p>
                        <ul className="ga-muted">
                            <li>扫描后先看到<strong>全部策略的合并清单</strong>，可切标签下钻到单个策略。</li>
                            <li>每行给出评分、建议止损价与「止损空间」、触发条件明细、风险标签，点行直接看 K 线。</li>
                            <li>支持按板块 / 风险筛选、按评分或止损空间排序，并可一键复制代码或导出 CSV。</li>
                            <li>首次扫描需要计算全市场指标，约数秒；同一快照内重复扫描走缓存。</li>
                        </ul>
                    </div>
                </QCard>
            ) : (
                <>
                    <div className="ga-kpi-grid quant-kpi-grid quant-kpi-grid--5">
                        <QKpi label={active ? `${strategyName(active)} 候选` : '候选标的'}
                              value={`${int(baseRows.length)} 只`}
                              hint={codeCount !== baseRows.length ? `去重后 ${int(codeCount)} 只` : '当前范围全部候选'}/>
                        <QKpi label="有信号策略" value={`${int(withSignal)} / ${int(strategyTotal)}`}
                              hint="本次扫描至少命中 1 只"/>
                        <QKpi label="最高评分" value={baseRows.length ? num(bestScore, 1) : '-'}
                              hint="当日候选内分项百分位加权"/>
                        <QKpi label="中位止损空间" value={medGap == null ? '-' : pct(medGap, 1)}
                              tone="plain"
                              hint={medGap == null ? '策略未给出止损价' : '距建议止损价，抗噪声余量'}/>
                        <QKpi label="带风险提示" value={`${int(risky.length)} 只`}
                              hint={riskDetail || '无涨停/流动性/ST 提示'}/>
                    </div>

                    <QCard title={active ? `候选清单 · ${strategyName(active)}` : '候选清单 · 全部策略'} flush
                           extra={<div className="ga-row">
                               <span className="ga-muted">
                                   {int(rows.length)} 只{(hasFilter || active) ? ` / 共 ${int(items.length)} 只` : ''}
                                   （每策略最多 50）
                               </span>
                               <QBtn sm onClick={copyCodes} disabled={!rows.length}>复制代码</QBtn>
                               <QBtn sm onClick={exportCsv} disabled={!rows.length}>导出 CSV</QBtn>
                               {toast ? <span className="quant-toast">{toast}</span> : null}
                           </div>}>
                        <div className="ga-picks-toolbar">
                            <QTabs items={tabs} value={active} onChange={(v) => onActiveChange?.(v)}/>
                            <div className="ga-row quant-signal-tools">
                                <QInput className="ga-picks-search" placeholder="搜索代码 / 板块 / 策略"
                                        value={kw} onChange={setKw}/>
                                <QSelect value={board} onChange={setBoard} options={BOARD_OPTIONS}/>
                                <QSelect value={risk} onChange={setRisk} options={RISK_OPTIONS}/>
                                <QSelect value={sort} onChange={setSort} options={SORT_OPTIONS}/>
                            </div>
                        </div>

                        {rows.length ? (
                            <>
                                <div className="ga-table-wrap">
                                    <table className="ga-table quant-signal-table">
                                        <thead><tr>
                                            <th className="ga-picks-rank">#</th>
                                            <th>代码 / 市场</th>
                                            {active ? null : <th>策略</th>}
                                            <th>评分</th>
                                            <th>收盘</th>
                                            <th>建议止损</th>
                                            <th>止损空间</th>
                                            <th>触发条件</th>
                                            <th>风险</th>
                                            <th>K 线</th>
                                        </tr></thead>
                                        <tbody>
                                        {pageRows.map((r, i) => {
                                            const rowKey = `${r.strategyKey}-${r.code}`;
                                            const gap = stopGap(r);
                                            const open = expanded.has(rowKey);
                                            const text = r.detail?.text || '-';
                                            return (
                                                <tr key={rowKey}
                                                    className={onOpenStock ? 'ga-row-link' : ''}
                                                    title={onOpenStock ? '点击查看该股 K 线，返回后仍停在本列表' : undefined}
                                                    onClick={onOpenStock ? () => onOpenStock(r) : undefined}>
                                                    <td className="ga-picks-rank">{(safePage - 1) * size + i + 1}</td>
                                                    <td>
                                                        <div className="ga-picks-name">
                                                            <span className="ga-mono">{r.code}</span>
                                                            <span className="ga-picks-cn ga-muted">
                                                                {r.market} · {BOARD_CN[r.board] || r.board || '-'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {active ? null : (
                                                        <td className="quant-strategy-tag">{strategyName(r.strategyKey)}</td>
                                                    )}
                                                    <td>
                                                        <div className="quant-score">
                                                            <span className="quant-score-num">{num(r.score, 1)}</span>
                                                            <span className="quant-score-track">
                                                                <i className="quant-score-fill"
                                                                   style={{ width: `${Math.max(2, Math.min(100, numOf(r.score) ?? 0))}%` }}/>
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="ga-num">{num(r.closePrice, 2)}</td>
                                                    <td className="ga-num">{r.stopPrice ? num(r.stopPrice, 2) : '-'}</td>
                                                    <td className="ga-num">
                                                        {gap == null ? '-' : pct(gap, 1)}
                                                    </td>
                                                    <td className="ga-wrap quant-signal-detail">
                                                        <div className={`quant-cell-text${open ? '' : ' is-clamp'}`}>{text}</div>
                                                        <button type="button" className="quant-expand"
                                                                onClick={(e) => { e.stopPropagation(); toggleRow(rowKey); }}>
                                                            {open ? '收起' : '展开'}
                                                        </button>
                                                    </td>
                                                    <td>
                                                        {r.risk?.length
                                                            ? r.risk.map((t) => <QBadge key={t} tone="warn">{t}</QBadge>)
                                                            : <span className="ga-muted">—</span>}
                                                    </td>
                                                    <td className="ga-nowrap">
                                                        {onOpenStock
                                                            ? <span className="quant-row-link">查看 →</span>
                                                            : <span className="ga-muted">—</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        </tbody>
                                    </table>
                                </div>

                                <QPager page={safePage} size={size} total={rows.length} pages={pages}
                                        onPage={setPage}
                                        onSize={(s) => { setSize(s); setPage(1); }}/>

                                <div className="quant-signal-legend">
                                    <span><b>评分</b> 当日候选内各分项横截面百分位加权 ×100，组内相对分，跨策略不宜直接比较</span>
                                    <span><b>止损空间</b> (收盘价 − 建议止损价) / 收盘价，越大越能扛住日内噪声</span>
                                    <span><b>风险</b> 由收盘涨幅、20 日均额、ST 标记推断，仅提示不拦截</span>
                                    <span>点行看 K 线，返回后仍在原列表、原位置</span>
                                    <span className="quant-legend-note">信号仅基于历史统计，不构成投资建议</span>
                                </div>
                            </>
                        ) : (
                            <div className="quant-empty-guide quant-signal-empty">
                                <p>
                                    {hasFilter
                                        ? '当前搜索 / 筛选下没有候选，换个条件试试。'
                                        : active
                                            ? `${strategyName(active)} 今日没有候选。`
                                            : '今日没有候选。'}
                                </p>
                                <div className="ga-row">
                                    {hasFilter ? (
                                        <QBtn sm onClick={() => { setKw(''); setBoard(''); setRisk(''); }}>
                                            清空筛选
                                        </QBtn>
                                    ) : null}
                                    {active ? (
                                        <QBtn sm onClick={() => onActiveChange?.(ALL)}>查看全部策略</QBtn>
                                    ) : null}
                                    <QBtn sm variant="ghost" onClick={onScan}>重新扫描</QBtn>
                                </div>
                            </div>
                        )}

                        {refText ? (
                            <div className="quant-ref-strip">
                                历史参考（同策略同参数，事件研究去重后）：{refText}
                            </div>
                        ) : null}
                    </QCard>
                </>
            )}
        </div>
    );
}
