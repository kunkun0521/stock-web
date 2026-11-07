import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { scoreApi } from '../api/score.js';
import { useApi } from '../hooks/useApi.js';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import Pagination from '../components/Pagination.jsx';
import StatCard from '../components/StatCard.jsx';
import { formatNum, formatPrice, pctClass } from '../utils/format.js';

const scoreTone = (score) => Number(score) >= 70 ? 'score-high' : Number(score) >= 50 ? 'score-mid' : 'score-low';

const returnText = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(value) * 100;
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
};

function FactorBar({ label, value }) {
    const n = value == null ? null : Number(value);
    return (
        <div className="factor-item">
            <span>{label}</span>
            <div className="factor-track"><i style={{ width: `${Math.max(0, Math.min(100, n ?? 0))}%` }}/></div>
            <b>{n == null ? '-' : n.toFixed(1)}</b>
        </div>
    );
}

export default function ScoreRanking() {
    const navigate = useNavigate();
    const [adjustFlag, setAdjustFlag] = useState(2);
    const [date, setDate] = useState('');
    const [keyword, setKeyword] = useState('');
    const [queryKeyword, setQueryKeyword] = useState('');
    const [minScore, setMinScore] = useState('');
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(50);
    const [rebuilding, setRebuilding] = useState(false);
    const [rebuildError, setRebuildError] = useState('');

    const dates = useApi(() => scoreApi.dates(adjustFlag), [adjustFlag]);
    const ranking = useApi(() => scoreApi.list({
        date: date || undefined,
        adjustFlag,
        keyword: queryKeyword || undefined,
        minScore: minScore || undefined,
        page,
        size,
    }), [date, adjustFlag, queryKeyword, minScore, page, size]);

    const rows = ranking.data?.items ?? [];
    const avgScore = useMemo(() => {
        if (!rows.length) return '-';
        return (rows.reduce((sum, row) => sum + Number(row.totalScore || 0), 0) / rows.length).toFixed(1);
    }, [rows]);
    const scoreDate = rows[0]?.tradeDate || date || '最新交易日';

    const runSearch = () => {
        setQueryKeyword(keyword.trim());
        setPage(1);
    };

    const rebuild = async () => {
        setRebuilding(true);
        setRebuildError('');
        try {
            const result = await scoreApi.rebuild({
                date: date || undefined,
                adjustFlag,
            });
            setDate(result.tradeDate || '');
            setQueryKeyword(keyword.trim());
            setPage(1);
            dates.reload();
            ranking.reload();
        } catch (error) {
            setRebuildError(error.message || '评分计算失败');
        } finally {
            setRebuilding(false);
        }
    };

    const resetOn = (setter) => (event) => {
        setter(event.target.value);
        setPage(1);
    };

    return (
        <div className="score-page">
            <div className="page-intro">
                <div>
                    <h1>量化评分排行</h1>
                    <p>价值、动量、趋势、风险和流动性五类因子综合评分，分数越高代表当前横截面相对表现越强。</p>
                </div>
                <span className="strategy-badge">多因子 · 0—100 分</span>
            </div>

            <Panel title="筛选条件">
                <div className="toolbar wrap">
                    <label className="field">评分日期
                        <select value={date} onChange={resetOn(setDate)} disabled={dates.loading}>
                            <option value="">最新评分日</option>
                            {(dates.data ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </label>
                    <label className="field">复权口径
                        <select value={adjustFlag} onChange={(e) => {
                            setAdjustFlag(Number(e.target.value));
                            setDate('');
                            setPage(1);
                        }}>
                            <option value={2}>前复权</option>
                            <option value={1}>后复权</option>
                            <option value={3}>不复权</option>
                        </select>
                    </label>
                    <input
                        value={keyword}
                        placeholder="代码 / 名称"
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    />
                    <label className="field">最低分
                        <select value={minScore} onChange={resetOn(setMinScore)}>
                            <option value="">不限</option>
                            <option value="70">70分以上</option>
                            <option value="60">60分以上</option>
                            <option value="50">50分以上</option>
                        </select>
                    </label>
                    <button type="button" onClick={runSearch}>查询</button>
                    <button type="button" className="score-rebuild" onClick={rebuild} disabled={rebuilding}>
                        {rebuilding ? '计算中…' : '实时计算评分'}
                    </button>
                    <button type="button" className="ghost" onClick={ranking.reload}>刷新</button>
                </div>
            </Panel>

            <ErrorBanner
                message={[dates.error, ranking.error, rebuildError].filter(Boolean).join('；')}
                onRetry={() => {
                    dates.reload();
                    ranking.reload();
                }}
            />

            <div className="stat-grid">
                <StatCard label="评分日期" value={scoreDate} hint="数据只使用该日期及之前记录"/>
                <StatCard label="当前结果" value={ranking.data ? `${ranking.data.total} 只` : '-'} hint="可分页查看完整排名"/>
                <StatCard label="当前页平均分" value={avgScore} hint="横截面百分位综合分"/>
                <StatCard label="复权口径" value={adjustFlag === 2 ? '前复权' : adjustFlag === 1 ? '后复权' : '不复权'} hint="价格因子保持一致"/>
            </div>

            <Panel title="综合评分榜">
                <div className="table-wrap score-table-wrap">
                    <table className="data-table score-table">
                        <thead>
                        <tr>
                            <th>排名</th>
                            <th>股票</th>
                            <th>综合分</th>
                            <th>因子分项</th>
                            <th>收盘</th>
                            <th>21日</th>
                            <th>63日</th>
                            <th>PE</th>
                            <th>PB</th>
                            <th>波动率</th>
                            <th>最大回撤</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((row) => (
                            <tr key={`${row.code}-${row.tradeDate}`} onClick={() => navigate(`/stocks/${row.code}`, { state: { from: window.location.pathname + window.location.search } })}>
                                <td className="rank-number">{row.rank}</td>
                                <td className="stock-cell">
                                    <strong>{row.code}</strong>
                                    <span>{row.name || '-'} · {row.industry || row.board || '-'}</span>
                                </td>
                                <td><span className={`score-pill ${scoreTone(row.totalScore)}`}>{formatNum(row.totalScore, 1)}</span></td>
                                <td className="factor-cell">
                                    <FactorBar label="价" value={row.valueScore}/>
                                    <FactorBar label="动" value={row.momentumScore}/>
                                    <FactorBar label="势" value={row.trendScore}/>
                                    <FactorBar label="险" value={row.riskScore}/>
                                    <FactorBar label="流" value={row.liquidityScore}/>
                                </td>
                                <td>{formatPrice(row.close)}</td>
                                <td className={pctClass(row.ret21)}>{returnText(row.ret21)}</td>
                                <td className={pctClass(row.ret63)}>{returnText(row.ret63)}</td>
                                <td>{row.peTtm == null ? '-' : formatNum(row.peTtm, 1)}</td>
                                <td>{row.pbMrq == null ? '-' : formatNum(row.pbMrq, 2)}</td>
                                <td>{row.vol60 == null ? '-' : `${(Number(row.vol60) * 100).toFixed(1)}%`}</td>
                                <td className="down">{row.drawdown252 == null ? '-' : `${(Number(row.drawdown252) * 100).toFixed(1)}%`}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {ranking.loading ? <div className="empty">加载中…</div> : null}
                    {!ranking.loading && !rows.length ? <div className="empty">暂无评分结果，请点击“实时计算评分”生成最新排行</div> : null}
                </div>
                {ranking.data ? <Pagination
                    page={ranking.data.page}
                    size={ranking.data.size}
                    total={ranking.data.total}
                    pages={ranking.data.pages}
                    onPage={setPage}
                    onSize={(value) => {
                        setSize(value);
                        setPage(1);
                    }}
                /> : null}
            </Panel>
        </div>
    );
}
