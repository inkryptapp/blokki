import { getExtensionDependencyFromEditor } from '@lexical/extension';
import { defineExtension, safeCast, type LexicalEditor } from 'lexical';

/** Configuration of {@link SharedDocumentExtension}. */
export interface SharedDocumentConfig {
	/** Whether a Shared Document provides the editor's content. */
	readonly enabled: boolean;
}

/**
 * Records whether a Shared Document is the source of truth for an editor's content, as it is
 * when the collaboration Extension is enabled. Snapshots are then exported from the editor and
 * never imported into it.
 */
export const SharedDocumentExtension = defineExtension({
	name: 'blokki/shared-document',
	config: safeCast<SharedDocumentConfig>({ enabled: false })
});

/** Whether a Shared Document provides the content of an editor built with `CoreExtension`. */
export function usesSharedDocument(editor: LexicalEditor): boolean {
	return getExtensionDependencyFromEditor(editor, SharedDocumentExtension).config.enabled;
}
