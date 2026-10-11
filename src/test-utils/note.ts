import {
	defineExtension,
	ElementNode,
	type NodeKey,
	type SerializedElementNode,
	type SerializedLexicalNode,
	type SerializedRootNode,
	type Spread
} from 'lexical';
import { declareSchema, type Migration } from '../lib/core/index.js';

/**
 * A fixture node type whose JSON changed twice, for Migration tests. Version 1 stored a `color`,
 * version 2 replaced it with a `tone`, and version 3 added an `icon`.
 */
export type SerializedNoteNode = Spread<{ tone: string; icon?: string }, SerializedElementNode>;

export class NoteNode extends ElementNode {
	__tone: string;
	__icon: string | null;

	static override getType(): string {
		return 'acme-note';
	}

	static override clone(node: NoteNode): NoteNode {
		return new NoteNode(node.__tone, node.__icon, node.__key);
	}

	static override importJSON(json: SerializedNoteNode): NoteNode {
		return new NoteNode(json.tone, json.icon ?? null).updateFromJSON(json);
	}

	constructor(tone = 'info', icon: string | null = null, key?: NodeKey) {
		super(key);
		this.__tone = tone;
		this.__icon = icon;
	}

	override createDOM(): HTMLElement {
		const element = document.createElement('aside');
		element.dataset.tone = this.__tone;
		return element;
	}

	override updateDOM(): boolean {
		return true;
	}

	override exportJSON(): SerializedNoteNode {
		const { __tone: tone, __icon: icon } = this.getLatest();
		return icon === null ? { ...super.exportJSON(), tone } : { ...super.exportJSON(), tone, icon };
	}
}

type JsonNode = SerializedLexicalNode & Record<string, unknown>;

function mapNotes(
	root: SerializedRootNode,
	update: (note: JsonNode) => JsonNode
): SerializedRootNode {
	const visit = (node: SerializedLexicalNode): SerializedLexicalNode => {
		const children: unknown = Reflect.get(node, 'children');
		const visited = Array.isArray(children)
			? { ...node, children: children.map((child: SerializedLexicalNode) => visit(child)) }
			: node;
		return visited.type === 'acme-note' ? update(visited) : visited;
	};
	return { ...root, children: root.children.map(visit) };
}

/** The Migrations of the note schema, keyed by the version each one produces. */
export const noteMigrations: Readonly<Record<number, Migration>> = {
	2: (root) =>
		mapNotes(root, ({ color, ...note }) => ({
			...note,
			tone: color === 'yellow' ? 'warning' : 'info'
		})),
	// Depends on the tone that the previous Migration wrote.
	3: (root) => mapNotes(root, (note) => ({ ...note, icon: note.tone === 'warning' ? '⚠️' : 'ℹ️' }))
};

/** The note Extension at Schema Version `version`, with the Migrations up to that version. */
export function noteExtension(version: 1 | 2 | 3) {
	const migrations = Object.fromEntries(
		Object.entries(noteMigrations).filter(([target]) => Number(target) <= version)
	);
	return defineExtension({
		name: 'acme/note',
		nodes: [NoteNode],
		dependencies: [declareSchema({ name: 'acme/note', version, migrations })]
	});
}
