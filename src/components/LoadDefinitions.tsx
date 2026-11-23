import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { nextName, uid, type Project } from "../domain/model";

export type LoadDefinitionsPage = "patterns" | "cases" | "combinations";
type Definitions = Pick<
  Project,
  "loadPatterns" | "analysisCases" | "resultCombinations"
>;
type DraftFactor = { sourceId: string; factor: string };
type DraftDefinition = {
  id: string;
  name: string;
  factors: DraftFactor[];
};
const parseFactor = (value: string) =>
  value.trim() ? Number(value.replace(",", ".")) : NaN;

export default function LoadDefinitions({
  project,
  initialPage,
  initialPatternId,
  initialCaseId,
  initialCombinationId,
  onApply,
  onClose,
}: {
  project: Project;
  initialPage: LoadDefinitionsPage;
  initialPatternId: string;
  initialCaseId: string;
  initialCombinationId: string;
  onApply: (
    definitions: Definitions,
    patternId: string,
    caseId: string,
    combinationId: string,
  ) => string | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(initialPage);
  const [patterns, setPatterns] = useState(project.loadPatterns);
  const [cases, setCases] = useState<DraftDefinition[]>(() =>
    project.analysisCases.map(({ id, name, factors }) => ({
      id,
      name,
      factors: factors.map(({ patternId, factor }) => ({
        sourceId: patternId,
        factor: String(factor),
      })),
    })),
  );
  const [combinations, setCombinations] = useState<DraftDefinition[]>(() =>
    project.resultCombinations.map(({ id, name, factors }) => ({
      id,
      name,
      factors: factors.map(({ caseId, factor }) => ({
        sourceId: caseId,
        factor: String(factor),
      })),
    })),
  );
  const [patternId, setPatternId] = useState(initialPatternId);
  const [caseId, setCaseId] = useState(initialCaseId);
  const [combinationId, setCombinationId] = useState(initialCombinationId);
  const [error, setError] = useState("");
  const pattern = patterns.find((item) => item.id === patternId)!;
  const editingCase = page === "cases";
  const definitions = editingCase ? cases : combinations;
  const setDefinitions = editingCase ? setCases : setCombinations;
  const definitionId = editingCase ? caseId : combinationId;
  const setDefinitionId = editingCase ? setCaseId : setCombinationId;
  const definition = definitions.find((item) => item.id === definitionId);
  const definitionLabel = editingCase ? "Caso" : "Combinação";
  const sources = editingCase ? patterns : cases;
  const sourceLabel = editingCase ? "Padrão" : "Caso";
  const availableSource = sources.find((source) =>
    definition?.factors.every((f) => f.sourceId !== source.id),
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
      item.factors.some((f) => f.sourceId === patternId),
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
  const addDefinition = () => {
    const id = uid();
    setDefinitions([
      ...definitions,
      {
        id,
        name: nextName(`${definitionLabel} `, definitions),
        factors: [{ sourceId: editingCase ? patternId : caseId, factor: "1" }],
      },
    ]);
    setDefinitionId(id);
    setError("");
  };
  const removeDefinition = () => {
    if (editingCase) {
      const references = combinations.filter((item) =>
        item.factors.some((f) => f.sourceId === definitionId),
      );
      if (references.length) {
        setError(
          `O caso está em uso nas combinações ${references.map((item) => item.name).join(", ")}. Ajuste as parcelas antes de excluir o caso.`,
        );
        return;
      }
    }
    const next = definitions.filter((item) => item.id !== definitionId);
    setDefinitions(next);
    setDefinitionId(next[0]?.id ?? "");
    setError("");
  };
  const updateDefinition = (
    values: Partial<Pick<DraftDefinition, "name" | "factors">>,
  ) => {
    setDefinitions(
      definitions.map((item) =>
        item.id === definitionId ? { ...item, ...values } : item,
      ),
    );
    setError("");
  };
  const updateFactor = (index: number, next: DraftFactor) => {
    if (!definition) return;
    updateDefinition({
      factors: definition.factors.map((f, i) => (i === index ? next : f)),
    });
  };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const analysisCases: Project["analysisCases"] = cases.map((item) => ({
      ...item,
      name: item.name.trim(),
      type: "linear-static",
      factors: item.factors.map(({ sourceId, factor }) => ({
        patternId: sourceId,
        factor: parseFactor(factor),
      })),
    }));
    const resultCombinations: Project["resultCombinations"] = combinations.map(
      (item) => ({
        ...item,
        name: item.name.trim(),
        type: "linear",
        factors: item.factors.map(({ sourceId, factor }) => ({
          caseId: sourceId,
          factor: parseFactor(factor),
        })),
      }),
    );
    const loadPatterns = patterns.map((item) => ({
      ...item,
      name: item.name.trim(),
    }));
    if (
      [...loadPatterns, ...analysisCases, ...resultCombinations].some(
        (item) => !item.name,
      )
    ) {
      setError("Informe um nome para cada padrão, caso e combinação.");
      return;
    }
    for (const [items, label] of [
      [analysisCases, "no caso"],
      [resultCombinations, "na combinação"],
    ] as const) {
      const invalid = items.find((item) =>
        item.factors.some((f) => !Number.isFinite(f.factor)),
      );
      if (invalid) {
        setError(`Informe fatores numéricos finitos ${label} ${invalid.name}.`);
        return;
      }
    }
    const problem = onApply(
      { loadPatterns, analysisCases, resultCombinations },
      patternId,
      caseId,
      page === "combinations" ? combinationId : "",
    );
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
      <h2 id="load-editor-title">Padrões, casos e combinações</h2>
      <form onSubmit={apply}>
        <div className="guide-tabs" aria-label="Definições de carga">
          {(
            [
              ["patterns", "Padrões de carga"],
              ["cases", "Casos estáticos"],
              ["combinations", "Combinações lineares"],
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
              {definition && (
                <label>
                  {definitionLabel} para editar
                  <select
                    value={definitionId}
                    onChange={(event) => {
                      setDefinitionId(event.target.value);
                      setError("");
                    }}
                  >
                    {definitions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || `${definitionLabel} sem nome`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={addDefinition}
                disabled={definitions.length >= 100}
              >
                <Plus size={14} />
                {editingCase ? "Novo caso" : "Nova combinação"}
              </button>
              {definition && (
                <button
                  type="button"
                  onClick={removeDefinition}
                  disabled={editingCase && cases.length <= 1}
                >
                  <Trash2 size={14} />
                  {editingCase ? "Excluir caso" : "Excluir combinação"}
                </button>
              )}
            </div>
            {definition ? (
              <>
                <label>
                  {editingCase ? "Nome do caso" : "Nome da combinação"}
                  <input
                    value={definition.name}
                    maxLength={120}
                    onChange={(event) =>
                      updateDefinition({ name: event.target.value })
                    }
                  />
                </label>
                <fieldset className="case-factors">
                  <legend>
                    {editingCase
                      ? "Padrões e fatores do caso"
                      : "Casos e fatores da combinação"}
                  </legend>
                  <p>
                    {editingCase
                      ? "O caso estático aplica cada padrão multiplicado pelo fator informado."
                      : "A combinação soma os resultados dos casos estáticos, ponderados pelos fatores abaixo."}
                  </p>
                  {definition.factors.map((item, index) => (
                    <div className="guide-row" key={index}>
                      <label>
                        {sourceLabel}
                        <select
                          aria-label={`${sourceLabel} da parcela ${index + 1}`}
                          value={item.sourceId}
                          onChange={(event) =>
                            updateFactor(index, {
                              ...item,
                              sourceId: event.target.value,
                            })
                          }
                        >
                          {sources
                            .filter(
                              (source) =>
                                editingCase ||
                                source.id === item.sourceId ||
                                definition.factors.every(
                                  (f) => f.sourceId !== source.id,
                                ),
                            )
                            .map((source) => (
                              <option key={source.id} value={source.id}>
                                {source.name || `${sourceLabel} sem nome`}
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
                        disabled={definition.factors.length <= 1}
                        onClick={() =>
                          updateDefinition({
                            factors: definition.factors.filter(
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
                    disabled={!availableSource}
                    onClick={() => {
                      if (availableSource)
                        updateDefinition({
                          factors: [
                            ...definition.factors,
                            { sourceId: availableSource.id, factor: "1" },
                          ],
                        });
                    }}
                  >
                    <Plus size={14} />
                    Adicionar parcela
                  </button>
                </fieldset>
              </>
            ) : (
              <p>
                Crie uma combinação para somar os resultados de casos estáticos.
              </p>
            )}
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
