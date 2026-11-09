import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLimitUpPool, price, pct, shortAmount } from '../api/limitUp.js';
import './limitUp.css';

/** 自动刷新间隔：收盘快照不是实时行情，60 秒足够。 */
const REFRESH_MS = 60_000;
const PREF_KEY = 'stock-web:limit-up:pref';

function readPref() {
    try {
        return { paused: false, collapsed: false, ...JSON.parse(window.localStorage.getItem(PREF_KEY) || '{}') };
    } catch {
        return { paused: false, collapsed: false };
    }
}

function writePref(patch) {
    try {
        window.localStorage.setItem(PREF_KEY, JSON.stringify({ ...readPref(), ...patch }));
    } catch {
        /* localStorage 不可用时忽略，仅影响偏好记忆 */
    }
}

function clockOf(iso) {
    if (!iso) return '--:--';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? '--:--'
        : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 一个滚动批次：内容重复两次配合 translateX(-50%) 做无缝循环。 */
function TickerGroup({ items, onPick }) {
    return (
        <div className="lu-group">
            {items.map((item) => (
                <button
                    type="button"
                    className="lu-item"
                    key={item.code}
                    onClick={() => onPick(item.code)}
                    title={`${item.name} ${item.code} · ${item.board} · 查看个股详情`}
                >
                    <span className="lu-name">{item.name}</span>
                    <span className="lu-code">{item.code}</span>
                    <span className="lu-price">¥{price(item.close)}</span>
                    <span className="lu-pct">{pct(item.pctChg)}</span>
                    {item.streak >= 2 ? <span className="lu-streak">{item.streak}板</span> : null}
                    {item.oneWord ? <span className="lu-one">一字</span> : null}
                </button>
            ))}
        </div>
    );
}

/**
 * 全站涨停播报条：挂在 App 外壳上，所有页面都能看到；滚动、暂停、收起状态跨页面保持。
 * 展开后是完整的涨停池面板（概览 / 板块分布 / 连板梯队 / 明细表 / 炸板名单）。
 */
export default function LimitUpTicker() {
    const navigate = useNavigate();
    const [pool, setPool] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [hovered, setHovered] = useState(false);
    const [open, setOpen] = useState(false);
    const [paused, setPaused] = useState(() => readPref().paused);
    const [collapsed, setCollapsed] = useState(() => readPref().collapsed);

    // 面板内筛选状态
    const [tab, setTab] = useState('sealed');
    const [boardFilter, setBoardFilter] = useState('');
    const [streakFilter, setStreakFilter] = useState(0);
    const [sortBy, setSortBy] = useState('streak');
    const [keyword, setKeyword] = useState('');

    const load = useCallback(async (force = false) => {
        setLoading(true);
        try {
            const data = await fetchLimitUpPool({ force });
            setPool(data);
            setError('');
        } catch (e) {
            setError(e?.message || '涨停数据加载失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(false);
    }, [load]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            // 页面不可见时不做无意义轮询
            if (!document.hidden) load(false);
        }, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [load]);

    const goto = (code) => {
        navigate(`/stocks/${code}`, {
            state: { from: window.location.pathname + window.location.search },
        });
        setOpen(false);
    };

    const togglePaused = () => {
        setPaused((v) => {
            writePref({ paused: !v });
            return !v;
        });
    };

    const toggleCollapsed = () => {
        setCollapsed((v) => {
            writePref({ collapsed: !v });
            return !v;
        });
        setOpen(false);
    };

    const stats = pool?.stats;
    const list = pool?.list || [];
    const broken = pool?.broken || [];
    const boards = useMemo(() => Object.keys(stats?.byBoard || {}).sort(), [stats]);
    const streaks = useMemo(
        () => Object.keys(stats?.byStreak || {})
            .map((k) => ({ label: k, count: stats.byStreak[k], value: parseInt(k, 10) }))
            .filter((x) => Number.isFinite(x.value))
            .sort((a, b) => b.value - a.value),
        [stats],
    );

    const filtered = useMemo(() => {
        const source = tab === 'broken' ? broken : list;
        const kw = keyword.trim().toLowerCase();
        let rows = source.filter((x) => {
            if (boardFilter && x.board !== boardFilter) return false;
            if (tab === 'sealed' && streakFilter && x.streak !== streakFilter) return false;
            if (kw && !`${x.name}${x.code}`.toLowerCase().includes(kw)) return false;
            return true;
        });
        const comparators = {
            streak: (a, b) => (b.streak || 0) - (a.streak || 0) || b.pctChg - a.pctChg,
            pctChg: (a, b) => b.pctChg - a.pctChg,
            amount: (a, b) => b.amount - a.amount,
            turnover: (a, b) => (b.turnover || 0) - (a.turnover || 0),
            code: (a, b) => a.code.localeCompare(b.code),
        };
        rows = [...rows].sort(comparators[sortBy] || comparators.streak);
        return rows;
    }, [list, broken, tab, boardFilter, streakFilter, sortBy, keyword]);

    const scrollDuration = Math.max(24, Math.min(90, list.length * 2.2));
    const isPaused = paused || hovered || open;

    // 整条收起后只保留一个可恢复的胶囊，不占用页面高度
    if (collapsed) {
        return (
            <div className="lu-collapsed-wrap">
                <button type="button" className="lu-restore" onClick={toggleCollapsed}
                        title="展开涨停播报（偏好会被记住）">
                    <span className="lu-dot"/> 涨停播报
                    {stats ? <strong>{stats.total}</strong> : null}
                    <span className="lu-restore-arrow">›</span>
                </button>
            </div>
        );
    }

    return (
        <div className={`lu-ticker${isPaused ? ' is-paused' : ''}`} onMouseEnter={() => setHovered(true)}
             onMouseLeave={() => setHovered(false)}>
            <div className="lu-bar">
                <div className="lu-label">
                    <span className="lu-dot"/>
                    <span>涨停播报</span>
                    <span className="lu-date">{pool?.tradeDate || '--'}</span>
                </div>

                <div className="lu-viewport">
                    {error ? (
                        <div className="lu-message">
                            <span>涨停数据暂不可用：{error}</span>
                            <button type="button" className="lu-link" onClick={() => load(true)}>重试</button>
                        </div>
                    ) : loading && !pool ? (
                        <div className="lu-message">正在加载涨停池…</div>
                    ) : list.length ? (
                        <div className="lu-track" style={{ '--lu-duration': `${scrollDuration}s` }}>
                            <TickerGroup items={list} onPick={goto}/>
                            <TickerGroup items={list} onPick={goto}/>
                        </div>
                    ) : (
                        <div className="lu-message">最近交易日暂无收盘封板的涨停股</div>
                    )}
                </div>

                <div className="lu-controls">
                    <span className="lu-count"
                          title="收盘封板家数 / 触板未封家数。按收盘价是否等于涨停价判定，与市场看板按涨幅 ≥9.8% 的近似口径不同">
                        封 <b>{stats?.total ?? '--'}</b>
                        <i>/</i> 炸 <b>{stats?.brokenCount ?? '--'}</b>
                    </span>
                    <button type="button" className="lu-icon-btn" onClick={() => load(true)} disabled={loading}
                            title="立即刷新涨停池" aria-label="立即刷新涨停池">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                             strokeLinecap="round" aria-hidden="true">
                            <path d="M20 11a8 8 0 1 0-2.3 5.7 M20 5v6h-6"/>
                        </svg>
                    </button>
                    <button type="button" className="lu-icon-btn" onClick={togglePaused}
                            title={paused ? '继续滚动' : '暂停滚动'} aria-label={paused ? '继续滚动' : '暂停滚动'}>
                        {paused ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7z M13 5h4v14h-4z"/></svg>
                        )}
                    </button>
                    <button type="button" className={`lu-detail-btn${open ? ' active' : ''}`}
                            onClick={() => setOpen((v) => !v)}>
                        涨停池 {open ? '收起' : '明细'} <span>{open ? '▴' : '▾'}</span>
                    </button>
                    <button type="button" className="lu-icon-btn lu-fold" onClick={toggleCollapsed}
                            title="收起播报条" aria-label="收起播报条">×</button>
                </div>
            </div>

            {open ? (
                <div className="lu-panel">
                    <div className="lu-panel-head">
                        <div>
                            <strong>涨停池明细</strong>
                            <span className="lu-panel-sub">
                                {pool?.tradeDate || '--'} 收盘快照 · 更新于 {clockOf(pool?.updatedAt)} · 每 60 秒自动刷新
                            </span>
                        </div>
                        <button type="button" className="lu-icon-btn" onClick={() => setOpen(false)}
                                title="关闭明细" aria-label="关闭明细">×</button>
                    </div>

                    <div className="lu-stat-row">
                        <div className="lu-stat"><span>封板家数</span><b className="up">{stats?.total ?? '--'}</b></div>
                        <div className="lu-stat"><span>首板 / 连板</span><b>{stats?.firstBoard ?? '--'} / {stats?.multiBoard ?? '--'}</b></div>
                        <div className="lu-stat"><span>最高连板</span><b className="up">{stats?.maxStreak ? `${stats.maxStreak}板` : '--'}</b></div>
                        <div className="lu-stat"><span>一字板</span><b>{stats?.oneWord ?? '--'}</b></div>
                        <div className="lu-stat"><span>封板率</span><b>{stats ? `${stats.sealRate}%` : '--'}</b></div>
                        <div className="lu-stat"><span>涨停股成交额</span><b>{stats ? `¥${shortAmount(stats.totalAmount)}` : '--'}</b></div>
                    </div>

                    <div className="lu-dist-row">
                        <div className="lu-dist">
                            <div className="lu-dist-title">板块分布</div>
                            <div className="lu-dist-body">
                                {boards.length ? boards.map((b) => {
                                    const n = stats.byBoard[b];
                                    const w = Math.max(4, Math.round((n / Math.max(1, stats.total)) * 100));
                                    return (
                                        <button type="button" key={b}
                                                className={`lu-chip${boardFilter === b ? ' active' : ''}`}
                                                onClick={() => setBoardFilter(boardFilter === b ? '' : b)}>
                                            {b} <b>{n}</b>
                                            <span className="lu-chip-bar" style={{ width: `${w}%` }}/>
                                        </button>
                                    );
                                }) : <span className="lu-empty">暂无数据</span>}
                            </div>
                        </div>
                        <div className="lu-dist">
                            <div className="lu-dist-title">连板梯队 <small>点击筛选 · 回溯近 {pool?.historyDays ?? 5} 个交易日</small></div>
                            <div className="lu-dist-body">
                                {streaks.length ? streaks.map((s) => (
                                    <button type="button" key={s.label}
                                            className={`lu-chip${streakFilter === s.value ? ' active' : ''}`}
                                            onClick={() => setStreakFilter(streakFilter === s.value ? 0 : s.value)}>
                                        {s.label} <b>{s.count}</b>
                                    </button>
                                )) : <span className="lu-empty">暂无数据</span>}
                            </div>
                        </div>
                        <div className="lu-dist">
                            <div className="lu-dist-title">涨跌幅档位</div>
                            <div className="lu-dist-body">
                                {Object.keys(stats?.byRatio || {}).length
                                    ? Object.entries(stats.byRatio).map(([k, n]) => (
                                        <span className="lu-chip static" key={k}>{k} <b>{n}</b></span>
                                    ))
                                    : <span className="lu-empty">暂无数据</span>}
                            </div>
                        </div>
                    </div>

                    <div className="lu-toolbar">
                        <div className="lu-tabs">
                            <button type="button" className={tab === 'sealed' ? 'active' : ''}
                                    onClick={() => setTab('sealed')}>封板 {stats?.total ?? 0}</button>
                            <button type="button" className={tab === 'broken' ? 'active' : ''}
                                    onClick={() => { setTab('broken'); setStreakFilter(0); }}>
                                触板未封 {stats?.brokenCount ?? 0}
                            </button>
                        </div>
                        <input className="lu-search" value={keyword} placeholder="搜索名称 / 代码"
                               onChange={(e) => setKeyword(e.target.value)}/>
                        <select className="lu-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                            <option value="streak">按连板数</option>
                            <option value="pctChg">按涨幅</option>
                            <option value="amount">按成交额</option>
                            <option value="turnover">按换手率</option>
                            <option value="code">按代码</option>
                        </select>
                        {(boardFilter || streakFilter || keyword) ? (
                            <button type="button" className="lu-link"
                                    onClick={() => { setBoardFilter(''); setStreakFilter(0); setKeyword(''); }}>
                                清除筛选
                            </button>
                        ) : null}
                        <span className="lu-row-count">共 {filtered.length} 条 · 点击行查看个股详情</span>
                    </div>

                    <div className="lu-table-wrap">
                        <table className="lu-table">
                            <thead>
                            <tr>
                                <th>股票</th><th>板块</th><th>收盘价</th><th>涨跌幅</th>
                                <th>连板</th><th>标记</th><th>成交额</th><th>换手率</th>
                            </tr>
                            </thead>
                            <tbody>
                            {filtered.map((x) => (
                                <tr key={x.code} onClick={() => goto(x.code)} title="查看个股详情">
                                    <td><span className="lu-name">{x.name}</span><span className="lu-code">{x.code}</span></td>
                                    <td>{x.board}</td>
                                    <td>¥{price(x.close)}</td>
                                    <td className="up">{pct(x.pctChg)}</td>
                                    <td>{x.streak ? <span className="lu-streak">{x.streak}板</span> : '—'}</td>
                                    <td>
                                        {x.oneWord ? <span className="lu-tag one">一字</span> : null}
                                        {x.st ? <span className="lu-tag st">ST</span> : null}
                                        {tab === 'broken' ? <span className="lu-tag broken">炸板</span> : null}
                                        {!x.oneWord && !x.st && tab !== 'broken' ? <span className="muted">—</span> : null}
                                    </td>
                                    <td>¥{shortAmount(x.amount)}</td>
                                    <td>{Number.isFinite(x.turnover) ? `${x.turnover.toFixed(2)}%` : '--'}</td>
                                </tr>
                            ))}
                            {!filtered.length ? (
                                <tr><td colSpan={8} className="lu-empty-row">
                                    {loading ? '正在加载…' : '没有符合条件的股票'}
                                </td></tr>
                            ) : null}
                            </tbody>
                        </table>
                    </div>

                    <div className="lu-foot">
                        <span>
                            口径：收盘价 ≈ 涨停价（按 5% / 10% / 20% / 30% 逐档匹配）判为封板；最高价触板但收盘未封记为炸板；
                            连板数按近 {pool?.historyDays ?? 5} 个交易日涨幅榜近似回溯，普涨日可能略有低估。
                            数据来自本地日线收盘快照，非实时行情，与「市场看板」按 ≥9.8% 的近似统计口径不同。
                        </span>
                        <span className="lu-risk">仅用于数据查看，不构成投资建议</span>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
