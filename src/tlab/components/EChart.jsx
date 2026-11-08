import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, CandlestickChart, LineChart, ScatterChart } from 'echarts/charts';
import {
    AxisPointerComponent, DataZoomInsideComponent, DataZoomSliderComponent,
    GridComponent, LegendComponent, MarkAreaComponent, MarkPointComponent,
    TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
    CandlestickChart, BarChart, LineChart, ScatterChart,
    GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, MarkPointComponent,
    DataZoomInsideComponent, DataZoomSliderComponent, AxisPointerComponent, CanvasRenderer,
]);

/** ECharts 容器：初始化、自适应、卸载销毁；option 变化整体替换避免残留系列。 */
export default function EChart({ option, height = 260, onClick, empty, emptyText = '暂无数据' }) {
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
        return () => { observer.disconnect(); chart.dispose(); chartRef.current = null; };
    }, []);

    useEffect(() => {
        if (chartRef.current && option) chartRef.current.setOption(option, true);
    }, [option]);

    return (
        <div className="chart-box" style={{ height }}>
            <div ref={boxRef} style={{ width: '100%', height }}/>
            {empty ? <div className="chart-mask">{emptyText}</div> : null}
        </div>
    );
}
