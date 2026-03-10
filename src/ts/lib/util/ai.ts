import Storage from '../storage';

export enum AiProvider {
	OpenAI = 'openai',
	Anthropic = 'anthropic',
	Gemini = 'gemini',
	Ollama = 'ollama',
};

interface AiConfig {
	provider: AiProvider;
	apiKey: string;
	model: string;
	ollamaUrl: string;
};

interface AiMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

interface AiCallOptions {
	messages: AiMessage[];
	onToken?: (token: string) => void;
	onDone?: (fullText: string) => void;
	onError?: (error: string) => void;
	signal?: AbortSignal;
};

const STORAGE_KEY = 'aiConfig';

const DEFAULT_CONFIG: AiConfig = {
	provider: AiProvider.OpenAI,
	apiKey: '',
	model: '',
	ollamaUrl: 'http://localhost:11434',
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
	[AiProvider.OpenAI]: 'gpt-4o',
	[AiProvider.Anthropic]: 'claude-sonnet-4-20250514',
	[AiProvider.Gemini]: 'gemini-2.0-flash',
	[AiProvider.Ollama]: 'llama3',
};

const getConfig = (): AiConfig => {
	const stored = Storage.get(STORAGE_KEY, true) || {};
	return { ...DEFAULT_CONFIG, ...stored };
};

const setConfig = (config: Partial<AiConfig>): void => {
	const current = getConfig();
	Storage.set(STORAGE_KEY, { ...current, ...config }, true);
};

const getModel = (config: AiConfig): string => {
	return config.model || DEFAULT_MODELS[config.provider] || DEFAULT_MODELS[AiProvider.OpenAI];
};

const isConfigured = (): boolean => {
	const config = getConfig();

	if (config.provider === AiProvider.Ollama) {
		return !!config.ollamaUrl;
	};

	return !!config.apiKey;
};

const streamOpenAI = async (config: AiConfig, options: AiCallOptions): Promise<void> => {
	const { messages, onToken, onDone, onError, signal } = options;
	const model = getModel(config);

	let response: Response;
	try {
		response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({ model, messages, stream: true }),
			signal,
		});
	} catch (e) {
		onError?.('Network error: unable to reach OpenAI');
		return;
	};

	if (!response.ok) {
		const status = response.status;
		if (status === 429) {
			onError?.('Rate limited. Please wait and try again.');
		} else
		if (status === 401) {
			onError?.('Invalid API key. Check your AI settings.');
		} else {
			onError?.(`OpenAI error (${status})`);
		};
		return;
	};

	await readSSEStream(response, (data: string) => {
		try {
			const json = JSON.parse(data);
			const token = json.choices?.[0]?.delta?.content;
			if (token) {
				return token;
			};
		} catch {
			// skip
		};
		return '';
	}, onToken, onDone, onError);
};

const streamAnthropic = async (config: AiConfig, options: AiCallOptions): Promise<void> => {
	const { messages, onToken, onDone, onError, signal } = options;
	const model = getModel(config);

	const systemMsg = messages.find(m => m.role === 'system');
	const nonSystemMessages = messages.filter(m => m.role !== 'system');

	const body: Record<string, unknown> = {
		model,
		max_tokens: 4096,
		messages: nonSystemMessages,
		stream: true,
	};

	if (systemMsg) {
		body.system = systemMsg.content;
	};

	let response: Response;
	try {
		response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': config.apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
			},
			body: JSON.stringify(body),
			signal,
		});
	} catch (e) {
		onError?.('Network error: unable to reach Anthropic');
		return;
	};

	if (!response.ok) {
		const status = response.status;
		if (status === 429) {
			onError?.('Rate limited. Please wait and try again.');
		} else
		if (status === 401) {
			onError?.('Invalid API key. Check your AI settings.');
		} else {
			onError?.(`Anthropic error (${status})`);
		};
		return;
	};

	await readSSEStream(response, (data: string) => {
		try {
			const json = JSON.parse(data);
			if (json.type === 'content_block_delta') {
				return json.delta?.text || '';
			};
		} catch {
			// skip
		};
		return '';
	}, onToken, onDone, onError);
};

const streamGemini = async (config: AiConfig, options: AiCallOptions): Promise<void> => {
	const { messages, onToken, onDone, onError, signal } = options;
	const model = getModel(config);

	const systemMsg = messages.find(m => m.role === 'system');
	const nonSystemMessages = messages.filter(m => m.role !== 'system');

	const contents = nonSystemMessages.map(m => ({
		role: m.role === 'assistant' ? 'model' : 'user',
		parts: [{ text: m.content }],
	}));

	const body: Record<string, unknown> = { contents };

	if (systemMsg) {
		body.systemInstruction = { parts: [{ text: systemMsg.content }] };
	};

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal,
		});
	} catch (e) {
		onError?.('Network error: unable to reach Gemini');
		return;
	};

	if (!response.ok) {
		const status = response.status;
		if (status === 429) {
			onError?.('Rate limited. Please wait and try again.');
		} else
		if (status === 400) {
			onError?.('Invalid API key. Check your AI settings.');
		} else {
			onError?.(`Gemini error (${status})`);
		};
		return;
	};

	await readSSEStream(response, (data: string) => {
		try {
			const json = JSON.parse(data);
			return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
		} catch {
			// skip
		};
		return '';
	}, onToken, onDone, onError);
};

const streamOllama = async (config: AiConfig, options: AiCallOptions): Promise<void> => {
	const { messages, onToken, onDone, onError, signal } = options;
	const model = getModel(config);
	const baseUrl = config.ollamaUrl || DEFAULT_CONFIG.ollamaUrl;

	let response: Response;
	try {
		response = await fetch(`${baseUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, messages, stream: true }),
			signal,
		});
	} catch (e) {
		onError?.('Network error: unable to reach Ollama. Is it running?');
		return;
	};

	if (!response.ok) {
		onError?.(`Ollama error (${response.status})`);
		return;
	};

	const reader = response.body?.getReader();
	if (!reader) {
		onError?.('No response stream');
		return;
	};

	const decoder = new TextDecoder();
	let fullText = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			};

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split('\n').filter(Boolean);

			for (const line of lines) {
				try {
					const json = JSON.parse(line);
					const token = json.message?.content || '';
					if (token) {
						fullText += token;
						onToken?.(token);
					};
				} catch {
					// skip
				};
			};
		};

		onDone?.(fullText);
	} catch (e) {
		if ((e as Error).name === 'AbortError') {
			onDone?.(fullText);
		} else {
			onError?.(`Stream error: ${(e as Error).message}`);
		};
	};
};

const readSSEStream = async (
	response: Response,
	parseData: (data: string) => string,
	onToken?: (token: string) => void,
	onDone?: (fullText: string) => void,
	onError?: (error: string) => void,
): Promise<void> => {
	const reader = response.body?.getReader();
	if (!reader) {
		onError?.('No response stream');
		return;
	};

	const decoder = new TextDecoder();
	let fullText = '';
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			};

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6).trim();

					if ((data === '[DONE]') || !data) {
						continue;
					};

					const token = parseData(data);
					if (token) {
						fullText += token;
						onToken?.(token);
					};
				};
			};
		};

		onDone?.(fullText);
	} catch (e) {
		if ((e as Error).name === 'AbortError') {
			onDone?.(fullText);
		} else {
			onError?.(`Stream error: ${(e as Error).message}`);
		};
	};
};

const callAi = async (options: AiCallOptions): Promise<void> => {
	const config = getConfig();

	if (!isConfigured()) {
		options.onError?.('AI is not configured. Set your API key in settings.');
		return;
	};

	switch (config.provider) {
		case AiProvider.OpenAI: return streamOpenAI(config, options);
		case AiProvider.Anthropic: return streamAnthropic(config, options);
		case AiProvider.Gemini: return streamGemini(config, options);
		case AiProvider.Ollama: return streamOllama(config, options);
	};
};

const callAiSimple = async (
	prompt: string,
	systemPrompt: string,
	onToken?: (token: string) => void,
	onDone?: (fullText: string) => void,
	onError?: (error: string) => void,
	signal?: AbortSignal,
): Promise<void> => {
	const messages: AiMessage[] = [];

	if (systemPrompt) {
		messages.push({ role: 'system', content: systemPrompt });
	};

	messages.push({ role: 'user', content: prompt });

	return callAi({ messages, onToken, onDone, onError, signal });
};

export default {
	AiProvider,
	getConfig,
	setConfig,
	isConfigured,
	callAi,
	callAiSimple,
	getModel,
};
