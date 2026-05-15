/** @type {import('tailwindcss').Config} */
// Every value below resolves to a CSS variable defined in src/styles/tokens.css.
// Rule 4: no hardcoded colors or design-system spacing values in components —
// utilities like `bg-canvas`, `text-text-primary`, `bg-status-online`
// all map back to the three theme blocks in tokens.css.
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Canvas / surface
        canvas: "var(--canvas)",
        "canvas-raised": "var(--canvas-raised)",
        "canvas-overlay": "var(--canvas-overlay)",
        "canvas-deep": "var(--canvas-deep)",
        surface: "var(--surface)",
        "surface-hover": "var(--surface-hover)",
        "surface-active": "var(--surface-active)",
        "surface-input": "var(--surface-input)",

        // Ink + borders
        ink: "var(--ink)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        "border-focus": "var(--border-focus)",
        grid: "var(--grid)",

        // Text
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        "text-disabled": "var(--text-disabled)",
        "text-inverse": "var(--text-inverse)",

        // Accent
        accent: {
          DEFAULT: "var(--accent)",
          bright: "var(--accent-bright)",
          hover: "var(--accent-hover)",
          active: "var(--accent-active)",
          subtle: "var(--accent-subtle)",
          text: "var(--accent-text)",
          "on-accent": "var(--accent-on-accent)",
          glow: "var(--accent-glow)",
        },

        // Status
        "status-online": "var(--status-online)",
        "status-online-glow": "var(--status-online-glow)",
        "status-online-subtle": "var(--status-online-subtle)",
        "status-warning": "var(--status-warning)",
        "status-warning-subtle": "var(--status-warning-subtle)",
        "status-critical": "var(--status-critical)",
        "status-critical-glow": "var(--status-critical-glow)",
        "status-critical-subtle": "var(--status-critical-subtle)",
        "status-offline": "var(--status-offline)",
        "status-offline-subtle": "var(--status-offline-subtle)",

        // Server color-coding
        "server-1": "var(--server-1)",
        "server-2": "var(--server-2)",
        "server-3": "var(--server-3)",

        // Video chrome
        "video-chrome-bg": "var(--video-chrome-bg)",
        "video-chrome-text": "var(--video-chrome-text)",
        "video-chrome-text-muted": "var(--video-chrome-text-muted)",
        "video-chrome-border": "var(--video-chrome-border)",
        "video-online-dot": "var(--video-online-dot)",
        "video-offline-dot": "var(--video-offline-dot)",
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },

      borderRadius: {
        DEFAULT: "4px",
        card: "6px",
      },

      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },

      backgroundColor: {
        backdrop: "var(--backdrop)",
      },

      // Expose the design-system keyframes as Tailwind animation utilities.
      // The actual @keyframes live in animations.css so the names exist
      // globally (not just where Tailwind processes).
      animation: {
        "brand-pulse": "brand-pulse 3s ease-in-out infinite",
        "live-breathe": "live-breathe 1.8s ease-in-out infinite",
        spin: "spin 700ms linear infinite",
        "critical-pulse": "critical-pulse 1.5s ease-in-out infinite",
        "alert-shadow": "alert-shadow 1.4s ease-in-out infinite",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
