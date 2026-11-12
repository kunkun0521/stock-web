import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getPicks } from './api.js';
import {
    GA_BASE, asArray, asObject, fmtRate, fmtNum, fmtText,
    dirTone, isUpDir, isDownDir, marketOf,
} from './gaUtils.js';
import { Card, FilterBar, Field, Input, Btn, AsyncPanel, Badge, Empty } from './GaParts.jsx';

const DEFAULT_FILTERS = {
    date: new Date().toISOString().slice(0, 10), topN: '20', minConsensus: '',
};

/** 单榜表格。directions / probUps 是 {周期: 值} 对象，逐项展开成小徽标。 */
function pickTable(rows, emptyText, openStock) {
    const list = asArray(rows);
    if (!list.length) return <Empty text={emptyText}/>;
    return (
        <div className="ga-table-wrap">
            <table className="ga-table">
                <thead><tr>
                    <th>代码</th><th>名称</th><th>共振</th><th>平均置信</th>
                    <th>各周期方向</th><th>各周期 P↑</th><th>命中率60</th><th>风险</th>
                </tr></thead>
                <tbody>
                {list.map((row, i) => {
                    const r = asObject(row);
                    const dirs = asObject(r.directions);
                    const probs = asObject(r.probUps);
                    return (
                        <tr key={r.code ?? i} className="ga-row-link" title="点击查看个股详情"
                            onClick={() => openStock(r)}>
                            <td className="ga-mono">{fmtText(r.code)}</td>
                            <td>{fmtText(r.name)}</td>
                            <td className="ga-num">{fmtNum(r.consensus, 2)}</td>
                            <td className="ga-num">{fmtRate(r.avgConf)}</td>
                            <td>
                                <div className="ga-row">
                                    {Object.entries(dirs).map(([h, v]) => (
                                        <Badge key={h} tone={dirTone(v)}>
                                            {h}{isUpDir(v) ? '↑' : isDownDir(v) ? '↓' : '·'}
                                        </Badge>
                                    ))}
                                </div>
                            </td>
                            <td>
                                <div className="ga-row">
                                    {Object.entries(probs).map(([h, v]) => (
                                        <span key={h} className="ga-num ga-mono">{h}:{fmtRate(v)}</span>
                                    ))}
                                </div>
                            </td>
                            <td className="ga-num">{fmtRate(r.hitRate60)}</td>
                            <td>{r.limitFlag ? <Badge tone="warn">追高风险</Badge> : <span className="ga-muted">-</span>}</td>
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
}

/**
 * 每日选股：分别请求看涨(direction=1)与看跌(direction=-1)两个榜，共用日期/TopN/共振下限筛选。
 * limitFlag 为真的标的打「追高风险」；行点击跳个股详情。
 */
export default function PicksPage() {
    const navigate = useNavigate();
    const [f, setF] = usePersistedState('ga:picks:filters', DEFAULT_FILTERS);
    const set = (key) => (v) => setF((prev) => ({ ...prev, [key]: v }));

    const main = useApi(
        () => Promise.all([
            getPicks({ date: f.date, topN: f.topN, direction: '1', minConsensus: f.minConsensus }),
            getPicks({ date: f.date, topN: f.topN, direction: '-1', minConsensus: f.minConsensus }),
        ]),
        [f.date, f.topN, f.minConsensus],
    );
    const [ups, downs] = Array.isArray(main.data) ? main.data : [];
    const openStock = (row) => navigate(`${GA_BASE}/stock/${marketOf(row)}/${String(row?.code ?? '')}`);

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="日期"><Input type="date" value={f.date} onChange={set('date')}/></Field>
                <Field label="Top N"><Input type="number" min="1" value={f.topN} onChange={set('topN')}/></Field>
                <Field label="共振下限" hint="minConsensus">
                    <Input type="number" step="0.1" min="0" value={f.minConsensus} onChange={set('minConsensus')}/>
                </Field>
                <Btn variant="primary" onClick={main.reload}>刷新</Btn>
            </FilterBar>

            <AsyncPanel state={main} isEmpty={() => false}>
                {() => (
                    <div className="ga-grid-2">
                        <Card title="看涨榜">{pickTable(ups, '暂无看涨入选标的', openStock)}</Card>
                        <Card title="看跌榜">{pickTable(downs, '暂无看跌入选标的', openStock)}</Card>
                    </div>
                )}
            </AsyncPanel>
        </div>
    );
}
