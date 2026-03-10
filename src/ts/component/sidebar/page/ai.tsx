import React, { forwardRef, useEffect, useRef, useState, useImperativeHandle } from 'react';
import { observer } from 'mobx-react';
import $ from 'jquery';
import { Icon, Loader } from 'Component';
import { I, S, U, keyboard, sidebar, translate, Relation, Action } from 'Lib';

const LINKED_DEPTH = 2;
const LINKED_SNIPPET_LENGTH = 500;
const STORAGE_KEY = 'pkm_ai_sidebar_chat';

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
};

const getObjectContext = (rootId: string): string => {
	const object = S.Detail.get(rootId, rootId);

	if (!object || object._empty_) {
		return '';
	};

	const textBlocks = S.Block.getBlocks(rootId, (block: I.Block) => block.isText());
	const fullText = textBlocks
		.map((block: I.Block) => block.content?.text || '')
		.filter(Boolean)
		.join('\n');

	const parts: string[] = [];
	parts.push(`[Current object: ${object.name || 'Untitled'}]`);
	parts.push(fullText);

	const linkedIds: string[] = Relation.getArrayValue(object.links || []);
	const visited = new Set<string>([ rootId ]);

	const fetchLinked = (ids: string[], depth: number) => {
		if ((depth > LINKED_DEPTH) || !ids.length) {
			return;
		};

		for (const id of ids) {
			if (visited.has(id)) {
				continue;
			};

			visited.add(id);

			const linked = S.Detail.get(rootId, id);

			if (!linked || linked._empty_ || linked.isDeleted || linked.isArchived) {
				continue;
			};

			const linkedBlocks = S.Block.getBlocks(id, (block: I.Block) => block.isText());
			const linkedText = linkedBlocks
				.map((block: I.Block) => block.content?.text || '')
				.filter(Boolean)
				.join('\n')
				.substring(0, LINKED_SNIPPET_LENGTH);

			if (linked.name || linkedText) {
				parts.push('');
				parts.push(`[Linked: ${linked.name || 'Untitled'}]`);

				if (linkedText) {
					parts.push(linkedText);
				};
			};

			const nextIds: string[] = Relation.getArrayValue(linked.links || []);
			fetchLinked(nextIds, depth + 1);
		};
	};

	fetchLinked(linkedIds, 1);

	return parts.join('\n');
};

const SidebarPageAi = observer(forwardRef<{}, I.SidebarPageComponent>((props, ref) => {

	const { rootId, isPopup } = props;
	const [ messages, setMessages ] = useState<ChatMessage[]>([]);
	const [ input, setInput ] = useState('');
	const [ isStreaming, setIsStreaming ] = useState(false);
	const [ error, setError ] = useState('');
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const streamTextRef = useRef('');

	const object = S.Detail.get(rootId, rootId);
	const title = object?.name || translate('defaultNamePage');

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	const onClose = () => {
		sidebar.rightPanelClose(isPopup, true);
	};

	const onClear = () => {
		setMessages([]);
		setError('');
		streamTextRef.current = '';
	};

	const onSubmit = () => {
		const text = input.trim();

		if (!text || isStreaming) {
			return;
		};

		if (!U.Ai.isConfigured()) {
			setError(translate('sidebarAiNotConfigured'));
			return;
		};

		setError('');
		setInput('');

		const userMessage: ChatMessage = { role: 'user', content: text };
		const newMessages = [ ...messages, userMessage ];
		setMessages(newMessages);

		const context = getObjectContext(rootId);
		const systemPrompt = `You are a knowledge assistant. Answer questions based on the provided notes. Always cite which object your answer comes from by name. Context:\n\n${context}`;

		const aiMessages = [
			{ role: 'system' as const, content: systemPrompt },
			...newMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
		];

		setIsStreaming(true);
		streamTextRef.current = '';

		const abort = new AbortController();
		abortRef.current = abort;

		U.Ai.callAi({
			messages: aiMessages,
			signal: abort.signal,
			onToken: (token: string) => {
				streamTextRef.current += token;
				setMessages(prev => {
					const last = prev[prev.length - 1];

					if (last && (last.role === 'assistant')) {
						return [ ...prev.slice(0, -1), { role: 'assistant', content: streamTextRef.current } ];
					};

					return [ ...prev, { role: 'assistant', content: streamTextRef.current } ];
				});
			},
			onDone: () => {
				setIsStreaming(false);
			},
			onError: (err: string) => {
				setIsStreaming(false);
				setError(err);
			},
		});
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if ((e.key === 'Enter') && !e.shiftKey) {
			e.preventDefault();
			onSubmit();
		};
	};

	const onObjectClick = (name: string) => {
		const linkedIds: string[] = Relation.getArrayValue(object?.links || []);

		for (const id of linkedIds) {
			const linked = S.Detail.get(rootId, id);

			if (linked && (linked.name === name)) {
				U.Object.openAuto(linked);
				return;
			};
		};
	};

	const renderMessageContent = (content: string) => {
		const linkedIds: string[] = Relation.getArrayValue(object?.links || []);
		const linkedNames: string[] = [];

		for (const id of linkedIds) {
			const linked = S.Detail.get(rootId, id);

			if (linked && linked.name) {
				linkedNames.push(linked.name);
			};
		};

		if (!linkedNames.length) {
			return <span>{content}</span>;
		};

		const pattern = linkedNames.map(n => U.String.regexEscape(n)).join('|');
		const regex = new RegExp(`(${pattern})`, 'g');
		const parts = content.split(regex);

		return (
			<>
				{parts.map((part, i) => {
					if (linkedNames.includes(part)) {
						return (
							<span
								key={i}
								className="objectLink"
								onClick={() => onObjectClick(part)}
								role="link"
								tabIndex={0}
								aria-label={part}
								onKeyDown={e => { if (e.key === 'Enter') { onObjectClick(part); }; }}
							>
								{part}
							</span>
						);
					};

					return <span key={i}>{part}</span>;
				})}
			</>
		);
	};

	useEffect(() => {
		scrollToBottom();
	}, [ messages ]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
		};
	}, []);

	useImperativeHandle(ref, () => ({
		forceUpdate: () => {},
	}));

	return (
		<div className="sidebarPageAi">
			<div className="head">
				<div className="side left">
					<Icon className="ai-sparkle" />
					<div className="label">{translate('sidebarAiTitle')}</div>
				</div>
				<div className="side right">
					<Icon
						className="clear"
						onClick={onClear}
						tooltipParam={{ text: translate('sidebarAiClear'), typeY: I.MenuDirection.Bottom }}
						aria-label={translate('sidebarAiClear')}
					/>
					<Icon
						className="close"
						onClick={onClose}
						aria-label={translate('commonClose')}
					/>
				</div>
			</div>

			<div className="contextInfo">
				<Icon className="context-icon" />
				<span className="contextLabel">
					{translate('sidebarAiContext')}: {title}
				</span>
			</div>

			<div className="chatMessages">
				{!messages.length ? (
					<div className="empty">
						<div className="emptyIcon"><Icon /></div>
						<div className="emptyTitle">{translate('sidebarAiEmptyTitle')}</div>
						<div className="emptyDescription">{translate('sidebarAiEmptyDescription')}</div>
					</div>
				) : ''}

				{messages.map((msg, i) => (
					<div key={i} className={[ 'message', msg.role ].join(' ')}>
						<div className="messageContent">
							{msg.role === 'assistant' ? renderMessageContent(msg.content) : msg.content}
						</div>
					</div>
				))}

				{isStreaming && !messages.find(m => (m.role === 'assistant') && (m === messages[messages.length - 1])) ? (
					<div className="message assistant">
						<Loader />
					</div>
				) : ''}

				{error ? (
					<div className="chatError">{error}</div>
				) : ''}

				<div ref={messagesEndRef} />
			</div>

			<div className="chatInput">
				<div className="inputWrap">
					<textarea
						ref={inputRef}
						value={input}
						onChange={e => setInput(e.target.value)}
						onKeyDown={onKeyDown}
						placeholder={translate('sidebarAiPlaceholder')}
						rows={1}
						disabled={isStreaming}
						aria-label={translate('sidebarAiPlaceholder')}
					/>
					<Icon
						className={[ 'send', (input.trim() && !isStreaming ? 'active' : '') ].join(' ')}
						onClick={onSubmit}
						aria-label={translate('sidebarAiSend')}
					/>
				</div>
			</div>
		</div>
	);

}));

export default SidebarPageAi;
