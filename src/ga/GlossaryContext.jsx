/**
 * 指标说明弹窗的全局开关。
 *
 * 页面里任意位置（表格表头、KPI 卡、告警条）都能通过 <Term> 或 useGlossary().open()
 * 打开同一个弹窗，不需要逐层传 props。弹窗本体在 GaApp 里挂一次。
 *
 * 同时支持 #ga-glossary 深链：带这个 hash 打开页面时自动弹出说明书，
 * 方便直接分享某个指标的说明，也便于无头浏览器截图验证。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const GLOSSARY_HASH = '#ga-glossary';

const GlossaryContext = createContext({
    req: null,
    open: () => {},
    close: () => {},
});

/**
 * 深链：?glossary=1 打开告警处置指引，?glossary=terms 直接打开术语表，
 * #ga-glossary 等价于 ?glossary=1。方便分享，也方便无头浏览器验证。
 */
function glossaryMode() {
    if (typeof window === 'undefined') return '';
    const p = new URLSearchParams(window.location.search).get('glossary');
    if (p === 'terms') return 'terms';
    if (p === '1' || window.location.hash === GLOSSARY_HASH) return 'sop';
    return '';
}

const deepLinkOpen = () => !!glossaryMode();

/** 深链可带 q= 预填搜索词，例如 /ga?glossary=terms&q=ic60。 */
function deepLinkQuery() {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') || '';
}

export function GlossaryProvider({ children }) {
    // 同步初始化：某些宿主会在挂载后改写 hash，放到 effect 里再判断会漏掉。
    const [req, setReq] = useState(() => {
        const mode = glossaryMode();
        const q = deepLinkQuery();
        if (mode === 'terms') return { group: 'all', sopId: 'none', query: q, fromHash: true, ts: 1 };
        if (mode === 'sop') return { group: 'kpi', sopId: 'lowHitRate', query: q, fromHash: true, ts: 1 };
        return null;
    });

    const open = useCallback((opts = {}) => {
        setReq({ ...opts, ts: Date.now() + Math.random() });
    }, []);

    const close = useCallback(() => {
        setReq(null);
        if (typeof window !== 'undefined' && deepLinkOpen()) {
            const u = new URL(window.location.href);
            u.hash = '';
            u.searchParams.delete('glossary');
            window.history.replaceState(null, '', u.pathname + u.search);
        }
    }, []);

    useEffect(() => {
        const onHash = () => {
            const mode = glossaryMode();
            if (mode === 'terms') open({ group: 'all', sopId: 'none', fromHash: true });
            else if (mode === 'sop') open({ group: 'kpi', sopId: 'lowHitRate', fromHash: true });
        };
        window.addEventListener('hashchange', onHash);
        onHash();
        return () => window.removeEventListener('hashchange', onHash);
    }, [open]);

    const value = useMemo(() => ({ req, open, close }), [req, open, close]);
    return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
}

export const useGlossary = () => useContext(GlossaryContext);
