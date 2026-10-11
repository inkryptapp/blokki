# Schema changes inside a Shared Document are additive only

A Snapshot can be migrated as JSON before Lexical parses it (ADR-0007). A Shared Document cannot, because peers edit it concurrently and each of them holds its own copy of the Yjs history. Within a Shared Document, a node type may therefore change only in additive ways: a new optional property with a default, or a new node type. A change that is not additive needs a Document Upgrade. The app exports a Snapshot, migrates it, and seeds a new Shared Document from it. Offline edits made to the old Shared Document do not carry over.

The Shared Document records its Schema Versions in a metadata map, `blokki-schema`. The map holds one key per Schema Version that a client has written with, such as `acme/note@3`, and the recorded schema map, with the same shape as the schema map of a Snapshot, takes the highest version of each schema. A single entry per schema would merge as last writer wins, so two concurrent raises could keep the lower version, and no peer could repair it after the newer client left. Keys that never change merge as a union. Seeding writes the first versions. A client raises a recorded Schema Version, or adds one of its Extensions, the first time it writes to the Shared Document. It writes the metadata in the same Yjs transaction as the content, so no peer receives data before the versions that describe it.

A client opens the document read-only and emits `upgrade-required`, which the Editor reports through its `onUpgradeRequired` option, in either of these cases:

- Its code is older than a recorded Schema Version.
- It lacks an Extension that the document uses.

The client checks on load and on every change to the metadata map. If a newer client raises a recorded Schema Version while older clients are connected, those older clients switch to read-only immediately. A client that is read-only for a schema reason never writes to the Shared Document: it sends no Lexical update to Yjs, and undo and redo do nothing.

## Considered options

- **Raise on connect.** Simple, but every older client would turn read-only as soon as a newer client opened the document, even if the newer client never wrote anything. Raising on the first write keeps older clients editable until the document holds data that they may not represent.
- **Raise on the first write of a node in the newer schema.** More precise, but it needs an inventory of the node types and properties that each Schema Version added, which no Extension declares.
- **Unsupported Blocks inside a Shared Document.** A client that lacks an Extension would show placeholders and edit the rest of the document. An experiment with the V2 binding of `@lexical/yjs` (ADR-0011) ruled it out. Without a registered node type, loading throws `Node … is not registered`. With a placeholder node registered under the unknown type, the document loads, but the binding writes the placeholder back to Yjs whenever its parent changes. A leaf placeholder deleted the unknown node's children and properties for every peer, and an element placeholder deleted its properties. Node types also register when the editor is built, so a type that first appears after mounting would throw again.

## Consequences

- A client that lacks an Extension the Shared Document uses opens it read-only. Unsupported Blocks exist only in Snapshots (ADR-0007).
- Seeding refuses a Snapshot that contains node types its Extensions lack, because the Shared Document would store placeholders instead of the original nodes.
- An Editor that is read-only for a schema reason cannot export a Snapshot of the Shared Document, because it holds only the part that it can represent. `getSnapshot()` throws the typed error instead.
