import { describe, expect, it } from 'vitest';
import { createEditor } from '../index.js';

describe('createEditor', () => {
	it('configures an Editor without a DOM', () => {
		expect(typeof document).toBe('undefined');

		const editor = createEditor({ extensions: [] });

		expect(() => editor.lexical).toThrow('The Editor is not mounted.');
	});
});
