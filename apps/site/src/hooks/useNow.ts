"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock, as external state.
 *
 * Deadlines decide which controls a market offers, so the clock cannot be read
 * during render — the same component would compute a different answer on a
 * re-render it did not ask for. Reading it through a subscription also makes
 * the interface correct on its own: the moment a market expires, the control to
 * close it appears, with no refresh.
 *
 * The snapshot is cached rather than computed on call, because React reads it
 * several times per render and would loop on a value that changes every time.
 */
let cached = Math.floor(Date.now() / 1000);

function subscribe(onChange: () => void) {
  const timer = setInterval(() => {
    const next = Math.floor(Date.now() / 1000);
    if (next !== cached) {
      cached = next;
      onChange();
    }
  }, 1000);
  return () => clearInterval(timer);
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => cached,
    () => 0,
  );
}
