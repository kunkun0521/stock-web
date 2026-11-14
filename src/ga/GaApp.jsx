import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useApi, invalidateApiCache } from '../hooks/useApi.js';
import { getOverview } from './api.js';
import { asArray, fmtText, GA_BASE } from './gaUtils.js';
import { ErrorBox, Btn } from './GaParts.jsx';
import { GlossaryProvider, useGlossary } from './GlossaryContext.jsx';
import GlossaryModal from './GlossaryModal.jsx';
import { matchAlert } from './glossary.js';
import OverviewPage from './OverviewPage.jsx';
import PredictionsPage from './PredictionsPage.jsx';
import AnalysisPage from './AnalysisPage.jsx';
import PoolPage from './PoolPage.jsx';
import EvolutionPage from './EvolutionPage.jsx';
import FactorsPage from './FactorsPage.jsx';
import PicksPage from './PicksPage.jsx';
import ConfigPage from './ConfigPage.jsx';
import JobsPage from './JobsPage.jsx';
import CleanupPage from './CleanupPage.jsx';
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
    { key: 'jobs', label: '后台任务' },
    { key: 'cleanup', label: '数据清理' },
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
function GaShell() {
    // 顶部告警条单独取 /api/ga/overview 的 alerts，带缓存避免切页重复拉取。
    const head = useApi(() => getOverview({}), [], { cacheKey: 'ga:head:alerts', ttlMs: 60 * 1000 });
    const alerts = asArray(head.data?.alerts);
    const [pageKey, setPageKey] = useState(0);
    const [checkedAt, setCheckedAt] = useState(null);
    const { open } = useGlossary();

    useEffect(() => {
        if (head.data !== undefined || head.error) setCheckedAt(new Date());
    }, [head.data, head.error]);

    /** 全局刷新：清掉请求缓存 + 重挂当前页（页面内所有接口重新拉取）。 */
    const hardRefresh = () => {
        invalidateApiCache();
        head.reload();
        setPageKey((k) => k + 1);
    };

    const connTone = head.error ? 'err' : head.loading && !head.data ? 'wait' : 'ok';
    const connText = head.error ? '接口异常' : head.loading && !head.data ? '连接中…' : '接口正常';

    return (
        <div className="ga-root">
            <header className="ga-head">
                <div className="ga-head-row">
                    <h1 className="ga-title">遗传算法涨跌预测</h1>
                    <span className="ga-disclaimer">仅用于研究与复盘，不构成投资建议</span>
                    <div className="ga-head-tools">
                        <span className={`ga-conn ga-conn--${connTone}`} title="与 /api/ga 的连接状态">
                            <i/>{connText}
                            {checkedAt ? ` · ${checkedAt.toLocaleTimeString('zh-CN')}` : ''}
                        </span>
                        <Btn sm variant="ghost" onClick={() => open({ group: 'all', sopId: 'none' })}
                             title="所有英文指标、状态值、任务名的中文解释，以及告警处置指引">
                            ? 指标说明
                        </Btn>
                        <Btn sm onClick={hardRefresh}>刷新本页</Btn>
                    </div>
                </div>
                <nav className="ga-nav" aria-label="遗传算法模块导航">
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
                    {alerts.map((a, i) => {
                        const guide = matchAlert(a.text);
                        return (
                            <div key={i} className={`ga-alert ga-alert--${alertTone(a.level)}`}>
                                <span className="ga-alert-text">{fmtText(a.text)}</span>
                                <button type="button" className="ga-alert-help"
                                        onClick={() => open({ alert: fmtText(a.text) })}
                                        title={guide ? `查看「${guide.title}」的操作指引` : '打开指标说明'}>
                                    {guide ? '怎么处理？' : '指标说明'} →
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            <div className="ga-body">
                <Routes key={pageKey}>
                    <Route index element={<Navigate to="overview" replace/>}/>
                    <Route path="overview" element={<OverviewPage/>}/>
                    <Route path="predictions" element={<PredictionsPage/>}/>
                    <Route path="analysis" element={<AnalysisPage/>}/>
                    <Route path="pool" element={<PoolPage/>}/>
                    <Route path="evolution" element={<EvolutionPage/>}/>
                    <Route path="factors" element={<FactorsPage/>}/>
                    <Route path="picks" element={<PicksPage/>}/>
                    <Route path="jobs" element={<JobsPage/>}/>
                    <Route path="cleanup" element={<CleanupPage/>}/>
                    <Route path="config" element={<ConfigPage/>}/>
                    <Route path="stock/:market/:code" element={<StockPage/>}/>
                    <Route path="*" element={<Navigate to="overview" replace/>}/>
                </Routes>
            </div>
            <GlossaryModal/>
        </div>
    );
}

/** Provider 放在外壳外层，保证所有子页面里的 <Term> 都能打开同一个弹窗。 */
export default function GaApp() {
    return (
        <GlossaryProvider>
            <GaShell/>
        </GlossaryProvider>
    );
}
