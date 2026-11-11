import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { stockApi } from '../api/stock.js';

/**
 * 「全站当前股票」：一次选择，所有页面的股票输入自动跟随。
 *
 * - 值存 localStorage（不是 sessionStorage），因为它是跨页面、跨会话的使用偏好；
 *   关闭标签页后再次打开，仍然记得上一次关注的股票。
 * - revision 是「广播版本号」：每次当前股票真正变化就 +1，页面据此把新股票
 *   应用到自己的本地表单，避免各页面各自持久化出互相矛盾的默认值。
 * - 与 usePersistedState 的页面参数互不冲突：这里只管「股票是那只」，
 *   日期、资金、策略参数、结果、页签等仍由各页面自己保存。
 */

const STORAGE_KEY = 'stock-web:current-stock:v1';
const STORAGE_EVENT_KEY = STORAGE_KEY;

/** 全新会话的默认关注股票，与做T模型 / 回本实验室原有的默认值保持一致。 */
export const DEFAULT_STOCK = { code: '600519', name: '贵州茅台' };
/** 「不限定股票」：设为该值后不再覆盖各页面的输入。 */
export const EMPTY_STOCK = { code: '', name: '' };

const isCode = (value) => /^\d{6}$/.test(String(value ?? ''));

function readStored() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return DEFAULT_STOCK;
        const parsed = JSON.parse(raw);
        if (!parsed || !isCode(parsed.code)) return EMPTY_STOCK;
        return { code: String(parsed.code), name: String(parsed.name ?? '') };
    } catch {
        return DEFAULT_STOCK;
    }
}

function persist(stock) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stock));
    } catch {
        // 隐私模式 / 容量不足时降级为仅当前会话生效
    }
}

const CurrentStockContext = createContext(null);

export function CurrentStockProvider({ children }) {
    const [stock, setStock] = useState(readStored);
    const [revision, setRevision] = useState(0);
    // 用 ref 保存最新值，保证短时间内连续调用（例如输入框 + 提交）不会基于旧状态覆盖
    const stockRef = useRef(stock);

    const commit = useCallback((next) => {
        const cur = stockRef.current;
        const code = String(next.code ?? cur.code).trim();
        if (code !== '' && !isCode(code)) return false;

        // 换了股票但没给名称时清空名称，避免顶栏显示上一只股票的名字；
        // 同一只股票时允许只补名称（详情页 / 联想接口异步回填）。
        const name = code !== cur.code
            ? String(next.name ?? '').trim()
            : (next.name ? String(next.name).trim() : cur.name);

        if (code === cur.code && name === cur.name) return false;
        const merged = { code, name };
        stockRef.current = merged;
        setStock(merged);
        persist(merged);
        setRevision((value) => value + 1);
        return true;
    }, []);

    /** 设定当前股票。支持 6 位代码字符串或 { code, name }；code 传 '' 表示不限定。 */
    const setCurrentStock = useCallback((next) => {
        if (typeof next === 'string') return commit({ code: next });
        if (next && typeof next === 'object') return commit(next);
        return false;
    }, [commit]);

    /** 只补名称，不改代码（详情页拿到行情名称后调用）。 */
    const fillStockName = useCallback((name) => {
        if (!stockRef.current.code || !name) return false;
        return commit({ code: stockRef.current.code, name });
    }, [commit]);

    /**
     * 把任意输入文本（6 位代码 / 中文名 / 简称）解析成当前股票。
     * 复用已有的 /api/stocks/suggest，不新增也不改动后端接口。
     */
    const adoptStock = useCallback(async (text) => {
        const value = String(text ?? '').trim();
        if (!value) return null;

        if (isCode(value)) {
            // 先让代码立即全站生效，再异步把中文名补上（不额外改代码，避免竞态覆盖新输入）
            commit({ code: value });
            try {
                const list = await stockApi.suggest(value, 1);
                const hit = Array.isArray(list) && list.length ? list[0] : null;
                if (hit && String(hit.code) === value
                    && stockRef.current.code === value && !stockRef.current.name) {
                    commit({ code: value, name: String(hit.name ?? '') });
                }
            } catch {
                // 名称只是展示信息，查不到时页面只显示代码
            }
            return { code: value, name: stockRef.current.name };
        }

        try {
            const list = await stockApi.suggest(value, 1);
            const hit = Array.isArray(list) && list.length ? list[0] : null;
            if (!hit || !isCode(hit.code)) return null;
            const picked = { code: String(hit.code), name: String(hit.name ?? '') };
            commit(picked);
            return picked;
        } catch {
            return null;
        }
    }, [commit]);

    const resetStock = useCallback(() => commit(DEFAULT_STOCK), [commit]);
    const clearStock = useCallback(() => commit(EMPTY_STOCK), [commit]);

    // 多标签页之间保持一致：其他标签改动当前股票时，本标签也跟着广播
    useEffect(() => {
        const onStorage = (event) => {
            if (event.key !== STORAGE_EVENT_KEY) return;
            const next = readStored();
            const cur = stockRef.current;
            if (next.code === cur.code && next.name === cur.name) return;
            stockRef.current = next;
            setStock(next);
            setRevision((value) => value + 1);
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const value = useMemo(() => ({
        stock,
        revision,
        isEmpty: !stock.code,
        setCurrentStock,
        fillStockName,
        adoptStock,
        resetStock,
        clearStock,
    }), [stock, revision, setCurrentStock, fillStockName, adoptStock, resetStock, clearStock]);

    return (
        <CurrentStockContext.Provider value={value}>
            {children}
        </CurrentStockContext.Provider>
    );
}

export function useCurrentStock() {
    const ctx = useContext(CurrentStockContext);
    if (!ctx) throw new Error('useCurrentStock 必须在 CurrentStockProvider 内使用');
    return ctx;
}

/**
 * 页面订阅全站当前股票：初次挂载与全局股票变化时都会调用 apply(stock)。
 * apply 应当是幂等的函数式 setState，例如：
 *   useGlobalStockSync((s) => setForm((f) => f.code === s.code ? f : { ...f, code: s.code }));
 * 「不限定股票」时不覆盖，用户可以在各页面自由输入。
 */
export function useGlobalStockSync(apply) {
    const { stock, revision } = useCurrentStock();
    const applyRef = useRef(apply);
    applyRef.current = apply;

    useEffect(() => {
        if (!stock.code) return;
        applyRef.current(stock);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revision, stock.code, stock.name]);

    return stock;
}
