import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { marketApi } from '../api/market.js';
import { useApi } from '../hooks/useApi.js';
import EChart from '../components/EChart.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import StatCard from '../components/StatCard.jsx';
import Tabs from '../components/Tabs.jsx';
import { breadthOption, distributionOption, sectorOption } from '../charts/options.js';
import { formatAmount, formatNum, formatPct, formatPrice, pctClass } from '../utils/format.js';

const RANK_TABS = [
    { value: 'gainers', label: '涨幅榜' },
    { value: 'losers', label: '跌幅榜' },
    { value: 'amount', label: '成交额' },
    { value: 'turnover', label: '换手率' },
    { value: 'amplitude', label: '振幅' },
];

const DIM_TABS = [
    { value: 'board', label: '板块' },
    { value: 'industry', label: '行业' },
];

export default function MarketDashboard() {
    const navigate = useNavigate();
    const [date, setDate] = useState('');
    const [dim, setDim] = useState('board');
    const [rankType, setRankType] = useState('gainers');

    const calendar = useApi(() => marketApi.calendar(60), []);
    const overview = useApi(() => marketApi.overview(date || undefined), [date]);
    const distribution = useApi(() => marketApi.distribution(date || undefined), [date]);
    const sectors = useApi(() => marketApi.sectors({ dimension: dim, date: date || undefined, limit: 15 }), [date, dim]);
    const ranking = useApi(() => marketApi.ranking({ type: rankType, date: date || undefined, limit: 30 }), [date, rankType]);
    const breadth = useApi(() => marketApi.breadth({ days: 60 }), []);

    const ov = overview.data;
    const failed = [calendar, overview, distribution, sectors, ranking, breadth].filter((r) => r.error);
    const errorText = failed.map((r) => r.error).join('；');

    return (
        <>
            <div className="toolbar">
                <label className="field">
                    交易日
                    <select value={date} onChange={(e) => setDate(e.target.value)} disabled={calendar.loading}>
                        <option value="">最新交易日</option>
                        {(calendar.data ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
                <button type="button" className="ghost" onClick={overview.reload}>刷新</button>
            </div>

            <ErrorBanner
                message={errorText}
                onRetry={failed.length ? () => failed.forEach((r) => r.reload()) : undefined}
            />

            <div className="stat-grid">
                <StatCard label="上涨家数" value={ov ? ov.upCount : '-'} tone="up"/>
                <StatCard label="下跌家数" value={ov ? ov.downCount : '-'} tone="down"/>
                <StatCard label="平盘家数" value={ov ? ov.flatCount : '-'}/>
                <StatCard
                    label="涨停 / 跌停"
                    value={ov ? `${ov.limitUpCount} / ${ov.limitDownCount}` : '-'}
                    hint="按 ±9.8% 近似"
                />
                <StatCard label="总成交额" value={ov ? formatAmount(ov.totalAmount) : '-'}/>
                <StatCard
                    label="平均涨跌幅"
                    value={ov ? formatPct(ov.avgPctChg) : '-'}
                    tone={ov ? pctClass(ov.avgPctChg) : 'plain'}
                    hint={ov ? `${ov.totalStocks} 只有行情 · ST ${ov.stCount} 只` : ''}
                />
            </div>

            <div className="grid-2">
                <Panel title="涨跌幅分布">
                    <EChart
                        height={300}
                        option={distributionOption(distribution.data)}
                        loading={distribution.loading}
                        empty={!distribution.loading && !(distribution.data?.buckets?.length)}
                    />
                </Panel>

                <Panel
                    title="板块表现"
                    extra={<Tabs items={DIM_TABS} value={dim} onChange={setDim}/>}
                >
                    <EChart
                        height={300}
                        option={sectorOption(sectors.data)}
                        loading={sectors.loading}
                        empty={!sectors.loading && !(sectors.data?.length)}
                        emptyText={dim === 'industry' ? '行业数据为空（stock_info.industry 尚未导入）' : '暂无数据'}
                    />
                </Panel>
            </div>

            <Panel
                title="个股榜单"
                extra={<Tabs items={RANK_TABS} value={rankType} onChange={setRankType}/>}
            >
                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>代码</th>
                            <th>名称</th>
                            <th>收盘</th>
                            <th>涨跌幅</th>
                            <th>成交额</th>
                            <th>换手率</th>
                            <th>振幅</th>
                            <th>PE(TTM)</th>
                            <th>PB</th>
                        </tr>
                        </thead>
                        <tbody>
                        {(ranking.data ?? []).map((q) => (
                            <tr key={`${q.code}-${q.tradeDate}`} onClick={() => navigate(`/stocks/${q.code}`)}>
                                <td>{q.code}</td>
                                <td>{q.name || '-'}</td>
                                <td>{formatPrice(q.close)}</td>
                                <td className={pctClass(q.pctChg)}>{formatPct(q.pctChg)}</td>
                                <td>{formatAmount(q.amount)}</td>
                                <td>{q.turnover == null ? '-' : `${formatNum(q.turnover)}%`}</td>
                                <td>{q.amplitude == null ? '-' : `${formatNum(q.amplitude)}%`}</td>
                                <td>{q.peTtm == null ? '-' : formatNum(q.peTtm, 1)}</td>
                                <td>{q.pbMrq == null ? '-' : formatNum(q.pbMrq, 2)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {ranking.loading ? <div className="empty">加载中…</div> : null}
                    {!ranking.loading && !(ranking.data?.length) ? <div className="empty">该交易日暂无榜单数据</div> : null}
                </div>
            </Panel>

            <Panel title="市场宽度（近 60 个交易日）">
                <EChart
                    height={300}
                    option={breadthOption(breadth.data)}
                    loading={breadth.loading}
                    empty={!breadth.loading && !(breadth.data?.length)}
                />
            </Panel>
        </>
    );
}
