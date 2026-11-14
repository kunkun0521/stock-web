import { useCallback, useEffect, useRef, useState } from 'react';

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

/* ------------------------------------------------------------------ 全局在途计数
 * 任何 useApi 请求开始/结束都会增减这个计数，页面顶部的「正在加载…」进度条
 * 与右上角耗时提示据此显示。后端慢的时候，即使点击的按钮自身没有转圈，
 * 用户也能确认请求确实发出去了、还在等。
 */
let pendingCount = 0;
const pendingListeners = new Set();

function notifyPending() {
    pendingListeners.forEach((fn) => {
        try {
            fn(pendingCount);
        } catch (e) {
            /* 订阅者异常不能影响请求流程 */
        }
    });
}

/** 订阅当前在途请求数；立即回调一次当前值。返回取消订阅函数。 */
export function subscribeApiPending(listener) {
    pendingListeners.add(listener);
    listener(pendingCount);
    return () => pendingListeners.delete(listener);
}

/** 当前在途请求数（非 hook，供调试或同步逻辑使用）。 */
export function apiPendingCount() {
    return pendingCount;
}

function beginRequest() {
    pendingCount += 1;
    notifyPending();
}

function endRequest() {
    pendingCount = Math.max(0, pendingCount - 1);
    notifyPending();
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
 * @returns {{
 *   data: any, loading: boolean, error: string|null,
 *   reload: () => Promise<void>,
 *   refreshing: boolean,   // 已有数据时的后台刷新（用于「更新中」降透明度）
 *   updatedAt: number,     // 最近一次成功拿到数据的毫秒时间戳，0 表示还没成功过
 * }}
 */
export function useApi(fetcher, deps = [], options = {}) {
    const { cacheKey, ttlMs = DEFAULT_TTL_MS } = options;
    const [data, setData] = useState(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(0);
    const [tick, setTick] = useState(0);

    // 等待本次请求结束的 resolver：让 reload() 返回 Promise，
    // 刷新按钮才能准确知道「什么时候算刷新完成」。
    const waiters = useRef([]);
    const settle = useCallback(() => {
        const list = waiters.current;
        waiters.current = [];
        list.forEach((fn) => fn());
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        beginRequest();
        (async () => {
            try {
                const result = cacheKey
                    ? await fetchWithCache(cacheKey, ttlMs, fetcher)
                    : await fetcher();
                if (!cancelled) {
                    setData(result);
                    setUpdatedAt(Date.now());
                    setLoading(false);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e.message || '加载失败');
                    setLoading(false);
                }
            } finally {
                endRequest();
                settle();
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick]);

    // 只在真正卸载时放掉挂起的 await；不能放进上面那个 effect 的 cleanup，
    // 否则 deps/tick 变化时（cleanup 先于新请求执行）会把 reload() 的 Promise
    // 提前兑现，刷新按钮将在请求完成前就显示「已更新」。
    useEffect(() => () => settle(), [settle]);

    // reload 视为用户主动刷新：先作废对应缓存再重拉，保证拿到最新数据。
    const reload = useCallback(() => {
        if (cacheKey) {
            cache.delete(cacheKey);
        }
        return new Promise((resolve) => {
            waiters.current.push(resolve);
            setTick((t) => t + 1);
        });
    }, [cacheKey]);

    return {
        data,
        loading,
        error,
        reload,
        refreshing: loading && data !== undefined,
        updatedAt,
    };
}
