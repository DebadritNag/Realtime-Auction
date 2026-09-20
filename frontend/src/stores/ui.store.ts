import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export interface UIState {
  isTeamQuickViewOpen: boolean;
  selectedTeamId: string | null;
  isMobilePlayerDrawerOpen: boolean;
  isMobileTeamDrawerOpen: boolean;
  isMobileAIDrawerOpen: boolean;
  isCustomBidModalOpen: boolean;
  isHostSettingsModalOpen: boolean;
}

export interface UIActions {
  openTeamQuickView: (teamId: string) => void;
  closeTeamQuickView: () => void;
  setMobilePlayerDrawer: (open: boolean) => void;
  setMobileTeamDrawer: (open: boolean) => void;
  setMobileAIDrawer: (open: boolean) => void;
  setCustomBidModal: (open: boolean) => void;
  setHostSettingsModal: (open: boolean) => void;
}

export type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>()(
  subscribeWithSelector((set) => ({
    isTeamQuickViewOpen: false,
    selectedTeamId: null,
    isMobilePlayerDrawerOpen: false,
    isMobileTeamDrawerOpen: false,
    isMobileAIDrawerOpen: false,
    isCustomBidModalOpen: false,
    isHostSettingsModalOpen: false,

    openTeamQuickView: (teamId) =>
      set({ isTeamQuickViewOpen: true, selectedTeamId: teamId }),
    closeTeamQuickView: () =>
      set({ isTeamQuickViewOpen: false, selectedTeamId: null }),
    setMobilePlayerDrawer: (open) => set({ isMobilePlayerDrawerOpen: open }),
    setMobileTeamDrawer: (open) => set({ isMobileTeamDrawerOpen: open }),
    setMobileAIDrawer: (open) => set({ isMobileAIDrawerOpen: open }),
    setCustomBidModal: (open) => set({ isCustomBidModalOpen: open }),
    setHostSettingsModal: (open) => set({ isHostSettingsModalOpen: open }),
  }))
);
