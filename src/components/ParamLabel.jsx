/**
 * 参数标签 + 鼠标悬停说明。
 * <p>小问号旁弹出气泡，气泡用绝对定位不占布局高度，
 * 因此不会破坏做T模拟页「一屏看全」的紧凑排版；同时支持键盘聚焦查看。</p>
 */
export default function ParamLabel({ children, tip }) {
    return (
        <span className="param-label">
            <span>{children}</span>
            {tip ? (
                <span className="param-hint" tabIndex={0} role="note" aria-label={tip}
                      onMouseDown={(event) => event.preventDefault()}>
                    <span className="param-hint-icon">?</span>
                    <span className="param-hint-pop" role="tooltip">{tip}</span>
                </span>
            ) : null}
        </span>
    );
}
