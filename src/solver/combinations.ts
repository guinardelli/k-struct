import type { Project, ResultCombination } from "../domain/model";
import type { AnalysisResult, Reaction, StructuralResult } from "./oofem";

const displacementComponents = ["ux", "uy", "uz", "rx", "ry", "rz"] as const;
const reactionComponents = ["fx", "fy", "fz", "mx", "my", "mz"] as const;
const stationComponents = [
  ...displacementComponents,
  "n",
  "v",
  "m",
  "vy",
  "vz",
  "mx",
  "my",
  "mz",
] as const;

type WeightedCase = {
  factor: number;
  result: AnalysisResult;
  reactions: ReadonlyMap<string, Reaction>;
};

function sumComponents<K extends string>(
  components: readonly K[],
  cases: WeightedCase[],
  values: (term: WeightedCase) => Record<K, number> | undefined,
): Record<K, number> {
  const total = Object.fromEntries(components.map((key) => [key, 0])) as Record<
    K,
    number
  >;
  for (const term of cases) {
    const value = values(term);
    if (!value)
      throw new Error(
        "Os resultados dos casos têm nós, apoios ou estações de malha incompatíveis.",
      );
    for (const key of components) {
      total[key] += term.factor * value[key];
      if (!Number.isFinite(total[key]))
        throw new Error(
          "A combinação gera valores fora do intervalo numérico.",
        );
    }
  }
  return total;
}

// The caller supplies parsed linear-static results from the current model revision.
export function combineLinearResults(
  project: Project,
  combination: ResultCombination,
  caseResults: ReadonlyMap<string, AnalysisResult>,
): StructuralResult {
  const terms = combination.factors.filter((term) => term.factor !== 0);
  if (!terms.length)
    throw new Error("Informe pelo menos um fator diferente de zero.");
  const pending = terms.filter(
    ({ caseId }) => caseResults.get(caseId)?.caseId !== caseId,
  );
  if (pending.length) {
    const caseNames = new Map(
      project.analysisCases.map(({ id, name }) => [id, name]),
    );
    const names = pending.map(({ caseId }) => caseNames.get(caseId) ?? caseId);
    throw new Error(
      `Analise os casos pendentes nesta revisão.\n${names.join(", ")}`,
    );
  }
  const cases = terms.map(({ caseId, factor }) => {
    const result = caseResults.get(caseId)!;
    return {
      factor,
      result,
      reactions: new Map(result.reactions.map((item) => [item.nodeId, item])),
    };
  });

  const displacements = Object.fromEntries(
    project.nodes.map(({ id }) => [
      id,
      sumComponents(
        displacementComponents,
        cases,
        ({ result }) => result.displacements[id],
      ),
    ]),
  );
  const reactions = project.nodes
    .filter((node) => Object.values(node.restraints).some(Boolean))
    .map(({ id }) => ({
      nodeId: id,
      ...sumComponents(reactionComponents, cases, (term) =>
        term.reactions.get(id),
      ),
    }));
  const segments = project.mesh.segmentsPerMember;
  const members = Object.fromEntries(
    project.members.map(({ id }) => [
      id,
      Array.from({ length: segments + 1 }, (_, index) => {
        const t = index / segments;
        const components = sumComponents(
          stationComponents,
          cases,
          ({ result }) => {
            const stations = result.members[id];
            if (stations?.length === segments + 1 && stations[index]?.t === t)
              return stations[index];
          },
        );
        return { t, ...components };
      }),
    ]),
  );
  return { displacements, reactions, members };
}
