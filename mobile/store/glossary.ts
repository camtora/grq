import { create } from 'zustand';

/** The tap-to-explain glossary sheet (the literacy pillar): any [[term]] in any
 * MdText opens it. The sheet itself is mounted once in the root layout
 * (components/GlossarySheet); this store is just the door. */
type GlossaryState = {
  openKey: string | null; // a glossary key OR the raw [[marker]] text to resolve
  open: (key: string) => void;
  close: () => void;
};

export const useGlossary = create<GlossaryState>((set) => ({
  openKey: null,
  open: (key) => set({ openKey: key }),
  close: () => set({ openKey: null }),
}));
