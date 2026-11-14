/** 量化页面的数值格式化：比例入参统一 0~1。 */

export function pct(v, digits = 2) {
    const n = Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) return '-';
    return `${(n * 100).toFixed(digits)}%`;
}

export function signedPct(v, digits = 2) {
    const n = Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) return '-';
    const s = (n * 100).toFixed(digits);
    return `${n > 0 ? '+' : ''}${s}%`;
}

export function num(v, digits = 2) {
    const n = Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) return '-';
    return n.toFixed(digits);
}

export function int(v) {
    const n = Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) return '-';
    return n.toLocaleString('zh-CN');
}

export function money(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
    return n.toFixed(0);
}

/** 收益着色：红涨绿跌。 */
export function tone(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return '';
    return n > 0 ? 'ga-up' : 'ga-down';
}

export function duration(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '-';
    if (n < 1000) return `${n} ms`;
    if (n < 60000) return `${(n / 1000).toFixed(1)} s`;
    const m = Math.floor(n / 60000);
    return `${m}m${Math.round((n % 60000) / 1000)}s`;
}

export const STATUS_CN = {
    PENDING: '排队中', RUNNING: '运行中', SUCCESS: '成功', FAILED: '失败', CANCELED: '已取消',
};

export const STATUS_TONE = {
    PENDING: 'muted', RUNNING: 'accent', SUCCESS: 'down', FAILED: 'up', CANCELED: 'muted',
};

export const TYPE_CN = { LEFT: '左侧', RIGHT: '右侧', HYBRID: '混合' };
