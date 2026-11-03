/** 分页控件：页码从 1 开始 */
export default function Pagination({ page, size, total, pages, onPage, onSize }) {
    const sizes = [20, 50, 100];
    return (
        <div className="pagination">
            <span className="muted">共 {total} 条 / {pages} 页</span>
            <div className="pager-buttons">
                <button type="button" disabled={page <= 1} onClick={() => onPage(1)}>首页</button>
                <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
                <span className="current">{page}</span>
                <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button>
                <button type="button" disabled={page >= pages} onClick={() => onPage(pages)}>末页</button>
            </div>
            {onSize ? (
                <label className="page-size">
                    每页
                    <select value={size} onChange={(e) => onSize(Number(e.target.value))}>
                        {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
            ) : null}
        </div>
    );
}
