import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export interface UIState {
  isTeamQuickViewOpen: boolean;
  selectedTeamId: string | null;
  isTeamViewOpen: boolean;         // full Team View drawer
  teamViewTeamId: string | null;   // which team is shown (null = current user's team)
  isMobilePlayerDrawerOpen: boolean;
  isMobileTeamDrawerOpen: boolean;
  isMobileAIDrawerOpen: boolean;
  isCustomBidModalOpen: boolean;
  isHostSettingsModalOpen: boolean;
}

export interface UIActions {
  openTeamQuickView: (teamId: string) => void;
  closeTeamQuickView: () => void;
  openTeamView: (teamId?: string) => void;
  closeTeamView: () => void;
  setTeamViewTeam: (teamId: string) => void;
  setMobilePlayerDrawer: (open: boolean) => void;
  setMobileTeamDrawer: (open: boolean) => void;
  setMobileAIDrawer: (open: boolean) => void;
  setCustomBidModal: (open: boolean) => void;
  setHostSettingsModal: (open: boolean) => void;
  getInitialState: () => UIState;
}

export type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>()(
  subscribeWithSelector((set) => ({
    isTeamQuickViewOpen: false,
    selectedTeamId: null,
    isTeamViewOpen: false,
    teamViewTeamId: null,
    isMobilePlayerDrawerOpen: false,
    isMobileTeamDrawerOpen: false,
    isMobileAIDrawerOpen: false,
    isCustomBidModalOpen: false,
    isHostSettingsModalOpen: false,

    openTeamQuickView: (teamId) =>
      set({ isTeamQuickViewOpen: true, selectedTeamId: teamId }),
    closeTeamQuickView: () =>
      set({ isTeamQuickViewOpen: false, selectedTeamId: null }),
    openTeamView: (teamId) =>
      set({ isTeamViewOpen: true, teamViewTeamId: teamId ?? null }),
    closeTeamView: () =>
      set({ isTeamViewOpen: false, teamViewTeamId: null }),
    setTeamViewTeam: (teamId) =>
      set({ teamViewTeamId: teamId }),
    setMobilePlayerDrawer: (open) => set({ isMobilePlayerDrawerOpen: open }),
    setMobileTeamDrawer: (open) => set({ isMobileTeamDrawerOpen: open }),
    setMobileAIDrawer: (open) => set({ isMobileAIDrawerOpen: open }),
    setCustomBidModal: (open) => set({ isCustomBidModalOpen: open }),
    setHostSettingsModal: (open) => set({ isHostSettingsModalOpen: open }),
    getInitialState: () => ({
      isTeamQuickViewOpen: false,
      selectedTeamId: null,
      isTeamViewOpen: false,
      teamViewTeamId: null,
      isMobilePlayerDrawerOpen: false,
      isMobileTeamDrawerOpen: false,
      isMobileAIDrawerOpen: false,
      isCustomBidModalOpen: false,
      isHostSettingsModalOpen: false,
    }),
  }))
);
