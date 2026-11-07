import { useCallback, useEffect, useState } from 'react';

/**
 * 模块级请求缓存：cacheKey -> { time, data }。
 * 行情看板的数据在抓取任务跑完前是不变的，短时间内反复切换日期/榜单
 * 直接命中缓存即可，不必每次全量重拉。
 */
const cache = new Map();
/** 进行中的请求：cacheKey -> Promise，同一 key 的并发请求共享一次网络调用。 */
const inflight = new Map();

const DEFAULT_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 200;

/** 清空前端请求缓存（不传 key 则全清），用于强制刷新。 */
export function invalidateApiCache(cacheKey) {
    if (cacheKey) {
        cache.delete(cacheKey);
    } else {
        cache.clear();
    }
}

async function fetchWithCache(cacheKey, ttlMs, fetcher) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.time < ttlMs) {
        return hit.data;
    }
    let promise = inflight.get(cacheKey);
    if (!promise) {
        promise = Promise.resolve()
            .then(fetcher)
            .then((result) => {
                if (cache.size >= MAX_ENTRIES) {
                    cache.clear();
                }
                cache.set(cacheKey, { time: Date.now(), data: result });
                return result;
            })
            .finally(() => inflight.delete(cacheKey));
        inflight.set(cacheKey, promise);
    }
    return promise;
}

/**
 * 通用异步数据 hook。
 *
 * @param fetcher () => Promise<data>
 * @param deps    依赖变化后自动重新拉取
 * @param options { cacheKey?, ttlMs? } 传 cacheKey 后启用内存缓存与并发去重，
 *                注意 cacheKey 必须随 deps 里的参数一起变化（如带上日期）。
 * @returns {{ data, loading, error, reload }}
 */
export function useApi(fetcher, deps = [], options = {}) {
    const { cacheKey, ttlMs = DEFAULT_TTL_MS } = options;
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
                const result = cacheKey
                    ? await fetchWithCache(cacheKey, ttlMs, fetcher)
                    : await fetcher();
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

    // reload 视为用户主动刷新：先作废对应缓存再重拉，保证拿到最新数据。
    const reload = useCallback(() => {
        if (cacheKey) {
            cache.delete(cacheKey);
        }
        setTick((t) => t + 1);
    }, [cacheKey]);
    return { data, loading, error, reload };
}
