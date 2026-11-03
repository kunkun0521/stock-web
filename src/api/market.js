import { apiGet } from './client.js';

/** 市场维度接口：/api/market，date 不传时后端自动取最新交易日 */
export const marketApi = {
    overview: (date) => apiGet('/market/overview', { date }),
    calendar: (limit = 60) => apiGet('/market/calendar', { limit }),
    ranking: ({ type = 'gainers', date, limit = 20, board, includeSt = false } = {}) =>
        apiGet('/market/ranking', { type, date, limit, board, includeSt }),
    distribution: (date) => apiGet('/market/distribution', { date }),
    sectors: ({ dimension = 'board', date, limit = 20 } = {}) =>
        apiGet('/market/sectors', { dimension, date, limit }),
    breadth: ({ from, to, days = 60 } = {}) => apiGet('/market/breadth', { from, to, days }),
};
