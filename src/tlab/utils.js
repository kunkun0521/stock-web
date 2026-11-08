/** 涨红跌绿（A股习惯），全局统一取色与格式化 */
export const UP = '#d8392b';
export const DOWN = '#17924e';
export const MUTED = '#6b7280';
export const ACCENT = '#2f6fed';

export const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
export const colorOf = (v) => { const n = num(v); return n === null ? MUTED : n > 0 ? UP : n < 0 ? DOWN : MUTED; };
export const toneClass = (v) => { const n = num(v); return n === null ? 'flat' : n > 0 ? 'up' : n < 0 ? 'down' : 'flat'; };

/** 金额：一律两位小数，带千分位 */
export const money = (v) => {
    const n = num(v);
    if (n === null || !Number.isFinite(n)) return '-';
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** 百分比：入参已是百分数数值（后端统一口径），带正负号 */
export const pct = (v, digits = 2) => {
    const n = num(v);
    if (n === null || !Number.isFinite(n)) return '-';
    return (n > 0 ? '+' : '') + n.toFixed(digits) + '%';
};

export const fmtNum = (v, digits = 2) => {
    const n = num(v);
    return n === null || !Number.isFinite(n) ? '-' : n.toFixed(digits);
};

export const todayStr = () => new Date().toLocaleDateString('sv-SE');
export const shiftDays = (base, days) => {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('sv-SE');
};

/** 交易明细导出 CSV（带 BOM，Excel 直接打开不乱码） */
export function downloadCsv(filename, columns, rows) {
    const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => esc(c.label)).join(',')];
    rows.forEach((row) => lines.push(columns.map((c) => esc(c.get(row))).join(',')));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
