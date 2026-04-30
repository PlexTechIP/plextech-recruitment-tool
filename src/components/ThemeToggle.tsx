'use client'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const dark = stored !== 'light'
    setIsDark(dark)
    applyTheme(dark)
  }, [])

  function applyTheme(dark: boolean) {
    const el = document.documentElement
    el.setAttribute('data-theme', dark ? 'dark' : 'light')
    if (dark) {
      el.style.setProperty('--bg-base',        '#0a0a0f')
      el.style.setProperty('--bg-surface',     '#0f0f1a')
      el.style.setProperty('--bg-raised',      '#1a1a2e')
      el.style.setProperty('--bg-active',      '#252545')
      el.style.setProperty('--border',         '#1e2035')
      el.style.setProperty('--text-primary',   '#ededed')
      el.style.setProperty('--text-secondary', '#d1d5db')
      el.style.setProperty('--text-muted',     '#6b7280')
    } else {
      el.style.setProperty('--bg-base',        '#f7f6ff')
      el.style.setProperty('--bg-surface',     '#ffffff')
      el.style.setProperty('--bg-raised',      '#eeedf8')
      el.style.setProperty('--bg-active',      '#e2e0f0')
      el.style.setProperty('--border',         '#d8d5ee')
      el.style.setProperty('--text-primary',   '#18101e')
      el.style.setProperty('--text-secondary', '#374151')
      el.style.setProperty('--text-muted',     '#6b7280')
    }
  }

  function toggle() {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    applyTheme(next)
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--bg-active)] transition-colors"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}
