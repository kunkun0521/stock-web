import { ACCENT, DOWN, MUTED, UP } from '../utils/format.js';

const AXIS_LINE = { lineStyle: { color: '#e6e8eb' } };
const SPLIT_LINE = { lineStyle: { color: '#f0f1f3' } };
const LEGEND_STYLE = {
    top: 0, left: 4, textStyle: { color: MUTED, fontSize: 11 },
    itemWidth: 12, itemHeight: 8,
};

const pick = (rows, key) => rows.map((row) => (row[key] === undefined || row[key] === null ? null : Number(row[key])));

/**
 * 成本线：清仓（无持仓）或净投入已收回（回本价 <= 0）时断开不绘制。
 * 否则单点 -2.6 会把整个 Y 轴拉到负值区，把股价与均线压成一条直线。
 */
const costLine = (rows, key) => rows.map((row) => {
    if (!row.position) return null;
    const value = Number(row[key]);
    return Number.isFinite(value) && value > 0 ? value : null;
});

/** 按交易日把成交记录归并，供买卖点散点系列使用（每日最多一笔）。 */
function tradeMarks(equity, trades) {
    const byDate = new Map();
    (trades || []).forEach((record) => {
        if (!byDate.has(record.tradeDate)) byDate.set(record.tradeDate, record);
    });
    const buy = [];
    const sell = [];
    (equity || []).forEach((point) => {
        const record = byDate.get(point.tradeDate);
        if (!record) {
            buy.push(null);
            sell.push(null);
            return;
        }
        const price = Number(record.price);
        buy.push(record.shares > 0 ? price : null);
        sell.push(record.shares < 0 ? price : null);
    });
    return { buy, sell };
}

/** 买卖点用「透明折线 + 显眼 symbol」画，避免额外注册散点图组件。 */
const dot = (name, data, color, symbol) => ({
    name, type: 'line', data, connectNulls: false,
    showSymbol: true, symbol, symbolSize: 10,
    lineStyle: { opacity: 0 }, itemStyle: { color, borderColor: '#fff', borderWidth: 1 },
    z: 6, tooltip: { show: false },
});

/** 股价 / MA20 / 账面成本 / 摊薄成本 + 买卖点。 */
export function priceCostOption(equity, trades) {
    const rows = equity || [];
    const dates = rows.map((row) => row.tradeDate);
    const marks = tradeMarks(rows, trades);

    return {
        animation: false,
        legend: { ...LEGEND_STYLE, data: ['收盘价', 'MA20', '账面成本', '摊薄成本', '买入', '卖出'] },
        tooltip: {
            trigger: 'axis', axisPointer: { type: 'cross' },
            valueFormatter: (value) => (value === null || value === undefined ? '-' : Number(value).toFixed(3)),
        },
        grid: { left: 58, right: 20, top: 26, bottom: 38 },
        xAxis: {
            type: 'category', data: dates, boundaryGap: false,
            axisLine: AXIS_LINE, axisLabel: { color: MUTED, fontSize: 10 },
        },
        yAxis: { scale: true, axisLine: AXIS_LINE, splitLine: SPLIT_LINE, axisLabel: { color: MUTED } },
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', bottom: 4, height: 16, borderColor: '#e6e8eb' },
        ],
        series: [
            { name: '收盘价', type: 'line', data: pick(rows, 'close'), showSymbol: false,
                lineStyle: { width: 1.8, color: ACCENT }, itemStyle: { color: ACCENT }, z: 3 },
            { name: 'MA20', type: 'line', data: pick(rows, 'ma20'), showSymbol: false,
                lineStyle: { width: 1, color: '#e8a33d' }, itemStyle: { color: '#e8a33d' } },
            { name: '账面成本', type: 'line', data: costLine(rows, 'avgCost'), showSymbol: false,
                lineStyle: { width: 1.2, type: 'dashed', color: '#9ca3af' }, itemStyle: { color: '#9ca3af' } },
            { name: '摊薄成本', type: 'line', data: costLine(rows, 'dilutedCost'), showSymbol: false,
                lineStyle: { width: 2.2, color: '#7c3aed' }, itemStyle: { color: '#7c3aed' }, z: 4 },
            dot('买入', marks.buy, UP, 'triangle'),
            dot('卖出', marks.sell, DOWN, 'pin'),
        ],
    };
}

const asNumber = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
const text = (value, digits = 2) => {
    const number = asNumber(value);
    return Number.isFinite(number) ? number.toFixed(digits) : '-';
};

/**
 * 查询股票的日 K 线（蜡烛图）：叠加 MA5/10/20、账面/摊薄成本、买卖点，
 * 并用浅紫色区域标出本次实际回放区间。K 线数据由模拟接口一次返回，前端不再另拉行情。
 * 红涨绿跌遵循 A 股习惯。
 */
export function klineOption(result) {
    const rows = result?.kline || [];
    const dates = rows.map((row) => row.tradeDate);
    const equityByDate = new Map((result?.equity || []).map((point) => [point.tradeDate, point]));
    const tradesByDate = new Map();
    (result?.trades || []).forEach((trade) => {
        const previous = tradesByDate.get(trade.tradeDate);
        if (!previous || Math.abs(trade.shares) > Math.abs(previous.shares)) {
            tradesByDate.set(trade.tradeDate, trade);
        }
    });

    const candles = rows.map((row) => [
        asNumber(row.open), asNumber(row.close), asNumber(row.low), asNumber(row.high),
    ]);
    const cost = (key) => rows.map((row) => {
        const point = equityByDate.get(row.tradeDate);
        if (!point || !point.position) return null;
        const value = asNumber(point[key]);
        return Number.isFinite(value) && value > 0 ? value : null;
    });
    const mark = (isBuy) => rows.map((row) => {
        const trade = tradesByDate.get(row.tradeDate);
        if (!trade) return null;
        return (isBuy ? trade.shares > 0 : trade.shares < 0) ? asNumber(trade.price) : null;
    });
    const ma = (key, color, width = 1) => ({
        name: key.toUpperCase(), type: 'line', data: rows.map((row) => asNumber(row[key])),
        showSymbol: false, connectNulls: false,
        lineStyle: { width, color }, itemStyle: { color }, z: 3,
    });
    const tipLine = (label, value) => `<div style="display:flex;justify-content:space-between;gap:16px">`
        + `<span style="color:#6b7280">${label}</span><b>${value}</b></div>`;
    const replayIndex = rows.findIndex((row) => row.inReplay);
    const replayArea = replayIndex >= 0 ? {
        markArea: {
            silent: true,
            itemStyle: { color: 'rgba(124,58,237,0.07)' },
            data: [[{ xAxis: dates[replayIndex] }, { xAxis: dates[dates.length - 1] }]],
        },
    } : {};

    return {
        animation: false,
        legend: { ...LEGEND_STYLE, itemGap: 8, data: ['K线', 'MA20', '摊薄成本', '买入', '卖出'] },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: 'rgba(255,255,255,.96)',
            borderColor: '#e6e8eb',
            textStyle: { color: '#1f2937', fontSize: 11 },
            formatter: (params) => {
                const list = Array.isArray(params) ? params : [params];
                const index = list[0]?.dataIndex;
                const row = rows[index];
                if (!row) return '';
                const close = asNumber(row.close);
                const previous = index > 0 ? asNumber(rows[index - 1].close) : null;
                const change = previous && close ? (close / previous - 1) * 100 : null;
                const point = equityByDate.get(row.tradeDate);
                return `<div style="min-width:158px;line-height:1.7">
                    <div style="font-weight:600;margin-bottom:2px">${row.tradeDate}${row.inReplay ? ' · 回放区间' : ''}</div>
                    ${tipLine('开 / 收', `${text(row.open)} / ${text(row.close)}`)}
                    ${tipLine('高 / 低', `${text(row.high)} / ${text(row.low)}`)}
                    ${tipLine('涨跌', change === null ? '-' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`)}
                    ${tipLine('MA5 / MA20', `${text(row.ma5)} / ${text(row.ma20)}`)}
                    ${point && point.position ? tipLine('摊薄成本', text(point.dilutedCost)) : ''}
                </div>`;
            },
        },
        grid: { left: 58, right: 20, top: 26, bottom: 38 },
        xAxis: {
            type: 'category', data: dates, boundaryGap: true,
            axisLine: AXIS_LINE, axisLabel: { color: MUTED, fontSize: 10 },
        },
        yAxis: { scale: true, axisLine: AXIS_LINE, splitLine: SPLIT_LINE, axisLabel: { color: MUTED } },
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', bottom: 4, height: 16, borderColor: '#e6e8eb' },
        ],
        series: [
            {
                name: 'K线', type: 'candlestick', data: candles, z: 2,
                itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
                ...replayArea,
            },
            ma('ma5', '#e8a33d'),
            ma('ma10', ACCENT),
            ma('ma20', '#9b6dd6', 1.4),
            { name: '账面成本', type: 'line', data: cost('avgCost'), showSymbol: false,
                lineStyle: { width: 1.2, type: 'dashed', color: '#9ca3af' }, itemStyle: { color: '#9ca3af' } },
            { name: '摊薄成本', type: 'line', data: cost('dilutedCost'), showSymbol: false,
                lineStyle: { width: 2.2, color: '#7c3aed' }, itemStyle: { color: '#7c3aed' }, z: 4 },
            dot('买入', mark(true), UP, 'triangle'),
            dot('卖出', mark(false), DOWN, 'pin'),
        ],
    };
}

/** 总资产曲线 + 初始资产基准 + 回撤（右轴）。 */
export function assetOption(equity, initialAssets) {
    const rows = equity || [];
    const dates = rows.map((row) => row.tradeDate);
    const baseline = Number(initialAssets) || 0;
    return {
        animation: false,
        legend: { ...LEGEND_STYLE, data: ['总资产', '期初资产', '回撤'] },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        grid: { left: 66, right: 56, top: 26, bottom: 38 },
        xAxis: {
            type: 'category', data: dates, boundaryGap: false,
            axisLine: AXIS_LINE, axisLabel: { color: MUTED, fontSize: 10 },
        },
        yAxis: [
            { scale: true, axisLine: AXIS_LINE, splitLine: SPLIT_LINE,
                axisLabel: { color: MUTED, formatter: (v) => (v / 10000).toFixed(1) + '万' } },
            { scale: true, splitLine: { show: false },
                axisLabel: { color: MUTED, formatter: '{value}%' } },
        ],
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', bottom: 4, height: 16, borderColor: '#e6e8eb' },
        ],
        series: [
            { name: '总资产', type: 'line', data: pick(rows, 'totalAssets'), showSymbol: false,
                lineStyle: { width: 2, color: ACCENT }, itemStyle: { color: ACCENT },
                areaStyle: { color: `${ACCENT}14` } },
            { name: '期初资产', type: 'line', data: rows.map(() => baseline), showSymbol: false,
                lineStyle: { width: 1, type: 'dashed', color: '#9ca3af' }, itemStyle: { color: '#9ca3af' } },
            { name: '回撤', type: 'line', yAxisIndex: 1, data: pick(rows, 'drawdownPct'),
                showSymbol: false, lineStyle: { width: 1.2, color: DOWN },
                itemStyle: { color: DOWN }, areaStyle: { color: `${DOWN}12` } },
        ],
    };
}
