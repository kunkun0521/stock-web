/**
 * 「为什么这只股票没有预测」诊断卡。
 *
 * 概率页搜的是全站 stock_info（4606 只），但只有引擎股票池里的股票才有预测记录。
 * 这里用主站日线分页接口的 total 直接核对该股票在本机有多少条前复权行情，
 * 再对照 config.yaml 的 min_history，把「有数据但没预测」的原因讲清楚。
 * 纯前端只读，不改动任何后端接口。
 */
import { useEffect, useState } from 'react';
import { stockApi } from '../api/stock.js';
import { getConfig } from './api.js';

const CODE_RE = /^\d{6}$/;

export default function CoverageHint({ code }) {
    const c = String(code || '');
    const [state, setState] = useState({ loading: true, total: null, minHistory: 250, error: false });

    useEffect(() => {
        if (!CODE_RE.test(c)) return undefined;
        let alive = true;
        setState({ loading: true, total: null, minHistory: 250, error: false });
        Promise.all([
            stockApi.daily(c, { adjustFlag: 2, page: 1, size: 1 }).catch(() => null),
            getConfig().catch(() => null),
        ]).then(([daily, cfg]) => {
            if (!alive) return;
            setState({
                loading: false,
                total: daily && Number.isFinite(Number(daily.total)) ? Number(daily.total) : null,
                minHistory: Number(cfg?.min_history || 250) || 250,
                error: !daily,
            });
        });
        return () => { alive = false; };
    }, [c]);

    if (!CODE_RE.test(c)) return null;
    return (
        <section className="prob-coverage">
            <div className="prob-coverage-head">
                <b>为什么 {c} 没有预测？</b>
                <span>搜索联想覆盖全站股票，预测只覆盖引擎股票池</span>
            </div>
            {state.loading ? <p className="prob-muted">正在核对本机行情与股票池规则…</p> : null}
            {!state.loading && state.error ? (
                <p>暂时无法读取行情数据，请确认后端服务正常后重试。</p>
            ) : null}
            {!state.loading && state.total !== null ? (
                <>
                    <p>本机日线库里 <code>{c}</code> 共 <b>{state.total.toLocaleString()}</b> 条前复权行情；
                        引擎股票池要求至少 <b>{state.minHistory}</b> 个有效交易日。</p>
                    {state.total < state.minHistory ? (
                        <p className="prob-coverage-key"><b>结论：确实有行情，但历史长度不够。</b>
                            这类股票通常是分批抓取时只补了近期数据（例如只有 73 / 140 个交易日），
                            不是「没有数据」。GARCH-t 拟合、250 日估值分位、60 日指标预热都依赖长历史，
                            所以本次运行把它排除在预测之外。</p>
                    ) : (
                        <p className="prob-coverage-key"><b>结论：历史长度够，但当日没进池。</b>
                            常见原因是 ST、近 60 日停牌过多、基准日当天停牌或无有效行情，
                            也可能是这次日常任务运行时尚未覆盖该股票。</p>
                    )}
                    <p className="prob-coverage-fix">怎么办：① 在「数据抓取」补齐该股 500 日历史行情，
                        再到「任务与参数」重跑「一键运行日常任务」即可纳入；
                        ② 或调低 config.yaml 的 <code>min_history</code>（不推荐，会降低波动与分位估计的可靠性）。
                        每次运行剔除了多少只、分别因为什么，见「任务与参数 → 运行记录」的排除统计。</p>
                </>
            ) : null}
        </section>
    );
}
