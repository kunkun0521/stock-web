/**
 * 遗传算法模块接口集中封装。
 *
 * 约定：
 *  - 所有查询走 client.js 的 apiGet / apiPost，外壳 {code,message,data} 由它统一剥掉。
 *  - client.js 的接口基址自带 /api（同源 /api 或 http://host/api），因此这里的路径
 *    统一用 '/ga/...' 前缀，拼出来正好是契约里的 '/api/ga/...'。
 *  - 函数参数一律用对象，便于调用方按需传字段、缺省字段不进 query。
 *  - PUT / CSV 导出 client.js 没有对应能力，见文件底部的原生 fetch / 直链实现。
 */
import { apiGet, apiPost, apiBaseCandidates } from '../api/client.js';

const P = '/ga';

/** 把参数对象拼成 query 串，跳过空值；用于 POST 带 query 的接口与 CSV 直链。 */
function withQuery(path, params = {}) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') usp.set(key, String(value));
    });
    const qs = usp.toString();
    return qs ? `${path}?${qs}` : path;
}

/** 当前实际可用的接口基址（与 client.js 的候选顺序一致），用于原生请求与 CSV 直链。 */
function resolveBase() {
    try {
        const list = apiBaseCandidates();
        if (list.length) return list[0].replace(/\/+$/, '');
    } catch {
        // apiBaseCandidates 不可用时回退到显式配置或同源 /api
    }
    return String(import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');
}

/** 安全路径片段编码。 */
const seg = (v) => encodeURIComponent(String(v ?? ''));

// ---------------------------------------------------------------- 总览
export const getOverview = (params = {}) => apiGet(`${P}/overview`, params);
export const getOverviewTrend = (params = {}) => apiGet(`${P}/overview/trend`, params);
export const getOverviewCalendar = (params = {}) => apiGet(`${P}/overview/calendar`, params);

// ---------------------------------------------------------------- 预测复盘
export const getPredictions = (params = {}) => apiGet(`${P}/predictions`, params);

/**
 * CSV 导出：client.js 会按 JSON 解析响应，而导出接口返回文件流，
 * 因此这里不走 client.js，直接给浏览器一个带参数的绝对链接（window.open / <a> 打开）。
 */
export function exportPredictionsUrl(params = {}) {
    return `${resolveBase()}${withQuery(`${P}/predictions/export`, params)}`;
}

// ---------------------------------------------------------------- 个股详情
export function getStock({ market, code, ...rest } = {}) {
    return apiGet(`${P}/stock/${seg(market)}/${seg(code)}`, rest);
}

// ---------------------------------------------------------------- 错误分析
export const getAnalysisBuckets = (params = {}) => apiGet(`${P}/analysis/buckets`, params);
export const getAnalysisReliability = (params = {}) => apiGet(`${P}/analysis/reliability`, params);
export const getAnalysisConfusion = (params = {}) => apiGet(`${P}/analysis/confusion`, params);
export const getAnalysisTopErrors = (params = {}) => apiGet(`${P}/analysis/top-errors`, params);
export const getAnalysisQuantile = (params = {}) => apiGet(`${P}/analysis/quantile`, params);

// ---------------------------------------------------------------- 淘汰管理
export const getPool = (params = {}) => apiGet(`${P}/pool`, params);
export const getPoolLog = (params = {}) => apiGet(`${P}/pool/log`, params);
export const postPoolOverride = ({ code, market, action, remark } = {}) =>
    apiPost(`${P}/pool/override`, { code, market, action, remark });

// ---------------------------------------------------------------- 进化监控
export const getEvolutionRuns = (params = {}) => apiGet(`${P}/evolution/runs`, params);
export const getEvolutionGenerations = ({ runId } = {}) =>
    apiGet(`${P}/evolution/runs/${seg(runId)}/generations`);
export const getIndividuals = (params = {}) => apiGet(`${P}/individuals`, params);
export const getChampions = (params = {}) => apiGet(`${P}/champions`, params);
export const postEvolutionRun = ({ horizon } = {}) =>
    apiPost(withQuery(`${P}/evolution/run`, { horizon }), {});
export const postEvolutionReplay = ({ from, to, step, horizons } = {}) =>
    apiPost(`${P}/evolution/replay`, { from, to, step, horizons });
export const postChampionPromote = ({ runId, horizon } = {}) =>
    apiPost(withQuery(`${P}/champions/promote`, { runId, horizon }), {});
export const postChampionRollback = ({ horizon, versionTag } = {}) =>
    apiPost(`${P}/champions/rollback`, { horizon, versionTag });

// ---------------------------------------------------------------- 因子体检
export const getFactorsIc = (params = {}) => apiGet(`${P}/factors/ic`, params);

// ---------------------------------------------------------------- 每日选股
export const getPicks = (params = {}) => apiGet(`${P}/picks`, params);

// ---------------------------------------------------------------- 参数配置 / 后台任务
export const getConfig = (params = {}) => apiGet(`${P}/config`, params);
export const getJobsStatus = () => apiGet(`${P}/jobs/status`);
export const postJobRun = ({ job } = {}) => apiPost(`${P}/jobs/run`, { job });

/**
 * PUT /api/ga/config：client.js 只导出 apiGet / apiPost，没有 PUT。
 * 这里用原生 fetch 自行发 PUT，并手动剥掉 {code,message,data} 外壳，
 * 返回 data（兼容后端直接返回 {ok:true} 的情况）。
 */
export async function putConfig({ scope, paramKey, paramValue } = {}) {
    const url = `${resolveBase()}${P}/config`;
    let resp;
    try {
        resp = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ scope, paramKey, paramValue }),
        });
    } catch {
        throw new Error(`无法连接接口 ${url}，请确认后端已启动`);
    }
    const text = await resp.text().catch(() => '');
    let payload = {};
    try {
        payload = text ? JSON.parse(text) : {};
    } catch {
        payload = {};
    }
    if (!resp.ok || (payload.code !== undefined && payload.code !== 0)) {
        throw new Error(payload.message || `配置保存失败（HTTP ${resp.status}）`);
    }
    return payload.data ?? payload;
}
