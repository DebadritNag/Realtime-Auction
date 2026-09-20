import { create } from 'zustand';
import type { User } from '@/types';
import {
  authService,
  mapUser,
  type SignInCredentials,
  type SignUpCredentials,
} from '@/services/auth.service';
import { getSupabase } from '@/lib/supabase';
import { useAuctionStore } from './auction.store';
import { useUIStore } from './ui.store';
import { webSocketService } from '@/services/websocket.service';

// Module-level flag so we only register the onAuthStateChange listener once
// across the lifetime of the browser tab — not once per component mount.
let listenerRegistered = false;

interface Store {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  notice: string | null;
  initializeAuth: () => Promise<void>;
  signIn: (c: SignInCredentials) => Promise<boolean>;
  signUp: (c: SignUpCredentials) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<Store>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isRestoring: true,
  error: null,
  notice: null,

  initializeAuth: async () => {
    // If listener is already registered, the onAuthStateChange callback will
    // keep the store current. We still need to ensure isRestoring is resolved
    // so that a router.refresh() after sign-in doesn't leave the guard stuck.
    if (listenerRegistered) {
      // If we already have a user in the store, auth is resolved — nothing to do.
      if (!get().isRestoring) return;
      // isRestoring is still true after a refresh — re-check the session
      // without re-registering the listener.
      try {
        const user = await authService.getSession();
        set({ user, isAuthenticated: !!user, isRestoring: false });
      } catch {
        set({ isRestoring: false });
      }
      return;
    }

    listenerRegistered = true;

    try {
      // Register the persistent auth state listener first so we never miss
      // a session event (e.g. SIGNED_IN arriving while getSession is in flight).
      getSupabase().auth.onAuthStateChange((event, session) => {
        if (
          event === 'SIGNED_OUT' ||
          (session && get().user && session.user.id !== get().user?.id)
        ) {
          useAuctionStore.getState().leaveAuction();
          useUIStore.setState(useUIStore.getInitialState());
        }
        set({
          user: session ? mapUser(session.user) : null,
          isAuthenticated: !!session,
          isRestoring: false,
        });
        if (event === 'TOKEN_REFRESHED') {
          setTimeout(() => webSocketService.refreshAuth(), 0);
        }
      });

      // Eagerly resolve the current session so the store is populated before
      // the first render completes — onAuthStateChange may fire slightly later.
      const user = await authService.getSession();
      set({ user, isAuthenticated: !!user, isRestoring: false });
    } catch (e) {
      set({
        isRestoring: false,
        error: e instanceof Error ? e.message : 'Could not restore your session.',
      });
    }
  },

  signIn: async (credentials) => {
    set({ isLoading: true, error: null, notice: null });
    try {
      const res = await authService.signIn(credentials);
      // Set store state immediately so the AppShell guard sees isAuthenticated=true
      // before router.replace fires on the next tick.
      set({ user: res.user, isAuthenticated: true, isLoading: false, isRestoring: false });
      return true;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Sign in failed.' });
      return false;
    }
  },

  signUp: async (credentials) => {
    set({ isLoading: true, error: null, notice: null });
    try {
      const res = await authService.signUp(credentials);
      set({
        user: res.user,
        isAuthenticated: !!res.user,
        isLoading: false,
        isRestoring: false,
        notice: res.needsConfirmation
          ? 'Check your email to confirm your account, then sign in.'
          : null,
      });
      return !!res.user;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Sign up failed.' });
      return false;
    }
  },

  signOut: async () => {
    useAuctionStore.getState().leaveAuction();
    useUIStore.setState(useUIStore.getInitialState());
    try {
      await authService.signOut();
      set({ user: null, isAuthenticated: false, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Sign out failed.' });
      throw e;
    }
  },

  clearError: () => set({ error: null, notice: null }),
  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));
