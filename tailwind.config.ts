import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Warm tinted neutrals — never #000 / #fff
        base: "rgb(var(--base) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-strong": "rgb(var(--muted-strong) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "14px",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        fast: "140ms",
        base: "180ms",
        slow: "260ms",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "ribbon-fade": {
          "0%, 100%": { opacity: "1", transform: "translateY(0)" },
          "45%": { opacity: "0", transform: "translateY(-3px)" },
          "55%": { opacity: "0", transform: "translateY(3px)" },
        },
        "cta-pulse": {
          "0%, 100%": {
            boxShadow:
              "inset 0 1px 0 0 rgb(255 255 255 / 0.55), inset 0 -1px 0 0 rgb(0 0 0 / 0.18), 0 1px 0 0 rgb(0 0 0 / 0.4), 0 6px 18px -8px rgb(196 240 66 / 0.45)",
          },
          "50%": {
            boxShadow:
              "inset 0 1px 0 0 rgb(255 255 255 / 0.6), inset 0 -1px 0 0 rgb(0 0 0 / 0.18), 0 1px 0 0 rgb(0 0 0 / 0.4), 0 10px 32px -8px rgb(196 240 66 / 0.7)",
          },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        "fade-in-up":
          "fade-in-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "slide-up":
          "slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "ribbon-fade":
          "ribbon-fade 4.2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "cta-pulse": "cta-pulse 2.4s ease-in-out infinite",
      },
      boxShadow: {
        "inset-hi": "inset 0 1px 0 0 rgb(255 255 255 / 0.06)",
        "inset-hi-strong": "inset 0 1px 0 0 rgb(255 255 255 / 0.1)",
        soft: "0 1px 0 0 rgb(0 0 0 / 0.4), 0 8px 24px -12px rgb(0 0 0 / 0.6)",
        "accent-glow":
          "0 0 0 1px rgb(var(--accent) / 0.5), 0 0 32px -6px rgb(var(--accent) / 0.4)",
      },
    },
  },
  plugins: [],
} satisfies Config;
