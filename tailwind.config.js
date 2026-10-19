/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif']
      },
      colors: {
        md: {
          primary: 'rgb(var(--md-primary) / <alpha-value>)',
          onPrimary: 'rgb(var(--md-on-primary) / <alpha-value>)',
          secondary: 'rgb(var(--md-secondary) / <alpha-value>)',
          surface: 'rgb(var(--md-surface) / <alpha-value>)',
          surfaceContainer: 'rgb(var(--md-surface-container) / <alpha-value>)',
          surfaceContainerHigh: 'rgb(var(--md-surface-container-high) / <alpha-value>)',
          outline: 'rgb(var(--md-outline) / <alpha-value>)',
          text: 'rgb(var(--md-text) / <alpha-value>)',
          muted: 'rgb(var(--md-muted) / <alpha-value>)'
        }
      }
    }
  },
  plugins: []
};
