import { useEffect } from 'react'

export function useTheme() {
    useEffect(() => {
        const updateTheme = () => {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
            if (isDark) {
                document.documentElement.classList.add('dark')
            } else {
                document.documentElement.classList.remove('dark')
            }
        }

        updateTheme()
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        mediaQuery.addEventListener('change', updateTheme)

        return () => mediaQuery.removeEventListener('change', updateTheme)
    }, [])
}
