import { useEffect, useMemo, useRef, useState } from 'react';
import { tTradingApi } from '../api/tTrading.js';
import { stockApi } from '../api/stock.js';
import { useApi } from '../hooks/useApi.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { useCurrentStock, useGlobalStockSync } from '../context/CurrentStockContext.jsx';
import DecimalInput from '../components/DecimalInput.jsx';
import EChart from '../components/EChart.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Panel from '../components/Panel.jsx';
import ParamLabel from '../components/ParamLabel.jsx';
import StatCard from '../components/StatCard.jsx';
import { formatPct, formatPrice, pctClass } from '../utils/format.js';
import { assetOption, klineOption, priceCostOption } from '../charts/tTradingOptions.js';

const fmtDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const shiftDays = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return fmtDate(date);
};

const shiftMonths = (months) => {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return fmtDate(date);
};

/** 买入日期快捷选项，默认「近 7 天」。 */
const DATE_PRESETS = [
    { key: '7d', label: '近 7 天', days: -7 },
    { key: '1m', label: '近 1 月', days: -30 },
    { key: '3m', label: '近 3 月', days: -90 },
    { key: '1y', label: '近 1 年', days: -365 },
];

const ADJUST_LABEL = { 1: '后复权', 2: '前复权', 3: '不复权' };
const LOG_PAGE_SIZE = 7;

/** 首次进入默认展示贵州茅台（600519）；之后以会话内保存的参数为准。 */
const DEFAULT_STOCK_NAME = '贵州茅台';

const DEFAULT_FORM = {
    code: '600519',
    buyDate: shiftDays(-7),
    endDate: shiftMonths(1),
    totalCapital: '200000',
    availableCash: '150000',
    initialShares: '1000',
    initialAvgCost: '',
    adjustFlag: '2',
    priceMode: 'CLOSE',
};

/** 会话存储键：切页回来时还原表单、策略、结果和面板展开状态。 */
const STATE_KEY = {
    form: 't-trading:form',
    strategy: 't-trading:strategy',
    showAdvanced: 't-trading:showAdvanced',
    // 旧键曾被「模拟成功自动收起」写入过 false，换键让本次升级后默认展开
    paramsOpen: 't-trading:paramsOpen:v2',
    showNotes: 't-trading:showNotes',
    datePreset: 't-trading:datePreset',
    stockName: 't-trading:stockName',
    logPage: 't-trading:logPage',
    result: 't-trading:result',
    initialized: 't-trading:initialized',
    chartMode: 't-trading:chartMode',
};

/** 主要参数的悬停说明，集中维护便于以后增删字段。 */
const FORM_TIPS = {
    code: '输入 6 位代码或中文名；中文名从联想列表选中后自动回填代码。这里选定的股票会成为全站当前股票，其它页面自动跟随。默认展示贵州茅台 600519。',
    buyDate: '模拟从该日期（含）开始；此前 75 个自然日只用于计算均线等指标，不参与交易。默认近 7 天。',
    endDate: '默认未来一个月；超出库内行情时自动截断到最新交易日，结果里显示真实回放区间。',
    totalCapital: '账户总资金，用于限制单票市值占比；已有底仓市值超过它时，后端按「底仓市值 + 可用现金」自动抬升。',
    availableCash: '期初可用于买入、补仓的现金，不含已有底仓的市值。',
    initialShares: '开始模拟前已持有的股数；大于 0 时首日不再自动建仓。默认 1000 股。',
    initialAvgCost: '已有底仓的每股成本；留空时按初始买入日收盘价自动推定，结果里会标注。',
    adjustFlag: '前复权适合连续回测；不复权是当时的真实成交价，做T价格更接近实盘。',
    priceMode: '收盘价按当日收盘判定并成交；日内触发价用最高/最低价是否触及目标价判定，属于理想化限价单。',
    datePreset: '一键把初始买入日期改成对应区间，结束日期仍保持未来一个月。',
    useMaFilter: '建仓时要求收盘价站上 MA20，避免在下跌趋势中开仓。',
    includeFee: '把佣金、印花税、过户费计入现金流与持仓成本。',
};

/** 高级参数分组：factor 用于把后端小数转成页面上的百分数显示，tip 是悬停说明。 */
const PARAM_GROUPS = [
    {
        title: '建仓 / 补仓 / 仓位上限',
        items: [
            { key: 'initialPositionRatio', label: '首日建仓动用现金', unit: '%', factor: 100, step: 5, min: 10, max: 100,
                tip: '首日建仓动用可用现金的比例，留出现金做T与补仓；高价股不足一手时自动按最小整手买入。' },
            { key: 'addDropPct', label: '补仓触发跌幅', unit: '%', factor: 100, step: 0.5, min: 0.5, max: 50,
                tip: '相对当前账面成本下跌到该幅度触发补仓，还需通过换手率与振幅过滤。' },
            { key: 'addPositionRatio', label: '单次补仓动用现金', unit: '%', factor: 100, step: 5, min: 5, max: 100,
                tip: '每次补仓最多动用「当前可用现金」的比例。' },
            { key: 'maxPositionRatio', label: '单票市值占总资金上限', unit: '%', factor: 100, step: 5, min: 10, max: 100,
                tip: '单票市值 / 总资金的上限，防止越跌越买把仓位堆满。' },
        ],
    },
    {
        title: '正T（高抛 → 回落买回）',
        items: [
            { key: 'tProfitPct', label: '高抛触发涨幅', unit: '%', factor: 100, step: 0.5, min: 0.5, max: 50,
                tip: '相对账面成本上涨到该幅度，先卖出部分仓位做正T。' },
            { key: 'tSellRatio', label: '高抛仓位比例', unit: '%', factor: 100, step: 5, min: 5, max: 90,
                tip: '正T高抛卖出的仓位比例，按 100 股整手取整。' },
            { key: 'tBuybackDrop', label: '回落买回幅度', unit: '%', factor: 100, step: 0.5, min: 0.2, max: 30,
                tip: '高抛后价格回落该幅度时买回同等股数，锁定价差。' },
            { key: 'tMaxHoldDays', label: '超时强制回补', unit: '日', factor: 1, step: 1, min: 1, max: 60,
                tip: '高抛后超过该交易日仍未回落，按市价强制回补。' },
        ],
    },
    {
        title: '倒T / 止盈止损 / 回本',
        items: [
            { key: 'reverseReboundPct', label: '补仓后反弹减仓', unit: '%', factor: 100, step: 0.5, min: 0.2, max: 50,
                tip: '补仓后相对补仓价反弹该幅度，减掉补仓股数完成倒T。' },
            { key: 'reduceProfitPct', label: '减仓触发浮盈', unit: '%', factor: 100, step: 1, min: 0.5, max: 100,
                tip: '浮盈达到该幅度时减仓锁定部分收益。' },
            { key: 'exitProfitPct', label: '止盈离场浮盈', unit: '%', factor: 100, step: 1, min: 1, max: 200,
                tip: '浮盈达到该幅度时清仓离场。' },
            { key: 'stopLossPct', label: '止损线', unit: '%', factor: 100, step: 1, min: -80, max: -1,
                tip: '跌破该幅度优先止损清仓，优先于一切补仓与回补动作。' },
            { key: 'costReductionTargetPct', label: '成本降幅达标线', unit: '%', factor: 100, step: 1, min: 0, max: 90,
                tip: '摊薄成本相对账面成本降幅达标、且已有已实现盈利时触发回本离场。' },
        ],
    },
    {
        title: '技术过滤 / 交易费用',
        items: [
            { key: 'minTurnover', label: '最低换手率（0 关闭）', unit: '%', factor: 1, step: 0.1, min: 0, max: 50,
                tip: '建仓/补仓要求的最低换手率（百分数），填 0 关闭；大盘股建议 0.3。' },
            { key: 'maxAmplitude', label: '最高振幅', unit: '%', factor: 1, step: 0.5, min: 1, max: 30,
                tip: '当日振幅超过该值会跳过交易，避免极端波动日成交。' },
            { key: 'commissionRate', label: '佣金费率', unit: '%', factor: 100, step: 0.005, min: 0, max: 0.3,
                tip: '双边佣金费率，单笔最低 5 元。' },
            { key: 'stampDutyRate', label: '卖出印花税', unit: '%', factor: 100, step: 0.005, min: 0, max: 0.3,
                tip: '卖出时收取的印花税费率。' },
        ],
    },
];

/** 后端默认策略 → 页面显示值（小数转百分数）。 */
const strategyFromDefaults = (data) => {
    if (!data) return {};
    const next = {};
    PARAM_GROUPS.forEach((group) => group.items.forEach((item) => {
        const value = Number(data[item.key]);
        if (Number.isFinite(value)) next[item.key] = Number((value * item.factor).toFixed(4));
    }));
    next.useMaFilter = data.useMaFilter !== false;
    next.includeFee = data.includeFee !== false;
    return next;
};

const ACTION_TONE = {
    buy: 'buy', add: 'buy', buy_t: 'buy',
    sell_t: 'sell', reverse_t_reduce: 'sell', sell_reduce: 'sell', exit: 'sell', hold: 'hold',
};

const money = (value) => (value === null || value === undefined || value === '')
    ? '-'
    : `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 统计卡窄列使用的短金额，避免一屏布局下换行。 */
const compactMoney = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = Number(value);
    return Math.abs(num) >= 10000 ? `¥${(num / 10000).toFixed(2)}万` : money(value);
};

const signed = (value, digits = 2) => (value === null || value === undefined || value === '')
    ? '-'
    : formatPct(value, digits);

/**
 * 数字输入改为文本框后，统一在这里把字符串转成请求参数：
 * 中间态（如 "1439."）正常转数值，空值与非法值给出可操作的中文提示，
 * 避免把 NaN / 0 悄悄发给后端。
 */
const parseAmount = (raw, label, { optional = false, allowZero = false } = {}) => {
    const text = String(raw ?? '').trim();
    if (!text) {
        if (optional) return undefined;
        throw new Error(`${label}不能为空`);
    }
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`${label}必须是有效数字`);
    if (allowZero ? value < 0 : value <= 0) {
        throw new Error(`${label}必须${allowZero ? '为非负数' : '大于 0'}`);
    }
    return value;
};

export default function TTradingSimulator() {
    const { stock: globalStock, setCurrentStock, adoptStock } = useCurrentStock();
    // 表单、策略参数、模拟结果与面板状态都随会话保存：切到其他页面再回来原样还原
    const [form, setForm] = usePersistedState(STATE_KEY.form,
        { ...DEFAULT_FORM, code: globalStock.code || DEFAULT_FORM.code });
    const [strategy, setStrategy] = usePersistedState(STATE_KEY.strategy, {});
    const [showAdvanced, setShowAdvanced] = usePersistedState(STATE_KEY.showAdvanced, false);
    const [paramsOpen, setParamsOpen] = usePersistedState(STATE_KEY.paramsOpen, true);
    const [showNotes, setShowNotes] = usePersistedState(STATE_KEY.showNotes, false);
    const [datePreset, setDatePreset] = usePersistedState(STATE_KEY.datePreset, '7d');
    const [stockName, setStockName] = usePersistedState(STATE_KEY.stockName, globalStock.name || '');
    const [logPage, setLogPage] = usePersistedState(STATE_KEY.logPage, 0);
    const [result, setResult] = usePersistedState(STATE_KEY.result, null);
    // 标记「是否已经展示过默认模拟」，避免每次切回页面都重新请求
    const [initialized, setInitialized] = usePersistedState(STATE_KEY.initialized, false);
    // 第一张图默认显示查询股票的日K线，可切回原来的成本折线视图
    const [chartMode, setChartMode] = usePersistedState(STATE_KEY.chartMode, 'kline');
    // 以下为瞬态状态，不做持久化
    const [stockOptions, setStockOptions] = useState([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [running, setRunning] = useState(false);
    const [actionError, setActionError] = useState('');
    const pickerRef = useRef(null);
    const resultRef = useRef(null);
    const autoRanRef = useRef(false);
    const prevResultRef = useRef(result);

    // 本地表单当前的股票代码，用于判断「全站股票是否被其它页面改了」
    const formCodeRef = useRef(form.code);
    formCodeRef.current = form.code;

    // 跟随全站当前股票；股票真的换掉时清掉上一只的模拟结果，避免参数与图表对不上
    useGlobalStockSync((s) => {
        const changed = formCodeRef.current !== s.code;
        setForm((f) => (f.code === s.code ? f : { ...f, code: s.code }));
        setStockName((prev) => (prev === (s.name || '') ? prev : (s.name || '')));
        if (changed) {
            setResult(null);
            setLogPage(0);
        }
    });

    const defaults = useApi(() => tTradingApi.defaults(), []);

    useEffect(() => {
        if (!defaults.data) return;
        // 已有（用户调整过或上次保存的）策略参数时保持不动，只用后端默认值补齐空表单
        setStrategy((current) => (current && Object.keys(current).length
            ? current : strategyFromDefaults(defaults.data)));
    }, [defaults.data, setStrategy]);

    /** 代码或中文名联想：纯 6 位代码不弹列表，其余关键字按 stock_info 模糊匹配。 */
    useEffect(() => {
        const text = form.code.trim();
        if (!text || /^\d{6}$/.test(text)) {
            setStockOptions([]);
            setPickerOpen(false);
            return undefined;
        }
        const timer = setTimeout(async () => {
            try {
                const list = await stockApi.suggest(text, 8);
                setStockOptions(Array.isArray(list) ? list : []);
                setPickerOpen(true);
            } catch {
                setStockOptions([]);
                setPickerOpen(false);
            }
        }, 220);
        return () => clearTimeout(timer);
    }, [form.code]);

    useEffect(() => {
        const onDocClick = (event) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target)) setPickerOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    // 仅在新结果产生时回到日志第 1 页；还原会话时保留原来翻到的页码
    useEffect(() => {
        if (prevResultRef.current === result) return;
        prevResultRef.current = result;
        setLogPage(0);
    }, [result, setLogPage]);

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const updateParam = (key, value) => setStrategy((current) => ({ ...current, [key]: value }));

    const onCodeChange = (value) => {
        setForm((current) => ({ ...current, code: value }));
        setStockName('');
        // 6 位代码输入完成即设为全站当前股票；中文名等选中联想项或提交时再解析
        if (/^\d{6}$/.test(value.trim())) adoptStock(value.trim());
    };

    const chooseStock = (item) => {
        setForm((current) => ({ ...current, code: item.code }));
        setStockName(item.name || '');
        setCurrentStock({ code: item.code, name: item.name || '' });
        setStockOptions([]);
        setPickerOpen(false);
    };

    const applyPreset = (preset) => {
        setDatePreset(preset.key);
        setForm((current) => ({ ...current, buyDate: shiftDays(preset.days) }));
    };

    const buildStrategy = (source = strategy) => {
        const payload = {};
        PARAM_GROUPS.forEach((group) => group.items.forEach((item) => {
            const raw = source[item.key];
            // 清空时不覆盖后端默认参数；"3." 这类中间态由 Number() 自然转成 3
            if (raw === '' || raw === null || raw === undefined) return;
            const shown = Number(raw);
            if (!Number.isFinite(shown)) return;
            payload[item.key] = item.factor === 1 ? shown : shown / item.factor;
        }));
        payload.useMaFilter = source.useMaFilter !== false;
        payload.includeFee = source.includeFee !== false;
        return payload;
    };

    const run = async (overrideForm, overrideStrategy) => {
        const targetForm = overrideForm || form;
        const targetStrategy = overrideStrategy || strategy;
        setRunning(true);
        setActionError('');
        try {
            // 提交即把该股票设为全站当前股票；中文名先解析成代码再广播，保证其它页面拿到的是 6 位代码
            const text = targetForm.code.trim();
            if (/^\d{6}$/.test(text)) adoptStock(text);
            else await adoptStock(text);
            const data = await tTradingApi.simulate({
                code: targetForm.code.trim(),
                buyDate: targetForm.buyDate || undefined,
                endDate: targetForm.endDate || undefined,
                totalCapital: parseAmount(targetForm.totalCapital, '总资金'),
                availableCash: parseAmount(targetForm.availableCash, '可支配资金'),
                initialShares: parseAmount(targetForm.initialShares, '已有底仓',
                    { optional: true, allowZero: true }) ?? 0,
                // 成本价留空或填 0 都走后端「按买入日收盘价推定」
                initialAvgCost: parseAmount(targetForm.initialAvgCost, '底仓成本价',
                    { optional: true, allowZero: true }) || undefined,
                adjustFlag: Number(targetForm.adjustFlag),
                priceMode: targetForm.priceMode,
                strategy: buildStrategy(targetStrategy),
            });
            setResult(data);
            // 参数面板保持展开，方便对照参数看结果；展开/收起完全由用户点按钮控制
            setPickerOpen(false);
        } catch (error) {
            const message = error.message || '模拟运行失败';
            // 后端未重启时旧版本仍要求底仓成本必填，给出可操作的提示而不是裸 400
            setActionError(
                /底仓成本价/.test(message) && Number(targetForm.initialShares) > 0 && !targetForm.initialAvgCost
                    ? `${message}；请重启 Spring Boot 后端以启用自动推定，或手工填写底仓成本价`
                    : message,
            );
        } finally {
            setRunning(false);
        }
    };

    /**
     * 首次进入页面（全新会话、尚无保存结果）时，自动用默认参数跑一次贵州茅台，
     * 让页面直接展示统计卡、曲线与建议；之后切页回来只还原，不重复请求。
     */
    useEffect(() => {
        if (autoRanRef.current || initialized || result) return;
        if (!defaults.data && !defaults.error) return;
        autoRanRef.current = true;
        setInitialized(true);
        run(form, defaults.data ? strategyFromDefaults(defaults.data) : undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaults.data, defaults.error, initialized, result]);

    const hasKline = Boolean(result?.kline?.length);
    // 旧会话里保存的结果没有 kline 字段时自动退回折线视图，避免空图
    const effectiveChartMode = chartMode === 'kline' && hasKline ? 'kline' : 'line';
    const priceOption = useMemo(
        () => !result ? null
            : effectiveChartMode === 'kline'
                ? klineOption(result)
                : priceCostOption(result.equity, result.trades),
        [result, effectiveChartMode],
    );
    const assetChartOption = useMemo(
        () => result ? assetOption(result.equity, result.initialAssets) : null,
        [result],
    );

    const trades = result?.trades ?? [];
    const advices = result?.advices ?? [];
    const logPages = Math.max(1, Math.ceil(trades.length / LOG_PAGE_SIZE));
    const pageRows = trades.slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE);
    const displayName = result?.name || stockName || form.code;

    return (
        <div className="score-page t-page">
            <div className="page-intro">
                <h1>做T模型</h1>
            </div>

            <Panel title="模拟参数" className={paramsOpen ? '' : 't-panel-collapsed'} extra={
                paramsOpen ? (
                    <div className="t-panel-tools">
                        <button type="button" className="ghost" onClick={() => setShowAdvanced((v) => !v)}>
                            {showAdvanced ? '收起高级参数' : '调整策略参数'}
                        </button>
                        {result ? (
                            <button type="button" className="ghost"
                                    onClick={() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                                查看结果 ↓
                            </button>
                        ) : null}
                        <button type="button" className="ghost" onClick={() => setParamsOpen(false)}>
                            收起参数
                        </button>
                    </div>
                ) : null
            }>
                {paramsOpen ? (
                    <>
                        <div className="t-form">
                            <label className="field t-stock-field">
                                <ParamLabel tip={FORM_TIPS.code}>
                                    股票 / 中文名
                                    {stockName ? <em className="t-picked">{stockName}</em> : null}
                                </ParamLabel>
                                <div className="t-stock-picker" ref={pickerRef}>
                                    <input value={form.code} onChange={(e) => onCodeChange(e.target.value)}
                                           placeholder="如 600519 / 贵州茅台 / 000001"
                                           autoComplete="off"
                                           onFocus={() => stockOptions.length && setPickerOpen(true)}
                                           onKeyDown={(e) => {
                                               if (e.key !== 'Enter') return;
                                               if (pickerOpen && stockOptions.length) {
                                                   e.preventDefault();
                                                   chooseStock(stockOptions[0]);
                                               } else {
                                                   run();
                                               }
                                           }}/>
                                    {pickerOpen && stockOptions.length ? (
                                        <ul className="t-suggest">
                                            {stockOptions.map((item) => (
                                                <li key={item.code} onClick={() => chooseStock(item)}
                                                    title={`${item.code} ${item.name || ''}`}>
                                                    <span className="t-suggest-code">{item.code}</span>
                                                    <span className="t-suggest-name">{item.name}</span>
                                                    {item.board ? <span className="t-suggest-board">{item.board}</span> : null}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                            </label>
                            <label className="field"><ParamLabel tip={FORM_TIPS.buyDate}>初始买入日期</ParamLabel>
                                <input type="date" value={form.buyDate}
                                       onChange={(e) => { update('buyDate', e.target.value); setDatePreset(''); }}/>
                            </label>
                            <label className="field"><ParamLabel tip={FORM_TIPS.endDate}>结束日期</ParamLabel>
                                <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)}/>
                            </label>
                            <label className="field"><ParamLabel tip={FORM_TIPS.totalCapital}>总资金（元）</ParamLabel>
                                <DecimalInput step="1000" value={form.totalCapital}
                                              onChange={(value) => update('totalCapital', value)}/>
                            </label>
                            <label className="field"><ParamLabel tip={FORM_TIPS.availableCash}>可支配资金（元）</ParamLabel>
                                <DecimalInput step="1000" value={form.availableCash}
                                              onChange={(value) => update('availableCash', value)}/>
                            </label>
                            <label className="field"><ParamLabel tip={FORM_TIPS.initialShares}>已有底仓（股）</ParamLabel>
                                <DecimalInput step="100" value={form.initialShares}
                                              onChange={(value) => update('initialShares', value)}/>
                            </label>
                            <label className="field"><ParamLabel tip={FORM_TIPS.initialAvgCost}>底仓成本价（元）</ParamLabel>
                                <DecimalInput step="0.01" value={form.initialAvgCost}
                                              placeholder="留空按买入日收盘价推定"
                                              onChange={(value) => update('initialAvgCost', value)}/>
                            </label>
                            <label className="field"><ParamLabel tip={FORM_TIPS.adjustFlag}>复权口径</ParamLabel>
                                <select value={form.adjustFlag} onChange={(e) => update('adjustFlag', e.target.value)}>
                                    <option value="2">前复权</option>
                                    <option value="1">后复权</option>
                                    <option value="3">不复权</option>
                                </select>
                            </label>
                            <label className="field"><ParamLabel tip={FORM_TIPS.priceMode}>成交模式</ParamLabel>
                                <select value={form.priceMode} onChange={(e) => update('priceMode', e.target.value)}>
                                    <option value="CLOSE">收盘价（保守）</option>
                                    <option value="INTRADAY">日内触发价（高抛低吸）</option>
                                </select>
                            </label>

                            <div className="t-presets">
                                <ParamLabel tip={FORM_TIPS.datePreset}>买入日期快捷</ParamLabel>
                                {DATE_PRESETS.map((preset) => (
                                    <button type="button" key={preset.key}
                                            className={`t-preset-btn ${datePreset === preset.key ? 'active' : ''}`}
                                            onClick={() => applyPreset(preset)}>
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {showAdvanced ? (
                            <div className="t-param-groups">
                                {PARAM_GROUPS.map((group) => (
                                    <div className="t-param-group" key={group.title}>
                                        <div className="t-param-title">{group.title}</div>
                                        <div className="t-param-items">
                                            {group.items.map((item) => (
                                                <label className="field" key={item.key}>
                                                    <ParamLabel tip={item.tip}>{item.label}（{item.unit}）</ParamLabel>
                                                    <DecimalInput
                                                        step={item.step}
                                                        allowNegative={item.min < 0}
                                                        value={strategy[item.key] ?? ''}
                                                        onChange={(value) => updateParam(item.key, value)}
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <div className="t-param-switches">
                                    <label className="checkbox">
                                        <input type="checkbox" checked={strategy.useMaFilter !== false}
                                               onChange={(e) => updateParam('useMaFilter', e.target.checked)}/>
                                        <ParamLabel tip={FORM_TIPS.useMaFilter}>建仓时启用 MA20 过滤</ParamLabel>
                                    </label>
                                    <label className="checkbox">
                                        <input type="checkbox" checked={strategy.includeFee !== false}
                                               onChange={(e) => updateParam('includeFee', e.target.checked)}/>
                                        <ParamLabel tip={FORM_TIPS.includeFee}>计入佣金 / 印花税 / 过户费</ParamLabel>
                                    </label>
                                </div>
                            </div>
                        ) : null}

                        <div className="t-form-actions">
                            <button type="button" className="score-rebuild" onClick={() => run()} disabled={running}>
                                {running ? '模拟中…' : '开始模拟'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="t-param-brief">
                        <span><strong>{displayName}</strong>（{form.code}）</span>
                        <span>买入 {form.buyDate || '数据起始日'}</span>
                        <span>计划结束 {form.endDate || '最新交易日'}</span>
                        <span>资金 {compactMoney(form.totalCapital)} / {compactMoney(form.availableCash)} · 底仓 {form.initialShares || 0} 股</span>
                        <span>{ADJUST_LABEL[form.adjustFlag]} · {form.priceMode === 'CLOSE' ? '收盘价' : '日内触发价'}</span>
                        {result ? (
                            <span className="t-brief-range">
                                实际 {result.startDate} ~ {result.endDate}
                                {result.initialCostEstimated ? ' · 底仓成本按买入日收盘价推定' : ''}
                            </span>
                        ) : null}
                        <button type="button" className="ghost" onClick={() => setParamsOpen(true)}>修改参数</button>
                    </div>
                )}
            </Panel>

            <ErrorBanner message={[defaults.error, actionError].filter(Boolean).join('；')}
                         onRetry={defaults.reload}/>

            {!result && !running ? (
                <div className="panel t-empty">
                    填写参数后点击「开始模拟」，即可查看成交日志、成本变化曲线和下一步操作建议。
                </div>
            ) : null}

            {result ? (
                <div className="t-result" ref={resultRef}>
                    <div className="t-summary">
                        <span className="t-summary-text" title={result.summary}>{result.summary}</span>
                        <span className="t-range">实际回放 {result.startDate} ~ {result.endDate}（{result.tradingDays} 个交易日）</span>
                        <button type="button" className="ghost" onClick={() => setShowNotes((v) => !v)}>
                            {showNotes ? '收起说明' : '策略说明'}
                        </button>
                    </div>

                    <div className="stat-grid t-stat-grid">
                        <StatCard label="期末总资产" value={compactMoney(result.totalAssets)}
                                  hint={`期初 ${money(result.initialAssets)}`}/>
                        <StatCard label="总收益率" value={signed(result.totalReturnPct)}
                                  tone={pctClass(result.totalReturnPct)}
                                  hint={`总盈亏 ${money(result.totalPnl)}`}/>
                        <StatCard label="已实现盈亏" value={compactMoney(result.realizedPnl)}
                                  tone={pctClass(result.realizedPnl)} hint="高抛低吸与减仓落袋"/>
                        <StatCard label="浮动盈亏" value={compactMoney(result.floatingPnl)}
                                  tone={pctClass(result.floatingPnl)} hint="按期末收盘价计算"/>
                        <StatCard label="摊薄成本 / 回本价" value={formatPrice(result.dilutedCost)}
                                  hint={`账面 ${formatPrice(result.avgCost)} · 摊薄 ${signed(result.costReductionPct)}`}/>
                        <StatCard label="当前持仓" value={`${result.finalPosition} 股`}
                                  hint={`${result.status} · 现金 ${compactMoney(result.finalCash)}`}/>
                        <StatCard label="做T / 补仓次数" value={`${result.tBuybackCount + result.reverseReduceCount} 次`}
                                  hint={`补 ${result.addCount} · 正T ${result.tBuybackCount} · 倒T ${result.reverseReduceCount} · 共 ${result.tradeCount} 笔`}/>
                        <StatCard label="最大回撤" value={signed(result.maxDrawdownPct)}
                                  tone="down" hint={`手续费 ${money(result.feeTotal)}`}/>
                    </div>

                    <div className="t-chart-row">
                        <Panel title={`${displayName}（${form.code}）${effectiveChartMode === 'kline' ? '日K线与成本' : '股价与成本走势'}`}
                               extra={
                            <div className="t-chart-switch">
                                <button type="button" disabled={!hasKline}
                                        className={`t-preset-btn ${effectiveChartMode === 'kline' ? 'active' : ''}`}
                                        onClick={() => setChartMode('kline')}>K线</button>
                                <button type="button"
                                        className={`t-preset-btn ${effectiveChartMode === 'line' ? 'active' : ''}`}
                                        onClick={() => setChartMode('line')}>折线</button>
                            </div>
                        }>
                            <EChart option={priceOption} height={230}
                                    empty={effectiveChartMode === 'kline' ? !hasKline : !result.equity?.length}
                                    emptyText={effectiveChartMode === 'kline' ? '暂无K线数据' : '暂无行情数据'}/>
                        </Panel>
                        <Panel title="总资产与回撤">
                            <EChart option={assetChartOption} height={230} empty={!result.equity?.length}
                                    emptyText="暂无资产曲线"/>
                        </Panel>
                    </div>

                    <div className="t-detail-row">
                        <Panel title={`操作日志（${trades.length} 笔）`} extra={
                            trades.length > LOG_PAGE_SIZE ? (
                                <div className="t-pager">
                                    <button type="button" className="ghost" disabled={logPage === 0}
                                            onClick={() => setLogPage((p) => p - 1)}>上一页</button>
                                    <span>{logPage + 1} / {logPages}</span>
                                    <button type="button" className="ghost" disabled={logPage >= logPages - 1}
                                            onClick={() => setLogPage((p) => p + 1)}>下一页</button>
                                </div>
                            ) : null
                        }>
                            <div className="table-wrap t-log-wrap">
                                <table className="data-table t-log-table">
                                    <thead>
                                    <tr>
                                        <th>日期</th><th>动作</th><th>成交价</th><th>股数</th><th>金额</th>
                                        <th>费用</th><th>可用现金</th><th>持仓</th><th>账面成本</th>
                                        <th>摊薄成本</th><th>已实现盈亏</th><th>触发原因</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {pageRows.map((row, index) => (
                                        <tr key={`${row.tradeDate}-${index}`}>
                                            <td>{row.tradeDate}</td>
                                            <td><span className={`t-action t-action-${ACTION_TONE[row.action] || 'hold'}`}>{row.actionLabel}</span></td>
                                            <td>{formatPrice(row.price)}</td>
                                            <td className={row.shares > 0 ? 'up' : 'down'}>{row.shares > 0 ? '+' : ''}{row.shares}</td>
                                            <td>{money(row.amount)}</td>
                                            <td>{money(row.fee)}</td>
                                            <td>{money(row.cashAfter)}</td>
                                            <td>{row.positionAfter}</td>
                                            <td>{formatPrice(row.avgCostAfter)}</td>
                                            <td className="t-diluted">{formatPrice(row.dilutedCostAfter)}</td>
                                            <td className={pctClass(row.realizedPnlAfter)}>{money(row.realizedPnlAfter)}</td>
                                            <td className="t-reason" title={row.reason}>{row.reason}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                                {!trades.length ? <div className="empty">区间内没有产生任何成交</div> : null}
                            </div>
                        </Panel>

                        <Panel title="下一步操作建议">
                            <div className="t-advice-grid t-advice-compact">
                                {advices.map((item, index) => (
                                    <div className={`t-advice t-advice-${ACTION_TONE[item.action] || 'hold'}`}
                                         key={`${item.action}-${index}`}
                                         title={`${item.reason}\n执行后摊薄成本约 ${formatPrice(item.expectDilutedCost)}\n风险：${item.risk}`}>
                                        <div className="t-advice-line">
                                            <span className="t-advice-action">{item.actionLabel}</span>
                                            <span className="t-advice-price">
                                                触发 <strong>{formatPrice(item.triggerPrice)}</strong>
                                                <span className={pctClass(item.distancePct)}>{signed(item.distancePct)}</span>
                                            </span>
                                            <span className="t-advice-shares">{item.shares} 股</span>
                                        </div>
                                        <p>{item.reason}</p>
                                        <div className="t-advice-risk">风险：{item.risk}</div>
                                    </div>
                                ))}
                            </div>
                            {!advices.length ? <div className="empty">当前无可执行建议</div> : null}
                        </Panel>
                    </div>

                    <div className="t-notes">
                        <span className="t-risk-line">
                            风险提示：基于历史日线的规则回放，未考虑涨跌停、停牌、滑点与盘中成交顺序，结果为研究用途，不构成投资建议。
                        </span>
                    </div>

                    {showNotes ? (
                        <Panel title="策略原理与口径说明">
                            <div className="metric-explain-grid">
                                <div><strong>账面成本</strong><span>移动加权平均价，买入摊入手续费、卖出不改变，接近券商显示的持仓成本。</span></div>
                                <div><strong>摊薄成本（回本价）</strong><span>累计净投入 ÷ 剩余股数。每次高抛低吸、补仓反弹减仓的价差都会把它压低；股价站上它即整体回本。</span></div>
                                <div><strong>做T摊薄幅度</strong><span>摊薄成本相对账面成本的降幅，等于累计高抛低吸价差 ÷ 剩余股数 ÷ 账面成本。两者都是当前这批持仓的口径，中途清仓重建仓会自动重置；显示为 0 表示本批仓位建仓后尚未完成新的做T闭环，可在操作日志逐笔查看变化。</span></div>
                                <div><strong>正T（高抛低吸）</strong><span>相对成本上涨到阈值先卖出部分底仓，回落后再买回同等股数，用价差摊薄成本；超过设定交易日仍未回落则按市价强制回补。</span></div>
                                <div><strong>倒T（低吸高抛）</strong><span>相对成本下跌到阈值用可支配资金补仓，反弹到目标后减掉补仓部分，形成低吸高抛闭环。</span></div>
                                <div><strong>回本离场</strong><span>摊薄成本较初始成本降到目标幅度、已有已实现盈利、且现价站上摊薄成本时清仓离场；本金已收回（摊薄成本≤0）同样触发。</span></div>
                                <div><strong>资金与风控约束</strong><span>整手 100 股、买入前校验可用现金与单票市值上限、T+1 当日买入不可卖、止损优先于一切补仓与回补动作。</span></div>
                                <div><strong>交易费用</strong><span>默认佣金万 2.5（单笔最低 5 元）、卖出印花税万 5、双向过户费十万分之一，全部计入现金流与成本。</span></div>
                                <div><strong>技术过滤</strong><span>MA5/10/20、5 日均量、近 20 日支撑压力；建仓要求站上 MA20，换手率默认下限 0.3%（填 0 关闭）、振幅上限 9.5%，字段缺失时跳过该过滤。</span></div>
                                <div><strong>成交模式</strong><span>收盘价模式按当日收盘价判定与成交；日内模式用当日最高/最低价是否触及目标价判定，并按目标价成交，属于理想化限价单假设。</span></div>
                                <div><strong>数据口径</strong><span>读取本地 stock_daily_00/30/60 分表的日线，买入日前额外预热 75 个自然日计算指标；最多回放 1200 个交易日，全程只读不写库。</span></div>
                            </div>
                        </Panel>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
