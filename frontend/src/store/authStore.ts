import { create } from "zustand";
import { authAPI, getErrorMessage, type User } from "@/lib/api";
import Cookies from "js-cookie";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  register: (
    email: string,
    password: string,
    full_name: string
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authAPI.login(email, password);
      if (response.access_token) {
        Cookies.set("access_token", response.access_token, {
          expires: 7,
          sameSite: "lax",
        });
      }
      set({
        user: response.user,
        token: response.access_token,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (error) {
      set({ isLoading: false, error: getErrorMessage(error) });
      return false;
    }
  },

  register: async (email, password, full_name) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authAPI.register(email, password, full_name);
      if (response.access_token) {
        Cookies.set("access_token", response.access_token, {
          expires: 7,
          sameSite: "lax",
        });
      }
      set({
        user: response.user,
        token: response.access_token,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (error) {
      set({ isLoading: false, error: getErrorMessage(error) });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authAPI.logout();
    } finally {
      Cookies.remove("access_token");
      set({ user: null, token: null, isLoading: false, error: null });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const user = await authAPI.me();
      const token = Cookies.get("access_token") ?? null;
      set({
        user,
        token,
        isLoading: false,
        isInitialized: true,
        error: null,
      });
    } catch {
      Cookies.remove("access_token");
      set({
        user: null,
        token: null,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
