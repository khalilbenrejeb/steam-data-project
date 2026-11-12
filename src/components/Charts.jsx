import Lib from "../lib/analysis.js";
import { trunc } from "./Ui.jsx";

export const C = ["#5ad1ff", "#a78bfa", "#22d3ee", "#7dd3fc", "#c4b5fd", "#38bdf8", "#67e8f9", "#818cf8"];
const fmt = Lib.fmt;

export function BarH({ data, color = C[0], fmtv = fmt }) {
  if (!data.length) return null;
  const rowH = 26, labW = 180, W = 680, pad = 70;
  const H = data.length * rowH + 8;
  const max = Math.max(...data.map((d) => d.value), 1e-9);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      {data.map((d, i) => {
        const w = Math.max(2, (d.value / max) * (W - labW - pad));
        const txt = d.text || fmtv(d.value);
        return (
          <g key={i}>
            <text x={labW - 8} y={i * rowH + 17} textAnchor="end" className="lbl">
              {trunc(d.label, 26)}
            </text>
            <rect x={labW} y={i * rowH + 4} width={w} height={rowH - 9} rx={4} fill={d.color || color}>
              <title>{`${d.label}: ${txt}`}</title>
            </rect>
            <text x={labW + w + 6} y={i * rowH + 17} className="lbl">
              {txt}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Hist({ counts, edges, color = C[0] }) {
  const W = 680, H = 250, l = 46, b = 28, t = 8, r = 10;
  const max = Math.max(...counts, 1);
  const bw = (W - l - r) / counts.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      {counts.map((c, i) => {
        const bh = (c / max) * (H - b - t);
        return (
          <rect key={i} x={l + i * bw + 1} y={H - b - bh} width={Math.max(1, bw - 2)} height={bh} rx={2} fill={color}>
            <title>{`${fmt(edges[i])} – ${fmt(edges[i + 1])}: ${c.toLocaleString()} rows`}</title>
          </rect>
        );
      })}
      <text x={l} y={H - 8} className="lbl">{fmt(edges[0])}</text>
      <text x={W - r} y={H - 8} textAnchor="end" className="lbl">{fmt(edges[edges.length - 1])}</text>
      <text x={l - 6} y={t + 10} textAnchor="end" className="lbl">{fmt(max)}</text>
      <text x={l - 6} y={H - b} textAnchor="end" className="lbl">0</text>
    </svg>
  );
}

export function Scatter({ pts, xl, yl, diag }) {
  const W = 680, H = 340, l = 56, b = 34, t = 10, r = 12;
  if (!pts.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  if (diag) {
    const lo = Math.min(x0, y0), hi = Math.max(x1, y1);
    x0 = y0 = lo;
    x1 = y1 = hi;
  }
  if (x1 === x0) x1 = x0 + 1;
  if (y1 === y0) y1 = y0 + 1;
  const X = (v) => l + ((v - x0) / (x1 - x0)) * (W - l - r);
  const Y = (v) => H - b - ((v - y0) / (y1 - y0)) * (H - b - t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      {diag && <line x1={X(x0)} y1={Y(y0)} x2={X(x1)} y2={Y(y1)} stroke="#a78bfa" strokeDasharray="5 5" opacity={0.8} />}
      {pts.map((p, i) => (
        <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={2.4} fill={C[0]} opacity={0.45} />
      ))}
      <text x={l} y={H - 16} className="lbl">{fmt(x0)}</text>
      <text x={W - r} y={H - 16} textAnchor="end" className="lbl">{fmt(x1)}</text>
      <text x={W / 2} y={H - 3} textAnchor="middle" className="lbl2">{xl}</text>
      <text x={l - 6} y={t + 10} textAnchor="end" className="lbl">{fmt(y1)}</text>
      <text x={l - 6} y={H - b} textAnchor="end" className="lbl">{fmt(y0)}</text>
      <text x={4} y={t + 10} className="lbl2">{yl}</text>
    </svg>
  );
}

export function Line({ pts }) {
  const W = 680, H = 280, l = 56, b = 30, t = 10, r = 12;
  if (pts.length < 1) return <p className="muted">No dated rows.</p>;
  const ys = pts.map((p) => p.y);
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(...ys, y0 + 1e-9);
  const X = (i) => l + (pts.length === 1 ? 0.5 : i / (pts.length - 1)) * (W - l - r);
  const Y = (v) => H - b - ((v - y0) / (y1 - y0)) * (H - b - t);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p.y)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      <path d={`${d} L${X(pts.length - 1)},${Y(y0)} L${X(0)},${Y(y0)} Z`} fill={C[0]} opacity={0.12} />
      <path d={d} fill="none" stroke={C[0]} strokeWidth={2.2} />
      {pts.length <= 80 &&
        pts.map((p, i) => (
          <circle key={i} cx={X(i)} cy={Y(p.y)} r={3} fill={C[1]}>
            <title>{`${p.x}: ${fmt(p.y)}`}</title>
          </circle>
        ))}
      <text x={l} y={H - 8} className="lbl">{pts[0].x}</text>
      <text x={W - r} y={H - 8} textAnchor="end" className="lbl">{pts[pts.length - 1].x}</text>
      <text x={l - 6} y={t + 10} textAnchor="end" className="lbl">{fmt(y1)}</text>
      <text x={l - 6} y={H - b} textAnchor="end" className="lbl">{fmt(y0)}</text>
    </svg>
  );
}

function heatColor(v) {
  if (v !== v) return "#1e293b";
  const a = Math.min(1, Math.abs(v));
  const base = [30, 41, 59];
  const tgt = v >= 0 ? [56, 189, 248] : [167, 139, 250];
  return `rgb(${base.map((b, i) => Math.round(b + (tgt[i] - b) * a)).join(",")})`;
}

export function Heat({ names, M }) {
  const show = names.length <= 12;
  return (
    <div className="heat-wrap">
      <table className="heat">
        <thead>
          <tr>
            <th></th>
            {names.map((n, j) => (
              <th key={j} title={n}>{trunc(n, 9)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {names.map((n, i) => (
            <tr key={i}>
              <th title={n}>{trunc(n, 14)}</th>
              {names.map((_, j) => (
                <td
                  key={j}
                  style={{ background: heatColor(M[i][j]) }}
                  title={`${n} × ${names[j]}: ${M[i][j] === M[i][j] ? M[i][j].toFixed(3) : "n/a"}`}
                >
                  {show && M[i][j] === M[i][j] ? M[i][j].toFixed(2) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Confusion({ cm, classes }) {
  const mx = Math.max(...cm.flat(), 1);
  return (
    <div className="heat-wrap">
      <table className="heat">
        <thead>
          <tr>
            <th>actual ↓ / pred →</th>
            {classes.map((c, j) => (
              <th key={j} title={c}>{trunc(c, 8)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cm.map((row, i) => (
            <tr key={i}>
              <th title={classes[i]}>{trunc(classes[i], 12)}</th>
              {row.map((v, j) => (
                <td key={j} style={{ background: `rgba(90,209,255,${0.08 + 0.8 * (v / mx)})` }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
