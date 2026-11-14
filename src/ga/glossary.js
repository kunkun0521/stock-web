/**
 * 遗传算法模块的「指标说明书」：所有英文指标、缩写、状态值、任务名、参数键的中文释义。
 *
 * 集中放在这里的原因：页面里的英文要能就地解释（Term 组件）、弹窗里要能搜索、文档要能复用，
 * 三处共用同一份数据才不会各说各话。纯数据、无 JSX、无副作用。
 *
 * 字段说明：
 *   id      唯一键，页面用 <Term id="ic60"/> 引用
 *   term    页面/接口里出现的英文原文
 *   cn      中文名
 *   group   所属分组（GROUPS 里的 id）
 *   desc    这个指标到底是什么、怎么算、从哪来
 *   howto   怎么看、正常范围、异常处理方向
 *   formula 公式（可选）
 *   alias   搜索别名（中文、英文缩写、字段名）
 */

export const GROUPS = [
    { id: 'kpi', label: '总览指标', desc: '总览页 8 张卡片与趋势 / 日历' },
    { id: 'pred', label: '预测与结果', desc: '一条预测记录里各字段的含义' },
    { id: 'evo', label: '进化与适应度', desc: '进化监控页：GA 算子、适应度、冠军准入' },
    { id: 'factor', label: '因子与校准', desc: '因子体检页、错误分析页的统计量' },
    { id: 'pool', label: '股票池状态', desc: '淘汰管理页的状态与原因代码' },
    { id: 'job', label: '任务与调度', desc: '后台任务页的英文任务名' },
    { id: 'param', label: '参数键', desc: 'ga_config 全部参数（从接口实时读取，含当前值/默认值）与常用阈值' },
    { id: 'table', label: '数据表与口径', desc: '页面标题 / 说明里出现的技术名词' },
];

const T = (id, term, cn, group, desc, howto, formula, alias = []) =>
    ({ id, term, cn, group, desc, howto, formula, alias });

export const TERMS = [
    /* ------------------------------------------------------------ 总览 KPI */
    T('hitRate', 'hitRate', '整体命中率', 'kpi',
        '筛选区间内「已验证」预测中方向判对的比例。只统计 status=VERIFIED、model_role=CHAMPION、in_pool=1 的记录，命中指 is_correct=1。',
        '顶部红色告警用的就是这个值：样本 ≥200 条且低于 alert_hit_rate（默认 50%）时提示模型可能退化。二分类朴素参照线是 50%，但本系统是「涨/跌/观望」三分类，还要结合覆盖率、分周期、ECE 一起看，单看一个数字容易误判。',
        '命中率 = 命中条数 ÷ 已验证条数'),
    T('upHitRate', 'upHitRate', '看涨命中率', 'kpi',
        '只取 pred_direction=+1（预测上涨）的样本算命中率。',
        '与看跌命中率对比可发现模型是不是「只会喊涨」。若两者差距很大，多半是标签或噪声阈值把多数样本判成了同一方向。'),
    T('downHitRate', 'downHitRate', '看跌命中率', 'kpi',
        '只取 pred_direction=-1（预测下跌）的样本算命中率。',
        'A 股长期上涨占比略高，看跌样本通常更少；样本太少时这个数字波动会很大。'),
    T('coverage', 'coverage', '覆盖率', 'kpi',
        '窗口内真正产生了有效预测信号（非观望、非缺失）的标的占比。个体层面的 coverageValid 含义相同，用于适应度里的 S 项。',
        '覆盖率很低时命中率不可比：模型可能只挑最有把握的少量股票出手。覆盖率低于 cov_min(0.10) 时该折适应度会被置 0。',
        '覆盖率 = 有信号样本数 ÷ 应预测样本数'),
    T('avgIc', 'avgIc', '平均 IC', 'kpi',
        'Information Coefficient 的窗口均值：预测打分与真实收益的秩相关（Spearman）。',
        '越大越好，0 附近表示打分没有区分力，长期为负说明方向反了。A 股日频 IC 绝对值 0.02~0.05 已属常见量级，不必追求很大。',
        'IC = corr(rank(预测打分), rank(真实收益))', ['IC', '信息系数', '秩相关']),
    T('nVerified', 'nVerified', '已验证样本', 'kpi',
        'status=VERIFIED 的预测条数，即已经用 h 个交易日后的真实行情核对过结果的记录。',
        '刚生成的预测要等 h 个交易日才到期，PENDING 不计入。样本少于几百条时命中率波动大，不宜下结论。', null, ['样本数', '已验证条数']),
    T('championVersion', 'championVersion', '冠军版本', 'kpi',
        '当前生效的冠军模型集版本标签，例如 H5-20261112-01、H1-REPLAY-20260827。带 REPLAY 的是历史回放产生的版本。',
        '若显示 REPLAY 或「-」，说明当前用的是回放占位模型，看板数据只能用于展示与调试，不能当作实盘业绩。', null, ['版本', '冠军集']),
    T('effectiveFrom', 'effectiveFrom', '生效起始日', 'kpi',
        '当前冠军版本开始生效的日期。',
        '配合冠军版本一起看：生效日之后的预测才由这套模型产生。'),
    T('eliminatedCount', 'eliminatedCount', '淘汰数量', 'kpi',
        '当前股票池里 pool_status=ELIMINATED 的标的数。',
        '数量突然大增通常意味着行情数据异常（例如停牌、成交额字段缺失），先去淘汰管理页看原因分布。'),

    /* ------------------------------------------------------------ 预测与结果 */
    T('horizon', 'horizon / H1~H15', '预测周期', 'pred',
        '预测未来第几个交易日，系统默认 1、3、5、10、15 天（ga_config 的 horizons）。每个周期有独立的种群、冠军集和阈值，页面常写成 H5、H10。',
        '周期越长，噪声阈值 θ_h 越大、可验证样本越少。看命中率务必分周期看，混在一起会被短周期样本淹没。', null, ['H1', 'H3', 'H5', 'H10', 'H15', '周期']),
    T('probUp', 'probUp / P↑', '上涨概率', 'pred',
        '模型集成输出并经 Platt 校准后的 P(涨)，取值 0~1。',
        '接近 0.5 表示没把握。它不等于真实胜率，可靠与否看错误分析页的 ECE 与可靠性曲线。', null, ['P↑', 'P(涨)', '上涨概率']),
    T('confidence', 'confidence', '置信度', 'pred',
        '模型对本次预测的把握程度，约等于 |P(涨) − 0.5| 归一化后的值；越高表示越偏离中性。',
        '高置信却经常错，是典型的校准失效或模型退化信号，去错误分析页看「高置信错误」。'),
    T('predDirection', 'predDirection', '预测方向', 'pred',
        '+1 看涨、-1 看跌、0 观望（噪声阈值内判为无信号）。方向由 P↑ 与阈值共同决定。',
        '混淆矩阵全是同一行/列说明模型退化成「恒定方向」，此时 50% 命中率也可能只是行情单边造成的。', null, ['方向', 'UP', 'DOWN', 'NEUTRAL']),
    T('actualReturn', 'actualReturn', '真实收益', 'pred',
        '从基准日到 h 个交易日后，按前复权收盘价算出的实际涨跌幅。',
        '它是回填标签，只有 VERIFIED 记录才有；label_mode=EXCESS 时会减去同日池内等权收益。', '收益 = close(t+h)/close(t) − 1'),
    T('isCorrect', 'isCorrect', '是否命中', 'pred',
        '回填后判断预测方向与实际涨跌是否一致。MySQL 里是 1/0（tinyint），前端已兼容数字与布尔两种写法。',
        '噪声阈值 θ_h 内的「平」样本不计入命中判定；到期无行情则整条置 VOID。', null, ['命中', '正确']),
    T('status', 'PENDING / VERIFIED / VOID', '预测状态', 'pred',
        'PENDING=已生成但还没到期核对；VERIFIED=已用真实行情回填；VOID=到期日无行情、作废。',
        'PENDING 大量堆积说明 VerifyJob 没跑完或行情缺失，此时命中率分母偏小、指标会失真。', null, ['状态', '待验证', '已验证', '失效']),
    T('CHAMPION', 'CHAMPION / SHADOW', '主榜 / 影子模型', 'pred',
        'CHAMPION 是当前生效的冠军集，看板默认只统计它；SHADOW 是同期陪跑的候选模型，用来积累独立样本，达标后可自动晋升。',
        '「晋升冠军」必须靠 SHADOW 的实盘样本说话，影子期由 shadow_days（默认 5 个交易日）控制。', null, ['主榜', '影子', '冠军']),
    T('isReplay', 'is_replay / REPLAY', '回放口径', 'pred',
        'is_replay=1 是历史回放：回到过去某天、只用当时能看到的数据重新进化并预测；is_replay=0 是实盘口径。',
        '总览默认「仅实盘」，所以回放数据再多也不会出现在趋势 / 日历里；切「含回放」才看得到。InitJob 回灌的是 is_replay=0 但用的是回放冠军，仅用于冷启动展示。', null, ['回放', '实盘', '含回放']),
    T('strict', 'strict / is_effective', '严格口径', 'pred',
        '严格模式只统计冠军版本生效之后（is_effective=1）的预测，宽松模式把历史全部计入。',
        '对比两次冠军更替效果时用严格口径，看整体分布用宽松口径。', null, ['口径', '严格', '宽松']),
    T('explain', 'explain_json', '因子贡献', 'pred',
        '每条预测里贡献最大的若干个特征及其 z 分数，个股页右侧「因子贡献」卡片画的就是它。',
        '正负号表示该特征把打分往上/往下推，不代表涨跌方向；红涨绿跌只用于行情与方向配色。', null, ['解释', '贡献', 'z']),
    T('limitFlag', 'limitFlag', '涨跌停标记', 'pred',
        '基准日触及涨停 / 跌停的标记，也用于选股页的「追高风险」提示。',
        '涨停日次日的收益分布与普通日差异很大，评估命中率时通常单独分桶看。', null, ['涨停', '追高风险']),
    T('inPool', 'inPool', '是否在池', 'pred',
        '该标的当时是否属于可预测股票池（未被淘汰）。',
        '看板 KPI 默认只统计在池样本；被淘汰标的的预测仍会留库供复盘，但不进命中率。'),
    T('adjustflag', 'adjustflag=2', '前复权口径', 'pred',
        '行情表 stock_daily_all 的复权标记，2 = 前复权。全系统行情与特征统一用这个口径。',
        '口径不一致会让真实收益算错，进而把命中率整体拉低；启动时的价格口径告警就是查这个。', null, ['复权', '前复权']),
    T('regime', 'regime', '市场状态', 'pred',
        '按市场特征划分的环境标签（如趋势 / 震荡），用于分桶分析与可选的分状态冠军集。',
        '命中率长期偏低时，用错误分析的 regime 分桶看是不是只在某类行情里失效。', null, ['市场状态', '环境']),
    T('TopN', 'Top N / Top20', '前 N 名', 'pred',
        '按某个指标（通常是误差或置信度）排序后取前 N 条，N 由页面输入框控制。',
        '「高置信错误 Top20」是排查退化的第一站：看错的单子有没有共同特征。', null, ['Top20', '前N']),

    /* ------------------------------------------------------------ 进化与适应度 */
    T('GA', 'GA', '遗传算法', 'evo',
        'Genetic Algorithm。把「因子权重 + 特征开关」当作染色体，用选择、交叉、变异、精英保留逐代搜索更优的打分公式。',
        '本系统 5 个周期各自独立跑一轮 GA，互不共享冠军。', null, ['遗传算法', '进化']),
    T('fitness', 'fitness / F', '适应度', 'evo',
        '个体在验证段的综合得分，是进化挑选个体的唯一标准。由平衡准确率 A、IC 项 B、稳定性 S、Brier 项 R 加权合成，再扣过拟合与复杂度惩罚。',
        '越大越好，但要看 F_tr 与 F_va 的差：训练分远高于验证分说明过拟合。',
        'F = F_va − k·max(0, F_tr − F_va) − c·(Σm/N)；F_seg = 0.40A + 0.25B + 0.20S + 0.15R', ['F', 'bestFitness', '最优适应度']),
    T('fitTrain', 'F_tr / fitTrain', '训练集适应度', 'evo',
        '个体在训练段（train_days，默认 120 个交易日）上的得分。',
        'F_tr 明显高于 F_va 会被 overfit_penalty 惩罚；差距持续扩大是早停信号。', null, ['训练', 'fitTrain']),
    T('fitValid', 'F_va / fitValid', '验证集适应度', 'evo',
        '个体在验证段（valid_days，默认 30 个交易日）上的得分，是适应度主体。',
        '进化监控的收敛曲线画的就是每代最优 / 平均 / 中位 / 最差的 F。', null, ['验证', 'fitValid']),
    T('BalAcc', 'BalAcc', '平衡准确率', 'evo',
        'Balanced Accuracy：看涨命中率与看跌命中率的平均，避免样本偏向某一类时准确率虚高。',
        '冠军准入线 holdout_min_balacc=0.52（首次 0.51），衰减退役线 retire_balacc=0.50。它比整体命中率更能反映退化。',
        'BalAcc = (看涨召回 + 看跌召回) ÷ 2', ['balaccValid', '平衡准度']),
    T('IC', 'IC', '信息系数', 'evo',
        'Information Coefficient，预测打分与真实收益的秩相关；适应度里的 B 项。',
        '接近 0 或为负表示打分无区分力。因子体检页的 ic20/ic60 是单因子版本，这里是整个个体的版本。', null, ['icValid', '信息系数']),
    T('Brier', 'Brier', '布里尔分数', 'evo',
        '概率预测误差均方，越小越好；适应度里的 R 项用 fit_r_base(0.25) − Brier 归一化。',
        'Brier 高说明 P↑ 这个概率本身不可信，此时该跑 CalibrateJob 重拟合校准，而不是急着重跑进化。',
        'Brier = mean((P↑ − 实际是否上涨)²)', ['brierValid']),
    T('coverageValid', 'coverageValid', '个体覆盖率', 'evo',
        '该个体在验证段能给出有效信号的样本比例。',
        '低于 cov_min(0.10) 时该折 F_seg 直接置 0，防止模型靠「只预测几只」刷分。', null, ['覆盖', 'cov']),
    T('HOF', 'HOF / 名人堂', '名人堂', 'evo',
        'Hall of Fame，历代适应度最高的个体集合（hof_size 默认 20）。进化结束后从中挑候选进 Hold-out 复核。',
        '名人堂里个体的状态常见 HOF / CANDIDATE / CHAMPION / RETIRED / REJECTED。', null, ['名人堂', 'Hall of Fame']),
    T('runId', 'runId', '进化运行编号', 'evo',
        '一次进化运行的唯一编号，关联 ga_run、历代收敛记录、个体与冠军版本。',
        '「晋升冠军」时要填的就是它；留空则使用进化监控页当前选中的那一行。', null, ['运行编号']),
    T('generation', 'generation', '代数', 'evo',
        'GA 迭代的轮数，最大 max_gen（默认 60）。',
        '收敛曲线若很早就走平，说明 patience 早停生效或种群多样性不足。', null, ['代', 'generationsDone']),
    T('popSize', 'pop_size', '种群规模', 'evo',
        '每代保留多少个个体，默认 200。',
        '调大能搜得更充分但更慢；调试时临时调到 60 可快速验证链路，评估真实模型质量要调回 200。', null, ['种群']),
    T('maxGen', 'max_gen', '最大代数', 'evo',
        '单轮进化最多迭代多少代，默认 60。',
        '与 pop_size 一起决定耗时。默认 200×60 一轮全周期可能要几十分钟。', null, ['代数上限']),
    T('holdout', 'Hold-out', '留出集', 'evo',
        '最近 holdout_days（默认 20）个有标签交易日，进化全程不可见，只用于最终复核候选，防止挑出过拟合的个体。',
        '看点：候选的 Hold-out BalAcc ≥ 0.52 才准写进冠军集。这个数比训练集 F 更可信。', null, ['留出集', 'holdout_days']),
    T('folds', 'folds / fold_step', '滚动折', 'evo',
        '把历史切成 K 段滚动的训练/验证窗口（folds 默认 3、train_days 120、valid_days 30、fold_step 30）。数据不足时自动降到 2 折、1 折。',
        '稳定性 S 项就是各折得分的一致性；某折特别差说明模型对时间段敏感。', null, ['折', 'train_days', 'valid_days']),
    T('diversity', 'diversity', '种群多样性', 'evo',
        '个体基因之间的差异程度。低于 diversity_threshold(0.05) 时临时加倍变异率与移民比例，避免早熟收敛。',
        '曲线长期贴底说明搜索陷入局部最优，可考虑调大 immigrant_ratio 或换随机种子。', null, ['多样性']),
    T('immigrants', 'immigrantsCount', '移民数', 'evo',
        '每代随机新加入的个体数（immigrant_ratio 默认 0.10），用来补充新基因。', null, null, ['移民']),
    T('culled', 'culledCount', '每代淘汰数', 'evo',
        '每代末尾按 cull_ratio(0.30) 淘汰掉的末位个体数。', null, null, ['淘汰数']),
    T('softmax', 'softmax_temp', '集成温度', 'evo',
        '冠军集成权重按 softmax(F/T) 分配，T 越小越偏向得分最高的个体，默认 0.10。',
        'T 太小会让集成退化成「单打独斗」，遇到个体失效时命中率会突然下滑。', null, ['softmax', '集成权重']),
    T('platt', 'Platt / calib_a / calib_b', '概率校准', 'evo',
        '把模型原始打分用 logistic 映射成 P↑：P = 1/(1+exp(−(a·score+b)))。参数由 CalibrateJob 用已验证样本重拟合。',
        'ECE 超阈值或可靠性曲线明显偏离对角线时跑一次校准；样本不足 calib_min_samples(500) 不会重拟合。',
        'P↑ = 1 / (1 + exp(−(a·score + b)))', ['校准', 'CalibrateJob', 'calib_a', 'calib_b']),
    T('shadow', 'shadow_days / shadow_tolerance', '影子晋升', 'evo',
        '新候选先以 SHADOW 身份陪跑 shadow_days（5）个交易日，BalAcc 不低于现任冠军减 shadow_tolerance(0.01) 才自动晋升。',
        '这条机制是为了避免「一次进化跑得漂亮、上线就崩」。', null, ['影子', '晋升']),
    T('overfitPenalty', 'overfit_penalty', '过拟合惩罚', 'evo',
        'F = F_va − k·max(0, F_tr − F_va) 里的 k，默认 0.50。训练分比验证分高得越多扣得越狠。', null, null, ['k']),
    T('patience', 'patience / min_improve', '早停', 'evo',
        '连续 patience(10) 代最优 F 提升都小于 min_improve(0.0001) 就提前结束本轮进化。', null, null, ['早停']),
    T('runStatus', 'SUCCESS / FAILED / RUNNING / NEVER', '任务与运行状态', 'evo',
        'SUCCESS 成功、FAILED 失败、RUNNING 运行中或排队中、NEVER 从未运行。',
        'GA 任务在单实例里是单线程队列，running=true 可能只是排在别人后面，不等于正在计算。', null, ['状态', '状态值']),
    T('runType', 'EVOLVE / REPLAY / MANUAL', '运行类型', 'evo',
        'EVOLVE 常规进化、REPLAY 历史回放断点进化、MANUAL 页面上手动触发的进化。', null, null, ['类型']),
    T('individualStatus', 'HOF / CANDIDATE / CHAMPION / RETIRED / REJECTED', '个体状态', 'evo',
        '名人堂 / 候选 / 现任冠军 / 已退役 / 准入被拒。',
        'REJECTED 多表示没过 Hold-out 复核；RETIRED 表示近期 BalAcc 衰减到阈值以下。', null, ['个体状态']),

    /* ------------------------------------------------------------ 因子与校准 */
    T('ic20', 'ic20', '近 20 日单因子 IC', 'factor',
        '某个特征在最近 20 个交易日里，与未来 h 日收益的秩相关均值。',
        '看短期是否还有效；与 ic60 反向往往意味着因子开始失效。', null, ['短期IC']),
    T('ic60', 'ic60', '近 60 日单因子 IC', 'factor',
        '同一特征在最近 60 个交易日里的 IC 均值，是因子体检热力图的着色依据（红正绿负）。',
        '绝对值越大着色越深；长期接近 0 说明这个因子该考虑下线。', null, ['长期IC']),
    T('icir60', 'icir60', 'IC 信息比率', 'factor',
        'ic60 的均值除以标准差，衡量 IC 的稳定性而不仅是大小。',
        'IC 高但 ICIR 低，说明只在少数几天有效、不够可靠。', 'ICIR = mean(IC) / std(IC)', ['ICIR']),
    T('decayFlag', 'decayFlag', '因子衰减标记', 'factor',
        '|ic60| 低于 ic_decay_min(0.02) 或短期 IC 明显走弱时打的标记，热力图上用红框标出。',
        '大片红框说明特征集体失效，这时重跑进化的收益有限，应先检查特征计算与行情口径。', null, ['衰减', '红框']),
    T('RankIC', 'RankIC', '秩相关 IC', 'factor',
        '先对打分和收益取排名再算相关系数，抗极值、比普通皮尔逊相关更稳健；系统里的 IC 默认指它。', null, null, ['秩相关']),
    T('ECE', 'ECE', '校准误差', 'factor',
        'Expected Calibration Error：把预测概率按 ece_bins(20) 分桶后，各桶「平均预测概率」与「实际命中比例」差的加权平均。',
        '越接近 0 越好；超过 ece_warn(0.05) 表示 P↑ 不能当概率用，应跑 CalibrateJob。注意它与命中率高低是两件事：校准好不代表预测准。',
        'ECE = Σ (桶样本数/总数) × |桶平均P↑ − 桶实际命中率|', ['校准误差', 'ece']),
    T('reliability', 'reliability', '可靠性曲线', 'factor',
        '横轴预测概率、纵轴实际命中比例；理想情况贴着对角线。',
        '曲线整体在对角线下方=模型过度自信，上方=过度保守；这两种都该重新校准。', null, ['校准曲线']),
    T('confusion', 'confusion matrix', '混淆矩阵', 'factor',
        '行为预测方向、列为实际方向，格子里是样本数。',
        '某一行特别大说明方向偏斜；对角线不占优说明分类失效。', null, ['矩阵']),
    T('quantile', 'quantile', '分层回测', 'factor',
        '按预测打分把样本分成 quantile_groups(5) 组，比较各组平均收益。',
        '理想情况是打分越高收益越高（单调）。', null, ['分位数', '分层']),
    T('monotonicity', 'monotonicity', '单调性', 'factor',
        '分层回测里各组平均收益随打分递增的一致程度，越接近 1 越好。',
        '接近 0 或为负说明打分没有排序能力，即便命中率还行也不具备选股价值。', null, ['分层单调性']),
    T('spread', 'spread', '多空价差', 'factor',
        '分层回测中最高分组与最低分组的平均收益差。',
        '越大说明打分越能区分强弱；为负说明模型方向反了。', null, ['多空收益差']),
    T('buckets', 'buckets', '分桶命中率', 'factor',
        '按波动率 / 成交额 / 市盈率 / 板块 / 市场状态 / 概率 / 涨跌停等维度分组看命中率与样本数。',
        '定位退化原因最快的工具：若只在某个桶里差，问题通常在数据或该板块，而不是整个模型。', null, ['分桶']),
    T('vol20', 'vol_20', '20 日波动率', 'factor',
        '近 20 个交易日收益率的标准差，同时用于噪声阈值 θ_h = max(floor_h, coef × vol_20 × √h)。',
        '高波动股的 θ_h 更大，越容易被判成「观望」，这会影响覆盖率和命中率口径。', null, ['波动率']),
    T('zscore', 'z-score', '标准化分数', 'factor',
        '特征减去截面均值再除以标准差，让不同量纲的因子可以放在同一套权重里。个股页因子贡献里的 z 就是它。',
        'z=+2 表示高于同日横截面约 2 个标准差。', 'z = (x − mean) / std', ['z', '标准化']),
    T('theta', 'θ_h / floors', '噪声阈值', 'factor',
        '判断「涨 / 跌 / 平」的门槛：θ_h = max(floor_h, noise_vol_coef × vol_20 × √h)。收益绝对值小于 θ_h 视为噪声，标签判为观望。',
        '阈值调大 → 观望变多、覆盖率下降、留下来的样本更难但更干净。命中率突然变化时先确认 floors 没被改过。',
        'θ_h = max(floor_h, 0.25 × vol_20 × √h)', ['floor', '噪声']),
    T('labelMode', 'label_mode', '标签模式', 'factor',
        'ABSOLUTE 直接用绝对涨跌做标签；EXCESS 减去同日池内等权收益，剥离大盘涨跌。',
        '单边行情里 ABSOLUTE 会让模型「永远看涨」也能拿高命中率，改 EXCESS 能暴露真实选股能力。', null, ['标签', 'ABSOLUTE', 'EXCESS']),

    /* ------------------------------------------------------------ 股票池 */
    T('poolStatus', 'ACTIVE / ELIMINATED', '股票池状态', 'pool',
        'ACTIVE 在池、可正常预测；ELIMINATED 已被淘汰，不进命中率统计。',
        '被淘汰不等于公司有问题，只是数据或历史可预测性不满足系统规则。', null, ['ACTIVE', 'ELIMINATED', '在池']),
    T('reasonCode', 'reasonCode', '淘汰原因代码', 'pool',
        'NEW_LISTING 次新股（上市不足 new_listing_days=120 个有效交易日）；ST 风险警示股；LOW_LIQUIDITY 20 日均额低于 2000 万；SUSPENDED 停牌比例过高；EXTREME_VOL 波动率处于截面 99% 分位；DATA_MISSING 关键字段缺失；POOR_PREDICTABILITY 近 60 日命中率过低；LIMIT_TOUCH 涨跌停相关。',
        '原因分布突然从 ST / 次新变成 LOW_LIQUIDITY 大面积淘汰，多半是成交额字段单位或数据抓取出了问题。', null, ['原因', 'NEW_LISTING', 'ST', 'LOW_LIQUIDITY', 'SUSPENDED', 'EXTREME_VOL', 'DATA_MISSING', 'POOR_PREDICTABILITY']),
    T('hitRate60', 'hitRate60 / nVerified60', '近 60 日命中率与样本数', 'pool',
        '单只股票近 60 个交易日（窗口由 pool_poor_window 控制）的命中率与已验证样本数。',
        '样本少于 pool_poor_min_samples(40) 不会据此淘汰；命中率低于 pool_poor_hit(0.48) 才会进入淘汰评估。', null, ['命中率60', '样本60']),
    T('shadowHitRate20', 'shadowHitRate20 / shadowN20', '影子近 20 日命中率与样本数', 'pool',
        '被淘汰标的用 SHADOW 预测继续观察 20 日的表现，用来判断能否复活。',
        '超过 pool_restore_hit(0.52) 且样本足够才自动复活，避免反复横跳。', null, ['影子命中20', '影子样本20']),
    T('cooldown', 'cooldownLeft', '冷却剩余', 'pool',
        '同一标的自动淘汰 / 复活之间的最小间隔（pool_cooldown_days，默认 20 个交易日）还剩几天。',
        '冷却期内即使指标达标也不会自动变更状态。', null, ['冷却']),

    /* ------------------------------------------------------------ 任务 */
    T('InitJob', 'InitJob', '冷启动初始化任务', 'job',
        '把最近 init_days（默认 10）个交易日补成实盘口径数据：逐日预测 → 回填 → 重建指标 → 因子 IC → 刷新股票池。后端启动 60 秒后自动检查一次，数据齐了就跳过。',
        '数据来自当前活跃冠军集 + 真实历史行情回灌，仅用于看板冷启动展示，不是实盘业绩。重复触发是幂等的。', null, ['初始化']),
    T('FeatureJob', 'FeatureJob', '特征任务', 'job',
        '构建并落库 stock_feature_daily 的原始特征与市场环境。首次覆盖不足 160 个交易日时自动回填全历史。',
        '「有效样本不足」报错、因子贡献空白、趋势断档，第一反应都是先跑它。', null, ['特征']),
    T('PredictJob', 'PredictJob', '每日预测任务', 'job',
        '用当前冠军集对最新交易日全池生成 CHAMPION 与 SHADOW 预测，写入 ga_prediction。', null, null, ['预测']),
    T('VerifyJob', 'VerifyJob', '结果回填任务', 'job',
        '预测到期后用真实行情计算 actual_return 与 is_correct，把 PENDING 改成 VERIFIED（无行情则 VOID）。',
        '命中率分母只算 VERIFIED，所以这个任务没跑完时看板指标一定失真。', null, ['回填', '验证']),
    T('MetricJob', 'MetricJob', '指标汇总任务', 'job',
        '重建 ga_metric_daily 的日度命中率 / IC / 覆盖等指标，并做冠军衰减检查。',
        '跑完 VerifyJob 之后要再跑一次它，趋势 / 日历 / 总览才会更新。', null, ['指标']),
    T('PoolJob', 'PoolJob', '股票池任务', 'job',
        '按 8 类规则评估淘汰与复活，写 ga_stock_pool 与事件日志。', null, null, ['淘汰']),
    T('EvolveJob', 'EvolveJob', '进化任务', 'job',
        '5 个周期各跑一轮 GA（默认 200 个体 × 60 代）→ Hold-out 复核 → 生成冠军候选。',
        '耗时最长（全周期数十分钟），是模型退化的主要处置手段，但先做完诊断再跑。', null, ['进化']),
    T('CalibrateJob', 'CalibrateJob', '校准任务', 'job',
        '用已验证样本重拟合 Platt 校准的 a、b，让 P↑ 更接近真实概率。',
        'ECE 超阈值或可靠性曲线明显偏离时跑它，成本远低于重跑进化。', null, ['校准']),
    T('FactorIcJob', 'FactorIcJob', '因子体检任务', 'job',
        '计算各周期单因子 ic20 / ic60 / icir60 并打衰减标记。', null, null, ['因子IC']),
    T('ReplayJob', 'ReplayJob', '历史回放任务', 'job',
        '回到过去按断点重新进化、生成当时的预测，产出 is_replay=1 的复盘数据。',
        '耗时很长，用于验证「不是事后诸葛亮」；看板默认不展示回放数据。', null, ['回放']),
    T('DailyPipeline', 'DailyPipeline', '日链路', 'job',
        '交易日 17:30 定时顺序执行：Feature → Predict → Verify → Metric → Pool → 晋升检查。', null, null, ['日链路']),
    T('WeeklyEvolve', 'WeeklyEvolve', '周链路', 'job',
        '每周六 02:00：5 周期进化 → 准入 → 校准 → 因子体检 → 淘汰。', null, null, ['周链路']),
    T('cron', 'cron / @Scheduled', '定时表达式', 'job',
        '后端 Spring 的定时调度配置，例如 0 30 17 * * ? 表示每天 17:30。后台任务页可看 cron、开关与下次触发时间。',
        '「按定时规则执行」按钮走的是与 cron 完全相同的提交路径，可用来验证定时是否配好。', null, ['定时', '调度']),
    T('running', 'running / jobs/status', '运行中标记', 'job',
        '后台任务页的 running 来自 jobs/status，含义是「已提交且未结束」。',
        'GA 任务在单实例里是单线程队列，running=true 也可能是排队中；若持续几十小时不变，通常是旧进程的任务锁未释放，重启后端即可清掉。', null, ['运行中']),

    /* ------------------------------------------------------------ 参数键 */
    T('alertHitRate', 'alert_hit_rate', '告警命中率阈值', 'param',
        '总览顶部告警的触发线，默认 0.50；样本数 ≥200 且命中率低于它就提示「模型可能退化」。',
        '这是提示线，不是模型合格线。**不要为了消掉提示把它调低**，应按下方的告警处置指引排查。', null, ['告警阈值']),
    T('initDays', 'init_days', '初始化交易日数', 'param',
        'InitJob 回灌最近多少个交易日，默认 10。', null, null, ['初始化天数']),
    T('horizonsParam', 'horizons', '周期列表', 'param',
        '默认 1,3,5,10,15，每个周期独立种群与冠军。', null, null, ['周期配置']),
    T('minLabeledDays', 'min_labeled_days', '最少有标签交易日', 'param',
        '一次进化至少需要 150 个有标签交易日，不足会报「有效样本不足」。', null, null, ['样本下限']),
    T('retireParams', 'retire_*', '冠军退役阈值', 'param',
        'retire_window(60 交易日)、retire_min_samples(3000)、retire_balacc(0.50)：样本够多且 BalAcc 跌破阈值时，现任冠军自动退役。',
        '判断「真退化」时应看这套条件是否满足，而不是只看一次命中率低。', null, ['退役', '衰减']),
    T('holdoutParams', 'holdout_min_balacc / holdout_min_first', '冠军准入门槛', 'param',
        '有现任冠军时候选需 Hold-out BalAcc ≥0.52，首次无冠军时 ≥0.51。', null, null, ['准入']),
    T('eceWarn', 'ece_warn / ece_bins', '校准告警阈值', 'param',
        'ECE 超过 0.05 提示重新校准；可靠性曲线分桶数默认 20。', null, null, ['ECE阈值']),
    T('minConsensus', 'min_consensus', '强共振阈值', 'param',
        '每日选股页里 5 个周期中至少几个方向一致才算「强共振」，默认 4。', null, null, ['共振']),
    T('noiseVolCoef', 'noise_vol_coef / floors', '噪声阈值参数', 'param',
        'θ_h = max(floor_h, coef × vol_20 × √h)，coef 默认 0.25，各周期 floor_h 由 floors 给出。', null, null, ['阈值参数']),

    /* ------------------------------------------------------------ 表与口径 */
    T('gaPrediction', 'ga_prediction', '预测明细表', 'table',
        '每条预测一行，含方向、概率、置信、因子贡献、回填结果与状态；唯一键由 交易日+代码+市场+复权+周期+角色+回放 组成。',
        '所有看板指标的原始数据源。', null, ['预测表']),
    T('gaMetricDaily', 'ga_metric_daily', '日度指标表', 'table',
        'MetricJob 汇总出的按日 / 周期 / 口径 / window_days 的命中率等指标，趋势与日历直接查它。', null, null, ['指标表']),
    T('gaFactorIcDaily', 'ga_factor_ic_daily', '因子 IC 表', 'table',
        'FactorIcJob 产出的单因子逐日 ic20 / ic60 / icir60 与衰减标记。', null, null, ['因子表']),
    T('gaConfig', 'ga_config', '参数配置表', 'table',
        '存放全部阈值与开关（约 100 项），分 GLOBAL 与周期级作用域；参数配置页改完立即刷新后端缓存，下次任务生效，无需重启。',
        '周期级同名参数会覆盖 GLOBAL。', null, ['配置表']),
    T('gaChampionSet', 'ga_champion_set', '冠军集表', 'table',
        '记录每个版本的冠军个体、权重、是否当前、生效起止。', null, null, ['冠军表']),
    T('gaJobLog', 'ga_job_log', '任务日志表', 'table',
        '每次任务的开始 / 结束、状态、耗时与结果摘要，后台任务页的「运行历史」就是它。',
        '排查任何异常的第一步：看对应任务最后一次是 SUCCESS 还是 FAILED、错误信息是什么。', null, ['任务日志']),
    T('stockFeatureDaily', 'stock_feature_daily', '特征日表', 'table',
        'FeatureJob 落库的原始特征（约 58 个）与市场环境，按交易日 + 代码 + 复权口径存储。', null, null, ['特征表']),
    T('stockDailyAll', 'stock_daily_all', '行情联合视图', 'table',
        '把 stock_daily_00 / 30 / 60 三张表 UNION 起来的日线视图，统一取 adjustflag=2（前复权）。',
        '回填真实收益、算特征都靠它；行情没更新会让预测一直停在 PENDING。', null, ['行情表']),
    T('GLOBAL', 'GLOBAL', '全局作用域', 'table',
        'ga_config 里对所有周期生效的参数作用域；周期级（如 H5）同名参数会覆盖它。', null, null, ['作用域']),

    /* ------------------------------------------------------------ 数据清理 */
    T('dirtyData', 'dirtyData', '脏数据', 'table',
        '可通过业务口径判定为异常、但还没被修复的记录。数据清理页会按 11 类规则逐条体检：已验证却缺命中判定、未来日期的因子 IC、冠军版本生效区间倒挂、僵死的 RUNNING 任务、负耗时日志等。',
        '「脏数据行数」不等于要删除的行数：多数脏数据可以就地重算修复（例如用 pred_direction 与 actual_direction 重算 is_correct），只有确实无法还原的记录才会删除。修复后会自动重建指标、因子体检与股票池。',
        null, ['脏记录', '数据异常']),
    T('retentionDays', 'retentionDays', '保留期', 'table',
        '每类数据表允许保留的自然日数，超过就属于「长期不再使用」的历史数据。可按表单独配置（cleanup_prediction_days / cleanup_replay_days / cleanup_feature_days 等）。',
        '不是配得越短越好：特征与市场缓存的保留期会被自动抬升到覆盖 GA 训练窗口与预热深度，否则清理后模型无法进化。所有规则还有 minKeepDays 安全下限，近期数据永远不删。',
        '清理分界日 = 行情最新交易日 − 保留天数'),
    T('anchorDate', 'anchorDate', '锚点交易日', 'table',
        '清理与体检计算保留期时使用的基准日，取行情库里最新的交易日，而不是日历今天。',
        '行情抓取延迟、周末或节假日时两者不同；用日历今天会把本来「最新」的一批数据误判成过期。', null, ['基准日']),
    T('minKeepDays', 'minKeepDays', '最小保护期', 'table',
        '任何清理规则都不得删除「锚点交易日前 N 自然日」之内的数据，由 cleanup_min_keep_days 配置，默认 30 天。',
        '这是防止保留期参数被误配成 0 而清空近期数据的硬保护，代码层面强制生效，配置值低于 7 天也会被抬回 7 天。', null, ['安全下限']),
    T('dryRun', 'dryRun', '预览模式', 'table',
        '只统计「将要修复/删除多少行」并给出分界日与日期范围，完全不写数据库。数据清理页的按钮①就是预览。',
        '后端默认 dryRun=true；真实执行必须同时传 dryRun=false 与 confirm=true，定时任务永远只做只读体检，避免无人值守时误删。', null, ['DRY-RUN', '空跑']),
    T('cleanupJob', 'CleanupJob', '数据清理任务', 'job',
        '后台任务页可手动触发的清理任务。是否真删由 cleanup_dry_run 决定：默认 1 只预览，改成 0 才真正执行。',
        '另有每周日 04:00 的定时体检，只把脏数据与超期规模写进任务日志，不删除任何数据。清理结果会记入 ga_cleanup_log 审计日志。', null, ['清理任务']),
    T('gaCleanupLog', 'ga_cleanup_log', '清理审计日志', 'table',
        '记录每次清理的模式（repair / purge / all）、是否预览、各步骤处理行数、耗时与明细；只追加，不参与自身清理。',
        '排查「数据怎么少了」时先看这张表，能定位到具体哪次执行、哪张表、哪个分界日。', null, ['审计日志']),
];

/** id → 术语项；Term 组件与弹窗定位都用它。 */
export const TERM_MAP = TERMS.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

/** 宽松查找：先按 id，再按英文原文 / 别名精确匹配。 */
export function findTerm(key) {
    if (!key) return null;
    if (TERM_MAP[key]) return TERM_MAP[key];
    const s = String(key).toLowerCase();
    return TERMS.find((t) => t.term.toLowerCase() === s
        || t.alias.some((a) => String(a).toLowerCase() === s)) || null;
}

/** 搜索：中文名、英文、别名、说明都参与，供弹窗搜索框使用。 */
export function searchTerms(query, group) {
    const q = String(query ?? '').trim().toLowerCase();
    return TERMS.filter((t) => (group === 'all' || t.group === group)
        && (!q || [t.term, t.cn, t.desc, t.howto, t.formula, ...t.alias]
            .filter(Boolean).join(' ').toLowerCase().includes(q)));
}

/* ================================================================ 告警处置指引 */

/**
 * 告警处置 SOP。match 命中顶部告警条的文本后，弹窗会把对应指引置顶展开。
 * steps[].where 写清前端具体页面/按钮，让用户能照着点。
 */
export const ALERT_SOPS = [
    {
        id: 'lowHitRate',
        title: '近区间命中率偏低 / 模型可能退化',
        match: (text) => /命中率.*低于|模型可能退化/.test(String(text ?? '')),
        summary: '这条提示来自 /api/ga/overview：当筛选区间内已验证样本 ≥200 条、且整体命中率低于 '
            + 'alert_hit_rate（默认 0.50）时触发。它是「提醒去看一眼」，不是「模型已报废」的判定。',
        warning: '先别急着调低 alert_hit_rate 或重跑进化。当前冠军多为 REPLAY（回放）版本，'
            + 'InitJob 又用这套冠军回灌了最近 10 个交易日，因此 22% 左右的命中率很可能反映的是'
            + '「回放占位模型 + 回灌样本」的分布，而不是真实模型退化。',
        steps: [
            {
                no: 1, title: '确认口径与样本量（总览页）',
                where: '总览 → 起始/结束日期、周期、口径、回放',
                detail: '看「已验证样本」是否足够（建议 ≥3000 再看命中率），把时间窗口拉长到 60 天以上；'
                    + '切「含回放」对比，再逐个周期 H1/H3/H5/H10/H15 看是全周期偏低还是某个周期单独坏掉。'
                    + '若冠军版本带 REPLAY 或显示「-」，先按第 5 步处理。',
            },
            {
                no: 2, title: '排除数据/任务问题（后台任务页）',
                where: '后台任务 → 运行历史 → 找到 FeatureJob / VerifyJob / MetricJob',
                detail: '确认这三项最近一次都是 SUCCESS。VerifyJob 没跑完会留下大量 PENDING，分母被截断；'
                    + '行情没更新也会让预测无法到期。依次手动运行 VerifyJob → MetricJob，然后回总览刷新。'
                    + '如果日志里是 FAILED，先按错误信息修数据，不要动模型。',
            },
            {
                no: 3, title: '定位失效位置（错误分析 + 因子体检）',
                where: '错误分析 → 可靠性曲线 / 混淆矩阵 / 分桶命中率 / 分层回测；因子体检 → 热力图',
                detail: 'ECE > 0.05 或可靠性曲线偏离对角线 → 概率校准问题，跑 CalibrateJob 即可，成本最低。'
                    + '混淆矩阵挤在同一行 → 模型退化成恒定方向。分桶里只有某类股票差 → 数据或行业问题。'
                    + '因子体检大片 decayFlag 红框 → 特征集体失效，先查特征/行情口径再谈进化。',
            },
            {
                no: 4, title: '查进化监控，判断是否真退化',
                where: '进化监控 → 运行记录点选一行 → 收敛诊断 / 名人堂 / 冠军版本对比',
                detail: '看最近 run 的 status、bestFitness、收敛曲线是否早停、名人堂个体的 BalAcc / IC / Brier。'
                    + '真正的退化要同时满足：近 retire_window(60) 日样本 ≥ retire_min_samples(3000)，'
                    + '且冠军 BalAcc 跌破 retire_balacc(0.50)。只看一次整体命中率不够。',
            },
            {
                no: 5, title: '换掉回放/占位冠军（进化监控 → 手动操作）',
                where: '进化监控 → 触发进化 / 晋升冠军 / 冠军版本对比与回滚',
                detail: '当前是 REPLAY 版本时，先跑一次完整 EvolveJob（pop_size=200、max_gen=60，全周期数十分钟），'
                    + '在新 run 的 Hold-out BalAcc ≥ holdout_min_balacc(0.52) 后「晋升冠军」；'
                    + '若新版本反而更差，用「回滚」退回上一个稳定版本。调试时可临时把 pop_size 调到 60、'
                    + 'max_gen 调到 12 快速验证链路，但评估真实质量必须调回默认值。',
            },
            {
                no: 6, title: '校准 + 观察影子期',
                where: '后台任务 → CalibrateJob → PredictJob；参数配置 → shadow_days',
                detail: '新冠军上线后跑一次 CalibrateJob 重拟合概率，再用 PredictJob 出预测。'
                    + 'SHADOW 会陪跑 shadow_days(5) 个交易日，达标才自动晋升，别手工跳过这段观察。',
            },
            {
                no: 7, title: '闭环验证',
                where: '后台任务 → VerifyJob → MetricJob → 总览',
                detail: '等 h 个交易日预测到期后依次跑 VerifyJob、MetricJob，观察趋势是否回升。'
                    + '至少积累 20 个交易日、3000 条以上已验证样本再下结论；期间不要反复改阈值。',
            },
        ],
        extra: '如果以上都做了命中率仍长期低于 50%：这说明当前特征集在该行情下没有稳定方向预测能力，'
            + '属于模型能力问题，应把它当研究/复盘工具使用，不要用结果做交易决策。页面顶部已标注「不构成投资建议」。',
    },
    {
        id: 'featureMissing',
        title: '特征缺失 / 看板数据滞后',
        match: (text) => /特征|FeatureJob/.test(String(text ?? '')),
        summary: '行情库已有最新交易日，但 stock_feature_daily 里没有对应特征，说明 FeatureJob 未跑或失败。',
        steps: [
            { no: 1, title: '补算特征', where: '后台任务 → FeatureJob → 立即运行', detail: '首次会自动回填全历史（本库约 3–5 分钟），之后只增量补最近 7 天。' },
            { no: 2, title: '重算指标', where: '后台任务 → VerifyJob → MetricJob', detail: '特征补齐后回填并重建指标，趋势/日历才会更新。' },
        ],
    },
    {
        id: 'priceWarning',
        title: '行情价格口径告警',
        match: (text) => /价格|复权|close|口径/.test(String(text ?? '')),
        summary: '启动时抽样比对两张行情源表的 close，偏差超过 price_check_tolerance(0.0001) 会提示。',
        steps: [
            { no: 1, title: '确认复权口径', where: '参数配置 → adjust_flag', detail: '全系统统一用 adjustflag=2（前复权），不要混用不同复权口径的表。' },
            { no: 2, title: '重跑依赖行情的任务', where: '后台任务 → FeatureJob → VerifyJob → MetricJob', detail: '行情修好后重算特征与回填结果，否则命中率会被系统性算错。' },
        ],
    },
    {
        id: 'noData',
        title: '尚无已验证预测 / 看板空白',
        match: (text) => /尚无已验证|InitJob/.test(String(text ?? '')),
        summary: '数据库里还没有 is_replay=0 且 VERIFIED 的预测，通常是首次部署。',
        steps: [
            { no: 1, title: '跑一次冷启动初始化', where: '后台任务 → InitJob → 立即运行', detail: '后端启动 60 秒也会自动检查并触发；补齐最近 10 个交易日约需数分钟，重复触发安全。' },
            { no: 2, title: '核对口径', where: '总览 → 回放下拉', detail: '默认「仅实盘」；想看历史复盘数据请切「含回放」。' },
        ],
    },
];

/** 按告警文本找对应 SOP；找不到返回 null（弹窗仍会展示术语表）。 */
export function matchAlert(text) {
    const s = String(text ?? '');
    return ALERT_SOPS.find((g) => g.match(s)) || null;
}

/** 默认 SOP（点顶部「指标说明」按钮时展示低命中率那一条，因为它最常被问到）。 */
export const DEFAULT_SOP = ALERT_SOPS[0];
