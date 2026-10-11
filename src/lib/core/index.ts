/**
 * Headless document functions for blokki. Everything exported here runs in Node and in the
 * browser without Svelte.
 *
 * @packageDocumentation
 */
export { CoreExtension, createHeadlessEditor, type HeadlessEditorOptions } from './headless.js';
export {
	declareSchema,
	NewerSchemaVersionError,
	SchemaExtension,
	UpgradeRequiredError,
	type Migration,
	type SchemaConfig,
	type SchemaDeclaration,
	type SchemaMap,
	type SchemaOutput
} from './schema.js';
export {
	exportSnapshot,
	importSnapshot,
	InvalidSnapshotError,
	parseSnapshot,
	type Snapshot
} from './snapshot.js';
