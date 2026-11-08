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
        <div className="stat-card">
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${tone}`}>{value}</div>
            {hint ? <div className="stat-hint">{hint}</div> : null}
        </div>
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
