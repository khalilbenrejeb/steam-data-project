const Lib = (function () {
  "use strict";

  // ------------------------------------------------------------------ utils
  const MISSING = new Set(["", "nan", "null", "none", "n/a", "na"]);
  const isMissing = (s) => s == null || MISSING.has(String(s).trim().toLowerCase());

  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
  }
  const tokens = (s) =>
    String(s).replace(/[\[\]'"]/g, "").split(",").map((x) => x.trim()).filter(Boolean);

  // ------------------------------------------------------------------ parsing / types
  const DATE_RES = [
    /^\d{4}-\d{1,2}-\d{1,2}/, /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/,
    /^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}/, /^[A-Za-z]{3,9} \d{4}$/, /^\d{4}\/\d{1,2}\/\d{1,2}/,
  ];
  const looksDate = (s) => DATE_RES.some((r) => r.test(s));

  function inferColumn(name, raw, dropLong) {
    const n = raw.length;
    const sample = [];
    for (let i = 0; i < n && sample.length < 500; i++)
      if (!isMissing(raw[i])) sample.push(String(raw[i]).trim());
    const col = { name, type: "category", n };
    if (!sample.length) { col.type = "empty"; col.vals = null; return col; }

    const numRate = sample.filter((s) => Number.isFinite(Number(s))).length / sample.length;
    if (numRate >= 0.95) {
      const vals = new Float64Array(n);
      let allInt = true;
      const uniq = new Set();
      for (let i = 0; i < n; i++) {
        const s = raw[i];
        if (isMissing(s)) { vals[i] = NaN; continue; }
        const x = Number(String(s).trim());
        if (!Number.isFinite(x)) { vals[i] = NaN; continue; }
        vals[i] = x;
        if (allInt && !Number.isInteger(x)) allInt = false;
        uniq.add(x);
      }
      col.vals = vals;
      col.type = allInt && n > 50 && uniq.size >= 0.98 * n ? "id" : "numeric";
      return col;
    }
    const dateRate = sample.filter((s) => looksDate(s) && Number.isFinite(Date.parse(s))).length / sample.length;
    if (dateRate >= 0.9) {
      const vals = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const t = isMissing(raw[i]) ? NaN : Date.parse(String(raw[i]).trim());
        vals[i] = Number.isFinite(t) ? t : NaN;
      }
      col.vals = vals; col.type = "date";
      return col;
    }
    const avgLen = sample.reduce((a, s) => a + s.length, 0) / sample.length;
    if (avgLen > 120 && dropLong) { col.type = "text"; col.vals = null; return col; }

    const vals = new Array(n);
    const uniq = new Set();
    for (let i = 0; i < n; i++) {
      const s = raw[i];
      vals[i] = isMissing(s) ? "" : String(s).trim();
      if (vals[i] !== "") uniq.add(vals[i]);
    }
    col.vals = vals;
    col.multi = sample.filter((s) => s.includes(",")).length / sample.length > 0.3;
    if (!col.multi && n > 50 && uniq.size > 0.9 * n) col.type = "id";
    return col;
  }

  function buildDataset(rows, name, opts = {}) {
    if (!rows || rows.length < 2) throw new Error("The file is empty or has no data rows.");
    const dropLong = opts.dropLong !== false;
    const header = rows[0].map((s) => String(s).trim());
    const body = rows.slice(1);
    const notes = [];
    let width = header.length;
    for (let i = 0; i < Math.min(body.length, 300); i++) width = Math.max(width, body[i].length);
    if (width > header.length) {
      const k = header.indexOf("DiscountDLC count");
      if (k >= 0 && width - header.length === 1) {
        header.splice(k, 1, "Discount", "DLC count");
        notes.push("Steam header bug detected (one column name was missing) and repaired automatically.");
      } else {
        const orig = header.length;
        for (let j = orig; j < width; j++) header.push("column_" + (j + 1));
        notes.push(`Rows had ${width - orig} more fields than the header; extra columns were named column_N.`);
      }
    }
    const cols = header.map((h, j) => inferColumn(h || "column_" + (j + 1), body.map((r) => r[j] ?? ""), dropLong));
    const dropped = cols.filter((c) => c.type === "text").map((c) => c.name);
    if (dropped.length) notes.push(`Skipped ${dropped.length} long-text column(s): ${dropped.slice(0, 4).join(", ")}${dropped.length > 4 ? "…" : ""}`);
    return {
      name, n: body.length, cols, header, notes,
      preview: body.slice(0, 100).map((r) => header.map((_, j) => r[j] ?? "")),
    };
  }

  // ------------------------------------------------------------------ stats
  function numStats(c) {
    if (c._st) return c._st;
    const v = [];
    for (let i = 0; i < c.vals.length; i++) { const x = c.vals[i]; if (x === x) v.push(x); }
    const n = v.length;
    const sorted = Float64Array.from(v).sort();
    let sum = 0; for (const x of v) sum += x;
    const mean = n ? sum / n : NaN;
    let m2 = 0, m3 = 0, zeros = 0;
    for (const x of v) { const d = x - mean; m2 += d * d; m3 += d * d * d; if (x === 0) zeros++; }
    const sd0 = n ? Math.sqrt(m2 / n) : 0;
    return (c._st = {
      n, missing: c.vals.length - n, mean, std: n > 1 ? Math.sqrt(m2 / (n - 1)) : 0,
      min: sorted[0], q1: quantile(sorted, 0.25), median: quantile(sorted, 0.5), q3: quantile(sorted, 0.75),
      max: sorted[n - 1], skew: sd0 > 0 ? m3 / n / sd0 ** 3 : 0, zeros, sorted,
    });
  }
  function catInfo(c) {
    if (c._ci) return c._ci;
    const m = new Map(); let missing = 0;
    for (const v of c.vals) { if (v === "") { missing++; continue; } m.set(v, (m.get(v) || 0) + 1); }
    const entries = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return (c._ci = { entries, nunique: m.size, missing });
  }
  function tokenCounts(c) {
    if (c._tc) return c._tc;
    const m = new Map();
    for (const v of c.vals) if (v !== "") for (const t of tokens(v)) m.set(t, (m.get(t) || 0) + 1);
    return (c._tc = [...m.entries()].sort((a, b) => b[1] - a[1]));
  }
  function missingCount(c) {
    if (!c.vals) return c.n;
    if (c.type === "numeric" || c.type === "date" || (c.type === "id" && c.vals instanceof Float64Array))
      { let m = 0; for (let i = 0; i < c.vals.length; i++) if (c.vals[i] !== c.vals[i]) m++; return m; }
    let m = 0; for (const v of c.vals) if (v === "") m++; return m;
  }
  function uniqueCount(c) {
    if (c._nu != null) return c._nu;
    if (c.vals instanceof Float64Array) { const s = new Set(); for (const x of c.vals) if (x === x) s.add(x); return (c._nu = s.size); }
    return (c._nu = catInfo(c).nunique);
  }

  function pearson(a, b) {
    let n = 0, sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x !== x || y !== y) continue; n++; sa += x; sb += y; }
    if (n < 3) return NaN;
    const ma = sa / n, mb = sb / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i]; if (x !== x || y !== y) continue;
      sxx += (x - ma) ** 2; syy += (y - mb) ** 2; sxy += (x - ma) * (y - mb);
    }
    const d = Math.sqrt(sxx * syy);
    return d ? sxy / d : NaN;
  }
  function corrMatrix(cols) {
    const n = cols.length;
    const M = Array.from({ length: n }, () => new Array(n).fill(NaN));
    for (let i = 0; i < n; i++) {
      M[i][i] = 1;
      for (let j = i + 1; j < n; j++) M[i][j] = M[j][i] = pearson(cols[i].vals, cols[j].vals);
    }
    return M;
  }

  function insights(ds) {
    const out = [];
    const cols = ds.cols.filter((c) => c.vals);
    let miss = 0, worst = null, worstPct = 0;
    for (const c of cols) {
      const m = missingCount(c); miss += m;
      if (m / ds.n > worstPct) { worstPct = m / ds.n; worst = c.name; }
    }
    const comp = 100 * (1 - miss / (ds.n * Math.max(cols.length, 1)));
    out.push(`<b>${ds.n.toLocaleString()}</b> rows × <b>${ds.cols.length}</b> columns, <b>${comp.toFixed(1)}%</b> complete.` +
      (worst && worstPct > 0 ? ` Most gaps in <b>${esc(worst)}</b> (${(worstPct * 100).toFixed(0)}% missing).` : ""));

    const nums = ds.cols.filter((c) => c.type === "numeric").slice(0, 25);
    if (nums.length >= 2) {
      const M = corrMatrix(nums);
      let best = 0, bi = -1, bj = -1;
      for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++)
        if (Math.abs(M[i][j]) > Math.abs(best)) { best = M[i][j]; bi = i; bj = j; }
      if (bi >= 0 && Math.abs(best) >= 0.3)
        out.push(`Strongest relationship: <b>${esc(nums[bi].name)}</b> and <b>${esc(nums[bj].name)}</b> (r = ${best.toFixed(2)}, ${best > 0 ? "move together" : "move in opposite directions"}).`);
    }
    let sk = null;
    for (const c of nums) { const s = numStats(c); if (s.n > 20 && Math.abs(s.skew) > 2 && (!sk || Math.abs(s.skew) > Math.abs(sk.s.skew))) sk = { c, s }; }
    if (sk) out.push(`<b>${esc(sk.c.name)}</b> is heavily skewed (median ${fmt(sk.s.median)} vs mean ${fmt(sk.s.mean)}): a few extreme values pull the average up.`);
    for (const c of nums) {
      const s = numStats(c);
      if (s.n && s.zeros / s.n > 0.5) { out.push(`<b>${esc(c.name)}</b> is zero in ${(100 * s.zeros / s.n).toFixed(0)}% of rows, so most records have no value there.`); break; }
    }
    for (const c of ds.cols.filter((c) => c.type === "category" && !c.multi)) {
      const ci = catInfo(c);
      if (ci.nunique > 1 && ci.nunique <= 100 && ci.entries[0][1] / (ds.n - ci.missing) > 0.5) {
        out.push(`<b>${esc(ci.entries[0][0])}</b> makes up ${(100 * ci.entries[0][1] / (ds.n - ci.missing)).toFixed(0)}% of <b>${esc(c.name)}</b>.`);
        break;
      }
    }
    const d = ds.cols.find((c) => c.type === "date");
    if (d) { const s = numStats(d); if (s.n) out.push(`<b>${esc(d.name)}</b> spans ${iso(s.min)} to ${iso(s.max)}.`); }
    return out.slice(0, 6);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  function fmt(x, d = 2) {
    if (x == null || Number.isNaN(x)) return "–";
    const a = Math.abs(x);
    if (a >= 1e9) return (x / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return (x / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return (x / 1e3).toFixed(1) + "k";
    if (Number.isInteger(x)) return String(x);
    return x.toFixed(d);
  }

  function hist(c, { bins = 30, log = false, trim = false } = {}) {
    const s = numStats(c);
    let lo = s.min, hi = s.max;
    if (trim && s.n > 50) { lo = quantile(s.sorted, 0.01); hi = quantile(s.sorted, 0.99); }
    const f = log && lo >= 0 ? (x) => Math.log1p(x) : (x) => x;
    const flo = f(lo), fhi = f(hi);
    if (!(fhi > flo)) return { counts: [s.n], edges: [lo, hi], log: f !== undefined && log && lo >= 0 };
    const counts = new Array(bins).fill(0);
    for (let i = 0; i < c.vals.length; i++) {
      const x = c.vals[i]; if (x !== x || x < lo || x > hi) continue;
      let b = Math.floor(((f(x) - flo) / (fhi - flo)) * bins); if (b >= bins) b = bins - 1;
      counts[b]++;
    }
    const edges = Array.from({ length: bins + 1 }, (_, i) => {
      const v = flo + ((fhi - flo) * i) / bins;
      return log && lo >= 0 ? Math.expm1(v) : v;
    });
    return { counts, edges };
  }

  function trend(ds, dc, mc, unit, agg) {
    const m = new Map();
    for (let i = 0; i < ds.n; i++) {
      const t = dc.vals[i]; if (t !== t) continue;
      const d = new Date(t);
      const key = unit === "Year" ? `${d.getUTCFullYear()}`
        : unit === "Month" ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
        : d.toISOString().slice(0, 10);
      let e = m.get(key); if (!e) m.set(key, (e = { sum: 0, n: 0 }));
      if (!mc) { e.n++; continue; }
      const v = mc.vals[i]; if (v !== v) continue;
      e.sum += v; e.n++;
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, e]) => ({
      x: k, y: !mc ? e.n : agg === "sum" ? e.sum : e.n ? e.sum / e.n : 0,
    }));
  }

  // ------------------------------------------------------------------ demo data
  function demoRows(n = 4000) {
    const r = mulberry(42);
    const header = ["order_date", "region", "category", "price", "quantity", "discount_pct", "customer_age", "rating", "revenue", "returned"];
    const regions = ["North", "South", "East", "West"], cats = ["Laptops", "Phones", "Audio", "Gaming", "Home"];
    const base = { Laptops: 900, Phones: 600, Audio: 120, Gaming: 300, Home: 80 };
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const rows = [header], start = Date.UTC(2023, 0, 1);
    for (let i = 0; i < n; i++) {
      const cat = cats[Math.floor(r() * 5)], region = regions[Math.floor(r() * 4)];
      const price = Math.round(base[cat] * (0.6 + r() * 0.9) * 100) / 100;
      const qty = 1 + Math.floor(r() * 5), disc = [0, 0, 0, 5, 10, 20][Math.floor(r() * 6)];
      const age = 18 + Math.floor(r() * 55);
      const rating = clamp(Math.round((4.2 + (r() + r() + r() - 1.5) * 0.9 - disc * 0.015 + (cat === "Audio" ? 0.2 : 0)) * 10) / 10, 1, 5);
      const revenue = Math.round(price * qty * (1 - disc / 100) * 100) / 100;
      const ret = r() < clamp(0.35 - (rating - 3) * 0.12 + (price > 700 ? 0.05 : 0), 0.02, 0.8) ? "Yes" : "No";
      rows.push([iso(start + i * ((86400000 * 900) / n)), region, cat, price, qty, disc, age, r() < 0.04 ? "" : rating, revenue, ret].map(String));
    }
    return rows;
  }

  // ------------------------------------------------------------------ ML: data prep
  function prepareModelData(ds, { target, features, forceClf, logY, maxRows = 6000, seed = 11 }) {
    const tc = ds.cols.find((c) => c.name === target);
    if (!tc) throw new Error("Pick a target column.");
    const task = tc.type === "category" || forceClf ? "clf" : "reg";
    const rand = mulberry(seed);

    let rowsIdx = [];
    for (let i = 0; i < ds.n; i++) {
      const v = tc.vals[i];
      if (tc.vals instanceof Float64Array ? v === v : v !== "") rowsIdx.push(i);
    }
    if (rowsIdx.length < 100) throw new Error("Fewer than 100 rows have a value for the target.");
    shuffle(rowsIdx, rand);
    rowsIdx = rowsIdx.slice(0, maxRows);

    // target
    let classes = null, y;
    let useLog = false;
    if (task === "clf") {
      const label = (i) => String(tc.vals[i]);
      const cnt = new Map();
      for (const i of rowsIdx) cnt.set(label(i), (cnt.get(label(i)) || 0) + 1);
      classes = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map((e) => e[0]);
      if (classes.length < 2) throw new Error("The target needs at least 2 different classes.");
      const ci = new Map(classes.map((c, i) => [c, i]));
      rowsIdx = rowsIdx.filter((i) => ci.has(label(i)));
      y = Int32Array.from(rowsIdx, (i) => ci.get(label(i)));
    } else {
      y = Float64Array.from(rowsIdx, (i) => tc.vals[i]);
      if (logY) {
        let ok = true; for (const v of y) if (v < 0) { ok = false; break; }
        if (ok) { y = y.map((v) => Math.log1p(v)); useLog = true; }
      }
    }

    // features
    const specs = []; const names = [];
    const feats = features.filter((f) => f !== target).slice(0, 40);
    for (const fname of feats) {
      const c = ds.cols.find((x) => x.name === fname);
      if (!c || !c.vals) continue;
      if (c.type === "numeric" || c.type === "date") {
        const s = numStats(c);
        if (!s.n || !(s.std > 0)) continue;
        specs.push({ kind: "num", c, med: s.median, mean: s.mean, sd: s.std, at: names.length });
        names.push(c.name);
      } else if (c.type === "category") {
        const top = (c.multi ? tokenCounts(c) : catInfo(c).entries).slice(0, 8).map((e) => e[0]);
        if (top.length < 1) continue;
        const map = new Map(top.map((v, k) => [v, names.length + k]));
        specs.push({ kind: c.multi ? "multi" : "cat", c, map });
        top.forEach((v) => names.push(`${c.name}=${v}`));
      }
    }
    if (!specs.length) throw new Error("Pick at least one usable feature column.");
    const D = names.length;
    const X = rowsIdx.map((i) => {
      const row = new Float64Array(D);
      for (const sp of specs) {
        if (sp.kind === "num") { let x = sp.c.vals[i]; if (x !== x) x = sp.med; row[sp.at] = (x - sp.mean) / sp.sd; }
        else if (sp.kind === "cat") { const k = sp.map.get(sp.c.vals[i]); if (k !== undefined) row[k] = 1; }
        else { const v = sp.c.vals[i]; if (v !== "") for (const t of tokens(v)) { const k = sp.map.get(t); if (k !== undefined) row[k] = 1; } }
      }
      return row;
    });

    const order = shuffle(Array.from({ length: X.length }, (_, i) => i), rand);
    const cut = Math.floor(order.length * 0.8);
    const pick = (ids) => ({ X: ids.map((i) => X[i]), y: y.constructor.from(ids.map((i) => y[i])) });
    const tr = pick(order.slice(0, cut)), te = pick(order.slice(cut));
    if (te.X.length < 20) throw new Error("Not enough rows for a test set.");
    return { Xtr: tr.X, ytr: tr.y, Xte: te.X, yte: te.y, names, task, classes, K: classes ? classes.length : 0, logY: useLog, rows: X.length };
  }

  // ------------------------------------------------------------------ ML: models
  function solve(A, b) {
    const n = b.length;
    const M = A.map((r, i) => { const a = Array.from(r); a.push(b[i]); return a; });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      const t = M[c]; M[c] = M[p]; M[p] = t;
      const piv = M[c][c] || 1e-12;
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / piv; if (f === 0) continue;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
      x[i] = s / (M[i][i] || 1e-12);
    }
    return x;
  }

  function trainRidge(X, y, lambda = 1) {
    const n = X.length, d = X[0].length + 1;
    const A = Array.from({ length: d }, () => new Float64Array(d)), b = new Float64Array(d);
    for (let i = 0; i < n; i++) {
      const r = X[i];
      for (let j = 0; j < d; j++) {
        const xj = j < d - 1 ? r[j] : 1; b[j] += xj * y[i];
        for (let k = j; k < d; k++) A[j][k] += xj * (k < d - 1 ? r[k] : 1);
      }
    }
    for (let j = 0; j < d; j++) { for (let k = 0; k < j; k++) A[j][k] = A[k][j]; if (j < d - 1) A[j][j] += lambda; }
    const w = solve(A, b);
    return { predict: (Q) => Float64Array.from(Q, (r) => { let s = w[d - 1]; for (let j = 0; j < d - 1; j++) s += w[j] * r[j]; return s; }) };
  }

  function trainSoftmax(X, y, K, epochs = 80, lr = 0.3, l2 = 1e-3) {
    const n = X.length, d = X[0].length;
    const W = Array.from({ length: K }, () => new Float64Array(d + 1));
    const z = new Float64Array(K);
    for (let ep = 0; ep < epochs; ep++) {
      const G = Array.from({ length: K }, () => new Float64Array(d + 1));
      for (let i = 0; i < n; i++) {
        const r = X[i]; let mx = -Infinity;
        for (let k = 0; k < K; k++) { let s = W[k][d]; for (let j = 0; j < d; j++) s += W[k][j] * r[j]; z[k] = s; if (s > mx) mx = s; }
        let sum = 0; for (let k = 0; k < K; k++) { z[k] = Math.exp(z[k] - mx); sum += z[k]; }
        for (let k = 0; k < K; k++) {
          const e = z[k] / sum - (y[i] === k ? 1 : 0);
          const g = G[k]; for (let j = 0; j < d; j++) g[j] += e * r[j]; g[d] += e;
        }
      }
      for (let k = 0; k < K; k++) for (let j = 0; j <= d; j++) W[k][j] -= lr * (G[k][j] / n + (j < d ? l2 * W[k][j] : 0));
    }
    return {
      predict: (Q) => Int32Array.from(Q, (r) => {
        let best = 0, bs = -Infinity;
        for (let k = 0; k < K; k++) { let s = W[k][d]; for (let j = 0; j < d; j++) s += W[k][j] * r[j]; if (s > bs) { bs = s; best = k; } }
        return best;
      }),
    };
  }

  function trainKNN(X, y, task, K, k = 7) {
    const n = Math.min(X.length, 3000), d = X[0].length;
    return {
      predict: (Q) => {
        const out = task === "reg" ? new Float64Array(Q.length) : new Int32Array(Q.length);
        const bd = new Float64Array(k), bi = new Int32Array(k);
        for (let q = 0; q < Q.length; q++) {
          bd.fill(Infinity);
          const r = Q[q];
          for (let i = 0; i < n; i++) {
            const t = X[i]; let s = 0;
            for (let j = 0; j < d; j++) { const e = r[j] - t[j]; s += e * e; }
            if (s < bd[k - 1]) {
              let p = k - 1;
              while (p > 0 && bd[p - 1] > s) { bd[p] = bd[p - 1]; bi[p] = bi[p - 1]; p--; }
              bd[p] = s; bi[p] = i;
            }
          }
          if (task === "reg") { let s = 0; for (let m = 0; m < k; m++) s += y[bi[m]]; out[q] = s / k; }
          else { const c = new Int32Array(K); for (let m = 0; m < k; m++) c[y[bi[m]]]++; let b = 0; for (let m = 1; m < K; m++) if (c[m] > c[b]) b = m; out[q] = b; }
        }
        return out;
      },
    };
  }

  function makeBins(X, nb = 32) {
    const n = X.length, d = X[0].length, cuts = [];
    const B = Array.from({ length: n }, () => new Uint8Array(d));
    for (let f = 0; f < d; f++) {
      const col = new Float64Array(n); for (let i = 0; i < n; i++) col[i] = X[i][f];
      const s = Float64Array.from(col).sort(); const cs = [];
      for (let q = 1; q < nb; q++) {
        const v = s[Math.floor((q * (n - 1)) / nb)];
        if (v < s[n - 1] && (cs.length === 0 || v > cs[cs.length - 1])) cs.push(v);
      }
      cuts.push(cs);
      for (let i = 0; i < n; i++) {
        const x = col[i]; let lo = 0, hi = cs.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (x > cs[m]) lo = m + 1; else hi = m; }
        B[i][f] = lo;
      }
    }
    return { B, cuts };
  }

  function trainTree(bins, y, rows, o) {
    const { B, cuts } = bins, d = cuts.length;
    const { task, K, maxDepth = 8, minLeaf = 5, mtry = d, rand, imp } = o;
    function leafVal(idx) {
      if (task === "reg") { let s = 0; for (const i of idx) s += y[i]; return s / idx.length; }
      const c = new Float64Array(K); for (const i of idx) c[y[i]]++;
      for (let k = 0; k < K; k++) c[k] /= idx.length; return c;
    }
    function feats() {
      if (mtry >= d) return Array.from({ length: d }, (_, i) => i);
      const a = Array.from({ length: d }, (_, i) => i);
      for (let i = 0; i < mtry; i++) { const j = i + Math.floor(rand() * (d - i)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      return a.slice(0, mtry);
    }
    function grow(idx, depth) {
      const n = idx.length;
      if (depth >= maxDepth || n < 2 * minLeaf) return { leaf: true, val: leafVal(idx) };
      let bestGain = 1e-9, bf = -1, bb = -1, parent, tc;
      if (task === "reg") { let S = 0; for (const i of idx) S += y[i]; parent = (S * S) / n; tc = S; }
      else { tc = new Float64Array(K); for (const i of idx) tc[y[i]]++; parent = 0; for (let k = 0; k < K; k++) parent += tc[k] * tc[k]; parent /= n; }
      for (const f of feats()) {
        const nb = cuts[f].length + 1; if (nb < 2) continue;
        if (task === "reg") {
          const sum = new Float64Array(nb), cnt = new Float64Array(nb);
          for (const i of idx) { const b = B[i][f]; sum[b] += y[i]; cnt[b]++; }
          let sl = 0, cl = 0;
          for (let b = 0; b < nb - 1; b++) {
            sl += sum[b]; cl += cnt[b]; const cr = n - cl;
            if (cl < minLeaf || cr < minLeaf) continue;
            const sr = tc - sl, gain = (sl * sl) / cl + (sr * sr) / cr - parent;
            if (gain > bestGain) { bestGain = gain; bf = f; bb = b; }
          }
        } else {
          const hs = new Float64Array(nb * K);
          for (const i of idx) hs[B[i][f] * K + y[i]]++;
          const lc = new Float64Array(K); let cl = 0;
          for (let b = 0; b < nb - 1; b++) {
            for (let k = 0; k < K; k++) { lc[k] += hs[b * K + k]; cl += hs[b * K + k]; }
            const cr = n - cl; if (cl < minLeaf || cr < minLeaf) continue;
            let sl = 0, sr = 0; for (let k = 0; k < K; k++) { sl += lc[k] * lc[k]; const q = tc[k] - lc[k]; sr += q * q; }
            const gain = sl / cl + sr / cr - parent;
            if (gain > bestGain) { bestGain = gain; bf = f; bb = b; }
          }
        }
      }
      if (bf < 0) return { leaf: true, val: leafVal(idx) };
      const L = [], R = [];
      for (const i of idx) (B[i][bf] <= bb ? L : R).push(i);
      if (imp) imp[bf] += bestGain;
      return { f: bf, thr: cuts[bf][bb], l: grow(L, depth + 1), r: grow(R, depth + 1) };
    }
    const root = grow(rows, 0);
    return (row) => { let nd = root; while (!nd.leaf) nd = row[nd.f] <= nd.thr ? nd.l : nd.r; return nd.val; };
  }

  function trainTreeModel(bins, y, task, K, n) {
    const rows = Array.from({ length: n }, (_, i) => i);
    const f = trainTree(bins, y, rows, { task, K, maxDepth: 7, minLeaf: 8 });
    return { predict: (Q) => (task === "reg" ? Float64Array.from(Q, f) : Int32Array.from(Q, (r) => argmax(f(r)))) };
  }
  const argmax = (a) => { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b; };

  function trainForest(bins, y, task, K, n, nTrees, rand) {
    const d = bins.cuts.length, imp = new Float64Array(d), trees = [];
    const mtry = Math.max(1, task === "reg" ? Math.floor(d / 3) : Math.floor(Math.sqrt(d)));
    for (let t = 0; t < nTrees; t++) {
      const rows = Array.from({ length: n }, () => Math.floor(rand() * n));
      trees.push(trainTree(bins, y, rows, { task, K, maxDepth: 9, minLeaf: 5, mtry, rand, imp }));
    }
    return {
      imp,
      predict: (Q) => {
        if (task === "reg") return Float64Array.from(Q, (r) => { let s = 0; for (const f of trees) s += f(r); return s / trees.length; });
        return Int32Array.from(Q, (r) => { const p = new Float64Array(K); for (const f of trees) { const v = f(r); for (let k = 0; k < K; k++) p[k] += v[k]; } return argmax(p); });
      },
    };
  }

  function regMetrics(yt, yp) {
    const n = yt.length; let m = 0; for (const v of yt) m += v; m /= n;
    let ssr = 0, sst = 0, sa = 0;
    for (let i = 0; i < n; i++) { const e = yt[i] - yp[i]; ssr += e * e; sst += (yt[i] - m) ** 2; sa += Math.abs(e); }
    return { r2: sst ? 1 - ssr / sst : 0, rmse: Math.sqrt(ssr / n), mae: sa / n };
  }
  function clfMetrics(yt, yp, K) {
    const cm = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let i = 0; i < yt.length; i++) cm[yt[i]][yp[i]]++;
    let ok = 0, f1s = 0, used = 0;
    for (let k = 0; k < K; k++) {
      const tp = cm[k][k]; let fp = 0, fn = 0;
      for (let i = 0; i < K; i++) { if (i !== k) { fp += cm[i][k]; fn += cm[k][i]; } }
      ok += tp; if (tp + fn === 0) continue;
      const p = tp + fp ? tp / (tp + fp) : 0, r = tp / (tp + fn);
      f1s += p + r ? (2 * p * r) / (p + r) : 0; used++;
    }
    return { acc: ok / yt.length, f1: used ? f1s / used : 0, cm };
  }

  async function runModels(d, onStep) {
    const rand = mulberry(7), tick = () => new Promise((r) => setTimeout(r, 15));
    const { task, K, Xtr, ytr, Xte, yte } = d;
    const bins = makeBins(Xtr), n = Xtr.length;
    const specs = task === "reg"
      ? [
        ["Baseline (mean)", () => { let s = 0; for (const v of ytr) s += v; const m = s / n; return { predict: (Q) => new Float64Array(Q.length).fill(m) }; }],
        ["Linear (Ridge)", () => trainRidge(Xtr, ytr, 1)],
        ["k-Nearest Neighbors", () => trainKNN(Xtr, ytr, "reg", 0)],
        ["Decision Tree", () => trainTreeModel(bins, ytr, "reg", 0, n)],
        ["Random Forest", () => trainForest(bins, ytr, "reg", 0, n, 25, rand)],
      ]
      : [
        ["Baseline (majority)", () => { const c = new Int32Array(K); for (const v of ytr) c[v]++; const m = argmax(c); return { predict: (Q) => new Int32Array(Q.length).fill(m) }; }],
        ["Logistic Regression", () => trainSoftmax(Xtr, ytr, K)],
        ["k-Nearest Neighbors", () => trainKNN(Xtr, ytr, "clf", K)],
        ["Decision Tree", () => trainTreeModel(bins, ytr, "clf", K, n)],
        ["Random Forest", () => trainForest(bins, ytr, "clf", K, n, 25, rand)],
      ];
    const results = []; let forest = null;
    for (const [name, make] of specs) {
      onStep && onStep(name); await tick();
      const t0 = performance.now();
      const model = make(); const pred = model.predict(Xte);
      const ms = performance.now() - t0;
      if (name === "Random Forest") forest = model;
      const m = task === "reg" ? regMetrics(yte, pred) : clfMetrics(yte, pred, K);
      results.push({ name, ms, m, pred });
    }
    const score = (r) => (task === "reg" ? r.m.r2 : r.m.f1);
    let best = 0; results.forEach((r, i) => { if (score(r) > score(results[best])) best = i; });
    let importance = [];
    if (forest) {
      const tot = forest.imp.reduce((a, b) => a + b, 0) || 1;
      importance = Array.from(forest.imp, (v, i) => ({ label: d.names[i], value: v / tot })).sort((a, b) => b.value - a.value).slice(0, 12).filter((x) => x.value > 0);
    }
    return { results, best, importance, score: score(results[best]) };
  }

  return { buildDataset, numStats, catInfo, tokenCounts, tokens, missingCount, uniqueCount, insights, pearson, corrMatrix, hist, trend, demoRows, prepareModelData, runModels, fmt, iso };
})();
export default Lib;
