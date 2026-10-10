# Lexical extensions are the only kind of Extension

Every Extension is a Lexical extension created with `defineExtension` from `@lexical/extension`. The library has no wrapper type of its own, such as a TipTap-style `Extension.create()`. UI contributions are declared in the extension's `config` or returned from its `build` output, and Svelte components read them from there. Examples are slash-menu items, block-menu items, toolbar buttons, and Block Chrome.

With one unit, the library has one dependency graph, one lifecycle, and one disposal path. A third party can mix in any Lexical extension without an adapter.

## Considered options

- **A custom wrapper type that compiles to a Lexical extension plus UI metadata.** Developers who know TipTap find it familiar. It also creates a second registry that has to mirror Lexical's dependency resolution and stay in step with every Lexical release.

## Consequences

- Lexical is still 0.x and ships breaking changes in minor releases. The library pins Lexical and upgrades it deliberately.
