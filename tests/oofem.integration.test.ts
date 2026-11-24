import { describe, expect, it } from "vitest";
import {
  addPoint,
  beamExample,
  createProject,
  free,
  nodalLoad,
  uniformLoad,
  type Project,
} from "../src/domain/model";
import { combineLinearResults } from "../src/solver/combinations";
import { evaluateMemberEnvelope } from "../src/solver/envelopes";
import { exportOofem, parseOofemOutput } from "../src/solver/oofem";
import portal from "./fixtures/portal-planar.json";
import portalExpected from "./fixtures/portal-expected.json";
import { runDeck } from "./fixtures/solve-oofem";
import {
  spatialBenchmark,
  spatialBenchmarkDifferences,
} from "./fixtures/spatial-benchmark";

const executable = process.env.OOFEM_BIN;
function solve(p: Project, caseId = "EL") {
  const input = exportOofem(p, caseId);
  return parseOofemOutput(runDeck(input.deck, executable!), input);
}

describe.skipIf(!executable)("OOFEM real · benchmarks analíticos", () => {
  it("pórtico plano de dois pavimentos concorda com a solução independente por rigidez direta", () => {
    const p = createProject();
    p.materials[0].E = portal.e;
    p.sections = portal.sections.map(([width, height], i) => ({
      id: `R${i}`,
      name: `Seção R${i}`,
      materialId: p.materials[0].id,
      width,
      height,
    }));
    p.nodes = portal.nodes.map(([x, z], i) => {
      const fixed = portal.fixed.includes(i);
      return {
        id: `N${i}`,
        name: `N${i}`,
        x,
        y: 0,
        z,
        restraints: { ...free(), ux: fixed, uz: fixed, ry: fixed },
      };
    });
    p.members = portal.members.map(([start, end, section], i) => ({
      id: `B${i}`,
      name: `B${i}`,
      start: `N${start}`,
      end: `N${end}`,
      sectionId: `R${section}`,
      roll: 0,
    }));
    p.loadPatterns[0].uniform = portal.uniform.map(([member, qx, qz]) => ({
      ...uniformLoad(`B${member}`),
      qx,
      qz,
    }));
    p.loadPatterns[0].nodal = portal.nodal.map(([node, fx, fz, my]) => ({
      ...nodalLoad(`N${node}`),
      fx,
      fz,
      my,
    }));
    const result = solve(p);
    const nearPrintedForce = (actual: number, expected: number) =>
      expect(Math.abs(actual - expected)).toBeLessThan(
        0.1 + Math.abs(expected) * 5e-5,
      );
    for (const [i, [fx, fz, my]] of portalExpected.reactions.entries()) {
      const r = result.reactions.find(
        (item) => item.nodeId === `N${portal.fixed[i]}`,
      )!;
      nearPrintedForce(r.fx, fx);
      nearPrintedForce(r.fz, fz);
      nearPrintedForce(r.my, my);
    }
    for (const [
      i,
      [ux, uz, ry],
    ] of portalExpected.roofDisplacements.entries()) {
      const d = result.displacements[`N${i + portal.nodes.length - 2}`];
      expect(d.ux).toBeCloseTo(ux, 9);
      expect(d.uz).toBeCloseTo(uz, 9);
      expect(d.ry).toBeCloseTo(ry, 9);
    }
    const roof = result.members[`B${portal.members.length - 1}`];
    nearPrintedForce(roof[0].m, portalExpected.roofBeamEndMoments[0]);
    nearPrintedForce(roof.at(-1)!.m, portalExpected.roofBeamEndMoments[1]);
  });
  it("viga 6 m: reações de 30 kN, momento de 45 kN.m e flecha de 8,4375 mm", () => {
    const r = solve(beamExample());
    expect(r.reactions.find((r) => r.nodeId === "A")!.fz).toBeCloseTo(30000, 1);
    expect(r.reactions.find((r) => r.nodeId === "B")!.fz).toBeCloseTo(30000, 1);
    const middle = r.members.V1.find((s) => s.t === 0.5)!;
    expect(middle.uz).toBeCloseTo(-0.0084375, 8);
    expect(middle.m).toBeCloseTo(45000, 1);
  });
  it("duplicar a carga duplica deslocamentos e esforços", () => {
    const p = beamExample();
    p.analysisCases[0].factors[0].factor = 2;
    const r = solve(p);
    expect(r.members.V1[4].uz).toBeCloseTo(-0.016875, 8);
    expect(r.members.V1[4].m).toBeCloseTo(90000, 1);
  });
  it("balanço horizontal com força nodal: PL³/3EI e momento negativo na raiz", () => {
    const p = beamExample();
    p.nodes[0].restraints.ry = true;
    p.nodes[1].restraints.uz = false;
    p.loadPatterns[0].uniform = [];
    p.loadPatterns[0].nodal = [{ ...nodalLoad("B"), fz: -1000 }];
    const r = solve(p);
    expect(r.displacements.B.uz).toBeCloseTo(
      (-1000 * 6 ** 3) / (3 * 2e11 * 1e-4),
      8,
    );
    expect(r.members.V1[0].m).toBeCloseTo(-6000, 1);
  });
  it("pilar vertical sob carga global horizontal: direção e equilíbrio", () => {
    const p = beamExample();
    p.nodes[1].x = 0;
    p.nodes[1].z = 6;
    p.nodes[0].restraints.ry = true;
    p.nodes[1].restraints.uz = false;
    p.loadPatterns[0].uniform = [{ ...uniformLoad("V1"), qx: 1000 }];
    const r = solve(p);
    expect(r.displacements.B.ux).toBeCloseTo(
      (1000 * 6 ** 4) / (8 * 2e11 * 1e-4),
      8,
    );
    expect(r.reactions[0].fx).toBeCloseTo(-6000, 1);
    expect(r.reactions[0].my).toBeCloseTo(-18000, 1);
  });
  it("balanço inclinado combina parcela axial e flexional em coordenadas globais", () => {
    const p = beamExample();
    p.nodes[1].x = 3;
    p.nodes[1].z = 4;
    p.nodes[0].restraints.ry = true;
    p.nodes[1].restraints.uz = false;
    p.loadPatterns[0].uniform = [];
    p.loadPatterns[0].nodal = [{ ...nodalLoad("B"), fx: 1000 }];
    const r = solve(p),
      axial = (1000 * 5) / (2e11 * 0.03),
      bending = (1000 * 5 ** 3) / (3 * 2e11 * 1e-4);
    expect(r.displacements.B.ux).toBeCloseTo(
      axial * 0.6 ** 2 + bending * 0.8 ** 2,
      8,
    );
    expect(r.displacements.B.uz).toBeCloseTo((axial - bending) * 0.6 * 0.8, 8);
  });
  it("balanço espacial com seção girada: flexão biaxial, normal e torção", () => {
    const p = createProject("spatial");
    const a = addPoint(p, { x: 0, y: 2, z: 1 });
    const b = addPoint(p, { x: 3, y: 2, z: 1 });
    a.restraints = {
      ux: true,
      uy: true,
      uz: true,
      rx: true,
      ry: true,
      rz: true,
    };
    p.members = [
      {
        id: "B1",
        name: "B1",
        start: a.id,
        end: b.id,
        sectionId: "rect",
        roll: 90,
      },
    ];
    p.loadPatterns[0].nodal = [
      { ...nodalLoad(b.id), fx: 1800, fy: 1200, fz: -2400, mx: 600 },
    ];
    const { width, height } = p.sections[0];
    const { E, nu } = p.materials[0];
    const iy = (width * height ** 3) / 12;
    const iz = (height * width ** 3) / 12;
    const j = 0.00012180866179401363;
    const g = E / (2 * (1 + nu));
    const r = solve(p),
      u = r.displacements[b.id];
    expect(u.ux).toBeCloseTo((1800 * 3) / (E * width * height), 9);
    expect(u.uy).toBeCloseTo((1200 * 3 ** 3) / (3 * E * iy), 8);
    expect(u.uz).toBeCloseTo((-2400 * 3 ** 3) / (3 * E * iz), 8);
    expect(u.rx).toBeCloseTo((600 * 3) / (g * j), 8);
    expect(u.ry).toBeCloseTo((2400 * 3 ** 2) / (2 * E * iz), 8);
    expect(u.rz).toBeCloseTo((1200 * 3 ** 2) / (2 * E * iy), 8);
    expect(r.reactions[0]).toEqual({
      nodeId: a.id,
      fx: -1800,
      fy: -1200,
      fz: 2400,
      mx: -600,
      my: -7200,
      mz: -3600,
    });
    const { n, vy, vz, mx, my, mz } = r.members.B1[0];
    expect([n, vy, vz, mx, my, mz]).toEqual([
      1800, -2400, -1200, 600, 3600, -7200,
    ]);
  });
  it("pórtico espacial assimétrico em dois pavimentos concorda com a rigidez direta independente", () => {
    const model = spatialBenchmark();
    expect(spatialBenchmarkDifferences(model, solve(model))).toEqual([]);
  });
  it("envelope de pórtico em L mantém os esforços simultâneos de cada combinação governante", async () => {
    const project = createProject("spatial");
    const a = addPoint(project, { x: 0, y: 0, z: 0 });
    const b = addPoint(project, { x: 0, y: 0, z: 3 });
    const c = addPoint(project, { x: 4, y: 0, z: 3 });
    a.restraints = {
      ux: true,
      uy: true,
      uz: true,
      rx: true,
      ry: true,
      rz: true,
    };
    project.members = [
      {
        id: "P1",
        name: "P1",
        start: a.id,
        end: b.id,
        roll: 0,
        sectionId: "rect",
      },
      {
        id: "V1",
        name: "V1",
        start: b.id,
        end: c.id,
        roll: 0,
        sectionId: "rect",
      },
    ];
    project.loadPatterns[0].nodal = [
      {
        nodeId: c.id,
        fx: -2000,
        fy: 1500,
        fz: -5000,
        mx: 700,
        my: 300,
        mz: -400,
      },
    ];
    project.loadPatterns.push({
      id: "P",
      name: "Compressão",
      uniform: [],
      nodal: [
        {
          nodeId: c.id,
          fx: -12000,
          fy: -1200,
          fz: 1000,
          mx: -900,
          my: 150,
          mz: 200,
        },
      ],
    });
    project.analysisCases.push({
      id: "CP",
      name: "Compressão",
      type: "linear-static",
      factors: [{ patternId: "P", factor: 1 }],
    });
    const weights = [
      { id: "CF", name: "Flexão", f: 1.2, p: 0.2 },
      { id: "CC", name: "Compressão", f: -0.25, p: 1.3 },
    ];
    for (const { id, name, f, p } of weights) {
      project.resultCombinations.push({
        id,
        name,
        type: "linear",
        factors: [
          { caseId: "EL", factor: f },
          { caseId: "CP", factor: p },
        ],
      });
      project.analysisCases.push({
        id: `DIRECT-${id}`,
        name,
        type: "linear-static",
        factors: [
          { patternId: "G", factor: f },
          { patternId: "P", factor: p },
        ],
      });
    }
    const definition = {
      id: "E1",
      name: "Envelope",
      combinationIds: ["CF", "CC"],
    };
    project.resultEnvelopes = [definition];
    const cases = new Map(["EL", "CP"].map((id) => [id, solve(project, id)]));
    const evaluated = await evaluateMemberEnvelope(project, definition, cases);
    const middle = evaluated.V1[4];
    expect(middle.t).toBe(0.5);
    expect(middle.ranges.my.max.combinationId).toBe("CF");
    expect(middle.ranges.my.min.combinationId).toBe("CC");
    expect(middle.ranges.n.min.combinationId).toBe("CC");
    const components = ["n", "vy", "vz", "mx", "my", "mz"] as const;
    const expected = [
      {
        extreme: middle.ranges.my.max,
        values: [-4800, 1560, -5800, 660, 11990, 2680],
      },
      {
        extreme: middle.ranges.n.min,
        values: [-15100, -1935, 2550, -1345, -4980, -3510],
      },
    ];
    for (const { extreme, values } of expected) {
      const direct = solve(project, `DIRECT-${extreme.combinationId}`).members
        .V1[4];
      for (const [i, key] of components.entries()) {
        expect(extreme.forces[key], key).toBeCloseTo(values[i], 1);
        expect(extreme.forces[key], key).toBeCloseTo(direct[key], 1);
      }
    }
  });
  it.each([
    ["viga plana", beamExample],
    ["pórtico espacial", spatialBenchmark],
  ] as const)(
    "combinação em %s reproduz um caso direto do OOFEM",
    (_, create) => {
      const p = create();
      const permanent = p.loadPatterns[0];
      const secondary = permanent.nodal.length
        ? permanent.nodal
        : [{ ...nodalLoad("B"), fx: 1400, my: 480 }];
      permanent.nodal = [];
      p.loadPatterns.push({
        id: "W",
        name: "Ações nodais",
        nodal: secondary,
        uniform: [],
      });
      const factors = (g: number, w: number) => [
        { patternId: permanent.id, factor: g },
        { patternId: "W", factor: w },
      ];
      const [first] = p.analysisCases;
      first.factors = factors(1.2, 0.25);
      p.analysisCases.push(
        {
          ...first,
          id: "W",
          name: "Segundo caso",
          factors: factors(-0.5, 0.75),
        },
        {
          ...first,
          id: "DIRECT",
          name: "Ações equivalentes",
          factors: factors(2.2, -0.225),
        },
      );
      p.resultCombinations.push({
        id: "C1",
        name: "Combinação de referência",
        type: "linear",
        factors: [
          { caseId: first.id, factor: 1.5 },
          { caseId: "W", factor: -0.8 },
        ],
      });
      const results = new Map(
        p.analysisCases.slice(0, 2).map(({ id }) => [id, solve(p, id)]),
      );
      const combined = combineLinearResults(
        p,
        p.resultCombinations[0],
        results,
      );
      const direct = solve(p, "DIRECT");

      for (const [id, expected] of Object.entries(direct.displacements)) {
        for (const dof of ["ux", "uy", "uz", "rx", "ry", "rz"] as const)
          expect(combined.displacements[id][dof], `${id}.${dof}`).toBeCloseTo(
            expected[dof],
            8,
          );
      }
      const compareForce = (actual: number, expected: number, label: string) =>
        expect(Math.abs(actual - expected), label).toBeLessThan(
          0.1 + Math.abs(expected) * 1e-4,
        );
      for (const expected of direct.reactions) {
        const actual = combined.reactions.find(
          ({ nodeId }) => nodeId === expected.nodeId,
        )!;
        for (const component of ["fx", "fy", "fz", "mx", "my", "mz"] as const)
          compareForce(
            actual[component],
            expected[component],
            `${expected.nodeId}.${component}`,
          );
      }
      for (const [id, stations] of Object.entries(direct.members)) {
        expect(combined.members[id]).toHaveLength(stations.length);
        for (const [index, expected] of stations.entries()) {
          const actual = combined.members[id][index];
          expect(actual.t).toBe(expected.t);
          for (const dof of ["ux", "uy", "uz", "rx", "ry", "rz"] as const)
            expect(actual[dof], `${id}[${index}].${dof}`).toBeCloseTo(
              expected[dof],
              8,
            );
          for (const component of [
            "n",
            "v",
            "m",
            "vy",
            "vz",
            "mx",
            "my",
            "mz",
          ] as const)
            compareForce(
              actual[component],
              expected[component],
              `${id}[${index}].${component}`,
            );
        }
      }
    },
  );
});
