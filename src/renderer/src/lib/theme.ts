/**
 * Applies the selected theme by toggling the `dark` class on <html>.
 * Tailwind's darkMode:'class' reads this class to enable dark variants.
 */
export type Theme = 'dark' | 'light' | 'system'

export function applyTheme(theme: Theme): void {
  const root  = document.documentElement
  const query = window.matchMedia('(prefers-color-scheme: dark)')

  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system — follow OS
    root.classList.toggle('dark', query.matches)
  }
}

/** Listen for OS preference changes when theme is 'system'. Returns cleanup fn. */
export function watchSystemTheme(cb: (isDark: boolean) => void): () => void {
  const query   = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => cb(e.matches)
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}
