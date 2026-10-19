import { DEFAULT_CONTEXT_SETTINGS } from './contextManager';

export const DEFAULT_CONFIG = {
  profiles: [
    {
      id: 'default',
      name: '默认配置',
      endpoint: 'https://api.xxx.cn/v1/chat/completions',
      apiKey: 'sk-xxxxxxxx',
      model: 'gemini-2.0-flash',
      supportsVision: true,
    },
  ],
  context: { ...DEFAULT_CONTEXT_SETTINGS },
  activeProfileId: 'default',
  apiSettings: {
    retryEnabled: true,
    retryCount: 1,
    fallbackEnabled: true,
  },
  finance: {
    enabled: false,
    commentMode: 'important',
    singleExpenseThreshold: 200,
    mealCommentThreshold: 25,
    randomCommentProbability: 0.2,
    monthlyBudget: 0,
    lowBudgetRatio: 0.15,
    dailyCommentLimit: 3,
    essentialCategories: ['餐饮', '交通', '生活用品', '水电', '话费', '药品'],
    similarWindowDays: 7,
  },
  systemPrompt: '你是一个 helpful 的 AI。',
  userProfile: {
    name: '用户',
    preferredName: '',
    occupation: '',
    about: '',
    avatarUri: '',
  },
  mcpGateway: {
    url: 'http://127.0.0.1:8787',
    token: '',
  },
  speech: {
    activeProviderId: 'elevenlabs',
    providers: [
      {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        type: 'elevenlabs',
        endpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
        apiKey: '',
        model: 'eleven_multilingual_v2',
        voiceId: '',
      },
    ],
  },
};

