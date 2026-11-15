/**
 * 概率页通用股票搜索框：同时支持 6 位代码、中文名 / 简称、交易所代码（sh.600519）。
 *
 * 复用主站已有的 /api/stocks/suggest（stock_info 表按 code / name / secid 模糊匹配），
 * 纯前端实现，不需要改动概率引擎后端，也不用重启服务。
 *
 * 父组件约定：
 *   value/onChange  受控输入文本
 *   onPick(item)    选中一只股票（{code,name,exchange,board,...}）
 *   onOptions(list, text) 联想结果变化时回调，用于「输入中文即自动过滤榜单」
 *   pickedName      选中股票的中文名，显示在输入框下方
 */
import { useEffect, useRef, useState } from 'react';
import { stockApi } from '../api/stock.js';

const CODE_RE = /^\d{6}$/;

export default function StockSearch({
    value,
    onChange,
    onPick,
    onOptions,
    pickedName = '',
    placeholder = '代码或中文名，如 600519 / 贵州茅台',
    showSubmit = false,
    submitLabel = '查询',
    width,
    className = '',
}) {
    const [options, setOptions] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [tip, setTip] = useState('');
    const [active, setActive] = useState(0);
    const boxRef = useRef(null);
    const seqRef = useRef(0);
    // 回调每次渲染都会变，用 ref 保存最新值，避免 effect 因函数身份变化反复发请求。
    const cbRef = useRef({ onOptions, onPick, pickedName });
    cbRef.current = { onOptions, onPick, pickedName };

    useEffect(() => {
        const text = (value || '').trim();
        const seq = ++seqRef.current;
        setTip('');
        if (!text) {
            setOptions([]);
            setOpen(false);
            setLoading(false);
            cbRef.current.onOptions?.([], '');
            return undefined;
        }
        // 完整 6 位代码不需要联想，直接按代码过滤 / 查询。
        if (CODE_RE.test(text)) {
            setOptions([]);
            setOpen(false);
            setLoading(false);
            cbRef.current.onOptions?.([{ code: text, name: cbRef.current.pickedName }], text);
            return undefined;
        }
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const list = await stockApi.suggest(text, 8);
                if (seq !== seqRef.current) return;
                const opts = Array.isArray(list) ? list : [];
                setOptions(opts);
                setOpen(true);
                cbRef.current.onOptions?.(opts, text);
            } catch {
                if (seq !== seqRef.current) return;
                setOptions([]);
                setOpen(true);
                cbRef.current.onOptions?.([], text);
            } finally {
                if (seq === seqRef.current) setLoading(false);
            }
        }, 240);
        return () => clearTimeout(timer);
    }, [value]);

    useEffect(() => { setActive(0); }, [options]);

    useEffect(() => {
        const onDocClick = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const pick = (item) => {
        if (!item?.code) return;
        setOpen(false);
        setOptions([]);
        setTip('');
        cbRef.current.onPick?.(item);
    };

    const submit = async () => {
        const text = (value || '').trim();
        if (!text) {
            cbRef.current.onOptions?.([], '');
            return;
        }
        if (CODE_RE.test(text)) {
            pick({ code: text, name: cbRef.current.pickedName });
            return;
        }
        let list = options;
        if (!list.length) {
            setLoading(true);
            try {
                list = await stockApi.suggest(text, 8);
            } catch {
                list = [];
            } finally {
                setLoading(false);
            }
        }
        if (Array.isArray(list) && list.length) {
            setOptions(list);
            pick(list[0]);
        } else {
            setOptions([]);
            setOpen(true);
            setTip(`未找到「${text}」对应的股票，试试中文简称或 6 位代码`);
        }
    };

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown' && options.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(options.length - 1, i + 1));
        } else if (e.key === 'ArrowUp' && options.length) {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && options.length) pick(options[active] || options[0]);
            else void submit();
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div className={`prob-search ${className}`.trim()} ref={boxRef}
             style={width ? { width } : undefined}>
            <div className="prob-search-row">
                <input className="ga-input" type="search" value={value ?? ''}
                       placeholder={placeholder} autoComplete="off"
                       aria-label="股票搜索：支持代码、中文名、简称"
                       onChange={(e) => onChange(e.target.value)}
                       onFocus={() => options.length && setOpen(true)}
                       onKeyDown={onKeyDown}/>
                {loading ? <i className="ga-spinner prob-search-spin" aria-hidden="true"/> : null}
                {showSubmit ? (
                    <button type="button" className="ga-btn ga-btn--sm" onClick={() => void submit()}>
                        {submitLabel}
                    </button>
                ) : null}
            </div>
            {pickedName ? <span className="prob-picked" title="当前选中的股票">{pickedName}</span> : null}
            {tip ? <span className="prob-search-tip">{tip}</span> : null}
            {open ? (
                <ul className="prob-suggest" role="listbox">
                    {options.map((item, i) => (
                        <li key={`${item.code}-${i}`} role="option" aria-selected={i === active}
                            className={i === active ? 'is-active' : ''}
                            onMouseEnter={() => setActive(i)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(item)}>
                            <span className="code">{item.code}</span>
                            <span className="name">{item.name}</span>
                            {item.exchange ? <span className="tag">{item.exchange}</span> : null}
                            {item.board ? <span className="tag">{item.board}</span> : null}
                        </li>
                    ))}
                    {!options.length && !loading ? (
                        <li className="prob-suggest-empty">无匹配股票</li>
                    ) : null}
                    {loading && !options.length ? (
                        <li className="prob-suggest-empty">检索中…</li>
                    ) : null}
                </ul>
            ) : null}
        </div>
    );
}
