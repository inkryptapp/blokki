# Schema changes inside a Shared Document are additive only

A Snapshot can be migrated as JSON before Lexical parses it (ADR-0007). A Shared Document cannot, because peers edit it concurrently and each of them holds its own copy of the Yjs history. Within a Shared Document, a node type may therefore change only in additive ways: a new optional property with a default, or a new node type. A change that is not additive needs a Document Upgrade. The app exports a Snapshot, migrates it, and seeds a new Shared Document from it. Offline edits made to the old Shared Document do not carry over.

The Shared Document records its schema map in a metadata map. A client opens the document read-only and emits `upgrade-required` in either of these cases:

- Its code is older than a recorded Schema Version.
- It lacks an Extension that the document uses.

The client never applies an update it cannot represent. If a newer client raises a recorded Schema Version while older clients are connected, those older clients switch to read-only immediately.

## Consequences

- `@lexical/yjs` throws when it meets a node type that the editor has not registered. Supporting Unsupported Blocks inside a Shared Document needs a placeholder that leaves the unknown node's Yjs content untouched. If that turns out to be infeasible, a Shared Document that contains unknown Blocks opens read-only.
