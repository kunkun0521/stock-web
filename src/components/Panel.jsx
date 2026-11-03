/** 卡片容器：标题 + 右侧操作区（tabs / 下拉 / 按钮） */
export default function Panel({ title, extra, children, className = '' }) {
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
