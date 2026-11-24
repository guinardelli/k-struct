import type { Project, ResultEnvelope } from "../domain/model";
import {
  memberForceComponents,
  prepareMemberForces,
  requireAvailableCases,
  type MemberForceComponent,
  type MemberForces,
} from "./combinations";
import type { AnalysisResult } from "./oofem";

export type EnvelopeExtreme = { combinationId: string; forces: MemberForces };
type ForceRange = { min: EnvelopeExtreme; max: EnvelopeExtreme };
export type EnvelopeStation = {
  t: number;
  ranges: Record<MemberForceComponent, ForceRange>;
};
export type MemberEnvelopeResult = Record<string, EnvelopeStation[]>;
export type EnvelopeSection = { memberId: string; index: number };

export async function evaluateMemberEnvelope(
  project: Project,
  envelope: ResultEnvelope,
  caseResults: ReadonlyMap<string, AnalysisResult>,
  signal?: AbortSignal,
): Promise<MemberEnvelopeResult> {
  signal?.throwIfAborted();
  const combinations = envelope.combinationIds.map((id) => {
    const combination = project.resultCombinations.find(
      (item) => item.id === id,
    );
    if (!combination)
      throw new Error("O envelope referencia uma combinação inexistente.");
    return combination;
  });
  if (!combinations.length)
    throw new Error("Inclua uma combinação no envelope.");
  requireAvailableCases(
    project,
    combinations.flatMap((item) => item.factors),
    caseResults,
  );
  const sources = combinations.map((item) => ({
    id: item.id,
    memberForces: prepareMemberForces(project, item, caseResults),
  }));

  const result: MemberEnvelopeResult = {};
  let nextYield = performance.now() + 12;
  for (const { id } of project.members) {
    const stations: EnvelopeStation[] = [];
    for (const combination of sources) {
      // Every bound retains the full vector of a single combination at this station.
      for (const [index, { t, ...forces }] of combination
        .memberForces(id)
        .entries()) {
        const extreme = { combinationId: combination.id, forces };
        const station = stations[index];
        if (!station) {
          const ranges = Object.fromEntries(
            memberForceComponents.map((key) => [
              key,
              { min: extreme, max: extreme },
            ]),
          ) as EnvelopeStation["ranges"];
          stations.push({ t, ranges });
          continue;
        }
        for (const key of memberForceComponents) {
          const range = station.ranges[key];
          if (forces[key] < range.min.forces[key]) range.min = extreme;
          if (forces[key] > range.max.forces[key]) range.max = extreme;
        }
      }
      if (signal && performance.now() >= nextYield) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal.throwIfAborted();
        nextYield = performance.now() + 12;
      }
    }
    result[id] = stations;
  }
  return result;
}
