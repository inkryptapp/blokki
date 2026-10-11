---
'blokki': minor
---

Give every Block a Block ID that stays with its content through Enter, Backspace, Turn Into, moves, cut and paste, and undo. Copies get new IDs. The Editor renders the ID as a `data-block-id` attribute. `editor.getAnchorLink(id)` builds a link to a Block with the `anchorLink` option, and `editor.scrollToBlock(id)` scrolls it into view. Extensions register their own Block types with `BlockIdExtension`.
