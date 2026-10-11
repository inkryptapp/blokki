# Collaboration uses Lexical's V2 Yjs binding

The collaboration Extension binds Lexical to the Shared Document with the V2 binding from `@lexical/yjs`: `createBindingV2__EXPERIMENTAL`, `syncYjsChangesToLexicalV2__EXPERIMENTAL`, `syncLexicalUpdateToYjsV2__EXPERIMENTAL`, and `syncYjsStateToLexicalV2__EXPERIMENTAL`. The V2 binding stores the Shared Document under a `root-v2` `XmlElement`. Each Lexical element is an `XmlElement`, and the text of each element is an `XmlText`.

The app owns the Y.Doc, and an Editor binds to it whenever it mounts. The same Y.Doc therefore meets more than one binding in normal use: Seeding writes it, the Editor reads it after an unmount and a remount, and a headless editor derives a Snapshot from it. The V1 binding caches its collab nodes on the Yjs shared types themselves (`_collabNode`). A second binding over the same Y.Doc reuses the first binding's stale nodes. In an experiment, a second V1 binding over a seeded document showed the seeded text four times, and a replica of that document lost it. The V2 binding keeps its mapping on the binding object, so every binding starts clean. It also has an official function that loads a Shared Document that already has content. V1 has none.

## Considered options

- **The stable V1 binding (`createYjsBinding`).** It is the default of Lexical's React collaboration plugin and has the longest production use. It needs two workarounds that reach into undocumented internals: loading existing content through `CollabElementNode` methods, and clearing the `_collabNode` caches before every new binding.

## Consequences

- The V2 functions carry an `__EXPERIMENTAL` suffix, so Lexical can change them in a minor release. Lexical is pinned (ADR-0003), and every Lexical upgrade reruns the convergence tests.
- V1 and V2 store a document in different Yjs structures. Switching bindings later needs a Document Upgrade for every Shared Document.
- The V2 binding maps each `XmlText` to the Lexical text nodes it last created, and Lexical can remove those nodes without reporting them: a text node that an edit leaves empty, or the children of a removed element. The binding then reuses a removed node and throws on the next remote change. The collaboration Extension forgets the mapping of every node that leaves the editor state. Without that workaround, 2 of 250 seeded convergence runs failed.
