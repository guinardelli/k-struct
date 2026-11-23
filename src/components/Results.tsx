import { useState } from "react";
import { CheckCircle2, FileDown, History, Terminal } from "lucide-react";
import type { AnalysisCase, Project, ResultCombination } from "../domain/model";
import type {
  AnalysisResult,
  Displacement,
  Reaction,
  Station,
  StructuralResult,
} from "../solver/oofem";
import { exportFile } from "../solver/desktop";

type ResultView =
  | { kind: "case"; definition: AnalysisCase; result: AnalysisResult | null }
  | {
      kind: "combination";
      definition: ResultCombination;
      result: StructuralResult | null;
      problem: string;
    };

export default function Results({
  project,
  view,
  message,
  running,
  cancelling,
  openRunHistory,
}: {
  project: Project;
  view: ResultView;
  message: string;
  running: boolean;
  cancelling: boolean;
  openRunHistory?: () => void;
}) {
  const [tab, setTab] = useState("log");
  const [exportError, setExportError] = useState("");
  const { definition, result } = view;
  const caseOutput = view.kind === "case" ? view.result : null;
  const combination = view.kind === "combination" ? view.definition : null;
  const caseNames = new Map(
    project.analysisCases.map(({ id, name }) => [id, name]),
  );
  const formula = combination?.factors
    .map(({ caseId, factor }, i) => {
      const sign = factor < 0 ? "− " : i ? "+ " : "";
      return `${sign}${String(Math.abs(factor)).replace(".", ",")} × ${caseNames.get(caseId) ?? caseId}`;
    })
    .join(" ");
  const logMessage =
    view.kind === "combination"
      ? `${definition.name}\n${formula}\n${view.problem || "Combinação disponível para consulta."}`
      : message;
  const download = (name: string, content: string, type = "text/plain") => {
    setExportError("");
    void exportFile(name, content, type).catch((e) =>
      setExportError(String(e)),
    );
  };
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { maximumFractionDigits: 5 });
  const spatial = project.mode === "spatial";
  const nodeNames = new Map(project.nodes.map((n) => [n.id, n.name]));
  const memberNames = new Map(project.members.map((m) => [m.id, m.name]));
  let rows: (string | number)[][] = [],
    headers: string[] = [];
  if (tab === "reactions") {
    const values = (r: Reaction) =>
      spatial ? [r.fx, r.fy, r.fz, r.mx, r.my, r.mz] : [r.fx, r.fz, r.my];
    headers = spatial
      ? [
          "Nó",
          "RX (kN)",
          "RY (kN)",
          "RZ (kN)",
          "MX (kN·m)",
          "MY (kN·m)",
          "MZ (kN·m)",
        ]
      : ["Nó", "RX (kN)", "RZ (kN)", "MY (kN·m)"];
    rows = (result?.reactions ?? []).map((r) => [
      nodeNames.get(r.nodeId) ?? r.nodeId,
      ...values(r).map((v) => v / 1000),
    ]);
  } else if (tab === "displacements") {
    const values = (d: Displacement) =>
      (spatial ? [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] : [d.ux, d.uz, d.ry]).map(
        (v) => v * 1000,
      );
    headers = spatial
      ? [
          "Nó / estação",
          "UX (mm)",
          "UY (mm)",
          "UZ (mm)",
          "RX (mrad)",
          "RY (mrad)",
          "RZ (mrad)",
        ]
      : ["Nó / estação", "UX (mm)", "UZ (mm)", "RY (mrad)"];
    rows = [
      ...Object.entries(result?.displacements ?? {}).map(([id, d]) => [
        nodeNames.get(id) ?? id,
        ...values(d),
      ]),
      ...Object.entries(result?.members ?? {}).flatMap(([id, stations]) =>
        stations
          .slice(1, -1)
          .map((s) => [
            `${memberNames.get(id) ?? id} · x/L ${s.t}`,
            ...values(s),
          ]),
      ),
    ];
  } else if (tab === "forces") {
    const values = (s: Station) =>
      spatial ? [s.n, s.vy, s.vz, s.mx, s.my, s.mz] : [s.n, s.v, s.m];
    headers = spatial
      ? [
          "Barra",
          "x/L",
          "N (kN)",
          "Vy (kN)",
          "Vz (kN)",
          "Mx (kN·m)",
          "My (kN·m)",
          "Mz (kN·m)",
        ]
      : ["Barra", "x/L", "N (kN)", "V (kN)", "M (kN·m)"];
    rows = Object.entries(result?.members ?? {}).flatMap(([id, stations]) =>
      stations.map((s) => [
        memberNames.get(id) ?? id,
        s.t,
        ...values(s).map((v) => v / 1000),
      ]),
    );
  }
  return (
    <section className="results">
      <div className="results-heading">
        <div className="result-tabs">
          {[
            ["log", "Mensagens"],
            ["reactions", "Reações"],
            ["displacements", "Deslocamentos"],
            ["forces", "Esforços"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {key === "log" && <Terminal size={13} />} {label}
            </button>
          ))}
        </div>
        <div className="result-actions">
          {openRunHistory && tab === "log" && (
            <button onClick={openRunHistory}>
              <History size={13} />
              Registros do OOFEM
            </button>
          )}
          {result && (
            <>
              <span
                className="result-case-name"
                title={formula ?? definition.name}
              >
                {definition.name}
              </span>
              <span>
                <CheckCircle2 size={13} />{" "}
                {caseOutput?.solver ?? "Combinação linear"}
              </span>
              {caseOutput && (
                <button
                  title="Baixar saída original do OOFEM"
                  onClick={() =>
                    download(
                      `oofem-${caseOutput.caseId}.out`,
                      caseOutput.rawOutput,
                    )
                  }
                >
                  Saída OOFEM
                </button>
              )}
              {tab !== "log" && (
                <button
                  onClick={() => {
                    const sourceHeaders = combination
                      ? [
                          "Combinação",
                          "ID da combinação",
                          "Parcelas (ID do caso e fator)",
                        ]
                      : ["Caso", "ID do caso"];
                    const source = [definition.name, definition.id];
                    if (combination)
                      source.push(JSON.stringify(combination.factors));
                    download(
                      `kstruct-${combination ? "combinacao-" : ""}${definition.id}-${tab}.csv`,
                      "\uFEFF" +
                        [
                          [...headers, ...sourceHeaders],
                          ...rows.map((row) => [...row, ...source]),
                        ]
                          .map((r) =>
                            r
                              .map((v) =>
                                typeof v === "number"
                                  ? String(v)
                                  : `"${v.replaceAll('"', '""')}"`,
                              )
                              .join(";"),
                          )
                          .join("\n"),
                      "text/csv",
                    );
                  }}
                >
                  <FileDown size={13} />
                  CSV
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="results-body">
        {exportError && (
          <p className="help" role="alert">
            {exportError}
          </p>
        )}
        {tab === "log" ? (
          <div className="message-log">
            <span className={running ? "working" : "log-dot"} />
            <pre role="status">
              {cancelling
                ? "Cancelando execução do OOFEM…"
                : running
                  ? "OOFEM em execução…"
                  : logMessage}
            </pre>
          </div>
        ) : !result && view.kind === "combination" ? (
          <div className="no-results">{view.problem.replace("\n", " ")}</div>
        ) : !result ? (
          <div className="no-results">
            Execute uma análise para consultar{" "}
            {tab === "forces"
              ? "os esforços"
              : tab === "reactions"
                ? "as reações"
                : "os deslocamentos"}{" "}
            do caso <b>{definition.name}</b>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{typeof v === "number" ? fmt(v) : v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
