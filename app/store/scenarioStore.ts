import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ScenarioAsset {
  id?:       string;
  name:     string;
  teamId?:   string;
  position: string;
  capHit:   number;
  age?:     number;
  retainedPct?: number;
  round?:    number | null;
  year?:     number | null;
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

const safeScenarioStorage = {
  getItem: (name: string): string | null => {
    try {
      const value = localStorage.getItem(name);
      if (!value) return null;
      if (value.length > 512_000) {
        localStorage.removeItem(name);
        return null;
      }
      JSON.parse(value);
      return value;
    } catch {
      try { localStorage.removeItem(name); } catch {}
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch {}
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {}
  },
};

const scenarioId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set) => ({
      savedScenarios: [],

      saveScenario: (s) => set(state => {
        const savedAt = Date.now();
        return {
          savedScenarios: [
            { ...s, id: scenarioId(), savedAt },
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
      storage: createJSONStorage(() => safeScenarioStorage),
    }
  )
);
