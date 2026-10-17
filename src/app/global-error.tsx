'use client';

import type { CSSProperties } from 'react';

import { ThemeScript } from '@/components/system/ThemeScript';
import { SITE } from '@/lib/config';

/**
 * The last fallback.
 *
 * This replaces the root layout, so nothing it normally provides is available:
 * no stylesheet, no fonts, no header, no toast region. Everything here is
 * therefore self-contained, including the colours — they are the same token
 * values as `globals.css`, repeated deliberately rather than imported, because
 * the whole point of this file is to render when the rest of the application
 * does not. Keep it boring and keep it dependency-free.
 *
 * That includes the language. This boundary replaces the locale layout, so
 * there is no active locale to read and no message catalogue to read it from —
 * reaching for either would mean this file could fail for the same reason the
 * page did. It is therefore English, `lang` says so honestly rather than
 * claiming a language it has not rendered, and the page says so to the reader
 * as well, because a Thai reader who lands here is owed an explanation for why
 * the words changed.
 *
 * THE THEME. The rest of the application themes itself by redefining tokens in
 * `globals.css`, which is not loaded here. React inline styles cannot hold a
 * media query, and picking one set of colours legible on both a light and a
 * dark ground means a mid-grey page, which looks like a third kind of failure.
 * So the tokens are declared in one small inline `<style>` with the same two
 * switches `globals.css` uses — the system preference, and an explicit choice
 * on `data-theme` — and the inline styles below read them through `var()`.
 *
 * `ThemeScript` is imported, and it is the one dependency this file accepts.
 * It has no imports of its own and returns a `<script>` tag containing a
 * string constant, so it cannot fail for the reason the page did; what it buys
 * is that a reader who chose dark is not flashed a white page at the moment
 * something has already gone wrong.
 */

const THEME_CSS = `
:root {
  color-scheme: light;
  --ge-paper: #f8f8f5;
  --ge-surface: #ffffff;
  --ge-ink: #171815;
  --ge-on-ink: #f8f8f2;
  --ge-muted: #777970;
  --ge-line: #e8e8e2;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ge-paper: #141610;
    --ge-surface: #1c1e17;
    --ge-ink: #f2f2ea;
    --ge-on-ink: #141610;
    --ge-muted: #949689;
    --ge-line: #32352b;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ge-paper: #141610;
  --ge-surface: #1c1e17;
  --ge-ink: #f2f2ea;
  --ge-on-ink: #141610;
  --ge-muted: #949689;
  --ge-line: #32352b;
}
`;

const body: CSSProperties = {
  margin: 0,
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  backgroundColor: 'var(--ge-paper)',
  color: 'var(--ge-ink)',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  letterSpacing: '-0.025em',
};

const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--ge-muted)',
};

const heading: CSSProperties = {
  margin: '14px 0 0',
  fontSize: '34px',
  lineHeight: 1.05,
  letterSpacing: '-0.06em',
  fontWeight: 780,
};

const paragraph: CSSProperties = {
  margin: '16px 0 0',
  fontSize: '14px',
  lineHeight: 1.7,
  color: 'var(--ge-muted)',
};

const actions: CSSProperties = {
  margin: '28px 0 0',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  alignItems: 'center',
};

// The filled control is painted with the ink colour, so its label is the
// "on ink" value — which flips with the theme exactly as it does in the rest
// of the application: a dark pill with light text, or a light pill with dark
// text. Taking the label from the paper colour instead would have made it
// invisible in the dark theme.
const primary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  border: 0,
  borderRadius: '999px',
  padding: '12px 18px',
  fontSize: '12px',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  backgroundColor: 'var(--ge-ink)',
  color: 'var(--ge-on-ink)',
};

const secondary: CSSProperties = {
  ...primary,
  backgroundColor: 'var(--ge-surface)',
  color: 'var(--ge-ink)',
  border: '1px solid var(--ge-line)',
  textDecoration: 'none',
};

const reference: CSSProperties = {
  margin: '24px 0 0',
  paddingTop: '16px',
  borderTop: '1px solid var(--ge-line)',
  fontSize: '11px',
  color: 'var(--ge-muted)',
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang={SITE.locale} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
        <ThemeScript />
      </head>
      <body style={body}>
        <main style={{ maxWidth: '34rem' }}>
          <p style={eyebrow}>{SITE.name}</p>
          <h1 style={heading}>Something failed before the page could be built.</h1>
          <p style={paragraph}>
            The error happened outside every page, so none of the usual interface loaded with it.
            Nothing was saved or changed. Reloading is worth trying once; if it keeps happening the
            server log will hold the reference below.
          </p>
          <p style={paragraph}>
            This page is in English whichever language you were reading: it renders without the
            translations, because loading them is one of the things that can fail here.
          </p>

          <div style={actions}>
            <button type="button" onClick={reset} style={primary}>
              Try again
            </button>
            {/* A full document load on purpose, not a client transition. This
                boundary replaces the root layout, so the React tree it would
                navigate within is the broken one; reloading the document is
                what actually clears the failed state. next/link is therefore
                the wrong tool here rather than the missing one. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={secondary}>
              Back to the homepage
            </a>
          </div>

          {error.digest ? (
            <p style={reference}>
              Reference <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
