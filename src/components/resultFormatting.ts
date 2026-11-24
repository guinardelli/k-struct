import type { MemberForceComponent } from "../solver/combinations";

export const forceColumns = {
  planar: ["n", "v", "m"],
  spatial: ["n", "vy", "vz", "mx", "my", "mz"],
} as const;

export const forceLabels: Record<
  MemberForceComponent,
  { symbol: string; unit: string }
> = {
  n: { symbol: "N", unit: "kN" },
  v: { symbol: "V", unit: "kN" },
  m: { symbol: "M", unit: "kN·m" },
  vy: { symbol: "Vy", unit: "kN" },
  vz: { symbol: "Vz", unit: "kN" },
  mx: { symbol: "Mx", unit: "kN·m" },
  my: { symbol: "My", unit: "kN·m" },
  mz: { symbol: "Mz", unit: "kN·m" },
};

export const formatResult = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 5 });

export function encodeCsv(rows: (string | number)[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) =>
            typeof value === "number"
              ? String(value)
              : `"${value.replaceAll('"', '""')}"`,
          )
          .join(";"),
      )
      .join("\n")
  );
}
