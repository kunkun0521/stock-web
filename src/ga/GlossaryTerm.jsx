/**
 * 就地术语解释：把页面上的英文指标包成 <Term id="ic60">ic60</Term>，
 * 鼠标悬停给中文名 + 一句话，点击打开完整指标说明书并定位到该条。
 *
 * 找不到 id 时原样输出文本，不会报错或留空（方便页面先加标记、后补词条）。
 * 表格行内的点击会冒泡触发行选中，这里统一阻止冒泡。
 */
import { useGlossary } from './GlossaryContext.jsx';
import { findTerm } from './glossary.js';

export default function Term({ id, children, className = '' }) {
    const { open } = useGlossary();
    const t = findTerm(id);
    const text = children ?? (t ? t.term : id);
    if (!t) return <span className={className}>{text}</span>;

    const tip = `${t.term} = ${t.cn}\n${t.desc}\n\n点击查看完整说明与告警处置指引`;
    return (
        <button type="button"
                className={`ga-term ${className}`.trim()}
                title={tip}
                aria-label={`${t.cn}，点击查看说明`}
                onClick={(e) => { e.stopPropagation(); open({ term: t.id, group: t.group }); }}>
            {text}<span className="ga-term-q" aria-hidden="true">?</span>
        </button>
    );
}
