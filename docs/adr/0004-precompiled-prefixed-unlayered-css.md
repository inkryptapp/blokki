# Styles ship as one precompiled, prefixed, unlayered CSS file

The package ships a single CSS file. Tailwind CSS v4 compiles it at build time with a class prefix and without Preflight. A build step removes Tailwind's `@layer` wrappers, so the rules ship unlayered. An app that wants the rules in a cascade layer imports the file with `@import "<package>/styles.css" layer(editor)`.

Theme tokens are defined on the Editor root and on the portal container for popovers, as `--<prefix>-popover: var(--popover, <default>)`. An app that uses shadcn-svelte tokens gets matching colors automatically. Other apps get the defaults.

Vendored shadcn-svelte components get their classes prefixed by a one-time script, because shadcn-svelte has no prefix option.

## Considered options

- **Layered by default.** CSS outside any layer beats every layered rule, whatever its specificity. That includes Tailwind v3 output, normalize.css, and plain `button {}` rules, which would override the Editor's menus in apps that do not use Tailwind v4.
- **Require Tailwind v4 in the app and have it scan the package with `@source`.** This forces Tailwind v4 on every consumer. A missing `@source` line fails silently: the build passes and the components render unstyled.
- **Distribute the UI through the shadcn registry.** Consumers would copy the components into their app and lose npm upgrades.
