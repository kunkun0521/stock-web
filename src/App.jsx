import { Route, Routes } from 'react-router-dom';
import Header from './components/Header.jsx';
import MarketDashboard from './pages/MarketDashboard.jsx';
import StockList from './pages/StockList.jsx';
import StockDetail from './pages/StockDetail.jsx';
import ScoreRanking from './pages/ScoreRanking.jsx';
import ShortTermForecast from './pages/ShortTermForecast.jsx';
import ForecastDashboard from './pages/ForecastDashboard.jsx';
import DataCrawler from './pages/DataCrawler.jsx';

function NotFound() {
    return (
        <div className="panel">
            <h2>页面不存在</h2>
            <p className="muted">请从顶部导航选择「市场看板」「股票列表」或「量化评分」。</p>
        </div>
    );
}

export default function App() {
    return (
        <div className="app">
            <Header/>
            <main className="container">
                <Routes>
                    <Route path="/" element={<MarketDashboard/>}/>
                    <Route path="/stocks" element={<StockList/>}/>
                    <Route path="/stocks/:code" element={<StockDetail/>}/>
                    <Route path="/scores" element={<ScoreRanking/>}/>
                    <Route path="/short-term" element={<ShortTermForecast/>}/>
                    <Route path="/forecast" element={<ForecastDashboard/>}/>
                    <Route path="/data-crawler" element={<DataCrawler/>}/>
                    <Route path="*" element={<NotFound/>}/>
                </Routes>
            </main>
            <footer className="app-footer">
                数据来自本地 stock_eastmoney 库 · 仅用于数据查看，不构成投资建议
            </footer>
        </div>
    );
}
