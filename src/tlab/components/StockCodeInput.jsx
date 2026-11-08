import { useEffect, useRef, useState } from 'react';
import { stockApi } from '../../api/stock.js';

/**
 * 把「6 位代码 / 中文名 / 简称」解析成代码。
 * 复用主站已有的 /api/stocks/suggest，不新增也不改动后端接口。
 */
export async function resolveStock(text) {
    const value = (text || '').trim();
    if (!value) throw new Error('请输入股票代码或名称');
    if (/^\d{6}$/.test(value)) return { code: value, name: '' };
    const list = await stockApi.suggest(value, 5);
    if (!list?.length) throw new Error(`未找到股票：${value}`);
    return { code: list[0].code, name: list[0].name };
}

/**
 * 股票输入框：支持代码与中文名，输入时联想，选中后回填代码与名称。
 * 只负责展示与选择，解析逻辑由 resolveStock 在提交前调用。
 */
export default function StockCodeInput({
    value, name, onChange, onPick,
    placeholder = '代码或中文名，如 600519 / 贵州茅台',
}) {
    const [options, setOptions] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const boxRef = useRef(null);
    const skipRef = useRef(false);

    useEffect(() => {
        // 选中联想项后代码已确定，不再为回填的代码发一次请求
        if (skipRef.current) {
            skipRef.current = false;
            return undefined;
        }
        const text = (value || '').trim();
        if (!text) {
            setOptions([]);
            setOpen(false);
            return undefined;
        }
        // 6 位代码已经完整，不需要联想；也避免提交回填代码后下拉再次弹出
        if (/^\d{6}$/.test(text)) {
            setOptions([]);
            setOpen(false);
            return undefined;
        }
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                setOptions(await stockApi.suggest(text, 8));
                setOpen(true);
            } catch {
                setOptions([]);
            } finally {
                setLoading(false);
            }
        }, 240);
        return () => clearTimeout(timer);
    }, [value]);

    useEffect(() => {
        const onDocClick = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const pick = (item) => {
        skipRef.current = true;
        onPick(item);
        setOpen(false);
        setOptions([]);
    };

    return (
        <div className="stock-input" ref={boxRef}>
            <input
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                onFocus={() => options.length && setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && open && options.length) {
                        e.preventDefault();
                        pick(options[0]);
                    }
                    if (e.key === 'Escape') setOpen(false);
                }}
            />
            {name ? <span className="stock-picked">{name}</span> : null}
            {open ? (
                <ul className="stock-suggest">
                    {options.map((item) => (
                        <li key={item.code} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(item)}>
                            <span className="code">{item.code}</span>
                            <span className="name">{item.name}</span>
                            {item.board ? <span className="tag">{item.board}</span> : null}
                        </li>
                    ))}
                    {!options.length ? <li className="muted">{loading ? '检索中…' : '无匹配股票'}</li> : null}
                </ul>
            ) : null}
        </div>
    );
}
