import { useEffect } from 'react';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { useCurrentStock } from '../context/CurrentStockContext.jsx';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { stockApi } from '../api/stock.js';
import { useApi } from '../hooks/useApi.js';
import EChart from '../components/EChart.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import Pagination from '../components/Pagination.jsx';
import StatCard from '../components/StatCard.jsx';
import Tabs from '../components/Tabs.jsx';
import { klineOption } from '../charts/options.js';
import { formatAmount, formatNum, formatPct, formatPrice, formatVolume, pctClass } from '../utils/format.js';

const PERIOD_TABS = [
    { value: 'day', label: '日线' },
    { value: 'week', label: '周线' },
    { value: 'month', label: '月线' },
];

/** 返回按钮文案：按"从哪个页面进来"给出明确去处 */
const BACK_LABEL = {
    '/': '返回市场看板',
    '/stocks': '返回股票列表',
    '/scores': '返回量化评分',
    '/forecast': '返回模型预测',
    '/short-term': '返回短线预测',
    '/t-trading': '返回做T模型',
    '/data-crawler': '返回数据同步',
};

function Metric({ label, value, tone = '' }) {
    return (
        <div className="metric">
            <span className="metric-label">{label}</span>
            <span className={`metric-value ${tone}`}>{value}</span>
        </div>
    );
}

export default function StockDetail() {
    const { code } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { setCurrentStock } = useCurrentStock();
    const [period, setPeriod] = usePersistedState(`stock-detail:${code}:period`, 'day');
    const [page, setPage] = usePersistedState(`stock-detail:${code}:page`, 1);
    const size = 20;

    // 跳转来源由列表页通过 location.state.from 传入；back 是来源页的筛选状态，返回时原样带回
    const from = typeof location.state?.from === 'string' ? location.state.from : '';
    const restore = location.state?.back;
    const hasHistory = Number(window.history.state?.idx ?? 0) > 0;
    const backLabel = from
        ? (BACK_LABEL[from.split('?')[0]] ?? '返回上一页')
        : (hasHistory ? '返回上一页' : '返回股票列表');

    const handleBack = (e) => {
        e.preventDefault();
        if (from) {
            navigate(from, { state: restore ? { restore } : undefined });
        } else if (hasHistory) {
            navigate(-1);
        } else {
            navigate('/stocks');  // 直接打开/刷新详情页时无来源，兜底到列表
        }
    };

    const quote = useApi(() => stockApi.quote(code), [code]);
    const kline = useApi(() => stockApi.kline(code, { period, limit: 300 }), [code, period]);
    const stats = useApi(() => stockApi.stats(code), [code]);
    const range = useApi(() => stockApi.dataRange(code), [code]);
    const daily = useApi(() => stockApi.daily(code, { page, size }), [code, page]);

    // 行情名称回填到全站当前股票，顶栏与各页面输入框就能显示中文名
    useEffect(() => {
        if (quote.data?.name) setCurrentStock({ code, name: quote.data.name });
    }, [code, quote.data?.name, setCurrentStock]);

    const q = quote.data;
    const st = stats.data;
    const failed = [quote, kline, stats, daily, range].filter((r) => r.error);

    return (
        <>
            <ErrorBanner
                message={failed.map((r) => r.error).join('；')}
                onRetry={failed.length ? () => failed.forEach((r) => r.reload()) : undefined}
            />

            <div className="detail-head">
                <div>
                    <a href={from || '/stocks'} className="back-link" onClick={handleBack}>← {backLabel}</a>
                    <h2 className="detail-title">
                        {quote.data?.name || code} <span className="code-tag">{code}</span>
                    </h2>
                    <div className="tags">
                        {q?.board ? <span className="tag">{q.board}</span> : null}
                        {q?.industry ? <span className="tag">{q.industry}</span> : null}
                        {q?.tradeDate ? <span className="tag">{q.tradeDate}</span> : null}
                        {q?.isSt === 1 ? <span className="tag warn">ST</span> : null}
                        {q?.tradeStatus === 0 ? <span className="tag warn">停牌</span> : null}
                    </div>
                </div>
                {q?.close != null ? (
                    <div className="detail-price">
                        <div className={`big ${pctClass(q.pctChg)}`}>{formatPrice(q.close)}</div>
                        <div className={`big-sub ${pctClass(q.pctChg)}`}>
                            {q.chgAmt == null ? '' : `${q.chgAmt > 0 ? '+' : ''}${formatNum(q.chgAmt)} `}
                            {formatPct(q.pctChg)}
                        </div>
                    </div>
                ) : null}
            </div>

            {!quote.loading && !quote.error && q?.close == null ? (
                <div className="panel muted">该股票暂无行情数据，可先运行数据同步任务导入对应行情分表。</div>
            ) : null}

            {q?.close != null ? (
                <div className="metric-grid">
                    <Metric label="今开" value={formatPrice(q.open)}/>
                    <Metric label="最高" value={formatPrice(q.high)} tone="up"/>
                    <Metric label="最低" value={formatPrice(q.low)} tone="down"/>
                    <Metric label="昨收" value={formatPrice(q.preclose)}/>
                    <Metric label="成交量" value={formatVolume(q.volume)}/>
                    <Metric label="成交额" value={formatAmount(q.amount)}/>
                    <Metric label="换手率" value={q.turnover == null ? '-' : `${formatNum(q.turnover)}%`}/>
                    <Metric label="振幅" value={q.amplitude == null ? '-' : `${formatNum(q.amplitude)}%`}/>
                    <Metric label="PE(TTM)" value={q.peTtm == null ? '-' : formatNum(q.peTtm, 2)}/>
                    <Metric label="PB" value={q.pbMrq == null ? '-' : formatNum(q.pbMrq, 2)}/>
                </div>
            ) : null}

            <Panel
                title={`K 线走势${kline.data ? `（${kline.data.startDate} ~ ${kline.data.endDate}，${kline.data.count} 根，复权 ${kline.data.adjustFlag ?? '-'}）` : ''}`}
                extra={<Tabs items={PERIOD_TABS} value={period} onChange={setPeriod}/>}
            >
                <EChart
                    height={460}
                    option={klineOption(kline.data)}
                    loading={kline.loading}
                    empty={!kline.loading && !kline.data?.count}
                    emptyText="该股票暂无行情，请先导入对应行情分表"
                />
            </Panel>

            <div className="stat-grid">
                <StatCard label="区间涨跌幅" value={st ? formatPct(st.returnPct) : '-'} tone={st ? pctClass(st.returnPct) : 'plain'}
                          hint={st ? `${st.startDate} ~ ${st.endDate}` : ''}/>
                <StatCard label="最高收盘" value={st ? formatPrice(st.highestClose) : '-'} hint={st?.highestCloseDate || ''}/>
                <StatCard label="最低收盘" value={st ? formatPrice(st.lowestClose) : '-'} hint={st?.lowestCloseDate || ''}/>
                <StatCard label="年化波动率" value={st?.annualizedVolatility == null ? '-' : `${formatNum(st.annualizedVolatility)}%`}
                          hint={`${st?.tradingDays ?? '-'} 个交易日`}/>
                <StatCard label="日均成交额" value={st ? formatAmount(st.avgAmount) : '-'}/>
                <StatCard label="日均换手率" value={st?.avgTurnover == null ? '-' : `${formatNum(st.avgTurnover)}%`}/>
            </div>

            <Panel title="日线明细">
                <div className="table-wrap">
                    <table className="data-table">
                        <thead>
                        <tr>
                            <th>日期</th>
                            <th>开盘</th>
                            <th>最高</th>
                            <th>最低</th>
                            <th>收盘</th>
                            <th>涨跌额</th>
                            <th>涨跌幅</th>
                            <th>成交量</th>
                            <th>成交额</th>
                            <th>换手率</th>
                            <th>复权</th>
                        </tr>
                        </thead>
                        <tbody>
                        {(daily.data?.items ?? []).map((d) => (
                            <tr key={`${d.tradeDate}-${d.adjustFlag}`}>
                                <td>{d.tradeDate}</td>
                                <td>{formatPrice(d.open)}</td>
                                <td className="up">{formatPrice(d.high)}</td>
                                <td className="down">{formatPrice(d.low)}</td>
                                <td>{formatPrice(d.close)}</td>
                                <td className={pctClass(d.chgAmt)}>{d.chgAmt == null ? '-' : formatNum(d.chgAmt)}</td>
                                <td className={pctClass(d.pctChg)}>{formatPct(d.pctChg)}</td>
                                <td>{formatVolume(d.volume)}</td>
                                <td>{formatAmount(d.amount)}</td>
                                <td>{d.turnover == null ? '-' : `${formatNum(d.turnover)}%`}</td>
                                <td>{d.adjustFlag ?? '-'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {daily.loading ? <div className="empty">加载中…</div> : null}
                    {!daily.loading && daily.data?.total === 0 ? <div className="empty">暂无日线数据</div> : null}
                </div>
                {daily.data ? (
                    <Pagination
                        page={daily.data.page}
                        size={size}
                        total={daily.data.total}
                        pages={daily.data.pages}
                        onPage={setPage}
                    />
                ) : null}
                {range.data ? (
                    <p className="muted small">
                        数据覆盖：{range.data.firstDate ?? '-'} ~ {range.data.lastDate ?? '-'} ·
                        交易日 {range.data.tradingDays} · 记录 {range.data.rowCount} 行 ·
                        复权口径 {range.data.adjustFlags || '-'} · 来源 {range.data.dataSources || '-'}
                    </p>
                ) : null}
            </Panel>
        </>
    );
}
