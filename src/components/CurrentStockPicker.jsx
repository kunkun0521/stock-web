import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stockApi } from '../api/stock.js';
import { useCurrentStock } from '../context/CurrentStockContext.jsx';
import './currentStock.css';

/**
 * 顶栏「全站当前股票」选择器。
 * 这里只负责设定关注股票（不跳转），跳转详情仍由旁边的搜索框负责；
 * 设定后所有带股票输入的页面会自动跟随，无需重复输入。
 */
export default function CurrentStockPicker() {
    const { stock, isEmpty, setCurrentStock, adoptStock, resetStock, clearStock } = useCurrentStock();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [options, setOptions] = useState([]);
    const boxRef = useRef(null);

    useEffect(() => {
        const text = keyword.trim();
        if (!open || !text || /^\d{6}$/.test(text)) {
            setOptions([]);
            return undefined;
        }
        const timer = setTimeout(async () => {
            try {
                const list = await stockApi.suggest(text, 8);
                setOptions(Array.isArray(list) ? list : []);
            } catch {
                setOptions([]);
            }
        }, 220);
        return () => clearTimeout(timer);
    }, [keyword, open]);

    useEffect(() => {
        if (!open) return undefined;
        const onDocClick = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const close = () => {
        setOpen(false);
        setKeyword('');
        setOptions([]);
    };

    const pick = (item) => {
        setCurrentStock({ code: String(item.code), name: String(item.name ?? '') });
        close();
    };

    const submit = () => {
        const text = keyword.trim();
        if (!text) return;
        if (options.length) {
            pick(options[0]);
            return;
        }
        if (/^\d{6}$/.test(text)) {
            adoptStock(text);
            close();
        } else {
            // 中文名没点联想项时，回车也做一次解析
            adoptStock(text).then((hit) => { if (hit) close(); });
        }
    };

    const gotoDetail = () => {
        if (isEmpty) return;
        navigate(`/stocks/${stock.code}`, {
            state: { from: window.location.pathname + window.location.search },
        });
        close();
    };

    return (
        <div className="cs-picker" ref={boxRef}>
            <button type="button" className={`cs-chip${open ? ' active' : ''}`} onClick={() => setOpen((v) => !v)}
                    title="全站当前股票：在这里切换后，所有页面的股票输入会自动同步，无需重复输入">
                <span className="cs-label">全站股票</span>
                {isEmpty ? (
                    <span className="cs-empty">不限定</span>
                ) : (
                    <>
                        <span className="cs-code">{stock.code}</span>
                        {stock.name ? <span className="cs-name">{stock.name}</span> : null}
                    </>
                )}
                <span className="cs-caret">▾</span>
            </button>

            {open ? (
                <div className="cs-pop">
                    <div className="cs-pop-head">
                        <strong>设定全站当前股票</strong>
                        <button type="button" className="cs-close" onClick={close} aria-label="关闭">×</button>
                    </div>
                    <p className="cs-hint">
                        切换后，股票列表、量化评分、短期预测、做T模型、回本实验室的查询条件会自动使用这只股票；
                        点击榜单或涨停播报进入个股详情时也会自动同步。
                    </p>
                    <div className="cs-input-wrap">
                        <input
                            value={keyword}
                            autoFocus
                            autoComplete="off"
                            placeholder={isEmpty ? '代码或中文名，如 600519 / 贵州茅台' : `当前 ${stock.code} ${stock.name || ''}`}
                            onChange={(e) => setKeyword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); submit(); }
                                if (e.key === 'Escape') close();
                            }}
                        />
                        <button type="button" onClick={submit}>应用</button>
                    </div>
                    {options.length ? (
                        <ul className="cs-options">
                            {options.map((item) => (
                                <li key={item.code} onClick={() => pick(item)}>
                                    <span className="code">{item.code}</span>
                                    <span className="name">{item.name}</span>
                                    {item.board ? <span className="tag">{item.board}</span> : null}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    <div className="cs-pop-foot">
                        <button type="button" onClick={gotoDetail} disabled={isEmpty}>查看 K 线 →</button>
                        <button type="button" onClick={() => { resetStock(); close(); }}>恢复默认</button>
                        <button type="button" onClick={() => { clearStock(); close(); }}>不限定股票</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
