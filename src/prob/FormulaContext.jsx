/** 公式弹窗的轻量上下文：页面任意位置 <F id="garch"/> 都能就地打开说明并定位到该条。 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const FormulaContext = createContext({ req: null, open: () => {}, close: () => {} });

export function FormulaProvider({ children }) {
    const [req, setReq] = useState(null);
    const open = useCallback((payload = {}) => {
        setReq(typeof payload === 'string' ? { id: payload } : { ...payload, __n: Date.now() });
    }, []);
    const close = useCallback(() => setReq(null), []);
    const value = useMemo(() => ({ req, open, close }), [req, open, close]);
    return <FormulaContext.Provider value={value}>{children}</FormulaContext.Provider>;
}

export function useFormula() {
    return useContext(FormulaContext);
}
