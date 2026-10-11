export const stored = `{
	"children": [
		{ "detail": 0, "format": 0, "mode": "normal", "style": "", "text": "Hello.", "type": "text", "version": 1 }
	],
	"direction": null,
	"format": "",
	"indent": 0,
	"textFormat": 0,
	"textStyle": "",
	"type": "paragraph",
	"version": 1,
	"$": { "blockId": "q2V7xK_9bA" }
}`;

export const scrollMargin = `[data-block-id] {
	scroll-margin-top: 4rem;
}`;

export const anchorLink = `const editor = createEditor({
	anchorLink: (blockId) => \`https://notes.example.com/\${noteId}#\${blockId}\`
});

const url = editor.getAnchorLink(blockId);`;

export const scrollToBlock = `<button type="button" onclick={() => editor.scrollToBlock(heading.blockId)}>
	{heading.title}
</button>`;

export const readBlockId = `import { $getBlockId } from 'blokki/core';
import { $getRoot } from 'lexical';

const ids = editor.lexical.read(() => $getRoot().getChildren().map($getBlockId));`;
