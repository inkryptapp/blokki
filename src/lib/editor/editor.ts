import {
	buildEditorFromExtensions,
	effect,
	RootElementExtension,
	WatchEditableExtension,
	type AnyLexicalExtensionArgument,
	type LexicalEditorWithDispose
} from '@lexical/extension';
import { defineExtension, type LexicalEditor } from 'lexical';
import {
	CoreExtension,
	createHeadlessEditor,
	exportSnapshot,
	importSnapshot,
	NewerSchemaVersionError,
	type Snapshot,
	type UpgradeRequiredError
} from '../core/index.js';
import { findBlockKey } from '../core/block-id.js';
import { loadRoot } from '../core/snapshot.js';
import { sharedDocumentOf, usesSharedDocument } from '../core/shared-document.js';

/** Options for {@link createEditor}. */
export interface EditorOptions {
	/**
	 * Lexical extensions to enable in addition to rich-text paragraph editing. Each one is a
	 * Lexical extension made with `defineExtension` or configured with `configExtension`.
	 *
	 * @defaultValue `[]`
	 */
	readonly extensions?: readonly AnyLexicalExtensionArgument[];
	/**
	 * The document to start with. Without it, the Editor starts with one empty paragraph. When
	 * collaboration is on, the Shared Document provides the content and this option is ignored.
	 */
	readonly content?: Snapshot;
	/**
	 * Called when the document needs newer code than the app runs: when the `content` Snapshot
	 * or the Shared Document uses a newer Schema Version of an Extension, or when the Shared
	 * Document uses an Extension that the app does not enable. The Editor shows the document
	 * read-only from then on, never downgrades it, and never writes to the Shared Document again.
	 * Called at most once.
	 */
	readonly onUpgradeRequired?: (error: UpgradeRequiredError) => void;
	/**
	 * Builds the URL of an Anchor Link, which points to one Block through its Block ID.
	 *
	 * @defaultValue `` (blockId) => `#${blockId}` ``
	 */
	readonly anchorLink?: (blockId: string) => string;
}

/**
 * One independent editing instance. Create it with {@link createEditor} and show it with
 * `EditorContent`. Each Editor keeps its own state, so a page can host many of them.
 */
export interface Editor {
	/**
	 * The Lexical editor behind this Editor, for advanced use. It exists while `EditorContent`
	 * shows the Editor, and each mount creates a new one.
	 *
	 * This property follows Lexical's versioning and is outside the semver promise of blokki. A
	 * blokki release that upgrades Lexical can change it in any way that Lexical changes.
	 *
	 * @throws Error when no `EditorContent` shows this Editor.
	 */
	readonly lexical: LexicalEditor;

	/**
	 * Returns the current document as a Snapshot. While the Editor is not mounted, it returns the
	 * content that the next mount shows: the `content` option at first, and the last mounted
	 * state after an unmount. When collaboration is on, the Snapshot is derived from the Shared
	 * Document.
	 *
	 * @throws {@link UpgradeRequiredError} when collaboration is on and the Shared Document needs
	 * newer code. The Editor cannot represent all of it, so a Snapshot would lose content.
	 */
	getSnapshot(): Snapshot;

	/**
	 * Why the document needs newer code than the app runs, or `null`. While it is set, the Editor
	 * is read-only, and {@link Editor.getSnapshot} returns the document unchanged.
	 */
	readonly upgradeRequired: UpgradeRequiredError | null;

	/** Returns the Anchor Link URL of a Block, built by the `anchorLink` option. */
	getAnchorLink(blockId: string): string;

	/**
	 * Scrolls the Block with `blockId` into view. Returns false when the Editor is not mounted or
	 * has no such Block.
	 */
	scrollToBlock(blockId: string): boolean;
}

/** Keeps the root's `contenteditable` attribute in step with Lexical's editable state. */
const ContentEditableExtension = defineExtension({
	name: 'blokki/content-editable',
	dependencies: [RootElementExtension, WatchEditableExtension],
	register: (_editor, _config, state) => {
		const rootElement = state.getDependency(RootElementExtension).output;
		const editable = state.getDependency(WatchEditableExtension).output;
		return effect(() => {
			const root = rootElement.value;
			if (root === null) {
				return undefined;
			}
			root.contentEditable = editable.value ? 'true' : 'false';
			return () => root.removeAttribute('contenteditable');
		});
	}
});

class EditorController implements Editor {
	readonly #extensions: AnyLexicalExtensionArgument[];
	#lexical: LexicalEditorWithDispose | null = null;
	/** The content the next mount loads. It is updated from the Lexical editor on unmount. */
	#content: Snapshot | undefined;
	readonly #onUpgradeRequired: ((error: UpgradeRequiredError) => void) | undefined;
	readonly #anchorLink: (blockId: string) => string;
	#upgradeRequired: UpgradeRequiredError | null = null;

	constructor({
		extensions = [],
		content,
		onUpgradeRequired,
		anchorLink = (blockId) => `#${blockId}`
	}: EditorOptions) {
		this.#extensions = [...extensions];
		this.#content = content;
		this.#onUpgradeRequired = onUpgradeRequired;
		this.#anchorLink = anchorLink;
	}

	getAnchorLink(blockId: string): string {
		return this.#anchorLink(blockId);
	}

	scrollToBlock(blockId: string): boolean {
		const lexical = this.#lexical;
		if (lexical === null) {
			return false;
		}
		const key = findBlockKey(lexical, blockId);
		const element = key === null ? null : lexical.getElementByKey(key);
		element?.scrollIntoView({ block: 'start' });
		return element !== null && element !== undefined;
	}

	get upgradeRequired(): UpgradeRequiredError | null {
		return this.#upgradeRequired;
	}

	getSnapshot(): Snapshot {
		if (this.#lexical !== null) {
			return this.#export(this.#lexical);
		}
		// Round-trips through a headless editor, so the result has the same form as a mounted
		// export, including the schema map of the enabled Extensions.
		const headless = createHeadlessEditor({ extensions: this.#extensions });
		try {
			if (this.#content !== undefined && !usesSharedDocument(headless)) {
				try {
					importSnapshot(headless, this.#content);
				} catch (error) {
					if (error instanceof NewerSchemaVersionError) {
						return this.#content;
					}
					throw error;
				}
			}
			if (usesSharedDocument(headless)) {
				return this.#export(headless);
			}
			// The import can add Block IDs and run Migrations, and an empty document gets a new
			// paragraph. Keeping the result makes the next export and the next mount agree with it.
			this.#content = this.#export(headless);
			return this.#content;
		} finally {
			headless.dispose();
		}
	}

	#export(lexical: LexicalEditor): Snapshot {
		if (usesSharedDocument(lexical)) {
			// The editor holds only the part of the Shared Document that it can represent.
			const reason = sharedDocumentOf(lexical).upgradeRequired.value;
			if (reason !== null) {
				throw reason;
			}
		} else if (this.#upgradeRequired !== null && this.#content !== undefined) {
			// Exporting a newer document would label it with this code's older Schema Versions.
			return this.#content;
		}
		return exportSnapshot(lexical);
	}

	get lexical(): LexicalEditor {
		if (this.#lexical === null) {
			throw new Error('The Editor is not mounted. Show it with EditorContent first.');
		}
		return this.#lexical;
	}

	/**
	 * Imports `content`. A newer document is reported first, then shown read-only as far as this
	 * code can parse it. When it cannot parse the document at all, the Editor stays empty.
	 */
	#load(lexical: LexicalEditor, content: Snapshot): void {
		try {
			importSnapshot(lexical, content);
		} catch (error) {
			if (!(error instanceof NewerSchemaVersionError)) {
				throw error;
			}
			lexical.setEditable(false);
			this.#requireUpgrade(error);
			try {
				loadRoot(lexical, content.root);
			} catch {
				// The upgrade is already reported, and getSnapshot() keeps returning the document.
			}
		}
	}

	#requireUpgrade(error: UpgradeRequiredError): void {
		if (this.#upgradeRequired === null) {
			this.#upgradeRequired = error;
			this.#onUpgradeRequired?.(error);
		}
	}

	mount(root: HTMLElement): () => void {
		if (this.#lexical !== null) {
			throw new Error(
				'The Editor is already mounted. Show each Editor in one EditorContent at a time.'
			);
		}
		const lexical = buildEditorFromExtensions(
			defineExtension({
				name: 'blokki/editor',
				dependencies: [CoreExtension, ContentEditableExtension, ...this.#extensions]
			})
		);
		if (this.#content !== undefined && !usesSharedDocument(lexical)) {
			try {
				this.#load(lexical, this.#content);
			} catch (error) {
				lexical.dispose();
				throw error;
			}
		}
		const stopWatching = effect(() => {
			const reason = sharedDocumentOf(lexical).upgradeRequired.value;
			if (reason !== null) {
				this.#requireUpgrade(reason);
			}
		});
		lexical.setRootElement(root);
		this.#lexical = lexical;
		return () => {
			stopWatching();
			if (this.#upgradeRequired === null) {
				this.#content = exportSnapshot(lexical);
			}
			this.#lexical = null;
			lexical.dispose();
		};
	}
}

/**
 * Creates an Editor from configuration alone. It touches no DOM and builds no Lexical editor, so
 * it is safe to call in a component script during SSR. The Lexical editor is built when
 * `EditorContent` mounts the Editor in the browser.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 * 	import { createEditor, EditorContent } from 'blokki';
 *
 * 	const editor = createEditor();
 * </script>
 *
 * <EditorContent {editor} aria-label="Document" />
 * ```
 */
export function createEditor(options: EditorOptions = {}): Editor {
	return new EditorController(options);
}

/**
 * Builds the Lexical editor for `editor` and attaches it to `root`. Returns a function that
 * disposes the Lexical editor and detaches it from `root`.
 *
 * @throws TypeError when `editor` does not come from {@link createEditor}.
 * @throws Error when `editor` is already mounted.
 * @throws The error from `importSnapshot` when the Editor's content cannot be loaded. The Lexical
 * editor is disposed first.
 */
export function mountEditor(editor: Editor, root: HTMLElement): () => void {
	if (!(editor instanceof EditorController)) {
		throw new TypeError('EditorContent needs an Editor from createEditor().');
	}
	return editor.mount(root);
}
