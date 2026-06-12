"use client";

import { useTheme, type Theme } from "../../lib/theme";

export function ThemeChip() {
  const { theme, setTheme } = useTheme();
  const opts: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun /> },
    { value: "dark", label: "Dark", icon: <Moon /> },
    { value: "system", label: "Auto", icon: <Monitor /> },
  ];
  return (
    <div className="flex gap-0.5 rounded-full border border-line bg-surface/80 p-0.5 shadow-card backdrop-blur">
      {opts.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            aria-pressed={active}
            aria-label={o.label}
            title={o.label}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
              active ? "bg-ink text-canvas" : "text-ink-soft hover:text-ink"
            }`}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

function Sun() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
  );
}
function Moon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  );
}
function Monitor() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  );
}
