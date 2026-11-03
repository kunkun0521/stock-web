import { apiGet, apiPost } from './client.js';

/** 多因子评分排行接口。 */
export const scoreApi = {
    list: (params = {}) => apiGet('/rankings/scores', params),
    dates: (adjustFlag = 2) => apiGet('/rankings/scores/dates', { adjustFlag }),
    rebuild: (params = {}) => apiPost('/rankings/scores/rebuild', params),
};
