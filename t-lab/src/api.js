/**
 * 独立子应用的请求封装，口径与主站一致：后端统一返回 { code, message, data }。
 * 基址优先级：VITE_API_BASE > 上次成功 > 同源 /api（Vite 代理）> __BACKEND__ + /api 直连。
 */
const CONFIGURED = (import.meta.env.VITE_API_BASE || '').trim();
const DEV_BACKEND = typeof __BACKEND__ !== 'undefined' ? (__BACKEND__ || '') : '';
const STORE_KEY = 'stock.tlab.api.base';

export class ApiError extends Error {
    constructor(code, message, status, url, retryable = false) {
        super(message || '接口异常');
        this.code = code;
        this.status = status;
        this.url = url;
        this.retryable = retryable;
    }
}

const trimSlash = (s) => (s || '').replace(/\/+$/, '');

function readBase() {
    try { return window.localStorage.getItem(STORE_KEY) || ''; } catch { return ''; }
}

function remember(base) {
    try {
        if (base && base !== '/api') window.localStorage.setItem(STORE_KEY, base);
        else window.localStorage.removeItem(STORE_KEY);
    } catch { /* 忽略 */ }
}

function candidates() {
    const list = [];
    const push = (v) => { const value = trimSlash(v); if (value && !list.includes(value)) list.push(value); };
    push(CONFIGURED);
    push(readBase());
    if (!CONFIGURED) {
        push('/api');
        push(trimSlash(DEV_BACKEND) + '/api');
    }
    return list;
}

async function once(url, init) {
    let response;
    try { response = await fetch(url, init); }
    catch { throw new ApiError(-1, `无法连接接口 ${url}，请确认 Spring Boot 已启动`, 0, url.toString(), true); }
    const text = await response.text().catch(() => '');
    let body;
    try { body = JSON.parse(text); }
    catch { throw new ApiError(-1, `接口 ${url} 返回的不是 JSON（HTTP ${response.status}）`, response.status, url.toString(), true); }
    if (!response.ok || body.code !== 0) {
        throw new ApiError(body.code ?? response.status, body.message || `HTTP ${response.status}`,
            response.status, url.toString(), false);
    }
    return body.data;
}

async function request(path, init) {
    let last = null;
    for (const base of candidates()) {
        const url = new URL(base + path, window.location.origin);
        try {
            const data = await once(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
            remember(base);
            return data;
        } catch (e) {
            last = e;
            if (!e.retryable) break;
        }
    }
    throw last || new ApiError(-1, '接口不可用', 0, '', false);
}

export const apiGet = (path) => request(path, {});

export const apiPost = (path, data) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const tApi = {
    defaultParams: () => apiGet('/t/params/default'),
    simulate: (payload) => apiPost('/t/simulate', payload),
    scan: (payload) => apiPost('/t/scan-entry', payload),
    plan: (payload) => apiPost('/t/next-plan', payload),
    task: (id) => apiGet(`/t/tasks/${id}`),
};
