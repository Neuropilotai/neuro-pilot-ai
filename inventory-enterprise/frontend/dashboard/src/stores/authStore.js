import { create } from 'zustand';
import { api } from '../services/api';
import { websocket } from '../services/websocket';

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  requires2FA: false,
  tempUserId: null,

  initialize: () => {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true });

        // Connect WebSocket (disabled until WebSocket server is configured)
        // websocket.connect();
      } catch (error) {
        console.error('Failed to parse user data:', error);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
      }
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await api.login(email, password);

      if (data.requires2FA) {
        set({
          requires2FA: true,
          tempUserId: data.userId,
          isLoading: false,
        });
        return { requires2FA: true };
      }

      set({
        user: data.user,
        token: data.accessToken,
        isAuthenticated: true,
        isLoading: false,
        requires2FA: false,
        tempUserId: null,
      });

      // Connect WebSocket (disabled until WebSocket server is configured)
      // websocket.connect();

      return { success: true };
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  verify2FA: async (code) => {
    set({ isLoading: true });
    try {
      const { tempUserId } = get();
      const data = await api.verify2FA(tempUserId, code);

      set({
        user: data.user,
        token: data.accessToken,
        isAuthenticated: true,
        isLoading: false,
        requires2FA: false,
        tempUserId: null,
      });

      // Connect WebSocket (disabled until WebSocket server is configured)
      // websocket.connect();

      return { success: true };
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await api.logout();
    websocket.disconnect();

    set({
      user: null,
      token: null,
      isAuthenticated: false,
      requires2FA: false,
      tempUserId: null,
    });
  },

  updateUser: (updates) => {
    const currentUser = get().user;
    const updatedUser = { ...currentUser, ...updates };
    set({ user: updatedUser });
    localStorage.setItem('user', JSON.stringify(updatedUser));
  },
}));
