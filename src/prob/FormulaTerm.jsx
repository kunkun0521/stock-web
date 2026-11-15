/**
 * 就地公式说明入口。用法：<F id="garch">GARCH(1,1)-t</F> 或 <F id="brier_bss"/>。
 * 找不到 id 时原样输出文本，不会报错；表格行内点击会阻止冒泡，避免误触行选中。
 */
import { useFormula } from './FormulaContext.jsx';
import { findFormula } from './formulas.js';

export default function F({ id, children, className = '' }) {
    const { open } = useFormula();
    const f = findFormula(id);
    const text = children ?? (f ? f.term : id);
    if (!f) return <span className={className}>{text}</span>;
    const tip = `${f.term}\n${f.cn}\n\n点击查看公式、参数来源与入参统计口径`;
    return (
        <button type="button"
                className={`prob-formula-term ${className}`.trim()}
                title={tip}
                aria-label={`${f.cn}，点击查看公式说明`}
                onClick={(e) => { e.stopPropagation(); open({ id: f.id, group: f.group }); }}>
            {text}<span className="prob-formula-q" aria-hidden="true">?</span>
        </button>
    );
}
