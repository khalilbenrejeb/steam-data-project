import { useState, useMemo } from "react";
import Lib from "../lib/analysis.js";
import { Card, Kpi, Tabs, Sel, Check, trunc } from "../components/Ui.jsx";
import { BarH, Hist, Scatter, Line, Heat, C } from "../components/Charts.jsx";

const fmt = Lib.fmt;

export default function Explore({ ds }) {
  const [tab, setTab] = useState("overview");
  const nums = ds.cols.filter((c) => c.type === "numeric");
  const cats = ds.cols.filter((c) => c.type === "category" && Lib.catInfo(c).nunique > 1);
  const dates = ds.cols.filter((c) => c.type === "date");
  const cols = ds.cols.filter((c) => c.vals);
  const miss = cols.reduce((a, c) => a + Lib.missingCount(c), 0);
  const comp = 100 * (1 - miss / (ds.n * Math.max(cols.length, 1)));
  const ins = useMemo(() => Lib.insights(ds), [ds]);

  return (
    <div>
      <div className="kpis">
        <Kpi label="Rows" value={ds.n.toLocaleString()} />
        <Kpi label="Columns" value={ds.cols.length} />
        <Kpi label="Complete" value={comp.toFixed(1) + "%"} />
        <Kpi label="Numeric" value={nums.length} />
        <Kpi label="Category" value={cats.length} />
        <Kpi label="Date" value={dates.length} />
      </div>

      {ds.notes.map((n, i) => (
        <div key={i} className="note">ℹ️ {n}</div>
      ))}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["overview", "✨ Overview"],
          ["columns", "📋 Columns"],
          ["charts", "📊 Chart builder"],
          ["corr", "🔗 Correlations"],
          ["data", "🗂 Data"],
        ]}
      />

      {tab === "overview" && <Overview nums={nums} cats={cats} dates={dates} ds={ds} ins={ins} />}
      {tab === "columns" && <Columns ds={ds} />}
      {tab === "charts" && <Builder ds={ds} nums={nums} cats={cats} dates={dates} />}
      {tab === "corr" && <Corr nums={nums} />}
      {tab === "data" && <DataTable ds={ds} />}
    </div>
  );
}

function HistCard({ c }) {
  const s = Lib.numStats(c);
  const [trim, setTrim] = useState(Math.abs(s.skew) > 2);
  const hh = useMemo(() => Lib.hist(c, { trim }), [c, trim]);
  return (
    <Card title={c.name} right={<Check label="trim extremes" checked={trim} onChange={setTrim} />}>
      <Hist counts={hh.counts} edges={hh.edges} />
      <div className="stats">
        {`mean ${fmt(s.mean)} · median ${fmt(s.median)} · std ${fmt(s.std)} · min ${fmt(s.min)} · max ${fmt(s.max)}`}
      </div>
    </Card>
  );
}

function CatCard({ c }) {
  const data = useMemo(
    () => (c.multi ? Lib.tokenCounts(c) : Lib.catInfo(c).entries).slice(0, 10).map(([label, value]) => ({ label, value })),
    [c]
  );
  return (
    <Card title={c.name + (c.multi ? " (multi-value)" : "")}>
      <BarH data={data} />
    </Card>
  );
}

function Overview({ ds, nums, cats, dates, ins }) {
  const [more, setMore] = useState(false);
  const nShow = more ? 12 : 4;
  return (
    <div>
      <Card title="Key insights">
        {ins.map((t, i) => (
          <div key={i} className="insight" dangerouslySetInnerHTML={{ __html: t }} />
        ))}
      </Card>

      {dates.length > 0 && <TrendCard ds={ds} dates={dates} nums={nums} />}

      {nums.length > 0 && (
        <div>
          <h2 className="sec">Distributions</h2>
          <div className="grid2">
            {nums.slice(0, nShow).map((c) => (
              <HistCard key={c.name} c={c} />
            ))}
          </div>
        </div>
      )}

      {cats.length > 0 && (
        <div>
          <h2 className="sec">Top categories</h2>
          <div className="grid2">
            {cats.slice(0, nShow).map((c) => (
              <CatCard key={c.name} c={c} />
            ))}
          </div>
        </div>
      )}

      {(nums.length > 4 || cats.length > 4) && (
        <button className="btn ghost" onClick={() => setMore(!more)} style={{ marginTop: 16 }}>
          {more ? "Show fewer" : "Show more charts"}
        </button>
      )}
    </div>
  );
}

function Columns({ ds }) {
  const heads = ["name", "type", "miss", "uniq", "mean", "median", "std", "min", "max", "top"];
  const labels = {
    name: "Column", type: "Type", miss: "Missing", uniq: "Unique", mean: "Mean",
    median: "Median", std: "Std", min: "Min", max: "Max", top: "Most common",
  };
  const rows = ds.cols.map((c) => {
    const m = Lib.missingCount(c);
    const r = { name: c.name, type: c.type + (c.multi ? " (multi)" : ""), miss: ((100 * m) / ds.n).toFixed(1) + "%" };
    if (c.type === "numeric") {
      const s = Lib.numStats(c);
      Object.assign(r, {
        uniq: fmt(Lib.uniqueCount(c)), mean: fmt(s.mean), median: fmt(s.median),
        std: fmt(s.std), min: fmt(s.min), max: fmt(s.max),
      });
    } else if (c.type === "date") {
      const s = Lib.numStats(c);
      Object.assign(r, { min: Lib.iso(s.min), max: Lib.iso(s.max) });
    } else if (c.type === "category" || c.type === "id") {
      const e = Lib.catInfo(c);
      Object.assign(r, { uniq: fmt(e.nunique), top: e.entries[0] ? trunc(e.entries[0][0], 24) : "" });
    }
    return r;
  });
  return (
    <Card>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {heads.map((k) => (
                <th key={k}>{labels[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                {heads.map((k) => (
                  <td key={k} className={k === "type" ? "ty ty-" + String(r.type).split(" ")[0] : ""}>
                    {r[k] ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TrendCard({ ds, dates, nums }) {
  const [dc, setDc] = useState(dates[0].name);
  const [unit, setUnit] = useState("Month");
  const [metric, setMetric] = useState("__count");
  const [agg, setAgg] = useState("mean");
  const pts = useMemo(() => {
    const d = ds.cols.find((c) => c.name === dc);
    const m = metric === "__count" ? null : ds.cols.find((c) => c.name === metric);
    return Lib.trend(ds, d, m, unit, agg);
  }, [ds, dc, unit, metric, agg]);
  return (
    <Card title="Trend over time">
      <div className="controls">
        {dates.length > 1 && <Sel label="Date" value={dc} onChange={setDc} options={dates.map((d) => d.name)} />}
        <Sel label="Group by" value={unit} onChange={setUnit} options={["Year", "Month", "Day"]} />
        <Sel
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={[["__count", "Row count"], ...nums.map((n) => [n.name, n.name])]}
        />
        {metric !== "__count" && <Sel label="Aggregate" value={agg} onChange={setAgg} options={["mean", "sum"]} />}
      </div>
      <Line pts={pts} />
    </Card>
  );
}

function Builder({ ds, nums, cats, dates }) {
  const kinds = [
    ["hist", "Histogram"],
    ["cat", "Category counts"],
    ["scatter", "Scatter"],
    ["avg", "Average by category"],
  ];
  if (dates.length) kinds.push(["trend", "Trend over time"]);

  const [kind, setKind] = useState("hist");
  const [a, setA] = useState((nums[0] || {}).name);
  const [b, setB] = useState((nums[1] || nums[0] || {}).name);
  const [cat, setCat] = useState((cats[0] || {}).name);
  const [top, setTop] = useState("15");
  const [logx, setLogx] = useState(false);
  const [trim, setTrim] = useState(true);
  const col = (n) => ds.cols.find((c) => c.name === n);
  const numOpts = nums.map((n) => n.name);
  const catOpts = cats.map((n) => n.name);
  const topSel = <Sel label="Top" value={top} onChange={setTop} options={["10", "15", "25"]} />;

  let body;
  if (kind === "hist" && col(a)) {
    const hh = Lib.hist(col(a), { trim, log: logx });
    body = (
      <div>
        <div className="controls">
          <Sel label="Column" value={a} onChange={setA} options={numOpts} />
          <Check label="trim extremes" checked={trim} onChange={setTrim} />
          <Check label="log scale" checked={logx} onChange={setLogx} />
        </div>
        <Hist counts={hh.counts} edges={hh.edges} />
      </div>
    );
  } else if (kind === "cat" && col(cat)) {
    const c = col(cat);
    const data = (c.multi ? Lib.tokenCounts(c) : Lib.catInfo(c).entries)
      .slice(0, Number(top))
      .map(([label, value]) => ({ label, value }));
    body = (
      <div>
        <div className="controls">
          <Sel label="Column" value={cat} onChange={setCat} options={catOpts} />
          {topSel}
        </div>
        <BarH data={data} />
      </div>
    );
  } else if (kind === "scatter" && col(a) && col(b)) {
    const A = col(a).vals, B = col(b).vals;
    const pts = [];
    const step = Math.max(1, Math.floor(ds.n / 2000));
    for (let i = 0; i < ds.n; i += step) if (A[i] === A[i] && B[i] === B[i]) pts.push([A[i], B[i]]);
    const r = Lib.pearson(A, B);
    body = (
      <div>
        <div className="controls">
          <Sel label="X" value={a} onChange={setA} options={numOpts} />
          <Sel label="Y" value={b} onChange={setB} options={numOpts} />
          <span className="pill">{"r = " + (r === r ? r.toFixed(3) : "n/a")}</span>
        </div>
        <Scatter pts={pts} xl={a} yl={b} />
      </div>
    );
  } else if (kind === "avg" && col(cat) && col(a)) {
    const c = col(cat), v = col(a).vals, m = new Map();
    for (let i = 0; i < ds.n; i++) {
      const x = v[i];
      if (x !== x || c.vals[i] === "") continue;
      const keys = c.multi ? Lib.tokens(c.vals[i]) : [c.vals[i]];
      for (const k of keys) {
        const e = m.get(k) || [0, 0];
        e[0] += x;
        e[1]++;
        m.set(k, e);
      }
    }
    const data = [...m.entries()]
      .filter((e) => e[1][1] >= 5)
      .map(([label, e]) => ({ label, value: e[0] / e[1] }))
      .sort((p, q) => q.value - p.value)
      .slice(0, Number(top));
    body = (
      <div>
        <div className="controls">
          <Sel label="Category" value={cat} onChange={setCat} options={catOpts} />
          <Sel label="Average of" value={a} onChange={setA} options={numOpts} />
          {topSel}
        </div>
        <BarH data={data} />
        <div className="muted">Categories with fewer than 5 rows are hidden.</div>
      </div>
    );
  } else if (kind === "trend" && dates.length) {
    body = <TrendCard ds={ds} dates={dates} nums={nums} />;
  } else {
    body = <p className="muted">This chart needs columns this dataset doesn't have.</p>;
  }

  return (
    <Card title="Chart builder">
      <Tabs value={kind} onChange={setKind} tabs={kinds} />
      {body}
    </Card>
  );
}

function Corr({ nums }) {
  const [sel, setSel] = useState(nums.slice(0, 12).map((n) => n.name));
  const chosen = nums.filter((n) => sel.includes(n.name));
  const M = useMemo(() => Lib.corrMatrix(chosen), [sel]);

  if (nums.length < 2)
    return (
      <Card>
        <p className="muted">Need at least 2 numeric columns.</p>
      </Card>
    );

  const pairs = [];
  chosen.forEach((x, i) =>
    chosen.forEach((y, j) => {
      if (j > i && M[i][j] === M[i][j])
        pairs.push({
          label: `${x.name} × ${y.name}`,
          value: Math.abs(M[i][j]),
          text: M[i][j].toFixed(2),
          color: M[i][j] >= 0 ? C[0] : C[1],
        });
    })
  );
  pairs.sort((p, q) => q.value - p.value);

  return (
    <div>
      <Card title="Pick columns">
        <div className="chips">
          {nums.map((n) => (
            <button
              key={n.name}
              className={"chip" + (sel.includes(n.name) ? " on" : "")}
              onClick={() => setSel(sel.includes(n.name) ? sel.filter((x) => x !== n.name) : [...sel, n.name].slice(0, 20))}
            >
              {n.name}
            </button>
          ))}
        </div>
      </Card>
      {chosen.length >= 2 && (
        <div className="grid2">
          <Card title="Correlation matrix">
            <Heat names={chosen.map((c) => c.name)} M={M} />
          </Card>
          <Card title="Strongest pairs (|r|)">
            <BarH data={pairs.slice(0, 10)} />
            <div className="muted">Cyan = positive, purple = negative.</div>
          </Card>
        </div>
      )}
    </div>
  );
}

function DataTable({ ds }) {
  return (
    <Card title="First 100 rows">
      <div className="tbl-wrap tall">
        <table className="tbl">
          <thead>
            <tr>
              {ds.header.map((x, i) => (
                <th key={i}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ds.preview.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>{trunc(v, 40)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
