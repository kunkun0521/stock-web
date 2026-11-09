import { marketApi } from './market.js';

/**
 * 涨停池数据层：完全复用现有 /api/market 接口，后端零改动。
 *
 * 口径说明：
 *  1. 涨停档位取 A 股常见的 5% / 10% / 20% / 30%，不依赖 ST 标记或代码前缀去猜限价，
 *     而是用「收盘价 ≈ round(前收 × (1 + 档位), 2)」逐档匹配，能兼容低价股四舍五入
 *     带来的 10.21% 这类实际涨幅，也能识别数据库中 is_st 标记滞后的 ST 股。
 *  2. 「封板」= 收盘价落在涨停价上；「炸板」= 最高价触及涨停价但收盘未封住。
 *  3. 连板数按最近 N 个交易日的涨幅榜回溯，同日涨停代码集合按交易日缓存，
 *     避免每次刷新都重复请求历史数据。历史榜单最多返回 200 条，极端的普涨日
 *     可能截断低位涨停股，因此连板数为近似值，界面会明确标注。
 */

/** 涨幅榜单次上限（后端 QuerySupport 上限 200）。 */
const RANK_LIMIT = 200;
/** 连板回溯的交易日数量。 */
const BACKTRACK_DAYS = 5;
/** 涨停档位，从小到大匹配，先命中者为准。 */
const LIMIT_RATIOS = [0.05, 0.1, 0.2, 0.3];
/** 每个交易日涨停代码集合的缓存前缀。 */
const DAY_CACHE_PREFIX = 'stock-web:limit-up:day:';

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const round2 = (v) => Math.round(v * 100) / 100;

/** 价格容差：绝对 1 分钱 或 前收的 0.15%，兼顾复权后的价格量级。 */
function tolerance(preclose) {
    return Math.max(0.011, preclose * 0.0015);
}

/** 收盘价命中的涨停档位，未封板返回 null。 */
export function matchCloseLimit(row) {
    const pre = num(row.preclose);
    const close = num(row.close);
    if (!(pre > 0) || !(close > 0)) return null;
    const tol = tolerance(pre);
    for (const ratio of LIMIT_RATIOS) {
        const price = round2(pre * (1 + ratio));
        if (Math.abs(close - price) <= tol) return { ratio, price, tol };
    }
    return null;
}

/** 最高价命中的涨停档位，用于识别「触板未封」。 */
export function matchTouchLimit(row) {
    const pre = num(row.preclose);
    const high = num(row.high);
    if (!(pre > 0) || !(high > 0)) return null;
    const tol = tolerance(pre);
    for (const ratio of LIMIT_RATIOS) {
        const price = round2(pre * (1 + ratio));
        if (Math.abs(high - price) <= tol) return { ratio, price, tol };
    }
    return null;
}

export function boardOf(row) {
    if (row.board) return row.board;
    const code = String(row.code || '');
    if (code.startsWith('688')) return '科创板';
    if (code.startsWith('30')) return '创业板';
    if (code.startsWith('8') || code.startsWith('4')) return '北交所';
    return '主板';
}

/** 是否为 ST（is_st 标记或名称兜底）。 */
export function isStOf(row) {
    return row.isSt === 1 || /ST/i.test(String(row.name || ''));
}

/** 一字板：开、低、收都在涨停价上。 */
function isOneWord(row, hit) {
    const open = num(row.open);
    const low = num(row.low);
    const close = num(row.close);
    return open >= hit.price - hit.tol && low >= hit.price - hit.tol && close >= hit.price - hit.tol;
}

function readDayCache(date) {
    try {
        const raw = window.sessionStorage.getItem(DAY_CACHE_PREFIX + date);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) ? new Set(parsed) : null;
    } catch {
        return null;
    }
}

function writeDayCache(date, codes) {
    try {
        window.sessionStorage.setItem(DAY_CACHE_PREFIX + date, JSON.stringify([...codes]));
    } catch {
        /* 隐私模式或容量不足时忽略，仅影响下次请求量 */
    }
}

/** 拉取某个交易日的涨停代码集合，历史日期结果按日缓存。 */
async function limitUpCodesOn(date, force) {
    if (!force) {
        const cached = readDayCache(date);
        if (cached) return cached;
    }
    const rows = await marketApi.ranking({
        type: 'gainers', date, limit: RANK_LIMIT, includeSt: true,
    });
    const codes = new Set(
        (rows || [])
            .filter((r) => r && r.code && num(r.pctChg) > 0 && matchCloseLimit(r))
            .map((r) => String(r.code)),
    );
    writeDayCache(date, codes);
    return codes;
}

/** 把榜单原始行转成展示用的涨停条目。 */
function toLimitUpItem(row, hit, streak) {
    return {
        code: String(row.code),
        name: row.name || row.code,
        board: boardOf(row),
        industry: row.industry || '',
        tradeDate: row.tradeDate,
        close: num(row.close),
        preclose: num(row.preclose),
        high: num(row.high),
        open: num(row.open),
        pctChg: num(row.pctChg),
        amount: num(row.amount) || 0,
        turnover: num(row.turnover) || 0,
        limitRatio: hit.ratio,
        limitPrice: hit.price,
        streak,
        oneWord: isOneWord(row, hit),
        st: isStOf(row),
    };
}

/** 按名称分组计数。 */
function countBy(list, keyOf) {
    const out = {};
    for (const item of list) {
        const key = keyOf(item) || '其他';
        out[key] = (out[key] || 0) + 1;
    }
    return out;
}

/**
 * 加载涨停池。
 *
 * @param {{ force?: boolean }} options force=true 时跳过当日缓存、强制回源
 * @returns {Promise<{tradeDate, updatedAt, list, broken, stats}>}
 */
export async function fetchLimitUpPool({ force = false } = {}) {
    const calendar = await marketApi.calendar(BACKTRACK_DAYS + 1);
    if (!calendar?.length) throw new Error('暂无交易日历数据');
    const tradeDate = calendar[0];
    const history = calendar.slice(1, BACKTRACK_DAYS + 1);

    const todayRows = await marketApi.ranking({
        type: 'gainers', date: tradeDate, limit: RANK_LIMIT, includeSt: true,
    });
    if (!todayRows?.length) throw new Error('暂无行情数据');

    // 历史失败不影响主流程，只让连板数退化为首板。
    const daySets = await Promise.all(
        history.map((d) => limitUpCodesOn(d, force).catch(() => new Set())),
    );

    const streakOf = (code) => {
        let n = 1;
        for (const set of daySets) {
            if (!set.has(code)) break;
            n += 1;
        }
        return n;
    };

    const list = [];
    const broken = [];
    for (const row of todayRows) {
        if (!row?.code || !(num(row.pctChg) > 0)) continue;
        const closeHit = matchCloseLimit(row);
        if (closeHit) {
            list.push(toLimitUpItem(row, closeHit, streakOf(String(row.code))));
            continue;
        }
        const touchHit = matchTouchLimit(row);
        if (touchHit) {
            broken.push({
                code: String(row.code),
                name: row.name || row.code,
                board: boardOf(row),
                close: num(row.close),
                high: num(row.high),
                pctChg: num(row.pctChg),
                limitPrice: touchHit.price,
                amount: num(row.amount) || 0,
                turnover: num(row.turnover) || 0,
                st: isStOf(row),
                oneWord: false,
                streak: 0,
            });
        }
    }

    list.sort((a, b) => b.streak - a.streak || b.pctChg - a.pctChg || b.amount - a.amount);
    broken.sort((a, b) => b.pctChg - a.pctChg);

    const totalAmount = list.reduce((sum, x) => sum + x.amount, 0);
    const stats = {
        total: list.length,
        firstBoard: list.filter((x) => x.streak === 1).length,
        multiBoard: list.filter((x) => x.streak >= 2).length,
        oneWord: list.filter((x) => x.oneWord).length,
        stCount: list.filter((x) => x.st).length,
        maxStreak: list.reduce((max, x) => Math.max(max, x.streak), 0),
        brokenCount: broken.length,
        sealRate: list.length + broken.length > 0
            ? Math.round((list.length / (list.length + broken.length)) * 100)
            : 0,
        totalAmount,
        byBoard: countBy(list, (x) => x.board),
        byRatio: countBy(list, (x) => `${Math.round(x.limitRatio * 100)}cm`),
        byStreak: countBy(list, (x) => `${x.streak}板`),
    };

    return {
        tradeDate,
        updatedAt: new Date().toISOString(),
        historyDays: history.length,
        list,
        broken,
        stats,
    };
}

/** 金额简写：亿 / 万，用于滚动条与统计卡。 */
export function shortAmount(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
    return n.toFixed(0);
}

/** 价格固定两位，异常值兜底。 */
export function price(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : '--';
}

/** 涨跌幅固定两位并带正号。 */
export function pct(v) {
    const n = Number(v);
    return Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '--';
}
