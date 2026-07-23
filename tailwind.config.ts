import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // League of Legends color palette
        'lol-dark': '#0A1428',
        'lol-dark-light': '#0F1A2E',
        'lol-dark-lighter': '#1A2A42',
        'lol-gold': '#C8AA6E',
        'lol-gold-light': '#D4BC8A',
        'lol-gold-dark': '#A88A4E',
        'lol-teal': '#0AC8B9',
        'lol-teal-light': '#2DD9CC',
        'lol-teal-dark': '#08A89D',

        // Semantic colors
        primary: '#C8AA6E',
        secondary: '#0AC8B9',
        background: '#0A1428',
        surface: '#0F1A2E',
        'surface-light': '#1A2A42',

        // Status colors
        health: '#2EA64A',
        mana: '#2B7FBF',
        damage: '#E53935',
        experience: '#7B1FA2',
      },
      fontFamily: {
        beaufort: ['"Beaufort for LOL"', 'Georgia', 'serif'],
        system: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        lol: '0 0 20px rgba(200, 170, 110, 0.3)',
        'lol-lg': '0 0 40px rgba(200, 170, 110, 0.4)',
        teal: '0 0 20px rgba(10, 200, 185, 0.3)',
        'inner-dark': 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #C8AA6E 0%, #A88A4E 100%)',
        'gradient-teal': 'linear-gradient(135deg, #0AC8B9 0%, #08A89D 100%)',
        'gradient-dark': 'linear-gradient(180deg, #0F1A2E 0%, #0A1428 100%)',
        'gradient-radial':
          'radial-gradient(ellipse at center, rgba(200, 170, 110, 0.1) 0%, transparent 70%)',
      },
      animation: {
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
        glow: 'glow 1.5s ease-in-out infinite alternate',
      },
      keyframes: {
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(200, 170, 110, 0.5)' },
          '50%': { boxShadow: '0 0 20px rgba(200, 170, 110, 0.8)' },
        },
        glow: {
          from: { boxShadow: '0 0 10px rgba(10, 200, 185, 0.3)' },
          to: { boxShadow: '0 0 20px rgba(10, 200, 185, 0.6)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
