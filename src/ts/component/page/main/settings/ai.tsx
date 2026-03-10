import React, { forwardRef, useState } from 'react';
import { observer } from 'mobx-react';
import { Title, Label, Input, Select, Button } from 'Component';
import { I, U, translate } from 'Lib';

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' },
    { id: 'gemini', name: 'Google Gemini' },
    { id: 'ollama', name: 'Ollama (Local)' },
];

const DEFAULT_MODELS = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
    gemini: 'gemini-2.0-flash',
    ollama: 'llama3',
};

const PageMainSettingsAi = observer(forwardRef<I.PageRef, I.PageSettingsComponent>((props, ref) => {

    const config = U.Ai.getConfig();
    const [provider, setProvider] = useState(config.provider || 'openai');
    const [apiKey, setApiKey] = useState(config.apiKey || '');
    const [model, setModel] = useState(config.model || '');
    const [ollamaUrl, setOllamaUrl] = useState(config.ollamaUrl || 'http://localhost:11434');
    const [saved, setSaved] = useState(false);

    const isOllama = provider === 'ollama';

    const onProviderChange = (id: string) => {
        setProvider(id);
        setModel('');
    };

    const onSave = () => {
        U.Ai.setConfig({
            provider: provider as any,
            apiKey,
            model,
            ollamaUrl,
        });
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="sections">
            <div className="section">
                <Title text={translate('pageSettingsAiTitle')} />
                <Label text={translate('pageSettingsAiDescription')} />
            </div>

            <div className="section">
                <Title text={translate('pageSettingsAiProvider')} />

                <Select
                    id="ai-provider"
                    value={provider}
                    options={PROVIDERS}
                    onChange={onProviderChange}
                    menuParam={{
                        horizontal: I.MenuDirection.Center,
                        width: 360,
                    }}
                />
            </div>

            {!isOllama ? (
                <div className="section">
                    <Title text={translate('pageSettingsAiApiKey')} />

                    <Input
                        value={apiKey}
                        placeholder={translate('pageSettingsAiApiKeyPlaceholder')}
                        onKeyUp={(e, v) => setApiKey(v)}
                    />
                </div>
            ) : (
                <div className="section">
                    <Title text={translate('pageSettingsAiOllamaUrl')} />

                    <Input
                        value={ollamaUrl}
                        placeholder="http://localhost:11434"
                        onKeyUp={(e, v) => setOllamaUrl(v)}
                    />
                </div>
            )}

            <div className="section">
                <Title text={translate('pageSettingsAiModel')} />

                <Input
                    value={model}
                    placeholder={DEFAULT_MODELS[provider] || 'gpt-4o'}
                    onKeyUp={(e, v) => setModel(v)}
                />

                <Label text={translate('pageSettingsAiModelHint')} />
            </div>

            <div className="section">
                <Button
                    className="c36"
                    text={saved ? translate('pageSettingsAiSaved') : translate('pageSettingsAiSave')}
                    color={saved ? 'green' : 'black'}
                    onClick={onSave}
                />
            </div>
        </div>
    );

}));

export default PageMainSettingsAi;
