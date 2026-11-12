import { useState } from "react";
import Papa from "papaparse";
import Lib from "../lib/analysis.js";
import { Sel, Check } from "../components/Ui.jsx";

export default function Upload({ onData }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [limit, setLimit] = useState("50000");
  const [dropLong, setDropLong] = useState(true);
  const [drag, setDrag] = useState(false);

  function finish(rows, name) {
    try {
      onData(Lib.buildDataset(rows, name, { dropLong }));
      setErr("");
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(false);
  }

  function handleFile(f) {
    if (!f) return;
    setBusy(true);
    setErr("");
    setTimeout(() => {
      if (/\.json$/i.test(f.name)) {
        f.text()
          .then((t) => {
            const arr = JSON.parse(t);
            const list = Array.isArray(arr) ? arr : Object.values(arr);
            const keys = [...new Set(list.slice(0, 200).flatMap((o) => Object.keys(o)))];
            finish([keys, ...list.map((o) => keys.map((k) => (o[k] == null ? "" : String(o[k]))))], f.name);
          })
          .catch((e) => {
            setErr("Invalid JSON: " + e.message);
            setBusy(false);
          });
        return;
      }
      Papa.parse(f, {
        preview: Number(limit) ? Number(limit) + 1 : 0,
        skipEmptyLines: true,
        complete: (r) => finish(r.data, f.name),
        error: (e) => {
          setErr(String(e));
          setBusy(false);
        },
      });
    }, 40);
  }

  return (
    <div className="upload">
      <div className="hero">
        <h1>Drop your dataset. Get answers.</h1>
        <p>
          Instant analysis, charts and machine-learning model comparison. Everything runs in your browser, the data
          never leaves your PC.
        </p>
      </div>

      <div
        className={"drop" + (drag ? " drag" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files[0]);
        }}
      >
        {busy ? (
          <div className="spin">Reading and analyzing your file…</div>
        ) : (
          <div>
            <div className="drop-i">❄️</div>
            <div className="drop-t">Drag & drop a CSV / TSV / JSON file here</div>
            <label className="btn">
              Choose file
              <input type="file" accept=".csv,.tsv,.txt,.json" hidden onChange={(e) => handleFile(e.target.files[0])} />
            </label>
            <span className="or">or</span>
            <button
              className="btn ghost"
              onClick={() => {
                setBusy(true);
                setTimeout(() => finish(Lib.demoRows(4000), "Demo sales data"), 30);
              }}
            >
              Try demo data
            </button>
          </div>
        )}
      </div>

      <div className="opts">
        <Sel
          label="Rows to load"
          value={limit}
          onChange={setLimit}
          options={[
            ["20000", "First 20,000"],
            ["50000", "First 50,000"],
            ["200000", "First 200,000"],
            ["0", "All rows (big files can be slow)"],
          ]}
        />
        <Check label="Skip long-text columns (descriptions, URLs)" checked={dropLong} onChange={setDropLong} />
      </div>

      {err && <div className="error">{err}</div>}
    </div>
  );
}
