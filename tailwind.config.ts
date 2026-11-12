import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F6F3",
        panel: "#FFFFFF",
        ink: "#13233F",
        muted: "#5B6B7F",
        line: "#D8DED7",
        held: "#C58A12",
        earned: "#17845A",
        returned: "#3F6FB0",
        alert: "#B23A2E",
        wash: { held: "#FBF3E2", earned: "#E6F3EC", returned: "#E8EFF8", alert: "#F8E8E6" },
      },
      fontFamily: {
        sans: ["Archivo", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: { panel: "14px" },
    },
  },
  plugins: [],
};

export default config;
