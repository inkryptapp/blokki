import { getExtensionDependencyFromEditor } from '@lexical/extension';
import {
	$getRoot,
	$isElementNode,
	DecoratorNode,
	defineExtension,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type SerializedRootNode,
	type Spread
} from 'lexical';

/** The serialized form of an Unsupported Block or of its inline counterpart. */
export type SerializedUnsupportedNode = Spread<
	{ original: SerializedLexicalNode },
	SerializedLexicalNode
>;

const BLOCK_TYPE = 'blokki-unsupported-block';
const INLINE_TYPE = 'blokki-unsupported-inline';

/** Holds the JSON of a node whose Extension is not enabled, and renders a placeholder. */
abstract class UnsupportedNode extends DecoratorNode<null> {
	__original: SerializedLexicalNode;

	constructor(original: SerializedLexicalNode, key?: NodeKey) {
		super(key);
		this.__original = original;
	}

	/** The node's JSON as the Snapshot stored it. */
	getOriginal(): SerializedLexicalNode {
		return this.getLatest().__original;
	}

	override exportJSON(): SerializedUnsupportedNode {
		return { ...super.exportJSON(), original: this.getOriginal() };
	}

	override updateDOM(): boolean {
		return false;
	}

	override decorate(): null {
		return null;
	}

	override getTextContent(): string {
		return '';
	}

	protected placeholder(tagName: 'div' | 'span', message: string): HTMLElement {
		const element = document.createElement(tagName);
		element.dataset.blokkiUnsupported = this.__original.type;
		element.textContent = message;
		return element;
	}
}

/**
 * A read-only placeholder for a Block whose Extension is not enabled. Export writes the original
 * JSON back in its place.
 */
export class UnsupportedBlockNode extends UnsupportedNode {
	static override getType(): string {
		return BLOCK_TYPE;
	}

	static override clone(node: UnsupportedBlockNode): UnsupportedBlockNode {
		return new UnsupportedBlockNode(node.__original, node.__key);
	}

	static override importJSON(json: SerializedUnsupportedNode): UnsupportedBlockNode {
		return new UnsupportedBlockNode(json.original);
	}

	override createDOM(): HTMLElement {
		return this.placeholder('div', 'This content needs a feature that is turned off.');
	}

	override isInline(): boolean {
		return false;
	}
}

/** The inline counterpart of {@link UnsupportedBlockNode}, for an unknown node inside a Block. */
export class UnsupportedInlineNode extends UnsupportedNode {
	static override getType(): string {
		return INLINE_TYPE;
	}

	static override clone(node: UnsupportedInlineNode): UnsupportedInlineNode {
		return new UnsupportedInlineNode(node.__original, node.__key);
	}

	static override importJSON(json: SerializedUnsupportedNode): UnsupportedInlineNode {
		return new UnsupportedInlineNode(json.original);
	}

	override createDOM(): HTMLElement {
		return this.placeholder('span', 'Unsupported content');
	}

	override isInline(): boolean {
		return true;
	}
}

/** Output of {@link UnsupportedContentExtension}. */
interface UnsupportedContentOutput {
	/**
	 * The schema map entries of the last imported Snapshot whose Extensions are not enabled.
	 * Export keeps them, so a document that is saved again still names those Extensions.
	 */
	readonly retainedSchema: Map<string, number>;
}

/** Registers the Unsupported Block nodes and remembers the schema entries they need. */
export const UnsupportedContentExtension = defineExtension({
	name: 'blokki/unsupported-content',
	nodes: [UnsupportedBlockNode, UnsupportedInlineNode],
	build: (): UnsupportedContentOutput => ({ retainedSchema: new Map() })
});

export function retainedSchemaOf(editor: LexicalEditor): Map<string, number> {
	return getExtensionDependencyFromEditor(editor, UnsupportedContentExtension).output
		.retainedSchema;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isSerializedNode = (value: unknown): value is SerializedLexicalNode =>
	isRecord(value) && typeof value.type === 'string';

/**
 * Applies `replace` to every node below `root`, depth first. `depth` is 1 for the root's
 * children. Returns the input objects wherever nothing changed.
 */
function mapNodes<Node extends SerializedLexicalNode>(
	node: Node,
	replace: (node: SerializedLexicalNode, depth: number) => SerializedLexicalNode,
	depth = 0
): Node {
	const children: unknown = Reflect.get(node, 'children');
	if (!Array.isArray(children)) {
		return node;
	}
	let changed = false;
	const mapped = children.map((child: unknown) => {
		if (!isSerializedNode(child)) {
			return child;
		}
		const next = replace(child, depth + 1);
		const result = next === child ? mapNodes(child, replace, depth + 1) : next;
		changed ||= result !== child;
		return result;
	});
	return changed ? { ...node, children: mapped } : node;
}

/**
 * Replaces every node whose type the editor does not have with an Unsupported Block, or with its
 * inline counterpart when the node sits inside a Block. Lexical would throw on the unknown type.
 */
export function replaceUnknownNodes(
	editor: LexicalEditor,
	root: SerializedRootNode
): SerializedRootNode {
	// LexicalEditor has no public lookup by type. @lexical/yjs reads _nodes the same way.
	const known = editor._nodes;
	return mapNodes(root, (node, depth) => {
		if (known.has(node.type)) {
			return node;
		}
		// Only the root holds Blocks today. Container Blocks will hold them too.
		const type = depth === 1 ? BLOCK_TYPE : INLINE_TYPE;
		// A copy, so that changing the imported Snapshot later cannot change the document.
		const placeholder: SerializedUnsupportedNode = {
			type,
			version: 1,
			original: structuredClone(node)
		};
		return placeholder;
	});
}

/** Puts the original JSON back in place of every Unsupported Block. */
export function restoreUnknownNodes(root: SerializedRootNode): SerializedRootNode {
	return mapNodes(root, (node) => {
		if (node.type !== BLOCK_TYPE && node.type !== INLINE_TYPE) {
			return node;
		}
		const original: unknown = Reflect.get(node, 'original');
		// A copy, so that changing the exported Snapshot cannot change the document.
		return isSerializedNode(original) ? structuredClone(original) : node;
	});
}

/** The node types that the editor shows as Unsupported Blocks, in document order. */
export function unsupportedTypesOf(editor: LexicalEditor): string[] {
	return editor.read(() => {
		const types: string[] = [];
		const visit = (node: LexicalNode): void => {
			if (node instanceof UnsupportedNode) {
				types.push(node.getOriginal().type);
			} else if ($isElementNode(node)) {
				node.getChildren().forEach(visit);
			}
		};
		visit($getRoot());
		return types;
	});
}
