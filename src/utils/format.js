/** 涨红跌绿（A 股习惯），全局统一取色 */
export const UP = '#d8392b';
export const DOWN = '#17924e';
export const MUTED = '#6b7280';
export const ACCENT = '#2f6fed';

export const colorOf = (value) => (value > 0 ? UP : value < 0 ? DOWN : MUTED);

export const pctClass = (value) => {
    if (value === null || value === undefined || value === '') return 'flat';
    return Number(value) > 0 ? 'up' : Number(value) < 0 ? 'down' : 'flat';
};

/** 百分比文本，带正负号 */
export const formatPct = (value, digits = 2) => {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(value);
    return (n > 0 ? '+' : '') + n.toFixed(digits) + '%';
};

/** 金额：亿 / 万 */
export const formatAmount = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const n = Math.abs(Number(value));
    const sign = Number(value) < 0 ? '-' : '';
    if (n >= 1e8) return `${sign}${(n / 1e8).toFixed(2)} 亿`;
    if (n >= 1e4) return `${sign}${(n / 1e4).toFixed(2)} 万`;
    return `${sign}${n.toFixed(0)}`;
};

/** 股价小数位：按价格量级自适应，避免低价股只显示 2 位丢失精度 */
export const formatPrice = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(value);
    return n >= 100 ? n.toFixed(2) : n.toFixed(3);
};

export const formatNum = (value, digits = 2) => {
    if (value === null || value === undefined || value === '') return '-';
    return Number(value).toFixed(digits);
};

/** 成交量（单位：股）→ 万股 / 亿股 */
export const formatVolume = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(value);
    if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿手`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(2)} 万股`;
    return `${n.toFixed(0)} 股`;
};

export const marketLabel = (market) => (market === 1 ? '上海' : market === 0 ? '深圳' : '-');
