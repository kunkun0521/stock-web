import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

/**
 * 通用 ECharts 容器。
 * 用整包 echarts，省去按需注册清单，蜡烛图 / 饼图 / 散点标记 / 折线 / 柱状都能直接用。
 * 负责初始化、随容器尺寸自适应、卸载销毁；option 变化整体替换（notMerge）避免残留系列。
 * 容器始终挂载，空态/加载态用遮罩覆盖，数据晚到也不需要重新 init。
 */
export default function GaChart({
    option,
    height = 280,
    onClick,
    empty = false,
    emptyText = '暂无数据',
    loading = false,
}) {
    const boxRef = useRef(null);
    const chartRef = useRef(null);
    const clickRef = useRef(onClick);
    clickRef.current = onClick;

    useEffect(() => {
        if (!boxRef.current) return undefined;
        const chart = echarts.init(boxRef.current);
        chartRef.current = chart;
        chart.on('click', (params) => clickRef.current?.(params));
        const observer = new ResizeObserver(() => chart.resize());
        observer.observe(boxRef.current);
        return () => {
            observer.disconnect();
            chart.dispose();
            chartRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (chartRef.current && option) chartRef.current.setOption(option, true);
    }, [option]);

    return (
        <div className="ga-chart" style={{ height }}>
            <div ref={boxRef} style={{ width: '100%', height }}/>
            {empty ? <div className="ga-chart-mask">{emptyText}</div> : null}
            {!empty && loading ? <div className="ga-chart-mask">加载中…</div> : null}
        </div>
    );
}
