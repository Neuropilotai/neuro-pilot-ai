import { create } from 'zustand';

export const useThemeStore = create((set) => ({
  theme: 'dark', // default to dark theme

  initialize: () => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');

    set({ theme });
    applyTheme(theme);
  },

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      applyTheme(newTheme);
      return { theme: newTheme };
    });
  },

  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
    set({ theme });
  },
}));

function applyTheme(theme) {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
}
