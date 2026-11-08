import { useState } from 'react';
import SimulatePage from './pages/SimulatePage.jsx';
import ScanPage from './pages/ScanPage.jsx';
import PlanPage from './pages/PlanPage.jsx';

const TABS = [
    { key: 'simulate', label: '回本模拟' },
    { key: 'scan', label: '买点扫描' },
    { key: 'plan', label: '次日计划' },
];

export default function App() {
    const [tab, setTab] = useState('simulate');
    const [jumpBuyDate, setJumpBuyDate] = useState('');

    const jumpToSimulate = (buyDate) => {
        setJumpBuyDate(buyDate);
        setTab('simulate');
    };

    return (
        <div className="app">
            <header className="app-head">
                <div>
                    <h1>做T回本 · 补仓 · 买点扫描</h1>
                    <p>规则 + 波动率估计的历史日线回测与次日计划工具 · 数据源 stock_daily_all（00/30/60 分表）</p>
                </div>
                <nav className="tabs">
                    {TABS.map((t) => (
                        <button key={t.key} type="button" className={tab === t.key ? 'active' : ''}
                                onClick={() => setTab(t.key)}>{t.label}</button>
                    ))}
                </nav>
            </header>

            <main className="app-main">
                {/* 三个标签页均保持挂载，切页不丢失已输入的参数与结果 */}
                <div hidden={tab !== 'simulate'}>
                    <SimulatePage initialBuyDate={jumpBuyDate}
                                  onConsumeInitial={() => setJumpBuyDate('')}/>
                </div>
                <div hidden={tab !== 'scan'}>
                    <ScanPage onJumpToSimulate={jumpToSimulate}/>
                </div>
                <div hidden={tab !== 'plan'}>
                    <PlanPage/>
                </div>
            </main>

            <footer className="risk-bar">
                基于历史日线的规则回测，不含分时数据，历史表现不代表未来，仅供研究参考
            </footer>
        </div>
    );
}
