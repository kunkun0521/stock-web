import { useEffect, useState } from 'react';

/**
 * 页面参数保持：值同时写入 sessionStorage。
 * <p>侧边栏切到其他页面再回来、浏览器前进/后退、以及刷新页面时，
 * 组件会重新挂载，这里能还原上一次的筛选条件、页码和表单输入。
 * 只在同一标签页会话内有效，关闭标签页后回到代码里的默认值。</p>
 */
const PREFIX = 'stock-web:page:';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 读取某个页面参数；不存在或存储不可用时返回 undefined。 */
export function readPageState(key) {
    try {
        const raw = sessionStorage.getItem(PREFIX + key);
        return raw === null ? undefined : JSON.parse(raw);
    } catch {
        return undefined;
    }
}

/** 写入某个页面参数；隐私模式或容量不足时静默降级，不影响页面功能。 */
export function writePageState(key, value) {
    try {
        sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
        try {
            // 写入失败时清掉旧值，避免下次还原出过期结果
            sessionStorage.removeItem(PREFIX + key);
        } catch {
            // 忽略存储不可用的情况
        }
    }
}

/**
 * 用法与 useState 完全一致，额外把值持久化到会话存储。
 * 对象是「参数字典」时按默认值补齐缺失字段，兼容后续新增参数。
 *
 * @param key      带页面前缀的唯一键，如 'stocks:page'
 * @param initial  默认值，或返回默认值的函数
 */
export function usePersistedState(key, initial) {
    const [value, setValue] = useState(() => {
        const fallback = typeof initial === 'function' ? initial() : initial;
        const saved = readPageState(key);
        if (saved === undefined) return fallback;
        if (isPlainObject(saved) && isPlainObject(fallback)) return { ...fallback, ...saved };
        return saved;
    });

    useEffect(() => {
        writePageState(key, value);
    }, [key, value]);

    return [value, setValue];
}
