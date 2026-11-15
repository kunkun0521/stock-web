/** 概率引擎接口封装（/api/prob）。统一响应 {code,message,data,disclaimer}，外壳由 client.js 剥离。 */
import { apiGet, apiPost } from '../api/client.js';

const P = '/prob';

export const getOverview = () => apiGet(`${P}/overview`);
export const getPredictions = (params = {}) => apiGet(`${P}/predictions`, params);
export const getStock = (market, code) => apiGet(`${P}/stocks/${market}/${code}`);
export const getStockHistory = (market, code, params = {}) =>
    apiGet(`${P}/stocks/${market}/${code}/history`, params);
export const getStockSignals = (market, code, params = {}) =>
    apiGet(`${P}/stocks/${market}/${code}/signals`, params);

export const getMetrics = (params = {}) => apiGet(`${P}/eval/metrics`, params);
export const getMetricSeries = (params = {}) => apiGet(`${P}/eval/series`, params);
export const getCalibration = (params = {}) => apiGet(`${P}/eval/calibration`, params);
export const getMethods = (params = {}) => apiGet(`${P}/eval/methods`, params);

export const getBacktests = (params = {}) => apiGet(`${P}/backtests`, params);
export const getBacktest = (id) => apiGet(`${P}/backtests/${id}`);

export const getRuns = (params = {}) => apiGet(`${P}/runs`, params);
export const getRun = (id) => apiGet(`${P}/runs/${id}`);
export const launchRun = (body = {}) => apiPost(`${P}/runs`, body);

export const getConfig = () => apiGet(`${P}/config`);
export const getFeatures = () => apiGet(`${P}/features`);
export const getModels = () => apiGet(`${P}/models`);
