import { useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Sidebar, { StockSearch } from './components/Header.jsx';
import MarketDashboard from './pages/MarketDashboard.jsx';
import StockList from './pages/StockList.jsx';
import StockDetail from './pages/StockDetail.jsx';
import ScoreRanking from './pages/ScoreRanking.jsx';
import ShortTermForecast from './pages/ShortTermForecast.jsx';
import ForecastDashboard from './pages/ForecastDashboard.jsx';
import TTradingSimulator from './pages/TTradingSimulator.jsx';
import DataCrawler from './pages/DataCrawler.jsx';

const PAGE_TITLES = {
    '/': '市场看板',
    '/stocks': '股票列表',
    '/scores': '量化评分',
    '/short-term': '短期预测',
    '/forecast': '模型预测',
    '/t-trading': '做T模型',
    '/data-crawler': '数据抓取',
};

function NotFound() {
    return (
        <div className="panel">
            <h2>页面不存在</h2>
            <p className="muted">请从左侧导航选择「市场看板」「股票列表」或「量化评分」。</p>
        </div>
    );
}

export default function App() {
    const location = useLocation();
    // 宽屏默认展开侧栏，窄屏默认收起为抽屉
    const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 960);
    const title = location.pathname.startsWith('/stocks/')
        ? '股票详情'
        : (PAGE_TITLES[location.pathname] ?? '页面不存在');

    const closeOnMobile = () => {
        if (window.innerWidth <= 960) setSidebarOpen(false);
    };

    return (
        <div className={`app${sidebarOpen ? ' sidebar-open' : ''}`}>
            <Sidebar onNavigate={closeOnMobile}/>
            <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)}/>
            <div className="app-main">
                <header className="topbar">
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setSidebarOpen((v) => !v)}
                        aria-label="展开或收起侧边栏"
                        title="展开或收起侧边栏"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                            <path d="M4 7h16 M4 12h16 M4 17h16"/>
                        </svg>
                    </button>
                    <div className="topbar-location">
                        <span className="crumb">工作台</span>
                        <span className="crumb-sep">/</span>
                        <strong>{title}</strong>
                    </div>
                    <div className="topbar-actions">
                        <StockSearch/>
                        <span className="topbar-badge">仅供研究</span>
                    </div>
                </header>
                <main className="container">
                    <Routes>
                        <Route path="/" element={<MarketDashboard/>}/>
                        <Route path="/stocks" element={<StockList/>}/>
                        <Route path="/stocks/:code" element={<StockDetail/>}/>
                        <Route path="/scores" element={<ScoreRanking/>}/>
                        <Route path="/short-term" element={<ShortTermForecast/>}/>
                        <Route path="/forecast" element={<ForecastDashboard/>}/>
                        <Route path="/t-trading" element={<TTradingSimulator/>}/>
                        <Route path="/data-crawler" element={<DataCrawler/>}/>
                        <Route path="*" element={<NotFound/>}/>
                    </Routes>
                </main>
                <footer className="app-footer">
                    数据来自本地 stock_eastmoney 库 · 仅用于数据查看，不构成投资建议
                </footer>
            </div>
        </div>
    );
}
