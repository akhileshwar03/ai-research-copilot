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

  // sort
  sortOrder: DocumentSortOrder;
  setSortOrder: (order: DocumentSortOrder) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
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

  sortOrder: "latest",
  setSortOrder: (sortOrder) => set({ sortOrder }),
}));
