---
'blokki': minor
---

Add Snapshots, the JSON format for saving a document. `editor.getSnapshot()` exports one, and the `content` option loads one. `blokki/core` exports `createHeadlessEditor`, `importSnapshot`, `exportSnapshot`, and `parseSnapshot` for Node. Extensions declare a Schema Version with `declareSchema`, and Migrations upgrade older Snapshots on import. A Snapshot from a newer Schema Version opens read-only and reports a `NewerSchemaVersionError` through `onUpgradeRequired`. Blocks whose Extension is not enabled show as read-only placeholders and are exported unchanged.
