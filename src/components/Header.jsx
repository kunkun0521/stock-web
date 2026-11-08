import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { stockApi } from '../api/stock.js';

/** 内联线条图标，避免引入额外图标依赖 */
function Icon({ d }) {
    return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={d}/>
        </svg>
    );
}

const NAV_ITEMS = [
    { to: '/', label: '市场看板', end: true, icon: 'M3 3v18h18 M7 15l3-4 3 3 5-7' },
    { to: '/stocks', label: '股票列表', icon: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01' },
    { to: '/scores', label: '量化评分', icon: 'M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9z' },
    { to: '/short-term', label: '短期预测', icon: 'M13 2L4 14h7l-1 8 9-12h-7z' },
    { to: '/forecast', label: '模型预测', icon: 'M5 5h14v14H5z M9 9h6v6H9z M9 1v4 M15 1v4 M9 19v4 M15 19v4 M1 9h4 M1 15h4 M19 9h4 M19 15h4' },
    { to: '/t-trading', label: '做T模型', icon: 'M20 8H9a4 4 0 0 0 0 8h3 M17 5l3 3-3 3 M4 16h11a4 4 0 0 0 0-8H9 M7 13l-3 3 3 3' },
    { to: '/t-lab', label: '回本实验室', icon: 'M3 17l5-6 4 3 5-8 4 4 M3 21h18 M17 6h4v4' },
    { to: '/data-crawler', label: '数据抓取', icon: 'M12 3v12 M7 10l5 5 5-5 M4 20h16' },
];

/** 顶栏右侧的股票搜索（联想逻辑沿用原顶部导航） */
export function StockSearch() {
    const navigate = useNavigate();
    const [keyword, setKeyword] = useState('');
    const [options, setOptions] = useState([]);
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        const text = keyword.trim();
        if (!text) {
            setOptions([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                setOptions(await stockApi.suggest(text, 8));
                setOpen(true);
            } catch {
                setOptions([]);
            }
        }, 220);
        return () => clearTimeout(timer);
    }, [keyword]);

    useEffect(() => {
        const onDocClick = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const goto = (code) => {
        setOpen(false);
        setKeyword('');
        navigate(`/stocks/${code}`, { state: { from: window.location.pathname + window.location.search } });
    };

    return (
        <div className="search-box" ref={boxRef}>
            <input
                value={keyword}
                placeholder="搜索代码 / 名称，如 600519 贵州茅台"
                onChange={(e) => setKeyword(e.target.value)}
                onFocus={() => options.length && setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && options.length) goto(options[0].code);
                }}
            />
            {open && options.length > 0 ? (
                <ul className="suggest-list">
                    {options.map((item) => (
                        <li key={item.code} onClick={() => goto(item.code)}>
                            <span className="code">{item.code}</span>
                            <span className="name">{item.name}</span>
                            {item.board ? <span className="tag">{item.board}</span> : null}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

/** 左侧固定侧栏：品牌 + 分组导航 + 底部数据源说明 */
export default function Sidebar({ onNavigate }) {
    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <span className="sidebar-logo">S</span>
                <div>
                    <div className="sidebar-brand-title">股票数据量化平台</div>
                    <div className="sidebar-brand-sub">Stock Data Quant Platform</div>
                </div>
            </div>
            <div className="sidebar-section">功能导航</div>
            <nav className="sidebar-nav">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={onNavigate}
                        className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                    >
                        <Icon d={item.icon}/>
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>
            <div className="sidebar-foot">
                <div className="sidebar-foot-label">数据源</div>
                <div>本地 MySQL · stock_eastmoney</div>
                <div className="sidebar-foot-hint">仅用于数据查看，不构成投资建议</div>
            </div>
        </aside>
    );
}
