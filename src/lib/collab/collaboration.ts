import {
	CONNECTED_COMMAND,
	createBindingV2__EXPERIMENTAL,
	initLocalState,
	syncCursorPositions,
	syncLexicalUpdateToYjsV2__EXPERIMENTAL,
	syncYjsChangesToLexicalV2__EXPERIMENTAL,
	syncYjsStateToLexicalV2__EXPERIMENTAL,
	TOGGLE_CONNECT_COMMAND,
	type BindingV2,
	type Provider
} from '@lexical/yjs';
import {
	COMMAND_PRIORITY_EDITOR,
	configExtension,
	defineExtension,
	mergeRegister,
	safeCast,
	SKIP_COLLAB_TAG,
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
import { SharedDocumentExtension } from '../core/shared-document.js';

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
 * The latest connection of each provider. An app can reuse one provider across mounts, and the
 * teardown of an earlier mount may run after its connect() promise settles, when a later mount
 * owns the connection.
 */
const connections = new WeakMap<Provider, symbol>();

/**
 * Publishes the user's presence and connects the provider. Returns a function that clears the
 * presence and disconnects, unless a later connection has replaced this one.
 */
function connect(
	editor: LexicalEditor,
	binding: BindingV2,
	options: CollaborationOptions
): () => void {
	const { provider, user } = options;
	const connection = Symbol('connection');
	connections.set(provider, connection);
	const root = editor.getRootElement();
	initLocalState(
		provider,
		user.name,
		user.color ?? colorFor(user.id),
		root !== null && root.ownerDocument.activeElement === root,
		{ userId: user.id }
	);
	const onAwarenessUpdate = (): void => {
		syncCursorPositions(binding, provider);
	};
	provider.awareness.on('update', onAwarenessUpdate);
	const connecting = provider.connect();
	return () => {
		provider.awareness.off('update', onAwarenessUpdate);
		provider.awareness.setLocalState(null);
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
 * empty until content arrives.
 *
 * Requires the optional peer dependencies `yjs` and `@lexical/yjs`.
 */
export const CollaborationExtension = defineExtension({
	name: 'blokki/collaboration',
	config: safeCast<CollaborationConfig>({ doc: null, provider: null, user: null }),
	// Lexical's default initial state writes an empty paragraph, which would seed the Shared
	// Document on connect.
	$initialEditorState: null,
	dependencies: [configExtension(SharedDocumentExtension, { enabled: true })],
	build: (editor, config): CollaborationOutput => {
		const { doc } = requireOptions(config);
		return {
			binding: createBindingV2__EXPERIMENTAL(editor, BINDING_ID, doc, new Map([[BINDING_ID, doc]]))
		};
	},
	register: (editor, config, state) => {
		const options = requireOptions(config);
		const { provider } = options;
		const { binding } = state.getOutput();
		const contentOnly = withoutPresence(provider);
		const onYjsChanges = (
			events: YEvent<XmlElement | XmlText>[],
			transaction: Transaction
		): void => {
			// The binding is the origin of the transactions that it writes itself.
			if (transaction.origin !== binding) {
				syncYjsChangesToLexicalV2__EXPERIMENTAL(
					binding,
					editor.getRootElement() === null ? contentOnly : provider,
					events,
					transaction,
					transaction.origin instanceof UndoManager
				);
			}
		};
		const onStatus = ({ status }: { status: string }): void => {
			editor.dispatchCommand(CONNECTED_COMMAND, status === 'connected');
		};
		let disconnect: (() => void) | null = null;
		const stopConnection = (): void => {
			disconnect?.();
			disconnect = null;
		};

		binding.root.observeDeep(onYjsChanges);
		provider.on('status', onStatus);
		return mergeRegister(
			() => binding.root.unobserveDeep(onYjsChanges),
			() => provider.off('status', onStatus),
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
					if (!tags.has(SKIP_COLLAB_TAG)) {
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
				if (root === null) {
					stopConnection();
				} else if (disconnect === null) {
					disconnect = connect(editor, binding, options);
				}
			}),
			stopConnection
		);
	},
	afterRegistration: (_editor, config, state) => {
		const { binding } = state.getOutput();
		// Shows content that the Shared Document already holds. An empty Shared Document is left
		// alone, because Lexical fills an empty root with a paragraph that would seed it.
		// The root element is attached later, so this load syncs content only.
		if (binding.root.length > 0) {
			syncYjsStateToLexicalV2__EXPERIMENTAL(
				binding,
				withoutPresence(requireOptions(config).provider)
			);
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
