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
	type Snapshot
} from '../core/index.js';

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
	 * The document to start with. Without it, the Editor starts with one empty paragraph.
	 */
	readonly content?: Snapshot;
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
	 * state after an unmount.
	 */
	getSnapshot(): Snapshot;
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

	constructor({ extensions = [], content }: EditorOptions) {
		this.#extensions = [...extensions];
		this.#content = content;
	}

	getSnapshot(): Snapshot {
		if (this.#lexical !== null) {
			return exportSnapshot(this.#lexical);
		}
		// Round-trips through a headless editor, so the result has the same form as a mounted
		// export, including the schema map of the enabled Extensions.
		const headless = createHeadlessEditor({ extensions: this.#extensions });
		try {
			if (this.#content !== undefined) {
				importSnapshot(headless, this.#content);
			}
			return exportSnapshot(headless);
		} finally {
			headless.dispose();
		}
	}

	get lexical(): LexicalEditor {
		if (this.#lexical === null) {
			throw new Error('The Editor is not mounted. Show it with EditorContent first.');
		}
		return this.#lexical;
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
		if (this.#content !== undefined) {
			try {
				importSnapshot(lexical, this.#content);
			} catch (error) {
				lexical.dispose();
				throw error;
			}
		}
		lexical.setRootElement(root);
		this.#lexical = lexical;
		return () => {
			this.#content = exportSnapshot(lexical);
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
