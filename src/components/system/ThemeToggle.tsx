'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useSyncExternalStore, type ComponentType } from 'react';

import { THEME_STORAGE_KEY, type ThemeChoice } from '@/components/system/ThemeScript';
import { cn } from '@/lib/utils';

/**
 * The theme control: one button that cycles light, dark and following the
 * system.
 *
 * A button rather than a menu, because there are three states with no
 * hierarchy between them and a menu would put the current one behind a click.
 * The state it is in is in its accessible name — "Theme: dark. Switch to
 * following the system." — as real text, not as an `aria-label` and not as a
 * sun or a moon that a screen reader cannot read and that a sighted viewer has
 * to learn. The icon is decorative.
 *
 * THERE IS NO REACT STATE HERE, and that is deliberate. The applied theme is
 * the `data-theme` attribute on `<html>`: `ThemeScript` writes it before the
 * first paint, this button writes it on a click, and `globals.css` reads it.
 * A `useState` mirror of it would be a second copy that can disagree with the
 * page — which is exactly the bug this control must not have, because its
 * whole job is to say which theme you are looking at. So the attribute is read
 * as an external store, and what the button claims is always what is applied.
 *
 * `localStorage` is written as well, for the next page load, but it is never
 * read here: if the write fails — a private window with site data blocked —
 * the theme still changed and the label still tells the truth about it.
 */

const ORDER = ['light', 'dark', 'system'] as const satisfies readonly ThemeChoice[];

const ICONS: Record<ThemeChoice, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Lets the two mounted instances — the header and the mobile panel — stay in
 * step. They are never visible at the same time, but they are both mounted at
 * all times, so without this the hidden one carries a stale accessible name
 * until the next navigation and is wrong the moment the viewport crosses the
 * breakpoint. It is also what makes the external store above re-read.
 */
const CHANGE_EVENT = 'frame:themechange';

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHANGE_EVENT, onStoreChange);
}

/** What is applied right now, read from the element that applies it. */
function readAppliedChoice(): ThemeChoice {
  const applied = document.documentElement.getAttribute('data-theme');
  if (applied === 'light' || applied === 'dark') return applied;
  // No attribute means the system preference is in charge, which is what the
  // "system" choice is.
  return 'system';
}

/**
 * The snapshot React uses while rendering on the server and while hydrating.
 * The stored choice is not knowable in either, so this is a fourth value
 * rather than a guess: until the store has been read, the button is labelled
 * with the plain word "Theme", which is true in every state. The theme itself
 * is already correct at that point — `ThemeScript` set the attribute before
 * the first paint — so what settles after hydration is the label and the icon,
 * not the colours.
 */
function readUnknownChoice(): 'unknown' {
  return 'unknown';
}

function nextChoice(current: ThemeChoice): ThemeChoice {
  const index = ORDER.indexOf(current);
  return ORDER[(index + 1) % ORDER.length] ?? 'light';
}

/**
 * The `theme-color` metas come from the `viewport` export in the root layout:
 * one per system preference, so a viewer who has made no choice gets browser
 * chrome that matches without any script. An explicit choice has to override
 * both of them, because the browser picks the first whose media query matches
 * and we cannot know which that is.
 *
 * The replacement colour is read back out of the document rather than written
 * here as a hex. `--color-paper` has already resolved to the active theme's
 * value by this point, so the chrome cannot drift from the page the way a
 * second copy of the palette in this file would.
 */
let originalThemeColors: readonly string[] | null = null;

function syncBrowserChrome(choice: ThemeChoice) {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  if (metas.length === 0) return;

  // Snapshot before the first override, so returning to "system" restores the
  // media-scoped pair exactly instead of guessing at it.
  if (originalThemeColors === null) originalThemeColors = metas.map((meta) => meta.content);

  if (choice === 'system') {
    const original = originalThemeColors;
    metas.forEach((meta, index) => {
      const value = original[index];
      if (value !== undefined) meta.content = value;
    });
    return;
  }

  const paper = getComputedStyle(document.documentElement).getPropertyValue('--color-paper').trim();
  if (!paper) return;
  for (const meta of metas) meta.content = paper;
}

function applyChoice(choice: ThemeChoice) {
  const root = document.documentElement;

  // "system" is the absence of the attribute, which hands the decision back to
  // the `prefers-color-scheme` block in globals.css.
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  syncBrowserChrome(choice);

  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The theme still changed for this page; it just will not survive a
    // reload. Saying nothing is right — there is no action for the viewer to
    // take, and a toast about storage permissions on a theme switch is noise.
  }

  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('theme');
  // The type argument is required rather than decorative: without it the
  // snapshot type is inferred from `readAppliedChoice` alone and the server
  // snapshot's fourth value does not fit it.
  const choice = useSyncExternalStore<ThemeChoice | 'unknown'>(
    subscribe,
    readAppliedChoice,
    readUnknownChoice,
  );

  useEffect(() => {
    // `ThemeScript` sets the attribute but deliberately does not touch the
    // metas — it has to stay small enough to sit in front of the first paint —
    // so a load with a stored choice arrives with browser chrome still
    // following the system. This is the first moment that can be corrected,
    // and it updates the document rather than any React state.
    syncBrowserChrome(readAppliedChoice());
  }, []);

  const cycle = useCallback(() => {
    applyChoice(nextChoice(readAppliedChoice()));
  }, []);

  const Icon = ICONS[choice === 'unknown' ? 'system' : choice];

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-pill border border-line bg-surface',
        // The project's reduced-motion rule in globals.css already neutralises
        // every transition; `motion-safe` says so at the point of use too.
        'text-ink-soft motion-safe:transition-colors motion-safe:duration-150',
        'hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      <Icon className="size-4.5" aria-hidden />
      {/*
        The accessible name, as text rather than as an `aria-label`, so the
        state is inside one translated message and so a translation tool sees
        it. `sr-only` and not `hidden`: the icon carries the meaning visually
        and this carries it to everything else.
      */}
      <span className="sr-only">{choice === 'unknown' ? t('label') : t('toggle', { choice })}</span>
    </button>
  );
}
