/**
 * TypeScript 6 enables `noUncheckedSideEffectImports`, and Next.js only ships a
 * declaration for `*.module.css`. Without this, the global stylesheet import in
 * `src/app/layout.tsx` fails the typecheck with TS2882.
 */
declare module '*.css';
