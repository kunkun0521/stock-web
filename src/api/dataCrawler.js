import { apiGet, apiPost } from './client.js';

/** 独立股票行情抓取工具。 */
export const dataCrawlerApi = {
    start: (params = {}) => apiPost('/data-crawler/tasks', params),
    detail: (id) => apiGet(`/data-crawler/tasks/${id}`),
    recent: (limit = 20) => apiGet('/data-crawler/tasks', { limit }),
};
