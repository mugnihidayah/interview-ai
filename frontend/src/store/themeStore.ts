import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  initTheme: () => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "dark",

  initTheme: () => {
    if (typeof window === "undefined") return;
    const isDark = document.documentElement.classList.contains("dark");
    set({ theme: isDark ? "dark" : "light" });
  },

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", newTheme === "dark");
      localStorage.setItem("theme", newTheme);
      return { theme: newTheme };
    });
  },
}));