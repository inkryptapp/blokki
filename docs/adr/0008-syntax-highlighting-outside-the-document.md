# Syntax highlighting stays out of the document

A code block stores its code as plain text. Highlighting is View State. Tokens are computed off the main thread and painted with the CSS Custom Highlight API (`CSS.highlights` and `::highlight()`), which colors text ranges without changing the DOM. That browser API exists in Chrome and Edge 105+, Safari 17.2+, and Firefox 140+.

Lexical's official highlighters, `@lexical/code-shiki` and `@lexical/code-prism`, split code into `CodeHighlightNode` children inside the editor state. With collaboration on, those token nodes become document content. Every client tokenizes again, so concurrent edits split and merge the same text nodes, and the token nodes also end up in the undo history. When highlighting stays out of the document, it cannot move the cursor, break IME composition, or add undo steps.

## Consequences

- `::highlight()` supports only a few properties, such as `color`, `background-color`, and `text-decoration`. Tokens that a theme sets in italic or bold render upright.
- The highlighter benchmark measures candidate libraries with this rendering approach. It also measures Lexical's token-node approach as a baseline.
