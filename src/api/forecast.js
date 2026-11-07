import { apiGet } from './client.js';

/** 多模型预测体系（stock-predict）查询接口 */
export const forecastApi = {
    overview: (horizon = 10) => apiGet('/forecast/overview', { horizon }),
    models: (horizon = 10) => apiGet('/forecast/models', { horizon }),
    picks: ({ date, horizon = 10, modelId, limit = 25 } = {}) =>
        apiGet('/forecast/picks', { date, horizon, modelId, limit }),
    predictions: ({ date, horizon = 10, modelId, page = 1, size = 50 } = {}) =>
        apiGet('/forecast/predictions', { date, horizon, modelId, page, size }),
    eval: ({ modelId, horizon = 10, limit = 120 } = {}) =>
        apiGet('/forecast/eval', { modelId, horizon, limit }),
    weights: (horizon = 10) => apiGet('/forecast/weights', { horizon }),
    dates: (limit = 60) => apiGet('/forecast/dates', { limit }),
};
