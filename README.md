# Frost Analytics (React + Vite)

Upload a dataset → automatic analysis → compare machine-learning models.
Everything runs in the browser; data never leaves your PC.

## Run it
1. Install Node.js LTS (https://nodejs.org), version 18 or newer.
2. In a terminal inside this folder:

       npm install
       npm run dev

3. Open http://localhost:5173 (it usually opens by itself).

## Project layout
    src/
      main.jsx              entry point
      App.jsx               shell + step navigation (Upload / Analyze / Models)
      pages/Upload.jsx      file drop + parsing (PapaParse)
      pages/Explore.jsx     KPIs, insights, charts, correlations, data table
      pages/Models.jsx      target/feature picker, training, results
      components/Ui.jsx     Card, Tabs, Select, Checkbox...
      components/Charts.jsx SVG charts (bar, histogram, scatter, line, heatmap)
      lib/analysis.js       type detection, stats, and the ML models
                            (ridge, logistic, k-NN, decision tree, random forest)

## Build for production
    npm run build     # output in dist/
