/**
 * 量化策略平台接口封装（/api/quant）。
 *
 * 约定与 ga/api.js 一致：查询走 apiGet / apiPost，外壳 {code,message,data} 由 client.js 剥离。
 */
import { apiGet, apiPost } from '../api/client.js';

const P = '/quant';

export const getStrategies = () => apiGet(`${P}/strategies`);
export const getDataOverview = () => apiGet(`${P}/data/overview`);
export const reloadData = () => apiPost(`${P}/data/reload`, {});

export const submitBacktest = (body) => apiPost(`${P}/backtests`, body);
export const getBacktests = (params = {}) => apiGet(`${P}/backtests`, params);
export const getBacktest = (id) => apiGet(`${P}/backtests/${id}`);
export const cancelBacktest = (id) => apiPost(`${P}/backtests/${id}/cancel`, {});
export const getMetrics = (id, split = 'ALL') => apiGet(`${P}/backtests/${id}/metrics`, { split });
export const getEquity = (id) => apiGet(`${P}/backtests/${id}/equity`);
export const getTrades = (id, params = {}) => apiGet(`${P}/backtests/${id}/trades`, params);
export const getEvents = (id) => apiGet(`${P}/backtests/${id}/events`);

export const scanSignals = (body = {}) => apiPost(`${P}/signals/scan`, body);
export const getSignals = (params = {}) => apiGet(`${P}/signals`, params);
