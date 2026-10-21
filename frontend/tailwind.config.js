/** @type {import('tailwindcss').Config} */
//
// SteadyPost design tokens — "warm-paper editorial enterprise" system,
// modelled on the Practical Roof EMS template (light, calm, refined).
//
// Colour language
//   canvas   #f7f6f3  warm paper page background
//   surface  #ffffff  sidebar / nav chrome
//   card     #ffffff  cards & panels (muted #faf9f7)
//   line     #e2dfda  borders (subtle #ece9e4)
//   ink      #1a1816 / #6b6560 / #9b9590  text scale
//   brand    forest green #2c5f4a (hover #234d3b, tint #e8f0ec, muted #d4e3da)
//
// Typography
//   serif "Instrument Serif"  display / page titles (400, -0.02em)
//   sans  "DM Sans"           UI & body
//   mono  "DM Mono"           labels, tags, numerals, metadata (uppercase)
//
// Radius 6 / 10 / 14 / 20. Shadows are warm-tinted and ultra-subtle.
// This theme is intentionally light-only: calm paper + forest green.
//
function withAlpha(variable) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic surface tokens
        canvas: withAlpha("--c-canvas"),
        surface: withAlpha("--c-surface"),
        card: withAlpha("--c-card"),
        "card-muted": withAlpha("--c-card-muted"),
        overlay: withAlpha("--c-overlay"),
        line: withAlpha("--c-line"),
        "line-subtle": withAlpha("--c-line-subtle"),
        "line-strong": withAlpha("--c-line-strong"),
        ink: withAlpha("--c-ink"),
        "ink-2": withAlpha("--c-ink-2"),
        "ink-3": withAlpha("--c-ink-3"),
        // Forest-green brand scale (primary #2c5f4a)
        brand: {
          50: "#e8f0ec",
          100: "#d4e3da",
          200: "#a9c4b5",
          300: "#7ba78e",
          400: "#527f68",
          500: "#2c5f4a",
          600: "#26503f",
          700: "#234d3b",
          800: "#1d4030",
          900: "#173325",
        },
        // AI accent: deep plum, quieter than the old violet gradient
        ai: {
          100: "#f3eef8",
          300: "#b9a3d4",
          500: "#6b4c8a",
          600: "#5a3f75",
          700: "#4c3563",
        },
        // Status tokens — tinted bg + saturated text, template style
        success: withAlpha("--c-success"),
        "success-bg": withAlpha("--c-success-bg"),
        warning: withAlpha("--c-warning"),
        "warning-bg": withAlpha("--c-warning-bg"),
        danger: withAlpha("--c-danger"),
        "danger-bg": withAlpha("--c-danger-bg"),
        info: withAlpha("--c-info"),
        "info-bg": withAlpha("--c-info-bg"),
        accent: withAlpha("--c-accent"),
        "accent-bg": withAlpha("--c-accent-bg"),
        social: {
          instagram: "#c13584",
          facebook: "#1877f2",
        },
      },
      fontFamily: {
        sans: [
          '"DM Sans"',
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        serif: ['"Instrument Serif"', "Georgia", '"Times New Roman"', "serif"],
        mono: [
          '"DM Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // Type scale — serif display for headings, sans for UI, mono for labels
        display: ["58px", { lineHeight: "62px", fontWeight: "400", letterSpacing: "-0.02em" }],
        h1: ["33px", { lineHeight: "40px", fontWeight: "400", letterSpacing: "-0.02em" }],
        h2: ["24px", { lineHeight: "31px", fontWeight: "400", letterSpacing: "-0.015em" }],
        h3: ["17px", { lineHeight: "24px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "22px", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "20px", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "18px", fontWeight: "500" }],
        micro: ["11px", { lineHeight: "16px", fontWeight: "500" }],
        label: ["10px", { lineHeight: "14px", fontWeight: "500", letterSpacing: "0.06em" }],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
      boxShadow: {
        // Warm-tinted, ultra-subtle elevation
        1: "0 1px 2px rgb(26 24 22 / 0.04)",
        2: "0 2px 8px -2px rgb(26 24 22 / 0.06), 0 4px 16px -4px rgb(26 24 22 / 0.05)",
        3: "0 12px 36px -12px rgb(26 24 22 / 0.16), 0 2px 8px -2px rgb(26 24 22 / 0.06)",
        modal: "0 24px 64px -16px rgb(26 24 22 / 0.28)",
        lift: "0 8px 20px -8px rgb(26 24 22 / 0.14), 0 2px 6px -2px rgb(26 24 22 / 0.06)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.98) translateY(4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        // Restrained micro-motion: 150–220ms ease-out, staggered entrances
        "fade-up": "fade-up 0.22s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "scale-in": "scale-in 0.18s cubic-bezier(0.4, 0, 0.2, 1) forwards",
      },
    },
  },
  plugins: [],
};
