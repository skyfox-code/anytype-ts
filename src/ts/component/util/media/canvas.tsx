import React, { forwardRef, useRef, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react';
import { S, keyboard } from 'Lib';

interface CanvasSnapshot {
	type: string;
	children: Record<string, unknown>[];
	[key: string]: unknown;
};

interface Props {
	data?: CanvasSnapshot | null;
	readonly?: boolean;
	mode?: 'edgeless' | 'page';
	onChange?: (snapshot: CanvasSnapshot) => void;
};

const MediaCanvas = observer(forwardRef<{}, Props>(({
	data = null,
	readonly = false,
	mode = 'edgeless',
	onChange = () => {},
}, ref) => {

	const theme = S.Common.getThemeClass();
	const nodeRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<HTMLElement | null>(null);
	const collectionRef = useRef<unknown>(null);
	const docRef = useRef<unknown>(null);
	const isActiveRef = useRef(false);
	const initializedRef = useRef(false);

	const initEditor = useCallback(async () => {
		if (!nodeRef.current || initializedRef.current) {
			return;
		};

		initializedRef.current = true;

		try {
			// @ts-ignore: BlockSuite is ESM-only, Rspack handles resolution at build time
			const { Schema, DocCollection } = await import('@blocksuite/store');
			// @ts-ignore: BlockSuite is ESM-only, Rspack handles resolution at build time
			const { AffineSchemas } = await import('@blocksuite/blocks');
			// @ts-ignore: BlockSuite is ESM-only, Rspack handles resolution at build time
			const { AffineEditorContainer } = await import('@blocksuite/presets');

			// @ts-ignore: BlockSuite is ESM-only, Rspack handles resolution at build time
			await import('@blocksuite/presets/effects');

			const schema = new Schema();
			schema.register(AffineSchemas);

			const collection = new DocCollection({ schema });
			collectionRef.current = collection;

			const doc = collection.createDoc();
			docRef.current = doc;

			doc.load(() => {
				const rootId = doc.addBlock('affine:page' as never, {});
				doc.addBlock('affine:surface' as never, {}, rootId);
			});

			const editor = new AffineEditorContainer();
			editor.doc = doc;
			editor.mode = mode;
			editor.autofocus = false;
			editorRef.current = editor;

			nodeRef.current.innerHTML = '';
			nodeRef.current.appendChild(editor);

			if (!readonly) {
				doc.slots.blockUpdated.on(() => {
					if (!isActiveRef.current) {
						return;
					};

					try {
						const blocks = doc.getBlockByFlavour('affine:page');
						const snapshot: CanvasSnapshot = {
							type: 'page',
							children: blocks.map((b: { flavour: string; id: string }) => ({
								flavour: b.flavour,
								id: b.id,
							})),
						};
						onChange(snapshot);
					} catch (_e) {
						// Snapshot export failed
					};
				});
			};
		} catch (e) {
			console.error('Failed to initialize BlockSuite canvas:', e);

			if (nodeRef.current) {
				nodeRef.current.innerHTML = '<div style="padding: 16px; color: var(--color-text-secondary);">Failed to load canvas editor</div>';
			};
		};
	}, [ data, readonly, mode, onChange ]);

	useEffect(() => {
		initEditor();

		return () => {
			if (editorRef.current && nodeRef.current?.contains(editorRef.current)) {
				nodeRef.current.removeChild(editorRef.current);
			};

			editorRef.current = null;
			collectionRef.current = null;
			docRef.current = null;
			initializedRef.current = false;
		};
	}, []);

	useEffect(() => {
		const onMouseDown = (e: MouseEvent) => {
			if (nodeRef.current && !nodeRef.current.contains(e.target as Node)) {
				isActiveRef.current = false;
				keyboard.setFocus(false);
			};
		};

		window.addEventListener('mousedown', onMouseDown);
		return () => {
			window.removeEventListener('mousedown', onMouseDown);
			keyboard.setFocus(false);
		};
	}, []);

	return (
		<div
			className="mediaCanvas"
			ref={nodeRef}
			onMouseDownCapture={() => {
				isActiveRef.current = true;
				keyboard.setFocus(true);
			}}
		/>
	);

}));

export default MediaCanvas;
