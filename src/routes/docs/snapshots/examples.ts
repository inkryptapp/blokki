export const shape = `{
	"schema": { "core": 1 },
	"root": {
		"children": [
			{
				"children": [
					{ "detail": 0, "format": 0, "mode": "normal", "style": "", "text": "Hello.", "type": "text", "version": 1 }
				],
				"direction": null,
				"format": "",
				"indent": 0,
				"textFormat": 0,
				"textStyle": "",
				"type": "paragraph",
				"version": 1,
				"$": { "blockId": "q2V7xK_9bA" }
			}
		],
		"direction": null,
		"format": "",
		"indent": 0,
		"type": "root",
		"version": 1
	}
}`;

export const saveAndLoad = `import { createEditor } from 'blokki';
import { parseSnapshot } from 'blokki/core';

// Save
const json = JSON.stringify(editor.getSnapshot());

// Load
const restored = createEditor({ content: parseSnapshot(JSON.parse(json)) });`;

export const headless = `import { createHeadlessEditor, exportSnapshot, importSnapshot, parseSnapshot } from 'blokki/core';
import type { Snapshot } from 'blokki/core';

/** Upgrades a stored Snapshot to the Schema Versions of the current code. */
export function upgrade(json: string): Snapshot {
	const editor = createHeadlessEditor({ extensions });
	try {
		importSnapshot(editor, parseSnapshot(JSON.parse(json)));
		return exportSnapshot(editor);
	} finally {
		editor.dispose();
	}
}`;

export const upgradeRequired = `const editor = createEditor({
	content,
	onUpgradeRequired: (error) => {
		console.warn(error.message);
		showNotice('This document was saved by a newer version of the app.');
	}
});`;
