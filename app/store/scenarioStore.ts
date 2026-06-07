import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SavedScenario {
  id:          string;
  name:        string;
  url:         string;           // full ?home=...&out=...&in=... query string
  homeTeam:    string | null;    // display only
  partnerTeam: string | null;    // display only
  savedAt:     number;
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

      saveScenario: (s) => set(state => ({
        savedScenarios: [
          { ...s, id: Math.random().toString(36).slice(2, 9), savedAt: Date.now() },
          ...state.savedScenarios,
        ].slice(0, 25), // cap at 25 saved scenarios
      })),

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
