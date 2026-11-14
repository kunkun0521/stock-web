import { useEffect, useRef, useState } from 'react';
import { subscribeApiPending } from '../hooks/useApi.js';
import { fmtInt, fmtNum, fmtText } from './gaUtils.js';
import Term from './GlossaryTerm.jsx';

/* ---------------------------------------------------------------- 卡片 / 栅格 */

/** 卡片容器：标题 + 右侧操作区。 */
export function Card({ title, extra, children, className = '', flush = false }) {
    return (
        <section className={`ga-card ${className}`}>
            {title ? (
                <header className="ga-card-head">
                    <h3 className="ga-card-title">{title}</h3>
                    {extra ? <div className="ga-card-extra">{extra}</div> : null}
                </header>
            ) : null}
            <div className={`ga-card-body${flush ? ' ga-flush' : ''}`}>{children}</div>
        </section>
    );
}

/** KPI 卡网格容器。 */
export function KpiGrid({ children }) {
    return <div className="ga-kpi-grid">{children}</div>;
}

/** 单张 KPI 卡。tone 取 up/down/accent/muted/plain；term 指向 glossary.js 的词条 id。 */
export function KpiCard({ label, value, hint, tone = 'plain', term }) {
    return (
        <div className="ga-kpi">
            <div className="ga-kpi-label">{label}{term ? <Term id={term}/> : null}</div>
            <div className={`ga-kpi-value ga-tone-${tone}`}>{value}</div>
            {hint ? <div className="ga-kpi-hint">{hint}</div> : null}
        </div>
    );
}

/* ---------------------------------------------------------------- 徽标 / 小标签 */

/** 状态徽标。tone 取 up/down/warn/info/accent/muted/plain。 */
export function Badge({ tone = 'plain', children, title }) {
    return <span className={`ga-badge ga-badge--${tone}`} title={title}>{children}</span>;
}

/** 行内小标签（回放 / 涨停等）。 */
export function Tag({ tone = '', children }) {
    return <span className={`ga-tag${tone ? ` ga-tag--${tone}` : ''}`}>{children}</span>;
}

/* ---------------------------------------------------------------- 状态：空 / 加载 / 错误 */

export function Empty({ text = '暂无数据' }) {
    return <div className="ga-empty">{text}</div>;
}

export function Loading({ text = '加载中…' }) {
    return <div className="ga-loading">{text}</div>;
}

/**
 * 请求失败的一级提示条。给出失败原因、排查步骤与重试入口，
 * 接口挂掉时页面骨架仍然完整，不会白屏。
 */
export function ErrorBox({ message, onRetry, compact = false }) {
    if (!message) return null;
    const text = typeof message === 'string' ? message : String(message);
    return (
        <div className="ga-error">
            <div className="ga-error-head">
                <span>数据加载失败</span>
                {onRetry ? (
                    <button type="button" className="ga-btn ga-btn--sm ga-btn--ghost" onClick={onRetry}>重试</button>
                ) : null}
            </div>
            <div className="ga-error-msg">{text}</div>
            {!compact ? (
                <ul className="ga-error-tips">
                    <li>请确认后端已启动，且 /api/ga 系列接口可访问</li>
                    <li>接口基址由 client.js 统一解析（同源 /api 或 VITE_API_BASE）</li>
                </ul>
            ) : null}
        </div>
    );
}

/**
 * 把 useApi 的 {data, loading, error, reload} 状态统一渲染：
 * 错误 → ErrorBox；首次加载 → Loading；空数据 → Empty；否则渲染 children(data)。
 * children 可传函数（拿到 data）或直接传节点。
 *
 * 已有数据时的再次加载（refreshing）不清空内容，而是把内容降透明度并屏蔽点击，
 * 让用户明确看到「正在更新」，同时不会误点旧数据。
 */
export function AsyncPanel({ state, isEmpty, emptyText = '暂无数据', children }) {
    const { data, loading, error, reload } = state || {};
    if (error) return <ErrorBox message={error} onRetry={reload}/>;
    if (loading && data === undefined) return <Loading/>;
    const blank = isEmpty ? isEmpty(data) : (data === undefined || data === null);
    if (blank) return <Empty text={emptyText}/>;
    const refreshing = Boolean(loading);
    return (
        <div className={`ga-busy${refreshing ? ' is-refreshing' : ''}`} aria-busy={refreshing || undefined}>
            {typeof children === 'function' ? children(data) : children}
        </div>
    );
}

/* ---------------------------------------------------------------- 筛选条 / 表单 */

export function FilterBar({ children }) {
    return <div className="ga-filters">{children}</div>;
}

export function Field({ label, children, hint }) {
    return (
        <label className="ga-field">
            <span className="ga-field-label">{label}{hint ? ` · ${hint}` : ''}</span>
            {children}
        </label>
    );
}

/** 下拉框。options 可为 [value,...] 或 [{value,label},...]。onChange 回传字符串。 */
export function Select({ value, onChange, options = [], className = '', title }) {
    const opts = options.map((o) => (o && typeof o === 'object' ? o : { value: o, label: String(o) }));
    return (
        <select className={`ga-select ${className}`} value={value ?? ''} title={title}
                onChange={(e) => onChange(e.target.value)}>
            {opts.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
        </select>
    );
}

/** 文本/数字/日期输入。onChange 回传字符串（数字由调用方自行转换或透传给接口）。 */
export function Input({ value, onChange, type = 'text', placeholder, min, max, step,
                          className = '', title }) {
    return (
        <input className={`ga-input ${className}`} type={type} value={value ?? ''}
               placeholder={placeholder} min={min} max={max} step={step} title={title}
               onChange={(e) => onChange(e.target.value)}/>
    );
}

export function TextArea({ value, onChange, placeholder, className = '' }) {
    return (
        <textarea className={`ga-textarea ${className}`} value={value ?? ''} placeholder={placeholder}
                  onChange={(e) => onChange(e.target.value)}/>
    );
}

/** 旋转指示器：用于按钮内联 loading。 */
export function Spinner({ className = '' }) {
    return <i className={`ga-spinner ${className}`} aria-hidden="true"/>;
}

/**
 * 按钮。传 loading 时自动禁用并显示转圈 + loadingText，
 * 让「点了没反应」的等待过程可见（后端慢时尤其重要）。
 */
export function Btn({
    variant = '', sm = false, className = '', loading = false, loadingText,
    disabled = false, children, ...rest
}) {
    const v = variant ? `ga-btn--${variant}` : '';
    return (
        <button type="button"
                className={`ga-btn ${v}${sm ? ' ga-btn--sm' : ''}${loading ? ' is-loading' : ''} ${className}`}
                disabled={disabled || loading}
                aria-busy={loading || undefined}
                {...rest}>
            {loading ? <><Spinner/>{loadingText || children}</> : children}
        </button>
    );
}

/**
 * 刷新按钮：把一组 useApi 状态的加载过程串成一条可见反馈。
 *
 *  - 点击后立即转圈并禁用，超过 1 秒显示已等待秒数（后端慢时能确认请求还活着）；
 *  - 全部结束后显示「已更新 HH:MM:SS」，失败则显示红色「刷新失败」；
 *  - 任何一路还在加载时按钮保持禁用，避免重复点击叠加请求。
 *
 * @param state  单个 useApi 返回值
 * @param states 多个 useApi 返回值（任一在加载都算忙）
 */
export function RefreshBtn({
    state, states, label = '刷新', onClick, variant = 'primary', sm = false, className = '',
}) {
    const list = (states || (state ? [state] : [])).filter(Boolean);
    const [waiting, setWaiting] = useState(false);
    const [doneAt, setDoneAt] = useState(0);
    const [seconds, setSeconds] = useState(0);

    const busy = waiting || list.some((s) => s.loading);
    const failed = list.some((s) => s.error);
    const updatedAt = Math.max(doneAt, 0, ...list.map((s) => s.updatedAt || 0));

    // 等待计时：只有超过 1 秒才显示，避免正常速度下数字闪一下就消失。
    useEffect(() => {
        if (!busy) {
            setSeconds(0);
            return undefined;
        }
        const start = Date.now();
        const t = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 500);
        return () => clearInterval(t);
    }, [busy]);

    const handle = async () => {
        if (busy) return;
        setWaiting(true);
        try {
            if (onClick) await onClick();
            await Promise.all(list.map((s) => (s.reload ? s.reload() : Promise.resolve())));
            setDoneAt(Date.now());
        } catch (e) {
            // 请求错误已由 useApi 写入 state.error，AsyncPanel 会渲染 ErrorBox，
            // 这里只需吞掉异常，避免事件处理器抛出未处理的 Promise rejection。
        } finally {
            setWaiting(false);
        }
    };

    const hint = failed
        ? <span className="ga-refresh-hint ga-refresh-hint--err">上次刷新失败</span>
        : updatedAt
            ? <span className="ga-refresh-hint">已更新 {new Date(updatedAt).toLocaleTimeString('zh-CN')}</span>
            : null;

    return (
        <>
            <Btn variant={variant} sm={sm} className={className} loading={busy}
                 loadingText={seconds >= 1 ? `刷新中 ${seconds}s` : '刷新中…'}
                 onClick={handle}>{label}</Btn>
            {busy ? (
                <span className="ga-refresh-hint" title="正在向后端请求最新数据">
                    {seconds >= 5 ? '后端响应较慢，请稍候…' : '请求中'}
                </span>
            ) : hint}
        </>
    );
}

/**
 * 全局请求活动指示：任意接口在途超过 400ms 时，
 * 顶部出现细进度条 + 右下角耗时提示。
 * 这样即使某个操作按钮自身没有加载态，用户也知道请求发出去了。
 */
export function ApiActivityBar() {
    const [count, setCount] = useState(0);
    const [since, setSince] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const lastCount = useRef(0);

    useEffect(() => subscribeApiPending((n) => {
        const prev = lastCount.current;
        lastCount.current = n;
        setCount(n);
        if (n > 0 && prev === 0) setSince(Date.now());
        if (n === 0 && prev > 0) setSince(0);
    }), []);

    useEffect(() => {
        if (!count) return undefined;
        const t = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(t);
    }, [count]);

    const elapsed = since ? now - since : 0;
    if (!count || elapsed < 400) return null;
    const sec = Math.floor(elapsed / 1000);

    return (
        <>
            <div className="ga-activity" role="progressbar" aria-label="正在加载数据">
                <i/>
            </div>
            <div className="ga-activity-toast" role="status" aria-live="polite">
                <Spinner/>
                <span>正在加载数据{sec >= 1 ? ` · 已等待 ${sec}s` : '…'}</span>
                {sec >= 8 ? <em>后端响应较慢，请不要重复点击</em> : null}
            </div>
        </>
    );
}

/** 标签页。items: [{value,label}]。 */
export function GaTabs({ items, value, onChange }) {
    return (
        <div className="ga-tabs">
            {items.map((it) => (
                <button key={it.value} type="button"
                        className={`ga-tab${it.value === value ? ' active' : ''}`}
                        onClick={() => onChange(it.value)}>{it.label}</button>
            ))}
        </div>
    );
}

/* ---------------------------------------------------------------- 分页 */

/** 分页控件，页码从 1 开始。 */
export function Pager({ page = 1, size = 20, total = 0, pages = 1, onPage, onSize,
                          sizes = [20, 50, 100] }) {
    const p = Number(page) || 1;
    const ps = Math.max(1, Number(pages) || 1);
    return (
        <div className="ga-pager">
            <span className="ga-pager-info">共 {fmtInt(total)} 条 / {ps} 页</span>
            <div className="ga-pager-buttons">
                <button type="button" className="ga-btn ga-btn--sm" disabled={p <= 1} onClick={() => onPage(1)}>首页</button>
                <button type="button" className="ga-btn ga-btn--sm" disabled={p <= 1} onClick={() => onPage(p - 1)}>上一页</button>
                <span className="ga-pager-current">{p}</span>
                <button type="button" className="ga-btn ga-btn--sm" disabled={p >= ps} onClick={() => onPage(p + 1)}>下一页</button>
                <button type="button" className="ga-btn ga-btn--sm" disabled={p >= ps} onClick={() => onPage(ps)}>末页</button>
            </div>
            {onSize ? (
                <label className="ga-row">
                    <span className="ga-muted">每页</span>
                    <Select value={size} onChange={(v) => onSize(Number(v))}
                            options={sizes.map((s) => ({ value: String(s), label: String(s) }))}/>
                </label>
            ) : null}
        </div>
    );
}

/* ---------------------------------------------------------------- 迷你条形 / 时间线 */

/** explain 贡献条：宽度按 |value| / max（未传 max 时按自身量级），颜色按正负（正红负绿）。 */
export function MiniBar({ label, value, max }) {
    const n = Math.abs(Number(value) || 0);
    const m = Number(max) > 0 ? Number(max) : Math.max(n, 1e-9);
    const w = Math.min(100, (n / m) * 100);
    const tone = Number(value) >= 0 ? 'up' : 'down';
    return (
        <div className="ga-mini-bar">
            <div className="ga-mini-bar-head">
                <span>{fmtText(label)}</span>
                <span>{fmtNum(value, 3)}</span>
            </div>
            <div className="ga-mini-bar-track">
                <div className={`ga-mini-bar-fill ga-mini-bar-fill--${tone}`} style={{ width: `${w}%` }}/>
            </div>
        </div>
    );
}

/** 通用时间线。items: [{date, text}]。 */
export function Timeline({ items = [], emptyText = '暂无事件' }) {
    if (!items.length) return <Empty text={emptyText}/>;
    return (
        <ul className="ga-timeline">
            {items.map((it, i) => (
                <li className="ga-timeline-item" key={i}>
                    <span className="ga-timeline-dot"/>
                    <div className="ga-timeline-date">{fmtText(it.date)}</div>
                    <div className="ga-timeline-body">{it.text}</div>
                </li>
            ))}
        </ul>
    );
}
