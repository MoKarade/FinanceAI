/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './store/**/*.{ts,tsx}',
    './mcp/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Tokens historiques (préservés — ne pas casser les composants existants)
        primary: '#10b981',
        secondary: '#8b5cf6',
        dark: '#0B0E14',
        surface: '#151922',
        surfaceHighlight: '#1E2330',
        border: 'rgba(255, 255, 255, 0.06)',

        // Phase A1 (2026-05): tokens sémantiques pour la refonte UI.
        // Adoptés progressivement par les nouvelles primitives + les pages refondues.
        // Les anciennes classes (`text-gray-400`, `bg-emerald-500/20`...) restent
        // valides pour ne pas casser les vues non encore migrées.
        success: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          bg: 'rgba(16, 185, 129, 0.10)',
          border: 'rgba(16, 185, 129, 0.30)',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          bg: 'rgba(245, 158, 11, 0.10)',
          border: 'rgba(245, 158, 11, 0.30)',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          bg: 'rgba(239, 68, 68, 0.10)',
          border: 'rgba(239, 68, 68, 0.30)',
        },
        info: {
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          bg: 'rgba(59, 130, 246, 0.10)',
          border: 'rgba(59, 130, 246, 0.30)',
        },
        // Grayscale clarifié (ink). Reprend slate mais nommé par usage.
        ink: {
          50:  '#f8fafc', // titre primaire (white-ish)
          100: '#e2e8f0', // titre secondaire
          200: '#cbd5e1', // text strong
          300: '#94a3b8', // body
          400: '#64748b', // meta
          500: '#475569', // disabled
        },
      },
      fontSize: {
        // Phase A1: scale typographique unifiée.
        // Remplace progressivement les text-[9px], text-[10px], text-xs, etc.
        'display':  ['2rem',     { lineHeight: '2.5rem',  fontWeight: '700' }], // titre de page
        'h1':       ['1.5rem',   { lineHeight: '2rem',    fontWeight: '700' }], // titre de section
        'h2':       ['1.125rem', { lineHeight: '1.5rem',  fontWeight: '600' }], // sous-section
        'kpi':      ['1.75rem',  { lineHeight: '2rem',    fontWeight: '800' }], // gros nombres
        'body':     ['0.875rem', { lineHeight: '1.375rem' }],                   // corps standard
        'meta':     ['0.75rem',  { lineHeight: '1rem',    fontWeight: '500' }], // métadonnées
        'tiny':     ['0.6875rem',{ lineHeight: '0.875rem',fontWeight: '600', letterSpacing: '0.05em' }], // labels UPPER
      },
      spacing: {
        'page':     '1.5rem',    // padding standard de page
        'section':  '2.5rem',    // espace vertical entre sections majeures
      },
      borderRadius: {
        'card': '1rem',          // coin standard des cards
        'pill': '9999px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-once': 'pulseOnce 1.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'collapse-down': 'collapseDown 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        blob: 'blob 15s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(15px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseOnce: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)' },
          '50%': { boxShadow: '0 0 0 8px rgba(16, 185, 129, 0.3)' },
        },
        collapseDown: {
          '0%': { maxHeight: '0', opacity: '0' },
          '100%': { maxHeight: '1000px', opacity: '1' },
        },
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -40px) scale(1.05)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.95)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
