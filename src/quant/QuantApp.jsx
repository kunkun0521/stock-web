import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import {
    getStrategies, getDataOverview, reloadData, submitBacktest, getBacktest,
    getBacktests, cancelBacktest, scanSignals,
} from './api.js';
import { QCard, QBtn, QBadge, QTabs, QAsync, QPager } from './QuantParts.jsx';
import { int, duration, STATUS_CN, STATUS_TONE } from './format.js';
import StrategyPanel from './StrategyPanel.jsx';
import ResultPanel from './ResultPanel.jsx';
import SignalsPanel from './SignalsPanel.jsx';
import '../ga/ga.css';
import './quant.css';

const TABS = [
    { value: 'strategy', label: '策略与回测' },
    { value: 'result', label: '回测结果' },
    { value: 'signals', label: '今日信号' },
    { value: 'history', label: '任务历史' },
];

/* 扫描结果与列表滚动位置暂存：跳到个股 K 线再返回时，
   不必重新扫描（服务端 10 分钟缓存），列表也回到原来那一屏。 */
const SCAN_STORE_KEY = 'quant:signals:scan';
const SCAN_TTL_MS = 10 * 60 * 1000;
const SCROLL_STORE_KEY = 'quant:signals:scroll';

function readStoredScan() {
    try {
        const raw = window.sessionStorage.getItem(SCAN_STORE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.scanDate || Date.now() - (data.__savedAt || 0) > SCAN_TTL_MS) return null;
        return data;
    } catch (e) {
        return null;
    }
}

function writeStoredScan(data) {
    try {
        window.sessionStorage.setItem(SCAN_STORE_KEY, JSON.stringify({ ...data, __savedAt: Date.now() }));
    } catch (e) {
        /* 隐私模式/超限时忽略，最多只是返回后需要重扫 */
    }
}

/**
 * 量化策略研究与回测平台（/quant）。
 *
 * 数据流：行情面板一次性加载进后端内存并缓存，页面只负责提交任务、轮询进度、渲染结果。
 * 回测与事件研究在同一次任务里完成，避免重复计算信号。
 */
export default function QuantApp() {
    const navigate = useNavigate();
    // Tab 与「今日信号」当前策略都写进 URL：跳个股 K 线再返回时能原样还原，
    // 也能直接分享「今日信号 / L1 超跌反弹」这种链接。
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') || 'strategy';
    const signalsStrategy = searchParams.get('s') || '';
    const patchParams = (patch) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([k, v]) => {
            if (v === '' || v == null) next.delete(k); else next.set(k, v);
        });
        setSearchParams(next, { replace: true });
    };
    const setTab = (next) => patchParams({ tab: next });
    const setSignalsStrategy = (key) => patchParams({ s: key });

    const [taskId, setTaskId] = useState(null);
    const [task, setTask] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    // 返回本页时优先复用上次扫描结果，避免又等 3 秒重算
    const [scan, setScan] = useState(readStoredScan);
    const [scanning, setScanning] = useState(false);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(10);
    const [reloading, setReloading] = useState(false);

    const strategies = useApi(() => getStrategies(), []);
    const overview = useApi(() => getDataOverview(), []);
    const recent = useApi(() => getBacktests({ page: 1, size: 8 }), [taskId, tab]);
    const history = useApi(
        () => getBacktests({ page, size }),
        [page, size, taskId, tab],
    );

    // 行情面板首次加载需要数秒，未就绪时轮询状态
    useEffect(() => {
        if (overview.data?.loaded || overview.error) return undefined;
        const timer = setTimeout(() => overview.reload(), 2000);
        return () => clearTimeout(timer);
    }, [overview.data, overview.error]); // eslint-disable-line react-hooks/exhaustive-deps

    // 任务进度轮询：运行中每秒刷新，结束后刷新策略卡与历史
    useEffect(() => {
        if (!taskId) return undefined;
        let cancelled = false;
        let timer = null;
        const tick = async () => {
            try {
                const t = await getBacktest(taskId);
                if (cancelled) return;
                setTask(t);
                if (t.status === 'RUNNING' || t.status === 'PENDING') {
                    timer = setTimeout(tick, 1000);
                } else {
                    strategies.reload();
                    recent.reload();
                }
            } catch (e) {
                if (!cancelled) {
                    setTask((prev) => (prev ? { ...prev, status: 'FAILED', errorMsg: e.message } : prev));
                }
            }
        };
        tick();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async (payload) => {
        setSubmitting(true);
        setSubmitError('');
        try {
            const res = await submitBacktest(payload);
            setTaskId(res.taskId);
            setTask({ id: res.taskId, status: 'PENDING', progress: 0, stage: '排队中' });
            setTab('result');
        } catch (e) {
            setSubmitError(e.message || '提交失败');
        } finally {
            setSubmitting(false);
        }
    };

    const cancel = async () => {
        if (!taskId) return;
        try {
            await cancelBacktest(taskId);
        } catch (e) {
            setSubmitError(e.message || '取消失败');
        }
    };

    const doScan = async () => {
        setScanning(true);
        try {
            const data = await scanSignals({});
            setScan(data);
            writeStoredScan(data);
        } catch (e) {
            setSubmitError(e.message || '扫描失败');
        } finally {
            setScanning(false);
        }
    };

    // 从个股 K 线返回时，把列表滚回原来那一屏（只在首次挂载时执行一次）。
    // 分两次尝试：首次等首屏渲染，若高度还不够（表格尚未铺开）再补一次。
    useEffect(() => {
        if (tab !== 'signals') return undefined;
        let saved = 0;
        try {
            saved = Number(window.sessionStorage.getItem(SCROLL_STORE_KEY) || 0);
        } catch (e) {
            saved = 0;
        }
        if (!saved) return undefined;
        const restore = () => window.scrollTo({ top: saved, behavior: 'auto' });
        const first = setTimeout(() => {
            restore();
            try {
                window.sessionStorage.removeItem(SCROLL_STORE_KEY);
            } catch (e) {
                /* 忽略 */
            }
        }, 150);
        const second = setTimeout(restore, 450);
        return () => {
            clearTimeout(first);
            clearTimeout(second);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** 打开个股 K 线：记录来源（含 tab 与策略）与滚动位置，详情页据此提供「返回」 */
    const openStock = (row) => {
        try {
            window.sessionStorage.setItem(SCROLL_STORE_KEY, String(window.scrollY));
        } catch (e) {
            /* 忽略 */
        }
        const from = `${window.location.pathname}${window.location.search}`;
        navigate(`/ga/stock/${row.market}/${row.code}`, {
            state: { from, fromLabel: '今日信号' },
        });
    };

    const reload = async () => {
        setReloading(true);
        try {
            await reloadData();
            overview.reload();
        } finally {
            setReloading(false);
        }
    };

    const ov = overview.data || {};
    const loading = !ov.loaded && !overview.error;
    const statusText = useMemo(() => {
        if (overview.error) return '行情面板不可用';
        if (loading) return ov.message || '行情面板加载中…';
        return `行情面板 ${ov.snapshot || ''} · ${int(ov.stockCount)} 只 · ${int(ov.dateCount)} 个交易日 · 加载 ${duration(ov.loadCostMs)}`;
    }, [overview.error, loading, ov]);

    return (
        <div className="ga-root quant-root">
            <header className="quant-head">
                <div className="quant-head-row">
                    <div>
                        <h1 className="quant-title">策略研究与回测</h1>
                        <p className="quant-sub">
                            左侧超跌 / 低估值，右侧突破 / 均线多头，加一个混合范例；回测、事件研究、
                            每日选股共用同一份策略代码。仅用于研究，不构成投资建议。
                        </p>
                    </div>
                    <div className="quant-head-right">
                        <span className={`quant-data-chip${ov.loaded ? ' is-ready' : ''}${overview.error ? ' is-err' : ''}`}
                              title={statusText}>
                            <i/>
                            {loading ? `加载中 ${ov.progress || 0}%` : ov.loaded ? '数据就绪' : '数据不可用'}
                        </span>
                        <span className="ga-muted quant-status-text">{statusText}</span>
                        <QBtn sm loading={reloading} loadingText="重载中…" onClick={reload}
                              title="作废内存面板，重新从 stock_daily_all 加载">
                            重载行情
                        </QBtn>
                    </div>
                </div>
                <QTabs items={TABS} value={tab} onChange={setTab}/>
                {loading ? (
                    <div className="quant-progress quant-progress--head">
                        <div className="quant-progress-track">
                            <i style={{ width: `${Math.max(3, ov.progress || 0)}%` }}/>
                        </div>
                        <span>{ov.message || '正在读取 155 万行行情数据…'}</span>
                    </div>
                ) : null}
            </header>

            {submitError ? (
                <div className="ga-note ga-note--err quant-submit-error">
                    {submitError}
                    <button type="button" className="ga-btn ga-btn--sm ga-btn--ghost"
                            onClick={() => setSubmitError('')}>关闭</button>
                </div>
            ) : null}

            {tab === 'strategy' ? (
                <StrategyPanel
                    strategies={strategies.data}
                    overview={ov}
                    task={task}
                    submitting={submitting}
                    onSubmit={submit}
                    onCancel={cancel}
                    recent={recent.data?.items}
                    onOpenTask={(id) => { setTaskId(id); setTab('result'); }}
                />
            ) : null}

            {/* 任务状态由本组件统一轮询，这里把最新状态透传下去：
                结果页不再自己拉一次就冻结，运行结束后会自动重载指标/净值/交易/事件。 */}
            {tab === 'result' ? (
                <ResultPanel
                    taskId={taskId}
                    liveTask={task && task.id === taskId ? task : null}
                    onOpenTask={setTaskId}
                />
            ) : null}

            {tab === 'signals' ? (
                <SignalsPanel
                    strategies={strategies.data}
                    scan={scan}
                    scanning={scanning}
                    onScan={doScan}
                    onOpenStock={openStock}
                    active={signalsStrategy}
                    onActiveChange={setSignalsStrategy}
                />
            ) : null}

            {tab === 'history' ? (
                <QCard title="回测任务历史" flush extra={<span className="ga-muted">共 {int(history.data?.total)} 条</span>}>
                    <QAsync state={history} isEmpty={(d) => !d?.items?.length} emptyText="还没有任务">
                        {() => (
                            <>
                                <div className="ga-table-wrap">
                                    <table className="ga-table">
                                        <thead><tr>
                                            <th>#</th><th>策略</th><th>区间</th><th>状态</th><th>进度</th>
                                            <th>总收益</th><th>夏普</th><th>交易</th><th>用时</th><th>创建时间</th>
                                        </tr></thead>
                                        <tbody>
                                        {(history.data.items || []).map((r) => (
                                            <tr key={r.id} className="ga-row-link"
                                                onClick={() => { setTaskId(r.id); setTab('result'); }}>
                                                <td className="ga-mono">{r.id}</td>
                                                <td>{strategies.data?.find((s) => s.key === r.strategyKey)?.name || r.strategyKey}</td>
                                                <td>{r.startDate} ~ {r.endDate}</td>
                                                <td><QBadge tone={STATUS_TONE[r.status] || 'plain'}>
                                                    {STATUS_CN[r.status] || r.status}
                                                </QBadge></td>
                                                <td className="ga-num">{r.progress}%</td>
                                                <td className={(r.summary?.metrics?.totalReturn ?? 0) >= 0 ? 'ga-up' : 'ga-down'}>
                                                    {r.summary?.metrics ? `${(r.summary.metrics.totalReturn * 100).toFixed(1)}%` : '-'}
                                                </td>
                                                <td className="ga-num">{r.summary?.metrics?.sharpe != null ? Number(r.summary.metrics.sharpe).toFixed(2) : '-'}</td>
                                                <td className="ga-num">{int(r.summary?.metrics?.tradeCount)}</td>
                                                <td>{duration(r.durationMs)}</td>
                                                <td className="ga-muted">{r.createdAt}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                                <QPager page={history.data.page} size={history.data.size}
                                        total={history.data.total} pages={history.data.pages}
                                        onPage={setPage} onSize={(s) => { setSize(s); setPage(1); }}/>
                            </>
                        )}
                    </QAsync>
                </QCard>
            ) : null}
        </div>
    );
}
