import { useMemo, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getConfig, putConfig } from './api.js';
import { asArray, asObject, fmtText } from './gaUtils.js';
import Term from './GlossaryTerm.jsx';
import {
    Card, FilterBar, Field, Input, Select, Btn, AsyncPanel, Badge, RefreshBtn,
} from './GaParts.jsx';

/**
 * 参数配置：按作用域展示 ga_config，逐项或批量编辑保存。
 *
 * 参数很多（GLOBAL 就 123 项），一张大表格看得眼花，这里按业务语义分成若干
 * 可折叠分组（详见 GROUPS），每组只展示自己的参数；顶部给分组导航 chip 一键定位。
 * 搜索命中时会自动展开包含命中的分组，其余折叠，既保留全局检索又不失结构。
 *
 * 两个容易踩的坑（保持不变）：
 *  - 作用域选「全部」时同一 paramKey 会在 GLOBAL 与 H1/H3… 里重复，编辑态必须用
 *    scope + paramKey 作为键，保存时也要把该行自己的 scope 传回后端。
 *  - PUT /api/ga/config 走 client.js 的 apiPut（含基址回退与后端业务错误解析）。
 */

const SCOPE_OPTIONS = [
    { value: 'ALL', label: '全部作用域' },
    { value: 'GLOBAL', label: 'GLOBAL · 全局' },
    { value: 'H1', label: 'H1 · 1 日' },
    { value: 'H3', label: 'H3 · 3 日' },
    { value: 'H5', label: 'H5 · 5 日' },
    { value: 'H10', label: 'H10 · 10 日' },
    { value: 'H15', label: 'H15 · 15 日' },
];

/**
 * 分组定义：order 决定展示顺序，open 决定默认是否展开。
 * keys 是精确匹配的参数键；prefixes 是前缀匹配（如 fit_w_ 匹配 fit_w_a/b/s/r）。
 * 未命中任何组的参数归入「其他」。
 */
const GROUPS = [
    {
        id: 'data', label: '数据与股票池', icon: '▦', open: true,
        desc: '行情口径、股票池白名单、采样与特征缓存',
        keys: ['adjust_flag', 'universe_prefixes', 'horizons', 'min_labeled_days', 'sample_per_day',
            'random_seed', 'exclude_st', 'new_listing_days', 'winsor_q', 'missing_feature_ratio',
            'market_z_window', 'dedup_corr', 'feature_lookback_days', 'feature_persist'],
        prefixes: ['low_liquidity', 'extreme_vol', 'data_missing'],
    },
    {
        id: 'label', label: '标签与噪声', icon: 'Θ', open: true,
        desc: '涨跌/观望标签门槛与到期回填',
        keys: ['floors', 'noise_vol_coef', 'label_mode', 'verify_void_days'],
    },
    {
        id: 'window', label: '训练窗口与折', icon: '▤', open: false,
        desc: '滚动折、训练/验证/Hold-out 长度',
        keys: ['train_days', 'valid_days', 'fold_step', 'folds', 'min_train_days', 'holdout_days', 'stability_block_days'],
    },
    {
        id: 'evo', label: '进化算子', icon: '♺', open: true,
        desc: '种群、交叉变异、选择、早停、初始个体',
        keys: ['pop_size', 'max_gen', 'patience', 'min_improve', 'tournament_k', 'elite_ratio',
            'crossover_pc', 'blx_alpha', 'pm_w', 'pm_m', 'immigrant_ratio', 'diversity_threshold',
            'init_random', 'init_prior', 'init_champion', 'min_active_features', 'cull_ratio'],
    },
    {
        id: 'fitness', label: '适应度权重', icon: 'ƒ', open: false,
        desc: 'F_seg 各分项权重、覆盖率、过拟合/复杂度惩罚',
        keys: ['cov_target', 'cov_min', 'overfit_penalty', 'complexity_penalty',
            'fit_a_scale', 'fit_b_scale', 'fit_r_base', 'fit_r_scale'],
        prefixes: ['fit_w_'],
    },
    {
        id: 'champion', label: '冠军与校准', icon: '★', open: false,
        desc: '名人堂、候选集、准入、影子、集成、Platt 校准、退役',
        keys: ['hof_size', 'candidate_k', 'candidate_dedup_corr', 'holdout_min_balacc', 'holdout_min_first',
            'shadow_days', 'shadow_tolerance', 'softmax_temp', 'calib_a', 'calib_b', 'calib_min_samples',
            'retire_window', 'retire_min_samples', 'retire_balacc', 'regime_specific'],
        prefixes: ['shadow_'],
    },
    {
        id: 'pool', label: '股票池淘汰', icon: '⛔', open: false,
        desc: '淘汰/复活阈值、冷却、停牌、涨跌停幅度',
        keys: ['limit_main', 'limit_gem', 'limit_st', 'limit_touch_eps'],
        prefixes: ['pool_'],
    },
    {
        id: 'replay', label: '回放与看板', icon: '↺', open: false,
        desc: '历史回放、因子体检、错误分析、告警与展示口径',
        keys: ['ic_decay_min', 'ece_bins', 'ece_warn', 'quantile_groups', 'min_consensus',
            'alert_hit_rate', 'alert_days', 'price_check_tolerance', 'price_check_samples',
            'color_scheme', 'init_days'],
        prefixes: ['replay_'],
    },
    {
        id: 'misc', label: '批量与数据清理', icon: '🗑', open: false,
        desc: '写入批大小、回填游标、cleanup_* 保留期与安全阀',
        keys: ['batch_size', 'verify_batch_size', 'verify_page_size'],
        prefixes: ['cleanup_'],
    },
];

/** 归类：按顺序命中第一个匹配的分组（keys 精确 / prefixes 前缀），否则归入「其他」。 */
function groupOf(paramKey) {
    const k = fmtText(paramKey);
    for (const g of GROUPS) {
        if (g.keys && g.keys.includes(k)) return g.id;
        if (g.prefixes && g.prefixes.some((p) => k.startsWith(p))) return g.id;
    }
    return 'other';
}

const editKey = (row) => `${fmtText(row.scope) || 'GLOBAL'}|${fmtText(row.paramKey)}`;

export default function ConfigPage() {
    const [scope, setScope] = usePersistedState('ga:config:scope', 'GLOBAL');
    const [keyword, setKeyword] = useState('');
    const [edits, setEdits] = useState({});
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState(null);
    // 记录用户手动展开/收起的分组（undefined = 跟随默认或搜索联动）
    const [openState, setOpenState] = useState({});
    const [flashGroup, setFlashGroup] = useState(null);

    const cfg = useApi(() => getConfig({ scope: scope === 'ALL' ? '' : scope }), [scope]);

    const data = asObject(cfg.data);
    const items = asArray(data.items).map(asObject);
    const defaults = asObject(data.defaults);

    const valueOf = (row) => {
        const k = editKey(row);
        return edits[k] !== undefined ? edits[k] : (row.paramValue ?? '');
    };
    const isDirty = (row) => {
        const k = editKey(row);
        return edits[k] !== undefined && String(edits[k]) !== String(row.paramValue ?? '');
    };

    const dirtyRows = useMemo(() => items.filter(isDirty), [items, edits]);

    const q = keyword.trim().toLowerCase();

    // 分组聚合：每个分组挂上自己的 items（含搜索过滤后）
    const groups = useMemo(() => {
        const map = new Map();
        // 先按定义顺序建空组
        GROUPS.forEach((g) => map.set(g.id, { ...g, items: [] }));
        map.set('other', { id: 'other', label: '其他', icon: '·', open: false, desc: '未归类的参数', items: [] });

        for (const row of items) {
            const gid = groupOf(row.paramKey);
            map.get(gid).items.push(row);
        }
        // 搜索过滤：只保留命中组，且让命中组展开
        const result = [];
        for (const g of map.values()) {
            if (!g.items.length) continue; // 空组不显示
            let list = g.items;
            if (q) {
                list = g.items.filter((r) => `${fmtText(r.paramKey)} ${fmtText(r.description)}`
                    .toLowerCase().includes(q));
                if (!list.length) continue;
            }
            result.push({ ...g, items: list });
        }
        return result;
    }, [items, q]);

    // 每组的展开状态：搜索时强制全展开；否则用 openState 覆盖，否则用默认
    const isOpen = (g) => {
        if (q) return true;
        if (openState[g.id] !== undefined) return openState[g.id];
        return g.open;
    };

    const scrollToGroup = (gid) => {
        setOpenState((prev) => ({ ...prev, [gid]: true }));
        setFlashGroup(gid);
        setTimeout(() => {
            document.getElementById(`ga-config-group-${gid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 30);
        setTimeout(() => setFlashGroup(null), 1600);
    };

    const saveOne = async (row) => {
        const key = editKey(row);
        setBusy(`save:${key}`);
        setMsg(null);
        try {
            await putConfig({
                scope: fmtText(row.scope) || (scope === 'ALL' ? 'GLOBAL' : scope),
                paramKey: fmtText(row.paramKey),
                paramValue: String(valueOf(row)),
            });
            setEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
            setMsg({ tone: 'ok', text: `${fmtText(row.scope)} / ${fmtText(row.paramKey)} 已保存，下一次任务生效` });
            cfg.reload();
        } catch (e) {
            setMsg({
                tone: 'err',
                text: `保存失败：${e.message || '接口异常'}。请确认后端已启动；若通过其它端口打开页面，接口会自动回退到同源代理。`,
            });
        } finally {
            setBusy('');
        }
    };

    const saveAll = async () => {
        if (!dirtyRows.length) return;
        setBusy('all');
        setMsg({ tone: 'info', text: `正在保存 ${dirtyRows.length} 项…` });
        let ok = 0;
        const failed = [];
        for (const row of dirtyRows) {
            try {
                await putConfig({
                    scope: fmtText(row.scope) || (scope === 'ALL' ? 'GLOBAL' : scope),
                    paramKey: fmtText(row.paramKey),
                    paramValue: String(valueOf(row)),
                });
                ok += 1;
                setEdits((prev) => { const next = { ...prev }; delete next[editKey(row)]; return next; });
            } catch (e) {
                failed.push(`${fmtText(row.scope)}/${fmtText(row.paramKey)}：${e.message || '接口异常'}`);
            }
        }
        setMsg(failed.length
            ? { tone: 'err', text: `已保存 ${ok} 项，失败 ${failed.length} 项：${failed.slice(0, 3).join('；')}` }
            : { tone: 'ok', text: `已保存 ${ok} 项修改，下一次任务生效` });
        setBusy('');
        cfg.reload();
    };

    const restoreDefault = async (row) => {
        const def = defaults[row.paramKey];
        if (def === undefined) {
            setEdits((prev) => { const next = { ...prev }; delete next[editKey(row)]; return next; });
            return;
        }
        const key = editKey(row);
        setBusy(`restore:${key}`);
        try {
            await putConfig({
                scope: fmtText(row.scope) || (scope === 'ALL' ? 'GLOBAL' : scope),
                paramKey: fmtText(row.paramKey),
                paramValue: String(def),
            });
            setEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
            setMsg({ tone: 'ok', text: `${fmtText(row.paramKey)} 已恢复默认值 ${def}` });
            cfg.reload();
        } catch (e) {
            setMsg({ tone: 'err', text: `恢复默认失败：${e.message || '接口异常'}` });
        } finally {
            setBusy('');
        }
    };

    // 各分组「已修改」计数（仅限当前作用域内 dirty 项）
    const dirtyIn = (gid) => dirtyRows.filter((r) => groupOf(r.paramKey) === gid).length;

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label={<span>作用域 <Term id="GLOBAL"/></span>} hint="周期级同名参数会覆盖全局">
                    <Select className="ga-input--wide" value={scope} onChange={(v) => { setScope(v); setEdits({}); }}
                            options={SCOPE_OPTIONS}/>
                </Field>
                <Field label="搜索" hint="参数键 / 说明（命中自动展开）">
                    <Input className="ga-input--wide" value={keyword} onChange={setKeyword}
                           placeholder="如 pop_size、淘汰、噪声"/>
                </Field>
                <RefreshBtn state={cfg}/>
                <Btn variant="primary" disabled={!dirtyRows.length}
                     loading={busy === 'all'}
                     loadingText={`保存中… (${dirtyRows.length})`}
                     onClick={saveAll}>保存全部改动{dirtyRows.length ? ` (${dirtyRows.length})` : ''}</Btn>
                <Btn disabled={!dirtyRows.length || busy !== ''} onClick={() => setEdits({})}>撤销修改</Btn>
                <span className="ga-muted">
                    共 {items.length} 项{keyword ? ` · 匹配 ${groups.reduce((s, g) => s + g.items.length, 0)} 项` : ''}
                    {dirtyRows.length ? ` · 已修改 ${dirtyRows.length} 项` : ''}
                </span>
            </FilterBar>

            <div className="ga-note">
                参数按业务分成了若干折叠分组，点分组名可展开/收起；顶部彩色块可一键跳转。
                参数写入 <Term id="gaConfig">ga_config</Term> 后立即刷新后端缓存，下一次任务生效，无需重启服务；
                「恢复默认」按代码内置默认值写回。后台任务请到顶部的「后台任务」页操作。
            </div>

            {/* 分组导航 */}
            <div className="ga-config-nav">
                {GROUPS.map((g) => {
                    const dirty = dirtyIn(g.id);
                    const total = items.filter((r) => groupOf(r.paramKey) === g.id).length;
                    if (!total) return null;
                    return (
                        <button key={g.id} type="button"
                                className={`ga-config-nav-item${flashGroup === g.id ? ' is-flash' : ''}`}
                                onClick={() => scrollToGroup(g.id)}>
                            <span className="ga-config-nav-icon">{g.icon}</span>
                            <span className="ga-config-nav-label">{g.label}</span>
                            <span className="ga-config-nav-count">{total}</span>
                            {dirty ? <span className="ga-config-nav-dirty">{dirty}</span> : null}
                        </button>
                    );
                })}
            </div>

            <Card title={<span>参数配置 · <Term id="gaConfig">ga_config</Term>（{SCOPE_OPTIONS.find((o) => o.value === scope)?.label || scope}）</span>}>
                <AsyncPanel state={cfg} isEmpty={(d) => asArray(asObject(d).items).length === 0}
                            emptyText="该作用域暂无配置项">
                    {() => (
                        <div className="ga-config-groups">
                            {groups.map((g) => {
                                const open = isOpen(g);
                                const dirty = dirtyIn(g.id);
                                return (
                                    <details key={g.id} id={`ga-config-group-${g.id}`}
                                             className={`ga-config-group${open ? ' is-open' : ''}${flashGroup === g.id ? ' is-flash' : ''}`}
                                             open={open}>
                                        <summary className="ga-config-group-head"
                                                 onClick={(e) => {
                                                     // 阻止 details 原生 toggle，改由 React 状态控制，避免受控 open 与浏览器状态打架
                                                     e.preventDefault();
                                                     if (!q) setOpenState((prev) => ({ ...prev, [g.id]: !isOpen(g) }));
                                                 }}>
                                            <span className="ga-config-group-icon">{g.icon}</span>
                                            <span className="ga-config-group-label">{g.label}</span>
                                            <span className="ga-config-group-desc">{g.desc}</span>
                                            <span className="ga-config-group-meta">
                                                {g.items.length} 项
                                                {dirty ? <Badge tone="accent">改 {dirty}</Badge> : null}
                                            </span>
                                        </summary>
                                        <div className="ga-config-group-body">
                                            <div className="ga-table-wrap">
                                                <table className="ga-table ga-config-table">
                                                    <thead><tr>
                                                        <th><Term id="GLOBAL">作用域</Term></th><th>参数键</th><th>当前值</th><th>默认值</th>
                                                        <th>说明</th><th>更新时间</th><th>操作</th>
                                                    </tr></thead>
                                                    <tbody>
                                                    {g.items.map((row, i) => {
                                                        const key = editKey(row);
                                                        const dirty = isDirty(row);
                                                        const def = defaults[row.paramKey];
                                                        return (
                                                            <tr key={key || i} className={dirty ? 'ga-config-dirty' : ''}>
                                                                <td><Badge tone={fmtText(row.scope) === 'GLOBAL' ? 'muted' : 'info'} title={`英文原值：${fmtText(row.scope)}`}>
                                                                    {fmtText(row.scope) === 'GLOBAL' ? '全局' : fmtText(row.scope)}
                                                                </Badge></td>
                                                                <td className="ga-mono" title={`${fmtText(row.paramKey)}\n${fmtText(row.description)}`}>{fmtText(row.paramKey)}</td>
                                                                <td>
                                                                    <Input className="ga-input--wide" value={valueOf(row)}
                                                                           onChange={(v) => setEdits((p) => ({ ...p, [key]: v }))}/>
                                                                </td>
                                                                <td className="ga-mono ga-muted">{fmtText(def)}</td>
                                                                <td className="ga-wrap">{fmtText(row.description)}</td>
                                                                <td className="ga-num">{fmtText(row.updatedAt)}</td>
                                                                <td>
                                                                    <div className="ga-row ga-nowrap">
                                                                        <Btn sm variant={dirty ? 'primary' : ''}
                                                                             disabled={busy !== ''}
                                                                             loading={busy === `save:${key}`}
                                                                             loadingText="保存中…"
                                                                             onClick={() => saveOne(row)}>保存</Btn>
                                                                        <Btn sm disabled={def === undefined || busy !== ''}
                                                                             loading={busy === `restore:${key}`}
                                                                             loadingText="恢复中…"
                                                                             title="按代码内置默认值写回"
                                                                             onClick={() => restoreDefault(row)}>恢复默认</Btn>
                                                                        {dirty ? (
                                                                            <Btn sm variant="ghost"
                                                                                 onClick={() => setEdits((p) => {
                                                                                     const next = { ...p }; delete next[key]; return next;
                                                                                 })}>撤销</Btn>
                                                                        ) : null}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </details>
                                );
                            })}
                            {!groups.length ? <div className="ga-empty">没有匹配的参数</div> : null}
                        </div>
                    )}
                </AsyncPanel>
                {msg ? <div className={`ga-note ga-note--${msg.tone} ga-config-msg`}>{msg.text}</div> : null}
            </Card>
        </div>
    );
}
