import type { Project, ResultCombination } from "../domain/model";
import type { AnalysisResult, Station, StructuralResult } from "./oofem";

const displacementComponents = ["ux", "uy", "uz", "rx", "ry", "rz"] as const;
const reactionComponents = ["fx", "fy", "fz", "mx", "my", "mz"] as const;
export const memberForceComponents = [
  "n",
  "v",
  "m",
  "vy",
  "vz",
  "mx",
  "my",
  "mz",
] as const;
export type MemberForceComponent = (typeof memberForceComponents)[number];
export type MemberForces = Pick<Station, MemberForceComponent>;
const stationComponents = [
  ...displacementComponents,
  ...memberForceComponents,
] as const;

type WeightedCase = {
  factor: number;
  result: AnalysisResult;
};

function sumComponents<K extends string, C extends WeightedCase>(
  components: readonly K[],
  cases: readonly C[],
  values: (term: C) => Record<K, number> | undefined,
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

export function requireAvailableCases(
  project: Project,
  factors: readonly ResultCombination["factors"][number][],
  caseResults: ReadonlyMap<string, AnalysisResult>,
): void {
  const pending = new Set(
    factors
      .filter(
        ({ caseId, factor }) =>
          factor !== 0 && caseResults.get(caseId)?.caseId !== caseId,
      )
      .map(({ caseId }) => caseId),
  );
  if (pending.size) {
    const caseNames = new Map(
      project.analysisCases.map(({ id, name }) => [id, name]),
    );
    const names = [...pending].map((caseId) => caseNames.get(caseId) ?? caseId);
    throw new Error(
      `Analise os casos pendentes nesta revisão.\n${names.join(", ")}`,
    );
  }
}

function weightedCases(
  project: Project,
  combination: ResultCombination,
  caseResults: ReadonlyMap<string, AnalysisResult>,
) {
  const terms = combination.factors.filter((term) => term.factor !== 0);
  if (!terms.length)
    throw new Error("Informe pelo menos um fator diferente de zero.");
  requireAvailableCases(project, terms, caseResults);
  return terms.map(({ caseId, factor }) => ({
    factor,
    result: caseResults.get(caseId)!,
  }));
}

function sumStations<K extends keyof Station>(
  components: readonly K[],
  cases: WeightedCase[],
  segments: number,
  memberId: string,
) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const values = sumComponents(components, cases, ({ result }) => {
      const stations = result.members[memberId];
      if (stations?.length === segments + 1 && stations[index]?.t === t)
        return stations[index];
    });
    return { t, ...values };
  });
}

export function prepareMemberForces(
  project: Project,
  combination: ResultCombination,
  caseResults: ReadonlyMap<string, AnalysisResult>,
) {
  const cases = weightedCases(project, combination, caseResults);
  const segments = project.mesh.segmentsPerMember;
  return (memberId: string) =>
    sumStations(memberForceComponents, cases, segments, memberId);
}

// The caller supplies parsed linear-static results from the current model revision.
export function combineLinearResults(
  project: Project,
  combination: ResultCombination,
  caseResults: ReadonlyMap<string, AnalysisResult>,
): StructuralResult {
  const cases = weightedCases(project, combination, caseResults);
  const reactionCases = cases.map((term) => ({
    ...term,
    reactions: new Map(
      term.result.reactions.map((item) => [item.nodeId, item]),
    ),
  }));

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
      ...sumComponents(reactionComponents, reactionCases, (term) =>
        term.reactions.get(id),
      ),
    }));
  const segments = project.mesh.segmentsPerMember;
  const members = Object.fromEntries(
    project.members.map(({ id }) => [
      id,
      sumStations(stationComponents, cases, segments, id),
    ]),
  );
  return { displacements, reactions, members };
}
