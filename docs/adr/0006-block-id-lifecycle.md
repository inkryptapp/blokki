# Block IDs follow the content, not the node

Every Block has a Block ID from the moment the Block is created. The ID is stored as Lexical node state, so it survives JSON serialization and syncs through Yjs. It is 10 random characters from a URL-safe alphabet, about 60 bits, and it is unique within one document. The Editor renders it as a `data-block-id` attribute, never as a DOM `id`. A DOM `id` could collide with the app's own ids, or with a second Editor that shows the same document.

Anchor Links and the table of contents point at Block IDs, so an ID has to stay with the content the user thinks of as "that Block". Lexical's own editing operations do not guarantee that, so the Editor applies these rules:

1. Enter in the middle or at the end of a Block: the original keeps its ID, and the new Block below gets a new one.
2. Enter at the very start of a non-empty Block: the new empty Block appears above with a new ID, and the content keeps its ID.
3. Backspace at the start of Block B merges B into Block A above it: A keeps its ID. If A is empty, A is removed and B keeps its ID.
4. Turn Into and Markdown shortcuts keep the ID.
5. Moving a Block, by drag or keyboard, keeps the ID.
6. Duplicate gives the copy and every Block inside it new IDs.
7. A pasted Block keeps its ID only if no Block in the document already has it. Cut-and-paste therefore keeps Anchor Links working, and copy-and-paste creates new IDs.
8. Undoing a deletion restores the original ID.
9. If two Blocks share an ID, after concurrent edits or a bad import, the one later in document order gets a new ID.

Rule 2 is the one most likely to surprise. In Lexical, pressing Enter at offset 0 keeps the original node above and moves the content into a new node below. Without the rule, adding a blank line above a heading would break every link to that heading.
