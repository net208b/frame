'use client';

import { useSyncExternalStore } from 'react';

import { THEME_CHANGE_EVENT } from '@/components/system/ThemeScript';

/**
 * Which of the two themes is actually painted right now.
 *
 * `ThemeToggle` deals in a *choice* of three — light, dark, or following the
 * system — because that is what a viewer picks. This is the other question:
 * given that choice and the system preference behind it, which palette is on
 * screen? Only code that has to reproduce a colour outside CSS needs to ask,
 * which today means the map: its basemap and its pins are painted by WebGL from
 * literal colours, and a paper-coloured map inside the night theme reads as a
 * bug rather than as a map.
 *
 * It is read from the document for the same reason `ThemeToggle` reads its
 * choice from the document: `data-theme` on `<html>` is where the theme lives,
 * and a React copy of it is a second source of truth that can disagree with the
 * page. The answer therefore changes for two unrelated reasons, and both are
 * subscribed to — the attribute changing (somebody used the control), and the
 * system preference changing under a viewer who has not used the control.
 *
 * On the server, and while hydrating, it reports `light`. Nothing renders from
 * it: the map reads it inside an effect, after hydration, when the real value
 * is available. A component that rendered different markup from this would
 * need to handle the unknown state itself, the way the toggle does.
 */

export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(onStoreChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);

  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  media.addEventListener('change', onStoreChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    media.removeEventListener('change', onStoreChange);
  };
}

function readResolvedTheme(): ResolvedTheme {
  const applied = document.documentElement.getAttribute('data-theme');
  if (applied === 'light' || applied === 'dark') return applied;
  // No attribute means the `prefers-color-scheme` block in globals.css is in
  // charge, so the system preference is the answer.
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function readServerTheme(): ResolvedTheme {
  return 'light';
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, readResolvedTheme, readServerTheme);
}
