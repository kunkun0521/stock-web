import { apiGet, apiPost } from './client.js';

/** 按批次保存的逐日短期预测接口。 */
export const shortTermHistoryApi = {
    runs: (adjustFlag = 2, limit = 30) => apiGet('/short-term/history/runs', { adjustFlag, limit }),
    sourceDates: (adjustFlag = 2, limit = 120) => apiGet('/short-term/history/source-dates', { adjustFlag, limit }),
    rebuild: ({ date, adjustFlag = 2 } = {}) => {
        const query = new URLSearchParams({ adjustFlag: String(adjustFlag) });
        if (date) query.set('date', date);
        return apiPost(`/short-term/history/runs/rebuild?${query.toString()}`);
    },
    evaluate: (runId) => apiPost(`/short-term/history/runs/${runId}/evaluate`),
    summary: (runId, params = {}) => apiGet(`/short-term/history/runs/${runId}/summary`, params),
    daily: (runId, code) => apiGet(`/short-term/history/runs/${runId}/stocks/${code}`),
};
