import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { scoreContinuityApi } from '../api/scoreContinuity.js';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { useCurrentStock } from '../context/CurrentStockContext.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import Panel from './Panel.jsx';
import Pagination from './Pagination.jsx';
import { formatNum, formatPrice } from '../utils/format.js';
import './scoreContinuity.css';

const DAY_OPTIONS = [3, 5, 7, 10, 15, 20];
const BAND_OPTIONS = [
    { key: '0-30', label: '0~30 分', min: 0, max: 30 },
    { key: '30-50', label: '30~50 分', min: 30, max: 50 },
    { key: '50-60', label: '50~60 分', min: 50, max: 60 },
    { key: '60-75', label: '60~75 分', min: 60, max: 75 },
    { key: '75-90', label: '75~90 分', min: 75, max: 90 },
    { key: '90+', label: '90 分以上', min: 90, max: null },
];

const scoreTone = (score) => Number(score) >= 70 ? 'score-high' : Number(score) >= 50 ? 'score-mid' : 'score-low';

/** 近 N 日评分走势：浅蓝色带是所选区间，折线是逐日综合分（纵轴固定 0—100）。 */
function Sparkline({ series, band, compact }) {
    const values = (series ?? []).map((item) => Number(item.score));
    if (!values.length) return <span className="muted">-</span>;
    const w = compact ? 104 : 130;
    const h = compact ? 24 : 30;
    const pad = 3;
    const y = (v) => h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - 2 * pad);
    const x = (i) => pad + (i * (w - 2 * pad)) / Math.max(values.length - 1, 1);
    const upper = band?.max ?? 100;
    const lower = band?.min ?? 0;
    const bandTop = y(upper);
    const bandBottom = y(lower);
    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return (
        <svg className="sc-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="连续区间内逐日评分走势">
            <rect x="0" y={bandTop} width={w} height={Math.max(1, bandBottom - bandTop)} fill="rgba(47,111,237,.12)"/>
            <polyline points={points} fill="none" stroke="#2f6fed" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"/>
            {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="1.7" fill="#2f6fed"/>)}
        </svg>
    );
}

/**
 * 连续评分区间筛选：独立于原有评分排行，只复用页面的复权口径与评分日期。
 * 一次请求返回全部「连续天数 × 分数区间」的命中数量矩阵和当前组合的明细。
 * 默认「紧凑视图」：口径/提示折叠、控件合并、明细固定高度内滚动，减少整页滚动；
 * 点「完整视图」可恢复全部展开的布局，切换状态随会话保持。
 */
export default function ScoreContinuityPanel({
    adjustFlag = 2,
    date = '',
    dateOptions = [],
    loadingDates = false,
    onDateChange,
    onAdjustFlagChange,
}) {
    const navigate = useNavigate();
    const { stock: globalStock } = useCurrentStock();
    const [days, setDays] = usePersistedState('scores:continuity:days', 3);
    const [band, setBand] = usePersistedState('scores:continuity:band', '60-75');
    const [keyword, setKeyword] = usePersistedState('scores:continuity:keyword', '');
    const [queryKeyword, setQueryKeyword] = usePersistedState('scores:continuity:queryKeyword', '');
    const [sort, setSort] = usePersistedState('scores:continuity:sort', 'latest');
    const [page, setPage] = usePersistedState('scores:continuity:page', 1);
    const [size, setSize] = usePersistedState('scores:continuity:size:v2', 10);
    const [matrixOpen, setMatrixOpen] = usePersistedState('scores:continuity:matrixOpen', true);
    const [compact, setCompact] = usePersistedState('scores:continuity:compact', true);
    const [noteOpen, setNoteOpen] = usePersistedState('scores:continuity:noteOpen', false);
    const [warnOpen, setWarnOpen] = usePersistedState('scores:continuity:warnOpen', false);
    const [tableOpen, setTableOpen] = usePersistedState('scores:continuity:tableOpen', false);

    const cacheKey = `scores:continuity:${date}:${adjustFlag}:${days}:${band}:${queryKeyword}:${sort}:${page}:${size}`;
    const state = useApi(() => scoreContinuityApi.query({
        date: date || undefined,
        adjustFlag,
        days,
        band,
        keyword: queryKeyword || undefined,
        sort,
        page,
        size,
    }), [date, adjustFlag, days, band, queryKeyword, sort, page, size], { cacheKey, ttlMs: 60 * 1000 });

    const data = state.data;
    const result = data?.result;
    const rows = result?.items ?? [];
    const warnings = data?.warnings ?? [];
    const bands = useMemo(() => {
        if (!data?.bands?.length) return BAND_OPTIONS;
        return data.bands.map((item) => ({
            key: item.key,
            label: item.label,
            min: item.min == null ? null : Number(item.min),
            max: item.max == null ? null : Number(item.max),
        }));
    }, [data]);
    const cells = useMemo(() => {
        const map = {};
        (data?.matrix ?? []).forEach((cell) => { map[`${cell.days}|${cell.band}`] = cell; });
        return map;
    }, [data]);
    const maxCount = useMemo(() => Math.max(1, ...(data?.matrix ?? []).map((cell) => Number(cell.count) || 0)), [data]);
    const currentBand = BAND_OPTIONS.find((item) => item.key === band) ?? BAND_OPTIONS[0];
    const sortLabel = { latest: '最新分', change: '区间提升', avg: '平均分', code: '代码' }[sort] ?? '最新分';
    const bandText = currentBand.max == null
        ? `${currentBand.min} 分及以上`
        : `${currentBand.min} ≤ 分数 < ${currentBand.max} 分`;
    const showFullNote = !compact || noteOpen;
    const showFullWarn = !compact || warnOpen;
    const tableCapped = compact && !tableOpen;

    const choose = (nextDays, nextBand) => {
        setDays(nextDays);
        setBand(nextBand);
        setPage(1);
    };
    const applyKeyword = () => {
        setQueryKeyword(keyword.trim());
        setPage(1);
    };
    const clearKeyword = () => {
        setKeyword('');
        setQueryKeyword('');
        setPage(1);
    };
    const onlyCurrentStock = () => {
        const code = globalStock?.code;
        if (!code) return;
        setKeyword(code);
        setQueryKeyword(code);
        setPage(1);
    };

    return (
        <Panel
            className={`sc-root${compact ? ' sc-compact' : ''}`}
            title="连续评分区间筛选"
            extra={
                <div className="sc-head-actions">
                    <button
                        type="button"
                        className="ghost"
                        title="紧凑视图折叠口径说明与数据提示，并限制明细表高度；完整视图恢复全部展开"
                        onClick={() => setCompact(!compact)}
                    >{compact ? '完整视图' : '紧凑视图'}</button>
                    <button type="button" className="ghost" onClick={() => setMatrixOpen(!matrixOpen)}>
                        {matrixOpen ? '收起矩阵' : '展开矩阵'}
                    </button>
                    <button type="button" className="ghost" onClick={state.reload} disabled={state.loading}>
                        {state.loading ? '统计中…' : '刷新'}
                    </button>
                </div>
            }
        >
            <div className="sc-note-row">
                <span className="sc-note-line">
                    最近 <b>{days}</b> 个评分交易日每日综合分均落在同一分数区间（当前 {bandText}）；任一天缺记录或跨档即排除。
                </span>
                {compact ? (
                    <button type="button" className="sc-link" onClick={() => setNoteOpen(!noteOpen)}>
                        {noteOpen ? '收起口径' : '口径说明'}
                    </button>
                ) : null}
            </div>
            {showFullNote ? (
                <p className="sc-note-full">
                    筛选出「最近 N 个有评分的交易日里，每天综合分都落在同一分数区间」的股票。区间左闭右开，
                    90 分以上不设上界；窗口内任一天缺少评分记录或跨出区间，即不算连续。
                    评分日期与复权口径和「量化评分排行」共享，可在本页直接调整。
                </p>
            ) : null}

            <div className="sc-controls">
                <div className="sc-chips-line">
                    <span className="sc-label">连续天数</span>
                    <div className="sc-chips">
                        {DAY_OPTIONS.map((option) => (
                            <button
                                key={option}
                                type="button"
                                className={days === option ? 'active' : ''}
                                onClick={() => choose(option, band)}
                            >{option} 天</button>
                        ))}
                    </div>
                    <i className="sc-divider" aria-hidden="true"/>
                    <span className="sc-label">分数区间</span>
                    <div className="sc-chips">
                        {bands.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                className={band === option.key ? 'active' : ''}
                                onClick={() => choose(days, option.key)}
                            >{option.label}</button>
                        ))}
                    </div>
                </div>
                <div className="sc-toolbar">
                    <input
                        className="sc-input"
                        value={keyword}
                        placeholder="代码 / 名称（可选，矩阵与明细同步过滤）"
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && applyKeyword()}
                    />
                    <button type="button" onClick={applyKeyword}>查找</button>
                    <button type="button" className="ghost" onClick={clearKeyword}>清空</button>
                    <button type="button" className="ghost" onClick={onlyCurrentStock} disabled={!globalStock?.code}
                            title={globalStock?.code ? `只看 ${globalStock.name || globalStock.code}` : '顶栏尚未设置当前股票'}>
                        只看当前股票
                    </button>
                    <label className="sc-select-label">评分日期
                        <select
                            value={date}
                            disabled={loadingDates}
                            onChange={(e) => {
                                onDateChange?.(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">最新评分日</option>
                            {(dateOptions ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </label>
                    <label className="sc-select-label">复权口径
                        <select
                            value={adjustFlag}
                            onChange={(e) => {
                                onAdjustFlagChange?.(Number(e.target.value));
                                setPage(1);
                            }}
                        >
                            <option value={2}>前复权</option>
                            <option value={1}>后复权</option>
                            <option value={3}>不复权</option>
                        </select>
                    </label>
                    <label className="sc-select-label">排序
                        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                            <option value="latest">最新分从高到低</option>
                            <option value="change">区间内提升最多</option>
                            <option value="avg">平均分从高到低</option>
                            <option value="code">按代码升序</option>
                        </select>
                    </label>
                </div>
            </div>

            <ErrorBanner message={state.error} onRetry={state.reload}/>
            {state.error ? (
                <div className="sc-warn">
                    若提示 404 或「接口不存在」，说明后端尚未加载新增的连续评分接口，请重启 Spring Boot 服务后刷新页面。
                </div>
            ) : null}

            {warnings.length ? (showFullWarn ? (
                <div className="sc-warn">
                    {warnings.map((warning, index) => <div key={index}>{warning}</div>)}
                    {compact ? <button type="button" className="sc-link" onClick={() => setWarnOpen(false)}>收起提示</button> : null}
                </div>
            ) : (
                <div className="sc-warn-peek">
                    <span className="sc-warn-text">⚠ {warnings.length} 条数据提示：{warnings[0]}</span>
                    <button type="button" className="sc-link" onClick={() => setWarnOpen(true)}>展开</button>
                </div>
            )) : null}

            {matrixOpen ? (
                <div className="sc-matrix-wrap">
                    <div className="sc-matrix-title">命中数量矩阵 <span className="muted">点格子切换组合 · 颜色越深命中越多 · 灰格表示交易日不足</span></div>
                    <table className="sc-matrix">
                        <thead>
                        <tr>
                            <th>连续天数 \ 分数区间</th>
                            {bands.map((option) => <th key={option.key}>{option.label}</th>)}
                        </tr>
                        </thead>
                        <tbody>
                        {DAY_OPTIONS.map((option) => (
                            <tr key={option}>
                                <th>连续 {option} 天</th>
                                {bands.map((item) => {
                                    const cell = cells[`${option}|${item.key}`];
                                    const available = cell?.available ?? option <= (data?.availableDays ?? 0);
                                    const count = Number(cell?.count ?? 0);
                                    const active = days === option && band === item.key;
                                    const alpha = count ? (0.08 + 0.42 * Math.sqrt(count / maxCount)).toFixed(3) : 0;
                                    return (
                                        <td key={item.key}>
                                            <button
                                                type="button"
                                                className={`sc-cell${active ? ' active' : ''}${available ? '' : ' disabled'}`}
                                                style={active || !available ? undefined : { backgroundColor: `rgba(47,111,237,${alpha})` }}
                                                disabled={!available}
                                                title={available ? `连续 ${option} 天 · ${item.label}：${count} 只` : '评分交易日不足，暂无法判断'}
                                                onClick={() => choose(option, item.key)}
                                            >{available ? count : '—'}</button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            ) : null}

            <div className="sc-result-head">
                <div className="sc-result-title">
                    命中明细 <span className="muted">连续 {days} 天 · {currentBand.label} · 按{sortLabel}排序</span>
                </div>
                <div className="sc-inline-stats">
                    <span>截止 <b>{data?.asOfDate ?? '-'}</b></span>
                    <span>可用 <b>{data?.availableDays ?? 0} 天</b></span>
                    <span>样本 <b>{data?.universeSize ?? 0} 只</b></span>
                    <span className="sc-hit">命中 <b>{result?.total ?? 0} 只</b></span>
                </div>
                {compact ? (
                    <button type="button" className="sc-link" onClick={() => setTableOpen(!tableOpen)}>
                        {tableOpen ? '收起明细' : '展开明细'}
                    </button>
                ) : null}
            </div>

            <div className={`table-wrap sc-table-wrap${tableCapped ? ' sc-table-capped' : ''}`}>
                <table className="data-table sc-table">
                    <thead>
                    <tr>
                        <th>股票</th>
                        <th>最新分</th>
                        <th>区间最低</th>
                        <th>区间最高</th>
                        <th>平均分</th>
                        <th>首末变化</th>
                        <th>评分走势</th>
                        <th>连续区间</th>
                        <th>最新收盘</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((row) => (
                        <tr
                            key={`${row.code}-${row.days}-${row.band}`}
                            onClick={() => navigate(`/stocks/${row.code}`, { state: { from: window.location.pathname + window.location.search } })}
                        >
                            <td className="stock-cell">
                                <strong>{row.code}</strong>
                                <span>{row.name || '-'} · {row.industry || row.board || '-'}</span>
                            </td>
                            <td><span className={`score-pill ${scoreTone(row.latestScore)}`}>{formatNum(row.latestScore, 1)}</span></td>
                            <td>{formatNum(row.minScore, 1)}</td>
                            <td>{formatNum(row.maxScore, 1)}</td>
                            <td>{formatNum(row.avgScore, 1)}</td>
                            <td className={Number(row.scoreChange) > 0 ? 'up' : Number(row.scoreChange) < 0 ? 'down' : ''}>
                                {row.scoreChange == null ? '-' : `${Number(row.scoreChange) > 0 ? '+' : ''}${formatNum(row.scoreChange, 2)}`}
                            </td>
                            <td><Sparkline series={row.series} band={currentBand} compact={compact}/></td>
                            <td className="sc-range">{row.days} 天<span>{row.startDate} ~ {row.endDate}</span></td>
                            <td>{formatPrice(row.latestClose)}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                {state.loading ? <div className="empty">统计中…</div> : null}
                {!state.loading && !rows.length ? (
                    <div className="empty">当前组合没有符合条件的股票，可切换天数 / 区间，或查看上方矩阵中的其它组合</div>
                ) : null}
            </div>
            {result ? <Pagination
                page={result.page}
                size={result.size}
                total={result.total}
                pages={result.pages}
                sizes={[10, 20, 50]}
                onPage={setPage}
                onSize={(value) => { setSize(value); setPage(1); }}
            /> : null}
        </Panel>
    );
}
