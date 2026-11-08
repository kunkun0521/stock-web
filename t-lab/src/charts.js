import { UP, DOWN, MUTED, ACCENT, colorOf, money, num } from './utils.js';

const SPLIT = { show: true, lineStyle: { color: '#eef1f5' } };
const AXIS_LINE = { lineStyle: { color: '#dfe3e9' } };
const LABEL = { color: MUTED, fontSize: 10 };
const LEGEND = { textStyle: { color: MUTED, fontSize: 11 }, itemWidth: 14, itemHeight: 8, top: 2 };

/** 主图：日K线（红涨绿跌）+ MA5/10/20 + 摊薄成本线 + 买卖点标记 + 事件竖线 */
export function klineOption(kline, trades) {
    const rows = kline || [];
    const dates = rows.map((r) => r.tradeDate);
    const candles = rows.map((r) => [num(r.open), num(r.close), num(r.low), num(r.high)]);
    // 价格 / 成本不可能为 0：后端清仓后返回 null，这里把 0 与非法值统一当断点，避免拉坏 Y 轴
    const seriesValue = (r, key) => {
        const v = num(r[key]);
        return v === null || !Number.isFinite(v) || v <= 0 ? null : v;
    };
    const line = (name, key, color, width = 1.2) => ({
        name, type: 'line', data: rows.map((r) => seriesValue(r, key)),
        showSymbol: false, smooth: false, connectNulls: true,
        lineStyle: { width, color, opacity: 0.95 }, itemStyle: { color }, z: 4,
    });

    // 买卖点：按日期聚合事件，映射到收盘价附近
    const marks = [];
    (trades || []).forEach((t) => {
        const idx = dates.indexOf(t.tradeDate);
        if (idx < 0) return;
        const a = t.action;
        let symbol, color, name;
        if (a === 'INIT') { symbol = 'triangle'; color = ACCENT; name = '建仓'; }
        else if (a === 'ADD' || a === 'BUYBACK' || a === 'FORCE_BUYBACK') { symbol = 'triangle'; color = UP; name = '补仓'; }
        else if (a === 'T_SELL' || a === 'SELL_PENDING' || a === 'PENDING_SELL') { symbol = 'pin'; color = '#8b5cf6'; name = '高抛'; }
        else if (a === 'T_BUY') { symbol = 'pin'; color = '#0ea5e9'; name = '低吸'; }
        else if (a === 'EXIT') { symbol = 'diamond'; color = DOWN; name = '离场'; }
        else if (a === 'STOP') { symbol = 'diamond'; color = '#111827'; name = '止损'; }
        else return;
        const base = num(rows[idx].low);
        marks.push({
            name, xAxis: t.tradeDate,
            yAxis: name === '高抛' || name === '离场' || name === '止损'
                ? num(rows[idx].high) : base,
            value: name,
            itemStyle: { color },
            symbol, symbolSize: 9,
            label: { show: false },
        });
    });

    return {
        animation: false,
        tooltip: {
            trigger: 'axis', axisPointer: { type: 'cross' },
            backgroundColor: 'rgba(255,255,255,.96)', borderColor: '#e5e7eb',
            textStyle: { color: '#1f2937', fontSize: 11 },
            formatter: (params) => {
                const i = params[0]?.dataIndex ?? 0;
                const r = rows[i];
                if (!r) return '';
                const ev = trades?.filter((t) => t.tradeDate === r.tradeDate).map((t) => t.action).join(' / ') || '-';
                return `<b>${r.tradeDate}</b><br/>开 ${money(r.open)}　高 ${money(r.high)}<br/>低 ${money(r.low)}　收 ${money(r.close)}`
                    + `<br/>摊薄成本 ${money(r.dilutedCost)}<br/>事件 ${ev}`;
            },
        },
        legend: { ...LEGEND, data: ['日K', 'MA5', 'MA10', 'MA20', '摊薄成本'], right: 10 },
        grid: { left: 62, right: 16, top: 30, bottom: 40 },
        xAxis: {
            type: 'category', data: dates, boundaryGap: true,
            axisLabel: { ...LABEL, hideOverlap: true }, axisLine: AXIS_LINE, axisTick: { show: false },
        },
        yAxis: {
            type: 'value', scale: true,
            axisLabel: { ...LABEL, formatter: (v) => v.toFixed(0) },
            splitLine: SPLIT, axisLine: { show: false },
        },
        dataZoom: [
            { type: 'inside', xAxisIndex: 0, start: 0, end: 100 },
            { type: 'slider', xAxisIndex: 0, height: 14, bottom: 6, borderColor: '#e5e7eb',
              fillerColor: 'rgba(47,111,237,.12)', handleStyle: { color: ACCENT } },
        ],
        series: [
            {
                name: '日K', type: 'candlestick', data: candles, z: 3,
                itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
                markPoint: marks.length ? { data: marks, silent: true } : undefined,
            },
            line('MA5', 'ma5', '#f59e0b'),
            line('MA10', 'ma10', '#8b5cf6'),
            line('MA20', 'ma20', ACCENT),
            { ...line('摊薄成本', 'dilutedCost', '#ec4899', 1.8),
              connectNulls: false,
              lineStyle: { width: 1.8, color: '#ec4899', type: 'dashed' } },
        ],
    };
}

/** 副图：三条净值曲线（含做T / 只补仓不做T / 买入持有） */
export function equityOption(benchmarks) {
    const rows = benchmarks?.curves || [];
    const dates = rows.map((r) => r.date ?? r.index);
    const series = (name, key, color, width) => ({
        name, type: 'line', data: rows.map((r) => num(r[key])),
        showSymbol: false, smooth: false, connectNulls: true,
        lineStyle: { width, color }, itemStyle: { color },
    });
    return {
        animation: false,
        tooltip: {
            trigger: 'axis', backgroundColor: 'rgba(255,255,255,.96)', borderColor: '#e5e7eb',
            textStyle: { color: '#1f2937', fontSize: 11 },
            valueFormatter: (v) => (v == null ? '-' : '¥' + money(v)),
        },
        legend: { ...LEGEND, data: ['含做T策略', '只补仓不做T', '买入持有'], right: 10 },
        grid: { left: 76, right: 16, top: 30, bottom: 26 },
        xAxis: { type: 'category', data: dates, axisLabel: { ...LABEL, hideOverlap: true }, axisLine: AXIS_LINE, axisTick: { show: false } },
        yAxis: { type: 'value', scale: true, axisLabel: { ...LABEL, formatter: (v) => (v / 10000).toFixed(1) + '万' }, splitLine: SPLIT },
        series: [
            series('含做T策略', 'strategy', UP, 2),
            series('只补仓不做T', 'onlyAdd', '#f59e0b', 1.4),
            series('买入持有', 'buyHold', MUTED, 1.4),
        ],
    };
}

/** 扫描：每个买入日 finalPnlPct 柱状图，红涨绿跌，点击跳转回本模拟 */
export function scanBarOption(rows) {
    const list = rows || [];
    return {
        animation: false,
        tooltip: {
            trigger: 'axis', axisPointer: { type: 'shadow' },
            backgroundColor: 'rgba(255,255,255,.96)', borderColor: '#e5e7eb',
            textStyle: { color: '#1f2937', fontSize: 11 },
            formatter: (params) => {
                const r = list[params[0].dataIndex];
                if (!r) return '';
                return `<b>${r.buyDate}</b><br/>策略收益 ${r.finalPnlPct}%<br/>买入持有 ${r.buyHoldPct}%`
                    + `<br/>只补仓 ${r.onlyAddPct}%<br/>最大回撤 ${r.maxDrawdown}%`
                    + `<br/>做T ${r.tCount} 次 / 净利 ¥${money(r.tNetProfit)}<br/><i>点击可跳转到该日回本模拟</i>`;
            },
        },
        grid: { left: 58, right: 16, top: 18, bottom: 44 },
        xAxis: { type: 'category', data: list.map((r) => r.buyDate),
                 axisLabel: { ...LABEL, rotate: 45, hideOverlap: true }, axisLine: AXIS_LINE, axisTick: { show: false } },
        yAxis: { type: 'value', axisLabel: { ...LABEL, formatter: (v) => v + '%' }, splitLine: SPLIT },
        dataZoom: [
            { type: 'inside', xAxisIndex: 0, start: 0, end: 100 },
            { type: 'slider', xAxisIndex: 0, height: 14, bottom: 6, borderColor: '#e5e7eb', fillerColor: 'rgba(47,111,237,.12)' },
        ],
        series: [{
            type: 'bar', barMaxWidth: 18,
            data: list.map((r) => ({ value: num(r.finalPnlPct), itemStyle: { color: colorOf(r.finalPnlPct) } })),
        }],
    };
}
