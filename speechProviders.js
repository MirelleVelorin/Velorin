export const SPEECH_TYPES = {
  elevenlabs: {
    label: 'ElevenLabs',
    endpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
    model: 'eleven_multilingual_v2',
  },
  minimax: {
    label: 'MiniMax',
    endpoint: 'https://api.minimaxi.com/v1/t2a_v2',
    model: 'speech-02-hd',
  },
  custom: {
    label: '自定义接口',
    endpoint: '',
    model: '',
  },
};

const createId = () => `speech-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const createSpeechProvider = (type = 'elevenlabs', index = 0) => {
  const preset = SPEECH_TYPES[type] || SPEECH_TYPES.custom;
  return {
    id: type === 'elevenlabs' && index === 0 ? 'elevenlabs' : createId(),
    name: preset.label,
    type,
    endpoint: preset.endpoint,
    apiKey: '',
    model: preset.model,
    voiceId: '',
  };
};

export const normalizeSpeechSettings = (value = {}) => {
  const legacy = value || {};
  let providers = Array.isArray(legacy.providers) ? legacy.providers : [];
  if (!providers.length && (legacy.apiKey || legacy.voiceId)) {
    providers = [{
      ...createSpeechProvider('elevenlabs', 0),
      apiKey: legacy.apiKey || '',
      voiceId: legacy.voiceId || '',
    }];
  }
  if (!providers.length) providers = [createSpeechProvider('elevenlabs', 0)];
  providers = providers.map((provider, index) => {
    const type = provider.type || (index === 0 ? 'elevenlabs' : 'custom');
    const preset = SPEECH_TYPES[type] || SPEECH_TYPES.custom;
    return {
      ...createSpeechProvider(type, index),
      ...provider,
      id: provider.id || (index === 0 && type === 'elevenlabs' ? 'elevenlabs' : createId()),
      name: provider.name || preset.label,
      type,
      endpoint: provider.endpoint ?? preset.endpoint,
      model: provider.model ?? preset.model,
      apiKey: provider.apiKey || '',
      voiceId: provider.voiceId || '',
    };
  });
  const activeProviderId = providers.some(item => item.id === legacy.activeProviderId)
    ? legacy.activeProviderId
    : providers[0].id;
  return { providers, activeProviderId };
};

export const getActiveSpeechProvider = (value) => {
  const settings = normalizeSpeechSettings(value);
  return settings.providers.find(item => item.id === settings.activeProviderId) || settings.providers[0];
};

