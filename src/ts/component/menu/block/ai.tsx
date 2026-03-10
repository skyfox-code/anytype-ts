import React, { forwardRef, useRef, useImperativeHandle, useEffect, useState } from 'react';
import $ from 'jquery';
import { MenuItemVertical, Icon, Loader } from 'Component';
import { I, S, U, keyboard, focus, translate } from 'Lib';

const SYSTEM_PROMPT = 'You are a writing assistant. Return only the transformed text with no additional explanation, preamble, or markdown formatting.';

interface AiAction {
	id: string;
	icon: string;
	name: string;
	description: string;
	arrow?: boolean;
	promptTemplate: (text: string, extra?: string) => string;
};

const MenuBlockAi = forwardRef<I.MenuRef, I.Menu>((props, ref) => {

	const { param, onKeyDown, setActive, close, position } = props;
	const { data } = param;
	const { rootId, blockId, blockText, onSelect } = data;
	const n = useRef(-1);
	const [ view, setView ] = useState<'actions' | 'translate' | 'tone' | 'loading' | 'error'>('actions');
	const [ errorMessage, setErrorMessage ] = useState('');
	const [ loadingLabel, setLoadingLabel ] = useState('');
	const abortRef = useRef<AbortController | null>(null);

	const toneOptions = [
		{ id: 'professional', name: translate('menuBlockAiToneProfessional') },
		{ id: 'casual', name: translate('menuBlockAiToneCasual') },
		{ id: 'formal', name: translate('menuBlockAiToneFormal') },
		{ id: 'friendly', name: translate('menuBlockAiToneFriendly') },
	];

	const getActions = (): AiAction[] => [
		{
			id: 'fixGrammar',
			icon: 'ai-grammar',
			name: translate('menuBlockAiFixGrammar'),
			description: translate('menuBlockAiFixGrammarDescription'),
			promptTemplate: (text: string) => `Fix grammar and spelling, return only the corrected text:\n\n${text}`,
		},
		{
			id: 'summarize',
			icon: 'ai-summarize',
			name: translate('menuBlockAiSummarize'),
			description: translate('menuBlockAiSummarizeDescription'),
			promptTemplate: (text: string) => `Summarize this in one sentence:\n\n${text}`,
		},
		{
			id: 'expand',
			icon: 'ai-expand',
			name: translate('menuBlockAiExpand'),
			description: translate('menuBlockAiExpandDescription'),
			promptTemplate: (text: string) => `Expand this into a full paragraph:\n\n${text}`,
		},
		{
			id: 'translate',
			icon: 'ai-translate',
			name: translate('menuBlockAiTranslate'),
			description: translate('menuBlockAiTranslateDescription'),
			arrow: true,
			promptTemplate: (text: string, lang?: string) => `Translate the following text to ${lang || 'English'}, return only the translated text:\n\n${text}`,
		},
		{
			id: 'changeTone',
			icon: 'ai-tone',
			name: translate('menuBlockAiChangeTone'),
			description: translate('menuBlockAiChangeToneDescription'),
			arrow: true,
			promptTemplate: (text: string, tone?: string) => `Rewrite the following text in a ${tone || 'professional'} tone, return only the rewritten text:\n\n${text}`,
		},
	];

	const languages = [
		'English', 'Spanish', 'French', 'German', 'Italian',
		'Portuguese', 'Russian', 'Chinese', 'Japanese', 'Korean',
		'Arabic', 'Hindi', 'Dutch', 'Swedish', 'Polish',
	];

	const rebind = () => {
		unbind();
		$(window).on('keydown.menu', e => onKeyDown(e));
		window.setTimeout(() => setActive(), 15);
	};

	const unbind = () => {
		$(window).off('keydown.menu');
	};

	const getItems = (): I.MenuItem[] => {
		if (view === 'translate') {
			return languages.map(lang => ({
				id: lang.toLowerCase(),
				name: lang,
			}));
		};

		if (view === 'tone') {
			return toneOptions.map(t => ({
				id: t.id,
				name: t.name,
			}));
		};

		return getActions().map(action => ({
			id: action.id,
			icon: action.icon,
			name: action.name,
			description: action.description,
			arrow: action.arrow,
			withDescription: true,
		}));
	};

	const onOver = (e: React.MouseEvent, item: I.MenuItem) => {
		if (!keyboard.isMouseDisabled) {
			setActive(item, false);
		};

		if (!item.arrow) {
			return;
		};

		if (item.id === 'translate') {
			setView('translate');
		} else
		if (item.id === 'changeTone') {
			setView('tone');
		};
	};

	const executeAiAction = (prompt: string, label: string) => {
		if (!blockText) {
			setView('error');
			setErrorMessage(translate('menuBlockAiNoText'));
			return;
		};

		if (!U.Ai.isConfigured()) {
			setView('error');
			setErrorMessage(translate('menuBlockAiNotConfigured'));
			return;
		};

		setView('loading');
		setLoadingLabel(label);

		const abort = new AbortController();
		abortRef.current = abort;

		let fullText = '';

		U.Ai.callAiSimple(
			prompt,
			SYSTEM_PROMPT,
			(token: string) => {
				fullText += token;
				updateBlockText(fullText);
			},
			(_finalText: string) => {
				updateBlockText(fullText);
				onSelect?.();
				close();
			},
			(error: string) => {
				setView('error');
				setErrorMessage(error);
			},
			abort.signal,
		);
	};

	const updateBlockText = (text: string) => {
		const block = S.Block.getLeaf(rootId, blockId);
		if (!block) {
			return;
		};

		U.Data.blockSetText(rootId, blockId, text, [], true);

		const el = $(`#block-${U.Common.esc(blockId)} #value`);
		if (el.length) {
			el.text(text);
		};
	};

	const onClick = (e: React.MouseEvent, item: I.MenuItem) => {
		e.stopPropagation();

		if (item.arrow) {
			return;
		};

		if (view === 'translate') {
			const action = getActions().find(a => a.id === 'translate');
			if (action) {
				executeAiAction(action.promptTemplate(blockText, item.name), translate('menuBlockAiTranslating'));
			};
			return;
		};

		if (view === 'tone') {
			const action = getActions().find(a => a.id === 'changeTone');
			if (action) {
				executeAiAction(action.promptTemplate(blockText, item.name), translate('menuBlockAiChangingTone'));
			};
			return;
		};

		const action = getActions().find(a => a.id === item.id);
		if (action) {
			executeAiAction(action.promptTemplate(blockText), action.name);
		};
	};

	useEffect(() => {
		rebind();
		return () => {
			unbind();
			abortRef.current?.abort();
		};
	}, []);

	useEffect(() => {
		n.current = -1;
		rebind();
		position?.();
	}, [ view ]);

	useImperativeHandle(ref, () => ({
		rebind,
		unbind,
		getItems,
		getIndex: () => n.current,
		setIndex: (i: number) => { n.current = i; },
		onClick,
		onOver,
	}), [ view ]);

	if (view === 'loading') {
		return (
			<div className="aiLoading">
				<Loader />
				<div className="label">{loadingLabel}</div>
			</div>
		);
	};

	if (view === 'error') {
		return (
			<div className="aiError">
				<Icon className="ai-error" />
				<div className="label">{errorMessage}</div>
				<div
					className="retry"
					onClick={() => setView('actions')}
					role="button"
					tabIndex={0}
					aria-label={translate('menuBlockAiRetry')}
					onKeyDown={e => { if (e.key === 'Enter') { setView('actions'); }; }}
				>
					{translate('menuBlockAiRetry')}
				</div>
			</div>
		);
	};

	const items = getItems();

	const showBack = (view === 'translate') || (view === 'tone');

	return (
		<div className="items">
			{showBack ? (
				<div
					className="item back"
					onClick={() => setView('actions')}
					role="button"
					tabIndex={0}
					aria-label={translate('commonBack')}
					onKeyDown={e => { if (e.key === 'Enter') { setView('actions'); }; }}
				>
					<Icon className="arrow back" />
					<div className="name">{translate('commonBack')}</div>
				</div>
			) : ''}

			{items.map((item, i: number) => (
				<MenuItemVertical
					{...item}
					key={i}
					onClick={e => onClick(e, item)}
					onMouseEnter={e => onOver(e, item)}
				/>
			))}
		</div>
	);

});

export default MenuBlockAi;
