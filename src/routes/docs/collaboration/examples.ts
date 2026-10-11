export const install = `pnpm add yjs @lexical/yjs`;

export const connect = `import { createEditor } from 'blokki';
import { collaboration } from 'blokki/collab';
import * as Y from 'yjs';

const doc = new Y.Doc();
// The app's Yjs provider, which syncs doc with the other peers.
const provider = createProvider(doc);

const editor = createEditor({
	extensions: [collaboration({ doc, provider, user: { id: 'u1', name: 'Ada' } })]
});`;

export const seed = `import { seedSharedDocument } from 'blokki/collab';
import * as Y from 'yjs';

const doc = new Y.Doc();
seedSharedDocument(doc, snapshot, { extensions });
// Then connect the provider and mount the Editor.`;
