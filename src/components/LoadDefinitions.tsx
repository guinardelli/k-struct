import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { nextName, uid, type Project } from "../domain/model";

export type LoadDefinitionsPage = "patterns" | "cases";
type Definitions = Pick<Project, "loadPatterns" | "analysisCases">;
type DraftCase = Omit<Definitions["analysisCases"][number], "factors"> & {
  factors: { patternId: string; factor: string }[];
};

export default function LoadDefinitions({
  project,
  initialPage,
  initialPatternId,
  initialCaseId,
  onApply,
  onClose,
}: {
  project: Project;
  initialPage: LoadDefinitionsPage;
  initialPatternId: string;
  initialCaseId: string;
  onApply: (
    definitions: Definitions,
    patternId: string,
    caseId: string,
  ) => string | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(initialPage);
  const [patterns, setPatterns] = useState(project.loadPatterns);
  const [cases, setCases] = useState<DraftCase[]>(() =>
    project.analysisCases.map((item) => ({
      ...item,
      factors: item.factors.map((f) => ({ ...f, factor: String(f.factor) })),
    })),
  );
  const [patternId, setPatternId] = useState(initialPatternId);
  const [caseId, setCaseId] = useState(initialCaseId);
  const [error, setError] = useState("");
  const pattern = patterns.find((item) => item.id === patternId)!;
  const analysisCase = cases.find((item) => item.id === caseId)!;
  const availablePattern = patterns.find((p) =>
    analysisCase.factors.every((f) => f.patternId !== p.id),
  );

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  const addPattern = () => {
    const id = uid();
    setPatterns([
      ...patterns,
      { id, name: nextName("Padrão ", patterns), nodal: [], uniform: [] },
    ]);
    setPatternId(id);
    setError("");
  };
  const removePattern = () => {
    const references = cases.filter((item) =>
      item.factors.some((f) => f.patternId === patternId),
    );
    if (references.length) {
      setError(
        `O padrão está em uso nos casos ${references.map((item) => item.name).join(", ")}. Ajuste os fatores desses casos antes de excluir o padrão.`,
      );
      return;
    }
    const next = patterns.filter((item) => item.id !== patternId);
    setPatterns(next);
    setPatternId(next[0].id);
    setError("");
  };
  const addCase = () => {
    const id = uid();
    setCases([
      ...cases,
      {
        id,
        name: nextName("Caso ", cases),
        type: "linear-static",
        factors: [{ patternId, factor: "1" }],
      },
    ]);
    setCaseId(id);
    setError("");
  };
  const removeCase = () => {
    const next = cases.filter((item) => item.id !== caseId);
    setCases(next);
    setCaseId(next[0].id);
    setError("");
  };
  const updateCase = (values: Partial<Pick<DraftCase, "name" | "factors">>) => {
    setCases(
      cases.map((item) => (item.id === caseId ? { ...item, ...values } : item)),
    );
    setError("");
  };
  const updateFactor = (index: number, next: DraftCase["factors"][number]) => {
    updateCase({
      factors: analysisCase.factors.map((f, i) => (i === index ? next : f)),
    });
  };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const analysisCases = cases.map((item) => ({
      ...item,
      name: item.name.trim(),
      factors: item.factors.map((f) => ({
        patternId: f.patternId,
        factor: f.factor.trim() ? Number(f.factor.replace(",", ".")) : NaN,
      })),
    }));
    const loadPatterns = patterns.map((item) => ({
      ...item,
      name: item.name.trim(),
    }));
    if ([...loadPatterns, ...analysisCases].some((item) => !item.name)) {
      setError("Informe um nome para cada padrão e caso.");
      return;
    }
    const invalid = analysisCases.find((item) =>
      item.factors.some((f) => !Number.isFinite(f.factor)),
    );
    if (invalid) {
      setError(`Informe fatores numéricos finitos no caso ${invalid.name}.`);
      return;
    }
    const problem = onApply({ loadPatterns, analysisCases }, patternId, caseId);
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="modal launch-modal load-editor"
      aria-labelledby="load-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="load-editor-title">Padrões e casos de carga</h2>
      <form onSubmit={apply}>
        <div className="guide-tabs" aria-label="Definições de carga">
          {(
            [
              ["patterns", "Padrões de carga"],
              ["cases", "Casos estáticos"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={page === key}
              onClick={() => {
                setPage(key);
                setError("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {page === "patterns" ? (
          <div className="load-definition-fields">
            <div className="definition-picker">
              <label>
                Padrão para editar
                <select
                  value={patternId}
                  onChange={(event) => {
                    setPatternId(event.target.value);
                    setError("");
                  }}
                >
                  {patterns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "Padrão sem nome"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addPattern}
                disabled={patterns.length >= 100}
              >
                <Plus size={14} />
                Novo padrão
              </button>
              <button
                type="button"
                onClick={removePattern}
                disabled={patterns.length <= 1}
              >
                <Trash2 size={14} />
                Excluir padrão
              </button>
            </div>
            <label>
              Nome do padrão
              <input
                value={pattern.name}
                maxLength={120}
                onChange={(event) => {
                  setPatterns(
                    patterns.map((item) =>
                      item.id === patternId
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  );
                  setError("");
                }}
              />
            </label>
            <p>
              {pattern.nodal.length} cargas nodais · {pattern.uniform.length}{" "}
              cargas distribuídas. Atribua forças e momentos pelo painel de
              propriedades.
            </p>
          </div>
        ) : (
          <div className="load-definition-fields">
            <div className="definition-picker">
              <label>
                Caso para editar
                <select
                  value={caseId}
                  onChange={(event) => {
                    setCaseId(event.target.value);
                    setError("");
                  }}
                >
                  {cases.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "Caso sem nome"}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addCase}
                disabled={cases.length >= 100}
              >
                <Plus size={14} />
                Novo caso
              </button>
              <button
                type="button"
                onClick={removeCase}
                disabled={cases.length <= 1}
              >
                <Trash2 size={14} />
                Excluir caso
              </button>
            </div>
            <label>
              Nome do caso
              <input
                value={analysisCase.name}
                maxLength={120}
                onChange={(event) => updateCase({ name: event.target.value })}
              />
            </label>
            <fieldset className="case-factors">
              <legend>Padrões e fatores do caso</legend>
              <p>
                O caso estático aplica cada padrão multiplicado pelo fator
                informado.
              </p>
              {analysisCase.factors.map((item, index) => (
                <div className="guide-row" key={index}>
                  <label>
                    Padrão
                    <select
                      aria-label={`Padrão da parcela ${index + 1}`}
                      value={item.patternId}
                      onChange={(event) =>
                        updateFactor(index, {
                          ...item,
                          patternId: event.target.value,
                        })
                      }
                    >
                      {patterns.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name || "Padrão sem nome"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Fator
                    <input
                      aria-label={`Fator da parcela ${index + 1}`}
                      inputMode="decimal"
                      value={item.factor}
                      onChange={(event) =>
                        updateFactor(index, {
                          ...item,
                          factor: event.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remover parcela ${index + 1}`}
                    disabled={analysisCase.factors.length <= 1}
                    onClick={() =>
                      updateCase({
                        factors: analysisCase.factors.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={!availablePattern}
                onClick={() => {
                  if (availablePattern)
                    updateCase({
                      factors: [
                        ...analysisCase.factors,
                        { patternId: availablePattern.id, factor: "1" },
                      ],
                    });
                }}
              >
                <Plus size={14} />
                Adicionar parcela
              </button>
            </fieldset>
          </div>
        )}
        {error && (
          <p role="alert" className="launch-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            Aplicar definições
          </button>
        </div>
      </form>
    </dialog>
  );
}
