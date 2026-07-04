// shared/contract.ts is importable directly now (metro '@shared' alias +
// watchFolders, 2026-07-03) — type-only re-exports cost nothing at runtime.
// New wire shapes should come from here instead of hand-mirroring in types.ts;
// migrate the existing hand-mirrors opportunistically.
export type { MeResponse, Portfolio as ContractPortfolio, Signals as ContractSignals } from '@shared/contract';
