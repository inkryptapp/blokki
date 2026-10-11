import {
	$getNodeByKey,
	$getRoot,
	$getState,
	$isRootNode,
	$setState,
	createState,
	defineExtension,
	HISTORY_MERGE_TAG,
	mergeRegister,
	RootNode,
	safeCast,
	type ElementNode,
	type Klass,
	type LexicalEditor,
	type LexicalNode
} from 'lexical';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ID_LENGTH = 10;
const BLOCK_ID = /^[A-Za-z0-9_-]{10}$/;
/**
 * Tags the update that repairs Block IDs. The repair does not trigger another one, and
 * collaborative undo skips it, because it is not a user edit.
 */
export const BLOCK_ID_REPAIR_TAG = 'blokki-block-id-repair';

/**
 * Creates a Block ID: 10 random characters from a URL-safe alphabet, about 60 bits. Block IDs
 * are unique within a document, not globally.
 */
export function createBlockId(): string {
	let id = '';
	for (const byte of crypto.getRandomValues(new Uint8Array(ID_LENGTH))) {
		// 64 characters, so the low 6 bits of a byte pick one without bias.
		id += ALPHABET.charAt(byte & 63);
	}
	return id;
}

/**
 * The Block ID of a node, stored as Lexical node state. It serializes under the node's `$` key
 * and syncs through Yjs. A node without one holds the empty string.
 */
const blockIdState = createState('blockId', {
	parse: (value) => (typeof value === 'string' && BLOCK_ID.test(value) ? value : '')
});

/** Returns the Block ID of `node`, or null when it has none. */
export function $getBlockId(node: LexicalNode): string | null {
	return $getState(node, blockIdState) || null;
}

/** Configuration of {@link BlockIdExtension}. */
export interface BlockIdConfig {
	/**
	 * The node types that are Blocks when they are direct children of the root. Extensions that
	 * define Block types add theirs.
	 */
	readonly blockTypes: readonly Klass<ElementNode>[];
	/**
	 * Creates a new Block ID.
	 *
	 * @defaultValue {@link createBlockId}
	 */
	readonly createId: () => string;
}

/**
 * Gives every Block a Block ID the moment it is created, and repairs duplicates: when two Blocks
 * share an ID, the one later in document order gets a new one. The repair also runs after
 * imports, remote changes, and undo, which bypass Lexical's node transforms. A mounted Block
 * shows its ID as a `data-block-id` attribute.
 */
export const BlockIdExtension = defineExtension({
	name: 'blokki/block-id',
	config: safeCast<BlockIdConfig>({ blockTypes: [], createId: createBlockId }),
	mergeConfig: (config, overrides) => ({
		createId: overrides.createId ?? config.createId,
		blockTypes: [...config.blockTypes, ...(overrides.blockTypes ?? [])]
	}),
	register: (editor, { blockTypes, createId }) => {
		const isBlock = (node: LexicalNode | null): node is ElementNode =>
			node !== null &&
			$isRootNode(node.getParent()) &&
			blockTypes.some((type) => node instanceof type);
		const $blocks = (): ElementNode[] => $getRoot().getChildren().filter(isBlock);
		/** Whether a Block lacks an ID or repeats an earlier one. */
		const $needsRepair = (): boolean => {
			const seen = new Set<string>();
			return $blocks().some((block) => {
				const id = $getState(block, blockIdState);
				const repeated = id === '' || seen.has(id);
				seen.add(id);
				return repeated;
			});
		};
		const $repair = (): void => {
			const seen = new Set<string>();
			for (const block of $blocks()) {
				let id = $getState(block, blockIdState);
				while (id === '' || seen.has(id)) {
					id = createId();
				}
				if (id !== $getState(block, blockIdState)) {
					$setState(block, blockIdState, id);
				}
				seen.add(id);
			}
		};

		return mergeRegister(
			...blockTypes.map((type) =>
				editor.registerNodeTransform(type, (node) => {
					if (isBlock(node) && $getState(node, blockIdState) === '') {
						$setState(node, blockIdState, createId());
					}
				})
			),
			editor.registerNodeTransform(RootNode, $repair),
			// Renders each Block ID as a data-block-id attribute, never as a DOM id, which could
			// collide with the app's own ids or with a second Editor that shows the same document.
			...blockTypes.map((type) =>
				editor.registerMutationListener(type, (mutations) => {
					editor.read(() => {
						for (const [key, mutation] of mutations) {
							const element = editor.getElementByKey(key);
							const node = $getNodeByKey(key);
							if (mutation === 'destroyed' || element === null || node === null) {
								continue;
							}
							const id = $getState(node, blockIdState);
							if (id === '') {
								element.removeAttribute('data-block-id');
							} else {
								element.setAttribute('data-block-id', id);
							}
						}
					});
				})
			),
			editor.registerUpdateListener(({ editorState, tags }) => {
				if (!tags.has(BLOCK_ID_REPAIR_TAG) && editorState.read($needsRepair)) {
					// Not a user edit, so it merges into the previous history entry. It commits on its own,
					// because a queued update can be batched with a later remote change, and collaboration
					// writes nothing to the Shared Document for an update that carries the remote tag.
					editor.update($repair, { discrete: true, tag: [BLOCK_ID_REPAIR_TAG, HISTORY_MERGE_TAG] });
				}
			})
		);
	}
});

/** Finds the key of the Block with `id`, or null. */
export function findBlockKey(editor: LexicalEditor, id: string): string | null {
	return editor.read(() => {
		for (const node of $getRoot().getChildren()) {
			if ($getState(node, blockIdState) === id) {
				return node.getKey();
			}
		}
		return null;
	});
}
