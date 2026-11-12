export const trunc = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

export function Card({ title, right, span, children }) {
  return (
    <div className={"card" + (span ? " span" + span : "")}>
      {(title || right) && (
        <div className="card-h">
          <h3>{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Kpi({ label, value, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{value}</div>
      {sub && <div className="kpi-s">{sub}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(([k, l]) => (
        <button key={k} className={"tab" + (k === value ? " on" : "")} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Sel({ label, value, onChange, options }) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = Array.isArray(o) ? o[0] : o;
          const l = Array.isArray(o) ? o[1] : o;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function Check({ label, checked, onChange }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
