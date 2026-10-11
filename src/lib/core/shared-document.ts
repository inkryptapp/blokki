import { getExtensionDependencyFromEditor, signal, type Signal } from '@lexical/extension';
import { defineExtension, safeCast, type LexicalEditor } from 'lexical';
import type { UpgradeRequiredError } from './schema.js';

/** Configuration of {@link SharedDocumentExtension}. */
export interface SharedDocumentConfig {
	/** Whether a Shared Document provides the editor's content. */
	readonly enabled: boolean;
}

/** Output of {@link SharedDocumentExtension}. */
export interface SharedDocumentOutput {
	/**
	 * Set once the Shared Document needs newer code than the app runs. The editor is read-only
	 * from then on, and it never writes to the Shared Document again.
	 */
	readonly upgradeRequired: Signal<UpgradeRequiredError | null>;
}

/**
 * Records whether a Shared Document is the source of truth for an editor's content, as it is
 * when the collaboration Extension is enabled. Snapshots are then exported from the editor and
 * never imported into it.
 */
export const SharedDocumentExtension = defineExtension({
	name: 'blokki/shared-document',
	config: safeCast<SharedDocumentConfig>({ enabled: false }),
	build: (): SharedDocumentOutput => ({
		upgradeRequired: signal<UpgradeRequiredError | null>(null)
	})
});

/** The Shared Document state of an editor built with `CoreExtension`. */
export function sharedDocumentOf(
	editor: LexicalEditor
): SharedDocumentConfig & SharedDocumentOutput {
	const { config, output } = getExtensionDependencyFromEditor(editor, SharedDocumentExtension);
	return { enabled: config.enabled, upgradeRequired: output.upgradeRequired };
}

/** Whether a Shared Document provides the content of an editor built with `CoreExtension`. */
export function usesSharedDocument(editor: LexicalEditor): boolean {
	return sharedDocumentOf(editor).enabled;
}
