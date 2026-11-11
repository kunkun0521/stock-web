import { apiGet } from './client.js';

/** 量化评分页「连续评分区间」筛选接口，独立于原有评分排行接口。 */
export const scoreContinuityApi = {
    query: (params = {}) => apiGet('/rankings/scores/continuous', params),
};
