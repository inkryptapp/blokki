import type { Doc, Map as YMap } from 'yjs';
import {
	MissingExtensionError,
	NewerSchemaVersionError,
	type SchemaMap,
	type UpgradeRequiredError
} from '../core/index.js';

/**
 * The Yjs map in which a Shared Document records its Schema Versions. It holds one key per
 * Schema Version that a client has written with, such as `acme/note@3`. A key never changes its
 * value, so concurrent raises merge as a union. A single entry per schema would merge as last
 * writer wins and could keep a lower version than the content needs.
 */
export function schemaMetadataOf(doc: Doc): YMap<true> {
	return doc.getMap<true>('blokki-schema');
}

const KEY = /^(.+)@(\d+)$/;

/** The recorded schema map: the highest recorded version of each schema. */
export function recordedSchema(metadata: YMap<true>): SchemaMap {
	const recorded = new Map<string, number>();
	for (const key of metadata.keys()) {
		const match = KEY.exec(key);
		if (match?.[1] !== undefined && match[2] !== undefined) {
			const [, schema, version] = match;
			recorded.set(schema, Math.max(recorded.get(schema) ?? 0, Number(version)));
		}
	}
	return Object.fromEntries(recorded);
}

/** The recorded schema map of a Shared Document. */
export function recordedSchemaOf(doc: Doc): SchemaMap {
	return recordedSchema(schemaMetadataOf(doc));
}

/**
 * Compares the recorded schema map with the `supported` Schema Versions. Returns the first reason
 * why a client cannot represent the document, or null.
 */
export function checkSchema(
	metadata: YMap<true>,
	supported: SchemaMap
): UpgradeRequiredError | null {
	for (const [schema, recorded] of Object.entries(recordedSchema(metadata))) {
		const own = Object.hasOwn(supported, schema) ? supported[schema] : undefined;
		if (own === undefined) {
			return new MissingExtensionError(schema, recorded);
		}
		if (recorded > own) {
			return new NewerSchemaVersionError(schema, recorded, own);
		}
	}
	return null;
}

/**
 * Records the `supported` Schema Versions that are newer than the recorded ones. A client calls
 * it when it writes, because the document then holds data that its code wrote.
 */
export function raiseSchema(metadata: YMap<true>, supported: SchemaMap, origin: unknown): void {
	const recorded = recordedSchema(metadata);
	const raises = Object.entries(supported).filter(
		([schema, version]) => !Object.hasOwn(recorded, schema) || (recorded[schema] ?? 0) < version
	);
	if (raises.length > 0 && metadata.doc !== null) {
		metadata.doc.transact(() => {
			for (const [schema, version] of raises) {
				metadata.set(`${schema}@${version}`, true);
			}
		}, origin);
	}
}
