# Block Editor

A Svelte 5 library for block-based rich-text editing, with optional real-time collaboration.

## Language

### Editor composition

**Editor**:
One independent editing instance: a document, the extensions enabled for it, and the UI attached to it. A page can host many Editors.
_Avoid_: instance, editor component

**Extension**:
A self-contained, independently configurable unit of editor functionality that declares its dependencies on other Extensions.
_Avoid_: plugin, module, feature pack

**Headless Extension**:
An Extension that provides a feature's document behavior (node types, commands, conversions, keyboard behavior) without any UI.
_Avoid_: core plugin

**UI Extension**:
An Extension that adds Svelte UI for one feature and depends on that feature's Headless Extension.
_Avoid_: view plugin, UI plugin

**Preset**:
A ready-made composition of Extensions and UI that renders a complete Editor in one component.
_Avoid_: template, kit, starter

**Block Chrome**:
Non-editable UI attached to a Block, such as a callout's icon button, a toggle's chevron, or a code block's toolbar.
_Avoid_: decoration, widget, node view

**View State**:
Per-viewer state that is never part of document content, such as whether a toggle is open, which menu is visible, or which Block is hovered.
_Avoid_: UI state, local state

**User Preference**:
A setting that belongs to one user across all documents, such as recently used emojis or colors.
_Avoid_: settings, View State

**Slash Menu**:
The searchable menu that opens when the user types `/`, listing Slash Commands.
_Avoid_: command palette, quick insert

**Slash Command**:
One entry in the Slash Menu that inserts a Block, converts a Block, or inserts a Chip.
_Avoid_: command (alone), action

**Block Selection**:
A selection of whole Blocks, shown as highlighted Blocks with no caret.
_Avoid_: node selection, multi-select

**Outline**:
A navigator beside the document that shows the heading structure and marks the section in view.
_Avoid_: minimap, sidebar, table of contents

### Document model

**Block**:
A unit of document content that the user can select, move, convert, and link to as a whole. Blocks are the direct children of the document, list items with their own content, and the direct children of a Container Block's body.
_Avoid_: node, row, element

**Container Block**:
A Block whose body holds other Blocks. Only Container Blocks nest; every other Block is a leaf.
_Avoid_: parent block, wrapper, group

**Quote**:
A Container Block that sets quoted content apart.
_Avoid_: blockquote (in prose)

**Callout**:
A Container Block with an emoji icon that highlights its content.
_Avoid_: admonition, alert, notice

**Toggle**:
A Container Block with a one-line title and a body that each viewer can open or close.
_Avoid_: expandable, collapsible, details, accordion

**Table of Contents**:
A Block that lists the document's headings as links. Its entries are derived from the headings and never stored.
_Avoid_: TOC block, index, Outline

**Chip**:
An inline, non-editable piece of content that behaves as one character, such as a mention, a date, or an inline equation.
_Avoid_: token, pill, decorator

**Indent**:
A Block's visual indentation level. Indenting never makes a Block the child of another Block.
_Avoid_: nesting, child block

**Block ID**:
The identifier of a Block, unique within its document, that stays with the Block's content through edits, moves, conversion, serialization, and collaboration.
_Avoid_: key, node key

**Anchor Link**:
A URL that points to one Block through its Block ID.
_Avoid_: permalink, block link

**Unsupported Block**:
A read-only placeholder for a Block whose Extension is not enabled. Export preserves it unchanged.
_Avoid_: unknown node, broken block

### Storage and versioning

**Snapshot**:
The complete content of a document in the portable, versioned format. Used for storage when collaboration is off, and for import and export.
_Avoid_: dump, value, export JSON

**Schema Version**:
The version of the node types that one Extension defines. Every Snapshot records the Schema Version of each Extension it uses.
_Avoid_: format version, document version

**Migration**:
A pure transformation that upgrades a Snapshot's content from one Schema Version of an Extension to the next.
_Avoid_: upgrade script, converter

### Collaboration

**Shared Document**:
The replica of a document that collaborating peers synchronize. When collaboration is on, the Shared Document is the source of truth and Snapshots are derived from it.
_Avoid_: room, Y.Doc (in prose)

**Seeding**:
Giving a new Shared Document its initial content. It happens once, by the client that creates the document, before anyone else joins.
_Avoid_: bootstrapping, initialization

**Document Upgrade**:
Replacing a Shared Document with a new one, seeded from a migrated Snapshot, when a schema change is not additive.
_Avoid_: re-seeding, reset
