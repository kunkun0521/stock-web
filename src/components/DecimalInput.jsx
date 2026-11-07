/**
 * 受控数字输入：用 text + inputMode="decimal" 代替原生 type="number"。
 *
 * <p>原生 number 输入框会把「1439.」这类尚未输完的中间态按 HTML 规范清洗成空串，
 * React 受控组件随即把空值写回，小数点就被吞掉，手工输入小数时会出现
 * 「打了小数点没反应 / 停顿后变成另一个数」的现象；step 不匹配时也会被浏览器标红。
 * 这里自行做字符归一化，完整保留中间态，最终由调用方在提交时 Number() 转换。</p>
 *
 * <p>同时兼容中文输入法：全角数字、全角句点「。」「．」、全角负号都会归一化；
 * 传 step 时可用 ↑ / ↓ 按步长微调，补回 number 输入框的方向键能力。</p>
 */
export default function DecimalInput({ value, onChange, step, allowNegative = false, ...rest }) {
    const sanitize = (raw) => {
        let next = String(raw)
            .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
            .replace(/[。．]/g, '.')
            .replace(/[－—–]/g, '-')
            .replace(/[^\d.\-]/g, '');

        // 只保留第一个小数点，负号只允许出现在开头
        const dot = next.indexOf('.');
        if (dot >= 0) {
            next = next.slice(0, dot + 1) + next.slice(dot + 1).replace(/\./g, '');
        }
        if (!allowNegative) {
            next = next.replace(/-/g, '');
        } else if (next.lastIndexOf('-') > 0) {
            next = next.startsWith('-')
                ? '-' + next.slice(1).replace(/-/g, '')
                : next.replace(/-/g, '');
        }
        return next;
    };

    const handleKeyDown = (event) => {
        if (!step || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        const current = Number(value);
        const base = Number.isFinite(current) ? current : 0;
        const delta = Number(step) * (event.key === 'ArrowUp' ? 1 : -1);
        onChange(String(Number((base + delta).toFixed(6))));
    };

    return (
        <input
            {...rest}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value ?? ''}
            onChange={(event) => onChange(sanitize(event.target.value))}
            onKeyDown={handleKeyDown}
        />
    );
}
