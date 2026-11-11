import { DOWN, MUTED, UP } from '../utils/format.js';

const AXIS_LINE = { lineStyle: { color: '#e6e8eb' } };
const SPLIT_LINE = { lineStyle: { color: '#f0f1f3' } };
const LEGEND_STYLE = { top: 0, left: 4, textStyle: { color: MUTED, fontSize: 11 }, itemWidth: 12, itemHeight: 8 };

const line = (bars, key) => bars.map((b) => (b[key] === undefined ? null : b[key]));

/**
 * K 线 + 均线 + 成交量 + MACD（三宫格）。
 * height 为图表容器像素高：主图、成交量、MACD 三块按高度比例分配，
 * 这样调高容器时三个区域一起变大，不会在底部留出空白。
 */
export function klineOption(series, height = 460) {
    const h = Math.max(360, Number(height) || 460);
    const top = 30;         // 图例区
    const bottom = 40;      // 日期轴标签 + 缩放条
    const gap = 8;
    const usable = h - top - bottom;
    const sub = Math.max(50, Math.round(usable * 0.14));
    const main = usable - sub * 2 - gap * 2;
    const g2 = top + main + gap;
    const g3 = g2 + sub + gap;

    const bars = series?.bars ?? [];
    const dates = bars.map((b) => b.tradeDate);
    const candle = bars.map((b) => [b.open, b.close, b.low, b.high]);
    const volumes = bars.map((b) => ({
        value: b.volume,
        itemStyle: { color: b.close >= b.open ? `${UP}aa` : `${DOWN}aa` },
    }));

    const maSeries = [
        { name: 'MA5', key: 'ma5', color: '#e8a33d' },
        { name: 'MA10', key: 'ma10', color: '#3f8cff' },
        { name: 'MA20', key: 'ma20', color: '#9b59b6' },
        { name: 'MA60', key: 'ma60', color: '#4b5563' },
    ].map(({ name, key, color }) => ({
        name,
        type: 'line',
        data: line(bars, key),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1, color },
        itemStyle: { color },
    }));

    return {
        animation: false,
        legend: { ...LEGEND_STYLE, type: 'scroll', width: '86%' },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: [
            { left: 58, right: 20, top, height: main },
            { left: 58, right: 20, top: g2, height: sub },
            { left: 58, right: 20, top: g3, height: sub },
        ],
        xAxis: [
            { type: 'category', data: dates, boundaryGap: true, axisLabel: { show: false }, axisLine: AXIS_LINE },
            { type: 'category', gridIndex: 1, data: dates, axisLabel: { show: false }, axisLine: AXIS_LINE },
            {
                type: 'category', gridIndex: 2, data: dates, axisLine: AXIS_LINE,
                axisLabel: { color: MUTED, fontSize: 10 },
            },
        ],
        yAxis: [
            { scale: true, axisLabel: { color: MUTED }, splitLine: SPLIT_LINE },
            { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
            { gridIndex: 2, axisLabel: { color: MUTED, fontSize: 10 }, splitLine: SPLIT_LINE },
        ],
        dataZoom: [
            { type: 'inside', xAxisIndex: [0, 1, 2], start: 55, end: 100 },
            { type: 'slider', xAxisIndex: [0, 1, 2], bottom: 2, height: 14, borderColor: '#e6e8eb' },
        ],
        series: [
            {
                name: 'K线', type: 'candlestick', data: candle,
                itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
            },
            ...maSeries,
            { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes },
            {
                name: 'MACD', type: 'bar', xAxisIndex: 2, yAxisIndex: 2,
                data: bars.map((b) => ({
                    value: b.macd,
                    itemStyle: { color: b.macd >= 0 ? `${UP}cc` : `${DOWN}cc` },
                })),
            },
            {
                name: 'DIF', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: line(bars, 'dif'),
                showSymbol: false, lineStyle: { width: 1, color: '#e8a33d' },
            },
            {
                name: 'DEA', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: line(bars, 'dea'),
                showSymbol: false, lineStyle: { width: 1, color: '#3f8cff' },
            },
            {
                name: 'BOLL', type: 'line', data: line(bars, 'bollUpper'),
                showSymbol: false, lineStyle: { width: 1, type: 'dotted', color: '#9ca3af' },
            },
            {
                name: 'BOLL下轨', type: 'line', data: line(bars, 'bollLower'),
                showSymbol: false, lineStyle: { width: 1, type: 'dotted', color: '#9ca3af' },
            },
        ],
    };
}

/** 涨跌幅分布直方图 */
export function distributionOption(data) {
    const buckets = data?.buckets ?? [];
    return {
        grid: { left: 46, right: 16, top: 18, bottom: 52 },
        tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}<br/>家数：${p[0].value}` },
        xAxis: {
            type: 'category',
            data: buckets.map((b) => b.label),
            axisLabel: { rotate: 45, color: MUTED, fontSize: 10 },
            axisLine: AXIS_LINE,
            axisTick: { show: false },
        },
        yAxis: {
            type: 'value', name: '家数', nameTextStyle: { color: MUTED, fontSize: 11 },
            axisLabel: { color: MUTED }, splitLine: SPLIT_LINE,
        },
        series: [{
            type: 'bar',
            barMaxWidth: 26,
            data: buckets.map((b) => ({
                value: b.count,
                itemStyle: { color: b.label.startsWith('-') || b.label.startsWith('≤') ? DOWN : UP, borderRadius: [3, 3, 0, 0] },
            })),
        }],
    };
}

/** 板块 / 行业表现（横向条形图，弱在前强在后） */
export function sectorOption(list) {
    const rows = [...(list ?? [])].reverse();
    return {
        grid: { left: 110, right: 52, top: 10, bottom: 20 },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: (params) => {
                const item = rows[params[0].dataIndex];
                return [
                    `<b>${item.name}</b>`,
                    `平均涨跌幅：${item.avgPctChg > 0 ? '+' : ''}${Number(item.avgPctChg).toFixed(2)}%`,
                    `家数：${item.stockCount}（涨 ${item.upCount} / 跌 ${item.downCount}）`,
                    `成交额：${(Number(item.totalAmount) / 1e8).toFixed(2)} 亿`,
                ].join('<br/>');
            },
        },
        xAxis: {
            type: 'value',
            axisLabel: { color: MUTED, fontSize: 10, formatter: '{value}%' },
            splitLine: SPLIT_LINE,
        },
        yAxis: {
            type: 'category',
            data: rows.map((s) => s.name),
            axisLabel: { color: MUTED, fontSize: 11 },
            axisLine: AXIS_LINE,
            axisTick: { show: false },
        },
        series: [{
            type: 'bar',
            data: rows.map((s) => ({
                value: s.avgPctChg,
                itemStyle: { color: s.avgPctChg >= 0 ? UP : DOWN, borderRadius: 3 },
            })),
            label: {
                show: true, position: 'right', color: MUTED, fontSize: 10,
                formatter: (p) => `${p.value > 0 ? '+' : ''}${Number(p.value).toFixed(2)}%`,
            },
        }],
    };
}

/** 市场宽度：涨跌家数堆叠柱 + 成交额折线 */
export function breadthOption(list) {
    const rows = list ?? [];
    return {
        grid: { left: 56, right: 58, top: 28, bottom: 44 },
        tooltip: { trigger: 'axis' },
        legend: { ...LEGEND_STYLE, left: 'center' },
        xAxis: {
            type: 'category',
            data: rows.map((d) => d.tradeDate),
            axisLabel: { color: MUTED, fontSize: 10 },
            axisLine: AXIS_LINE,
        },
        yAxis: [
            {
                type: 'value', name: '家数', nameTextStyle: { color: MUTED, fontSize: 11 },
                axisLabel: { color: MUTED }, splitLine: SPLIT_LINE,
            },
            {
                type: 'value', name: '成交额', nameTextStyle: { color: MUTED, fontSize: 11 },
                axisLabel: { color: MUTED, fontSize: 10, formatter: (v) => `${(v / 1e8).toFixed(0)}亿` },
                splitLine: { show: false },
            },
        ],
        series: [
            {
                name: '上涨家数', type: 'bar', stack: 'breadth',
                data: rows.map((d) => d.upCount), itemStyle: { color: `${UP}cc` },
            },
            {
                name: '下跌家数', type: 'bar', stack: 'breadth',
                data: rows.map((d) => -d.downCount), itemStyle: { color: `${DOWN}cc` },
            },
            {
                name: '成交额', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false,
                data: rows.map((d) => d.totalAmount),
                lineStyle: { width: 1.5, color: '#2f6fed' }, itemStyle: { color: '#2f6fed' },
            },
        ],
    };
}

/** 模型 RankIC 走势：单日 RankIC 柱状 + 20 批滚动均值折线 */
export function rankIcOption(list) {
    const rows = [...(list ?? [])].reverse(); // 接口倒序返回，图表按时间正序
    const rankIcs = rows.map((r) => r.rankIc);
    const rollMean = rankIcs.map((_, i) => {
        const win = rankIcs.slice(Math.max(0, i - 19), i + 1).filter((v) => v != null);
        return win.length ? win.reduce((a, b) => a + b, 0) / win.length : null;
    });
    return {
        grid: { left: 46, right: 14, top: 26, bottom: 30 },
        tooltip: { trigger: 'axis' },
        legend: { ...LEGEND_STYLE, left: 'center' },
        // 默认聚焦最近一半批次，滚轮缩放可回看全部 120 批
        dataZoom: [{ type: 'inside', xAxisIndex: 0, start: 50, end: 100 }],
        xAxis: {
            type: 'category', data: rows.map((r) => r.asofDate),
            axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE,
        },
        yAxis: {
            type: 'value', name: 'RankIC', nameTextStyle: { color: MUTED, fontSize: 11 },
            axisLabel: { color: MUTED }, splitLine: SPLIT_LINE,
        },
        series: [
            {
                name: '单日 RankIC', type: 'bar', barMaxWidth: 10,
                data: rankIcs.map((v) => ({
                    value: v,
                    itemStyle: { color: v >= 0 ? `${UP}99` : `${DOWN}99` },
                })),
            },
            {
                name: '20 批滚动均值', type: 'line', smooth: true, showSymbol: false,
                data: rollMean, lineStyle: { width: 1.6, color: '#2f6fed' },
                itemStyle: { color: '#2f6fed' },
                markLine: {
                    silent: true, symbol: 'none',
                    lineStyle: { color: MUTED, type: 'dashed', width: 1 },
                    data: [{ yAxis: 0 }],
                },
            },
        ],
    };
}

/** 融合权重横向条形图：只画有效权重，长模型名缩写，避免窄图里标签糊成一团 */
export function weightOption(list) {
    const all = list ?? [];
    const active = all.filter((w) => Number(w.weight) > 0);
    // 全为 0 时仍展示全部，避免出现误导性的空图
    const rows = [...(active.length ? active : all)].reverse();
    const shortId = (id) => String(id ?? '')
        .replace(/^factor_score/, 'factor')
        .replace(/_h(\d+)_/, '·$1·')
        .replace(/^ensemble_h(\d+)$/, 'ensemble·$1');
    return {
        grid: { left: 104, right: 44, top: 8, bottom: 16 },
        tooltip: {
            trigger: 'axis', axisPointer: { type: 'shadow' },
            formatter: (params) => {
                const item = rows[params[0].dataIndex];
                return `<b>${item.modelId}</b><br/>权重：${(Number(item.weight) * 100).toFixed(1)}%<br/>ICIR(60批)：${item.icir60 ?? '-'}`;
            },
        },
        xAxis: {
            type: 'value', axisLabel: { color: MUTED, fontSize: 10, formatter: (v) => `${(v * 100).toFixed(0)}%` },
            splitLine: SPLIT_LINE,
        },
        yAxis: {
            type: 'category', data: rows.map((w) => shortId(w.modelId)),
            axisLabel: { color: MUTED, fontSize: 10, width: 96, overflow: 'truncate' },
            axisLine: AXIS_LINE, axisTick: { show: false },
        },
        series: [{
            type: 'bar', barMaxWidth: 12,
            data: rows.map((w) => ({
                value: w.weight,
                itemStyle: { color: '#2f6fed', borderRadius: 3 },
            })),
            label: {
                show: true, position: 'right', color: MUTED, fontSize: 9,
                formatter: (p) => (Number(p.value) > 0 ? `${(Number(p.value) * 100).toFixed(1)}%` : ''),
            },
        }],
    };
}

/** 日线区间收盘价走势（详情页小图，可选） */
export function closeLineOption(bars) {
    const rows = bars ?? [];
    return {
        grid: { left: 50, right: 16, top: 16, bottom: 30 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: rows.map((b) => b.tradeDate), axisLabel: { color: MUTED, fontSize: 10 }, axisLine: AXIS_LINE },
        yAxis: { scale: true, axisLabel: { color: MUTED }, splitLine: SPLIT_LINE },
        series: [{
            type: 'line', data: rows.map((b) => b.close), smooth: true, showSymbol: false,
            lineStyle: { width: 1.6, color: '#2f6fed' }, itemStyle: { color: '#2f6fed' },
            areaStyle: { color: 'rgba(47,111,237,0.08)' },
        }],
    };
}
