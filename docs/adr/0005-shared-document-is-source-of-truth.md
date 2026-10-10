# The Shared Document is the source of truth when collaborating

When collaboration is on, the Shared Document is the source of truth, and the app persists Yjs updates through its own provider. A Snapshot is derived from the Shared Document for export, search, and backup. The library never rebuilds a Shared Document from a Snapshot. When collaboration is off, the Snapshot is the source of truth.

A new Shared Document gets its content through Seeding. The client that creates the document seeds it once, by calling a headless function, before anyone else joins. Clients never seed automatically on connect.

## Considered options

- **Seed on connect when the Shared Document is empty.** This is the default of Lexical's React collaboration plugin. If two clients connect to an empty document at the same time, both seed it and the content appears twice.
- **Seed on the server.** This is Lexical's recommended fix. It conflicts with ADR-0001, because the server cannot read document content.

## Consequences

- An app that stores only Snapshots and rebuilds the Shared Document every session is unsupported. Two clients that edit offline from the same Snapshot create separate Yjs histories, and merging them duplicates content.
