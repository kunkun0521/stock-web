import { apiGet, apiPost } from './client.js';

/** 短期持有期预测：5/10/15/20 个交易日。 */
export const shortTermApi = {
    list: (params = {}) => apiGet('/short-term/forecasts', params),
    dates: (adjustFlag = 2) => apiGet('/short-term/forecasts/dates', { adjustFlag }),
    rebuild: ({ date, adjustFlag = 2 } = {}) => {
        const query = new URLSearchParams({ adjustFlag: String(adjustFlag) });
        if (date) query.set('date', date);
        return apiPost(`/short-term/forecasts/rebuild?${query.toString()}`);
    },
};
