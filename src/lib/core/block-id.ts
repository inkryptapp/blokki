import {
	$createParagraphNode,
	$getNodeByKey,
	$getRoot,
	$getSelection,
	$getState,
	$isElementNode,
	$isRangeSelection,
	$isRootNode,
	$setState,
	COMMAND_PRIORITY_LOW,
	createState,
	defineExtension,
	HISTORY_MERGE_TAG,
	INSERT_PARAGRAPH_COMMAND,
	mergeRegister,
	RootNode,
	safeCast,
	SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
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
	parse: (value) => (typeof value === 'string' && BLOCK_ID.test(value) ? value : ''),
	// A copy, such as a duplicated Block or the right half of a split, is a new Block.
	resetOnCopyNode: true
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
		/**
		 * The Blocks that the current update removed, by their index among the root's children in
		 * the committed state, with the keys of their children.
		 */
		const $removedBlocks = (): Map<number, { id: string; children: string[] }> => {
			const previous = editor.getEditorState().read(() =>
				$getRoot()
					.getChildren()
					.map((node, index) => ({
						index,
						key: node.getKey(),
						id: $getState(node, blockIdState),
						children: $isElementNode(node) ? node.getChildrenKeys() : []
					}))
			);
			const removed = new Map<number, { id: string; children: string[] }>();
			for (const { index, key, id, children } of previous) {
				// A removed node stays in the node map, detached, until the update commits.
				if (id !== '' && $getNodeByKey(key)?.isAttached() !== true) {
					removed.set(index, { id, children });
				}
			}
			return removed;
		};
		/**
		 * Whether `block` replaced a removed Block. Lexical's replace() puts the new node at the old
		 * node's index and moves the old node's children into it, which is how Turn Into and
		 * Markdown shortcuts change a Block's type. A Block that only fills the place of a deleted
		 * one holds none of its children.
		 */
		const $replaced = (block: ElementNode, previousChildren: readonly string[]): boolean => {
			const children = block.getChildrenKeys();
			return children.length === 0
				? previousChildren.length === 0
				: children.some((key) => previousChildren.includes(key));
		};
		/**
		 * Gives each Block without an ID the ID of the Block that it replaced, or a new one, and
		 * gives a new ID to each Block that repeats an earlier one.
		 */
		const $repair = (): void => {
			// Indices among all of the root's children, the same as in $removedBlocks.
			const blocks = $getRoot()
				.getChildren()
				.flatMap((node, index): [number, ElementNode][] => (isBlock(node) ? [[index, node]] : []));
			const present = new Set(blocks.map(([, block]) => $getState(block, blockIdState)));
			const seen = new Set<string>();
			let removed: Map<number, { id: string; children: string[] }> | null = null;
			for (const [index, block] of blocks) {
				let id = $getState(block, blockIdState);
				if (id === '') {
					removed ??= $removedBlocks();
					const previous = removed.get(index);
					if (
						previous !== undefined &&
						!present.has(previous.id) &&
						$replaced(block, previous.children)
					) {
						id = previous.id;
						present.add(id);
					}
				}
				while (id === '' || seen.has(id)) {
					id = createId();
				}
				if (id !== $getState(block, blockIdState)) {
					$setState(block, blockIdState, id);
				}
				seen.add(id);
			}
		};
		/** The Block that contains `node`, or null. */
		const $blockOf = (node: LexicalNode): ElementNode | null => {
			const top = $isRootNode(node) ? null : node.getTopLevelElement();
			return isBlock(top) ? top : null;
		};

		return mergeRegister(
			// Lexical marks the root dirty whenever a Block is added, so this runs in the update that
			// creates the Block.
			editor.registerNodeTransform(RootNode, $repair),
			// Enter at the very start of a non-empty Block: Lexical would keep the node above and move
			// the content into a new node below. Adding the empty Block above instead keeps the
			// Block ID on the content.
			editor.registerCommand(
				INSERT_PARAGRAPH_COMMAND,
				() => {
					const selection = $getSelection();
					if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
						return false;
					}
					const { anchor } = selection;
					const anchorNode = anchor.getNode();
					const block = $blockOf(anchorNode);
					const atStart =
						anchor.offset === 0 &&
						block !== null &&
						(anchorNode.is(block) || anchorNode.is(block.getFirstDescendant()));
					if (block === null || !atStart || block.isEmpty()) {
						return false;
					}
					const above = $createParagraphNode();
					above.setFormat(block.getFormatType());
					above.setIndent(block.getIndent());
					block.insertBefore(above);
					return true;
				},
				COMMAND_PRIORITY_LOW
			),
			// A pasted Block keeps its ID only if no Block in the document has it, so cut and paste
			// keeps Anchor Links working and copy and paste creates new IDs. Every pasted Block gets
			// its ID here, so that it never takes over the ID of a Block that the paste replaces.
			editor.registerCommand(
				SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
				({ nodes }) => {
					const present = new Set($blocks().map((block) => $getState(block, blockIdState)));
					for (const node of nodes) {
						if ($isElementNode(node) && blockTypes.some((type) => node instanceof type)) {
							let id = $getState(node, blockIdState);
							while (id === '' || present.has(id)) {
								id = createId();
							}
							$setState(node, blockIdState, id);
							present.add(id);
						}
					}
					return false;
				},
				COMMAND_PRIORITY_LOW
			),
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
