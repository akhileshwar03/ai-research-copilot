import { create } from "zustand";

export type DocumentSortOrder = "latest" | "alpha";
export type DocumentsLayout = "list" | "grid";

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

  // Bulk-delete selection ONLY — this has nothing to do with which document(s) a chat can see.
  // That's a real, separate piece of state owned by chat-header.tsx's "Sources for this chat"
  // picker, and conflating the two (a per-row checkbox that looked like it also drove a "compare"
  // action, when toggling it did nothing to any chat's scope) was a genuine, confirmed source of
  // user confusion, fixed 2026-09-28 by making `selectMode` opt-in via the documents panel's own
  // "⋮" menu instead of always showing these checkboxes.
  checkedDocuments: string[];
  toggleChecked: (id: string) => void;
  setAllChecked: (ids: string[]) => void;
  clearChecked: () => void;

  // Whether bulk-select checkboxes are currently shown at all (see checkedDocuments' comment).
  // Turning this off also clears any in-progress selection, so re-entering select mode always
  // starts clean rather than resuming a stale selection from a previous visit.
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;

  // sort
  sortOrder: DocumentSortOrder;
  setSortOrder: (order: DocumentSortOrder) => void;

  // list vs. horizontally-scrolling grid presentation of the documents panel
  layout: DocumentsLayout;
  setLayout: (layout: DocumentsLayout) => void;
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

  selectMode: false,
  setSelectMode: (selectMode) => set({ selectMode, checkedDocuments: [] }),

  sortOrder: "latest",
  setSortOrder: (sortOrder) => set({ sortOrder }),

  layout: "list",
  setLayout: (layout) => set({ layout }),
}));
