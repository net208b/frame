/**
 * The one script that has to run before the first paint.
 *
 * The dark theme is two token blocks in `globals.css`: one behind
 * `@media (prefers-color-scheme: dark)`, one behind `:root[data-theme='dark']`.
 * The media query needs nothing from JavaScript — a viewer who has never
 * touched the control gets their system preference with the script disabled.
 * An explicit choice is different: it lives in `localStorage`, which the server
 * cannot read, so the `data-theme` attribute it implies is missing from the
 * HTML that arrives. Something has to put it on `<html>` between the document
 * arriving and the browser painting it, or every load of a page shows the
 * system theme for a frame and then snaps to the chosen one.
 *
 * WHY THIS IS NOT A COMPONENT, in the sense of something with state: there is
 * no point in the React lifecycle early enough. An effect runs after the first
 * paint, which is the flash. A layout effect runs after the first paint on the
 * server-rendered document too, because hydration happens after the document
 * is displayed. The only thing that runs before is a synchronous, parser-
 * blocking script in `<head>`, which is what this returns — a `<script>` tag
 * with a string in it, not a hook. The file is a component only so the layout
 * can place it in the markup; the code inside never re-renders, never reads
 * props and never participates in hydration.
 *
 * It is written to do nothing rather than to throw. `localStorage` is a
 * security error, not an empty value, in a private window with site data
 * blocked, and an exception in a head script stops the parser. So the whole
 * body is in a `try` and the failure case is "no attribute", which is exactly
 * the state that lets the media query decide.
 */

/** Shared with `ThemeToggle`, which is the only thing that writes it. */
export const THEME_STORAGE_KEY = 'frame-theme';

/**
 * What a viewer can choose. `system` is the absence of a choice, and is stored
 * as the absence of the key, so clearing site data returns them to it.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

// Minified by hand rather than by a build step, because it is inlined as a
// string: an attribute read, one comparison and a `setAttribute`. Anything
// longer than this does not belong in front of the first paint.
const SOURCE = `try{var c=localStorage.getItem("${THEME_STORAGE_KEY}");if(c==="light"||c==="dark"){document.documentElement.setAttribute("data-theme",c)}}catch(e){}`;

export function ThemeScript() {
  return (
    <script
      // The content is a constant defined in this file. It interpolates one
      // other constant from this file and nothing from a request, a cookie or
      // a database, which is what makes the raw injection safe here and what
      // has to stay true of any change to it.
      dangerouslySetInnerHTML={{ __html: SOURCE }}
    />
  );
}
