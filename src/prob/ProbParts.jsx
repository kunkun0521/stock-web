/** 概率页基础 UI：复用 ga.css 的变量与类名，不依赖 GA 模块的上下文。 */
import { subscribeApiPending } from '../hooks/useApi.js';
import { useEffect, useState } from 'react';

export function PCard({ title, extra, children, flush = false, className = '' }) {
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

export function PKpi({ label, value, hint, tone = 'plain' }) {
    return (
        <div className="ga-kpi">
            <div className="ga-kpi-label">{label}</div>
            <div className={`ga-kpi-value ga-tone-${tone}`}>{value}</div>
            {hint ? <div className="ga-kpi-hint">{hint}</div> : null}
        </div>
    );
}

export function PBadge({ tone = 'plain', children, title }) {
    return <span className={`ga-badge ga-badge--${tone}`} title={title}>{children}</span>;
}

export function PSpinner() {
    return <i className="ga-spinner" aria-hidden="true"/>;
}

export function PBtn({ variant = '', sm = false, loading = false, loadingText, disabled = false,
                         children, className = '', ...rest }) {
    return (
        <button type="button"
                className={`ga-btn ${variant ? `ga-btn--${variant}` : ''}${sm ? ' ga-btn--sm' : ''}`
                    + `${loading ? ' is-loading' : ''} ${className}`}
                disabled={disabled || loading} {...rest}>
            {loading ? <><PSpinner/>{loadingText || children}</> : children}
        </button>
    );
}

export function PBar({ children }) {
    return <div className="ga-filters">{children}</div>;
}

export function PField({ label, hint, children }) {
    return (
        <label className="ga-field">
            <span className="ga-field-label">{label}{hint ? ` · ${hint}` : ''}</span>
            {children}
        </label>
    );
}

export function PSelect({ value, onChange, options = [], title }) {
    return (
        <select className="ga-select" value={value ?? ''} title={title}
                onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
        </select>
    );
}

export function PInput({ value, onChange, type = 'text', placeholder, min, max, step, className = '' }) {
    return (
        <input className={`ga-input ${className}`} type={type} value={value ?? ''}
               placeholder={placeholder} min={min} max={max} step={step}
               onChange={(e) => onChange(e.target.value)}/>
    );
}

export function PEmpty({ text = '暂无数据' }) {
    return <div className="ga-empty">{text}</div>;
}

export function PLoading({ text = '加载中…' }) {
    return <div className="ga-loading">{text}</div>;
}

export function PError({ message, onRetry }) {
    if (!message) return null;
    return (
        <div className="ga-error">
            <div className="ga-error-head">
                <span>加载失败</span>
                {onRetry ? <PBtn sm variant="ghost" onClick={onRetry}>重试</PBtn> : null}
            </div>
            <div className="ga-error-msg">{String(message)}</div>
        </div>
    );
}

export function PAsync({ state, isEmpty, emptyText = '暂无数据', children }) {
    const { data, loading, error, reload } = state || {};
    if (error) return <PError message={error} onRetry={reload}/>;
    if (loading && data === undefined) return <PLoading/>;
    const blank = isEmpty ? isEmpty(data) : (data === undefined || data === null);
    if (blank) return <PEmpty text={emptyText}/>;
    return (
        <div className={`ga-busy${loading ? ' is-refreshing' : ''}`}>
            {typeof children === 'function' ? children(data) : children}
        </div>
    );
}

export function PPager({ page = 1, size = 20, total = 0, pages = 1, onPage, onSize,
                           sizes = [20, 50, 100] }) {
    const p = Number(page) || 1;
    const ps = Math.max(1, Number(pages) || 1);
    return (
        <div className="prob-pager">
            <span>共 {Number(total || 0).toLocaleString()} 条 · 第 {p}/{ps} 页</span>
            <div className="prob-pager-btns">
                <PBtn sm disabled={p <= 1} onClick={() => onPage(p - 1)}>上一页</PBtn>
                <PBtn sm disabled={p >= ps} onClick={() => onPage(p + 1)}>下一页</PBtn>
                <select className="ga-select" value={size}
                        onChange={(e) => onSize(Number(e.target.value))}>
                    {sizes.map((s) => <option key={s} value={s}>{s} 条/页</option>)}
                </select>
            </div>
        </div>
    );
}

/** 顶部全局在途指示：后端慢的时候明确告诉用户「请求还在跑」。 */
export function PActivityBar() {
    const [pending, setPending] = useState(0);
    useEffect(() => subscribeApiPending(setPending), []);
    return (
        <div className={`prob-activity${pending > 0 ? ' is-on' : ''}`}
             title={pending > 0 ? `当前有 ${pending} 个接口请求在途` : '接口空闲'}>
            {pending > 0 ? <><PSpinner/>正在加载 {pending} 项数据…</> : '数据已就绪'}
        </div>
    );
}
