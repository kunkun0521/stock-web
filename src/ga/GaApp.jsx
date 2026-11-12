import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { getOverview } from './api.js';
import { asArray, fmtText, GA_BASE } from './gaUtils.js';
import { ErrorBox } from './GaParts.jsx';
import OverviewPage from './OverviewPage.jsx';
import PredictionsPage from './PredictionsPage.jsx';
import AnalysisPage from './AnalysisPage.jsx';
import PoolPage from './PoolPage.jsx';
import EvolutionPage from './EvolutionPage.jsx';
import FactorsPage from './FactorsPage.jsx';
import PicksPage from './PicksPage.jsx';
import ConfigPage from './ConfigPage.jsx';
import StockPage from './StockPage.jsx';
import './ga.css';

/** 顶部标签导航；个股详情 stock/:market/:code 不显示在导航里。 */
const NAV = [
    { key: 'overview', label: '总览' },
    { key: 'predictions', label: '预测复盘' },
    { key: 'analysis', label: '错误分析' },
    { key: 'pool', label: '淘汰管理' },
    { key: 'evolution', label: '进化监控' },
    { key: 'factors', label: '因子体检' },
    { key: 'picks', label: '每日选股' },
    { key: 'config', label: '参数配置' },
];

/** 告警等级 → 配色，兼容大小写与 ERROR/WARN/INFO 等写法。 */
function alertTone(level) {
    const s = String(level ?? '').toLowerCase();
    if (s.includes('err') || s.includes('fatal') || s.includes('crit')) return 'error';
    if (s.includes('warn')) return 'warn';
    return 'info';
}

/**
 * 模块外壳：标题、免责声明、告警条、顶部标签导航、二级相对路由。
 * 约定主站把它挂在 /ga/* 下（父路由需带 * splat），见 README。
 */
export default function GaApp() {
    // 顶部告警条单独取 /api/ga/overview 的 alerts，带缓存避免切页重复拉取。
    const head = useApi(() => getOverview({}), [], { cacheKey: 'ga:head:alerts', ttlMs: 60 * 1000 });
    const alerts = asArray(head.data?.alerts);

    return (
        <div className="ga-root">
            <header className="ga-head">
                <div className="ga-head-row">
                    <h1 className="ga-title">遗传算法涨跌预测</h1>
                    <span className="ga-disclaimer">仅用于研究与复盘，不构成投资建议</span>
                </div>
                <nav className="ga-nav">
                    {NAV.map((t) => (
                        <NavLink key={t.key} to={`${GA_BASE}/${t.key}`}
                                 className={({ isActive }) => `ga-nav-link${isActive ? ' active' : ''}`}>
                            {t.label}
                        </NavLink>
                    ))}
                </nav>
            </header>

            {head.error ? <ErrorBox message={head.error} onRetry={head.reload} compact/> : null}
            {alerts.length ? (
                <div className="ga-alerts">
                    {alerts.map((a, i) => (
                        <div key={i} className={`ga-alert ga-alert--${alertTone(a.level)}`}>
                            {fmtText(a.text)}
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="ga-body">
                <Routes>
                    <Route index element={<Navigate to="overview" replace/>}/>
                    <Route path="overview" element={<OverviewPage/>}/>
                    <Route path="predictions" element={<PredictionsPage/>}/>
                    <Route path="analysis" element={<AnalysisPage/>}/>
                    <Route path="pool" element={<PoolPage/>}/>
                    <Route path="evolution" element={<EvolutionPage/>}/>
                    <Route path="factors" element={<FactorsPage/>}/>
                    <Route path="picks" element={<PicksPage/>}/>
                    <Route path="config" element={<ConfigPage/>}/>
                    <Route path="stock/:market/:code" element={<StockPage/>}/>
                    <Route path="*" element={<Navigate to="overview" replace/>}/>
                </Routes>
            </div>
        </div>
    );
}
