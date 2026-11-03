import { apiGet } from './client.js';

/** 股票维度接口：/api/stocks */
export const stockApi = {
    list: (params) => apiGet('/stocks', params),
    suggest: (keyword, limit = 10) => apiGet('/stocks/suggest', { keyword, limit }),
    filters: () => apiGet('/stocks/filters'),
    detail: (code) => apiGet(`/stocks/${encodeURIComponent(code)}`),
    quote: (code) => apiGet(`/stocks/${encodeURIComponent(code)}/quote`),
    daily: (code, params) => apiGet(`/stocks/${encodeURIComponent(code)}/daily`, params),
    kline: (code, params) => apiGet(`/stocks/${encodeURIComponent(code)}/kline`, params),
    stats: (code, params) => apiGet(`/stocks/${encodeURIComponent(code)}/stats`, params),
    dataRange: (code) => apiGet(`/stocks/${encodeURIComponent(code)}/data-range`),
};
