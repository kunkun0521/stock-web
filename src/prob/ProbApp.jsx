/**
 * A股股票概率预测引擎（/prob）。
 *
 * 五个页面共用 URL 状态（tab / code / market / horizon），从榜单点进个股再返回时筛选条件不丢。
 * 顶部固定免责声明、全局「公式说明」入口与在途请求指示；刷新按钮对当前页所有请求生效。
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FormulaProvider, useFormula } from './FormulaContext.jsx';
import FormulaModal from './FormulaModal.jsx';
import { PActivityBar, PBtn } from './ProbParts.jsx';
import { DISCLAIMER } from './format.js';
import OverviewPanel from './OverviewPanel.jsx';
import StockPanel from './StockPanel.jsx';
import EvalPanel from './EvalPanel.jsx';
import BacktestPanel from './BacktestPanel.jsx';
import RunsPanel from './RunsPanel.jsx';
import '../ga/ga.css';
import './prob.css';

const TABS = [
    { id: 'overview', label: '概率总览' },
    { id: 'stock', label: '个股详情' },
    { id: 'eval', label: '可靠性与复盘' },
    { id: 'backtest', label: '回测' },
    { id: 'runs', label: '任务与参数' },
];

function Shell() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { open } = useFormula();
    const [refreshKey, setRefreshKey] = useState(0);
    const tab = searchParams.get('tab') || 'overview';
    const patch = (next) => {
        const p = new URLSearchParams(searchParams);
        Object.entries(next).forEach(([k, v]) => {
            if (v === '' || v == null) p.delete(k); else p.set(k, String(v));
        });
        setSearchParams(p, { replace: true });
    };

    return (
        <div className="ga-root prob-root">
            <div className="ga-head">
                <div className="ga-head-row">
                    <h1 className="ga-title">股票概率预测引擎</h1>
                    <span className="prob-sub">方向 / 幅度 / 风险分别建模 · 样本外校准 · 自动结算复盘</span>
                    <div className="prob-head-actions">
                        <PBtn variant="primary" onClick={() => open({ group: 'all' })}>公式说明 · 参数来源</PBtn>
                        <PBtn onClick={() => setRefreshKey((v) => v + 1)}>刷新本页</PBtn>
                    </div>
                </div>
                <div className="prob-disclaimer">⚠ {DISCLAIMER}</div>
                <div className="ga-nav">
                    {TABS.map((t) => (
                        <button key={t.id} type="button"
                                className={`ga-nav-link${tab === t.id ? ' active' : ''}`}
                                onClick={() => patch({ tab: t.id })}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <PActivityBar/>
            </div>

            <div className="ga-page">
                {tab === 'overview' ? <OverviewPanel params={searchParams} patch={patch} refreshKey={refreshKey}/> : null}
                {tab === 'stock' ? <StockPanel params={searchParams} patch={patch} refreshKey={refreshKey}/> : null}
                {tab === 'eval' ? <EvalPanel refreshKey={refreshKey}/> : null}
                {tab === 'backtest' ? <BacktestPanel refreshKey={refreshKey}/> : null}
                {tab === 'runs' ? <RunsPanel refreshKey={refreshKey}/> : null}
            </div>
            <FormulaModal/>
        </div>
    );
}

export default function ProbApp() {
    return <FormulaProvider><Shell/></FormulaProvider>;
}
