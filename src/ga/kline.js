/**
 * GA 个股页 K 线：指标计算 + ECharts option 构造。
 * 后端 /api/ga/stock/{market}/{code} 只返回 open/close/high/low/volume，
 * 均线与 MACD 全部在前端按收盘价推导，不依赖后端增加字段。
 */
import {
    UP, DOWN, MUTED, ACCENT,
    asArray, asObject, num, fmtNum, fmtRate, fmtSignedRate, fmtText, dirLabel, isUpDir,
} from './gaUtils.js';

// 中性色：浅色/深色主题下都可读，不写死纯白或纯黑
const GRID_LINE = 'rgba(128,136,150,0.16)';
const AXIS_LINE = 'rgba(128,136,150,0.32)';
const HIT = '#17924e';
const MISS = '#d8392b';

export const MA_DEFS = [
    { name: 'MA5', days: 5, color: '#e8a33d' },
    { name: 'MA10', days: 10, color: '#3f8cff' },
    { name: 'MA20', days: 20, color: '#9b59b6' },
    { name: 'MA60', days: 60, color: '#4b5563' },
];

const round = (v, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/** 简单移动平均，前 days-1 根为 null。 */
function movingAvg(values, days) {
    let sum = 0, count = 0;
    const out = [];
    for (let i = 0; i < values.length; i += 1) {
        const v = values[i];
        if (v === null) {
            out.push(null);
            continue;
        }
        sum += v;
        count += 1;
        if (count > days) {
            const old = values[i - days];
            if (old !== null) { sum -= old; count -= 1; }
        }
        out.push(count === days ? round(sum / days) : null);
    }
    return out;
}

/** 指数移动平均；null 断点会重新起算。 */
function ema(values, period) {
    const k = 2 / (period + 1);
    let prev = null;
    return values.map((v) => {
        if (v === null) { prev = null; return null; }
        prev = prev === null ? v : v * k + prev * (1 - k);
        return round(prev, 6);
    });
}

/**
 * 由 bars 推导 MA5/10/20/60、量能 MA5、MACD(12,26,9)。
 * 所有序列长度与 bars 对齐，缺失值用 null（ECharts 会断开而不是连到 0）。
 */
export function computeIndicators(bars) {
    const rows = asArray(bars);
    const closes = rows.map((b) => num(asObject(b).close));
    const volumes = rows.map((b) => num(asObject(b).volume));
    const ma = {};
    MA_DEFS.forEach(({ name, days }) => { ma[name] = movingAvg(closes, days); });
    const e12 = ema(closes, 12), e26 = ema(closes, 26);
    const dif = closes.map((_, i) => (e12[i] === null || e26[i] === null ? null : round(e12[i] - e26[i], 6)));
    const dea = ema(dif, 9);
    const macd = dif.map((v, i) => (v === null || dea[i] === null ? null : round((v - dea[i]) * 2, 6)));
    return { ma, dif, dea, macd, volMa5: movingAvg(volumes, 5) };
}

const fmtVol = (v) => {
    const n = num(v);
    if (n === null) return '-';
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
    return String(Math.round(n));
};

/**
 * is_correct 来自 MySQL tinyint，JDBC 返回的是 1/0（不是 JSON 布尔），
 * 也可能被序列化成 '1'/'0' 字符串。这里统一兼容，否则所有标记都会被误判成「待验证」。
 */
export function isVerified(m) {
    const v = asObject(m).isCorrect;
    return v === true || v === false || v === 1 || v === 0
        || v === '1' || v === '0' || v === 'true' || v === 'false';
}
export function isCorrect(m) {
    const v = asObject(m).isCorrect;
    return v === true || v === 1 || v === '1' || v === 'true';
}

/** 预测结果文字：已命中 / 未命中 / 待验证 / 失效。 */
export function verdictOf(m) {
    const o = asObject(m);
    if (isVerified(o)) return { text: isCorrect(o) ? '✓ 命中' : '✗ 未命中', color: isCorrect(o) ? HIT : MISS };
    if (o.status === 'VOID') return { text: '已失效', color: MUTED };
    return { text: '待验证', color: MUTED };
}

/** 按天把多周期预测压成一个「共识」标记，避免 5 个三角叠在同一根 K 线上。 */
function consensusOf(list) {
    let up = 0, down = 0, sumProb = 0, sumConf = 0, n = 0;
    list.forEach((m) => {
        const o = asObject(m);
        if (isUpDir(o.predDirection)) up += 1;
        else if (o.predDirection === -1 || o.predDirection === '-1' || o.predDirection === 'DOWN' || o.predDirection === 'down') down += 1;
        const p = num(o.probUp), c = num(o.confidence);
        if (p !== null) { sumProb += p; n += 1; }
        if (c !== null) sumConf += c;
    });
    const checked = list.filter(isVerified);
    const correct = checked.filter(isCorrect).length;
    return {
        tradeDate: asObject(list[0]).tradeDate,
        horizon: checked.length ? `${list.length}周期(已验证${checked.length})` : `${list.length}周期`,
        predDirection: up > down ? 1 : (down > up ? -1 : 0),
        probUp: n ? sumProb / n : null,
        confidence: n ? sumConf / n : null,
        isCorrect: checked.length === 0 ? undefined : (correct * 2 >= checked.length),
        status: checked.length ? 'VERIFIED' : asObject(list[0]).status,
        actualReturn: null,
        _consensus: { up, down, total: list.length, verified: checked.length, correct },
    };
}

/** 汇总某日各周期预测，供 tooltip 与「点击标记」详情共用。 */
function groupMarks(marks, horizon) {
    const byDate = new Map();
    asArray(marks).forEach((m) => {
        const o = asObject(m);
        // 影子榜与 CHAMPION 共用日期，画在一起会重叠且口径混淆，只展示主榜
        if (o.modelRole && o.modelRole !== 'CHAMPION') return;
        if (horizon && String(o.horizon) !== String(horizon)) return;
        const key = String(o.tradeDate ?? '');
        if (!key) return;
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key).push(o);
    });
    byDate.forEach((list) => list.sort((a, b) => (num(a.horizon) ?? 0) - (num(b.horizon) ?? 0)));
    return byDate;
}

function tooltipHtml(params, ctx) {
    const { rows, dateIndex, indicators, byDate } = ctx;
    const list = asArray(params);
    if (!list.length) return '';
    const date = String(list[0]?.axisValue ?? list[0]?.name ?? '');
    const i = dateIndex.get(date);
    if (i === undefined) return '';
    const b = asObject(rows[i]);
    const close = num(b.close), open = num(b.open), high = num(b.high), low = num(b.low);
    const prev = i > 0 ? num(asObject(rows[i - 1]).close) : null;
    const chg = close !== null && prev ? (close - prev) / prev : null;
    const amp = high !== null && low !== null && prev ? (high - low) / prev : null;
    const color = chg === null ? MUTED : (chg >= 0 ? UP : DOWN);
    const cell = (label, value, c) => `<span style="color:#9aa3af">${label}</span> `
        + `<span style="color:${c || '#e6e9ef'};font-weight:600">${value}</span>`;
    const line1 = `<div style="font-weight:700;color:#fff;margin-bottom:6px">${fmtText(date)}</div>`;
    const line2 = `<div style="line-height:1.9">${cell('开', fmtNum(open))}　${cell('高', fmtNum(high, 2), UP)}　`
        + `${cell('低', fmtNum(low), DOWN)}　${cell('收', fmtNum(close), color)}</div>`;
    const line3 = `<div style="line-height:1.9">${cell('涨跌', chg === null ? '-' : fmtSignedRate(chg, 2), color)}　`
        + `${cell('振幅', amp === null ? '-' : fmtRate(amp, 2))}　${cell('量', fmtVol(b.volume))}</div>`;
    const maParts = MA_DEFS.map(({ name }) => {
        const v = indicators.ma[name]?.[i];
        return v === null || v === undefined ? '' : `${cell(name, fmtNum(v))}`;
    }).filter(Boolean).join('　');
    const line4 = maParts ? `<div style="line-height:1.9;margin-top:2px">${maParts}</div>` : '';
    const macdParts = [
        cell('DIF', fmtNum(indicators.dif[i], 3), '#e8a33d'),
        cell('DEA', fmtNum(indicators.dea[i], 3), '#3f8cff'),
        cell('MACD', fmtNum(indicators.macd[i], 3), indicators.macd[i] >= 0 ? UP : DOWN),
    ].join('　');
    const line5 = `<div style="line-height:1.9">${macdParts}</div>`;
    const dayMarks = byDate.get(date) || [];
    let line6 = '';
    if (dayMarks.length) {
        const items = dayMarks.map((m) => {
            const up = isUpDir(m.predDirection);
            const c = up ? UP : DOWN;
            const v = verdictOf(m);
            return `<div style="line-height:1.85">`
                + `<span style="color:#9aa3af">H${fmtText(m.horizon)}</span> `
                + `<span style="color:${c};font-weight:600">${dirLabel(m.predDirection)}</span> `
                + `<span style="color:#c9d0da">P↑ ${fmtRate(m.probUp)}</span> `
                + `<span style="color:#9aa3af">置信 ${fmtRate(m.confidence)}</span> `
                + `<span style="color:${v.color};font-weight:600">${v.text}</span>`
                + (num(m.actualReturn) !== null ? ` <span style="color:#9aa3af">实际 ${fmtSignedRate(m.actualReturn, 2)}</span>` : '')
                + `</div>`;
        }).join('');
        line6 = `<div style="border-top:1px solid rgba(255,255,255,.14);margin-top:6px;padding-top:5px">${items}</div>`;
    }
    return `<div style="min-width:270px;max-width:380px;font-size:12px">${line1}${line2}${line3}${line4}${line5}${line6}</div>`;
}

/**
 * 构造三宫格 K 线（主图 + 成交量 [+ MACD]）。
 * @param {object} o
 * @param {Array}  o.bars      后端日线
 * @param {Array}  o.marks     预测记录
 * @param {string} o.horizon   '' = 全部周期
 * @param {number} o.height    容器像素高
 * @param {boolean} o.showMa / o.showMacd / o.showMarks
 * @param {number} o.visibleBars 默认展示最近多少根（0 = 全部）
 * @param {'day'|'each'} o.markMode 每天聚合成一个共识标记 / 逐周期全部画出
 */
export function buildKlineOption({ bars, marks, horizon, height = 500,
                                     showMa = true, showMacd = true, showMarks = true,
                                     visibleBars = 80, markMode = 'day' }) {
    const rows = asArray(bars);
    const dates = rows.map((b) => String(asObject(b).tradeDate ?? ''));
    const dateIndex = new Map(dates.map((d, i) => [d, i]));
    const byDate = groupMarks(marks, horizon);
    const indicators = computeIndicators(rows);

    const candle = rows.map((b) => {
        const o = asObject(b);
        return [num(o.open), num(o.close), num(o.low), num(o.high)];
    });
    const volumes = rows.map((b) => {
        const o = asObject(b);
        const up = (num(o.close) ?? 0) >= (num(o.open) ?? 0);
        return { value: num(o.volume), itemStyle: { color: up ? `${UP}b0` : `${DOWN}b0` } };
    });

    // 同一交易日多个周期：按周期做水平错位，避免三角叠成一坨
    const horizonList = horizon ? [String(horizon)] : ['1', '3', '5', '10', '15'];
    const offsetOf = (h) => {
        const idx = horizonList.indexOf(String(h));
        if (idx < 0 || horizonList.length === 1) return 0;
        return (idx - (horizonList.length - 1) / 2) * 9;
    };
    const points = [];
    if (showMarks) {
        byDate.forEach((list, date) => {
            const idx = dateIndex.get(date);
            if (idx === undefined) return;
            const bar = asObject(rows[idx]);
            const low = num(bar.low), high = num(bar.high);
            if (low === null || high === null) return;
            // 默认每天只画一个共识三角，逐周期模式才把全部预测摊开并水平错位
            const drawn = markMode === 'each' ? list : [consensusOf(list)];
            drawn.forEach((m) => {
                const up = isUpDir(m.predDirection);
                const neutral = m.predDirection === 0;
                const dirColor = up ? UP : (neutral ? MUTED : DOWN);
                const v = verdictOf(m);
                const verified = isVerified(m);
                points.push({
                    value: [idx, up ? low * 0.978 : high * 1.022],
                    symbol: 'triangle',
                    symbolSize: markMode === 'each' ? 9 : 11,
                    symbolRotate: up ? 0 : 180,
                    symbolOffset: [markMode === 'each' ? offsetOf(m.horizon) : 0, 0],
                    // 三角颜色只表示方向（红涨绿跌）；实心=已验证、空心=待验证，避免与对错色混淆
                    itemStyle: { color: verified ? dirColor : 'transparent', borderColor: dirColor, borderWidth: 1.5 },
                    // ✓/✗ 标签在密集视图里会糊成一片，仅在单周期筛选时显示
                    label: verified && horizon
                        ? { show: true, formatter: isCorrect(m) ? '✓' : '✗', position: 'top', color: v.color, fontSize: 10, fontWeight: 'bold' }
                        : { show: false },
                    mark: m,
                });
            });
        });
    }

    const h = Math.max(360, Number(height) || 500);
    const top = 32, bottom = 54, gap = 8;
    const usable = h - top - bottom;
    const sub = Math.max(52, Math.round(usable * (showMacd ? 0.15 : 0.2)));
    const main = usable - sub * (showMacd ? 2 : 1) - gap * (showMacd ? 2 : 1);
    const g2 = top + main + gap;
    const g3 = g2 + sub + gap;
    const grids = [
        { left: 62, right: 20, top, height: Math.max(120, main) },
        { left: 62, right: 20, top: g2, height: sub },
    ];
    if (showMacd) grids.push({ left: 62, right: 20, top: g3, height: sub });
    const gridCount = grids.length;
    const allIdx = Array.from({ length: gridCount }, (_, i) => i);
    const xAxis = allIdx.map((i) => ({
        type: 'category', gridIndex: i, data: dates, boundaryGap: true,
        axisLine: { lineStyle: { color: AXIS_LINE } },
        axisTick: { show: false },
        axisLabel: i === gridCount - 1
            ? { color: MUTED, fontSize: 10, rotate: 30, hideOverlap: true }
            : { show: false },
    }));
    const yAxis = [
        { scale: true, gridIndex: 0, axisLabel: { color: MUTED, fontSize: 10 }, splitLine: { lineStyle: { color: GRID_LINE } } },
        { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
    ];
    if (showMacd) yAxis.push({ gridIndex: 2, scale: true, axisLabel: { color: MUTED, fontSize: 10 }, splitLine: { lineStyle: { color: GRID_LINE } } });

    const maSeries = showMa ? MA_DEFS.map(({ name, color }) => ({
        name, type: 'line', data: indicators.ma[name], smooth: true, showSymbol: false,
        connectNulls: false, lineStyle: { width: 1.2, color }, itemStyle: { color },
        xAxisIndex: 0, yAxisIndex: 0,
    })) : [];
    const macdSeries = showMacd ? [
        {
            name: 'MACD', type: 'bar', xAxisIndex: 2, yAxisIndex: 2,
            data: indicators.macd.map((v) => ({
                value: v,
                itemStyle: { color: (v ?? 0) >= 0 ? `${UP}cc` : `${DOWN}cc` },
            })),
        },
        { name: 'DIF', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: indicators.dif, showSymbol: false, lineStyle: { width: 1, color: '#e8a33d' } },
        { name: 'DEA', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: indicators.dea, showSymbol: false, lineStyle: { width: 1, color: '#3f8cff' } },
    ] : [];

    const legendData = ['K线', ...(showMa ? MA_DEFS.map((d) => d.name) : []), '成交量',
        ...(showMacd ? ['MACD', 'DIF', 'DEA'] : []), ...(showMarks ? ['预测标记'] : [])];

    // 默认只展示最近 visibleBars 根，避免 180 根蜡烛挤成一条线
    const start = visibleBars > 0 && rows.length > visibleBars
        ? Math.round((1 - visibleBars / rows.length) * 100)
        : 0;
    const ctx = { rows, dateIndex, indicators, byDate };

    return {
        animation: false,
        backgroundColor: 'transparent',
        legend: {
            top: 0, left: 4, type: 'scroll', width: '88%',
            itemWidth: 12, itemHeight: 8, textStyle: { color: MUTED, fontSize: 11 },
            data: legendData,
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross', crossStyle: { color: MUTED }, label: { backgroundColor: ACCENT } },
            confine: true, enterable: false,
            backgroundColor: 'rgba(30,34,42,0.94)', borderColor: 'rgba(128,136,150,0.35)', borderWidth: 1,
            padding: [8, 10], textStyle: { color: '#e6e9ef', fontSize: 12 },
            extraCssText: 'box-shadow:0 6px 20px rgba(0,0,0,.22);border-radius:8px;',
            formatter: (p) => tooltipHtml(p, ctx),
        },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: grids,
        xAxis,
        yAxis,
        dataZoom: [
            { type: 'inside', xAxisIndex: allIdx, start, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
            {
                type: 'slider', xAxisIndex: allIdx, start, end: 100, bottom: 6, height: 16,
                borderColor: AXIS_LINE, fillerColor: 'rgba(47,111,237,0.14)',
                handleStyle: { color: ACCENT }, dataBackground: { lineStyle: { color: AXIS_LINE }, areaStyle: { color: GRID_LINE } },
                textStyle: { color: MUTED, fontSize: 10 },
            },
        ],
        series: [
            {
                name: 'K线', type: 'candlestick', data: candle, xAxisIndex: 0, yAxisIndex: 0,
                itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
            },
            ...maSeries,
            { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes, barWidth: '60%' },
            {
                name: '量能MA5', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: indicators.volMa5,
                showSymbol: false, lineStyle: { width: 1, color: '#e8a33d', opacity: 0.85 }, legendHoverLink: false,
            },
            ...macdSeries,
            ...(showMarks ? [{ name: '预测标记', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, data: points, z: 10 }] : []),
        ],
    };
}

/** 点击预测标记时展示的详情字段（与 tooltip 口径一致）。 */
export function markSummary(m) {
    const o = asObject(m);
    const v = verdictOf(o);
    const c = asObject(o._consensus);
    return {
        horizon: c.total ? `${c.total} 周期共识` : fmtText(o.horizon),
        direction: dirLabel(o.predDirection),
        probUp: fmtRate(o.probUp),
        confidence: fmtRate(o.confidence),
        verdict: v.text,
        verdictColor: v.color,
        actualReturn: num(o.actualReturn) === null ? '-' : fmtSignedRate(o.actualReturn, 2),
        date: fmtText(o.tradeDate),
        consensus: c.total
            ? `${c.up} 看涨 / ${c.down} 看跌 · 已验证 ${c.verified} 个、命中 ${c.correct} 个（悬停图表看逐周期明细）`
            : null,
    };
}
