import { useState } from 'react';
import SimulatePage from './pages/SimulatePage.jsx';
import ScanPage from './pages/ScanPage.jsx';
import PlanPage from './pages/PlanPage.jsx';
import { usePersistedState } from '../hooks/usePersistedState.js';
import './styles.css';

const TABS = [
    { key: 'simulate', label: '回本模拟' },
    { key: 'scan', label: '买点扫描' },
    { key: 'plan', label: '次日计划' },
];

/**
 * 主站「回本实验室」页面：外壳只负责页签与状态中转，三个功能页保持挂载，
 * 切页/跳页不会丢失已输入的参数和结果。样式全部限定在 .tlab-root 内。
 * 当前页签写入 sessionStorage：从侧栏切到别的页面再回来，仍停在原来的页签。
 */
export default function TLabPage() {
    const [tab, setTab] = usePersistedState('tlab:tab', 'simulate');
    const [jumpBuyDate, setJumpBuyDate] = useState('');

    const jumpToSimulate = (buyDate) => {
        setJumpBuyDate(buyDate);
        setTab('simulate');
    };

    return (
        <div className="tlab-root">
            <div className="app">
                <div className="app-head">
                    <div>
                        <h1>做T回本 · 补仓 · 买点扫描</h1>
                        <p>规则 + 波动率估计的历史日线回测 · 数据源 stock_daily_all（00/30/60 分表）</p>
                    </div>
                    <nav className="tabs">
                        {TABS.map((t) => (
                            <button key={t.key} type="button" className={tab === t.key ? 'active' : ''}
                                    onClick={() => setTab(t.key)}>{t.label}</button>
                        ))}
                    </nav>
                </div>

                <div className="app-main">
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
                </div>

                <div className="risk-bar">
                    基于历史日线的规则回测，不含分时数据，历史表现不代表未来，仅供研究参考
                </div>
            </div>
        </div>
    );
}
