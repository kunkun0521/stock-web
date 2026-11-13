/**
 * 统一请求封装：后端所有接口返回 { code, message, data, timestamp }，
 * 这里只把 data 抛给页面，非 0 一律转成 ApiError。
 *
 * 接口基址解析顺序（第一个能用的会被记住，存 localStorage）：
 *   1. VITE_API_BASE（显式配置，优先级最高）
 *   2. 上次调用成功的基址
 *   3. 同源 /api（npm run dev 时由 Vite 代理到后端）
 *   4. __BACKEND__ + /api（直接连后端，后端已放开 /api/** 跨域）
 *
 * 之所以要有 3、4 两级回退：页面如果不是由 Vite 打开（例如用其它静态服务器、
 * IDE 内置预览、直接打开构建产物），同源的 /api 并不存在，请求会拿到 HTML 或 404，
 * 页面就会「有骨架没数据」。这种情况下自动回退到第 4 级直连后端即可恢复。
 */

const CONFIGURED = (import.meta.env.VITE_API_BASE || '').trim();
const DEV_BACKEND = typeof __BACKEND__ !== 'undefined' ? (__BACKEND__ || '') : '';
const STORE_KEY = 'stock.api.base';

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

function readStoredBase() {
    try {
        return window.localStorage.getItem(STORE_KEY) || '';
    } catch {
        return '';
    }
}

function rememberBase(base) {
    try {
        if (base && base !== '/api') {
            window.localStorage.setItem(STORE_KEY, base);
        } else {
            window.localStorage.removeItem(STORE_KEY);
        }
    } catch {
        /* localStorage 不可用时忽略 */
    }
}

/** 当前可用的接口基址候选列表 */
export function apiBaseCandidates() {
    const list = [];
    const push = (base) => {
        const value = trimSlash(base);
        if (value && !list.includes(value)) list.push(value);
    };

    push(CONFIGURED);
    push(readStoredBase());
    if (!CONFIGURED) {
        push('/api');
        push(trimSlash(DEV_BACKEND) + '/api');
    }
    return list;
}

function buildUrl(base, path, params) {
    const full = base.startsWith('http') ? `${base}${path}` : `${base}${path}`;
    const url = new URL(full, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
        }
    });
    return url;
}

async function requestOnce(url, init) {
    let response;
    try {
        response = await fetch(url, init);
    } catch {
        // 网络不可达 / CORS 被拦截 / 代理挂了 —— 可以换基址重试
        throw new ApiError(-1, `无法连接接口 ${url.toString()}，请确认 Spring Boot 已启动`, 0, url.toString(), true);
    }

    const text = await response.text().catch(() => '');
    let body = null;
    try {
        body = JSON.parse(text);
    } catch {
        // 非 JSON（多数是打到了一个没有 /api 的静态服务器）—— 换基址重试
        throw new ApiError(-1, `接口 ${url.toString()} 返回的不是 JSON（HTTP ${response.status}）`,
            response.status, url.toString(), true);
    }

    if (!response.ok || body.code !== 0) {
        // 后端正常应答的业务错误（如股票不存在），不需要换基址
        throw new ApiError(body.code ?? response.status, body.message || `HTTP ${response.status}`,
            response.status, url.toString(), false);
    }
    return body.data;
}

async function request(path, params = {}, init = {}) {
    const bases = apiBaseCandidates();
    let lastError = null;

    for (const base of bases) {
        const url = buildUrl(base, path, params);
        try {
            const data = await requestOnce(url, {
                ...init,
                headers: { Accept: 'application/json', ...(init.headers || {}) },
            });
            rememberBase(base);
            return data;
        } catch (e) {
            lastError = e;
            if (!e.retryable) break;
        }
    }
    throw lastError || new ApiError(-1, '接口不可用', 0, '', false);
}

export async function apiGet(path, params = {}) {
    return request(path, params);
}

export const apiPost = async (path, data = {}) => {
    return request(path, {}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
};

/**
 * PUT / DELETE 与 GET / POST 走同一套基址探测与回退逻辑。
 * 之前参数配置的保存用原生 fetch 直连后端，跨域预检被拦就整页报「保存失败」，
 * 且拿不到后端 {code,message} 里的具体原因；统一到这里后与其它接口行为一致。
 */
export const apiPut = async (path, data = {}) => {
    return request(path, {}, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
};

export const apiDelete = async (path) => {
    return request(path, {}, { method: 'DELETE' });
};

/** 生成可用于 window.open / <a href> 的绝对接口地址（CSV 导出等文件流接口）。 */
export function apiUrl(path, params = {}) {
    const bases = apiBaseCandidates();
    return buildUrl(trimSlash(bases[0] || '/api'), path, params).toString();
}

/** 给页面提示用：当前实际在用的接口基址 */
export function describeApiBase() {
    const candidates = apiBaseCandidates();
    return { primary: candidates[0], all: candidates, backend: DEV_BACKEND };
}
