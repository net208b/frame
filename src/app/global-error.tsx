'use client';

import type { CSSProperties } from 'react';

import { SITE } from '@/lib/config';

/**
 * The last fallback.
 *
 * This replaces the root layout, so nothing it normally provides is available:
 * no stylesheet, no fonts, no header, no toast region. Everything here is
 * therefore inline and self-contained, including the colours — they are the
 * same token values as `globals.css`, repeated deliberately rather than
 * imported, because the whole point of this file is to render when the rest of
 * the application does not. Keep it boring and keep it dependency-free.
 */

const PAPER = '#f8f8f5';
const INK = '#171815';
const MUTED = '#777970';
const LINE = '#e8e8e2';

const body: CSSProperties = {
  margin: 0,
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  backgroundColor: PAPER,
  color: INK,
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
  color: MUTED,
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
  color: MUTED,
};

const actions: CSSProperties = {
  margin: '28px 0 0',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  alignItems: 'center',
};

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
  backgroundColor: INK,
  color: PAPER,
};

const secondary: CSSProperties = {
  ...primary,
  backgroundColor: '#ffffff',
  color: INK,
  border: `1px solid ${LINE}`,
  textDecoration: 'none',
};

const reference: CSSProperties = {
  margin: '24px 0 0',
  paddingTop: '16px',
  borderTop: `1px solid ${LINE}`,
  fontSize: '11px',
  color: MUTED,
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang={SITE.locale}>
      <body style={body}>
        <main style={{ maxWidth: '34rem' }}>
          <p style={eyebrow}>{SITE.name}</p>
          <h1 style={heading}>Something failed before the page could be built.</h1>
          <p style={paragraph}>
            The error happened outside every page, so none of the usual interface loaded with it.
            Nothing was saved or changed. Reloading is worth trying once; if it keeps happening the
            server log will hold the reference below.
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
