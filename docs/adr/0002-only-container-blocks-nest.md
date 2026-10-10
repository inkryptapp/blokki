# Only Container Blocks nest

The document follows Lexical's mostly flat tree. Structural nesting exists only in Container Blocks: lists, quotes, callouts, toggles, and table cells. In any other Block, Tab changes the Indent, which is a visual attribute. Dragging a Block moves that Block and its own children, never the Blocks that only look indented under it.

## Considered options

- **Notion-style nesting.** Any Block can own child Blocks, Tab makes a Block the child of the one above, and dragging a parent moves its subtree. This needs a custom wrapper node around every Block. Lexical's built-ins expect their nodes directly under the parent, not inside a wrapper: `$setBlocksType`, list commands, Markdown transformers, tables, and code blocks all break. Working around that means writing a second document engine on top of Lexical.

## Consequences

- An indented paragraph does not travel with the heading above it.
- Only toggles collapse. Arbitrary subtrees cannot collapse.
