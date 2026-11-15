/** 概率页统一格式：概率百分比 1 位小数、收益率 +2.3% 形式、红涨绿跌（A股习惯）。 */

export const DISCLAIMER =
    '本系统输出为基于历史数据的统计估计，仅供量化研究参考，不构成任何投资建议。历史概率不代表未来表现，投资有风险。';

export function num(v, digits = 2) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

/** 0.5596 → "55.9%" */
export function pct(v, digits = 1) {
    const n = Number(v);
    return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—';
}

/** 0.023 → "+2.3%"，负数为绿色（下跌） */
export function signedPct(v, digits = 1) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const s = `${n > 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`;
    return s;
}

/** 数值 → 涨跌色调（红涨绿跌） */
export function tone(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return 'plain';
    return n > 0 ? 'up' : 'down';
}

export const RISK_LABEL = { 1: '低', 2: '中', 3: '高', 4: '极高' };
export const RISK_TONE = { 1: 'down', 2: 'plain', 3: 'warn', 4: 'up' };
export const GRADE_TONE = { A: 'down', B: 'info', C: 'warn', D: 'up' };
export const GRADE_HINT = {
    A: '样本外有显著优势',
    B: '样本外优势未达显著',
    C: '无样本外预测优势',
    D: '多项降级 / 需谨慎解读',
};
export const STATUS_CN = { RUNNING: '运行中', SUCCESS: '成功', FAILED: '失败', PENDING: '待处理', SETTLED: '已结算' };
export const STATUS_TONE = { RUNNING: 'info', SUCCESS: 'down', FAILED: 'up', PENDING: 'warn', SETTLED: 'plain' };
export const VOL_CN = { GARCH: 'GARCH(1,1)-t', EWMA: 'EWMA 回退' };

export function dateStr(v) {
    if (!v) return '—';
    return String(v).slice(0, 10);
}

export function shortText(v, n = 60) {
    const s = String(v ?? '');
    return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** 区间条：把 [q05,q95] 映射到以 0 为中心的对称刻度，返回各段百分比 */
export function intervalBar(row) {
    const lo = Number(row.q05), hi = Number(row.q95);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    const span = Math.max(Math.abs(lo), Math.abs(hi), 0.01) * 1.15;
    const toPct = (x) => Math.max(0, Math.min(100, (x + span) / (2 * span) * 100));
    return { q05: toPct(lo), q50: toPct(Number(row.q50) || 0), q95: toPct(hi), zero: 50 };
}

export function asObject(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { /* ignore */ }
    }
    return {};
}

export function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray(v.items)) return v.items;
    return [];
}
