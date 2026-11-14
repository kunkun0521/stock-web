/**
 * 「指标说明 / 操作指引」弹窗。
 *
 * 两块内容：
 *   ① 告警处置 SOP —— 顶部告警条点「怎么处理？」进来时，自动定位到对应指引（默认低命中率那条）；
 *   ② 全量术语表 —— 按 8 个分组 + 搜索，把页面里所有英文指标、状态值、任务名、参数键讲清楚。
 *
 * 数据来源统一在 glossary.js，新增指标只需在那里加一条，页面 <Term> 与这里同时生效。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { getConfig } from './api.js';
import { asArray, asObject, fmtText } from './gaUtils.js';
import { useGlossary } from './GlossaryContext.jsx';
import {
    GROUPS, TERMS, ALERT_SOPS, DEFAULT_SOP, matchAlert,
} from './glossary.js';

function SopBlock({ sop, fromAlert, onChange }) {
    if (!sop) return null;
    return (
        <section className="ga-gloss-sop">
            <div className="ga-gloss-sop-head">
                <div>
                    <span className="ga-gloss-sop-tag">{fromAlert ? '当前告警 · 处置指引' : '常见告警 · 操作指引'}</span>
                    <h3>{sop.title}</h3>
                </div>
                <select className="ga-select" value={sop.id} onChange={(e) => onChange(e.target.value)}
                        title="切换其它告警的处置指引">
                    {ALERT_SOPS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    <option value="none">不显示指引，只看术语表</option>
                </select>
            </div>
            <p className="ga-gloss-sop-summary">{sop.summary}</p>
            {sop.warning ? <div className="ga-gloss-warn">⚠ {sop.warning}</div> : null}
            <ol className="ga-gloss-steps">
                {sop.steps.map((s) => (
                    <li key={s.no}>
                        <span className="ga-gloss-step-no">{s.no}</span>
                        <div className="ga-gloss-step-body">
                            <div className="ga-gloss-step-title">{s.title}</div>
                            {s.where ? <div className="ga-gloss-step-where">操作位置：{s.where}</div> : null}
                            <div className="ga-gloss-step-detail">{s.detail}</div>
                        </div>
                    </li>
                ))}
            </ol>
            {sop.extra ? <div className="ga-gloss-extra">{sop.extra}</div> : null}
        </section>
    );
}

export default function GlossaryModal() {
    const { req, close } = useGlossary();
    const [group, setGroup] = useState('all');
    const [query, setQuery] = useState('');
    const [sopId, setSopId] = useState(DEFAULT_SOP.id);
    const [showSop, setShowSop] = useState(true);
    const [fromAlert, setFromAlert] = useState(false);
    const bodyRef = useRef(null);

    // ga_config 里有 100+ 个英文参数键，静态术语表列不全：直接从配置接口读出
    // paramKey / description / 当前值 / 默认值，动态补进「参数键」分组，搜索也能命中。
    // 后端把 scope='ALL' 当成真实作用域去查（返回 0 行），必须传空串才是「不限作用域」。
    const cfg = useApi(() => getConfig({ scope: '' }), [],
        { cacheKey: 'ga:glossary:config', ttlMs: 10 * 60 * 1000 });

    const isOpen = !!req;
    const sop = ALERT_SOPS.find((s) => s.id === sopId) || null;

    const allTerms = useMemo(() => {
        const root = asObject(cfg.data);
        const items = asArray(root.items);
        const defaults = asObject(root.defaults);
        const dynamic = items
            .filter((r) => fmtText(r.paramKey) !== '-')
            .map((r) => ({
                id: `cfg-${fmtText(r.paramKey)}`,
                term: fmtText(r.paramKey),
                cn: '参数键 · ' + (fmtText(r.scope) === 'GLOBAL' ? '全局作用域' : `${fmtText(r.scope)} 周期级`),
                group: 'param',
                desc: fmtText(r.description) === '-' ? '后端未提供该参数的文字说明。' : fmtText(r.description),
                howto: `当前值 ${fmtText(r.paramValue)}；代码内置默认值 ${fmtText(defaults[r.paramKey])}。`
                    + '在「参数配置」页修改后立即刷新后端缓存，下一次任务生效，无需重启服务。',
                formula: null,
                alias: [fmtText(r.scope)],
                dynamic: true,
            }));
        return [...TERMS, ...dynamic];
    }, [cfg.data]);

    /* 每次打开都按本次请求重置分组 / 搜索 / 指引，并滚动到被点击的术语 */
    useEffect(() => {
        if (!req) return undefined;
        const matched = req.alert ? matchAlert(req.alert) : null;
        setSopId(req.sopId === 'none' ? DEFAULT_SOP.id : (req.sopId || matched?.id || DEFAULT_SOP.id));
        // 点术语 / 点顶部「指标说明」时直接给术语表；点告警条才展开处置指引。
        setShowSop(req.sopId !== 'none' && !req.term);
        setFromAlert(!!(req.alert && matched));
        setGroup(req.group || 'all');
        setQuery(req.query || '');
        const timer = setTimeout(() => {
            const target = req.term && document.getElementById(`ga-term-${req.term}`);
            if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            else if (bodyRef.current) bodyRef.current.scrollTop = 0;
        }, 80);
        return () => clearTimeout(timer);
    }, [req]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, close]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const g = q ? 'all' : group; // 有搜索词时跨全部分组，避免用户漏看
        return allTerms.filter((t) => (g === 'all' || t.group === g)
            && (!q || [t.term, t.cn, t.desc, t.howto, t.formula, ...(t.alias || [])]
                .filter(Boolean).join(' ').toLowerCase().includes(q)));
    }, [query, group, allTerms]);
    const groupLabel = (id) => GROUPS.find((g) => g.id === id)?.label || id;
    const countOf = (id) => (id === 'all' ? allTerms.length : allTerms.filter((t) => t.group === id).length);

    if (!isOpen) return null;

    return (
        <div className="ga-modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div className="ga-modal" role="dialog" aria-modal="true" aria-label="指标说明与操作指引">
                <header className="ga-modal-head">
                    <div>
                        <h2>指标说明与操作指引</h2>
                        <p>凡是看不懂的英文指标、状态、任务名，都在这里；先看告警怎么处理，再查术语。</p>
                    </div>
                    <button type="button" className="ga-modal-close" onClick={close} aria-label="关闭">✕</button>
                </header>

                <div className="ga-modal-body" ref={bodyRef}>
                    {showSop ? (
                        <SopBlock sop={sop} fromAlert={fromAlert} onChange={(v) => {
                            if (v === 'none') setShowSop(false);
                            else { setSopId(v); setShowSop(true); }
                        }}/>
                    ) : null}

                    <section className="ga-gloss-terms">
                        <div className="ga-gloss-toolbar">
                            <input className="ga-input ga-gloss-search" type="search" value={query}
                                   placeholder="搜索英文指标 / 中文名，例如：IC、ECE、hitRate、runId、冠军"
                                   onChange={(e) => setQuery(e.target.value)}/>
                            <button type="button" className="ga-gloss-tab"
                                    onClick={() => {
                                        if (!showSop && bodyRef.current) bodyRef.current.scrollTop = 0;
                                        setShowSop((v) => !v);
                                    }}>
                                {showSop ? '收起操作指引' : '查看告警操作指引'}
                            </button>
                            <span className="ga-muted">共 {shown.length} 条{query.trim() ? '（跨全部分组）' : ''}</span>
                        </div>
                        <div className="ga-gloss-tabs">
                            <button type="button" className={`ga-gloss-tab${group === 'all' ? ' active' : ''}`}
                                    onClick={() => setGroup('all')}>全部 · {countOf('all')}</button>
                            {GROUPS.map((g) => (
                                <button key={g.id} type="button"
                                        className={`ga-gloss-tab${group === g.id ? ' active' : ''}`}
                                        title={g.desc} onClick={() => { setGroup(g.id); setQuery(''); }}>
                                    {g.label} · {countOf(g.id)}
                                </button>
                            ))}
                        </div>

                        {shown.length ? (
                            <div className="ga-gloss-list">
                                {shown.map((t) => (
                                    <article key={t.id} id={`ga-term-${t.id}`}
                                             className={`ga-gloss-item${req.term === t.id ? ' is-active' : ''}`}>
                                        <div className="ga-gloss-item-head">
                                            <code>{t.term}</code>
                                            <b>{t.cn}</b>
                                            <span className="ga-gloss-badge">{groupLabel(t.group)}</span>
                                            {t.dynamic ? <span className="ga-gloss-badge is-dynamic">实时读取</span> : null}
                                        </div>
                                        <p>{t.desc}</p>
                                        {t.formula ? <div className="ga-gloss-formula">公式 / 口径：{t.formula}</div> : null}
                                        {t.howto ? <div className="ga-gloss-howto"><b>怎么看：</b>{t.howto}</div> : null}
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="ga-empty">没找到「{query}」，试试 IC、ECE、BalAcc、hitRate、InitJob、PENDING 等关键词。</div>
                        )}
                    </section>
                </div>

                <footer className="ga-modal-foot">
                    <span>页面里带 <span className="ga-term-demo">?</span> 的英文指标可直接点击查看对应词条 · 按 Esc 或点击遮罩关闭</span>
                    <button type="button" className="ga-btn ga-btn--primary" onClick={close}>知道了</button>
                </footer>
            </div>
        </div>
    );
}
