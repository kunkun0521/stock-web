import { useState } from 'react';
import { usePersistedState } from '../hooks/usePersistedState.js';
import './klineIndicatorGuide.css';

/**
 * K 线图指标速查与解释。
 * 默认只占一行 chips（英文缩写 + 中文短名），点「详细解释」或任意 chip 展开公式与用法卡片。
 * 文案口径与后端 IndicatorCalculator、charts/options.js 保持一致。
 */
const INDICATORS = [
    {
        key: 'K线', short: 'K线', color: '#d8392b', group: 'K 线与均线',
        name: '阴阳烛 / 蜡烛图',
        formula: '每根 = [开, 收, 低, 高]',
        desc: '柱体表示开盘价与收盘价，上下影线表示当日最低价与最高价。按 A 股习惯红涨绿跌；周线 / 月线由日线按自然周、自然月聚合。',
    },
    {
        key: 'MA5', short: '5日均线', color: '#e8a33d', group: 'K 线与均线',
        name: 'MA5 · 5 日移动平均线',
        formula: 'MA5 = (Cₜ + Cₜ₋₁ + … + Cₜ₋₄) / 5',
        desc: '最近 5 个交易日收盘价的简单算术平均，反映最短期价格重心。价格上穿常被看作短线转强。数据不足 5 根时该段不绘制。',
    },
    {
        key: 'MA10', short: '10日均线', color: '#3f8cff', group: 'K 线与均线',
        name: 'MA10 · 10 日移动平均线',
        formula: 'MA10 = (Cₜ + … + Cₜ₋₉) / 10',
        desc: '最近 10 个交易日（约两周）收盘价平均，常用来观察短线趋势是否延续，与 MA5 的金叉 / 死叉是常见短线信号。',
    },
    {
        key: 'MA20', short: '20日均线', color: '#9b59b6', group: 'K 线与均线',
        name: 'MA20 · 20 日移动平均线',
        formula: 'MA20 = (Cₜ + … + Cₜ₋₁₉) / 20',
        desc: '约一个月的收盘价平均，也是布林带 BOLL 的中轨。中期多空分界常用参考。',
    },
    {
        key: 'MA60', short: '60日均线', color: '#4b5563', group: 'K 线与均线',
        name: 'MA60 · 60 日移动平均线',
        formula: 'MA60 = (Cₜ + … + Cₜ₋₅₉) / 60',
        desc: '约一个季度的收盘价平均，俗称「季线」，用于判断中期趋势方向；需要至少 60 根 K 线才有值。',
    },
    {
        key: 'VOL', short: '成交量', color: '#d8392b', group: '成交量与 MACD',
        name: 'VOL · 成交量',
        formula: '当日成交股数（柱高）',
        desc: '主图下方第一副图，涨用红色、跌用绿色。放量通常代表分歧加大或资金介入，配合价格突破一起看更可靠。',
    },
    {
        key: 'DIF', short: 'MACD快线', color: '#e8a33d', group: '成交量与 MACD',
        name: 'DIF · 差离值（快线）',
        formula: 'DIF = EMA(12) − EMA(26)',
        desc: '12 日指数移动平均减去 26 日指数移动平均，衡量短期与中期均线差距。EMA 以首值作种子，系数 k = 2/(N+1)。',
    },
    {
        key: 'DEA', short: 'MACD慢线', color: '#3f8cff', group: '成交量与 MACD',
        name: 'DEA · 信号线（慢线）',
        formula: 'DEA = EMA(DIF, 9)',
        desc: 'DIF 的 9 日指数移动平均。DIF 上穿 DEA 为金叉，下穿为死叉，是常用的趋势转折观察点。',
    },
    {
        key: 'MACD', short: '能量柱', color: '#17924e', group: '成交量与 MACD',
        name: 'MACD · 能量柱',
        formula: 'MACD 柱 = 2 × (DIF − DEA)',
        desc: '最下方副图的柱状图，正值画红柱、负值画绿柱。柱体由短变长代表动能增强，缩短代表动能衰减。本项目按 12/26/9 参数计算。',
    },
    {
        key: 'BOLL', short: '布林带', color: '#9ca3af', group: '布林带',
        name: 'BOLL · 布林带上 / 下轨',
        formula: '上/下轨 = MA20 ± 2 × σ₂₀（总体标准差）',
        desc: '图中灰色虚线，中轨即 MA20。价格贴近上轨说明短期偏强、贴近下轨偏弱；带宽收窄往往预示波动放大。项目使用 20 日窗口、2 倍总体标准差。',
    },
];

const PANEL_METRICS = [
    { key: 'PE', name: 'PE(TTM) · 滚动市盈率', formula: '股价 / 最近 12 个月每股收益', desc: '估值高低参考，亏损公司为负值或不适用；不同行业之间不宜直接横向比较。' },
    { key: 'PB', name: 'PB · 市净率', formula: '股价 / 每股净资产（最新报告期）', desc: '衡量股价相对净资产的倍数，重资产行业参考意义更强。' },
    { key: '换手率', name: '换手率 · Turnover Rate', formula: '成交量 / 流通股本 × 100%', desc: '当日筹码交换比例，越高说明交易越活跃、分歧越大。' },
    { key: '振幅', name: '振幅 · Amplitude', formula: '(最高价 − 最低价) / 昨收 × 100%', desc: '当日价格波动幅度，反映日内波动剧烈程度。' },
    { key: '年化波动率', name: '年化波动率 · Annualized Volatility', formula: '日收益率标准差 × √252 × 100%', desc: '把区间内日收益波动折算成一年的尺度，数值越大风险越高；统计区间见「区间涨跌幅」下方日期。' },
    { key: '复权', name: '复权口径 · Adjust Flag', formula: '1 后复权 / 2 前复权 / 3 不复权', desc: 'K 线与明细默认取前复权（2），把历史价格按分红送股调整到当前口径，便于连续比较。' },
];

const GROUPS = ['K 线与均线', '成交量与 MACD', '布林带', '盘面与统计指标'];
const DETAIL_ITEMS = [
    ...INDICATORS,
    ...PANEL_METRICS.map((m) => ({ ...m, group: '盘面与统计指标' })),
];

function ExplainCard({ item, active, onPick }) {
    return (
        <div
            className={`sd-explain-card${active ? ' active' : ''}`}
            onClick={() => onPick(item.key)}
            role="button"
            tabIndex={0}
        >
            <strong>
                {item.color ? <i className="sd-swatch" style={{ background: item.color }}/> : null}
                {item.name}
            </strong>
            <code>{item.formula}</code>
            <span>{item.desc}</span>
        </div>
    );
}

export default function KlineIndicatorGuide() {
    const [detailOpen, setDetailOpen] = usePersistedState('stock-detail:indicatorOpen', false);
    const [activeKey, setActiveKey] = usePersistedState('stock-detail:indicatorKey', 'MA5');
    // 默认只展开一组，避免解释区一次撑出六行卡片、把 K 线挤到屏幕外
    const [group, setGroup] = useState(GROUPS[0]);

    const pick = (key) => {
        setActiveKey(key);
        setDetailOpen(true);
        const hit = DETAIL_ITEMS.find((x) => x.key === key);
        if (hit && group !== hit.group) setGroup(hit.group);
    };

    const visible = group === '全部' ? DETAIL_ITEMS : DETAIL_ITEMS.filter((x) => x.group === group);

    return (
        <section className="sd-guide">
            <div className="sd-guide-head">
                <div className="sd-guide-title">
                    <b>指标速查</b>
                    <span className="muted">图中英文缩写对照 · 点任意指标查看公式和用法</span>
                </div>
                <button type="button" className="sd-link" onClick={() => setDetailOpen(!detailOpen)}>
                    {detailOpen ? '收起解释' : '详细解释'}
                </button>
            </div>

            <div className="sd-chips">
                {INDICATORS.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        className={`sd-chip${detailOpen && activeKey === item.key ? ' active' : ''}`}
                        onClick={() => pick(item.key)}
                        title={`${item.name}：${item.desc}`}
                    >
                        <i className="sd-swatch" style={{ background: item.color }}/>
                        <b>{item.key}</b>
                        <span>{item.short}</span>
                    </button>
                ))}
            </div>

            {detailOpen ? (
                <div className="sd-explain">
                    <div className="sd-group-tabs">
                        {[...GROUPS, '全部'].map((g) => (
                            <button
                                key={g}
                                type="button"
                                className={group === g ? 'active' : ''}
                                onClick={() => setGroup(g)}
                            >
                                {g}
                            </button>
                        ))}
                        <span className="muted sd-guide-note">
                            指标由后端按日线收盘价计算，样本不足的区间不会绘制；仅用于数据研究，不构成投资建议。
                        </span>
                    </div>
                    <div className="sd-explain-grid">
                        {visible.map((item) => (
                            <ExplainCard key={item.key} item={item} active={activeKey === item.key} onPick={pick}/>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
