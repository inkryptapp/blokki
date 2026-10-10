/**
 * Svelte entry point of blokki, a block-based rich-text editor built on Lexical.
 *
 * @packageDocumentation
 */
export {
	default as EditorContent,
	type EditorContentProps
} from './components/EditorContent.svelte';
export { createEditor, type Editor, type EditorOptions } from './editor/editor.js';
