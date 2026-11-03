import { useCallback, useEffect, useState } from 'react';

/**
 * 通用异步数据 hook。
 *
 * @param fetcher () => Promise<data>
 * @param deps    依赖变化后自动重新拉取
 * @returns {{ data, loading, error, reload }}
 */
export function useApi(fetcher, deps = []) {
    const [data, setData] = useState(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const result = await fetcher();
                if (!cancelled) {
                    setData(result);
                    setLoading(false);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e.message || '加载失败');
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick]);

    const reload = useCallback(() => setTick((t) => t + 1), []);
    return { data, loading, error, reload };
}
