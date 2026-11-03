import { describeApiBase } from '../api/client.js';

/**
 * 请求失败时的一级提示条。
 * 之所以单独做成横幅：接口挂掉时页面骨架仍然完整，小字提示很容易被忽略，
 * 看起来就像「页面正常但没有数据」。横幅会直接给出失败原因和排查步骤。
 */
export default function ErrorBanner({ message, onRetry }) {
    if (!message) return null;

    const base = describeApiBase();

    return (
        <div className="error-banner">
            <div className="error-banner-head">
                <strong>数据加载失败</strong>
                {onRetry ? (
                    <button type="button" className="ghost" onClick={onRetry}>重试</button>
                ) : null}
            </div>
            <div className="error-banner-msg">{message}</div>
            <ol className="error-banner-tips">
                <li>确认后端已启动：<code>{base.backend || 'http://localhost:8080'}</code> 能访问
                    <code>/api/market/overview</code></li>
                <li>当前页面使用的接口基址：<code>{base.primary}</code>
                    {base.all.length > 1 ? `（备选：${base.all.slice(1).join('、')}）` : ''}</li>
                <li>后端端口不是 8080 时，用
                    <code>VITE_BACKEND=http://localhost:端口 npm run dev</code> 重启前端</li>
                <li>如果页面不是通过 <code>npm run dev</code> 打开的（如 IDE 内置预览 / 静态服务器），
                    改用 <code>http://localhost:5173</code> 访问，后端已放开跨域</li>
            </ol>
        </div>
    );
}
