/**
 * 遗传算法模块接口集中封装。
 *
 * 约定：
 *  - 所有查询走 client.js 的 apiGet / apiPost，外壳 {code,message,data} 由它统一剥掉。
 *  - client.js 的接口基址自带 /api（同源 /api 或 http://host/api），因此这里的路径
 *    统一用 '/ga/...' 前缀，拼出来正好是契约里的 '/api/ga/...'。
 *  - 函数参数一律用对象，便于调用方按需传字段、缺省字段不进 query。
 *  - PUT 走 client.js 的 apiPut（与其它方法共用基址探测/回退/错误解析）；
 *    CSV 导出是文件流，走 client.js 的 apiUrl 生成直链，不经过 JSON 解析。
 */
import { apiGet, apiPost, apiPut, apiUrl } from '../api/client.js';

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
    return apiUrl(`${P}/predictions/export`, params);
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
/** PUT /api/ga/config：与 GET/POST 共用 client.js 的基址探测与错误解析。 */
export const putConfig = ({ scope, paramKey, paramValue } = {}) =>
    apiPut(`${P}/config`, { scope, paramKey, paramValue });

export const getJobsStatus = () => apiGet(`${P}/jobs/status`);
export const postJobRun = ({ job } = {}) => apiPost(`${P}/jobs/run`, { job });

/** 后台任务页：运行历史 / 定时调度信息 / 定时开关 / 按定时规则立即执行一次。 */
export const getJobsLog = ({ limit = 30 } = {}) => apiGet(`${P}/jobs/log`, { limit });
export const getJobsSchedule = () => apiGet(`${P}/jobs/schedule`);
export const postScheduleToggle = ({ enabled } = {}) =>
    apiPost(`${P}/jobs/schedule/toggle`, { enabled });
export const postScheduleFire = ({ kind } = {}) =>
    apiPost(`${P}/jobs/schedule/fire`, { kind });
