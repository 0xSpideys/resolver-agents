"use client";

import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "verdict-theme";

/**
 * Applies the stored choice before the first paint.
 *
 * Without this the page renders in the system theme for one frame and then
 * snaps to the pinned one, which is worse than having no toggle at all. It runs
 * inline in <head>, so it cannot import anything and has to be defensive: a
 * private window throws on localStorage rather than returning null.
 */
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem(${JSON.stringify(KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/**
 * The stored choice is external state, so it is read through the hook meant for
 * external state rather than copied into React state on mount. That also gets
 * cross-tab sync for free: a change in one tab moves the toggle in the others.
 */
const CHANGED = "verdict-theme-change";

function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "system", label: "System", icon: <Auto /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
];

export function ThemeToggle() {
  // The server has no idea what was stored, so it renders "system"; the client
  // corrects it on hydration without a flash, because ThemeScript already set
  // the attribute before paint.
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  function choose(next: Theme) {
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked. The choice still applies to this page view.
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5"
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => choose(o.value)}
            className={`flex size-7 items-center justify-center rounded-md transition-colors ${
              active ? "bg-sunk text-fg" : "text-dim hover:text-mid"
            }`}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

/* Icons are drawn rather than imported: three glyphs is not a dependency. */

function Sun() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="8" cy="8" r="3" />
      <path strokeLinecap="round" d="M8 1.5v1.2M8 13.3v1.2M14.5 8h-1.2M2.7 8H1.5M12.6 3.4l-.85.85M4.25 11.75l-.85.85M12.6 12.6l-.85-.85M4.25 4.25l-.85-.85" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path strokeLinejoin="round" d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />
    </svg>
  );
}

function Auto() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="1.8" y="3" width="12.4" height="8.4" rx="1.4" />
      <path strokeLinecap="round" d="M5.6 13.6h4.8" />
    </svg>
  );
}
