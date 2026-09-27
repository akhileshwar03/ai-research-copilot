import { create } from "zustand";

export type DocumentSortOrder = "latest" | "alpha";

/** A pending "scroll the PDF panel to this page" request, made by clicking a page citation in
 * a chat reply (see chat-message-list.tsx). `nonce` increments on every call, including a
 * repeat click on the same page — the PDF viewer's scroll effect keys off it so clicking the
 * same citation twice still re-scrolls even though `page` itself didn't change (e.g. the user
 * had since scrolled the panel away manually). */
interface PdfJumpRequest {
  documentId: string;
  page: number;
  nonce: number;
}

interface DocumentState {
  selectedDocument: string;
  setSelectedDocument: (id: string) => void;

  pdfJumpRequest: PdfJumpRequest | null;
  jumpToPage: (documentId: string, page: number) => void;

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

  pdfJumpRequest: null,
  // Also selects the document — a citation in a reply can name a document that isn't the one
  // currently open in the side panel (or no document may be open at all), and clicking it
  // should open/switch to the right one, not silently do nothing.
  jumpToPage: (documentId, page) =>
    set((s) => ({
      selectedDocument: documentId,
      pdfJumpRequest: { documentId, page, nonce: (s.pdfJumpRequest?.nonce ?? 0) + 1 },
    })),

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
