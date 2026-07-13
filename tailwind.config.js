/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './contexts/**/*.{ts,tsx,js,jsx}',
    './hooks/**/*.{ts,tsx,js,jsx}',
    './lib/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-jakarta)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        script: ['var(--font-caveat)', 'cursive'],
      },
      colors: {
        border: 'hsl(var(--border, 32 28% 82%))',
        input: 'hsl(var(--input, 32 28% 82%))',
        ring: 'hsl(var(--ring, 19 70% 56%))',
        background: 'hsl(var(--background, 36 56% 92%))',
        foreground: 'hsl(var(--foreground, 22 30% 12%))',
        primary: {
          DEFAULT: 'hsl(var(--primary, 19 70% 56%))',
          foreground: 'hsl(var(--primary-foreground, 36 56% 96%))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary, 36 40% 86%))',
          foreground: 'hsl(var(--secondary-foreground, 22 30% 12%))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive, 4 76% 60%))',
          foreground: 'hsl(var(--destructive-foreground, 36 56% 96%))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted, 36 30% 88%))',
          foreground: 'hsl(var(--muted-foreground, 22 16% 38%))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent, 44 88% 62%))',
          foreground: 'hsl(var(--accent-foreground, 22 30% 12%))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover, 36 56% 96%))',
          foreground: 'hsl(var(--popover-foreground, 22 30% 12%))',
        },
        card: {
          DEFAULT: 'hsl(var(--card, 36 56% 96%))',
          foreground: 'hsl(var(--card-foreground, 22 30% 12%))',
        },

        espresso: {
          DEFAULT: '#2B1F18',
          50:  '#F7F1EA',
          100: '#E8DBCC',
          200: '#C9AE93',
          300: '#9B8068',
          400: '#6E5742',
          500: '#4A382A',
          600: '#3A2B20',
          700: '#2B1F18',
          800: '#1F1610',
          900: '#140E0A',
        },
        cream: {
          DEFAULT: '#F5E8D3',
          50:  '#FDFAF3',
          100: '#FAF1DD',
          200: '#F5E8D3',
          300: '#EBD8B4',
          400: '#DDC192',
          500: '#CCA76E',
        },
        terracotta: {
          DEFAULT: '#E97A3C',
          50:  '#FCF1E8',
          100: '#F8DCC4',
          200: '#F2B98A',
          300: '#ED965A',
          400: '#E97A3C',
          500: '#D8631F',
          600: '#B14E14',
          700: '#8A3D10',
        },
        mustard: {
          DEFAULT: '#F4C542',
          50:  '#FEF8E4',
          100: '#FBEDB0',
          200: '#F8DC72',
          300: '#F4C542',
          400: '#E8AE1F',
          500: '#C18C12',
        },
        forest: {
          DEFAULT: '#7A9B5C',
          50:  '#EEF4E7',
          100: '#D7E4C4',
          200: '#B5CC95',
          300: '#7A9B5C',
          400: '#5D7E42',
          500: '#3F5530',
          600: '#2C3C22',
        },
        coral: {
          DEFAULT: '#E85A4F',
          50:  '#FCEAE8',
          100: '#F8C8C3',
          200: '#F19A92',
          300: '#E85A4F',
          400: '#CC3F33',
        },
        ink: '#1A1410',
        chalk: '#F5E8D3',

        student: {
          50: '#FCF1E8', 100: '#F8DCC4', 200: '#F2B98A', 300: '#ED965A',
          400: '#E97A3C', 500: '#D8631F', 600: '#B14E14', 700: '#8A3D10',
          800: '#5C2A0B', 900: '#3D1C07',
        },
        teacher: {
          50: '#EEF4E7', 100: '#D7E4C4', 200: '#B5CC95', 300: '#7A9B5C',
          400: '#5D7E42', 500: '#3F5530', 600: '#2C3C22', 700: '#1F2918',
          800: '#141B0F', 900: '#0A0F08',
        },
        sponsor: {
          50: '#FEF8E4', 100: '#FBEDB0', 200: '#F8DC72', 300: '#F4C542',
          400: '#E8AE1F', 500: '#C18C12', 600: '#94680C', 700: '#6B4B08',
          800: '#473106', 900: '#251A03',
        },
      },
      borderRadius: {
        lg: 'var(--radius, 1.25rem)',
        md: 'calc(var(--radius, 1.25rem) - 4px)',
        sm: 'calc(var(--radius, 1.25rem) - 8px)',
        '2xl': '1.75rem',
        '3xl': '2.25rem',
        '4xl': '3rem',
      },
      boxShadow: {
        kid: '0 8px 28px -12px rgba(43, 31, 24, 0.18), 0 4px 10px -6px rgba(43, 31, 24, 0.10)',
        'kid-lg': '0 24px 60px -20px rgba(43, 31, 24, 0.28), 0 10px 24px -12px rgba(43, 31, 24, 0.14)',
        sticker: '6px 6px 0 0 rgba(43, 31, 24, 0.92)',
        'sticker-sm': '3px 3px 0 0 rgba(43, 31, 24, 0.85)',
        inset: 'inset 0 2px 6px -2px rgba(43, 31, 24, 0.15)',
      },
      backgroundImage: {
        'doodle-paper': "radial-gradient(circle at 25% 25%, rgba(43,31,24,0.05) 1px, transparent 1px), radial-gradient(circle at 75% 75%, rgba(43,31,24,0.03) 1px, transparent 1px)",
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.17 0 0 0 0 0.12 0 0 0 0 0.09 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      },
      backgroundSize: {
        'doodle-paper': '32px 32px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%':      { transform: 'rotate(2deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        'pop-in': {
          '0%':   { transform: 'scale(0.92)', opacity: '0' },
          '60%':  { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        'doodle-draw': {
          from: { strokeDashoffset: '200' },
          to:   { strokeDashoffset: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        wiggle:           'wiggle 2.4s ease-in-out infinite',
        float:            'float 4s ease-in-out infinite',
        'pop-in':         'pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'doodle-draw':    'doodle-draw 1.2s ease-out forwards',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
