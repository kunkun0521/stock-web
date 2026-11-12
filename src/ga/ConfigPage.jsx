import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { getConfig, putConfig, getJobsStatus, postJobRun } from './api.js';
import { asArray, asObject, fmtText } from './gaUtils.js';
import {
    Card, FilterBar, Field, Input, Btn, AsyncPanel, Badge,
} from './GaParts.jsx';

/** 任务状态徽标配色。 */
function jobTone(s) {
    const v = String(s ?? '').toUpperCase();
    if (/OK|SUCCESS|SUCC|成功/.test(v)) return 'down';
    if (/FAIL|ERROR|失败|异常/.test(v)) return 'up';
    return 'muted';
}

/**
 * 参数配置：按 scope 展示 ga_config 项，逐项编辑保存，显示默认值与说明。
 * 另附后台任务状态与「立即运行」，覆盖 jobs/status 与 jobs/run 契约。
 */
export default function ConfigPage() {
    const [scope, setScope] = usePersistedState('ga:config:scope', 'GLOBAL');
    const [edits, setEdits] = useState({});
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState(null);
    const [jobMsg, setJobMsg] = useState(null);

    const cfg = useApi(() => getConfig({ scope }), [scope]);
    const jobs = useApi(() => getJobsStatus(), []);

    const data = asObject(cfg.data);
    const items = asArray(data.items);
    const defaults = asObject(data.defaults);
    const jobItems = asArray(jobs.data);

    const valueOf = (row) => (edits[row.paramKey] !== undefined ? edits[row.paramKey] : (row.paramValue ?? ''));

    const save = async (row) => {
        const key = `cfg:${scope}:${row.paramKey}`;
        setBusy(key);
        setMsg(null);
        try {
            await putConfig({ scope, paramKey: row.paramKey, paramValue: valueOf(row) });
            setMsg({ tone: 'ok', text: `${fmtText(row.paramKey)} 已保存` });
            setEdits((prev) => { const next = { ...prev }; delete next[row.paramKey]; return next; });
            cfg.reload();
        } catch (e) {
            setMsg({ tone: 'err', text: `保存失败：${e.message || '接口异常'}` });
        } finally {
            setBusy('');
        }
    };

    const runJob = async (row) => {
        const key = `job:${row.name}`;
        setBusy(key);
        setJobMsg(null);
        try {
            const r = await postJobRun({ job: row.name });
            setJobMsg({ tone: 'ok', text: `${fmtText(row.name)}：${r?.message || '已触发'}` });
            jobs.reload();
        } catch (e) {
            setJobMsg({ tone: 'err', text: `触发失败：${e.message || '接口异常'}` });
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="ga-page">
            <FilterBar>
                <Field label="作用域" hint="scope">
                    <Input className="ga-input--wide" value={scope} onChange={setScope} placeholder="GLOBAL"/>
                </Field>
                <Btn variant="primary" onClick={() => { cfg.reload(); jobs.reload(); }}>刷新</Btn>
            </FilterBar>

            <Card title={`参数配置 · ga_config（${fmtText(scope)}）`}>
                <AsyncPanel state={cfg} isEmpty={(d) => asArray(asObject(d).items).length === 0}
                            emptyText="该作用域暂无配置项">
                    {() => (
                        <div className="ga-table-wrap">
                            <table className="ga-table">
                                <thead><tr>
                                    <th>参数键</th><th>当前值（可编辑）</th><th>默认值</th>
                                    <th>说明</th><th>更新时间</th><th>操作</th>
                                </tr></thead>
                                <tbody>
                                {items.map((row, i) => {
                                    const r = asObject(row);
                                    const key = r.paramKey ?? i;
                                    const changed = edits[r.paramKey] !== undefined
                                        && String(edits[r.paramKey]) !== String(r.paramValue ?? '');
                                    return (
                                        <tr key={key}>
                                            <td className="ga-mono">{fmtText(r.paramKey)}</td>
                                            <td>
                                                <Input className="ga-input--wide" value={valueOf(r)}
                                                       onChange={(v) => setEdits((p) => ({ ...p, [r.paramKey]: v }))}/>
                                            </td>
                                            <td className="ga-mono ga-muted">{fmtText(defaults[r.paramKey])}</td>
                                            <td className="ga-wrap">{fmtText(r.description)}</td>
                                            <td>{fmtText(r.updatedAt)}</td>
                                            <td>
                                                <Btn sm variant={changed ? 'primary' : ''}
                                                     disabled={busy === `cfg:${scope}:${r.paramKey}`}
                                                     onClick={() => save(r)}>保存</Btn>
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </AsyncPanel>
                {msg ? <div className={`ga-note ga-note--${msg.tone}`}>{msg.text}</div> : null}
            </Card>

            <Card title="后台任务（jobs/status）">
                <AsyncPanel state={jobs} isEmpty={(d) => asArray(d).length === 0} emptyText="暂无任务状态">
                    {() => (
                        <div className="ga-table-wrap">
                            <table className="ga-table">
                                <thead><tr>
                                    <th>任务</th><th>上次运行</th><th>状态</th><th>说明</th><th>操作</th>
                                </tr></thead>
                                <tbody>
                                {jobItems.map((row, i) => {
                                    const r = asObject(row);
                                    return (
                                        <tr key={r.name ?? i}>
                                            <td className="ga-mono">{fmtText(r.name)}</td>
                                            <td>{fmtText(r.lastRunAt)}</td>
                                            <td><Badge tone={jobTone(r.lastStatus)}>{fmtText(r.lastStatus)}</Badge></td>
                                            <td className="ga-wrap">{fmtText(r.lastMessage)}</td>
                                            <td>
                                                <Btn sm disabled={busy === `job:${r.name}`}
                                                     onClick={() => runJob(r)}>立即运行</Btn>
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </AsyncPanel>
                {jobMsg ? <div className={`ga-note ga-note--${jobMsg.tone}`}>{jobMsg.text}</div> : null}
            </Card>
        </div>
    );
}
