import type { RouteId } from '$app/types';

/** The docs pages in reading order, for the docs navigation and the landing page. */
export const docsPages = [
	{ route: '/docs/getting-started', title: 'Getting started' },
	{ route: '/docs/snapshots', title: 'Snapshots' },
	{ route: '/docs/block-ids', title: 'Block IDs' },
	{ route: '/docs/collaboration', title: 'Collaboration' },
	{ route: '/docs/extensions', title: 'Writing Extensions' }
] as const satisfies readonly { route: RouteId; title: string }[];
