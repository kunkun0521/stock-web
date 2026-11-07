import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, CandlestickChart, LineChart } from 'echarts/charts';
import {
    AxisPointerComponent,
    DataZoomInsideComponent,
    DataZoomSliderComponent,
    GridComponent,
    LegendComponent,
    MarkAreaComponent,
    TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 按需注册，避免把整包 ECharts 打进产物
echarts.use([
    CandlestickChart, BarChart, LineChart,
    GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent,
    DataZoomInsideComponent, DataZoomSliderComponent, AxisPointerComponent,
    CanvasRenderer,
]);

/**
 * ECharts 容器：负责初始化、随窗口/容器尺寸自适应、卸载时销毁实例。
 * option 变化时整体替换（notMerge），避免残留上一段数据的系列。
 *
 * 图表容器始终挂载（空态/加载态用遮罩覆盖），这样数据稍后才到达时
 * 不需要重新初始化实例，也避免了对 null DOM 调用 init 导致组件崩溃。
 */
export default function EChart({ option, height = 320, empty, loading, emptyText = '暂无数据' }) {
    const boxRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!boxRef.current) return undefined;
        const chart = echarts.init(boxRef.current);
        chartRef.current = chart;
        const observer = new ResizeObserver(() => chart.resize());
        observer.observe(boxRef.current);
        return () => {
            observer.disconnect();
            chart.dispose();
            chartRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (chartRef.current && option) {
            // 尺寸自适应由上面的 ResizeObserver 负责，这里无需再手动 resize
            chartRef.current.setOption(option, true);
        }
    }, [option]);

    return (
        <div className="chart-box" style={{ height }}>
            <div ref={boxRef} style={{ width: '100%', height }}/>
            {empty ? <div className="chart-mask">{emptyText}</div> : null}
            {!empty && loading ? <div className="chart-mask">加载中…</div> : null}
        </div>
    );
}
