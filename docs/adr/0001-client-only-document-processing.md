# All document processing runs on the client

The library never depends on a server that can read document content. Markdown and HTML conversion, Snapshot migration, and Snapshot export all run in the browser. They are written as pure functions, so they also run in Node for tests and tooling, but no feature requires them to run on a server.

Apps built on this library may encrypt documents end to end or edit them offline. In both cases the server only stores bytes it cannot parse. A server-side feature, such as rendering a document to HTML during SSR or seeding a Shared Document from JSON on the server, would rule those apps out.

## Consequences

- SSR renders an empty Editor shell. Lexical, Yjs, and all DOM code load in the browser on mount. No module may run side effects at import time.
- A read-only renderer for public pages can be added later. If it needs a server, the app opts in to it.
