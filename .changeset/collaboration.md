---
'blokki': minor
---

Add real-time collaboration through Yjs in `blokki/collab`. `collaboration({ doc, provider, user })` binds an Editor to a Shared Document, and `seedSharedDocument` gives a new Shared Document its first content exactly once. Undo and redo revert only the local user's changes. The Shared Document records the Schema Version of each Extension, and a client with older code, or without an Extension that the document uses, opens it read-only and reports it through `onUpgradeRequired`. Closing the tab or unmounting the Editor removes the user's presence at once.
