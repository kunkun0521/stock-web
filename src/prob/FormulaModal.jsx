/**
 * 「公式说明」弹窗：把引擎用到的每条公式讲清楚。
 *
 * 每条详情包含：公式表达式 → 含义 → 参数表（符号 / 来自哪张表哪个字段 / 入参怎么统计）
 * → 入参统计口径 → 输出落到哪个字段 → 示例 → 文档章节 → 注意事项。
 * 页面里所有带 ? 的指标都通过 <F id="..."/> 打开这里并自动定位。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormula } from './FormulaContext.jsx';
import { FORMULAS, FORMULA_GROUPS, groupCount } from './formulas.js';

function Detail({ f }) {
    if (!f) {
        return <div className="prob-formula-blank">从左侧选一条公式，或点击页面里带 <b>?</b> 的指标直接定位。</div>;
    }
    return (
        <article className="prob-formula-detail">
            <div className="prob-formula-detail-head">
                <span className="prob-formula-group-tag">
                    {FORMULA_GROUPS.find((g) => g.id === f.group)?.label || f.group}
                </span>
                <span className="prob-formula-doc">需求文档 {f.doc}</span>
            </div>
            <h3>{f.cn}</h3>
            <code className="prob-formula-term-big">{f.term}</code>
            <div className="prob-formula-expr">{f.expr}</div>
            <p className="prob-formula-meaning">{f.meaning}</p>

            <section className="prob-formula-section">
                <h4>公式参数与来源</h4>
                <div className="prob-formula-param-wrap">
                    <table className="prob-formula-param-table">
                        <thead>
                            <tr><th>符号</th><th>来自哪里</th><th>入参怎么统计 / 约束</th></tr>
                        </thead>
                        <tbody>
                            {(f.params || []).map((p, i) => (
                                <tr key={`${p.sym}-${i}`}>
                                    <td><code>{p.sym}</code></td>
                                    <td>{p.from}</td>
                                    <td>{p.stat}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="prob-formula-section">
                <h4>入参统计口径</h4>
                <p>{f.inputStats}</p>
            </section>

            <section className="prob-formula-section prob-formula-flow">
                <div><span>输出结果</span><b>{f.output}</b></div>
                <div><span>落库位置</span><code>{f.table}</code></div>
            </section>

            {f.example ? (
                <section className="prob-formula-section">
                    <h4>可复现示例</h4>
                    <div className="prob-formula-example">{f.example}</div>
                </section>
            ) : null}
            {f.caution ? <div className="prob-formula-caution">⚠ {f.caution}</div> : null}
        </article>
    );
}

export default function FormulaModal() {
    const { req, close } = useFormula();
    const [group, setGroup] = useState('all');
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(FORMULAS[0]?.id);
    const bodyRef = useRef(null);

    const isOpen = !!req;

    useEffect(() => {
        if (!req) return undefined;
        const id = req.id && FORMULAS.some((f) => f.id === req.id) ? req.id : active;
        const f = FORMULAS.find((x) => x.id === id);
        setActive(id);
        setGroup(req.group || (f ? f.group : 'all'));
        setQuery('');
        const timer = setTimeout(() => {
            const el = document.getElementById(`prob-f-${id}`);
            if (el && bodyRef.current) {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }, 60);
        return () => clearTimeout(timer);
    }, [req]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, close]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return FORMULAS.filter((f) => (q ? true : group === 'all' || f.group === group)
            && (!q || [f.id, f.term, f.cn, f.expr, f.meaning, f.inputStats, f.output,
                f.example, f.doc, ...(f.params || []).flatMap((p) => [p.sym, p.from, p.stat])]
                .filter(Boolean).join(' ').toLowerCase().includes(q)));
    }, [query, group]);
    const current = FORMULAS.find((f) => f.id === active) || shown[0];

    if (!isOpen) return null;
    return (
        <div className="prob-modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div className="prob-modal" role="dialog" aria-modal="true" aria-label="公式说明">
                <header className="prob-modal-head">
                    <div>
                        <h2>公式说明 · 参数来源 · 入参统计口径</h2>
                        <p>引擎里出现的每条公式都能在这里查到：符号来自哪张表、样本怎么统计、算完落到哪个字段。</p>
                    </div>
                    <button type="button" className="prob-modal-close" onClick={close} aria-label="关闭">✕</button>
                </header>
                <div className="prob-formula-toolbar">
                    <input className="ga-input" type="search" value={query}
                           placeholder="搜索公式 / 符号 / 字段，例如 GARCH、p_up、VaR、purge"
                           onChange={(e) => setQuery(e.target.value)}/>
                    <div className="prob-formula-groups">
                        <button type="button" className={`prob-chip${group === 'all' ? ' active' : ''}`}
                                onClick={() => { setGroup('all'); setQuery(''); }}>
                            全部 · {groupCount('all')}
                        </button>
                        {FORMULA_GROUPS.map((g) => (
                            <button key={g.id} type="button" title={g.desc}
                                    className={`prob-chip${group === g.id ? ' active' : ''}`}
                                    onClick={() => { setGroup(g.id); setQuery(''); }}>
                                {g.label} · {groupCount(g.id)}
                            </button>
                        ))}
                    </div>
                    <span className="prob-formula-count">命中 {shown.length} 条</span>
                </div>
                <div className="prob-modal-body prob-formula-body">
                    <nav className="prob-formula-list" ref={bodyRef}>
                        {shown.length ? shown.map((f) => (
                            <button type="button" key={f.id} id={`prob-f-${f.id}`}
                                    className={`prob-formula-item${current?.id === f.id ? ' active' : ''}`}
                                    onClick={() => setActive(f.id)}>
                                <code>{f.term}</code>
                                <b>{f.cn}</b>
                                <span>{FORMULA_GROUPS.find((g) => g.id === f.group)?.label}</span>
                            </button>
                        )) : <div className="ga-empty">没找到「{query}」，试试 p_up、GARCH、VaR、IC、回测</div>}
                    </nav>
                    <div className="prob-formula-panel"><Detail f={current}/></div>
                </div>
                <footer className="prob-modal-foot">
                    <span>页面里带 <span className="prob-formula-demo">?</span> 的指标可直接点击定位 · Esc 或点击遮罩关闭</span>
                    <button type="button" className="ga-btn ga-btn--primary" onClick={close}>知道了</button>
                </footer>
            </div>
        </div>
    );
}
