---
'blokki': minor
---

Add `createEditor` and the `<EditorContent>` component. `createEditor` only stores configuration, so it is safe to call during SSR. `<EditorContent>` builds the Lexical editor in the browser, renders an optional `skeleton` snippet on the server, and releases every listener and DOM node when it unmounts. Several Editors can share a page without sharing state. The package has three entry points: `blokki` for Svelte, `blokki/core` for headless code that runs in Node, and `blokki/collab` for collaboration.
