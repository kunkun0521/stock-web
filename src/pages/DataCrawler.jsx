import { useEffect, useMemo, useState } from 'react';
import { dataCrawlerApi } from '../api/dataCrawler.js';
import { useApi } from '../hooks/useApi.js';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import StatCard from '../components/StatCard.jsx';

const defaultForm = {
    limit: 0,
    daysBack: 548,
    fqType: 1,
    storeRawPrices: true,
    codePrefixes: '00,30,60',
    requestDelayMillis: 1500,
    refreshStockList: false,
};

const statusText = {
    running: '运行中',
    done: '已完成',
    failed: '失败',
};

const statusClass = (status) => status === 'running' ? 'crawler-running' : status === 'done' ? 'crawler-done' : 'crawler-failed';

const formatTime = (value) => value ? String(value).replace('T', ' ') : '-';

export default function DataCrawler() {
    const [form, setForm] = useState(defaultForm);
    const [activeTaskId, setActiveTaskId] = useState('');
    const [starting, setStarting] = useState(false);
    const [message, setMessage] = useState('');
    const [actionError, setActionError] = useState('');

    const tasks = useApi(() => dataCrawlerApi.recent(20), []);
    const activeTask = useApi(() => activeTaskId
        ? dataCrawlerApi.detail(activeTaskId)
        : Promise.resolve(null), [activeTaskId]);

    useEffect(() => {
        if (!activeTaskId || activeTask.data?.status !== 'running') return undefined;
        const timer = window.setInterval(() => {
            activeTask.reload();
            tasks.reload();
        }, 1600);
        return () => window.clearInterval(timer);
    }, [activeTaskId, activeTask.data?.status]);

    const selectedTask = activeTask.data || (tasks.data ?? []).find((item) => String(item.id) === String(activeTaskId));
    const progress = useMemo(() => {
        const total = Number(selectedTask?.totalCount || 0);
        const completed = Number(selectedTask?.successCount || 0) + Number(selectedTask?.failCount || 0);
        return { total, completed, percent: total ? Math.min(100, Math.round(completed * 100 / total)) : 0 };
    }, [selectedTask]);

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const start = async () => {
        setStarting(true);
        setActionError('');
        setMessage('');
        try {
            const task = await dataCrawlerApi.start({
                ...form,
                limit: Number(form.limit),
                daysBack: Number(form.daysBack),
                fqType: Number(form.fqType),
                requestDelayMillis: Number(form.requestDelayMillis),
            });
            setActiveTaskId(String(task.id));
            setMessage(`抓取任务 #${task.id} 已启动，页面会自动刷新进度。`);
            tasks.reload();
        } catch (error) {
            setActionError(error.message || '启动数据抓取失败');
        } finally {
            setStarting(false);
        }
    };

    const refresh = () => {
        tasks.reload();
        if (activeTaskId) activeTask.reload();
    };

    return (
        <div className="score-page crawler-page">
            <div className="page-intro">
                <div>
                    <h1>股票数据抓取</h1>
                    <p>Java 后端原生调用 BaoStock，按股票增量抓取日线，并按 00、30、60 前缀分表保存。</p>
                </div>
                <span className="strategy-badge crawler-badge">独立数据工具</span>
            </div>

            <Panel title="抓取参数">
                <div className="crawler-form">
                    <label className="field">股票前缀
                        <input value={form.codePrefixes} onChange={(e) => update('codePrefixes', e.target.value)} placeholder="00,30,60"/>
                    </label>
                    <label className="field">最多股票数
                        <input type="number" min="0" max="5000" value={form.limit} onChange={(e) => update('limit', e.target.value)}/>
                    </label>
                    <label className="field">回看自然日
                        <input type="number" min="1" max="3650" value={form.daysBack} onChange={(e) => update('daysBack', e.target.value)}/>
                    </label>
                    <label className="field">主抓取复权
                        <select value={form.fqType} onChange={(e) => update('fqType', e.target.value)}>
                            <option value={1}>前复权</option>
                            <option value={2}>后复权</option>
                            <option value={0}>不复权</option>
                        </select>
                    </label>
                    <label className="field">请求间隔毫秒
                        <input type="number" min="0" max="10000" value={form.requestDelayMillis} onChange={(e) => update('requestDelayMillis', e.target.value)}/>
                    </label>
                    <label className="crawler-check">
                        <input type="checkbox" checked={form.storeRawPrices} onChange={(e) => update('storeRawPrices', e.target.checked)}/>
                        同时保存不复权价格
                    </label>
                    <label className="crawler-check">
                        <input type="checkbox" checked={form.refreshStockList} onChange={(e) => update('refreshStockList', e.target.checked)}/>
                        强制刷新股票列表
                    </label>
                </div>
                <div className="crawler-actions">
                    <button type="button" className="score-rebuild" onClick={start} disabled={starting || activeTask?.data?.status === 'running'}>
                        {starting ? '启动中…' : '开始抓取数据'}
                    </button>
                    <button type="button" className="ghost" onClick={refresh}>刷新任务状态</button>
                </div>
                <div className="forecast-note crawler-note">
                    回看指定自然日，数据库缺少历史前段或最新后段时只补齐缺失区间；当前数据按 00、30、60 分表保存，默认抓取三类股票。
                </div>
            </Panel>

            <ErrorBanner message={[tasks.error, activeTask.error, actionError].filter(Boolean).join('；')} onRetry={refresh}/>
            {message ? <div className="forecast-success">{message}</div> : null}

            <div className="stat-grid">
                <StatCard label="当前任务" value={selectedTask ? `#${selectedTask.id}` : '-'} hint={selectedTask ? statusText[selectedTask.status] || selectedTask.status : '尚未启动'}/>
                <StatCard label="处理进度" value={selectedTask ? `${progress.percent}%` : '-'} hint={selectedTask ? `${progress.completed}/${progress.total || '-'} 只` : '等待任务'}/>
                <StatCard label="成功股票" value={selectedTask?.successCount ?? '-'} hint="完成日线查询并入库"/>
                <StatCard label="失败股票" value={selectedTask?.failCount ?? '-'} hint="可查看任务备注定位"/>
            </div>

            {selectedTask ? (
                <Panel title={`当前任务 #${selectedTask.id}`}>
                    <div className="crawler-task-head">
                        <span className={`crawler-status ${statusClass(selectedTask.status)}`}>{statusText[selectedTask.status] || selectedTask.status}</span>
                        <span>开始：{formatTime(selectedTask.startTime)}</span>
                        <span>结束：{formatTime(selectedTask.endTime)}</span>
                    </div>
                    <div className="crawler-progress"><span style={{ width: `${progress.percent}%` }}/></div>
                    <div className="crawler-remark">{selectedTask.remark || '暂无任务备注'}</div>
                </Panel>
            ) : null}

            <Panel title="最近抓取任务">
                <div className="table-wrap">
                    <table className="data-table crawler-table">
                        <thead><tr><th>任务</th><th>状态</th><th>计划</th><th>成功</th><th>失败</th><th>开始时间</th><th>结束时间</th><th>备注</th></tr></thead>
                        <tbody>
                        {(tasks.data ?? []).map((task) => (
                            <tr key={task.id} onClick={() => setActiveTaskId(String(task.id))} className={String(task.id) === String(activeTaskId) ? 'selected-row' : ''}>
                                <td>#{task.id} · {task.taskName}</td>
                                <td><span className={`crawler-status ${statusClass(task.status)}`}>{statusText[task.status] || task.status}</span></td>
                                <td>{task.totalCount ?? 0}</td><td>{task.successCount ?? 0}</td><td>{task.failCount ?? 0}</td>
                                <td>{formatTime(task.startTime)}</td><td>{formatTime(task.endTime)}</td>
                                <td className="crawler-remark-cell">{task.remark || '-'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {tasks.loading ? <div className="empty">加载中…</div> : null}
                    {!tasks.loading && !(tasks.data ?? []).length ? <div className="empty">暂无抓取任务</div> : null}
                </div>
            </Panel>

            <Panel title="抓取字段说明">
                <div className="metric-explain-grid crawler-explain-grid">
                    <div><strong>主抓取复权</strong><span>默认前复权，适合连续收益和量化指标；可切换后复权或不复权。</span></div>
                    <div><strong>不复权价格</strong><span>勾选后额外保存 adjustflag=3 的原始市场价格，便于成交和涨跌停等真实价格分析。</span></div>
                    <div><strong>增量续抓</strong><span>任务会批量读取股票池的最早和最新日期，只补齐缺失的历史前段或最新后段；范围完整时不会请求 BaoStock。</span></div>
                    <div><strong>本地股票池</strong><span>重复执行默认复用 stock_info，不重复拉取股票列表；只有首次无股票或勾选刷新时才访问 BaoStock 列表接口。</span></div>
                    <div><strong>分表保存</strong><span>00、30、60 分别写入 stock_daily_00、stock_daily_30、stock_daily_60，评分、行情和预测都从这三张分表读取。</span></div>
                    <div><strong>数据字段</strong><span>包含 OHLC、成交量、成交额、涨跌幅、换手率、交易状态、ST 和估值字段。</span></div>
                </div>
            </Panel>
        </div>
    );
}
