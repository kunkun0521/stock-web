import { QField, QInput, QSelect } from './QuantParts.jsx';

/** 按后端 ParamDef 动态生成策略参数表单。 */
export default function ParamForm({ defs = [], values = {}, onChange }) {
    const set = (key) => (v) => onChange({ ...values, [key]: v });
    return (
        <div className="quant-param-grid">
            {defs.map((d) => {
                const raw = values[d.key] !== undefined ? values[d.key] : d.defaultValue;
                const hint = [
                    d.min !== undefined ? `${d.min}~${d.max}` : '',
                    d.desc || '',
                ].filter(Boolean).join(' · ');
                if (d.type === 'bool') {
                    return (
                        <label key={d.key} className="quant-param quant-param--bool" title={hint}>
                            <span>{d.label}</span>
                            <input type="checkbox" checked={!!raw}
                                   onChange={(e) => set(d.key)(e.target.checked)}/>
                        </label>
                    );
                }
                if (d.type === 'enum') {
                    return (
                        <QField key={d.key} label={d.label} hint={d.desc}>
                            <QSelect value={raw} onChange={set(d.key)}
                                     options={(d.options || []).map((o) => ({ value: o, label: o }))}/>
                        </QField>
                    );
                }
                return (
                    <QField key={d.key} label={d.label}
                            hint={hint.length > 42 ? `${hint.slice(0, 42)}…` : hint}>
                        <QInput type="number" value={raw} onChange={set(d.key)}
                                min={d.min} max={d.max} step={d.step ?? (d.type === 'int' ? 1 : 0.1)}
                                title={hint}/>
                    </QField>
                );
            })}
        </div>
    );
}
