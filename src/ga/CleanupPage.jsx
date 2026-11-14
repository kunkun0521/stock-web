import { useCallback, useState } from 'react';
import { useApi, invalidateApiCache } from '../hooks/useApi.js';
import {
    getCleanupInspect, getCleanupHistory, postCleanupRun,
} from './api.js';
import { asArray, asObject, fmtInt, fmtText } from './gaUtils.js';
import Term from './GlossaryTerm.jsx';
import {
    Card, KpiGrid, KpiCard, Badge, Btn, Select, Empty, ErrorBox, Loading, RefreshBtn,
} from './GaParts.jsx';

/**
 * 数据清理（独立页面）。
 *
 * 三段式：体检（只读）→ 预览（dryRun）→ 执行（需二次确认）。
 * 后端默认 dryRun=true 且真实执行必须 confirm=true，所以页面把「预览」和「执行」
 * 拆成两个动作，并要求勾选确认框才允许执行，避免误触删掉历史数据。
 *
 * 约定：所有英文表名/参数键都带 <Term> 角标，中文解释统一走术语弹窗。
 */

const MODE_OPTIONS = [
    { value: 'all', label: '修复脏数据 + 清理过期 + 重新生成' },
    { value: 'repair', label: '仅修复脏数据并重新生成' },
    { value: 'purge', label: '仅清理超过保留期的数据' },
];

function levelTone(level) {
    return level === 'warn' ? 'warn' : level === 'ok' ? 'down' : 'plain';
}

function rowsOf(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default function CleanupPage() {
    const [mode, setMode] = useState('all');
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState(null);
    const [result, setResult] = useState(null);

    const inspect = useApi(() => getCleanupInspect(), [], { cacheKey: 'ga:cleanup:inspect', ttlMs: 30 * 1000 });
    const history = useApi(() => getCleanupHistory({ limit: 20 }), [],
        { cacheKey: 'ga:cleanup:history', ttlMs: 30 * 1000 });

    const reload = useCallback(() => {
        invalidateApiCache('ga:cleanup:inspect');
        invalidateApiCache('ga:cleanup:history');
        inspect.reload();
        history.reload();
    }, [inspect.reload, history.reload]);

    const run = async (dryRun) => {
        if (!dryRun && !confirmed) {
            setMsg({ tone: 'warn', text: '请先勾选「我已确认预览结果」再执行真实清理' });
            return;
        }
        setBusy(dryRun ? 'preview' : 'execute');
        setMsg(null);
        setResult(null);
        try {
            const data = await postCleanupRun({ mode, dryRun, confirm: !dryRun && confirmed });
            setResult({ dryRun, ...asObject(data) });
            setMsg({
                tone: dryRun ? 'info' : 'ok',
                text: dryRun ? '预览完成，未改动任何数据' : '执行完成，已重新加载体检结果',
            });
            if (!dryRun) { setConfirmed(false); reload(); }
        } catch (e) {
            setMsg({ tone: 'error', text: `操作失败：${e?.message || fmtText(e)}` });
        } finally {
            setBusy('');
        }
    };

    const d = asObject(inspect.data);
    const dirty = asArray(d.dirty).map(asObject);
    const retention = asArray(d.retention).map(asObject);
    const tables = asArray(d.tables).map(asObject);
    const policy = asObject(d.policy);
    const protectedTables = asArray(d.protectedTables).map(fmtText);

    return (
        <div className="ga-page">
            <Card title="数据体检" extra={<RefreshBtn sm variant="" states={[inspect, history]} label="刷新"/>}>
                {inspect.error ? <ErrorBox message={inspect.error} onRetry={reload}/> : null}
                {inspect.loading && inspect.data === undefined ? <Loading/> : null}
                {inspect.data !== undefined ? (
                    <>
                        <KpiGrid>
                            <KpiCard label="脏数据行数" value={fmtInt(d.dirtyTotal)}
                                     hint="可判定并修复的异常记录" tone={rowsOf(d.dirtyTotal) ? 'up' : 'down'}
                                     term="dirtyData"/>
                            <KpiCard label="超期数据行数" value={fmtInt(d.retentionTotal)}
                                     hint="超过保留期、长期不再使用" tone={rowsOf(d.retentionTotal) ? 'up' : 'down'}
                                     term="retentionDays"/>
                            <KpiCard label="锚点交易日" value={fmtText(d.anchorDate)}
                                     hint="以行情库最新交易日为准" term="anchorDate"/>
                            <KpiCard label="最近保护期" value={`${fmtInt(policy.minKeepDays)} 天`}
                                     hint="任何规则都不得删更近的数据" term="minKeepDays"/>
                        </KpiGrid>
                        <p className="ga-cleanup-note">
                            清理以「行情库最新交易日」为锚点，而不是日历今天，避免行情滞后时把最近数据误判为过期。
                            定时任务（每周日 04:00）<b>只做只读体检</b>，不会自动删除；真正清理必须由本页显式执行。
                        </p>
                    </>
                ) : null}
            </Card>

            <Card title="脏数据明细" extra={<Badge tone={rowsOf(d.dirtyTotal) ? 'warn' : 'down'}>
                {rowsOf(d.dirtyTotal) ? '发现异常' : '全部正常'}
            </Badge>}>
                {dirty.length === 0 ? <Empty text="暂无体检结果"/> : (
                    <div className="ga-table-wrap">
                        <table className="ga-table ga-cleanup-table">
                            <thead><tr>
                                <th>检查项 <Term id="dirtyData"/></th>
                                <th>行数</th>
                                <th>状态</th>
                                <th className="ga-wrap">说明</th>
                            </tr></thead>
                            <tbody>
                            {dirty.map((r) => (
                                <tr key={fmtText(r.key)}>
                                    <td><code>{fmtText(r.key)}</code></td>
                                    <td className={rowsOf(r.rows) ? 'ga-up' : ''}>{fmtInt(r.rows)}</td>
                                    <td><Badge tone={levelTone(r.level)}>
                                        {rowsOf(r.rows) ? '待修复' : '正常'}
                                    </Badge></td>
                                    <td className="ga-wrap">{fmtText(r.label)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Card title="保留期策略与待清理数据" extra={<Badge tone="plain">
                {fmtInt(retention.length)} 类规则
            </Badge>}>
                {retention.length === 0 ? <Empty text="暂无保留期数据"/> : (
                    <div className="ga-table-wrap">
                        <table className="ga-table ga-cleanup-table">
                            <thead><tr>
                                <th>数据表 <Term id="retentionDays"/></th>
                                <th>用途</th>
                                <th>保留天数</th>
                                <th>清理分界日</th>
                                <th>待删行数</th>
                                <th>最旧 ~ 最新</th>
                            </tr></thead>
                            <tbody>
                            {retention.map((r, i) => (
                                <tr key={`${fmtText(r.table)}-${i}`}>
                                    <td><code>{fmtText(r.table)}</code></td>
                                    <td className="ga-wrap">{fmtText(r.note)}</td>
                                    <td>{fmtInt(r.days)} 天</td>
                                    <td>{fmtText(r.cutoff)}</td>
                                    <td className={rowsOf(r.rows) ? 'ga-up' : ''}>{fmtInt(r.rows)}</td>
                                    <td>{r.minDate ? `${fmtText(r.minDate)} ~ ${fmtText(r.maxDate)}` : '—'}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="ga-cleanup-note">
                    受保护、<b>永不删除</b>的表：
                    {protectedTables.map((t) => <code key={t} className="ga-cleanup-tag">{t}</code>)}
                    。特征与市场缓存的保留期会自动抬升到覆盖 GA 训练窗口与预热深度，避免清理后无法进化。
                </p>
            </Card>

            <Card title="各表占用（MB）">
                {tables.length === 0 ? <Empty text="暂无统计"/> : (
                    <div className="ga-table-wrap">
                        <table className="ga-table ga-cleanup-table">
                            <thead><tr><th>表名</th><th>估算行数</th><th>占用 MB</th></tr></thead>
                            <tbody>
                            {tables.map((t) => (
                                <tr key={fmtText(t.table)}>
                                    <td><code>{fmtText(t.table)}</code></td>
                                    <td>{fmtInt(t.rows)}</td>
                                    <td>{fmtInt(t.mb)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Card title="执行清理">
                <div className="ga-filters">
                    <label className="ga-field">
                        <span className="ga-field-label">执行范围</span>
                        <Select value={mode} onChange={setMode} options={MODE_OPTIONS}/>
                    </label>
                    <Btn variant="primary" loading={busy === 'preview'} loadingText="预览中，请稍候…"
                         onClick={() => run(true)}>① 预览（不写库）</Btn>
                    <Btn variant="danger" disabled={!confirmed}
                         loading={busy === 'execute'} loadingText="执行中，请勿关闭页面…"
                         onClick={() => run(false)}>② 确认执行</Btn>
                </div>
                <label className="ga-cleanup-confirm">
                    <input type="checkbox" checked={confirmed}
                           onChange={(e) => setConfirmed(e.target.checked)}/>
                    <span>我已查看上面的预览结果，确认执行真实清理（会删除超过保留期的历史数据，不可撤销）</span>
                </label>
                {msg ? <div className={`ga-config-msg ga-cleanup-msg--${msg.tone}`}>{msg.text}</div> : null}
                {result ? (
                    <div className="ga-cleanup-result">
                        <div className="ga-cleanup-result-head">
                            <Badge tone={result.dryRun ? 'info' : 'down'}>
                                {result.dryRun ? 'DRY-RUN 预览' : '已执行'}
                            </Badge>
                            <span>{fmtText(result.mode)} · 处理 {fmtInt(result.processed)} 行 ·
                                &nbsp;耗时 {fmtInt(result.elapsedMs)} ms</span>
                        </div>
                        <ul>
                            {asArray(result.steps).map((s, i) => <li key={i}>{fmtText(s)}</li>)}
                        </ul>
                        {asObject(result.purge).details ? (
                            <div className="ga-table-wrap">
                                <table className="ga-table ga-cleanup-table">
                                    <thead><tr><th>表 / 用途</th><th>分界日</th>
                                        <th>{result.dryRun ? '将删除' : '已删除'}行数</th></tr></thead>
                                    <tbody>
                                    {asArray(asObject(result.purge).details).map(asObject).map((r, i) => (
                                        <tr key={i}>
                                            <td><code>{fmtText(r.table)}</code> · {fmtText(r.note)}</td>
                                            <td>{fmtText(r.cutoff)}</td>
                                            <td className={rowsOf(r.rows) ? 'ga-up' : ''}>{fmtInt(r.rows)}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </Card>

            <Card title="清理审计历史" extra={<RefreshBtn sm variant="" state={history} label="刷新"/>}>
                {history.error ? <ErrorBox message={history.error}/> : null}
                {history.loading && history.data === undefined ? <Loading/> : null}
                {asArray(history.data).length === 0 ? <Empty text="尚无清理记录"/> : (
                    <div className="ga-table-wrap">
                        <table className="ga-table ga-cleanup-table">
                            <thead><tr><th>时间</th><th>模式</th><th>类型</th><th>处理行数</th>
                                <th className="ga-wrap">详情</th></tr></thead>
                            <tbody>
                            {asArray(history.data).map(asObject).map((r) => (
                                <tr key={fmtText(r.id)}>
                                    <td>{fmtText(r.startedAt)}</td>
                                    <td><code>{fmtText(r.mode)}</code></td>
                                    <td><Badge tone={r.dryRun ? 'info' : 'down'}>
                                        {r.dryRun ? '预览' : '真实执行'}
                                    </Badge></td>
                                    <td>{fmtInt(r.processed)}</td>
                                    <td className="ga-wrap">{fmtText(r.detail)}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
