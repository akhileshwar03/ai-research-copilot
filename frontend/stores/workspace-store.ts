import { create } from "zustand";

interface WorkspaceState {
  sidebarReady: boolean;
  setSidebarReady: (ready: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  sidebarReady: false,
  setSidebarReady: (sidebarReady) => set({ sidebarReady }),
}));
