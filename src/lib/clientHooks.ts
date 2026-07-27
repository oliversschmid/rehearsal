"use client";
import { useSyncExternalStore } from "react";

/* ================================================================
   Small client-only hooks built on useSyncExternalStore.

   These replace the "setState inside an effect" idiom, which React
   flags (react-hooks/set-state-in-effect) because it renders once with
   the wrong value and then immediately re-renders with the right one.
   useSyncExternalStore gets the value right on the first client render.
   ================================================================ */

/** The subscribed value never changes, so nothing ever needs to notify. */
const subscribeNever = () => () => {};

/**
 * `false` while server-rendering and during hydration, `true` afterwards.
 * Gates portals and other browser-only rendering.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/**
 * Live `prefers-reduced-motion` setting. Reports `false` during SSR, then
 * the real value from the first client render onward.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}
