import { configExtension, defineExtension, safeCast, type LexicalEditor } from 'lexical';
import { getExtensionDependencyFromEditor } from '@lexical/extension';

/**
 * The Schema Version of each Extension that defines node types, keyed by the Extension's schema
 * name. A Snapshot records one, for example `{ "core": 1, "callout": 1 }`.
 */
export type SchemaMap = Readonly<Record<string, number>>;

/** Declares the Schema Version of the node types that one Extension defines. */
export interface SchemaDeclaration {
	/** The key of the Extension in a schema map, such as `core` or `acme/kanban`. */
	readonly name: string;
	/** The current Schema Version. A positive integer. */
	readonly version: number;
}

/** Configuration of {@link SchemaExtension}. */
export interface SchemaConfig {
	/** Every Schema Version declared by the Extensions of an editor. */
	readonly schemas: readonly SchemaDeclaration[];
}

/** Output of {@link SchemaExtension}. */
export interface SchemaOutput {
	/** The Schema Version of every enabled Extension that defines node types. */
	readonly versions: SchemaMap;
}

/**
 * Collects the Schema Versions that Extensions declare. An Extension that defines node types
 * declares its version by depending on {@link declareSchema}.
 */
export const SchemaExtension = defineExtension({
	name: 'blokki/schema',
	config: safeCast<SchemaConfig>({ schemas: [] }),
	mergeConfig: (config, overrides) => ({
		schemas: [...config.schemas, ...(overrides.schemas ?? [])]
	}),
	build: (_editor, { schemas }): SchemaOutput => {
		// A Map, because a schema name such as "constructor" would collide with an object's
		// inherited properties.
		const versions = new Map<string, number>();
		for (const { name, version } of schemas) {
			if (!Number.isSafeInteger(version) || version < 1) {
				throw new RangeError(
					`Schema "${name}" has version ${version}, which is not a positive integer.`
				);
			}
			if (versions.has(name)) {
				throw new Error(`Schema "${name}" is declared more than once.`);
			}
			versions.set(name, version);
		}
		return { versions: Object.fromEntries(versions) };
	}
});

/**
 * Declares the Schema Version of an Extension's node types. Add the result to the Extension's
 * `dependencies`.
 *
 * @example
 * ```ts
 * const KanbanExtension = defineExtension({
 * 	name: 'acme/kanban',
 * 	nodes: [KanbanNode],
 * 	dependencies: [declareSchema({ name: 'acme/kanban', version: 3 })]
 * });
 * ```
 */
export function declareSchema(declaration: SchemaDeclaration) {
	return configExtension(SchemaExtension, { schemas: [declaration] });
}

/** Reads the schema map of an editor built with {@link SchemaExtension}. */
export function schemaVersionsOf(editor: LexicalEditor): SchemaMap {
	return getExtensionDependencyFromEditor(editor, SchemaExtension).output.versions;
}

/**
 * Thrown when a Snapshot uses a newer Schema Version of an Extension than the running code
 * supports. blokki never downgrades a document.
 */
export class NewerSchemaVersionError extends Error {
	override readonly name = 'NewerSchemaVersionError';
	/** The schema name of the Extension, such as `core`. */
	readonly schema: string;
	/** The Schema Version that the document records. */
	readonly documentVersion: number;
	/** The newest Schema Version that the running code supports. */
	readonly supportedVersion: number;

	constructor(schema: string, documentVersion: number, supportedVersion: number) {
		super(
			`The document uses version ${documentVersion} of the "${schema}" schema, but this code supports up to version ${supportedVersion}.`
		);
		this.schema = schema;
		this.documentVersion = documentVersion;
		this.supportedVersion = supportedVersion;
	}
}
