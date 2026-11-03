import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { stockApi } from '../api/stock.js';

/** 顶部导航 + 股票搜索（调用 /api/stocks/suggest 联想） */
export default function Header() {
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
        navigate(`/stocks/${code}`);
    };

    return (
        <header className="app-header">
            <div className="brand">股票数据可视化</div>
            <nav className="nav">
                <NavLink to="/" end>市场看板</NavLink>
                <NavLink to="/stocks">股票列表</NavLink>
                <NavLink to="/scores">量化评分</NavLink>
                <NavLink to="/short-term">短期预测</NavLink>
                <NavLink to="/data-crawler">数据抓取</NavLink>
            </nav>
            <div className="search-box" ref={boxRef}>
                <input
                    value={keyword}
                    placeholder="搜索代码 / 名称，如 600215"
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
        </header>
    );
}
