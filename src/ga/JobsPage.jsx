import { useCallback, useEffect, useRef, useState } from 'react';
import {
    getJobsStatus, getJobsLog, getJobsSchedule,
    postJobRun, postScheduleToggle, postScheduleFire,
} from './api.js';
import { asArray, asObject, fmtText } from './gaUtils.js';
import {
    Card, FilterBar, Field, Select, Btn, Badge, Empty, ErrorBox,
} from './GaParts.jsx';

/**
 * 后台任务（独立页面）。
 *
 * 三个重点：
 *  1. 触发要有可见效果：提交后记录基线 lastRunAt，轮询 jobs/status 到「结果变化且不再运行」，
 *     直接把 SUCCESS/FAILED 与后端 message 显示在页面上，而不是只弹一句「已触发」。
 *  2. 定时调度：展示 cron / 下次触发时间 / 开关，并提供「按定时规则立即执行一次」，
 *     走后端与 @Scheduled 相同的提交路径，无需等到 17:30 才能验证。
 *  3. 运行历史：读取 ga_job_log 最近的记录；后端尚未重启、没有新接口时自动降级为
 *     jobs/status 的「每任务最后一次结果」，保证页面在任何后端版本下都能用。
 */

const POLL_OPTIONS = [
    { value: '2000', label: '每 2 秒' },
    { value: '5000', label: '每 5 秒' },
    { value: '10000', label: '每 10 秒' },
];

const JOB_HINTS = {
    InitJob: '冷启动初始化：补齐最近 10 个交易日的实盘预测 / 回填 / 指标 / 因子 IC（启动后自动跑一次，重复触发安全）',
    FeatureJob: '计算/回填特征，首次运行会自动补齐历史',
    PredictJob: '用冠军集对最新交易日出预测',
    VerifyJob: '用真实行情回填预测结果',
    MetricJob: '汇总命中率 / IC 等看板指标',
    PoolJob: '评估股票池淘汰与复活',
    EvolveJob: '全部周期依次进化并做冠军准入',
    CalibrateJob: '重拟合 Platt 校准参数',
    FactorIcJob: '计算各周期的因子 IC 体检',
    ReplayJob: '按默认区间做历史回放（耗时较长）',
    DailyPipeline: '日链路：特征 → 预测 → 回填 → 指标 → 淘汰 → 晋升检查',
    WeeklyEvolve: '周链路：5 个周期进化 → 准入 → 校准 → 因子体检 → 淘汰',
};

function statusTone(s) {
    const v = String(s ?? '').toUpperCase();
    if (/SUCCESS|OK|成功/.test(v)) return 'down';
    if (/FAIL|ERROR|失败|异常/.test(v)) return 'up';
    if (/RUN|运行|排队/.test(v)) return 'accent';
    return 'muted';
}

function statusLabel(s) {
    const v = String(s ?? '').toUpperCase();
    if (v === 'NEVER' || v === '') return '从未运行';
    if (v === 'SUCCESS') return '成功';
    if (v === 'FAILED') return '失败';
    return fmtText(s);
}

/** 把耗时格式化成人们看得懂的样子。 */
function elapsed(startedAt, finishedAt) {
    if (!startedAt || !finishedAt) return '—';
    const ms = new Date(String(finishedAt).replace('T', ' ').replace(' ', 'T')).getTime()
        - new Date(String(startedAt).replace('T', ' ').replace(' ', 'T')).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} 秒`;
    return `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒`;
}

function shortMessage(text, max = 90) {
    const s = fmtText(text).replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default function JobsPage() {
    const [auto, setAuto] = useState(true);
    const [pollMs, setPollMs] = useState('3000');
    const [limit, setLimit] = useState('40');
    const [rows, setRows] = useState([]);
    const [logs, setLogs] = useState([]);
    const [schedule, setSchedule] = useState(null);
    const [scheduleUnsupported, setScheduleUnsupported] = useState(false);
    const [logUnsupported, setLogUnsupported] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [busy, setBusy] = useState('');
    const [notice, setNotice] = useState(null);
    const [pending, setPending] = useState(null);

    const pendingRef = useRef(null);
    const inflightRef = useRef(false);
    const timerRef = useRef(null);
    const rowsRef = useRef([]);
    // 旧后端没有这两个接口时只探测一次，避免每轮轮询都打一串 404
    const logUnsupportedRef = useRef(false);
    const scheduleUnsupportedRef = useRef(false);
    const pollMsRef = useRef(Number(pollMs));
    const limitRef = useRef(Number(limit));

    useEffect(() => { pollMsRef.current = Number(pollMs) || 3000; }, [pollMs]);
    useEffect(() => { limitRef.current = Number(limit) || 40; }, [limit]);

    /** 一次快照：状态是必需的，运行历史与定时信息允许后端版本较旧时缺失。 */
    const refresh = useCallback(async () => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        try {
            const [s, l, sc] = await Promise.allSettled([
                getJobsStatus(),
                logUnsupportedRef.current ? Promise.reject(new Error('unsupported')) : getJobsLog({ limit: limitRef.current }),
                scheduleUnsupportedRef.current ? Promise.reject(new Error('unsupported')) : getJobsSchedule(),
            ]);
            if (s.status === 'rejected') {
                setError(s.reason?.message || '无法读取后台任务状态');
            } else {
                const nextRows = asArray(s.value).map(asObject);
                rowsRef.current = nextRows;
                setRows(nextRows);
                setError(null);

                // 触发后的结果跟踪：基线时间变化 + 不再运行 = 本轮结束
                const p = pendingRef.current;
                if (p) {
                    const row = nextRows.find((r) => r.name === p.job);
                    if (row && !row.running && String(row.lastRunAt || '') !== p.baseline) {
                        pendingRef.current = null;
                        setPending(null);
                        const ok = /SUCCESS/i.test(String(row.lastStatus));
                        setNotice({
                            tone: ok ? 'ok' : 'err',
                            text: `${p.job} 执行结束：${statusLabel(row.lastStatus)} · ${shortMessage(row.lastMessage, 160)}`,
                        });
                    } else if (Date.now() - p.startedAt > 45 * 60 * 1000) {
                        pendingRef.current = null;
                        setPending(null);
                        setNotice({ tone: 'warn', text: `${p.job} 等待超时，请手动刷新查看结果` });
                    }
                }
            }
            if (l.status === 'fulfilled') {
                setLogs(asArray(l.value).map(asObject));
                setLogUnsupported(false);
                logUnsupportedRef.current = false;
            } else {
                setLogUnsupported(true);
                logUnsupportedRef.current = true;
            }
            if (sc.status === 'fulfilled') {
                setSchedule(asObject(sc.value));
                setScheduleUnsupported(false);
                scheduleUnsupportedRef.current = false;
            } else {
                setScheduleUnsupported(true);
                scheduleUnsupportedRef.current = true;
            }
            setUpdatedAt(new Date());
        } finally {
            inflightRef.current = false;
            setLoading(false);
        }
    }, []);

    /** 自动轮询：有任务在跑/等待结果时更密集，空闲时按用户选择的间隔。 */
    useEffect(() => {
        let cancelled = false;
        const loop = async () => {
            await refresh();
            if (cancelled || !auto) return;
            const hot = pendingRef.current || rowsRef.current.some((r) => r.running);
            const delay = hot ? Math.min(2000, pollMsRef.current) : pollMsRef.current;
            timerRef.current = setTimeout(loop, delay);
        };
        loop();
        return () => {
            cancelled = true;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
        // rows 刻意不进依赖：轮询节奏由 hot 状态在每轮内部读取，避免频繁重建定时器
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auto, refresh]);

    /** 触发一个任务；记录基线以便把「提交 → 完成」串成一条可见的反馈。 */
    const trigger = useCallback(async (job, kind) => {
        const busyKey = kind ? `fire:${kind}` : `run:${job}`;
        setBusy(busyKey);
        setNotice({ tone: 'info', text: `正在提交 ${job}…` });
        const baseline = String((rows.find((r) => r.name === job) || {}).lastRunAt || '');
        try {
            const res = kind ? await postScheduleFire({ kind }) : await postJobRun({ job });
            const text = String(res?.message || '已提交');
            if (text.includes('已跳过重复触发')) {
                // 后端互斥锁拒绝了重复提交，本轮不会产生新的日志，不能一直等
                setNotice({ tone: 'warn', text: `${job}：${text}` });
            } else {
                const p = { job, baseline, startedAt: Date.now() };
                pendingRef.current = p;
                setPending(p);
                setNotice({ tone: 'info', text: `${text}；页面会自动跟踪执行结果` });
            }
            await refresh();
        } catch (e) {
            setNotice({ tone: 'err', text: `触发失败：${e.message || '接口异常'}` });
        } finally {
            setBusy('');
        }
    }, [rows, refresh]);

    const toggleSchedule = async () => {
        setBusy('toggle');
        try {
            const r = await postScheduleToggle({ enabled: !asObject(schedule).runtimeEnabled });
            setNotice({ tone: r?.enabled ? 'ok' : 'warn', text: r?.message || '定时开关已切换' });
            await refresh();
        } catch (e) {
            setNotice({ tone: 'err', text: `切换失败：${e.message || '接口异常'}` });
        } finally {
            setBusy('');
        }
    };

    /** 后端重启后重新探测新接口，不用整页刷新。 */
    const redetect = () => {
        logUnsupportedRef.current = false;
        scheduleUnsupportedRef.current = false;
        setLogUnsupported(false);
        setScheduleUnsupported(false);
        refresh();
    };

    const runningCount = rows.filter((r) => r.running).length;
    const sc = asObject(schedule);
    const logRows = logUnsupported
        ? rows.map((r) => ({
            jobName: r.name, status: r.lastStatus, finishedAt: r.lastRunAt,
            message: r.lastMessage, startedAt: '', id: r.name,
        }))
        : logs;

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="自动刷新">
                    <Select value={auto ? 'on' : 'off'} onChange={(v) => setAuto(v === 'on')}
                            options={[{ value: 'on', label: '开启' }, { value: 'off', label: '关闭' }]}/>
                </Field>
                <Field label="刷新间隔" hint="运行中自动加速到 2 秒">
                    <Select value={pollMs} onChange={setPollMs}
                            options={[{ value: '3000', label: '每 3 秒' }, ...POLL_OPTIONS]}/>
                </Field>
                <Field label="历史条数">
                    <Select value={limit} onChange={setLimit}
                            options={['20', '40', '100'].map((v) => ({ value: v, label: `${v} 条` }))}/>
                </Field>
                <Btn variant="primary" onClick={refresh}>立即刷新</Btn>
                {scheduleUnsupported || logUnsupported
                    ? <Btn onClick={redetect} title="后端重启后点此重新检测新增接口">重新检测</Btn>
                    : null}
                <span className="ga-jobs-meta">
                    <span className={`ga-live-dot${runningCount ? ' is-running' : ''}`}/>
                    {runningCount ? `${runningCount} 个任务运行中` : '当前无运行中的任务'}
                    {updatedAt ? ` · 更新于 ${updatedAt.toLocaleTimeString('zh-CN')}` : ''}
                </span>
            </FilterBar>

            {notice ? (
                <div className={`ga-note ga-note--${notice.tone} ga-jobs-notice`}>
                    <span>{notice.text}</span>
                    <button type="button" className="ga-btn ga-btn--sm ga-btn--ghost"
                            onClick={() => setNotice(null)}>关闭</button>
                </div>
            ) : null}
            {error ? <ErrorBox message={error} onRetry={refresh}/> : null}
            {runningCount > 1 ? (
                <div className="ga-note ga-note--warn">
                    任务由单线程串行队列执行，「运行中」包含已提交但排队等待的任务，请耐心等待。
                </div>
            ) : null}

            {/* ---------------------------------------------------- 定时调度 */}
            <Card title="定时调度 · @Scheduled" extra={
                <span className="ga-muted">Asia/Shanghai</span>
            }>
                {scheduleUnsupported ? (
                    <div className="ga-stack">
                        <div className="ga-note">
                            当前后端尚未包含 <span className="ga-mono">/api/ga/jobs/schedule</span> 接口，
                            在 IDEA 中重启 Spring Boot 后即可显示 cron、下次执行时间与定时开关。
                            下面的「立即执行」走通用任务接口，无需重启即可生效。
                        </div>
                        <div className="ga-row">
                            <Btn variant="primary" disabled={busy === 'run:DailyPipeline'}
                                 onClick={() => trigger('DailyPipeline')}>立即执行日链路</Btn>
                            <Btn disabled={busy === 'run:WeeklyEvolve'}
                                 onClick={() => trigger('WeeklyEvolve')}>立即执行周进化</Btn>
                        </div>
                        <div className="ga-muted">
                            配置默认值：日链路 17:30（交易日）· 周进化 每周六 02:00
                        </div>
                    </div>
                ) : (
                    <div className="ga-stack">
                        <div className="ga-schedule-grid">
                            <div className="ga-schedule-item">
                                <div className="ga-schedule-label">日链路 · DailyPipeline</div>
                                <div className="ga-schedule-value">{fmtText(sc.cronDaily)}</div>
                                <div className="ga-muted">下次触发 {fmtText(sc.nextDaily) || '—'}</div>
                                <div className="ga-muted ga-schedule-desc">特征 → 预测 → 回填 → 指标 → 淘汰 → 晋升检查</div>
                            </div>
                            <div className="ga-schedule-item">
                                <div className="ga-schedule-label">周进化 · WeeklyEvolve</div>
                                <div className="ga-schedule-value">{fmtText(sc.cronEvolve)}</div>
                                <div className="ga-muted">下次触发 {fmtText(sc.nextEvolve) || '—'}</div>
                                <div className="ga-muted ga-schedule-desc">5 个周期进化 → 准入 → 校准 → 因子体检 → 淘汰</div>
                            </div>
                            <div className="ga-schedule-item">
                                <div className="ga-schedule-label">调度状态</div>
                                <div className="ga-schedule-value">
                                    <Badge tone={sc.enabled ? 'down' : 'warn'}>
                                        {sc.enabled ? '已启用' : '已停用'}
                                    </Badge>
                                </div>
                                <div className="ga-muted">服务器时间 {fmtText(sc.serverTime)}</div>
                                <div className="ga-muted ga-schedule-desc">
                                    配置总开关 {sc.configEnabled ? '开' : '关'} · 运行队列 {fmtText(sc.executor)}
                                </div>
                            </div>
                        </div>
                        <div className="ga-row">
                            <Btn variant="primary" disabled={busy === 'fire:daily' || pending?.job === 'DailyPipeline'}
                                 onClick={() => trigger('DailyPipeline', 'daily')}>按定时规则执行日链路</Btn>
                            <Btn disabled={busy === 'fire:weekly' || pending?.job === 'WeeklyEvolve'}
                                 onClick={() => trigger('WeeklyEvolve', 'weekly')}>按定时规则执行周进化</Btn>
                            <Btn variant={sc.runtimeEnabled ? '' : 'primary'}
                                 disabled={busy === 'toggle' || sc.configEnabled === false}
                                 onClick={toggleSchedule}>
                                {sc.runtimeEnabled ? '停用定时触发' : '启用定时触发'}
                            </Btn>
                            <span className="ga-muted">
                                开关只影响 cron 触发；手动「立即运行」始终可用，非交易日定时链路会跳过并记录原因。
                                {sc.configEnabled === false ? '（配置文件 stock.ga.enabled=false，需改配置后重启）' : ''}
                            </span>
                        </div>
                    </div>
                )}
            </Card>

            {/* ---------------------------------------------------- 任务清单 */}
            <Card title={`后台任务 · ${rows.length || 11} 个`} extra={
                <span className="ga-muted">触发后自动跟踪结果</span>
            }>
                {loading && !rows.length ? <div className="ga-loading">加载中…</div> : null}
                {!loading && !rows.length && !error ? <Empty text="暂无任务状态"/> : null}
                {rows.length ? (
                    <div className="ga-table-wrap">
                        <table className="ga-table ga-jobs-table">
                            <thead><tr>
                                <th>任务</th><th>运行中</th><th>上次结果</th><th>上次运行</th>
                                <th>说明 / 结果摘要</th><th>操作</th>
                            </tr></thead>
                            <tbody>
                            {rows.map((raw, i) => {
                                const r = asObject(raw);
                                const name = fmtText(r.name);
                                const running = Boolean(r.running);
                                const isPending = pending?.job === name;
                                return (
                                    <tr key={name || i} className={running ? 'ga-job-running' : ''}>
                                        <td>
                                            <div className="ga-mono">{name}</div>
                                            <div className="ga-muted ga-job-hint">{JOB_HINTS[name] || ''}</div>
                                        </td>
                                        <td>
                                            {running ? (
                                                <Badge tone="accent">
                                                    <span className="ga-spin-dot"/> 运行中/排队中
                                                </Badge>
                                            ) : <span className="ga-muted">空闲</span>}
                                        </td>
                                        <td><Badge tone={statusTone(r.lastStatus)}>{statusLabel(r.lastStatus)}</Badge></td>
                                        <td className="ga-num">{fmtText(r.lastRunAt) || '—'}</td>
                                        <td className="ga-wrap" title={fmtText(r.lastMessage)}>
                                            {isPending ? <span className="ga-tone-accent">已提交，等待执行结果…</span>
                                                : shortMessage(r.lastMessage, 100)}
                                        </td>
                                        <td>
                                            <Btn sm variant="primary" disabled={running || isPending || busy.startsWith('run:')}
                                                 onClick={() => trigger(name)}>立即运行</Btn>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </Card>

            {/* ---------------------------------------------------- 运行历史 */}
            <Card title={logUnsupported ? '最近一次结果（后端重启后可看完整历史）' : '运行历史 · ga_job_log'}
                  extra={<span className="ga-muted">{logRows.length} 条</span>}>
                {logRows.length ? (
                    <div className="ga-table-wrap">
                        <table className="ga-table">
                            <thead><tr>
                                <th>完成时间</th><th>任务</th><th>状态</th><th>耗时</th><th>结果</th>
                            </tr></thead>
                            <tbody>
                            {logRows.map((raw, i) => {
                                const r = asObject(raw);
                                const tone = statusTone(r.status);
                                return (
                                    <tr key={r.id ?? i}>
                                        <td className="ga-num">{fmtText(r.finishedAt || r.createdAt) || '—'}</td>
                                        <td className="ga-mono">{fmtText(r.jobName)}</td>
                                        <td><Badge tone={tone}>{statusLabel(r.status)}</Badge></td>
                                        <td className="ga-num">{elapsed(r.startedAt, r.finishedAt)}</td>
                                        <td className="ga-wrap" title={fmtText(r.message)}>
                                            {shortMessage(r.message, 130)}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                ) : <Empty text="暂无运行记录"/>}
            </Card>
        </div>
    );
}
