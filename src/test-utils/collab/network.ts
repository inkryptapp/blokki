import type { Provider } from '@lexical/yjs';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';

/** Returns a pseudo-random number generator in [0, 1) that is fully determined by `seed`. */
export function createRandom(seed: number): () => number {
	// mulberry32
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Message faults that the network applies to every message it sends. */
export interface Faults {
	/** Most steps a message may wait before it can be delivered. */
	readonly delay: number;
	/** Deliver any ready message instead of the oldest one. */
	readonly reorder: boolean;
	/** Probability in [0, 1] that a message is lost. */
	readonly drop: number;
}

const NO_FAULTS: Faults = { delay: 0, reorder: false, drop: 0 };

interface Message {
	readonly from: TestProvider;
	readonly to: TestProvider;
	readonly kind: 'doc' | 'awareness';
	readonly payload: Uint8Array;
	readonly readyAt: number;
}

type Listener = (argument: never) => void;

/**
 * A provider for one peer on a {@link Network}. It implements the provider interface that
 * `@lexical/yjs` expects, and it moves updates only when the network delivers them.
 */
export class TestProvider implements Provider {
	readonly awareness: Awareness & Provider['awareness'];
	readonly doc: Y.Doc;
	connected = false;
	readonly #network: Network;
	readonly #listeners = new Map<string, Set<Listener>>();

	constructor(network: Network, doc: Y.Doc) {
		this.#network = network;
		this.doc = doc;
		// y-protocols types local state as a plain record, and Lexical's interface narrows it to
		// its own UserState shape, which every state that Lexical writes satisfies.
		this.awareness = new Awareness(doc) as Awareness & Provider['awareness'];
		doc.on('update', (update: Uint8Array, origin: unknown) => {
			if (origin !== this) {
				this.#network.broadcast(this, 'doc', update);
			}
		});
		this.awareness.on(
			'update',
			(changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
				if (origin === 'local') {
					const clients = [...changes.added, ...changes.updated, ...changes.removed];
					this.#network.broadcast(
						this,
						'awareness',
						encodeAwarenessUpdate(this.awareness, clients)
					);
				}
			}
		);
	}

	connect(): void {
		if (this.connected) {
			return;
		}
		this.connected = true;
		this.#emit('status', { status: 'connected' });
		this.#network.exchangeState(this);
		this.#emit('sync', true);
	}

	disconnect(): void {
		if (!this.connected) {
			return;
		}
		this.connected = false;
		this.#emit('status', { status: 'disconnected' });
	}

	on(type: 'sync', listener: (isSynced: boolean) => void): void;
	on(type: 'status', listener: (event: { status: string }) => void): void;
	on(type: 'update', listener: (update: unknown) => void): void;
	on(type: 'reload', listener: (doc: Y.Doc) => void): void;
	on(type: string, listener: Listener): void {
		const listeners = this.#listeners.get(type) ?? new Set<Listener>();
		listeners.add(listener);
		this.#listeners.set(type, listeners);
	}

	off(type: 'sync', listener: (isSynced: boolean) => void): void;
	off(type: 'status', listener: (event: { status: string }) => void): void;
	off(type: 'update', listener: (update: unknown) => void): void;
	off(type: 'reload', listener: (doc: Y.Doc) => void): void;
	off(type: string, listener: Listener): void {
		this.#listeners.get(type)?.delete(listener);
	}

	/** Number of awareness listeners other than the provider's own. */
	awarenessListenerCount(): number {
		// lib0's Observable keeps its listeners in _observers, and the provider registers one.
		return (this.awareness._observers.get('update')?.size ?? 0) - 1;
	}

	/** Number of listeners that are still registered on this provider. */
	listenerCount(): number {
		let count = 0;
		for (const listeners of this.#listeners.values()) {
			count += listeners.size;
		}
		return count;
	}

	receive(message: Message): void {
		if (message.kind === 'doc') {
			Y.applyUpdate(this.doc, message.payload, this);
		} else {
			applyAwarenessUpdate(this.awareness, message.payload, this);
		}
	}

	#emit(type: 'status', event: { status: string }): void;
	#emit(type: 'sync', isSynced: boolean): void;
	#emit(type: string, argument: unknown): void {
		for (const listener of this.#listeners.get(type) ?? []) {
			// The overloads of on() pair each event type with a listener for its argument.
			(listener as (argument: unknown) => void)(argument);
		}
	}
}

/**
 * A deterministic in-memory network that joins Yjs peers. Nothing moves until the test calls
 * {@link Network.step} or {@link Network.run}. A seeded random generator decides delays, delivery
 * order, and lost messages, so a seed reproduces a run exactly.
 */
export class Network {
	readonly random: () => number;
	readonly #peers: TestProvider[] = [];
	#queue: Message[] = [];
	#time = 0;
	#faults: Faults = NO_FAULTS;
	#groups: Map<TestProvider, number> | null = null;

	constructor(seed: number) {
		this.random = createRandom(seed);
	}

	/** Adds a peer for `doc`. It sends nothing until it connects. */
	join(doc: Y.Doc = new Y.Doc()): TestProvider {
		const provider = new TestProvider(this, doc);
		this.#peers.push(provider);
		return provider;
	}

	setFaults(faults: Partial<Faults>): void {
		this.#faults = { ...NO_FAULTS, ...faults };
	}

	/** Splits the peers into groups that cannot reach each other. Messages between groups are lost. */
	partition(groups: readonly (readonly TestProvider[])[]): void {
		this.#groups = new Map(groups.flatMap((group, index) => group.map((peer) => [peer, index])));
	}

	heal(): void {
		this.#groups = null;
	}

	get pending(): number {
		return this.#queue.length;
	}

	broadcast(from: TestProvider, kind: Message['kind'], payload: Uint8Array): void {
		for (const to of this.#peers) {
			if (to !== from) {
				this.#send(from, to, kind, payload);
			}
		}
	}

	/** Sends the full document and awareness state between `peer` and every other peer. */
	exchangeState(peer: TestProvider): void {
		for (const other of this.#peers) {
			if (other === peer) {
				continue;
			}
			this.#send(
				peer,
				other,
				'doc',
				Y.encodeStateAsUpdate(peer.doc, Y.encodeStateVector(other.doc))
			);
			this.#send(
				other,
				peer,
				'doc',
				Y.encodeStateAsUpdate(other.doc, Y.encodeStateVector(peer.doc))
			);
			this.#send(
				peer,
				other,
				'awareness',
				encodeAwarenessUpdate(peer.awareness, [peer.doc.clientID])
			);
			this.#send(
				other,
				peer,
				'awareness',
				encodeAwarenessUpdate(other.awareness, [other.doc.clientID])
			);
		}
	}

	/** Advances time by one step and delivers at most one ready message. Returns false when idle. */
	step(): boolean {
		this.#time += 1;
		const ready = this.#queue.filter((message) => message.readyAt <= this.#time);
		if (ready.length === 0) {
			return this.#queue.length > 0;
		}
		const message = this.#faults.reorder
			? (ready[Math.floor(this.random() * ready.length)] ?? ready[0])
			: ready[0];
		if (message === undefined) {
			return false;
		}
		this.#queue = this.#queue.filter((queued) => queued !== message);
		// A message already on the wire arrives even if its sender has disconnected since.
		if (message.to.connected && this.#sameGroup(message.from, message.to)) {
			message.to.receive(message);
		}
		return true;
	}

	/** Delivers messages until none are left. */
	run(limit = 100_000): void {
		for (let steps = 0; this.step(); steps += 1) {
			if (steps > limit) {
				throw new Error(`The network did not go idle within ${limit} steps.`);
			}
		}
	}

	/**
	 * Removes every fault and partition, then lets every pair of connected peers exchange their
	 * full state, the way a real provider resynchronizes after it reconnects.
	 */
	settle(): void {
		this.#faults = NO_FAULTS;
		this.heal();
		for (const peer of this.#peers) {
			if (peer.connected) {
				this.exchangeState(peer);
			}
		}
		this.run();
	}

	/** Stops the awareness timers of every peer. */
	destroy(): void {
		for (const peer of this.#peers) {
			peer.awareness.destroy();
		}
		this.#queue = [];
	}

	#send(from: TestProvider, to: TestProvider, kind: Message['kind'], payload: Uint8Array): void {
		if (!this.#canReach(from, to) || this.random() < this.#faults.drop) {
			return;
		}
		const delay = Math.floor(this.random() * (this.#faults.delay + 1));
		this.#queue.push({ from, to, kind, payload, readyAt: this.#time + delay });
	}

	#canReach(from: TestProvider, to: TestProvider): boolean {
		return from.connected && to.connected && this.#sameGroup(from, to);
	}

	#sameGroup(from: TestProvider, to: TestProvider): boolean {
		return this.#groups === null || this.#groups.get(from) === this.#groups.get(to);
	}
}
