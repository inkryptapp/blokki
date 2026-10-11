import { readFileSync } from 'node:fs';
import type { LexicalEditorWithDispose } from '@lexical/extension';
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isParagraphNode,
	$isTextNode,
	type LexicalEditor
} from 'lexical';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Network, type Faults, type TestProvider } from '../../test-utils/collab/network.js';
import { createHeadlessEditor, exportSnapshot, parseSnapshot } from '../core/index.js';
import { collaboration } from './index.js';
import { seedSharedDocument } from './seed.js';

// Set BLOKKI_SEED to rerun one seed, for example after a failure.
const SEEDS =
	process.env.BLOKKI_SEED === undefined
		? Array.from({ length: 50 }, (_, index) => index + 1)
		: [Number(process.env.BLOKKI_SEED)];
const ROUNDS = 60;
const WORDS = ['a', 'bc', 'def', ' ', 'xy', 'Ünï', '🙂'];

const paragraphs = parseSnapshot(
	JSON.parse(
		readFileSync(new URL('../../test-fixtures/snapshots/paragraphs.json', import.meta.url), 'utf8')
	)
);

interface Peer {
	readonly editor: LexicalEditorWithDispose;
	readonly provider: TestProvider;
}

function pick<T>(random: () => number, items: readonly T[]): T | undefined {
	return items[Math.floor(random() * items.length)];
}

function joinPeers(network: Network, count: number): Peer[] {
	return Array.from({ length: count }, (_, index) => {
		const doc = new Y.Doc();
		// Yjs breaks ties between concurrent edits by client ID, so fixed IDs keep a seed reproducible.
		doc.clientID = index + 1;
		if (index === 0) {
			seedSharedDocument(doc, paragraphs);
		}
		const provider = network.join(doc);
		const user = { id: `user-${index}`, name: `User ${index}` };
		const editor = createHeadlessEditor({ extensions: [collaboration({ doc, provider, user })] });
		// A headless editor never mounts, so the test connects its provider.
		provider.connect();
		return { editor, provider };
	});
}

/**
 * The UTF-16 offsets in `text` that fall between whole characters. Editing never splits a
 * surrogate pair, and Yjs would replace half of one with U+FFFD.
 */
function boundaries(text: string): number[] {
	const offsets = [0];
	let offset = 0;
	for (const character of text) {
		offset += character.length;
		offsets.push(offset);
	}
	return offsets;
}

/** Applies one random paragraph edit as the local user of `editor`. */
function editRandomly(editor: LexicalEditor, random: () => number): void {
	editor.update(
		() => {
			const root = $getRoot();
			const paragraphNodes = root.getChildren().filter($isParagraphNode);
			const paragraph = pick(random, paragraphNodes);
			const word = pick(random, WORDS) ?? 'a';
			if (paragraph === undefined) {
				root.append($createParagraphNode().append($createTextNode(word)));
				return;
			}
			const text = pick(random, paragraph.getChildren().filter($isTextNode));
			const roll = random();
			if (roll < 0.4) {
				if (text === undefined) {
					paragraph.append($createTextNode(word));
				} else {
					text.spliceText(pick(random, boundaries(text.getTextContent())) ?? 0, 0, word);
				}
			} else if (roll < 0.6) {
				if (text !== undefined && text.getTextContentSize() > 0) {
					const offsets = boundaries(text.getTextContent());
					const start = Math.floor(random() * (offsets.length - 1));
					const end = start + 1 + Math.floor(random() * (offsets.length - 1 - start));
					const from = offsets[start] ?? 0;
					text.spliceText(from, (offsets[end] ?? from) - from, '');
				}
			} else if (roll < 0.75) {
				paragraph.insertAfter($createParagraphNode().append($createTextNode(word)));
			} else if (roll < 0.85) {
				if (paragraphNodes.length > 1) {
					paragraph.remove();
				}
			} else if (text !== undefined) {
				text.toggleFormat('bold');
			}
		},
		{ discrete: true }
	);
}

/** Splits the peers into two random groups. */
function partitionRandomly(network: Network, peers: readonly Peer[]): void {
	const providers = peers.map(({ provider }) => provider);
	const cut = 1 + Math.floor(network.random() * (providers.length - 1));
	network.partition([providers.slice(0, cut), providers.slice(cut)]);
}

/** Heals the network and resynchronizes until no message is left in flight. */
function settle(network: Network, peers: readonly Peer[]): string[] {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		network.settle();
		// Exporting flushes each editor's pending updates, which can write back to Yjs.
		const snapshots = peers.map(({ editor }) => JSON.stringify(exportSnapshot(editor)));
		if (network.pending === 0) {
			return snapshots;
		}
	}
	throw new Error('The peers kept exchanging messages after the network settled.');
}

/** Runs one seeded session and returns the Snapshot that every peer converged on. */
function runSeed(seed: number, faults: Partial<Faults>, partitions: boolean): string {
	const network = new Network(seed);
	const peers = joinPeers(network, 2 + (seed % 2));
	try {
		network.setFaults(faults);
		for (let round = 0; round < ROUNDS; round += 1) {
			const peer = pick(network.random, peers);
			if (peer !== undefined) {
				editRandomly(peer.editor, network.random);
			}
			if (partitions && network.random() < 0.1) {
				if (network.random() < 0.5) {
					partitionRandomly(network, peers);
				} else {
					network.heal();
				}
			}
			for (let steps = Math.floor(network.random() * 4); steps > 0; steps -= 1) {
				network.step();
			}
		}
		const [first = '', ...rest] = settle(network, peers);
		for (const snapshot of rest) {
			expect(snapshot).toBe(first);
		}
		return first;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Seed ${seed} failed. Rerun it with BLOKKI_SEED=${seed}.\n${reason}`, {
			cause: error
		});
	} finally {
		for (const { editor } of peers) {
			editor.dispose();
		}
		network.destroy();
	}
}

describe.each([
	['delayed', { delay: 6 }, false],
	['reordered', { delay: 3, reorder: true }, false],
	['dropped', { drop: 0.2 }, false],
	['partitioned', {}, true],
	['delayed, reordered, dropped, and partitioned', { delay: 6, reorder: true, drop: 0.15 }, true]
] as const)('Editors converge with %s messages', (_, faults, partitions) => {
	it.each(SEEDS)('seed %i', (seed) => {
		runSeed(seed, faults, partitions);
	});
});

describe('seeded sessions', () => {
	it('replay identically from the same seed', () => {
		const faults = { delay: 6, reorder: true, drop: 0.15 };

		expect(runSeed(7, faults, true)).toBe(runSeed(7, faults, true));
		expect(runSeed(7, faults, true)).not.toBe(runSeed(8, faults, true));
	});
});
