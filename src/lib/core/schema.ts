import {
	configExtension,
	defineExtension,
	safeCast,
	type LexicalEditor,
	type SerializedRootNode
} from 'lexical';
import { getExtensionDependencyFromEditor } from '@lexical/extension';

/**
 * The Schema Version of each Extension that defines node types, keyed by the Extension's schema
 * name. A Snapshot records one, for example `{ "core": 1, "callout": 1 }`.
 */
export type SchemaMap = Readonly<Record<string, number>>;

/**
 * Upgrades a document from one Schema Version of an Extension to the next. It receives the
 * serialized root node in the previous version's format and returns it in the next version's
 * format. It must be a pure function: it never mutates its input, and it can change any node in
 * the document, including node types that other Extensions define.
 */
export type Migration = (root: SerializedRootNode) => SerializedRootNode;

/** Declares the Schema Version of the node types that one Extension defines. */
export interface SchemaDeclaration {
	/** The key of the Extension in a schema map, such as `core` or `acme/kanban`. */
	readonly name: string;
	/** The current Schema Version. A positive integer. */
	readonly version: number;
	/**
	 * The Migration for every version bump, keyed by the version it produces: `migrations[2]`
	 * upgrades version 1 to version 2. Every version from 2 up to `version` needs one.
	 *
	 * @defaultValue `{}`
	 */
	readonly migrations?: Readonly<Record<number, Migration>>;
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
	/** Every declaration, in dependency order. Pending Migrations run in this order. */
	readonly declarations: readonly SchemaDeclaration[];
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
		for (const { name, version, migrations } of schemas) {
			if (!Number.isSafeInteger(version) || version < 1) {
				throw new RangeError(
					`Schema "${name}" has version ${version}, which is not a positive integer.`
				);
			}
			if (versions.has(name)) {
				throw new Error(`Schema "${name}" is declared more than once.`);
			}
			for (let target = 2; target <= version; target += 1) {
				if (migrations?.[target] === undefined) {
					throw new Error(`Schema "${name}" has no Migration to version ${target}.`);
				}
			}
			versions.set(name, version);
		}
		return { versions: Object.fromEntries(versions), declarations: schemas };
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

/** Reads the Schema Versions and declarations of an editor built with {@link SchemaExtension}. */
export function schemaOf(editor: LexicalEditor): SchemaOutput {
	return getExtensionDependencyFromEditor(editor, SchemaExtension).output;
}

/**
 * The base class of the errors that mean a document needs newer code than the app runs. An
 * Editor that meets one opens the document read-only.
 */
export class UpgradeRequiredError extends Error {
	override readonly name: string = 'UpgradeRequiredError';
}

/**
 * Thrown when a Snapshot uses a newer Schema Version of an Extension than the running code
 * supports. blokki never downgrades a document.
 */
export class NewerSchemaVersionError extends UpgradeRequiredError {
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

/**
 * Reported when a Shared Document uses an Extension that the app does not enable. The client
 * cannot represent those nodes, so it opens the document read-only.
 */
export class MissingExtensionError extends UpgradeRequiredError {
	override readonly name = 'MissingExtensionError';
	/** The schema name of the missing Extension. */
	readonly schema: string;
	/** The Schema Version that the document records for it. */
	readonly documentVersion: number;

	constructor(schema: string, documentVersion: number) {
		super(
			`The document uses version ${documentVersion} of the "${schema}" schema, but this app does not enable its Extension.`
		);
		this.schema = schema;
		this.documentVersion = documentVersion;
	}
}
