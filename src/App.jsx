import { useState } from "react";
import Upload from "./pages/Upload.jsx";
import Explore from "./pages/Explore.jsx";
import Models from "./pages/Models.jsx";
import { trunc } from "./components/Ui.jsx";

const STEPS = [
  ["upload", "1  Upload"],
  ["explore", "2  Analyze"],
  ["models", "3  Models"],
];

export default function App() {
  const [ds, setDs] = useState(null);
  const [step, setStep] = useState("upload");

  return (
    <div className="app">
      <header>
        <div className="logo">❄️ Frost Analytics</div>
        <nav>
          {STEPS.map(([k, label]) => (
            <button
              key={k}
              className={"nav" + (step === k ? " on" : "")}
              disabled={k !== "upload" && !ds}
              onClick={() => setStep(k)}
            >
              {label}
            </button>
          ))}
        </nav>
        {ds && (
          <div className="file">
            <span>{trunc(ds.name, 28)}</span>
            <button
              className="x"
              title="Remove dataset"
              onClick={() => {
                setDs(null);
                setStep("upload");
              }}
            >
              ✕
            </button>
          </div>
        )}
      </header>

      <main>
        {step === "upload" && (
          <Upload
            onData={(d) => {
              setDs(d);
              setStep("explore");
            }}
          />
        )}
        {step === "explore" && ds && <Explore ds={ds} />}
        {step === "models" && ds && <Models ds={ds} />}
      </main>

      <footer>Frost Analytics · runs 100% in your browser</footer>
    </div>
  );
}
