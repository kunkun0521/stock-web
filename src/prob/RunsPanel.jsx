/** 页面 5：任务与参数。一键运行全链路、任务进度、当前生效配置、特征注册表（公式参数来源）。 */
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { getConfig, getFeatures, getModels, getRun, getRuns, launchRun } from './api.js';
import F from './FormulaTerm.jsx';
import { PAsync, PBadge, PBar, PBtn, PCard, PKpi, PPager, PSelect } from './ProbParts.jsx';
import { STATUS_CN, STATUS_TONE, asArray, dateStr, num, shortText } from './format.js';

const TASK_BUTTONS = [
    { type: 'PREPARE', label: '数据准备' },
    { type: 'WALKFORWARD', label: '滚动评估' },
    { type: 'TRAIN', label: '训练模型' },
    { type: 'PREDICT', label: '全市场预测' },
    { type: 'SETTLE', label: '结算' },
    { type: 'EVALUATE', label: '评估复盘' },
    { type: 'BACKTEST', label: '回测' },
];

const CONFIG_GROUPS = [
    { id: 'data', label: '数据与股票池', keys: ['db', 'lookback_days', 'horizons', 'universe_prefixes',
        'exclude_st', 'min_history', 'warmup_days', 'suspension_lookback', 'max_suspension_days',
        'min_valid_row_ratio', 'complete_check_days', 'incomplete_action', 'limit_pct',
        'limit_epsilon', 'trading_days_per_year', 'market_proxy', 'value_pctile_window',
        'allow_suspension_in_window'] },
    { id: 'direction', label: '方向与信号', keys: ['prior_strength', 'half_life', 'min_n',
        'signal_max_combo', 'max_combo_stats', 'markov_kappa', 'markov_shrink_pvalue',
        'markov_shrink_weight', 'l2_c_grid', 'max_train_samples'] },
    { id: 'vol', label: '波动与蒙特卡洛', keys: ['garch_refit_every', 'backtest_garch_refit_every',
        'ewma_lambda', 'garch_min_obs', 'garch_max_iter', 'n_paths', 'path_batch', 'seed_base',
        'p_min', 'p_max', 'consistency_mode', 'consistency_iters'] },
    { id: 'risk', label: '分位与风险', keys: ['quantile_taus', 'quantile_epochs',
        'quantile_learning_rate', 'quantile_l2', 'drop_threshold_1', 'drop_threshold_2',
        'rise_threshold_1', 'rise_threshold_2', 'risk_low_cut', 'risk_mid_cut', 'risk_high_cut',
        'evt_tail_quantile', 'evt_min_exceedances', 'winsor_pct', 'feature_missing_drop_ratio'] },
    { id: 'eval', label: '评估与校准', keys: ['isotonic_min_samples', 'calibration_bins', 'purge_days',
        'retrain_every', 'test_block', 'rf', 'grade_min_samples', 'grade_var_lookback'] },
    { id: 'auto', label: '自动化与回测', keys: ['oos_fast', 'walkforward', 'engine', 'backtest',
        'top_n', 'commission', 'stamp_duty', 'slippage', 'config_version', 'engine_code_version',
        'disclaimer'] },
];

function ConfigView({ cfg }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState({ data: true });
    const entries = Object.entries(cfg || {}).filter(([k]) => !k.startsWith('__'));
    const q = query.trim().toLowerCase();
    // 搜索命中时自动展开所有分组，方便直接看到命中的配置项。
    useEffect(() => {
        if (!q) return;
        setOpen(() => {
            const next = { other: true };
            CONFIG_GROUPS.forEach((g) => { next[g.id] = true; });
            return next;
        });
    }, [q]);
    const match = ([k, v]) => !q || k.toLowerCase().includes(q) ||
        JSON.stringify(v).toLowerCase().includes(q);
    const grouped = CONFIG_GROUPS.map((g) => ({
        ...g, items: g.keys.filter((k) => k in (cfg || {})).map((k) => [k, cfg[k]]).filter(match),
    }));
    const used = new Set(CONFIG_GROUPS.flatMap((g) => g.keys));
    const other = entries.filter(([k]) => !used.has(k)).filter(match);
    const groups = [...grouped.filter((g) => g.items.length),
        ...(other.length ? [{ id: 'other', label: '其它', items: other }] : [])];
    return (
        <>
            <input className="ga-input prob-config-search" type="search" value={query}
                   placeholder="搜索配置项，例如 n_paths、limit_pct、half_life"
                   onChange={(e) => setQuery(e.target.value)}/>
            <div className="prob-config-groups">
                {groups.map((g) => (
                    <details key={g.id} open={!!open[g.id]}>
                        {/* 完全受控：阻止浏览器默认 toggle，避免原生状态与 React state 打架；
                            也不能在 setState 的 updater 里读 e.currentTarget（事件派发后会被置空）。 */}
                        <summary onClick={(e) => {
                            e.preventDefault();
                            setOpen((s) => ({ ...s, [g.id]: !s[g.id] }));
                        }}>{g.label} · {g.items.length} 项</summary>
                        <div className="ga-table-wrap">
                            <table className="ga-table prob-table">
                                <tbody>
                                    {g.items.map(([k, v]) => (
                                        <tr key={k}><td style={{ width: '34%' }}><code>{k}</code></td>
                                            <td className="prob-config-value">
                                                {typeof v === 'object' && v !== null
                                                    ? <pre>{JSON.stringify(v, null, 2)}</pre>
                                                    : String(v)}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                ))}
                {!groups.length ? <div className="ga-empty">没找到「{query}」</div> : null}
            </div>
        </>
    );
}

function FeatureView({ features }) {
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('all');
    const groups = asArray(features?.groups);
    const list = asArray(features?.features);
    const q = query.trim().toLowerCase();
    const shown = list.filter((f) => (group === 'all' || f.group === group)
        && (!q || [f.name, f.cn, f.formula, f.source, f.stat].filter(Boolean)
            .join(' ').toLowerCase().includes(q)));
    return (
        <>
            <p className="prob-note">features.yaml 是特征注册表：每个特征的公式、回看天数、<b>入参来自 stock_daily 的哪些字段</b>、
                <b>统计口径（窗口/预热/缺失处理）</b>都在这里，与「公式说明」弹窗同源。<F id="cross_section"/></p>
            <PBar>
                <input className="ga-input" type="search" value={query} placeholder="搜索特征、字段、口径"
                       onChange={(e) => setQuery(e.target.value)}/>
                <PSelect value={group} onChange={setGroup}
                         options={[{ value: 'all', label: '全部分组' },
                             ...groups.map((g) => ({ value: g.id, label: g.label }))]}/>
                <span className="prob-muted">命中 {shown.length} / {list.length}</span>
            </PBar>
            <div className="ga-table-wrap prob-scroll-420">
                <table className="ga-table prob-table">
                    <thead><tr><th>特征</th><th>中文</th><th>公式</th><th>回看</th>
                        <th>入参来源</th><th>统计口径</th></tr></thead>
                    <tbody>
                        {shown.map((f) => (
                            <tr key={f.name}>
                                <td><code>{f.name}</code></td><td>{f.cn}</td>
                                <td className="prob-small">{f.formula}</td>
                                <td>{f.lookback} 日</td>
                                <td className="prob-small">{f.source}</td>
                                <td className="prob-small">{f.stat}</td>
                            </tr>
                        ))}
                        {!shown.length ? <tr><td colSpan={6} className="prob-muted">没有匹配的特征</td></tr> : null}
                    </tbody>
                </table>
            </div>
        </>
    );
}

export default function RunsPanel({ refreshKey }) {
    const [page, setPage] = useState(1);
    const [activeRun, setActiveRun] = useState(null);
    const [activeType, setActiveType] = useState('');
    const [launching, setLaunching] = useState(false);
    const [notice, setNotice] = useState('');
    const [tab, setTab] = useState('config');
    const runs = useApi(() => getRuns({ page, size: 10 }), [page, refreshKey, activeRun]);
    const config = useApi(getConfig, [refreshKey]);
    const features = useApi(getFeatures, [refreshKey]);
    const models = useApi(getModels, [refreshKey]);
    const detail = useApi(() => (activeRun ? getRun(activeRun) : Promise.resolve(null)), [activeRun]);

    const isRunning = detail.data && ['RUNNING', 'PENDING'].includes(detail.data.status);
    useEffect(() => {
        if (!activeRun || !isRunning) return undefined;
        const timer = setTimeout(() => detail.reload(), 2500);
        return () => clearTimeout(timer);
    }, [activeRun, isRunning, detail.data]); // eslint-disable-line react-hooks/exhaustive-deps

    const launch = async (type) => {
        setLaunching(true);
        setNotice('');
        try {
            const res = await launchRun({ type });
            setActiveRun(res.runId);
            setActiveType(type);
            setNotice(`${type} 已提交（runId=${res.runId}），引擎正在后台运行，完成后下方记录会自动刷新。`);
            runs.reload();
        } catch (e) {
            setNotice(`提交失败：${e.message}`);
        } finally {
            setLaunching(false);
        }
    };

    const items = asArray(runs.data);
    const modelItems = asArray(models.data);

    return (
        <>
            <PCard title="一键运行" extra={<F id="daily">全链路说明</F>}>
                <div className="prob-launch">
                    <div>
                        <h3>每日收盘后只需点一次</h3>
                        <p>prepare → 滚动样本外评估 → 训练 → 全市场 LIVE 预测 → 结算 → 评估复盘 → EVT → 回测，
                            全部由 <code>engine daily</code> 自动编排；已完成的滚动评估会按 retrain_every 自动跳过，
                            walk-forward 支持按 asof_date 断点续跑。</p>
                        <p className="prob-muted">也可以在 application.yaml 打开 <code>stock.prob.schedule-enabled</code>，
                            由后端每个交易日定时触发，完全无需人工操作。</p>
                    </div>
                    <PBtn variant="primary" loading={launching} loadingText="提交中…"
                          onClick={() => launch('DAILY')}>一键运行日常任务</PBtn>
                </div>
                <div className="prob-task-buttons">
                    {TASK_BUTTONS.map((t) => (
                        <PBtn key={t.type} sm variant="ghost" disabled={launching}
                              onClick={() => launch(t.type)}>{t.label}</PBtn>
                    ))}
                </div>
                {notice ? <div className="prob-notice">{notice}</div> : null}
                {activeRun ? (
                    <div className="prob-run-live">
                        <div className="prob-run-live-head">
                            <PBadge tone={STATUS_TONE[detail.data?.status] || 'info'}>
                                {STATUS_CN[detail.data?.status] || detail.data?.status || '提交中'}
                            </PBadge>
                            <b>#{activeRun} · {activeType}</b>
                            <span className="prob-muted">{isRunning ? '引擎运行中，每 2.5 秒刷新一次进度' : '任务已结束'}</span>
                            <PBtn sm onClick={() => detail.reload()}>查询进度</PBtn>
                        </div>
                        {detail.data?.message ? <div className="prob-run-msg">{shortText(detail.data.message, 500)}</div> : null}
                        <div className="ga-kpi-grid">
                            <PKpi label="股票池" value={num(detail.data?.n_universe || 0, 0)}/>
                            <PKpi label="成功" value={num(detail.data?.n_ok || 0, 0)} tone="down"/>
                            <PKpi label="失败" value={num(detail.data?.n_fail || 0, 0)} tone="up"/>
                            <PKpi label="数据告警" value={num(detail.data?.data_warn_count || 0, 0)}/>
                        </div>
                    </div>
                ) : null}
            </PCard>

            <PCard title="运行记录" extra={<PBtn sm onClick={() => runs.reload()}>刷新</PBtn>}>
                <PAsync state={runs} isEmpty={() => !items.length} emptyText="暂无运行记录">
                    {() => (
                        <>
                            <div className="ga-table-wrap">
                                <table className="ga-table prob-table">
                                    <thead><tr><th>ID</th><th>类型</th><th>状态</th><th>基准日</th>
                                        <th>池 / 成功 / 失败</th><th>开始</th><th>结束</th><th>说明</th></tr></thead>
                                    <tbody>
                                        {items.map((r) => (
                                            <tr key={r.run_id}>
                                                <td><button type="button" className="prob-code"
                                                            onClick={() => { setActiveRun(r.run_id); setActiveType(r.run_type); }}>{r.run_id}</button></td>
                                                <td>{r.run_type}</td>
                                                <td><PBadge tone={STATUS_TONE[r.status]}>{STATUS_CN[r.status] || r.status}</PBadge></td>
                                                <td>{dateStr(r.asof_date)}</td>
                                                <td>{r.n_universe} / {r.n_ok} / {r.n_fail}</td>
                                                <td className="prob-small">{shortText(r.started_at, 19)}</td>
                                                <td className="prob-small">{shortText(r.finished_at, 19)}</td>
                                                <td className="prob-small" title={String(r.message || '')}>{shortText(r.message, 60)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <PPager page={runs.data?.page} size={10} total={runs.data?.total}
                                    pages={runs.data?.pages} onPage={setPage} onSize={() => {}} sizes={[10]}/>
                        </>
                    )}
                </PAsync>
            </PCard>

            <PCard title="配置 / 特征 / 模型产物" extra={
                <PSelect value={tab} onChange={setTab}
                         options={[{ value: 'config', label: '当前生效配置' },
                             { value: 'features', label: '特征注册表' },
                             { value: 'models', label: '模型产物' }]}/>
            }>
                {tab === 'config' ? (
                    <PAsync state={config} isEmpty={() => !config.data || !!config.data.error}
                            emptyText="无法读取 config.yaml，请检查后端 stock.prob.config-path">
                        {(c) => <ConfigView cfg={c}/>}
                    </PAsync>
                ) : null}
                {tab === 'features' ? (
                    <PAsync state={features} isEmpty={() => !features.data?.features}
                            emptyText="无法读取 features.yaml">{(f) => <FeatureView features={f}/>}</PAsync>
                ) : null}
                {tab === 'models' ? (
                    <PAsync state={models} isEmpty={() => !modelItems.length} emptyText="暂无模型产物登记">
                        {() => (
                            <div className="ga-table-wrap prob-scroll-360">
                                <table className="ga-table prob-table">
                                    <thead><tr><th>模型</th><th>周期</th><th>训练截止</th><th>产物路径</th><th>参数摘要</th></tr></thead>
                                    <tbody>
                                        {modelItems.map((m, i) => (
                                            <tr key={`${m.model_name}-${m.horizon}-${i}`}>
                                                <td>{m.model_name}</td><td>{m.horizon}</td>
                                                <td>{dateStr(m.train_end_date)}</td>
                                                <td className="prob-small">{shortText(m.artifact_path, 60)}</td>
                                                <td className="prob-small">{shortText(JSON.stringify(m.params_json), 120)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </PAsync>
                ) : null}
                <p className="prob-note">所有「可配置」参数都在 config.yaml，代码里不写死；每条预测通过 run_id / model_version
                    追溯到当时的完整配置快照。<F id="version"/></p>
            </PCard>
        </>
    );
}
