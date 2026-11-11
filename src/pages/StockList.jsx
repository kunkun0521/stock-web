import { usePersistedState } from '../hooks/usePersistedState.js';
import { useCurrentStock, useGlobalStockSync } from '../context/CurrentStockContext.jsx';
import { useNavigate } from 'react-router-dom';
import { stockApi } from '../api/stock.js';
import { useApi } from '../hooks/useApi.js';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import Pagination from '../components/Pagination.jsx';
import { marketLabel } from '../utils/format.js';

const SORT_FIELDS = [
    { value: 'code', label: '股票代码' },
    { value: 'name', label: '股票名称' },
    { value: 'ipoDate', label: '上市日期' },
    { value: 'industry', label: '所属行业' },
    { value: 'market', label: '市场' },
];

export default function StockList() {
    const navigate = useNavigate();
    const { stock: globalStock, adoptStock } = useCurrentStock();

    const [keyword, setKeyword] = usePersistedState('stocks:keyword', globalStock.code || '');
    const [query, setQuery] = usePersistedState('stocks:query', {});
    const [board, setBoard] = usePersistedState('stocks:board', '');
    const [industry, setIndustry] = usePersistedState('stocks:industry', '');
    const [exchange, setExchange] = usePersistedState('stocks:exchange', '');
    const [market, setMarket] = usePersistedState('stocks:market', '');
    const [listedOnly, setListedOnly] = usePersistedState('stocks:listedOnly', true);
    const [sort, setSort] = usePersistedState('stocks:sort', 'code');
    const [order, setOrder] = usePersistedState('stocks:order', 'asc');
    const [page, setPage] = usePersistedState('stocks:page', 1);
    const [size, setSize] = usePersistedState('stocks:size', 20);

    const filters = useApi(() => stockApi.filters(), []);
    const list = useApi(
        () => stockApi.list({
            keyword: query.keyword || undefined,
            market: market === '' ? undefined : Number(market),
            exchange: exchange || undefined,
            board: board || undefined,
            industry: industry || undefined,
            listedOnly: listedOnly || undefined,
            sort,
            order,
            page,
            size,
        }),
        [query, market, exchange, board, industry, listedOnly, sort, order, page, size]
    );

    // 全站当前股票变化时，输入框与已提交的查询条件一起跟随；用户可随时点顶栏「不限定股票」解除跟随
    useGlobalStockSync((s) => {
        setKeyword((prev) => (prev === s.code ? prev : s.code));
        setQuery((prev) => (prev.keyword === s.code ? prev : { ...prev, keyword: s.code }));
    });

    /** 输入 / 查询股票时即把它设为全站当前股票，其它页面无需重复输入 */
    const changeKeyword = (value) => {
        setKeyword(value);
        if (/^\d{6}$/.test(value.trim())) adoptStock(value.trim());
    };

    const runSearch = () => {
        const text = keyword.trim();
        setQuery({ ...query, keyword: text });
        setPage(1);
        if (text) adoptStock(text);
    };

    const resetPage = (fn) => (value) => {
        fn(value);
        setPage(1);
    };

    return (
        <Panel title="股票列表">
            <div className="toolbar wrap">
                <input
                    className="grow"
                    placeholder="按代码 / 名称搜索"
                    title="默认跟随顶栏的全站当前股票；清空后可查看全部"
                    value={keyword}
                    onChange={(e) => changeKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                />
                <button type="button" onClick={runSearch}>搜索</button>

                <label className="field">
                    板块
                    <select value={board} onChange={(e) => resetPage(setBoard)(e.target.value)}>
                        <option value="">全部</option>
                        {(filters.data?.boards ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                </label>

                <label className="field">
                    行业
                    <select value={industry} onChange={(e) => resetPage(setIndustry)(e.target.value)}>
                        <option value="">全部</option>
                        {(filters.data?.industries ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                </label>

                <label className="field">
                    交易所
                    <select value={exchange} onChange={(e) => resetPage(setExchange)(e.target.value)}>
                        <option value="">全部</option>
                        {(filters.data?.exchanges ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                </label>

                <label className="field">
                    市场
                    <select value={market} onChange={(e) => resetPage(setMarket)(e.target.value)}>
                        <option value="">全部</option>
                        <option value="1">上海</option>
                        <option value="0">深圳</option>
                    </select>
                </label>

                <label className="field">
                    排序
                    <select value={sort} onChange={(e) => resetPage(setSort)(e.target.value)}>
                        {SORT_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                </label>

                <label className="field">
                    <select value={order} onChange={(e) => resetPage(setOrder)(e.target.value)}>
                        <option value="asc">升序</option>
                        <option value="desc">降序</option>
                    </select>
                </label>

                <label className="checkbox">
                    <input type="checkbox" checked={listedOnly} onChange={(e) => resetPage(setListedOnly)(e.target.checked)}/>
                    仅未退市
                </label>
            </div>

            <ErrorBanner
                message={[list.error, filters.error].filter(Boolean).join('；')}
                onRetry={list.error ? list.reload : undefined}
            />

            <div className="table-wrap">
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>代码</th>
                        <th>名称</th>
                        <th>市场</th>
                        <th>交易所</th>
                        <th>板块</th>
                        <th>行业</th>
                        <th>上市日期</th>
                        <th>状态</th>
                    </tr>
                    </thead>
                    <tbody>
                    {(list.data?.items ?? []).map((s) => (
                        <tr key={s.code} onClick={() => navigate(`/stocks/${s.code}`, { state: { from: window.location.pathname + window.location.search } })}>
                            <td>{s.code}</td>
                            <td>{s.name}</td>
                            <td>{marketLabel(s.market)}</td>
                            <td>{s.exchange || '-'}</td>
                            <td>{s.board || '-'}</td>
                            <td>{s.industry || '-'}</td>
                            <td>{s.ipoDate || '-'}</td>
                            <td>{s.status === 1 ? '启用' : s.status === 0 ? '停用' : '-'}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                {list.loading ? <div className="empty">加载中…</div> : null}
                {!list.loading && list.data?.total === 0 ? <div className="empty">没有符合条件的股票</div> : null}
            </div>

            {list.data ? (
                <Pagination
                    page={list.data.page}
                    size={list.data.size}
                    total={list.data.total}
                    pages={list.data.pages}
                    onPage={setPage}
                    onSize={(v) => {
                        setSize(v);
                        setPage(1);
                    }}
                />
            ) : null}
        </Panel>
    );
}
