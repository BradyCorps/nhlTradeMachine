import { create } from 'zustand';
import type { Asset, Team, XNAVResult } from '@/app/lib/trade-types';

interface TradeState {
  teams: [Team | null, Team | null];
  blocks: [Asset[], Asset[]];
  navMap: Record<string, XNAVResult>;
  
  // Actions
  setTeams: (teams: [Team | null, Team | null] | ((prev: [Team | null, Team | null]) => [Team | null, Team | null])) => void;
  setBlocks: (blocks: [Asset[], Asset[]] | ((prev: [Asset[], Asset[]]) => [Asset[], Asset[]])) => void;
  updateBlock: (idx: 0 | 1, block: Asset[]) => void;
  setNavMap: (navMap: Record<string, XNAVResult> | ((prev: Record<string, XNAVResult>) => Record<string, XNAVResult>)) => void;
  clearTrade: () => void;
  setRetainedPct: (assetId: string, idx: 0 | 1, pct: number) => void;
  removeAsset: (assetId: string, idx: 0 | 1) => void;
  addAsset: (asset: Asset, idx: 0 | 1) => void;
}

export const useTradeStore = create<TradeState>((set) => ({
  teams: [null, null],
  blocks: [[], []],
  navMap: {},

  setTeams: (teams) => set((state) => ({ teams: typeof teams === 'function' ? teams(state.teams) : teams })),
  setBlocks: (blocks) => set((state) => ({ blocks: typeof blocks === 'function' ? blocks(state.blocks) : blocks })),
  updateBlock: (idx, block) => set((state) => {
    const newBlocks = [...state.blocks] as [Asset[], Asset[]];
    newBlocks[idx] = block;
    return { blocks: newBlocks };
  }),
  setNavMap: (navMap) => set((state) => ({
    navMap: typeof navMap === 'function' ? navMap(state.navMap) : navMap
  })),
  clearTrade: () => set({ blocks: [[], []] }),
  
  setRetainedPct: (assetId, idx, pct) => set((state) => {
    const newBlocks = [...state.blocks] as [Asset[], Asset[]];
    newBlocks[idx] = newBlocks[idx].map(a => 
      a.id === assetId ? { ...a, retainedPct: pct } : a
    );
    return { blocks: newBlocks };
  }),
  
  removeAsset: (assetId, idx) => set((state) => {
    const newBlocks = [...state.blocks] as [Asset[], Asset[]];
    newBlocks[idx] = newBlocks[idx].filter(a => a.id !== assetId);
    return { blocks: newBlocks };
  }),
  
  addAsset: (asset, idx) => set((state) => {
    const newBlocks = [...state.blocks] as [Asset[], Asset[]];
    if (!newBlocks[idx].find(a => a.id === asset.id)) {
      newBlocks[idx] = [...newBlocks[idx], asset];
    }
    return { blocks: newBlocks };
  })
}));
