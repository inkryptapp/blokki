# blokki

A Svelte 5 library for block-based rich-text editing, built on [Lexical](https://lexical.dev), with optional real-time collaboration.

blokki is in early development. Nothing is published to npm yet.

## Package entry points

| Import          | Contents                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `blokki`        | Svelte components and the Editor API.                                                               |
| `blokki/core`   | Headless document functions. They run in Node and import no Svelte code.                            |
| `blokki/collab` | Real-time collaboration through Yjs. Needs the optional peer dependencies `yjs` and `@lexical/yjs`. |

## Developing

Install dependencies with [pnpm](https://pnpm.io):

```sh
pnpm install
```

`pnpm install` runs the `prepare` script, which sets `core.hooksPath` to `.githooks`. The pre-commit hook in that directory runs lint-staged, which lints staged files with oxlint and formats them with oxfmt.

> [!NOTE]
> While `core.hooksPath` points at `.githooks`, Git ignores the hooks in `.git/hooks`. To keep a personal hook, call it from the matching script in `.githooks`.

| Command           | What it does                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`        | Starts the docs site and playground.                                                                                                                         |
| `pnpm lint`       | Lints TypeScript, JavaScript, and Svelte scripts with oxlint.                                                                                                |
| `pnpm format`     | Formats the repository with oxfmt.                                                                                                                           |
| `pnpm check`      | Type-checks with `svelte-check`.                                                                                                                             |
| `pnpm test:unit`  | Runs Vitest in Node and in a browser.                                                                                                                        |
| `pnpm test:e2e`   | Runs Playwright in Chromium, Firefox, and WebKit.                                                                                                            |
| `pnpm build`      | Builds the site and the package, then checks the package with publint.                                                                                       |
| `pnpm build:site` | Builds only the docs site into `build`.                                                                                                                      |
| `pnpm attw`       | Checks the package's type declarations with `@arethetypeswrong/cli`. The Svelte entry skips TypeScript's node16 check, which cannot resolve `.svelte` files. |
| `pnpm size`       | Checks the size budget of each entry point. Run `pnpm build` first.                                                                                          |

Record user-facing changes with `pnpm changeset`.

## Docs site

The SvelteKit app in `src/routes` is the docs site and playground. It is fully prerendered with `adapter-static`. Every push to `main` deploys it to GitHub Pages through `.github/workflows/pages.yml`, with `BASE_PATH` set to the repository name.

GitHub Pages must be enabled once in the repository settings: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

To build the site locally under the same base path, run `BASE_PATH=/blokki pnpm build:site`.

## License

[MIT](LICENSE)
