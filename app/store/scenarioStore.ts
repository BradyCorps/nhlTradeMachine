import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { scenarioSeed } from '@/app/lib/sim-engine';

export interface ScenarioAsset {
  name:     string;
  position: string;
  capHit:   number;
  age?:     number;
}

export interface SavedScenario {
  id:          string;
  name:        string;
  savedAt:     number;
  homeTeam:    { id: string; name: string } | null;
  partnerTeam: { id: string; name: string } | null;
  outgoing:    ScenarioAsset[];
  incoming:    ScenarioAsset[];
}

interface ScenarioState {
  savedScenarios: SavedScenario[];
  saveScenario:   (s: Omit<SavedScenario, 'id' | 'savedAt'>) => void;
  deleteScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
}

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set) => ({
      savedScenarios: [],

      saveScenario: (s) => set(state => {
        const savedAt = Date.now();
        const id = scenarioSeed({ ...s, savedAt, index: state.savedScenarios.length }).toString(36);
        return {
          savedScenarios: [
            { ...s, id, savedAt },
            ...state.savedScenarios,
          ].slice(0, 25),
        };
      }),

      deleteScenario: (id) => set(state => ({
        savedScenarios: state.savedScenarios.filter(s => s.id !== id),
      })),

      renameScenario: (id, name) => set(state => ({
        savedScenarios: state.savedScenarios.map(s =>
          s.id === id ? { ...s, name } : s
        ),
      })),
    }),
    {
      name:    'nhl-trade-scenarios',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
