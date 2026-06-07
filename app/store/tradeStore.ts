import { create } from 'zustand';
import type { Asset, Team, XNAVResult } from '@/app/lib/trade-types';

type Snapshot = {
  teams: [Team | null, Team | null];
  blocks: [Asset[], Asset[]];
};

interface TradeState {
  teams: [Team | null, Team | null];
  blocks: [Asset[], Asset[]];
  navMap: Record<string, XNAVResult>;

  // Undo/redo (in-memory only — not persisted)
  past:   Snapshot[];
  future: Snapshot[];

  setTeams:      (teams: [Team | null, Team | null] | ((prev: [Team | null, Team | null]) => [Team | null, Team | null])) => void;
  setBlocks:     (blocks: [Asset[], Asset[]] | ((prev: [Asset[], Asset[]]) => [Asset[], Asset[]])) => void;
  updateBlock:   (idx: 0 | 1, block: Asset[]) => void;
  setNavMap:     (navMap: Record<string, XNAVResult> | ((prev: Record<string, XNAVResult>) => Record<string, XNAVResult>)) => void;
  clearTrade:    () => void;
  setRetainedPct:(assetId: string, idx: 0 | 1, pct: number) => void;
  removeAsset:   (assetId: string, idx: 0 | 1) => void;
  addAsset:      (asset: Asset, idx: 0 | 1) => void;
  undo:          () => void;
  redo:          () => void;
}

const MAX_HISTORY = 30;

function snap(state: Pick<TradeState, 'teams' | 'blocks'>): Snapshot {
  return {
    teams:  [...state.teams]  as [Team | null, Team | null],
    blocks: [[...state.blocks[0]], [...state.blocks[1]]] as [Asset[], Asset[]],
  };
}

function pushHistory(state: TradeState): Pick<TradeState, 'past' | 'future'> {
  return {
    past:   [...state.past.slice(-(MAX_HISTORY - 1)), snap(state)],
    future: [],
  };
}

export const useTradeStore = create<TradeState>((set) => ({
  teams:   [null, null],
  blocks:  [[], []],
  navMap:  {},
  past:    [],
  future:  [],

  setTeams: (teams) => set((state) => ({
    teams: typeof teams === 'function' ? teams(state.teams) : teams,
    ...pushHistory(state),
  })),

  setBlocks: (blocks) => set((state) => ({
    blocks: typeof blocks === 'function' ? blocks(state.blocks) : blocks,
    ...pushHistory(state),
  })),

  updateBlock: (idx, block) => set((state) => {
    const newBlocks = [...state.blocks] as [Asset[], Asset[]];
    newBlocks[idx] = block;
    return { blocks: newBlocks, ...pushHistory(state) };
  }),

  setNavMap: (navMap) => set((state) => ({
    navMap: typeof navMap === 'function' ? navMap(state.navMap) : navMap,
    // navMap updates are not user actions — don't push to history
  })),

  clearTrade: () => set((state) => ({
    blocks: [[], []],
    ...pushHistory(state),
  })),

  setRetainedPct: (assetId, idx, pct) => set((state) => {
    const newBlocks = [...state.blocks] as [Asset[], Asset[]];
    newBlocks[idx] = newBlocks[idx].map(a =>
      a.id === assetId ? { ...a, retainedPct: pct } : a
    );
    return { blocks: newBlocks, ...pushHistory(state) };
  }),

  removeAsset: (assetId, idx) => set((state) => {
    const newBlocks = [...state.blocks] as [Asset[], Asset[]];
    newBlocks[idx] = newBlocks[idx].filter(a => a.id !== assetId);
    return { blocks: newBlocks, ...pushHistory(state) };
  }),

  addAsset: (asset, idx) => set((state) => {
    if (state.blocks[idx].find(a => a.id === asset.id)) return state;
    const newBlocks = [...state.blocks] as [Asset[], Asset[]];
    newBlocks[idx] = [...newBlocks[idx], asset];
    return { blocks: newBlocks, ...pushHistory(state) };
  }),

  undo: () => set((state) => {
    if (state.past.length === 0) return state;
    const prev    = state.past[state.past.length - 1];
    const current = snap(state);
    return {
      teams:  prev.teams,
      blocks: prev.blocks,
      past:   state.past.slice(0, -1),
      future: [current, ...state.future.slice(0, MAX_HISTORY - 1)],
    };
  }),

  redo: () => set((state) => {
    if (state.future.length === 0) return state;
    const next    = state.future[0];
    const current = snap(state);
    return {
      teams:  next.teams,
      blocks: next.blocks,
      past:   [...state.past.slice(-(MAX_HISTORY - 1)), current],
      future: state.future.slice(1),
    };
  }),
}));
