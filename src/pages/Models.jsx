import { useState, useMemo, useEffect } from "react";
import Lib from "../lib/analysis.js";
import { Card, Sel, Check } from "../components/Ui.jsx";
import { BarH, Scatter, Confusion, C } from "../components/Charts.jsx";

const fmt = Lib.fmt;

export default function Models({ ds }) {
  const targets = ds.cols.filter(
    (c) =>
      c.type === "numeric" ||
      (c.type === "category" && !c.multi && Lib.catInfo(c).nunique >= 2 && Lib.catInfo(c).nunique <= 20)
  );
  const [target, setTarget] = useState(targets.length ? targets[0].name : "");
  const [feats, setFeats] = useState([]);
  const [forceClf, setForceClf] = useState(false);
  const [logY, setLogY] = useState(false);
  const [maxRows, setMaxRows] = useState("6000");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  const usable = (c) =>
    (c.type === "numeric" ||
      c.type === "date" ||
      (c.type === "category" && (c.multi || Lib.catInfo(c).nunique <= 300))) &&
    Lib.missingCount(c) / ds.n < 0.6;

  const candidates = ds.cols.filter((c) => c.name !== target && usable(c));

  useEffect(() => {
    setFeats(ds.cols.filter((c) => c.name !== target && usable(c)).map((c) => c.name));
    setRes(null);
  }, [target, ds]);

  const tcol = ds.cols.find((c) => c.name === target);
  const isReg = !!tcol && tcol.type === "numeric" && !forceClf;
  const canForce = !!tcol && tcol.type === "numeric" && Lib.uniqueCount(tcol) <= 20;

  const leak = useMemo(() => {
    if (!tcol || tcol.type !== "numeric") return [];
    return ds.cols
      .filter(
        (c) =>
          c.type === "numeric" &&
          c.name !== target &&
          feats.includes(c.name) &&
          Math.abs(Lib.pearson(c.vals, tcol.vals)) > 0.97
      )
      .map((c) => c.name);
  }, [feats, target]);

  async function run() {
    setRunning(true);
    setRes(null);
    setErr("");
    try {
      await new Promise((r) => setTimeout(r, 30));
      const data = Lib.prepareModelData(ds, {
        target,
        features: feats,
        forceClf,
        logY,
        maxRows: Number(maxRows),
        seed: 11,
      });
      const out = await Lib.runModels(data, setProgress);
      setRes({ data, ...out });
    } catch (e) {
      setErr(e.message || String(e));
    }
    setRunning(false);
    setProgress("");
  }

  if (!targets.length)
    return (
      <Card>
        <p>No usable target column found (need a numeric column or a category with 2-20 values).</p>
      </Card>
    );

  return (
    <div>
      <Card title="1 · What do you want to predict?">
        <div className="controls">
          <Sel
            label="Target column"
            value={target}
            onChange={setTarget}
            options={targets.map((t) => [t.name, `${t.name} (${t.type})`])}
          />
          <Sel
            label="Training rows"
            value={maxRows}
            onChange={setMaxRows}
            options={[
              ["3000", "3,000 (fast)"],
              ["6000", "6,000"],
              ["12000", "12,000 (slower)"],
            ]}
          />
          {canForce && <Check label="treat as classes" checked={forceClf} onChange={setForceClf} />}
          {isReg && <Check label="log-transform target (skewed values)" checked={logY} onChange={setLogY} />}
        </div>

        <div className="pill big">{isReg ? "Task: regression (predict a number)" : "Task: classification (predict a class)"}</div>

        <h4>{`Features used (${feats.length})`}</h4>
        <div className="chips">
          {candidates.map((c) => (
            <button
              key={c.name}
              className={"chip" + (feats.includes(c.name) ? " on" : "")}
              onClick={() => setFeats(feats.includes(c.name) ? feats.filter((x) => x !== c.name) : [...feats, c.name])}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="controls">
          <button className="btn ghost sm" onClick={() => setFeats(candidates.map((c) => c.name))}>
            Select all
          </button>
          <button className="btn ghost sm" onClick={() => setFeats([])}>
            Clear
          </button>
        </div>

        {leak.length > 0 && (
          <div className="warn">
            ⚠️ {leak.join(", ")} is almost identical to the target (|r| &gt; 0.97). That's likely leakage: the model will
            look unrealistically good. Consider unselecting it.
          </div>
        )}

        <button className="btn big" disabled={running || !feats.length} onClick={run}>
          {running ? `Training: ${progress}…` : "▶ Train & compare 5 models"}
        </button>
      </Card>

      {err && <div className="error">{err}</div>}
      {res && <Results res={res} target={target} />}
    </div>
  );
}

function Results({ res, target }) {
  const { data, results, best, importance } = res;
  const reg = data.task === "reg";
  const b = results[best];
  const base = results[0];
  const main = reg ? "r2" : "f1";

  const bars = results.map((r, i) => ({
    label: r.name,
    value: Math.max(0, r.m[main]),
    text: r.m[main].toFixed(3),
    color: i === best ? C[0] : C[1],
  }));

  const gain = b.m[main] - base.m[main];
  let verdict;
  if (best === 0 || gain < 0.02) {
    verdict = "No model beat the simple baseline by a meaningful margin, so these features carry little signal for this target.";
  } else if (reg) {
    verdict = `${b.name} explains about ${(100 * Math.max(0, b.m.r2)).toFixed(0)}% of the variation in ${target} on unseen data (R² = ${b.m.r2.toFixed(2)}).`;
  } else {
    verdict = `${b.name} reaches ${(100 * b.m.acc).toFixed(1)}% accuracy and ${b.m.f1.toFixed(2)} macro-F1 on unseen data, vs ${(100 * base.m.acc).toFixed(1)}% / ${base.m.f1.toFixed(2)} for the baseline.`;
  }

  const pts = [];
  if (reg) {
    const n = data.yte.length;
    const step = Math.max(1, Math.floor(n / 1200));
    for (let i = 0; i < n; i += step) pts.push([data.yte[i], b.pred[i]]);
  }

  function downloadCsv() {
    const head = reg ? "model,R2,RMSE,MAE,train_ms" : "model,accuracy,macro_F1,train_ms";
    const lines = results.map((r) =>
      (reg ? [r.name, r.m.r2, r.m.rmse, r.m.mae, Math.round(r.ms)] : [r.name, r.m.acc, r.m.f1, Math.round(r.ms)]).join(",")
    );
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "model_results.csv";
    a.click();
  }

  const note =
    `Trained on ${data.Xtr.length.toLocaleString()} rows, tested on ${data.Xte.length.toLocaleString()} unseen rows, ${data.names.length} encoded features.` +
    (data.logY ? " Target is on log scale (log1p)." : "") +
    (data.classes ? ` Classes: ${data.classes.slice(0, 8).join(", ")}${data.classes.length > 8 ? "…" : ""}.` : "");

  return (
    <div>
      <Card
        title="2 · Results"
        right={
          <button className="btn ghost sm" onClick={downloadCsv}>
            Download CSV
          </button>
        }
      >
        <div className="winner">
          <span>🏆 Best model</span>
          <b>{b.name}</b>
        </div>
        <p className="verdict">{verdict}</p>
        <div className="muted">{note}</div>
      </Card>

      <div className="grid2">
        <Card title={reg ? "Model comparison · R² (higher is better)" : "Model comparison · macro-F1 (higher is better)"}>
          <BarH data={bars} />
        </Card>
        <Card title="Scores">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Model</th>
                  {reg ? (
                    <>
                      <th>R²</th>
                      <th>RMSE</th>
                      <th>MAE</th>
                    </>
                  ) : (
                    <>
                      <th>Accuracy</th>
                      <th>Macro-F1</th>
                    </>
                  )}
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.name} className={i === best ? "best" : ""}>
                    <td>{r.name + (i === best ? " 🏆" : "")}</td>
                    {reg ? (
                      <>
                        <td>{r.m.r2.toFixed(3)}</td>
                        <td>{fmt(r.m.rmse)}</td>
                        <td>{fmt(r.m.mae)}</td>
                      </>
                    ) : (
                      <>
                        <td>{(100 * r.m.acc).toFixed(1) + "%"}</td>
                        <td>{r.m.f1.toFixed(3)}</td>
                      </>
                    )}
                    <td>{Math.round(r.ms) + " ms"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        {importance.length > 0 && (
          <Card title="What drives the prediction (Random Forest)">
            <BarH data={importance.map((x) => ({ label: x.label, value: x.value, text: (100 * x.value).toFixed(1) + "%" }))} />
          </Card>
        )}
        {reg ? (
          <Card title={`Predicted vs actual · ${b.name}`}>
            <Scatter pts={pts} xl="actual" yl="predicted" diag />
            <div className="muted">Points on the dashed line = perfect predictions.</div>
          </Card>
        ) : (
          <Card title={`Confusion matrix · ${b.name}`}>
            <Confusion cm={b.m.cm} classes={data.classes} />
          </Card>
        )}
      </div>
    </div>
  );
}
