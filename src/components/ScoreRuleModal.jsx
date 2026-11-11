import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './scoreRuleModal.css';

/**
 * 量化评分规则说明弹窗。
 *
 * 内容严格对齐后端 ScoreCalculationService / ScoreCalculationMapper.xml 的实现：
 * 15 个原始特征 → 横截面分位 → 5 个因子分 → 按权重归一化合成 0—100 分。
 * 组件通过 portal 挂到 body，默认关闭且不占文档流，开关不影响原页面布局与状态。
 */

const TABS = [
    { key: 'flow', label: '怎么打分' },
    { key: 'metrics', label: '指标与公式' },
    { key: 'weight', label: '权重与算例' },
    { key: 'limits', label: '口径与限制' },
];

const WEIGHTS = [
    { key: 'value', name: '价值', weight: '0.25', percent: 25, color: '#2f6fed', desc: '估值越便宜越好' },
    { key: 'momentum', name: '动量', weight: '0.30', percent: 30, color: '#d8392b', desc: '过去涨得越强越好' },
    { key: 'trend', name: '趋势', weight: '0.15', percent: 15, color: '#0f8a62', desc: '价格站在均线之上、突破前高越好' },
    { key: 'risk', name: '风险', weight: '0.20', percent: 20, color: '#8a5cd6', desc: '波动越小、回撤越浅越好' },
    { key: 'liquidity', name: '流动性', weight: '0.10', percent: 10, color: '#c47a12', desc: '成交活跃度越高越好' },
];

const FACTORS = [
    {
        name: '价值', weight: '0.25', direction: '越低越好', tone: 'blue',
        intro: '看估值贵不贵。四个指标都先剔除小于等于 0 的异常值（亏损公司的 PE 为负，不参与比较），数值越小代表越便宜，分位分越高。',
        rows: [
            { name: 'PE (TTM)', field: 'pe_ttm', formula: '市盈率（滚动十二个月）', plain: '股价 / 每股近 12 个月盈利。越低说明回本年限越短。' },
            { name: 'PB (MRQ)', field: 'pb_mrq', formula: '市净率（最新报告期）', plain: '股价 / 每股净资产。越低说明相对净资产越便宜。' },
            { name: 'PS (TTM)', field: 'ps_ttm', formula: '市销率（滚动十二个月）', plain: '市值 / 近 12 个月营业收入。适合给尚未盈利的公司做横向比较。' },
            { name: 'PCF (NCF, TTM)', field: 'pcf_ncf_ttm', formula: '市现率（滚动净现金流）', plain: '市值 / 近 12 个月净现金流。越低说明现金流回报越划算。' },
        ],
    },
    {
        name: '动量', weight: '0.30', direction: '越高越好', tone: 'red',
        intro: '看过去一段时间的累计涨幅。d 是交易日数量，不是自然日；历史数据不足 d 根时该指标为空，不参与打分。',
        rows: [
            { name: '21 日收益', field: 'ret_21', formula: 'ret_d = C_t / C_(t-d) - 1，d = 21', plain: '约一个月的涨幅，反映短期强弱。' },
            { name: '63 日收益', field: 'ret_63', formula: 'ret_d = C_t / C_(t-d) - 1，d = 63', plain: '约一个季度的涨幅。' },
            { name: '126 日收益', field: 'ret_126', formula: 'ret_d = C_t / C_(t-d) - 1，d = 126', plain: '约半年的涨幅。' },
            { name: '252 日收益', field: 'ret_252', formula: 'ret_d = C_t / C_(t-d) - 1，d = 252', plain: '约一年的涨幅，代表中期动量。' },
        ],
    },
    {
        name: '趋势', weight: '0.15', direction: '越高越好', tone: 'green',
        intro: '看当前价相对均线与前高的位置。MA 是简单算术平均，取最近 window 根收盘价；不足 window 根则该指标为空。',
        rows: [
            { name: '20 日乖离', field: 'trend20', formula: 'C_t / MA20(C) - 1，MA20 = (1/20)·Σ C_(t-19..t)', plain: '股价高出 20 日均线多少。为正说明短期处在均线之上。' },
            { name: '60 日乖离', field: 'trend60', formula: 'C_t / MA60(C) - 1，MA60 = (1/60)·Σ C_(t-59..t)', plain: '股价高出季线的幅度，反映中期趋势。' },
            { name: '120 日突破', field: 'breakout120', formula: 'C_t / max(C_(t-120..t-1)) - 1', plain: '与不含当日的过去 120 个交易日最高收盘价比较；大于 0 表示创出新高。' },
        ],
    },
    {
        name: '风险', weight: '0.20', direction: '数值越大越好', tone: 'purple',
        intro: '两个指标都衡量「亏得有多狠」。波动率越低越好；最大回撤是负数（如 -0.28 表示曾从高点回撤 28%），越接近 0 越好，所以按数值越大越好处理。',
        rows: [
            { name: '60 日年化波动率', field: 'vol_60', formula: 'σ_daily = sqrt( Σ(r_i - r̄)² / (n-1) )，r_i = ln(C_i / C_(i-1))；vol60 = σ_daily × √252', plain: '用最近 60 个交易日的对数日收益算样本标准差，再按一年 252 个交易日年化。数值越小越平稳。' },
            { name: '252 日最大回撤', field: 'drawdown_252', formula: 'min( C_i / max(C_j, j ≤ i) - 1 )，窗口 252 个交易日', plain: '一年内从历史最高收盘价跌到最低点的最大跌幅，结果为负数；越接近 0 表示抗跌。' },
        ],
    },
    {
        name: '流动性', weight: '0.10', direction: '越高越好', tone: 'orange',
        intro: '看这只股票最近是否活跃、是否容易买卖。两个指标都取最近 20 个交易日。',
        rows: [
            { name: '20 日量比', field: 'amount_ratio_20', formula: 'amount_t / (1/20)·Σ amount_(t-19..t)', plain: '当日成交额相对近 20 日均额的倍数；大于 1 表示今日明显放量。' },
            { name: '20 日平均换手率', field: 'turnover_20', formula: '(1/20)·Σ turnover_(t-19..t)', plain: '近 20 日平均换手率（百分比数值），越高说明筹码交换越活跃。' },
        ],
    },
];

const STEPS = [
    { no: '01', title: '取数与过滤', text: '从 stock_daily_all 读取评分日往前 420 个自然日、指定复权口径的全部日线，按股票分组、日期升序。只保留评分日当天有记录、收盘价有效且大于 0、非停牌、非 ST 的股票。' },
    { no: '02', title: '算 15 个原始特征', text: '每只股票算出价值 4 项、动量 4 项、趋势 3 项、风险 2 项、流动性 2 项。空值（历史不足、估值非正等）直接留空，不拿 0 代替。' },
    { no: '03', title: '横截面分位排名', text: '把当日全部可评分股票放在同一个池子里，为每个指标单独排序，算出该股票在此指标上的百分位（0~1）。估值、波动率这类「越低越好」的指标取 1 − 百分位。' },
    { no: '04', title: '加权合成并落库', text: '每个因子内部取有效指标的平均分位，乘 100 得到因子分；再按 5 个权重加权平均得到综合分（0~100），按分数降序排名写入 stock_score_daily。' },
];

const READING = [
    ['分数是相对名次，不是上涨概率', '80 分大致表示这只股票在五个因子的加权百分位上排在全市场前 20%，不代表它有 80% 的概率上涨。'],
    ['分数随样本池变化', '分位是当天横向比较出来的。同一只股票基本面不变，只要其他股票变了，分数也会变；不同日期的分数不宜直接当作涨跌来比较。'],
    ['高分不等于低风险', '动量权重最高（0.30），高分股往往是近期涨幅较大的股票，可能同时意味着追高风险；风险因子只占 0.20。'],
    ['缺失指标会被跳过', '因子内某个指标为空就只算剩下的；整个因子都为空时，该因子不参与，分母用剩余权重重新归一化，不会被当成 0 分。'],
];

export function ScoreRuleButton({ onClick }) {
    return (
        <button
            type="button"
            className="srm-trigger"
            onClick={onClick}
            title="查看综合评分的计算规则、公式与口径（浮层，不影响页面）"
        >
            <span className="srm-trigger-icon" aria-hidden="true">?</span>评分规则说明
        </button>
    );
}

export default function ScoreRuleModal({ open, onClose }) {
    const [tab, setTab] = useState('flow');
    const closeRef = useRef(onClose);

    useEffect(() => { closeRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
            if (event.key === 'Escape') closeRef.current?.();
        };
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div className="srm-mask" onMouseDown={onClose}>
            <div
                className="srm-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="量化评分规则说明"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="srm-head">
                    <div>
                        <h2>量化评分是怎么打出来的</h2>
                        <p>日频横截面多因子模型 · 0—100 分 · 说明与公式以后端 ScoreCalculationService 为准</p>
                    </div>
                    <button type="button" className="srm-close" onClick={onClose} aria-label="关闭">关闭</button>
                </header>

                <nav className="srm-tabs" aria-label="说明分区">
                    {TABS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={tab === item.key ? 'active' : ''}
                            onClick={() => setTab(item.key)}
                        >{item.label}</button>
                    ))}
                </nav>

                <div className="srm-body">
                    {tab === 'flow' ? (
                        <>
                            <p className="srm-lead">
                                一句话：<b>把当天全市场股票放在同一条起跑线上，用 5 类因子共 15 个指标分别排名，
                                再按权重加权成一个 0—100 的综合分。</b>它衡量的是「当前横截面相对表现」，不是买卖信号。
                            </p>

                            <h3 className="srm-h3">一、四步打分流程</h3>
                            <div className="srm-steps">
                                {STEPS.map((step) => (
                                    <div className="srm-step" key={step.no}>
                                        <span className="srm-step-no">{step.no}</span>
                                        <div>
                                            <strong>{step.title}</strong>
                                            <p>{step.text}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <h3 className="srm-h3">二、数据口径</h3>
                            <div className="srm-table-wrap">
                                <table className="srm-table">
                                    <thead><tr><th>项目</th><th>取值</th><th>说明</th></tr></thead>
                                    <tbody>
                                        <tr><td>评分日 asOfDate</td><td><code>MAX(trade_date)</code> 或手动指定</td><td>严格截止到该日，不使用之后的行情，避免未来数据泄漏。</td></tr>
                                        <tr><td>历史窗口</td><td><code>420 个自然日</code></td><td><code>trade_date BETWEEN DATE_SUB(asOfDate, INTERVAL 420 DAY) AND asOfDate</code>；约覆盖 252 个交易日，够算一年动量与回撤。</td></tr>
                                        <tr><td>数据来源</td><td><code>stock_daily_all</code></td><td>由 <code>stock_daily_00 / 30 / 60</code> 三张分表 UNION ALL 而成，按代码前缀拆分。</td></tr>
                                        <tr><td>复权口径</td><td>1 后复权 / 2 前复权 / 3 不复权</td><td>默认前复权（2）。同一批计算全程只用一种口径，价格类指标才可比。</td></tr>
                                        <tr><td>剔除条件</td><td>停牌 / ST / 无当日记录 / 收盘价无效</td><td>要求最后一根 K 线就是评分日、<code>close &gt; 0</code>、<code>tradestatus ≠ 0</code>、<code>is_st ≠ 1</code>。</td></tr>
                                        <tr><td>结果表</td><td><code>stock_score_daily</code></td><td>主键 <code>(code, market, trade_date, adjustflag)</code>，<code>ON DUPLICATE KEY UPDATE</code> 幂等，同一天重复计算只更新不新增。</td></tr>
                                    </tbody>
                                </table>
                            </div>

                            <h3 className="srm-h3">三、分数该怎么读</h3>
                            <div className="srm-notes">
                                {READING.map(([title, text]) => (
                                    <div className="srm-note" key={title}><strong>{title}</strong><p>{text}</p></div>
                                ))}
                            </div>
                        </>
                    ) : null}

                    {tab === 'metrics' ? (
                        <>
                            <p className="srm-lead">
                                下面 15 个指标就是评分用到的全部原始输入。先看每一项的公式与含义，
                                再看「权重与算例」页里它们如何被转换成 0—100 分。
                            </p>
                            {FACTORS.map((factor) => (
                                <section className="srm-factor" key={factor.name}>
                                    <div className="srm-factor-head">
                                        <span className={`srm-factor-tag srm-tone-${factor.tone}`}>{factor.name}</span>
                                        <span className="srm-factor-meta">权重 {factor.weight} · {factor.direction} · {factor.rows.length} 个指标</span>
                                    </div>
                                    <p className="srm-factor-intro">{factor.intro}</p>
                                    <div className="srm-table-wrap">
                                        <table className="srm-table srm-metric-table">
                                            <thead><tr><th>指标</th><th>字段 / 公式</th><th>白话解释</th></tr></thead>
                                            <tbody>
                                                {factor.rows.map((row) => (
                                                    <tr key={row.field}>
                                                        <td><strong>{row.name}</strong><span className="srm-field">{row.field}</span></td>
                                                        <td><code className="srm-formula">{row.formula}</code></td>
                                                        <td>{row.plain}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            ))}
                            <p className="srm-footnote">
                                符号约定：<code>C_t</code> 为第 t 个交易日收盘价，<code>MA_n</code> 为最近 n 个收盘价的简单算术平均，
                                <code>Σ</code> 为求和，<code>ln</code> 为自然对数，<code>√252</code> 为按一年 252 个交易日年化。
                                页面表格里的「21日 / 63日 / PE / PB / 波动率 / 最大回撤」就是这些原始值（百分比展示时乘以 100）。
                            </p>
                        </>
                    ) : null}

                    {tab === 'weight' ? (
                        <>
                            <h3 className="srm-h3">一、单个指标：横截面百分位</h3>
                            <div className="srm-formula-block">
                                <code>p(x) = ( #{'{'}v &lt; x{'}'} + 0.5 × #{'{'}v = x{'}'} ) / N</code>
                                <code>s(x) = p(x)（越高越好）　或　s(x) = 1 − p(x)（越低越好）</code>
                            </div>
                            <p className="srm-para">
                                N 是当日全市场在该指标上<strong>有有效值</strong>的股票数；<code>#{'{'}v &lt; x{'}'}</code> 是比它差（数值更小）的个数，
                                <code>#{'{'}v = x{'}'}</code> 是与它并列的个数（并列取半，避免同分互相挤压）。
                                结果 s ∈ [0, 1]，0.5 代表正好在中位。估值、波动率这类「越低越好」的指标用 <code>1 − p</code> 翻转方向。
                            </p>

                            <h3 className="srm-h3">二、因子分与综合分</h3>
                            <div className="srm-formula-block">
                                <code>F_k = 100 × ( 1 / m_k ) × Σ s_(k,i)　（只对该因子中非空的 m_k 个指标求平均）</code>
                                <code>Score = 100 × [ Σ w_k × (F_k / 100) ] / Σ w_k　（k 取实际参与的因子）</code>
                            </div>
                            <p className="srm-para">
                                先在每个因子内部把有效指标的分位取平均，乘 100 就是页面上「因子分项」那一列的小条；
                                再按下面的权重加权。分母用<strong>实际参与因子的权重之和</strong>，所以某个因子整体缺数据时不会被当成 0 分，而是由其余因子按比例补足。
                                全部保留 6 位小数后写入结果表。
                            </p>

                            <h3 className="srm-h3">三、五类因子权重（合计 1.00）</h3>
                            <div className="srm-weights">
                                {WEIGHTS.map((item) => (
                                    <div className="srm-weight" key={item.key}>
                                        <span className="srm-weight-name">{item.name}</span>
                                        <div className="srm-weight-track">
                                            <i style={{ width: `${item.percent * 3}%`, background: item.color }}/>
                                        </div>
                                        <b>{item.weight}</b>
                                        <span className="srm-weight-desc">{item.desc}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="srm-footnote">
                                权重在后端是常量：价值 0.25、动量 0.30、趋势 0.15、风险 0.20、流动性 0.10。
                                动量占比最高，因此榜单会明显偏向近期强势股；这套权重是固定规则，不是模型训练出来的，也没有按行业中性化。
                            </p>

                            <h3 className="srm-h3">四、一个完整算例</h3>
                            <div className="srm-table-wrap">
                                <table className="srm-table">
                                    <thead><tr><th>因子</th><th>权重 w</th><th>假设因子分位 F/100</th><th>w × F/100</th></tr></thead>
                                    <tbody>
                                        <tr><td>价值</td><td>0.25</td><td>0.70</td><td>0.1750</td></tr>
                                        <tr><td>动量</td><td>0.30</td><td>0.85</td><td>0.2550</td></tr>
                                        <tr><td>趋势</td><td>0.15</td><td>0.60</td><td>0.0900</td></tr>
                                        <tr><td>风险</td><td>0.20</td><td>0.40</td><td>0.0800</td></tr>
                                        <tr><td>流动性</td><td>0.10</td><td>0.55</td><td>0.0550</td></tr>
                                        <tr className="srm-total"><td>合计</td><td>1.00</td><td>—</td><td>0.6550 → <b>65.5 分</b></td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="srm-para">
                                <b>如果「风险」因子整体缺数据</b>：分子变成 0.175 + 0.255 + 0.090 + 0.055 = 0.575，
                                分母变成 0.25 + 0.30 + 0.15 + 0.10 = 0.80，
                                综合分 = 0.575 / 0.80 × 100 = <b>71.875 分</b>。这就是「缺因子重新归一化」的效果。
                            </p>
                            <p className="srm-footnote">
                                最后按综合分降序（同分按代码升序）生成排名：<code>ROW_NUMBER() OVER (ORDER BY total_score DESC, code ASC)</code>。
                            </p>
                        </>
                    ) : null}

                    {tab === 'limits' ? (
                        <>
                            <div className="srm-table-wrap">
                                <table className="srm-table">
                                    <thead><tr><th>主题</th><th>说明</th></tr></thead>
                                    <tbody>
                                        <tr><td>计算触发</td><td>页面「实时计算评分」按钮、以及后端定时任务（启动时补算最近 10 个交易日、每日 21:30 重算最新交易日）走的是同一个算法与同一张结果表，结果一致且可重复覆盖。</td></tr>
                                        <tr><td>与连续评分筛选的关系</td><td>「连续评分筛选」读的就是这里的 <code>total_score</code>，判断某只股票最近 N 个评分日是否每天落在同一分数带内；它不重新打分。</td></tr>
                                        <tr><td>价格口径</td><td>因子全部基于所选复权口径的收盘价序列；估值、换手率等直接取日线表字段，未做行业中性化、市值中性化或去极值处理。</td></tr>
                                        <tr><td>空值处理</td><td>非有限值（NaN / Inf）、估值 ≤ 0、历史 K 线不足、20 日均额为 0 都会让对应指标留空；空指标跳过，空因子从分母中剔除；一只股票若一个因子都算不出来则不入榜。</td></tr>
                                        <tr><td>涨停 / 停牌 / ST</td><td>停牌与 ST 股票被排除；评分本身不模拟涨停买不进、滑点与交易费用，也不考虑次日能否成交。</td></tr>
                                        <tr><td>字段精度</td><td>结果以 <code>DECIMAL</code> 存储（分数 4 位小数、原始特征 6 位小数），页面展示时按列四舍五入，因此显示值与参与计算的原始值可能有微小差异。</td></tr>
                                        <tr><td>适用范围</td><td>这是基于历史日线的横截面统计与规则打分，用于横向比较与筛选，不是收益预测，不包含基本面调研、公告或事件信息。</td></tr>
                                    </tbody>
                                </table>
                            </div>

                            <h3 className="srm-h3">页面列与计算字段对照</h3>
                            <div className="srm-table-wrap">
                                <table className="srm-table">
                                    <thead><tr><th>页面列</th><th>来源</th></tr></thead>
                                    <tbody>
                                        <tr><td>综合分</td><td><code>total_score</code>，按五因子加权合成</td></tr>
                                        <tr><td>因子分项（价 / 动 / 势 / 险 / 流）</td><td><code>value_score</code> / <code>momentum_score</code> / <code>trend_score</code> / <code>risk_score</code> / <code>liquidity_score</code></td></tr>
                                        <tr><td>收盘、21日、63日、PE、PB、波动率、最大回撤</td><td>评分时一并落库的原始特征，方便核对分数来源；百分比列展示时 ×100</td></tr>
                                        <tr><td>排名</td><td>查询时按综合分降序计算，不落库</td></tr>
                                    </tbody>
                                </table>
                            </div>

                            <h3 className="srm-h3">源码索引</h3>
                            <ul className="srm-list">
                                <li><code>service/ScoreCalculationService.java</code>：特征、分位、权重、总分公式</li>
                                <li><code>resources/mapper/ScoreCalculationMapper.xml</code>：420 天取数、<code>stock_score_daily</code> 幂等写入</li>
                                <li><code>resources/mapper/ScoreRankingMapper.xml</code>：榜单查询条件与排名生成</li>
                                <li><code>resources/score_schema.sql</code>：评分表结构与唯一键</li>
                                <li><code>schedule/ScoreScheduledTask.java</code>、<code>service/ScoreScheduleService.java</code>：启动补算与每日定时任务</li>
                            </ul>

                            <p className="srm-disclaimer">
                                本说明用于帮助理解页面数字的来源。所有结果均基于历史数据的统计与规则计算，
                                <b>不构成投资建议</b>，也不保证未来收益，请自行判断并承担投资风险。
                            </p>
                        </>
                    ) : null}
                </div>

                <footer className="srm-foot">
                    <span>按 Esc、点击右上角「关闭」或点击弹窗外区域均可退出；打开弹窗不会改动任何筛选条件。</span>
                    <button type="button" className="srm-foot-btn" onClick={onClose}>我知道了</button>
                </footer>
            </div>
        </div>,
        document.body
    );
}
