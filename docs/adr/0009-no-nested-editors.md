# Lexical renders editable content, Svelte renders the rest

Anything a user types into is a Lexical element that Lexical renders: a callout body, a toggle's title and body, and a code block's caption. Svelte renders only Block Chrome (for example, the callout icon button, the toggle chevron, and the code toolbar) and atomic content (the separator, the table of contents, and Chips). Svelte components mount through mutation listeners and Svelte's `mount()`, not through `DecoratorNode.decorate()`. Lexical's documentation says `decorate()` could be deprecated.

The library uses no nested editors, that is, separate Lexical editors inside a node, even though Lexical ships a `NestedEditorExtension`. A nested editor has its own undo history, its own Yjs binding, and its own selection. Undo would skip it, and a selection could not span from it into the surrounding Blocks.

Each feature ships as a Headless Extension plus an optional UI Extension that depends on it. For example, `CalloutUI` adds the slash-menu item, the block-menu items, and the icon button, and registering it pulls in `Callout`.
