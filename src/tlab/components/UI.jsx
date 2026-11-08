/** 卡片容器：标题 + 右侧操作区 */
export function Panel({ title, extra, children, className = '' }) {
    return (
        <section className={`panel ${className}`}>
            <header className="panel-head">
                <h2>{title}</h2>
                {extra ? <div className="panel-extra">{extra}</div> : null}
            </header>
            {children}
        </section>
    );
}

/** 概览数字卡片 */
export function StatCard({ label, value, tone = 'plain', hint }) {
    return (
        <div className="stat-card" title={hint || undefined}>
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${tone}`}>{value}</div>
            {hint ? <div className="stat-hint">{hint}</div> : null}
        </div>
    );
}

/** 表单标签 + 悬停说明：问号气泡绝对定位，不占布局高度 */
export function FieldLabel({ children, tip }) {
    return (
        <span className="field-label">
            <span>{children}</span>
            {tip ? (
                <span className="field-hint" tabIndex={0} role="note" aria-label={tip}
                      onMouseDown={(e) => e.preventDefault()}>
                    <span className="field-hint-icon">?</span>
                    <span className="field-hint-pop" role="tooltip">{tip}</span>
                </span>
            ) : null}
        </span>
    );
}

export function ErrorBanner({ message, onClose }) {
    if (!message) return null;
    return (
        <div className="error-banner">
            <span>{message}</span>
            {onClose ? <button type="button" onClick={onClose}>×</button> : null}
        </div>
    );
}

export function Loading({ show, text = '计算中…' }) {
    if (!show) return null;
    return <div className="loading-mask">{text}</div>;
}
