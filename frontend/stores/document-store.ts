import { create } from "zustand";

export type DocumentSortOrder = "latest" | "alpha";

interface DocumentState {
  selectedDocument: string;
  setSelectedDocument: (id: string) => void;

  // multi-select
  checkedDocuments: string[];
  toggleChecked: (id: string) => void;
  setAllChecked: (ids: string[]) => void;
  clearChecked: () => void;

  // pinned
  pinnedDocuments: string[];
  togglePinned: (id: string) => void;

  // sort
  sortOrder: DocumentSortOrder;
  setSortOrder: (order: DocumentSortOrder) => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  selectedDocument: "",
  setSelectedDocument: (selectedDocument) => set({ selectedDocument }),

  checkedDocuments: [],
  toggleChecked: (id) =>
    set((s) => ({
      checkedDocuments: s.checkedDocuments.includes(id)
        ? s.checkedDocuments.filter((d) => d !== id)
        : [...s.checkedDocuments, id],
    })),
  setAllChecked: (ids) => set({ checkedDocuments: ids }),
  clearChecked: () => set({ checkedDocuments: [] }),

  pinnedDocuments: [],
  togglePinned: (id) =>
    set((s) => ({
      pinnedDocuments: s.pinnedDocuments.includes(id)
        ? s.pinnedDocuments.filter((d) => d !== id)
        : [...s.pinnedDocuments, id],
    })),

  sortOrder: "latest",
  setSortOrder: (sortOrder) => set({ sortOrder }),
}));
