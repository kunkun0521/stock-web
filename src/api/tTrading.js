import { apiGet, apiPost } from './client.js';

/** 做T + 成本摊薄 + 回本盈利模拟接口。 */
export const tTradingApi = {
    defaults: () => apiGet('/t-trading/defaults'),
    simulate: (params) => apiPost('/t-trading/simulate', params),
};
