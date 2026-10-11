import {
	CONNECTED_COMMAND,
	createBindingV2__EXPERIMENTAL,
	createUndoManager,
	initLocalState,
	setLocalStateFocus,
	syncCursorPositions,
	syncLexicalUpdateToYjsV2__EXPERIMENTAL,
	syncYjsChangesToLexicalV2__EXPERIMENTAL,
	syncYjsStateToLexicalV2__EXPERIMENTAL,
	TOGGLE_CONNECT_COMMAND,
	type BindingV2,
	type Provider,
	type UserState
} from '@lexical/yjs';
import {
	$getRoot,
	$isParagraphNode,
	BLUR_COMMAND,
	CAN_REDO_COMMAND,
	CAN_UNDO_COMMAND,
	COLLABORATION_TAG,
	COMMAND_PRIORITY_EDITOR,
	configExtension,
	defineExtension,
	FOCUS_COMMAND,
	HISTORIC_TAG,
	mergeRegister,
	REDO_COMMAND,
	safeCast,
	SKIP_COLLAB_TAG,
	UNDO_COMMAND,
	type EditorState,
	type LexicalEditor
} from 'lexical';
import {
	UndoManager,
	type Doc,
	type Transaction,
	type XmlElement,
	type XmlText,
	type YEvent
} from 'yjs';
import { BLOCK_ID_REPAIR_TAG } from '../core/block-id.js';
import { schemaOf } from '../core/schema.js';
import { SharedDocumentExtension, sharedDocumentOf } from '../core/shared-document.js';
import { checkSchema, raiseSchema, schemaMetadataOf } from './schema-metadata.js';

/** The user who edits through this Editor, as other collaborators see them. */
export interface CollaborationUser {
	/** A stable identifier of the user. Other collaborators read it from the awareness state. */
	readonly id: string;
	/** The name shown next to the user's caret. */
	readonly name: string;
	/**
	 * A CSS color for the user's caret and selection.
	 *
	 * @defaultValue a color derived from `id`
	 */
	readonly color?: string;
}

/** Options for {@link collaboration}. */
export interface CollaborationOptions {
	/** The Shared Document. The app creates it and keeps it for as long as it needs it. */
	readonly doc: Doc;
	/**
	 * The provider that synchronizes `doc` with other peers. The app constructs it. The Editor
	 * connects it when it mounts and disconnects it when it unmounts.
	 */
	readonly provider: Provider;
	readonly user: CollaborationUser;
}

/** Configuration of {@link CollaborationExtension}. Use {@link collaboration} to set it. */
export interface CollaborationConfig {
	readonly doc: Doc | null;
	readonly provider: Provider | null;
	readonly user: CollaborationUser | null;
}

/** Output of {@link CollaborationExtension}. */
export interface CollaborationOutput {
	/**
	 * The binding between the Lexical editor and the Shared Document. It follows Lexical's
	 * versioning and is outside the semver promise of blokki.
	 */
	readonly binding: BindingV2;
	/**
	 * The Yjs undo manager behind undo and redo. It tracks only the local user's changes. It
	 * follows Yjs's versioning and is outside the semver promise of blokki.
	 */
	readonly undoManager: UndoManager;
}

const BINDING_ID = 'blokki';

function requireOptions({ doc, provider, user }: CollaborationConfig): CollaborationOptions {
	if (doc === null || provider === null || user === null) {
		throw new Error(
			'Configure CollaborationExtension with collaboration({ doc, provider, user }).'
		);
	}
	return { doc, provider, user };
}

/** Derives a caret color from a user ID, so a user keeps the same color across sessions. */
function colorFor(id: string): string {
	let hash = 0;
	for (const character of id) {
		hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) >>> 0;
	}
	return `hsl(${hash % 360} 70% 45%)`;
}

/**
 * A view of `provider` without presence. Lexical's sync functions draw remote carets from the
 * awareness states, which needs a DOM, so an editor without a root element syncs content only.
 */
function withoutPresence(provider: Provider): Provider {
	return {
		awareness: {
			getLocalState: () => null,
			getStates: () => new Map(),
			on: () => {},
			off: () => {},
			setLocalState: () => {},
			setLocalStateField: () => {}
		},
		connect: () => provider.connect(),
		disconnect: () => provider.disconnect(),
		on: (type: never, listener: never) => provider.on(type, listener),
		off: (type: never, listener: never) => provider.off(type, listener)
	};
}

/**
 * Whether an update only refills an emptied root with one empty paragraph. Lexical does that
 * after a remote change or an undo removes every Block.
 */
function isRefill(
	prevEditorState: EditorState,
	editorState: EditorState,
	tags: Set<string>
): boolean {
	if (tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) {
		return false;
	}
	return (
		prevEditorState.read(() => $getRoot().isEmpty()) &&
		editorState.read(() => {
			const root = $getRoot();
			const only = root.getFirstChild();
			return root.getChildrenSize() === 1 && $isParagraphNode(only) && only.isEmpty();
		})
	);
}

/**
 * The latest connection of each provider. An app can reuse one provider across mounts, and the
 * teardown of an earlier mount may run after its connect() promise settles, when a later mount
 * owns the connection.
 */
const connections = new WeakMap<Provider, symbol>();

/**
 * Joins the collaboration session for a mounted Editor: publishes the user's presence, keeps its
 * focus flag current, draws remote carets, and connects the provider. Returns a function that
 * leaves the session. It clears the presence at once, and it disconnects unless a later
 * connection has replaced this one.
 */
function joinSession(
	editor: LexicalEditor,
	binding: BindingV2,
	options: CollaborationOptions,
	root: HTMLElement
): () => void {
	const { provider, user } = options;
	const connection = Symbol('connection');
	connections.set(provider, connection);
	const color = user.color ?? colorFor(user.id);
	const awarenessData = { userId: user.id };
	const publishPresence = (): void => {
		const focusing = root.ownerDocument.activeElement === root;
		initLocalState(provider, user.name, color, focusing, awarenessData);
	};
	const setFocus = (focusing: boolean): boolean => {
		setLocalStateFocus(provider, user.name, color, focusing, awarenessData);
		return false;
	};
	// The presence of a page in the back-forward cache, including its caret, to restore on return.
	let hiddenPresence: UserState | null = null;
	const clearPresence = (): void => {
		provider.awareness.setLocalState(null);
	};
	// A closed tab must not leave a caret on other screens until the awareness timeout.
	const onPageHide = (): void => {
		hiddenPresence = provider.awareness.getLocalState();
		clearPresence();
	};
	const onPageShow = (event: PageTransitionEvent): void => {
		if (event.persisted) {
			if (hiddenPresence === null) {
				publishPresence();
			} else {
				provider.awareness.setLocalState(hiddenPresence);
			}
			hiddenPresence = null;
		}
	};
	const syncCursors = (): void => {
		syncCursorPositions(binding, provider);
	};
	// Lexical positions remote carets against the offset parent of this container. The container
	// is not positioned itself, so the carets share that containing block. Lexical measures the
	// carets only when it syncs them, so scrolling or resizing the root syncs them again.
	const cursors = root.ownerDocument.createElement('div');
	cursors.setAttribute('aria-hidden', 'true');
	root.after(cursors);
	binding.cursorsContainer = cursors;
	const view = root.ownerDocument.defaultView;
	const resizes = new ResizeObserver(syncCursors);

	publishPresence();
	provider.awareness.on('update', syncCursors);
	root.addEventListener('scroll', syncCursors);
	resizes.observe(root);
	view?.addEventListener('pagehide', onPageHide);
	view?.addEventListener('pageshow', onPageShow);
	// Draws the peers that the provider already knows about.
	syncCursors();
	const unregisterFocus = mergeRegister(
		editor.registerCommand(FOCUS_COMMAND, () => setFocus(true), COMMAND_PRIORITY_EDITOR),
		editor.registerCommand(BLUR_COMMAND, () => setFocus(false), COMMAND_PRIORITY_EDITOR)
	);
	const connecting = provider.connect();

	return () => {
		unregisterFocus();
		view?.removeEventListener('pagehide', onPageHide);
		view?.removeEventListener('pageshow', onPageShow);
		resizes.disconnect();
		root.removeEventListener('scroll', syncCursors);
		provider.awareness.off('update', syncCursors);
		clearPresence();
		binding.cursorsContainer = null;
		cursors.remove();
		const disconnect = (): void => {
			if (connections.get(provider) !== connection) {
				return;
			}
			connections.delete(provider);
			try {
				provider.disconnect();
			} catch {
				// A provider may throw when it is already disconnected, which is the goal here.
			}
		};
		if (connecting instanceof Promise) {
			void connecting.then(disconnect, disconnect);
		} else {
			disconnect();
		}
	};
}

/**
 * Binds the Editor to a Shared Document through Lexical's Yjs binding. Remote changes flow into
 * the Editor, and local changes flow into the Shared Document, except updates tagged to skip
 * collaboration. The provider is connected while the Editor is mounted.
 *
 * The Editor never seeds the Shared Document. When the Shared Document is empty, the Editor stays
 * empty until content arrives. Use {@link seedSharedDocument} to give a new one its content.
 *
 * Undo and redo use a Yjs undo manager that reverts only the local user's changes, so this
 * Extension conflicts with Lexical's `HistoryExtension`. Unmounting the Editor, or hiding the page,
 * removes the user's presence from other screens at once.
 *
 * Requires the optional peer dependencies `yjs` and `@lexical/yjs`.
 */
export const CollaborationExtension = defineExtension({
	name: 'blokki/collaboration',
	config: safeCast<CollaborationConfig>({ doc: null, provider: null, user: null }),
	// Lexical's default initial state writes an empty paragraph, which would seed the Shared
	// Document on connect.
	$initialEditorState: null,
	conflictsWith: ['@lexical/history/History'],
	dependencies: [configExtension(SharedDocumentExtension, { enabled: true })],
	build: (editor, config): CollaborationOutput => {
		const { doc } = requireOptions(config);
		const binding = createBindingV2__EXPERIMENTAL(
			editor,
			BINDING_ID,
			doc,
			new Map([[BINDING_ID, doc]])
		);
		// It tracks the binding's own transactions, so remote changes and Seeding are not undo
		// steps. register() destroys it.
		return { binding, undoManager: createUndoManager(binding, binding.root) };
	},
	register: (editor, config, state) => {
		const options = requireOptions(config);
		const { provider } = options;
		const { binding, undoManager } = state.getOutput();
		const contentOnly = withoutPresence(provider);
		const metadata = schemaMetadataOf(options.doc);
		const { versions } = schemaOf(editor);
		const { upgradeRequired } = sharedDocumentOf(editor);
		/**
		 * Compares the schema metadata with this client's Extensions. A client that cannot represent
		 * the document becomes read-only for good, and it never writes to the Shared Document again.
		 */
		const updateSchemaStatus = (): boolean => {
			if (upgradeRequired.value === null) {
				const reason = checkSchema(metadata, versions);
				if (reason !== null) {
					editor.setEditable(false);
					upgradeRequired.value = reason;
				}
			}
			return upgradeRequired.value === null;
		};
		const onUndoStackChange = (): void => {
			editor.dispatchCommand(CAN_UNDO_COMMAND, undoManager.undoStack.length > 0);
			editor.dispatchCommand(CAN_REDO_COMMAND, undoManager.redoStack.length > 0);
		};
		const onYjsChanges = (
			events: YEvent<XmlElement | XmlText>[],
			transaction: Transaction
		): void => {
			// The binding is the origin of the transactions that it writes itself.
			if (transaction.origin === binding) {
				return;
			}
			// The metadata that came with these changes decides whether this client can show them.
			const writable = updateSchemaStatus();
			try {
				syncYjsChangesToLexicalV2__EXPERIMENTAL(
					binding,
					editor.getRootElement() === null ? contentOnly : provider,
					events,
					transaction,
					transaction.origin instanceof UndoManager
				);
			} catch (error) {
				// A read-only client shows what it can. @lexical/yjs throws on node types that this
				// client lacks.
				if (writable) {
					throw error;
				}
			}
		};
		const onMetadataChange = (): void => {
			updateSchemaStatus();
		};
		const onStatus = ({ status }: { status: string }): void => {
			editor.dispatchCommand(CONNECTED_COMMAND, status === 'connected');
		};
		let disconnect: (() => void) | null = null;
		const stopConnection = (): void => {
			disconnect?.();
			disconnect = null;
		};

		updateSchemaStatus();
		binding.root.observeDeep(onYjsChanges);
		metadata.observe(onMetadataChange);
		provider.on('status', onStatus);
		undoManager.on('stack-item-added', onUndoStackChange);
		undoManager.on('stack-item-popped', onUndoStackChange);
		undoManager.on('stack-cleared', onUndoStackChange);
		return mergeRegister(
			() => binding.root.unobserveDeep(onYjsChanges),
			() => metadata.unobserve(onMetadataChange),
			() => provider.off('status', onStatus),
			() => undoManager.destroy(),
			editor.registerCommand(
				UNDO_COMMAND,
				() => {
					if (upgradeRequired.value === null) {
						undoManager.undo();
					}
					return true;
				},
				COMMAND_PRIORITY_EDITOR
			),
			editor.registerCommand(
				REDO_COMMAND,
				() => {
					if (upgradeRequired.value === null) {
						undoManager.redo();
					}
					return true;
				},
				COMMAND_PRIORITY_EDITOR
			),
			// The binding maps each Yjs text to the Lexical text nodes it last created. Lexical can drop
			// those nodes without reporting them, for example when it removes a text node that an edit
			// left empty, or when it collects the children of a removed element. The binding then reuses
			// a removed node on the next remote change and fails with "Lexical node does not exist in
			// active editor state". Forgetting every node that left the editor state makes it create
			// fresh nodes instead. @lexical/yjs reads EditorState._nodeMap the same way.
			editor.registerUpdateListener(({ prevEditorState, editorState }) => {
				const next = editorState._nodeMap;
				for (const key of prevEditorState._nodeMap.keys()) {
					if (!next.has(key)) {
						binding.mapping.deleteNode(key);
					}
				}
			}),
			editor.registerUpdateListener(
				({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
					if (tags.has(SKIP_COLLAB_TAG) || !updateSchemaStatus()) {
						return;
					}
					// A refill is not a user edit, and capturing it would clear the redo stack. Neither is a
					// Block ID repair. The undo manager skips transactions while isBootstrapping is set.
					const refill =
						isRefill(prevEditorState, editorState, tags) || tags.has(BLOCK_ID_REPAIR_TAG);
					binding.isBootstrapping ||= refill;
					try {
						options.doc.transact((transaction) => {
							syncLexicalUpdateToYjsV2__EXPERIMENTAL(
								binding,
								provider,
								prevEditorState,
								editorState,
								dirtyElements,
								dirtyLeaves,
								normalizedNodes,
								tags
							);
							// When the document now holds data that this client's code wrote, it records its
							// Schema Versions in the same transaction, so that no peer reads the data first.
							if (transaction.changed.size > 0 || transaction.deleteSet.clients.size > 0) {
								raiseSchema(metadata, versions, binding);
							}
						}, binding);
					} finally {
						if (refill) {
							binding.isBootstrapping = false;
						}
					}
				}
			),
			editor.registerCommand(
				TOGGLE_CONNECT_COMMAND,
				(shouldConnect) => {
					if (shouldConnect) {
						void provider.connect();
					} else {
						provider.disconnect();
					}
					return true;
				},
				COMMAND_PRIORITY_EDITOR
			),
			// Only a mounted Editor connects. A headless editor, such as the one behind
			// editor.getSnapshot(), reads the Shared Document without joining the session.
			editor.registerRootListener((root) => {
				stopConnection();
				if (root !== null) {
					disconnect = joinSession(editor, binding, options, root);
				}
			}),
			stopConnection
		);
	},
	afterRegistration: (editor, config, state) => {
		const { binding } = state.getOutput();
		// Shows content that the Shared Document already holds. An empty Shared Document is left
		// alone, because Lexical fills an empty root with a paragraph that would seed it.
		// The root element is attached later, so this load syncs content only.
		if (binding.root.length > 0) {
			try {
				syncYjsStateToLexicalV2__EXPERIMENTAL(
					binding,
					withoutPresence(requireOptions(config).provider)
				);
			} catch (error) {
				// A client that cannot represent the document shows what it can.
				if (sharedDocumentOf(editor).upgradeRequired.value === null) {
					throw error;
				}
			}
		}
		return () => {};
	}
});

/**
 * Turns on collaboration for an Editor. Add the result to the Editor's `extensions`.
 *
 * @example
 * ```ts
 * import { collaboration } from 'blokki/collab';
 *
 * const editor = createEditor({
 * 	extensions: [collaboration({ doc, provider, user: { id: 'u1', name: 'Ada' } })]
 * });
 * ```
 */
export function collaboration(options: CollaborationOptions) {
	return configExtension(CollaborationExtension, options);
}
