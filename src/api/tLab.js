import { apiGet, apiPost } from './client.js';

/** 做T回本 / 补仓 / 买点扫描实验模块（后端 /api/t/**，与 /api/t-trading 相互独立）。 */
export const tLabApi = {
    defaultParams: () => apiGet('/t/params/default'),
    simulate: (params) => apiPost('/t/simulate', params),
    scan: (params) => apiPost('/t/scan-entry', params),
    plan: (params) => apiPost('/t/next-plan', params),
    task: (id) => apiGet(`/t/tasks/${id}`),
};
