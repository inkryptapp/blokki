export const enable = `import { createEditor } from 'blokki';
import { HistoryExtension } from '@lexical/history';
import { configExtension } from 'lexical';

const editor = createEditor({
	extensions: [configExtension(HistoryExtension, { delay: 500 })]
});`;

export const declare = `import { declareSchema } from 'blokki/core';
import { defineExtension } from 'lexical';
import { NoteNode } from './note-node.js';

export const NoteExtension = defineExtension({
	name: 'acme/note',
	nodes: [NoteNode],
	dependencies: [declareSchema({ name: 'acme/note', version: 1 })]
});`;

export const migration = `import { declareSchema, type Migration } from 'blokki/core';

// Version 2 replaced the color of a note with a tone. Notes are Blocks, so they are children of
// the root.
const colorToTone: Migration = (root) => ({
	...root,
	children: root.children.map((node) => {
		if (node.type !== 'acme-note' || !('color' in node)) {
			return node;
		}
		const { color, ...note } = node;
		return { ...note, tone: color === 'yellow' ? 'warning' : 'info' };
	})
});

export const NoteExtension = defineExtension({
	name: 'acme/note',
	nodes: [NoteNode],
	dependencies: [declareSchema({ name: 'acme/note', version: 2, migrations: { 2: colorToTone } })]
});`;

export const blockType = `import { BlockIdExtension, declareSchema } from 'blokki/core';
import { configExtension, defineExtension } from 'lexical';

export const NoteExtension = defineExtension({
	name: 'acme/note',
	nodes: [NoteNode],
	dependencies: [
		declareSchema({ name: 'acme/note', version: 2, migrations }),
		configExtension(BlockIdExtension, { blockTypes: [NoteNode] })
	]
});`;

export const nodeConstructor = `export class NoteNode extends ElementNode {
	__tone: string;
	__icon: string | null;

	constructor(tone = 'info', icon: string | null = null, key?: NodeKey) {
		super(key);
		// Assigned even when null, so that @lexical/yjs syncs them.
		this.__tone = tone;
		this.__icon = icon;
	}

	// getType, clone, importJSON, exportJSON, createDOM, and updateDOM as usual.
}`;
