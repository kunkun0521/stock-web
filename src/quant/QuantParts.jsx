/**
 * 量化页面的基础 UI：复用 ga.css 的样式变量与类名（.ga-card/.ga-btn/...），
 * 但不依赖 GA 的术语弹窗上下文，避免把两个模块耦在一起。
 */
export function QCard({ title, extra, children, flush = false, className = '' }) {
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

export function QKpi({ label, value, hint, tone = 'plain' }) {
    return (
        <div className="ga-kpi">
            <div className="ga-kpi-label">{label}</div>
            <div className={`ga-kpi-value ga-tone-${tone}`}>{value}</div>
            {hint ? <div className="ga-kpi-hint">{hint}</div> : null}
        </div>
    );
}

export function QBadge({ tone = 'plain', children, title }) {
    return <span className={`ga-badge ga-badge--${tone}`} title={title}>{children}</span>;
}

export function QSpinner() {
    return <i className="ga-spinner" aria-hidden="true"/>;
}

export function QBtn({
    variant = '', sm = false, loading = false, loadingText, disabled = false,
    children, className = '', ...rest
}) {
    return (
        <button type="button"
                className={`ga-btn ${variant ? `ga-btn--${variant}` : ''}${sm ? ' ga-btn--sm' : ''}`
                    + `${loading ? ' is-loading' : ''} ${className}`}
                disabled={disabled || loading}
                {...rest}>
            {loading ? <><QSpinner/>{loadingText || children}</> : children}
        </button>
    );
}

export function QBar({ children }) {
    return <div className="ga-filters">{children}</div>;
}

export function QField({ label, hint, children }) {
    return (
        <label className="ga-field">
            <span className="ga-field-label">{label}{hint ? ` · ${hint}` : ''}</span>
            {children}
        </label>
    );
}

export function QSelect({ value, onChange, options = [], title }) {
    return (
        <select className="ga-select" value={value ?? ''} title={title}
                onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
        </select>
    );
}

export function QInput({ value, onChange, type = 'text', placeholder, min, max, step, className = '' }) {
    return (
        <input className={`ga-input ${className}`} type={type} value={value ?? ''}
               placeholder={placeholder} min={min} max={max} step={step}
               onChange={(e) => onChange(e.target.value)}/>
    );
}

export function QEmpty({ text = '暂无数据' }) {
    return <div className="ga-empty">{text}</div>;
}

export function QLoading({ text = '加载中…' }) {
    return <div className="ga-loading">{text}</div>;
}

export function QError({ message, onRetry }) {
    if (!message) return null;
    return (
        <div className="ga-error">
            <div className="ga-error-head">
                <span>加载失败</span>
                {onRetry ? <QBtn sm variant="ghost" onClick={onRetry}>重试</QBtn> : null}
            </div>
            <div className="ga-error-msg">{String(message)}</div>
        </div>
    );
}

/** 与 GA 的 AsyncPanel 一致的加载/空/错误三态，刷新时保留旧内容并降低透明度。 */
export function QAsync({ state, isEmpty, emptyText = '暂无数据', children }) {
    const { data, loading, error, reload } = state || {};
    if (error) return <QError message={error} onRetry={reload}/>;
    if (loading && data === undefined) return <QLoading/>;
    const blank = isEmpty ? isEmpty(data) : (data === undefined || data === null);
    if (blank) return <QEmpty text={emptyText}/>;
    return (
        <div className={`ga-busy${loading ? ' is-refreshing' : ''}`}>
            {typeof children === 'function' ? children(data) : children}
        </div>
    );
}

export function QPager({ page = 1, size = 20, total = 0, pages = 1, onPage, onSize, sizes = [20, 50, 100] }) {
    const p = Number(page) || 1;
    const ps = Math.max(1, Number(pages) || 1);
    return (
        <div className="ga-pager">
            <span className="ga-pager-info">共 {total} 条 / {ps} 页</span>
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
                    <QSelect value={String(size)} onChange={(v) => onSize(Number(v))}
                             options={sizes.map((s) => ({ value: String(s), label: String(s) }))}/>
                </label>
            ) : null}
        </div>
    );
}

export function QTabs({ items, value, onChange }) {
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
