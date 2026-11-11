import { useEffect, useMemo, useState } from 'react';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { useCurrentStock, useGlobalStockSync } from '../context/CurrentStockContext.jsx';
import { shortTermHistoryApi } from '../api/shortTermHistory.js';
import { useApi } from '../hooks/useApi.js';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import Pagination from '../components/Pagination.jsx';
import StatCard from '../components/StatCard.jsx';
import { formatNum, pctClass } from '../utils/format.js';

const horizons = [
    { days: 5, label: '5日' },
    { days: 10, label: '10日' },
    { days: 15, label: '15日' },
    { days: 20, label: '20日 / 1月' },
];

const percent = (value, digits = 1) => {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(value) * 100;
    return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
};

const dateText = (value) => {
    if (!value) return '';
    const parts = String(value).split('-');
    return parts.length === 3 ? `${parts[0]}年${parts[1]}月${parts[2]}日` : String(value);
};

/** 预测日之后的第 N 个工作日；实际行情回填后会优先使用真实交易日期。 */
const nextTradingDate = (baseDate, horizonDays) => {
    if (!baseDate || !horizonDays) return '';
    const date = new Date(`${baseDate}T00:00:00`);
    let remaining = Number(horizonDays);
    while (remaining > 0) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay();
        if (day !== 0 && day !== 6) remaining -= 1;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const scoreTone = (score) => Number(score) >= 70 ? 'score-high' : Number(score) >= 50 ? 'score-mid' : 'score-low';

const sortLabels = {
    score20: '20日综合得分',
    predictedCum5: '5日累计预测',
    predictedCum10: '10日累计预测',
    predictedCum15: '15日累计预测',
    predictedCum20: '20日累计预测',
};

function ForecastCell({ expected, probability }) {
    return (
        <div className="forecast-cell">
            <strong className={pctClass(expected)}>{percent(expected)}</strong>
            {probability !== null && probability !== undefined ? <span>达15% {percent(probability, 0)}</span> : null}
        </div>
    );
}

function StatusText({ status }) {
    return <span className={`forecast-status ${status === 'complete' ? 'complete' : 'pending'}`}>
        {status === 'complete' ? '已评估' : '待发生'}
    </span>;
}

export default function ShortTermForecast() {
    const { stock: globalStock, adoptStock } = useCurrentStock();
    const [adjustFlag, setAdjustFlag] = usePersistedState('short-term:adjustFlag', 2);
    const [date, setDate] = usePersistedState('short-term:date', '');
    const [keyword, setKeyword] = usePersistedState('short-term:keyword', globalStock.code || '');
    const [queryKeyword, setQueryKeyword] = usePersistedState('short-term:queryKeyword', globalStock.code || '');
    const [minProbability, setMinProbability] = usePersistedState('short-term:minProbability', '');
    const [sortBy, setSortBy] = usePersistedState('short-term:sortBy', 'score20');
    const [sortDirection, setSortDirection] = usePersistedState('short-term:sortDirection', 'desc');
    const [runId, setRunId] = usePersistedState('short-term:runId', '');
    const [selectedCode, setSelectedCode] = usePersistedState('short-term:selectedCode', '');
    const [page, setPage] = usePersistedState('short-term:page', 1);
    const [size, setSize] = usePersistedState('short-term:size', 50);
    const [rebuilding, setRebuilding] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [actionMessage, setActionMessage] = useState('');
    const [actionError, setActionError] = useState('');

    const dates = useApi(() => shortTermHistoryApi.sourceDates(adjustFlag), [adjustFlag]);
    const runs = useApi(() => shortTermHistoryApi.runs(adjustFlag), [adjustFlag]);
    const summary = useApi(() => runId
        ? shortTermHistoryApi.summary(runId, {
            keyword: queryKeyword || undefined,
            minProbability: minProbability || undefined,
            sortBy,
            sortDirection,
            page,
            size,
        })
        : Promise.resolve({ items: [], total: 0, page: 1, size, pages: 0 }),
    [runId, queryKeyword, minProbability, sortBy, sortDirection, page, size]);
    const daily = useApi(() => runId && selectedCode
        ? shortTermHistoryApi.daily(runId, selectedCode)
        : Promise.resolve([]), [runId, selectedCode]);

    const rows = summary.data?.items ?? [];
    const selectedRun = (runs.data ?? []).find((item) => String(item.id) === String(runId));
    const top = rows[0];
    const avgScore = useMemo(() => rows.length
        ? (rows.reduce((sum, row) => sum + Number(row.score20 || 0), 0) / rows.length).toFixed(1)
        : '-', [rows]);

    useEffect(() => {
        const available = runs.data ?? [];
        if (!available.length) {
            setRunId('');
            return;
        }
        if (!runId || !available.some((item) => String(item.id) === String(runId))) {
            setRunId(String(available[0].id));
            setPage(1);
        }
    }, [runs.data, runId]);

    useEffect(() => {
        if (!rows.length) {
            setSelectedCode('');
            return;
        }
        if (!selectedCode || !rows.some((row) => row.code === selectedCode)) {
            setSelectedCode(rows[0].code);
        }
    }, [rows, selectedCode]);

    // 全站当前股票变化时，筛选条件与逐日明细选中的股票一起跟随
    useGlobalStockSync((s) => {
        setKeyword((prev) => (prev === s.code ? prev : s.code));
        setQueryKeyword((prev) => (prev === s.code ? prev : s.code));
        setSelectedCode((prev) => (prev === s.code ? prev : s.code));
    });

    const changeKeyword = (value) => {
        setKeyword(value);
        if (/^\d{6}$/.test(value.trim())) adoptStock(value.trim());
    };

    const runSearch = () => {
        const text = keyword.trim();
        setQueryKeyword(text);
        setPage(1);
        if (text) adoptStock(text);
    };

    const changeSort = (field) => {
        if (sortBy === field) {
            setSortDirection((direction) => direction === 'desc' ? 'asc' : 'desc');
        } else {
            setSortBy(field);
            setSortDirection('desc');
        }
        setPage(1);
    };

    const sortableHeader = (field, label) => (
        <th key={field}>
            <button
                type="button"
                className={`table-sort-button ${sortBy === field ? 'active' : ''}`}
                onClick={() => changeSort(field)}
                title={`按${label}${sortBy === field && sortDirection === 'desc' ? '升序' : '降序'}排列`}
            >
                <span>{label}</span>
                <span className="sort-arrow">{sortBy === field ? (sortDirection === 'desc' ? '▼' : '▲') : '↕'}</span>
            </button>
        </th>
    );

    const rebuild = async () => {
        setRebuilding(true);
        setActionError('');
        setActionMessage('');
        try {
            const result = await shortTermHistoryApi.rebuild({ date: date || undefined, adjustFlag });
            setRunId(String(result.runId));
            setDate(result.forecastDate || date);
            setPage(1);
            setSelectedCode('');
            setActionMessage(`已生成批次 #${result.runId}，保存 ${result.savedRows} 条逐日预测。`);
            runs.reload();
        } catch (error) {
            setActionError(error.message || '短期预测计算失败');
        } finally {
            setRebuilding(false);
        }
    };

    const evaluate = async () => {
        if (!runId) return;
        setEvaluating(true);
        setActionError('');
        setActionMessage('');
        try {
            const result = await shortTermHistoryApi.evaluate(runId);
            setActionMessage(`已更新 ${result.updatedRows} 条记录：${result.completeRows} 条已评估，${result.pendingRows} 条等待未来行情。`);
            summary.reload();
            daily.reload();
        } catch (error) {
            setActionError(error.message || '实际收益评估失败');
        } finally {
            setEvaluating(false);
        }
    };

    const reloadAll = () => {
        runs.reload();
        summary.reload();
        daily.reload();
    };

    return (
        <div className="score-page">
            <div className="page-intro">
                <div>
                    <h1>短期持有预测</h1>
                    <p>每次生成都会保存一个预测批次，并逐日预测未来 1～20 个交易日；新行情入库后可回填实际结果。</p>
                </div>
                <span className="strategy-badge forecast-badge">目标：预估 +15% 概率</span>
            </div>

            <Panel title="预测批次与条件">
                <div className="toolbar wrap">
                    <label className="field">历史批次
                        <select value={runId} onChange={(e) => {
                            setRunId(e.target.value);
                            setSelectedCode('');
                            setPage(1);
                            setActionMessage('');
                        }} disabled={runs.loading || !(runs.data ?? []).length}>
                            {!(runs.data ?? []).length ? <option value="">暂无预测批次</option> : null}
                            {(runs.data ?? []).map((item) => (
                                <option key={item.id} value={item.id}>
                                    #{item.id} · {item.forecastDate} · {item.stockCount}只
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="field">生成日期
                        <select value={date} onChange={(e) => setDate(e.target.value)} disabled={dates.loading}>
                            <option value="">最新交易日</option>
                            {(dates.data ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </label>
                    <label className="field">复权口径
                        <select value={adjustFlag} onChange={(e) => {
                            setAdjustFlag(Number(e.target.value));
                            setRunId('');
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
                        title="默认跟随顶栏的全站当前股票；清空后可查看完整排行"
                        onChange={(e) => changeKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    />
                    <label className="field">20日达15%概率
                        <select value={minProbability} onChange={(e) => {
                            setMinProbability(e.target.value);
                            setPage(1);
                        }}>
                            <option value="">不限</option>
                            <option value="0.05">≥ 5%</option>
                            <option value="0.10">≥ 10%</option>
                            <option value="0.15">≥ 15%</option>
                        </select>
                    </label>
                    <button type="button" onClick={runSearch}>查询</button>
                    <button type="button" className="score-rebuild" onClick={rebuild} disabled={rebuilding}>
                        {rebuilding ? '生成中…' : '生成一批逐日预测'}
                    </button>
                    <button type="button" className="ghost" onClick={evaluate} disabled={!runId || evaluating}>
                        {evaluating ? '评估中…' : '更新实际结果'}
                    </button>
                    <button type="button" className="ghost" onClick={reloadAll}>刷新</button>
                </div>
                {selectedRun ? (
                    <div className="forecast-run-meta">
                        当前批次 #{selectedRun.id} · 预测日 {selectedRun.forecastDate} · 数据截止 {selectedRun.sourceLatestDate}
                        · 模型 {selectedRun.modelVersion} · {selectedRun.stockCount} 只股票
                    </div>
                ) : null}
            </Panel>

            <ErrorBanner
                message={[dates.error, runs.error, summary.error, daily.error, actionError].filter(Boolean).join('；')}
                onRetry={reloadAll}
            />
            {actionMessage ? <div className="forecast-success">{actionMessage}</div> : null}

            <div className="stat-grid">
                <StatCard label="预测批次" value={selectedRun ? `#${selectedRun.id}` : '-'} hint={selectedRun?.forecastDate || '先生成一批预测'}/>
                <StatCard label="可预测股票" value={summary.data ? `${summary.data.total} 只` : '-'} hint="已过滤停牌、ST和历史数据不足"/>
                <StatCard label="当前页平均分" value={avgScore} hint="20日综合分：收益、概率、置信度"/>
                <StatCard label="榜首20日预测" value={top ? percent(top.predictedCum20) : '-'} hint={top ? `达15%概率 ${percent(top.probability20, 0)}` : '历史相似样本估计'}/>
            </div>

            <Panel title="预测股票排行">
                <div className="forecast-note">
                    当前按“{sortLabels[sortBy]}”{sortDirection === 'desc' ? '降序' : '升序'}排列。点击表头的排序箭头可切换指标和方向。预测日收益是第 N 个交易日的单日变化，累计预测是从预测日到第 N 日的复合收益；实际数据入库后点击“更新实际结果”即可观察误差。
                </div>
                <div className="table-wrap score-table-wrap">
                    <table className="data-table score-table forecast-table">
                        <thead>
                        <tr>
                            <th>排名</th><th>股票</th>
                            {sortableHeader('score20', '20日综合得分')}
                            {horizons.map((item) => sortableHeader(`predictedCum${item.days}`, `${item.label}累计预测`))}
                            <th>20日实际 / 误差</th><th>状态</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((row) => (
                            <tr key={`${row.code}-${row.runId}`} className={selectedCode === row.code ? 'selected-row' : ''}
                                onClick={() => setSelectedCode(row.code)}>
                                <td className="rank-number">{row.rank}</td>
                                <td className="stock-cell"><strong>{row.code}</strong><span>{row.name || '-'} · {row.industry || row.board || '-'}</span></td>
                                <td><span className={`score-pill ${scoreTone(row.score20)}`}>{formatNum(row.score20, 1)}</span></td>
                                <td><ForecastCell expected={row.predictedCum5} probability={null}/></td>
                                <td><ForecastCell expected={row.predictedCum10} probability={null}/></td>
                                <td><ForecastCell expected={row.predictedCum15} probability={null}/></td>
                                <td><ForecastCell expected={row.predictedCum20} probability={row.probability20}/></td>
                                <td className="actual-cell"><strong className={pctClass(row.actualCum20)}>{percent(row.actualCum20)}</strong><span className={pctClass(row.error20)}>误差 {percent(row.error20)}</span></td>
                                <td><StatusText status={row.status20}/></td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {summary.loading ? <div className="empty">加载中…</div> : null}
                    {!summary.loading && !rows.length ? <div className="empty">暂无预测结果，请点击“生成一批逐日预测”</div> : null}
                </div>
                {summary.data ? <Pagination page={summary.data.page} size={summary.data.size} total={summary.data.total} pages={summary.data.pages} onPage={setPage} onSize={(value) => { setSize(value); setPage(1); }}/> : null}
            </Panel>

            <Panel title={`逐日预测明细${selectedCode ? ` · ${selectedCode}` : ''}`}>
                <div className="forecast-note">逐日预测把一个月拆成 20 个交易日。新行情尚未发生的目标日显示“待发生”，发生后会显示实际单日收益、实际累计收益和预测误差。</div>
                <div className="table-wrap daily-forecast-wrap">
                    <table className="data-table daily-forecast-table">
                        <thead><tr><th>目标日期</th><th>预测日收益</th><th>累计预测</th><th>达15%概率</th><th>置信度</th><th>综合分</th><th>实际日收益</th><th>实际累计</th><th>误差</th><th>状态</th></tr></thead>
                        <tbody>
                        {(daily.data ?? []).map((item) => (
                            <tr key={`${item.code}-${item.horizonDays}`}>
                                <td>{dateText(item.actualTargetDate || nextTradingDate(item.forecastDate, item.horizonDays))}</td>
                                <td className={pctClass(item.predictedDailyReturn)}>{percent(item.predictedDailyReturn, 2)}</td>
                                <td className={pctClass(item.predictedCumulativeReturn)}>{percent(item.predictedCumulativeReturn)}</td>
                                <td>{percent(item.target15Probability, 0)}</td><td>{percent(item.confidence, 0)}</td>
                                <td><span className={`score-pill ${scoreTone(item.forecastScore)}`}>{formatNum(item.forecastScore, 1)}</span></td>
                                <td className={pctClass(item.actualDailyReturn)}>{percent(item.actualDailyReturn, 2)}</td><td className={pctClass(item.actualCumulativeReturn)}>{percent(item.actualCumulativeReturn)}</td><td className={pctClass(item.predictionError)}>{percent(item.predictionError)}</td><td><StatusText status={item.evaluationStatus}/></td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {daily.loading ? <div className="empty">加载中…</div> : null}
                    {!daily.loading && !selectedCode ? <div className="empty">点击上方排行中的股票查看 1～20 日预测路径</div> : null}
                    {!daily.loading && selectedCode && !(daily.data ?? []).length ? <div className="empty">暂无该股票的逐日预测</div> : null}
                </div>
            </Panel>

            <Panel title="指标说明">
                <div className="metric-explain-grid">
                    <div><strong>预测日收益</strong><span>预测从第 N-1 个交易日到第 N 个交易日的单日涨跌幅，适合观察每天的方向和节奏。</span></div>
                    <div><strong>累计预测收益</strong><span>把第 1～N 日预测日收益复合起来，表示持有到第 N 个交易日的整体预估涨跌幅。</span></div>
                    <div><strong>达 15% 概率</strong><span>历史相似走势中，到对应目标日累计收益达到至少 15% 的加权比例，不是收益承诺。</span></div>
                    <div><strong>置信度</strong><span>同时考虑相似历史样本数量和相似程度；样本越多、距离越近，置信度越高。</span></div>
                    <div><strong>综合分</strong><span>累计预估收益 55%、达 15% 概率 35%、置信度 10%，用于同一批次内排序。</span></div>
                    <div><strong>实际误差</strong><span>实际累计收益减去预测累计收益；正值表示实际比预测更好，负值表示预测偏乐观。</span></div>
                    <div><strong>历史相似样本</strong><span>用 5/10/20 日收益、20 日均线趋势和成交额状态匹配过去的市场形态，并按距离加权。</span></div>
                    <div><strong>评估状态</strong><span>“待发生”表示未来目标日还没有行情；“已评估”表示实际交易数据已经回填。</span></div>
                </div>
                <div className="forecast-warning">风险提示：这是基于历史相似形态的统计模型，不能保证未来涨幅达到 15%。使用前应结合流动性、公告、行业和个人风险承受能力，并以回测和持续评估为准。</div>
            </Panel>
        </div>
    );
}
