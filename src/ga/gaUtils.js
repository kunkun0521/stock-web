/**
 * 遗传算法模块共享常量与格式化工具。
 * 只做纯计算与兜底，不含 JSX，方便各页面直接引用。
 * 颜色、涨跌幅等沿用主站 src/utils/format.js，避免两套口径。
 */
import {
    UP, DOWN, MUTED, ACCENT, colorOf, pctClass, formatPct, formatNum, formatPrice,
} from '../utils/format.js';

export { UP, DOWN, MUTED, ACCENT, colorOf, pctClass, formatPct, formatNum, formatPrice };

/**
 * 模块挂载基址。GaApp 约定挂在 /ga/* 下；个股详情、标签导航都用它拼绝对路径。
 * 若主站把模块挂到别的前缀，只改这一处即可。
 */
export const GA_BASE = '/ga';

/** 系统使用的 5 个预测周期，最新周期卡片、热力图列、多周期请求都以此为准。 */
/** 与 ga_config 的 horizons 默认值（1,3,5,10,15）保持一致。 */
export const HORIZONS = [1, 3, 5, 10, 15];

export const HORIZON_OPTIONS = [
    { value: '', label: '全部周期' },
    ...HORIZONS.map((h) => ({ value: String(h), label: `${h} 日` })),
];

export const BOARD_OPTIONS = [
    { value: '', label: '全部板块' },
    { value: 'MAIN', label: '主板' },
    { value: 'GEM', label: '创业板' },
    { value: 'STAR', label: '科创板' },
    { value: 'BJ', label: '北交所' },
];

export const STRICT_OPTIONS = [
    { value: '', label: '全部口径' },
    { value: 'true', label: '严格' },
    { value: 'false', label: '宽松' },
];

export const REPLAY_OPTIONS = [
    { value: 'false', label: '仅实盘' },
    { value: 'true', label: '含回放' },
];

export const DIRECTION_OPTIONS = [
    { value: '', label: '全部方向' },
    { value: '1', label: '看涨' },
    { value: '-1', label: '看跌' },
];

export const RESULT_OPTIONS = [
    { value: '', label: '全部结果' },
    { value: 'correct', label: '命中' },
    { value: 'wrong', label: '未命中' },
    { value: 'pending', label: '待验证' },
];

export const INPOOL_OPTIONS = [
    { value: '', label: '全部' },
    { value: 'true', label: '在池' },
    { value: 'false', label: '不在池' },
];

export const SORT_OPTIONS = [
    { value: 'tradeDate,desc', label: '日期 ↓' },
    { value: 'tradeDate,asc', label: '日期 ↑' },
    { value: 'confidence,desc', label: '置信度 ↓' },
    { value: 'confidence,asc', label: '置信度 ↑' },
    { value: 'actualReturn,desc', label: '真实收益 ↓' },
    { value: 'probUp,desc', label: '上涨概率 ↓' },
];

/** 错误分析分桶维度，取值由契约明确给出。 */
export const DIM_OPTIONS = [
    { value: 'vol', label: '波动率' },
    { value: 'amount', label: '成交额' },
    { value: 'pe', label: '市盈率' },
    { value: 'board', label: '板块' },
    { value: 'regime', label: '市场状态' },
    { value: 'prob', label: '概率' },
    { value: 'limit', label: '涨跌停' },
];

export const ACTION_OPTIONS = [
    { value: 'ELIMINATE', label: '淘汰' },
    { value: 'RESTORE', label: '复活' },
    { value: 'WHITELIST', label: '加白名单' },
];

/** 任意值 → 数组，字段缺失/类型不符时返回空数组，页面不会因 undefined.map 崩溃。 */
export const asArray = (v) => (Array.isArray(v) ? v : []);

/** 任意值 → 对象，同上。 */
export const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** 安全数值转换：非法值返回 null。 */
export const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * 比例（0~1）→ 百分比文本。
 * 契约未说明命中率/概率是 0~1 还是 0~100，这里做兼容：绝对值 ≤1 视为比例乘 100，
 * 大于 1 视为已经是百分数。展示口径统一，避免各页面各自解释。
 */
export function fmtRate(v, digits = 1) {
    const n = num(v);
    if (n === null) return '-';
    const pct = Math.abs(n) <= 1 ? n * 100 : n;
    return `${pct.toFixed(digits)}%`;
}

/** 带正负号的比例文本，用于差值/贡献类展示。 */
export function fmtSignedRate(v, digits = 1) {
    const n = num(v);
    if (n === null) return '-';
    const pct = Math.abs(n) <= 1 ? n * 100 : n;
    return `${pct > 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

/** 整数（样本数、总数、代数等），带千分位。 */
export function fmtInt(v) {
    const n = num(v);
    if (n === null) return '-';
    return Math.round(n).toLocaleString('zh-CN');
}

/** 普通数值，保留 digits 位；非法值显示 '-'。复用主站 formatNum。 */
export function fmtNum(v, digits = 2) {
    return v === null || v === undefined || v === '' ? '-' : formatNum(v, digits);
}

/** 日期/字符串原样展示，缺失显示 '-'。 */
export function fmtText(v) {
    return v === null || v === undefined || v === '' ? '-' : String(v);
}

/** 方向标签：兼容数字 1/-1、字符串、以及 UP/DOWN 写法。 */
export function isUpDir(v) {
    return v === 1 || v === '1' || v === 'UP' || v === 'up' || v === true;
}
export function isDownDir(v) {
    return v === -1 || v === '-1' || v === 'DOWN' || v === 'down';
}
export function dirLabel(v) {
    if (isUpDir(v)) return '看涨';
    if (isDownDir(v)) return '看跌';
    return '中性';
}
/** 方向对应的涨跌色调（A 股涨红跌绿），用于徽标与文字。 */
export function dirTone(v) {
    if (isUpDir(v)) return 'up';
    if (isDownDir(v)) return 'down';
    return 'flat';
}

/**
 * 从股票代码推断市场。predictions / picks 的返回项没有 market 字段，
 * 而个股详情路径需要 {market}，这里按 A 股代码规则兜底；若返回项里带 market 则优先用。
 * 返回的 SH/SZ/BJ 取值约定见 README 歧义说明。
 */
export function guessMarket(code) {
    const s = String(code ?? '').toUpperCase();
    if (s.startsWith('SH')) return 'SH';
    if (s.startsWith('SZ')) return 'SZ';
    if (s.startsWith('BJ')) return 'BJ';
    const d = s.replace(/\D/g, '');
    if (/^[569]/.test(d)) return 'SH';
    if (/^[48]/.test(d)) return 'BJ';
    return 'SZ';
}

/** 取返回项的市场：优先用后端给的 market，否则按代码推断。 */
export const marketOf = (item) => (item && item.market !== undefined && item.market !== null
    && item.market !== '' ? item.market : guessMarket(item?.code));
