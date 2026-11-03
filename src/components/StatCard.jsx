/** 概览数字卡片 */
export default function StatCard({ label, value, tone = 'plain', hint }) {
    return (
        <div className="stat-card">
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${tone}`}>{value}</div>
            {hint ? <div className="stat-hint">{hint}</div> : null}
        </div>
    );
}
