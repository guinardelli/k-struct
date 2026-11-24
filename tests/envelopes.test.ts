import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { beamExample, type ResultCombination } from "../src/domain/model";
import { evaluateMemberEnvelope } from "../src/solver/envelopes";
import { exportOofem, parseOofemOutput } from "../src/solver/oofem";

const output = readFileSync(
  new URL("./fixtures/beam-oofem.txt", import.meta.url),
  "utf8",
);

it("preserva os sinais, respeita a seleção de combinações e mantém a ordem nos empates", async () => {
  const project = beamExample();
  project.analysisCases.push({
    ...project.analysisCases[0],
    id: "Q",
    name: "Variável",
  });
  const combo = (id: string, factor: number, q = 0): ResultCombination => ({
    id,
    name: id,
    type: "linear",
    factors: [
      { caseId: "EL", factor },
      { caseId: "Q", factor: q },
    ],
  });
  project.resultCombinations = [
    combo("A", -2),
    combo("B", -1),
    combo("C", -2),
    combo("Fora", 10, 1),
  ];
  const definition = {
    id: "E1",
    name: "Ensaio",
    combinationIds: ["A", "B", "C"],
  };
  const analysis = parseOofemOutput(output, exportOofem(project, "EL"));
  const cases = new Map([["EL", analysis]]);
  const evaluated = await evaluateMemberEnvelope(project, definition, cases);
  const middle = evaluated.V1[4];
  expect(middle.t).toBe(0.5);
  expect(middle.ranges.m.min).toMatchObject({
    combinationId: "A",
    forces: { m: -90000 },
  });
  expect(middle.ranges.m.max).toMatchObject({
    combinationId: "B",
    forces: { m: -45000 },
  });
  const single = await evaluateMemberEnvelope(
    project,
    { ...definition, combinationIds: ["B"] },
    cases,
  );
  expect(single.V1[4].ranges.m.min).toEqual(single.V1[4].ranges.m.max);
  await expect(
    evaluateMemberEnvelope(
      project,
      { ...definition, combinationIds: ["A", "Fora"] },
      cases,
    ),
  ).rejects.toThrow(/pendentes.*\nVariável$/);
});
