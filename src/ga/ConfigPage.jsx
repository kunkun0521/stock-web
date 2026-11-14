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
 * 后台任务已拆到独立的「后台任务」页（/ga/jobs），这里只负责参数。
 * 两个容易踩的坑：
 *  - 作用域选「全部」时同一 paramKey 会在 GLOBAL 与 H1/H3… 里重复，编辑态必须用
 *    scope + paramKey 作为键，保存时也要把该行自己的 scope 传回后端。
 *  - PUT /api/ga/config 走 client.js 的 apiPut（含基址回退与后端业务错误解析），
 *    不要再用原生 fetch 直连，否则跨域预检被拦会报「保存失败」而看不到真实原因。
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

const editKey = (row) => `${fmtText(row.scope) || 'GLOBAL'}|${fmtText(row.paramKey)}`;

export default function ConfigPage() {
    const [scope, setScope] = usePersistedState('ga:config:scope', 'GLOBAL');
    const [keyword, setKeyword] = useState('');
    const [edits, setEdits] = useState({});
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState(null);

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
    const shown = useMemo(() => {
        const q = keyword.trim().toLowerCase();
        if (!q) return items;
        return items.filter((r) => `${fmtText(r.paramKey)} ${fmtText(r.description)} ${fmtText(r.scope)}`
            .toLowerCase().includes(q));
    }, [items, keyword]);

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

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label={<span>作用域 <Term id="GLOBAL"/></span>} hint="周期级同名参数会覆盖全局">
                    <Select className="ga-input--wide" value={scope} onChange={(v) => { setScope(v); setEdits({}); }}
                            options={SCOPE_OPTIONS}/>
                </Field>
                <Field label="搜索" hint="参数键 / 说明">
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
                    共 {items.length} 项{keyword ? ` · 匹配 ${shown.length} 项` : ''}
                    {dirtyRows.length ? ` · 已修改 ${dirtyRows.length} 项` : ''}
                </span>
            </FilterBar>

            <div className="ga-note">
                参数写入 <Term id="gaConfig">ga_config</Term> 后立即刷新后端缓存，下一次任务生效，无需重启服务；
                「恢复默认」按代码内置默认值写回。后台任务请到顶部的「后台任务」页操作。
                <strong> 看不懂某个英文参数键？点顶部「? 指标说明」，里面能搜到全部参数的中文解释。</strong>
            </div>

            <Card title={<span>参数配置 · <Term id="gaConfig">ga_config</Term>（{SCOPE_OPTIONS.find((o) => o.value === scope)?.label || scope}）</span>}>
                <AsyncPanel state={cfg} isEmpty={(d) => asArray(asObject(d).items).length === 0}
                            emptyText="该作用域暂无配置项">
                    {() => (
                        <div className="ga-table-wrap">
                            <table className="ga-table ga-config-table">
                                <thead><tr>
                                    <th><Term id="GLOBAL">作用域</Term></th><th><Term id="gaConfig">参数键</Term></th><th>当前值（可编辑）</th><th>默认值</th>
                                    <th>说明</th><th>更新时间</th><th>操作</th>
                                </tr></thead>
                                <tbody>
                                {shown.map((row, i) => {
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
                            {!shown.length ? <div className="ga-empty">没有匹配的参数</div> : null}
                        </div>
                    )}
                </AsyncPanel>
                {msg ? <div className={`ga-note ga-note--${msg.tone} ga-config-msg`}>{msg.text}</div> : null}
            </Card>
        </div>
    );
}
