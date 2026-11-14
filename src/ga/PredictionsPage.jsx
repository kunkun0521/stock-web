import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getPredictions, exportPredictionsUrl } from './api.js';
import {
    GA_BASE, HORIZON_OPTIONS, BOARD_OPTIONS, DIRECTION_OPTIONS, RESULT_OPTIONS,
    INPOOL_OPTIONS, SORT_OPTIONS, asArray, asObject, fmtRate, fmtInt, fmtText,
    formatPct, dirLabel, dirTone, marketOf,
} from './gaUtils.js';
import Term from './GlossaryTerm.jsx';
import { isVerified, isCorrect } from './kline.js';
import {
    Card, FilterBar, Field, Select, Input, AsyncPanel, Pager, Badge, Tag, Empty, RefreshBtn,
} from './GaParts.jsx';

const DEFAULT_FILTERS = {
    from: '', to: '', horizon: '', direction: '', result: '', board: '',
    minConf: '', maxConf: '', inPool: '', sort: 'tradeDate,desc', page: 1, size: 20,
};

/** 结果徽标：优先用 isCorrect，缺失时从 status 文本推断，再不行视为待验证。 */
function resultInfo(row) {
    const status = String(row?.status ?? '');
    // is_correct 是 MySQL tinyint，JDBC 返回 1/0 而不是布尔；统一走 kline.js 的兼容判断，
    // 否则所有行都会被误显示成「待验证」。
    if (isVerified(row)) {
        return isCorrect(row)
            ? { tone: 'accent', text: '✓ 命中' }
            : { tone: 'up', text: '✗ 未命中' };
    }
    if (/void|失效/i.test(status)) return { tone: 'muted', text: '已失效' };
    if (/win|correct|hit|right|命中/i.test(status)) return { tone: 'accent', text: '✓ 命中' };
    if (/lose|wrong|miss|error|未中/i.test(status)) return { tone: 'up', text: '✗ 未命中' };
    return { tone: 'muted', text: '待验证' };
}

/**
 * 预测复盘：筛选 / 排序 / 分页 / CSV 导出 / 顶部摘要 / 结果着色 / 行跳个股详情。
 * 从总览日历跳转时会带 ?from=&to= 查询参数，这里据此覆盖日期筛选。
 */
export default function PredictionsPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [f, setF] = usePersistedState('ga:predictions:filters', DEFAULT_FILTERS);

    // 日历跳转带日期参数时覆盖 persisted 值；用 toString 作为依赖避免对象引用变化导致循环。
    const search = searchParams.toString();
    useEffect(() => {
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        if (from || to) {
            setF((prev) => ({ ...prev, from: from ?? prev.from, to: to ?? prev.to, page: 1 }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const setFilter = (key) => (v) => setF((prev) => ({ ...prev, [key]: v, page: 1 }));
    const setPage = (p) => setF((prev) => ({ ...prev, page: p }));
    const setSize = (s) => setF((prev) => ({ ...prev, size: s, page: 1 }));

    const main = useApi(
        () => getPredictions({
            from: f.from, to: f.to, horizon: f.horizon, direction: f.direction, result: f.result,
            board: f.board, minConf: f.minConf, maxConf: f.maxConf, inPool: f.inPool,
            sort: f.sort, page: f.page, size: f.size,
        }),
        [f.from, f.to, f.horizon, f.direction, f.result, f.board, f.minConf, f.maxConf,
            f.inPool, f.sort, f.page, f.size],
    );

    const data = asObject(main.data);
    const items = asArray(data.items);
    const summary = asObject(data.summary);
    const page = Number(data.page) || f.page;
    const pages = Math.max(1, Number(data.pages) || 1);
    const total = Number(data.total) || items.length;
    const size = Number(data.size) || f.size;

    const exportUrl = exportPredictionsUrl({
        from: f.from, to: f.to, horizon: f.horizon, direction: f.direction, result: f.result,
        board: f.board, minConf: f.minConf, maxConf: f.maxConf, inPool: f.inPool, sort: f.sort,
    });

    const openStock = (row) => navigate(`${GA_BASE}/stock/${marketOf(row)}/${String(row?.code ?? '')}`, {
        state: { from: `${window.location.pathname}${window.location.search}`, fromLabel: '预测复盘' },
    });

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="起始日期"><Input type="date" value={f.from} onChange={setFilter('from')}/></Field>
                <Field label="结束日期"><Input type="date" value={f.to} onChange={setFilter('to')}/></Field>
                <Field label="周期"><Select value={f.horizon} onChange={setFilter('horizon')} options={HORIZON_OPTIONS}/></Field>
                <Field label="方向"><Select value={f.direction} onChange={setFilter('direction')} options={DIRECTION_OPTIONS}/></Field>
                <Field label="结果"><Select value={f.result} onChange={setFilter('result')} options={RESULT_OPTIONS}/></Field>
                <Field label="板块"><Select value={f.board} onChange={setFilter('board')} options={BOARD_OPTIONS}/></Field>
                <Field label="置信度下限"><Input type="number" step="0.05" min="0" max="1" value={f.minConf} onChange={setFilter('minConf')}/></Field>
                <Field label="置信度上限"><Input type="number" step="0.05" min="0" max="1" value={f.maxConf} onChange={setFilter('maxConf')}/></Field>
                <Field label="是否在池"><Select value={f.inPool} onChange={setFilter('inPool')} options={INPOOL_OPTIONS}/></Field>
                <Field label="排序"><Select value={f.sort} onChange={setFilter('sort')} options={SORT_OPTIONS}/></Field>
                <a className="ga-btn" href={exportUrl} target="_blank" rel="noreferrer">导出 CSV</a>
                <RefreshBtn state={main}/>
            </FilterBar>

            <Card title="预测明细" flush extra={
                <div className="ga-row">
                    <Badge tone="accent">命中率 {fmtRate(summary.hitRate)}</Badge>
                    <Term id="hitRate">整体命中率</Term>
                    <span className="ga-muted">样本 {fmtInt(summary.n)} 条</span>
                </div>
            }>
                <AsyncPanel state={main} isEmpty={() => false}>
                    {() => (items.length ? (
                        <>
                            <div className="ga-table-wrap">
                                <table className="ga-table">
                                    <thead>
                                    <tr>
                                        <th>交易日</th><th>代码</th><th>名称</th><th><Term id="horizon">周期</Term></th><th><Term id="predDirection">方向</Term></th>
                                        <th><Term id="probUp">上涨概率</Term></th><th><Term id="confidence">置信度</Term></th><th>目标日</th><th><Term id="actualReturn">真实收益</Term></th>
                                        <th><Term id="status">结果</Term></th><th><Term id="limitFlag">标记</Term></th><th><Term id="championVersion">冠军版本</Term></th><th><Term id="inPool">在池</Term></th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {items.map((row, i) => {
                                        const r = asObject(row);
                                        const res = resultInfo(r);
                                        return (
                                            <tr key={r.id ?? i} className="ga-row-link" title="点击查看个股详情"
                                                onClick={() => openStock(r)}>
                                                <td>{fmtText(r.tradeDate)}</td>
                                                <td className="ga-mono">{fmtText(r.code)}</td>
                                                <td>{fmtText(r.name)}</td>
                                                <td>{fmtText(r.horizon)}</td>
                                                <td><Badge tone={dirTone(r.predDirection)}>{dirLabel(r.predDirection)}</Badge></td>
                                                <td className="ga-num">{fmtRate(r.probUp)}</td>
                                                <td className="ga-num">{fmtRate(r.confidence)}</td>
                                                <td>{fmtText(r.targetDate)}</td>
                                                <td className={`ga-num ${Number(r.actualReturn) > 0 ? 'ga-up' : Number(r.actualReturn) < 0 ? 'ga-down' : ''}`}>
                                                    {formatPct(r.actualReturn)}
                                                </td>
                                                <td><Badge tone={res.tone}>{res.text}</Badge></td>
                                                <td>
                                                    {r.limitFlag ? <Badge tone="warn">涨停</Badge> : null}
                                                    {r.isReplay ? <Tag>回放</Tag> : null}
                                                </td>
                                                <td>{fmtText(r.championVersion)}</td>
                                                <td>{r.inPool ? <Badge tone="info">在池</Badge> : <span className="ga-muted">-</span>}</td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                            <Pager page={page} size={size} total={total} pages={pages}
                                   onPage={setPage} onSize={setSize}/>
                        </>
                    ) : <Empty text="当前筛选下没有预测记录"/>)}
                </AsyncPanel>
            </Card>
        </div>
    );
}
