# Snapshots carry per-Extension schema versions

A Snapshot wraps Lexical's serialized state with a schema map:

```json
{ "schema": { "core": 1, "callout": 1, "acme/kanban": 3 }, "root": {} }
```

Each Extension that defines node types declares a Schema Version. For every version bump it also provides a Migration, which is a pure JSON-to-JSON function. On import, the Editor runs all pending Migrations for each Extension before Lexical parses the document.

A single document-wide version cannot describe node types that third-party Extensions define, and only the Extension that owns a node type knows how to upgrade it. The library does not use Lexical's per-node `version` field. Lexical never acts on that field, and a Migration sometimes has to change several node types at once.

## Consequences

- A Snapshot with a newer Schema Version than the running code opens read-only with a typed error. The Editor never silently downgrades a Snapshot.
- A Block whose Extension is not enabled becomes an Unsupported Block: a read-only placeholder that is exported unchanged. An app that disables the Table Extension must not delete the tables in existing documents.
