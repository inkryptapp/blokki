interface ListenerRecord {
	target: EventTarget;
	type: string;
	listener: EventListenerOrEventListenerObject;
	capture: boolean;
}

/**
 * Records event listeners and observers that are still attached. Listeners removed through an
 * `AbortSignal` count as removed when the signal aborts.
 */
export function trackResources() {
	const listeners = new Set<ListenerRecord>();
	const observing = new Set<MutationObserver | ResizeObserver | IntersectionObserver>();
	const { addEventListener, removeEventListener } = EventTarget.prototype;
	const observerPrototypes = [
		MutationObserver.prototype,
		ResizeObserver.prototype,
		IntersectionObserver.prototype
	] as const;
	const originalObservers = observerPrototypes.map(({ observe, disconnect }) => ({
		observe,
		disconnect
	}));

	const isCapture = (options: boolean | EventListenerOptions | undefined): boolean =>
		typeof options === 'boolean' ? options : (options?.capture ?? false);
	const find = (
		target: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject,
		capture: boolean
	): ListenerRecord | undefined =>
		[...listeners].find(
			(record) =>
				record.target === target &&
				record.type === type &&
				record.listener === listener &&
				record.capture === capture
		);

	EventTarget.prototype.addEventListener = function (
		this: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions
	) {
		addEventListener.call(this, type, listener, options);
		if (listener === null) {
			return;
		}
		const capture = isCapture(options);
		if (find(this, type, listener, capture) !== undefined) {
			return;
		}
		const record = { target: this, type, listener, capture };
		listeners.add(record);
		const signal = typeof options === 'object' ? options.signal : undefined;
		// Registered with the original method, so this bookkeeping listener is not tracked itself.
		if (signal !== undefined) {
			addEventListener.call(signal, 'abort', () => listeners.delete(record), { once: true });
		}
	};
	EventTarget.prototype.removeEventListener = function (
		this: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | EventListenerOptions
	) {
		removeEventListener.call(this, type, listener, options);
		if (listener === null) {
			return;
		}
		const record = find(this, type, listener, isCapture(options));
		if (record !== undefined) {
			listeners.delete(record);
		}
	};
	for (const [index, prototype] of observerPrototypes.entries()) {
		const original = originalObservers[index];
		if (original === undefined) {
			continue;
		}
		prototype.observe = function (this: MutationObserver, ...args: never[]) {
			observing.add(this);
			return Reflect.apply(original.observe, this, args);
		};
		prototype.disconnect = function (this: MutationObserver) {
			observing.delete(this);
			return Reflect.apply(original.disconnect, this, []);
		};
	}

	return {
		listeners: () => [...listeners].map(({ type }) => type),
		observers: () => observing.size,
		restore() {
			EventTarget.prototype.addEventListener = addEventListener;
			EventTarget.prototype.removeEventListener = removeEventListener;
			for (const [index, prototype] of observerPrototypes.entries()) {
				const original = originalObservers[index];
				if (original !== undefined) {
					prototype.observe = original.observe;
					prototype.disconnect = original.disconnect;
				}
			}
		}
	};
}
