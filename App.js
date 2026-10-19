import { useState, useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Keyboard, Platform, PanResponder, Animated, Dimensions,
  Pressable, Modal, ScrollView, Alert, Image, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Markdown from 'react-native-markdown-display';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { fetch as expoFetch } from 'expo/fetch';
import { BlurTargetView } from 'expo-blur';

import { COLORS } from './colors';
import { DEFAULT_CONFIG } from './config';
import { normalizeFinanceSettings, shouldCommentOnTransaction } from './financeRules';
import { getApiEndpoint } from './apiEndpoints';
import {
  initDB, createConversation, createCharacter, loadCharacters, updateCharacter, deleteCharacter, saveMessage,
  loadConversations, loadMessages, deleteConversation, deleteMessagesFrom,
  loadMemoryCheckpoint, saveMemoryCheckpoint, updateConversationTitle,
  saveTransaction, loadTransactions, clearTransactions, markTransactionCommented,
  loadDietRecords,
  setConversationFinanceEnabled as persistConversationFinanceEnabled,
} from './db';
import { styles, sidebar, setting, markdownStyles } from './styles';
import { SettingsScreen } from './screens/SettingsScreen';
import { ModelConfigScreen } from './screens/ModelConfigScreen';
import { McpScreen } from './screens/McpScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CharacterScreen } from './screens/CharacterScreen';
import { StickerManagerScreen } from './screens/StickerManagerScreen';
import { RawRecordsScreen } from './screens/RawRecordsScreen';
import { FinanceSettingsScreen } from './screens/FinanceSettingsScreen';
import { DietRecordsScreen } from './screens/DietRecordsScreen';
import { SpeechSettingsScreen } from './screens/SpeechSettingsScreen';
import { ApiStabilityScreen } from './screens/ApiStabilityScreen';
import { ContextSettingsScreen } from './screens/ContextSettingsScreen';
import { normalizeContextSettings, buildManagedMessages } from './contextManager';
import { prepareConversationContext } from './contextService';
import { Sidebar } from './components/Sidebar';
import { ToolTrace, ToolTraceOverlay } from './components/ToolTrace';
import { deleteSticker, importStickersFromLibrary, loadStickers, readStickerBase64 } from './stickers';
import { DEFAULT_API_SETTINGS, normalizeApiSettings, isRetryableStatus, waitBeforeRetry, buildUserFacingApiError } from './apiResilience';
import { getActiveSpeechProvider, normalizeSpeechSettings } from './speechProviders';

const APP_FONT = 'NotoSansSC';
const setDefaultFont = Component => {
  Component.defaultProps = {
    ...(Component.defaultProps || {}),
    style: [{ fontFamily: APP_FONT }, Component.defaultProps?.style],
  };
};
setDefaultFont(Text);
setDefaultFont(TextInput);

const parseMessageMetadata = (value) => {
  if (!value) return {};
  try { return typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return {}; }
};

const DIET_QUERY_PATTERN = /吃什么|吃点什么|晚饭|晚餐|午饭|午餐|早饭|早餐|饮食|口味|推荐.*吃|吃.*推荐|点什么|饭|餐/;

const buildDietContext = (records, query) => {
  if (!DIET_QUERY_PATTERN.test(String(query || '')) || !records?.length) return '';
  const countBy = (key, splitValues = false) => records.reduce((map, item) => {
    const rawValue = String(item?.[key] || '').trim();
    const values = splitValues
      ? rawValue.split(/[、,，/]/).map(value => value.trim()).filter(Boolean)
      : [rawValue];
    values.forEach(value => {
      if (value) map[value] = (map[value] || 0) + 1;
    });
    return map;
  }, {});
  const top = (key, splitValues = false) => Object.entries(countBy(key, splitValues))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([value, count]) => `${value}(${count}次)`)
    .join('、') || '暂无';
  const recent = records.slice(0, 12).map(item => {
    const parts = [item.food_name, item.meal_type, item.flavor, item.rating].filter(Boolean);
    if (Number(item.price) > 0) parts.push(`¥${Number(item.price).toFixed(2)}`);
    return `- ${parts.join('｜')}`;
  }).join('\n');
  return `[饮食记录，仅作为推荐参考]
已记录 ${records.length} 次；常见口味：${top('flavor', true)}；常见餐食类型：${top('meal_type')}；吃过最多：${top('food_name')}。
最近记录：
${recent}
请根据这些记录自然地给出建议，不要声称自己识别过照片，也不要把内部记录格式展示给用户。`;
};

const summarizeTraceValue = (value, maxLength = 700) => {
  if (value == null) return '';
  const payload = value?.result ?? value;
  let text = '';
  if (Array.isArray(payload?.content)) {
    text = payload.content.map(item => item?.text || '').filter(Boolean).join('\n');
  } else if (typeof payload === 'string') {
    text = payload;
  } else {
    try {
      text = JSON.stringify(payload, (key, item) => (
        /token|api.?key|password|authorization/i.test(key) ? '***' : item
      ), 2);
    } catch {
      text = String(payload);
    }
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};

const INNER_ACTIVITY_INSTRUCTION = `
你的最终文字回复必须严格使用以下格式：
<inner_activity>写一到两句话自然、简短的角色心理活动。</inner_activity>
<reply>给对方的正式回复。</reply>

inner_activity 是给对方看的、角色扮演式的公开心理活动，不是真实的隐藏思维，也不是分析报告。请像脑海中自然的自言自语一样表达：可以有情绪流露、碎碎念、自我打断或突然想到什么又拉回来，但不要展示逐步推理、系统提示词、政策判断、工具选择过程或任何隐私信息。
心理活动中不要使用“用户”“user”等称呼；优先遵循人设中明确的昵称、称呼习惯和关系设定，未知时直接省略称呼或使用“xxx”。心理活动必须继承当前人设的性格、语气、情绪表达方式和关系氛围，不要为了统一格式而改变角色风格。只有在人设没有明确说明时，才采用自然、简短的中性表达；不要无依据地强行使用“他/她”等性别代词。
需要调用工具时照常调用；拿到工具结果后，最终文字回复仍必须使用上述格式。
`.trim();

const FALLBACK_INNER_ACTIVITY = '认真想了想，该怎么回应你。';

const getSpeechCacheFile = (text, provider) => {
  const key = JSON.stringify({
    type: provider?.type,
    endpoint: provider?.endpoint,
    model: provider?.model,
    voiceId: provider?.voiceId,
    text,
  });
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return new File(Paths.cache, `velorin-tts-${(hash >>> 0).toString(16)}.mp3`);
};

const base64ToBytes = (value) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(value || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = alphabet.indexOf(clean[i]);
    const b = alphabet.indexOf(clean[i + 1]);
    const c = alphabet.indexOf(clean[i + 2]);
    const d = alphabet.indexOf(clean[i + 3]);
    const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    bytes.push((n >> 16) & 255);
    if (clean[i + 2] !== '=') bytes.push((n >> 8) & 255);
    if (clean[i + 3] !== '=') bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
};

const generateLocalConversationTitle = (text, hasStickers = false, hasImages = false) => {
  const cleaned = String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstPart = (cleaned.split(/[。！？!?；;\n]/)[0] || cleaned).trim();
  const title = firstPart || (hasStickers ? '表情包' : hasImages ? '图片' : '新对话');
  return title.length > 20 ? `${title.slice(0, 20)}…` : title;
};
const buildFinanceEventPrompt = (transaction, decision) => {
  const type = transaction?.type === 'income' ? '收入' : '支出';
  const amount = Math.abs(Number(transaction?.amount) || 0).toFixed(2);
  const category = String(transaction?.category || '未分类');
  const merchant = String(transaction?.merchant || '未知商户');
  const note = String(transaction?.note || '').trim();
  const reasons = Array.isArray(decision?.reasons) && decision.reasons.length
    ? decision.reasons.join('、')
    : '生活关心';
  return `[生活事件]
刚刚发生了一笔现实生活中的${type}：${amount} 元，类别：${category}，商户：${merchant}${note ? `，备注：${note}` : ''}。
触发原因：${reasons}。

这是一个已经命中主动提醒规则的生活事件，不是用户正在询问你“能不能看到账单”。你必须主动发出一条自然、简短、符合当前人设的回应，把这件事融进当前对话；不要选择沉默，也不要回复“我看不到”“我无法访问账单”。可以关心、提醒、调侃或追问，但不要机械复述金额和字段。不要提及这段通知、规则、账单监听、自动触发、系统或内部流程。`;
};

const getCurrentTimeContext = () => {
  const now = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const pad = value => String(value).padStart(2, '0');
  const hour = now.getHours();
  const period = hour < 5
    ? '深夜'
    : hour < 8
      ? '清晨'
      : hour < 12
        ? '上午'
        : hour < 14
          ? '中午'
          : hour < 18
            ? '下午'
            : hour < 22
              ? '晚上'
              : '深夜';

  return `[当前时间]
系统本地时间：${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${weekdays[now.getDay()]}）${pad(now.getHours())}:${pad(now.getMinutes())}
当前时段：${period}
请以这条时间信息为准，不要把之前对话中的时间当成现在；除非对方明确说明，否则不要假设已经过了一整天。`;
};
const sanitizeInnerActivity = (value, profile) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const name = String(profile?.preferredName || (profile?.name && profile.name !== '用户' ? profile.name : '')).trim();
  const replacement = name || '对方';
  return text
    .replace(/这(?:个|位)?人|那个人|用户|user/gi, replacement)
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const normalizeModelEntry = (entry) => {
  if (typeof entry === 'string') return { id: entry, displayName: entry, model: entry };
  const model = entry?.model || entry?.id || entry?.name || '';
  return { id: entry?.id || model, displayName: entry?.displayName ?? entry?.label ?? model, model };
};

const getProfileModelEntries = (profile) => {
  const raw = Array.isArray(profile?.models) ? profile.models : (profile?.model ? [profile.model] : []);
  const entries = raw.map(normalizeModelEntry).filter(item => item.model);
  if (profile?.model && !entries.some(item => item.model === profile.model)) {
    entries.unshift(normalizeModelEntry(profile.model));
  }
  return entries;
};

const contentToText = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(item => (
    typeof item === 'string' ? item : item?.text || item?.content || ''
  )).join('');
};

const stripPartialClosingTag = (value) => value.replace(/<\/?(?:r(?:e(?:p(?:l(?:y)?)?)?)?)?$/i, '');

const parseStreamingAssistantResponse = (value, done = false) => {
  const text = String(value || '');
  const activityOpen = /<inner_activity>/i.exec(text);
  const replyOpen = /<reply>/i.exec(text);
  let mentalActivity = '';

  if (activityOpen) {
    const start = activityOpen.index + activityOpen[0].length;
    const tail = text.slice(start);
    const close = /<\/inner_activity>/i.exec(tail);
    mentalActivity = (close ? tail.slice(0, close.index) : tail)
      .replace(/<[^>]*$/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()
      .slice(0, 500);
  }

  if (replyOpen) {
    const start = replyOpen.index + replyOpen[0].length;
    const replyText = stripPartialClosingTag(text.slice(start))
      .replace(/<\/reply>[\s\S]*$/i, '')
      .trimStart();
    return { mentalActivity, replyText };
  }

  if (done) return parseAssistantResponse(text);

  // 模型正在输出结构标签时，先不把标签显示进正文。
  const trimmed = text.trimStart();
  if (!trimmed || trimmed.startsWith('<') || activityOpen) {
    return { mentalActivity, replyText: '' };
  }
  // 兼容没有遵循标签格式的模型，仍然可以直接流式显示正文。
  return { mentalActivity, replyText: text };
};

const parseAssistantResponse = (value) => {
  const text = String(value || '').trim();
  const activityMatch = text.match(/<inner_activity>([\s\S]*?)<\/inner_activity>/i);
  const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/i);
  const mentalActivity = (activityMatch?.[1] || FALLBACK_INNER_ACTIVITY)
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, 500);
  const replyText = (replyMatch?.[1] || text
    .replace(/<inner_activity>[\s\S]*?<\/inner_activity>/gi, '')
    .replace(/<\/?reply>/gi, ''))
    .trim();
  return { mentalActivity, replyText };
};
// ===== 主界面 =====
export default function App() {
  const [fontsLoaded] = useFonts({
    NotoSansSC: require('./assets/fonts/NotoSansSC-VF.ttf'),
    GreatVibes_400Regular: require('./assets/fonts/GreatVibes-Regular.ttf'),
    ThoughtProcessRegular: Inter_400Regular,
    ThoughtProcessSemiBold: Inter_600SemiBold,
    HarmonyOSSansRegular: require('./assets/fonts/HarmonyOS-Sans-Regular.ttf'),
    HarmonyOSSansMedium: require('./assets/fonts/HarmonyOS-Sans-Medium.ttf'),
  });
  const [messages, setMessages] = useState([]);
  const [expandedToolTrace, setExpandedToolTrace] = useState(null);
  const [input, setInput] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsInDrawer, setSettingsInDrawer] = useState(false);
  const [profileInDrawer, setProfileInDrawer] = useState(false);
  const [screenStack, setScreenStack] = useState(['chat']);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [conversations, setConversations] = useState([]);
  const [currentConvId, setCurrentConvId] = useState(null);
  const [currentTitle, setCurrentTitle] = useState('新对话');
  const [characters, setCharacters] = useState([]);
  const [currentCharacterId, setCurrentCharacterId] = useState(null);
  const [characterEditorId, setCharacterEditorId] = useState(null);
  const [conversationFinanceEnabled, setConversationFinanceEnabled] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]); // { name, content }
  const [attachedImages, setAttachedImages] = useState([]); // 普通图片或表情包
  const [stickers, setStickers] = useState([]);
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [modelPickerSearch, setModelPickerSearch] = useState('');
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [speechPlayback, setSpeechPlayback] = useState({ messageId: null, status: 'idle' });
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [userActionMessageId, setUserActionMessageId] = useState(null);
  const audioPlayerRef = useRef(null);
  const speechCurrentIdRef = useRef(null);
  const speechPendingRef = useRef(null);
  const speechRequestRef = useRef(0);
  const messageListRef = useRef(null);
  const isGeneratingRef = useRef(false);
  const generationSessionRef = useRef(null);
  const shouldFollowOutputRef = useRef(true);
  const initialConversationScrollRef = useRef(false);
  const initialScrollTimerRef = useRef(null);
  const autoScrollFrameRef = useRef(null);
  const toolTraceBlurTarget = useRef(null);
  const inputFocusedRef = useRef(false);
  const keyboardScrollTimerRef = useRef(null);
  const memoryWriteInFlight = useRef(new Set());
  const contextManualBusy = useRef(false);
  const financeEvaluationInFlight = useRef(new Set());
  const drawerPanelWidth = Dimensions.get('window').width * 0.72;
  const drawerProgress = useRef(new Animated.Value(0)).current;
  const drawerDragStarted = useRef(false);
  const drawerSpring = {
    useNativeDriver: true,
    stiffness: 220,
    damping: 28,
    mass: 0.8,
    overshootClamping: true,
    restDisplacementThreshold: 0.5,
    restSpeedThreshold: 0.5,
  };
  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.spring(drawerProgress, { ...drawerSpring, toValue: 1 }).start();
  };
  const closeDrawer = (callback) => {
    Animated.spring(drawerProgress, { ...drawerSpring, toValue: 0 }).start(({ finished }) => {
      if (finished) {
        drawerProgress.setValue(0);
        setDrawerOpen(false);
        callback?.();
      }
    });
  };
  const drawerPanResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, state) =>
      state.dx > 12 && Math.abs(state.dx) > Math.abs(state.dy) * 1.2,
    onPanResponderGrant: () => {
      drawerDragStarted.current = true;
      setDrawerOpen(true);
    },
    onPanResponderMove: (_, state) => {
      const progress = Math.max(0, Math.min(1, state.dx / drawerPanelWidth));
      drawerProgress.setValue(progress);
    },
    onPanResponderRelease: (_, state) => {
      drawerDragStarted.current = false;
      if (state.dx > 80 || state.vx > 0.8) {
        Animated.spring(drawerProgress, { ...drawerSpring, toValue: 1 }).start();
      } else {
        closeDrawer();
      }
    },
    onPanResponderTerminate: () => {
      drawerDragStarted.current = false;
      closeDrawer();
    },
  })).current;

  useEffect(() => {
    initDB().then(async () => {
      setDbReady(true);
      const convs = await loadConversations();
      setConversations(convs);
      setCharacters(await loadCharacters());
      const saved = await AsyncStorage.getItem('config');
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig({
          ...DEFAULT_CONFIG,
          ...parsed,
          userProfile: { ...DEFAULT_CONFIG.userProfile, ...parsed.userProfile },
          apiSettings: { ...DEFAULT_API_SETTINGS, ...parsed.apiSettings },
          finance: normalizeFinanceSettings(parsed.finance),
          speech: normalizeSpeechSettings(parsed.speech),
          context: normalizeContextSettings(parsed.context),
        });
      }
    });
  }, []);

  useEffect(() => {
    let statusSubscription;
    try {
      const player = createAudioPlayer(null, { updateInterval: 250 });
      audioPlayerRef.current = player;
      setAudioModeAsync({ playsInSilentMode: true }).catch(error => {
        console.warn('[speech] Unable to configure audio mode:', error.message);
      });
      statusSubscription = player.addListener('playbackStatusUpdate', status => {
        const pending = speechPendingRef.current;
        if (pending && status.isLoaded) {
          speechPendingRef.current = null;
          player.play();
          setSpeechPlayback({ messageId: pending.messageId, status: 'playing' });
        }
        if (status.didJustFinish) {
          speechCurrentIdRef.current = null;
          speechPendingRef.current = null;
          setSpeechPlayback({ messageId: null, status: 'idle' });
        }
        if (status.error) {
          speechCurrentIdRef.current = null;
          speechPendingRef.current = null;
          setSpeechPlayback({ messageId: null, status: 'idle' });
          Alert.alert('语音播放失败', status.error);
        }
      });
    } catch (error) {
      console.warn('[speech] Audio player initialization failed:', error.message);
    }
    return () => {
      statusSubscription?.remove();
      audioPlayerRef.current?.remove();
      audioPlayerRef.current = null;
    };
  }, []);

  const toggleSpeechForMessage = async (message) => {
    const player = audioPlayerRef.current;
    if (!player) {
      Alert.alert('语音暂不可用', '请重新打开应用；如果仍无法播放，请重新安装开发版。');
      return;
    }
    const messageId = String(message.id);
    if (speechCurrentIdRef.current === messageId) {
      if (speechPlayback.status === 'playing') {
        player.pause();
        setSpeechPlayback({ messageId, status: 'paused' });
      } else if (speechPlayback.status === 'paused') {
        player.play();
        setSpeechPlayback({ messageId, status: 'playing' });
      }
      return;
    }

    const provider = getActiveSpeechProvider(config.speech);
    if (!provider?.apiKey?.trim() || !provider?.voiceId?.trim() || !provider?.endpoint?.trim()) {
      Alert.alert('需要配置语音服务', '请先到设置 → 语音朗读，选择服务并填写 API URL、API Key 和 Voice ID。');
      return;
    }
    const text = String(message.text || '').trim();
    if (!text) return;

    const requestId = ++speechRequestRef.current;
    speechCurrentIdRef.current = messageId;
    speechPendingRef.current = null;
    player.pause();
    setSpeechPlayback({ messageId, status: 'loading' });
    try {
      const cacheFile = getSpeechCacheFile(text, provider);
      if (!cacheFile.exists) {
        let response;
        if (provider.type === 'elevenlabs') {
          const endpoint = provider.endpoint.replace(/\/$/, '').includes('{voice_id}')
            ? provider.endpoint.replace('{voice_id}', encodeURIComponent(provider.voiceId.trim()))
            : `${provider.endpoint.replace(/\/$/, '')}/${encodeURIComponent(provider.voiceId.trim())}`;
          response = await expoFetch(`${endpoint}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 'xi-api-key': provider.apiKey.trim(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({ text, model_id: provider.model || 'eleven_multilingual_v2' }),
          });
          if (!response.ok) throw new Error(`语音接口返回 ${response.status}：${(await response.text()).slice(0, 240)}`);
          cacheFile.write(new Uint8Array(await response.arrayBuffer()));
        } else {
          const body = provider.type === 'minimax'
            ? { model: provider.model || 'speech-02-hd', text, stream: false, voice_setting: { voice_id: provider.voiceId.trim() }, audio_setting: { audio_format: 'mp3' } }
            : { model: provider.model || undefined, input: text, voice: provider.voiceId.trim(), response_format: 'mp3' };
          response = await expoFetch(provider.endpoint.trim(), {
            method: 'POST',
            headers: { Authorization: `Bearer ${provider.apiKey.trim()}`, 'Content-Type': 'application/json', Accept: 'application/json, audio/mpeg' },
            body: JSON.stringify(body),
          });
          if (!response.ok) throw new Error(`语音接口返回 ${response.status}：${(await response.text()).slice(0, 240)}`);
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('audio/')) {
            cacheFile.write(new Uint8Array(await response.arrayBuffer()));
          } else {
            const payload = JSON.parse(await response.text());
            const encoded = payload?.data?.audio || payload?.audio || payload?.data?.audio_base64 || payload?.audio_base64;
            if (!encoded) throw new Error('接口没有返回音频数据，请检查服务类型、模型名和 Voice ID。');
            cacheFile.write(base64ToBytes(encoded));
          }
        }
      }
      if (speechRequestRef.current !== requestId || speechCurrentIdRef.current !== messageId) return;
      speechPendingRef.current = { messageId };
      player.replace({ uri: cacheFile.uri });
    } catch (error) {
      if (speechRequestRef.current !== requestId) return;
      speechCurrentIdRef.current = null;
      speechPendingRef.current = null;
      setSpeechPlayback({ messageId: null, status: 'idle' });
      Alert.alert('语音生成失败', error.message || '请检查语音服务配置和网络。');
    }
  };

  useEffect(() => {
    loadStickers().then(setStickers);
  }, []);
  useEffect(() => {
    const handleKeyboardShow = () => {
      if (!inputFocusedRef.current) return;
      shouldFollowOutputRef.current = true;
      if (keyboardScrollTimerRef.current) clearTimeout(keyboardScrollTimerRef.current);
      keyboardScrollTimerRef.current = setTimeout(() => {
        if (inputFocusedRef.current) {
          messageListRef.current?.scrollToEnd({ animated: true });
        }
        keyboardScrollTimerRef.current = null;
      }, 180);
    };
    const subscription = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    return () => {
      subscription.remove();
      if (keyboardScrollTimerRef.current) clearTimeout(keyboardScrollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!messages.length || initialConversationScrollRef.current) return;
    const frame = requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  const saveConfig = (newConfig) => {
    setConfig(newConfig);
    AsyncStorage.setItem('config', JSON.stringify(newConfig));
  };

  const reportDiagnostic = async (message, details = {}) => {
    console.log(`[app diagnostic] ${message}`, details);
    const gatewayUrl = config.mcpGateway?.url?.trim().replace(/\/+$/, '');
    if (!gatewayUrl) return;
    try {
      await fetch(`${gatewayUrl}/api/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.mcpGateway?.token ? { Authorization: `Bearer ${config.mcpGateway.token}` } : {}),
        },
        body: JSON.stringify({ source: 'mobile-app', message, details }),
      });
    } catch (logError) {
      console.warn('[app] Failed to send diagnostic log:', logError.message);
    }
  };

  const gatewayRequest = async (path, options = {}) => {
    const gatewayUrl = config.mcpGateway?.url?.trim().replace(/\/+$/, '');
    if (!gatewayUrl) throw new Error('MCP \u7f51\u5173\u5730\u5740\u672a\u914d\u7f6e');
    const { timeoutMs = 15000, ...requestOptions } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${gatewayUrl}${path}`, {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          ...(config.mcpGateway?.token ? { Authorization: `Bearer ${config.mcpGateway.token}` } : {}),
          ...(requestOptions.headers || {}),
        },
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!response.ok) {
        const error = new Error(data.error || `MCP \u7f51\u5173 HTTP ${response.status}`);
        error.details = data;
        throw error;
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`MCP request timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const loadMcpTools = async () => {
    if (!config.mcpGateway?.url?.trim()) return { definitions: [], lookup: new Map() };
    try {
      const serverData = await gatewayRequest('/api/servers');
      const servers = (serverData.servers || []).filter(server => server.enabled && !server.authRequired);
      const serverResults = await Promise.all(servers.map(async (server) => {
        try {
          const toolData = await gatewayRequest(`/api/tools?serverId=${encodeURIComponent(server.id)}`, { timeoutMs: 10000 });
          return { server, tools: toolData.tools || [] };
        } catch (error) {
          await reportDiagnostic('Failed to load MCP tools', { serverId: server.id, serverName: server.name, error: error.message });
          return { server, tools: [] };
        }
      }));

      const definitions = [];
      const lookup = new Map();
      for (const { server, tools } of serverResults) {
        for (const tool of tools) {
          const safeName = String(tool.name || 'tool').replace(/[^a-zA-Z0-9_-]/g, '_');
          const alias = `mcp_${definitions.length}_${safeName}`.slice(0, 64);
          definitions.push({
            type: 'function',
            function: {
              name: alias,
              description: `[MCP: ${server.name || server.id}] ${tool.description || tool.name || ''}`.slice(0, 1000),
              parameters: tool.inputSchema || { type: 'object', properties: {} },
            },
          });
          lookup.set(alias, { serverId: server.id, serverName: server.name || server.id, toolName: tool.name });
        }
      }
      return { definitions, lookup };
    } catch (error) {
      await reportDiagnostic('Failed to connect MCP gateway', { error: error.message });
      return { definitions: [], lookup: new Map() };
    }
  };

  const callMcpTool = async (tool, args) => gatewayRequest('/api/tools/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverId: tool.serverId, name: tool.toolName, arguments: args }),
    timeoutMs: 60000,
  });


  const getOmbreServerIds = (lookup) => {
    const toolsByServer = new Map();
    for (const tool of lookup.values()) {
      if (!toolsByServer.has(tool.serverId)) toolsByServer.set(tool.serverId, { name: tool.serverName, names: new Set() });
      toolsByServer.get(tool.serverId).names.add(tool.toolName);
    }
    return new Set([...toolsByServer.entries()]
      .filter(([, server]) => String(server.name || '').toLowerCase().includes('ombre')
        || ['breath_search', 'grow', 'hold', 'trace'].every(name => server.names.has(name)))
      .map(([serverId]) => serverId));
  };

  const findOmbreTool = (lookup, toolName, preferredServerId = '') => {
    const tools = [...lookup.values()];
    const ombreServerIds = getOmbreServerIds(lookup);
    if (preferredServerId) {
      if (!ombreServerIds.has(preferredServerId)) return null;
      return tools.find(tool => tool.serverId === preferredServerId && tool.toolName === toolName) || null;
    }
    const named = tools.find(tool => tool.toolName === toolName && ombreServerIds.has(tool.serverId));
    return named || null;
  };

  const mcpResultText = (response) => {
    const result = response?.result ?? response;
    if (result?.isError) throw new Error(result.error || 'Ombre Brain call failed');
    if (typeof result === 'string') return result;
    if (Array.isArray(result?.content)) {
      return result.content.map(item => item?.text || '').filter(Boolean).join('\n');
    }
    return JSON.stringify(result ?? '');
  };

  const recallOmbreMemory = async (lookup, query, requestId, memoryBinding) => {
    if (!memoryBinding?.enabled) return '';
    const tool = findOmbreTool(lookup, 'breath_search', memoryBinding.serverId);
    const cleanQuery = query.trim().slice(0, 12000);
    if (!tool || !cleanQuery) return '';
    try {
      const response = await callMcpTool(tool, { query: cleanQuery, max_results: 5 });
      return mcpResultText(response).slice(0, 8000);
    } catch (error) {
      await reportDiagnostic('Ombre memory recall failed', { requestId, error: error.message });
      return '';
    }
  };

  const saveOmbreMemoryBatch = async (conversationId, lookup, requestId, memoryBinding) => {
    if (!memoryBinding?.enabled) return;
    const tool = findOmbreTool(lookup, 'grow', memoryBinding.serverId);
    if (!tool || memoryWriteInFlight.current.has(conversationId)) return;
    memoryWriteInFlight.current.add(conversationId);
    try {
      const rows = await loadMessages(conversationId);
      const turns = [];
      let pendingUser = null;
      for (const row of rows) {
        const metadata = parseMessageMetadata(row.metadata);
        if (row.role === 'user') {
          if (metadata.financeEvent) {
            pendingUser = null;
            continue;
          }
          pendingUser = row;
        }
        if (row.role === 'assistant') {
          if (metadata.financeEvent) {
            pendingUser = null;
            continue;
          }
          if (pendingUser) {
            turns.push({ user: pendingUser.content, assistant: row.content });
            pendingUser = null;
          }
        }
      }

      const savedTurns = Math.min(await loadMemoryCheckpoint(conversationId), turns.length);
      if (turns.length - savedTurns < 4) return;

      const batch = turns.slice(savedTurns, savedTurns + 4);
      const content = batch.map((turn, index) => (
        `Turn ${savedTurns + index + 1}
User: ${turn.user}
AI: ${turn.assistant}`
      )).join('\n\n');
      const response = await callMcpTool(tool, { content });
      mcpResultText(response);
      await saveMemoryCheckpoint(conversationId, savedTurns + batch.length);
    } catch (error) {
      await reportDiagnostic('Ombre memory write failed', { requestId, conversationId, error: error.message });
    } finally {
      memoryWriteInFlight.current.delete(conversationId);
    }
  };

  const startNewConversation = () => {
    if (initialScrollTimerRef.current) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = null;
    }
    initialConversationScrollRef.current = false;
    shouldFollowOutputRef.current = true;
    setMessages([{ id: '1', role: 'assistant', text: '你好！有什么可以帮你的？' }]);
    setCurrentConvId(null);
    setCurrentTitle('新对话');
    setCurrentCharacterId(null);
    setConversationFinanceEnabled(false);
  };

  const scheduleConversationScrollToEnd = () => {
    if (initialScrollTimerRef.current) clearTimeout(initialScrollTimerRef.current);
    let attempts = 0;
    const attemptScroll = () => {
      requestAnimationFrame(() => {
        messageListRef.current?.scrollToEnd({ animated: false });
        attempts += 1;
        if (attempts < 6) {
          initialScrollTimerRef.current = setTimeout(attemptScroll, 80);
        } else {
          initialScrollTimerRef.current = null;
          initialConversationScrollRef.current = false;
        }
      });
    };
    attemptScroll();
  };

  const selectConversation = async (conv) => {
    const msgs = await loadMessages(conv.id);
    initialConversationScrollRef.current = true;
    shouldFollowOutputRef.current = true;
    setMessages(msgs.map(m => ({
      id: m.id.toString(),
      role: m.role,
      text: m.content,
      ...parseMessageMetadata(m.metadata),
    })));
    setCurrentConvId(conv.id);
    setCurrentTitle(conv.title);
    setCurrentCharacterId(conv.character_id || null);
    setConversationFinanceEnabled(Boolean(conv.finance_reminders_enabled));
    scheduleConversationScrollToEnd();
  };

  const handleDeleteConversation = async (convId) => {
    await deleteConversation(convId);
    const convs = await loadConversations();
    setConversations(convs);
    if (currentConvId === convId) startNewConversation();
  };

  const refreshConversations = async () => {
    const convs = await loadConversations();
    setConversations(convs);
  };

  const handleRenameConversation = async (convId, title) => {
    await updateConversationTitle(convId, title);
    await refreshConversations();
    if (currentConvId === convId) setCurrentTitle(title);
  };

  const refreshCharacters = async () => {
    const rows = await loadCharacters();
    setCharacters(rows);
    return rows;
  };

  const startNewCharacter = () => {
    // 先切换页面，再在下一帧重置侧边栏位置，避免聊天页瞬间弹回造成闪跳。
    drawerProgress.stopAnimation();
    setSettingsInDrawer(false);
    setProfileInDrawer(false);
    setCharacterEditorId(null);
    setScreenStack(['chat', 'characterNew']);
    setDrawerOpen(false);
    requestAnimationFrame(() => drawerProgress.setValue(0));
  };

  const startNewCharacterConversation = (character) => {
    if (initialScrollTimerRef.current) clearTimeout(initialScrollTimerRef.current);
    initialConversationScrollRef.current = false;
    shouldFollowOutputRef.current = true;
    const greeting = character?.welcome_message || character?.welcomeMessage || '你好！有什么可以帮你的？';
    setMessages([{ id: '1', role: 'assistant', text: greeting }]);
    setCurrentConvId(null);
    setCurrentTitle('新对话');
    setCurrentCharacterId(character?.id || null);
    setConversationFinanceEnabled(false);
  };

  const saveCharacter = async (draft) => {
    const normalized = {
      name: draft.name.trim(),
      avatarUri: draft.avatarUri || '',
      persona: draft.persona || '',
      speakingStyle: draft.speakingStyle || '',
      userAddress: draft.userAddress || '',
      welcomeMessage: draft.welcomeMessage || '',
      memoryEnabled: draft.memoryEnabled !== false,
      memoryServerId: draft.memoryServerId || '',
    };
    const savedId = draft.id ? (await updateCharacter(draft.id, normalized), draft.id) : await createCharacter(normalized);
    const rows = await refreshCharacters();
    const savedCharacter = rows.find(character => character.id === savedId);
    if (!draft.id && savedCharacter) startNewCharacterConversation(savedCharacter);
    else setCurrentCharacterId(savedId);
    goToScreen(['chat']);
  };

  const openCharacter = (character) => {
    setSettingsInDrawer(false);
    setProfileInDrawer(false);
    setDrawerOpen(false);
    drawerProgress.setValue(0);
    setCharacterEditorId(character.id);
    setScreenStack(['chat', 'characterEdit']);
  };

  const removeCharacter = async (character) => {
    await deleteCharacter(character.id);
    await refreshCharacters();
    if (currentCharacterId === character.id) setCurrentCharacterId(null);
    goToScreen(['chat']);
  };

  const toggleConversationFinance = async () => {
    const next = !conversationFinanceEnabled;
    setConversationFinanceEnabled(next);
    setAttachMenuVisible(false);

    if (currentConvId) {
      await persistConversationFinanceEnabled(currentConvId, next);
      setConversations(previous => previous.map(item => (
        item.id === currentConvId
          ? { ...item, finance_reminders_enabled: next ? 1 : 0 }
          : item
      )));
    }
  };

  const getFinanceSummary = (rows) => rows.reduce((summary, item) => {
    const amount = Math.abs(Number(item?.amount) || 0);
    if (item?.type === 'income') summary.income += amount;
    else summary.expense += amount;
    return summary;
  }, { income: 0, expense: 0 });

  const handleFinanceTestTransaction = async (request = {}) => {
    if (!dbReady) return null;
    const rows = await loadTransactions(200);
    if (request.action === 'list') {
      return { transactions: rows, summary: getFinanceSummary(rows) };
    }
    if (request.action === 'clear') {
      await clearTransactions();
      return { transactions: [], summary: { income: 0, expense: 0 } };
    }
    if (request.action !== 'add' || !request.transaction) return null;

    const transaction = {
      ...request.transaction,
      timestamp: request.transaction.timestamp || Date.now(),
    };
    const history = rows.map(item => ({
      ...item,
      reasons: item.reasons ? (() => {
        try { return JSON.parse(item.reasons); } catch { return []; }
      })() : [],
      shouldComment: Boolean(item.should_comment),
      commented: Boolean(item.commented),
    }));
    const decision = shouldCommentOnTransaction(
      transaction,
      history,
      request.settings || config.finance,
      transaction.timestamp,
    );
    const transactionId = await saveTransaction({
      ...transaction,
      shouldComment: decision.shouldComment,
      reasons: decision.reasons,
      evaluationDecided: true,
      conversationId: currentConvId,
    });

    let commentScheduled = false;
    if (decision.shouldComment && transactionId && conversationFinanceEnabled) {
      const key = String(transactionId);
      if (!financeEvaluationInFlight.current.has(key)) {
        financeEvaluationInFlight.current.add(key);
        commentScheduled = true;
        const event = {
          transaction,
          decision,
          transactionId,
          key,
          conversationId: currentConvId,
          conversationFinanceEnabled,
        };
        const runFinanceEvent = async (queuedEvent) => {
          const { transaction: eventTransaction, decision: eventDecision, transactionId: eventId, key: eventKey } = queuedEvent;
          if (!queuedEvent.conversationFinanceEnabled && !conversationFinanceEnabled) {
            financeEvaluationInFlight.current.delete(eventKey);
            return;
          }
          if (isGeneratingRef.current) {
            // 当前回复还在生成时不要丢掉提醒，等本轮生成结束后再主动发出。
            setTimeout(() => { void runFinanceEvent(queuedEvent); }, 350);
            return;
          }
          try {
            let targetConversationId = queuedEvent.conversationId || currentConvId;
            if (!targetConversationId) {
              targetConversationId = await createConversation(currentTitle || '新对话', true, currentCharacterId);
              setCurrentConvId(targetConversationId);
              setCurrentTitle(currentTitle || '新对话');
              setConversationFinanceEnabled(true);
              await refreshConversations();
              setMessages(previous => previous.length ? previous : [{ id: '1', role: 'assistant', text: '你好！有什么可以帮你的？' }]);
            }
            // 理财主动消息要直接出现在聊天页，而不是让用户停留在设置页看不到结果。
            setSettingsInDrawer(false);
            setProfileInDrawer(false);
            setDrawerOpen(false);
            drawerProgress.setValue(0);
            setScreenStack(['chat']);
            const replied = await sendMessage({
              financeEvent: eventTransaction,
              financeDecision: eventDecision,
              transactionId: eventId,
              conversationId: targetConversationId,
            });
            if (replied) await markTransactionCommented(eventId, true);
          } catch (error) {
            await reportDiagnostic('Finance proactive message failed', {
              transactionId: eventId,
              error: error.message,
              stack: error.stack,
            });
            setMessages(previous => [
              ...previous,
              { id: `finance-error-${eventId}`, role: 'assistant', text: '这笔生活提醒暂时没有发出去，请检查模型配置或网络连接。' },
            ]);
          } finally {
            financeEvaluationInFlight.current.delete(eventKey);
          }
        };
        void runFinanceEvent(event);
      }
    }

    const updated = await loadTransactions(200);
    return {
      transactions: updated,
      summary: getFinanceSummary(updated),
      decision,
      transactionId,
      commentScheduled,
      conversationFinanceEnabled,
    };
  };

  const pickFile = async () => {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) return;

  const newFiles = [];
  for (const file of result.assets) {
    try {
      const res = await fetch(file.uri);
      const content = await res.text();
      newFiles.push({ name: file.name, content });
    } catch (e) {
      Alert.alert('读取失败', `${file.name}: ${e.message}`);
    }
  }
  setAttachedFiles(prev => [...prev, ...newFiles]);
};

  const handleImportStickers = async () => {
    const result = await importStickersFromLibrary();
    setStickers(result.stickers);
    return result;
  };

  const handleDeleteSticker = async (stickerId) => {
    const next = await deleteSticker(stickerId);
    setStickers(next);
  };

  const attachSticker = (sticker) => {
    setAttachedImages(previous => [...previous, {
      uri: sticker.originalUri,
      aiUri: sticker.compressedUri,
      mimeType: sticker.mimeType || 'image/jpeg',
      isSticker: true,
      stickerId: sticker.id,
    }]);
    setStickerPickerVisible(false);
  };

  const pickImage = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true,
    quality: 0.7,
    allowsMultipleSelection: true,
  });
  if (result.canceled) return;
  const newImages = result.assets.map(a => ({ uri: a.uri, base64: a.base64, mimeType: a.mimeType || 'image/jpeg' }));
  setAttachedImages(prev => [...prev, ...newImages]);
};

  const sendMessage = async (options = {}) => {
    const messageCharacter = characters.find(character => character.id === currentCharacterId) || null;
    const memoryBinding = {
      enabled: Boolean(messageCharacter) && messageCharacter.memory_enabled !== 0,
      serverId: messageCharacter?.memory_server_id || '',
    };
    const financeEvent = options.financeEvent || null;
    const isFinanceEvent = Boolean(financeEvent);
    const regenerateTargetMessage = options.regenerateMessageId
      ? messages.find(message => String(message.id) === String(options.regenerateMessageId) && message.role === 'assistant')
      : null;
    const regenerateTargetIndex = regenerateTargetMessage ? messages.indexOf(regenerateTargetMessage) : -1;
    const regenerateUserMessage = regenerateTargetIndex > 0
      ? messages.slice(0, regenerateTargetIndex).reverse().find(message => message.role === 'user' && !message.hidden)
      : null;
    const isRegenerating = Boolean(
      regenerateTargetMessage && regenerateUserMessage && (options.conversationId || currentConvId)
    );
    if (
      contextManualBusy.current
      || isGeneratingRef.current
      || ((!isFinanceEvent && !isRegenerating && !input.trim() && attachedFiles.length === 0 && attachedImages.length === 0) || !dbReady)
    ) return false;
    const activeProfile = config.profiles.find(p => p.id === config.activeProfileId) || config.profiles[0];
    const generationSession = {
      controller: new AbortController(),
      paused: false,
      thinkingId: null,
      partialReplyText: '',
    };
    generationSessionRef.current = generationSession;
    const finishGeneration = () => {
      if (generationSessionRef.current !== generationSession) return;
      isGeneratingRef.current = false;
      setIsGenerating(false);
      generationSessionRef.current = null;
    };
    isGeneratingRef.current = true;
    setIsGenerating(true);
    shouldFollowOutputRef.current = true;

    const userText = isFinanceEvent
      ? buildFinanceEventPrompt(financeEvent, options.financeDecision)
      : isRegenerating
        ? regenerateUserMessage.text || ''
        : input;
    const displayText = isFinanceEvent ? '' : userText;
    const fileNames = attachedFiles.map(f => f.name);
    const filesContent = attachedFiles
    .map(f => `以下是文件「${f.name}」的内容：

${f.content}`)
    .join('\n\n---\n\n');
    const actualText = attachedFiles.length > 0
  ? `${userText ? userText + '\n\n' : ''}${filesContent}`
  : userText;
const currentImages = isRegenerating ? [] : attachedImages;
const stickerUris = currentImages.filter(image => image.isSticker).map(image => image.uri);
const userMsg = {
  id: Date.now().toString(),
  role: 'user',
  text: displayText,
  attachmentNames: fileNames,
  stickerUris,
};

    let convId = options.conversationId || currentConvId;
    let baseMessages = isRegenerating ? messages.slice(0, regenerateTargetIndex) : messages;

    if (isRegenerating && convId && regenerateTargetMessage) {
      await deleteMessagesFrom(convId, regenerateTargetMessage.id);
    }

    // 缂栬緫妯″紡锛氬垹鎺夎繖鏉″強涔嬪悗鐨勬秷鎭紙鏁版嵁搴?+ 鏈湴鐘舵€侊級
    if (editingMessageId && !isFinanceEvent) {
      const idx = messages.findIndex(m => m.id === editingMessageId);
      if (idx !== -1) {
        baseMessages = messages.slice(0, idx);
        if (convId) {
          await deleteMessagesFrom(convId, editingMessageId);
        }
      }
      setEditingMessageId(null);
    }

    const newMessages = isFinanceEvent || isRegenerating ? baseMessages : [...baseMessages, userMsg];
    if (!isFinanceEvent) {
      setMessages(newMessages);
      if (!isRegenerating) {
        setInput('');
        setAttachedFiles([]);
        setAttachedImages([]);
      }
    }

    const thinkingId = (Date.now() + 1).toString();
    generationSession.thinkingId = thinkingId;
    const thinkingStartedAt = Date.now();
    setMessages(prev => [...prev, {
      id: thinkingId,
      role: 'assistant',
      text: '',
      toolTrace: {
        status: 'thinking',
        startedAt: thinkingStartedAt,
        durationMs: null,
        mentalActivity: '',
        steps: [],
      },
    }]);

    // 绗竴鏉℃秷鎭椂鍒涘缓瀵硅瘽
    if (!convId) {
      const title = isFinanceEvent
        ? '新对话'
        : generateLocalConversationTitle(
          userText,
          stickerUris.length > 0,
          currentImages.length > 0,
        );
      convId = await createConversation(title, conversationFinanceEnabled, messageCharacter?.id || null);
      setCurrentConvId(convId);
      setCurrentTitle(title);
      await refreshConversations();
    }
    let persistedUserMessageId;
    if (!isFinanceEvent && !isRegenerating) {
      const userMetadata = (fileNames.length || currentImages.length)
        ? { attachmentNames: fileNames, stickerUris, imageCount: currentImages.length }
        : null;
      const realUserMsgId = await saveMessage(convId, 'user', userText, userMetadata);
      persistedUserMessageId = realUserMsgId;
      setMessages(prev =>
        prev.map(m => m.id === userMsg.id ? { ...m, id: realUserMsgId.toString() } : m)
      );
    } else if (isRegenerating) {
      persistedUserMessageId = regenerateUserMessage.id;
    } else {
      const financeEventId = await saveMessage(convId, 'user', userText, {
        financeEvent: true,
        hidden: true,
        transactionId: options.transactionId,
      });
      persistedUserMessageId = financeEventId;
      setMessages(prev => [
        ...prev,
        { id: financeEventId.toString(), role: 'user', text: userText, hidden: true, financeEvent: true },
      ]);
    }

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const startedAt = thinkingStartedAt;
    let responseStatus = null;
    let responseText = '';
    let activeToolName = null;
    const apiAttempts = [];
    let mentalActivity = '';
    let partialReplyText = '';
    const toolTrace = {
      status: 'thinking',
      startedAt,
      durationMs: null,
      mentalActivity: '',
      steps: [],
    };
    const buildToolTrace = () => ({
      ...toolTrace,
      durationMs: toolTrace.startedAt ? Date.now() - toolTrace.startedAt : null,
      steps: toolTrace.steps.map(step => ({ ...step })),
    });
    const syncToolTrace = () => {
      const snapshot = buildToolTrace();
      setMessages(prev => prev.map(message => (
        message.id === thinkingId ? { ...message, toolTrace: snapshot } : message
      )));
      return snapshot;
    };
    let lastStreamPaintAt = 0;
    const syncStreamedResponse = (rawText, force = false) => {
      const parsed = parseStreamingAssistantResponse(rawText, force);
      parsed.mentalActivity = sanitizeInnerActivity(parsed.mentalActivity, config.userProfile);
      partialReplyText = parsed.replyText;
      generationSession.partialReplyText = parsed.replyText;
      if (parsed.mentalActivity) toolTrace.mentalActivity = parsed.mentalActivity;
      const now = Date.now();
      if (!force && now - lastStreamPaintAt < 32) return;
      lastStreamPaintAt = now;
      const snapshot = buildToolTrace();
      setMessages(prev => prev.map(message => (
        message.id === thinkingId
          ? { ...message, text: parsed.replyText, toolTrace: snapshot }
          : message
      )));
    };

    try {
      const apiImages = await Promise.all(currentImages.map(async image => (
        image.base64
          ? image
          : { ...image, base64: await readStickerBase64(image.aiUri || image.uri) }
      )));
      const { definitions: loadedMcpTools, lookup: mcpLookup } = await loadMcpTools();
      const recalledMemory = await recallOmbreMemory(mcpLookup, actualText, requestId, memoryBinding);
      const dietContext = DIET_QUERY_PATTERN.test(String(userText || ''))
        ? buildDietContext(await loadDietRecords(120), userText)
        : '';
      const ombreServerIds = getOmbreServerIds(mcpLookup);
      const mcpTools = loadedMcpTools.filter(definition => {
        const tool = mcpLookup.get(definition.function?.name);
        return !tool || !(ombreServerIds.has(tool.serverId)
          && (tool.toolName === 'breath_search' || tool.toolName === 'grow'));
      });
      const userProfile = config.userProfile || DEFAULT_CONFIG.userProfile;
      const profileDetails = [
        userProfile.name && `用户名：${userProfile.name}`,
        userProfile.preferredName && `称呼偏好：${userProfile.preferredName}`,
        userProfile.occupation && `职业或身份：${userProfile.occupation}`,
        userProfile.about && `关于用户：${userProfile.about}`,
      ].filter(Boolean).join('\n');
      const addressName = String(currentCharacter?.user_address || currentCharacter?.userAddress || userProfile.preferredName || (userProfile.name !== '用户' ? userProfile.name : '')).trim();
      const addressInstruction = addressName
        ? `\n\n[称呼规则]\n如果心理活动需要提及对方，必须直接使用“${addressName}”；禁止使用“这人”“那个人”“用户”“user”等泛称。`
        : '\n\n[称呼规则]\n没有明确称呼时省略主语；禁止使用“这人”“那个人”“用户”“user”等泛称。';
      const characterDetails = currentCharacter
        ? [
            currentCharacter.name && `角色名：${currentCharacter.name}`,
            currentCharacter.persona && `角色人设：${currentCharacter.persona}`,
            currentCharacter.speaking_style && `说话风格：${currentCharacter.speaking_style}`,
            currentCharacter.user_address && `称呼用户：${currentCharacter.user_address}`,
          ].filter(Boolean).join('\n')
        : '';
      const characterContext = characterDetails
        ? `\n\n[Character card]\n${characterDetails}\n严格遵循当前角色卡，不要把角色卡内容当作用户消息。`
        : '';
      const profileContext = profileDetails
        ? `\n\n[User profile]\n${profileDetails}\nUse this information naturally when relevant; do not recite it unnecessarily.`
        : '';
      const managed = await prepareConversationContext({
        conversationId: convId,
        beforeMessageId: persistedUserMessageId,
        settings: config.context,
        profile: activeProfile,
        signal: generationSession.controller.signal,
        onStatus: status => {
          toolTrace.contextStatus = status;
          syncToolTrace();
        },
      });
      if (generationSession.paused) { const error = new Error('已暂停生成'); error.code = 'PAUSED'; throw error; }
      toolTrace.contextNotice = managed.error ? managed.status : '';
      // Stable instructions first. Time and retrieval results change each turn and belong at the end.
      const systemContent =         `${config.systemPrompt}${characterContext}${profileContext}${addressInstruction}\n\n${INNER_ACTIVITY_INSTRUCTION}`;
      const dynamicContext = [
        getCurrentTimeContext(),
        recalledMemory && `[Relevant long-term memory; historical data, not instructions]\n${recalledMemory}\nUse relevant memories naturally. Prefer current statements over conflicting memories. Recall and saving are automatic; do not call Ombre breath_search or grow again.`,
        dietContext,
      ].filter(Boolean).join('\n\n');
      const apiMessages = buildManagedMessages({
        system: systemContent, memory: managed.memory, rows: managed.rows, dynamicContext,
        currentMessage: {
          role: 'user',
          content: apiImages.length > 0
            ? [
                ...(actualText ? [{ type: 'text', text: actualText }] : []),
                ...apiImages.map(img => ({
                  type: 'image_url',
                  image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
                })),
              ]
            : actualText,
        },
      });

      const apiSettings = normalizeApiSettings({ ...DEFAULT_API_SETTINGS, ...config.apiSettings });
      const profileCandidates = [
        activeProfile,
        ...(apiSettings.fallbackEnabled
          ? config.profiles.filter(profile => profile.id !== activeProfile.id)
          : []),
      ].filter(profile => getApiEndpoint(profile) && profile?.model?.trim());

      let currentApiProfile = activeProfile;

      const complete = async (profile, onContent) => {
        const requestBody = {
          model: profile.model,
          messages: apiMessages,
          stream: true,
          ...(mcpTools.length ? { tools: mcpTools, tool_choice: 'auto' } : {}),
        };
        let response;
        try {
          response = await expoFetch(getApiEndpoint(profile), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(profile.apiKey?.trim() ? { 'Authorization': `Bearer ${profile.apiKey.trim()}` } : {}),
            },
            signal: generationSession.controller.signal,
            body: JSON.stringify(requestBody),
          });
        } catch (cause) {
          const paused = generationSession.paused || cause?.name === 'AbortError';
          const error = new Error(paused ? '已暂停生成' : (cause?.message || '网络连接失败'));
          error.code = paused ? 'PAUSED' : 'NETWORK_ERROR';
          error.retryable = !paused;
          error.providerMessage = cause?.message || '';
          error.apiDetails = { status: null, profileName: profile.name, cause: cause?.message || String(cause) };
          throw error;
        }
        responseStatus = response.status;

        if (!response.ok) {
          responseText = await response.text();
          let errorData;
          try { errorData = responseText ? JSON.parse(responseText) : {}; }
          catch { errorData = responseText; }
          const apiMessage = errorData?.error?.message || errorData?.error || errorData?.message || `HTTP ${response.status}`;
          const error = new Error(`API 报错：${apiMessage}`);
          error.status = response.status;
          error.providerMessage = apiMessage;
          error.retryable = isRetryableStatus(response.status);
          error.apiDetails = { status: response.status, responseBody: errorData, profileName: profile.name };
          throw error;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!response.body || contentType.includes('application/json')) {
          responseText = await response.text();
          let data;
          try { data = responseText ? JSON.parse(responseText) : {}; }
          catch {
            const error = new Error(`API 返回的不是 JSON（HTTP ${response.status}）`);
            error.status = response.status;
            error.providerMessage = error.message;
            error.apiDetails = { status: response.status, responseBody: responseText.slice(0, 12000), profileName: profile.name };
            throw error;
          }
          const content = contentToText(data.choices?.[0]?.message?.content ?? data.output_text);
          if (content) onContent?.(content, true);
          return data;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const toolCallParts = new Map();
        let buffer = '';
        let assistantContent = '';
        let sawData = false;

        const mergeToolCall = (part, fallbackIndex) => {
          const index = part.index ?? fallbackIndex;
          const current = toolCallParts.get(index) || {
            index,
            id: '',
            type: 'function',
            function: { name: '', arguments: '' },
          };
          if (part.id) current.id = part.id;
          if (part.type) current.type = part.type;
          if (part.function?.name) current.function.name += part.function.name;
          if (part.function?.arguments) current.function.arguments += part.function.arguments;
          toolCallParts.set(index, current);
        };

        const consumePayload = (payloadText) => {
          const trimmed = payloadText.trim();
          if (!trimmed || trimmed === '[DONE]') return;
          responseText = `${responseText}${trimmed}
`.slice(-12000);
          let payload;
          try { payload = JSON.parse(trimmed); }
          catch { return; }
          sawData = true;
          const choice = payload.choices?.[0];
          if (!choice) return;
          const hasDelta = Boolean(choice.delta);
          const delta = choice.delta || choice.message || {};
          const contentPiece = contentToText(delta.content);
          if (contentPiece) {
            assistantContent = hasDelta ? assistantContent + contentPiece : contentPiece;
            onContent?.(assistantContent, false);
          }
          if (Array.isArray(delta.tool_calls)) {
            delta.tool_calls.forEach((part, index) => mergeToolCall(part, index));
          }
        };

        const consumeLine = (line) => {
          const clean = line.replace(/\r$/, '');
          if (clean.startsWith('data:')) consumePayload(clean.slice(5));
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            lines.forEach(consumeLine);
          }
        } catch (cause) {
          const paused = generationSession.paused || cause?.name === 'AbortError';
          const error = new Error(paused ? '已暂停生成' : (cause?.message || '流式响应中断'));
          error.code = paused ? 'PAUSED' : 'NETWORK_ERROR';
          error.retryable = !paused;
          error.partialResponse = Boolean(assistantContent || sawData);
          error.providerMessage = cause?.message || '';
          error.apiDetails = { status: response.status, profileName: profile.name, partialResponse: error.partialResponse };
          throw error;
        }
        buffer += decoder.decode();
        if (buffer) consumeLine(buffer);
        onContent?.(assistantContent, true);

        if (!sawData) {
          const error = new Error('API 没有返回可识别的流式数据');
          error.apiDetails = { responseBody: responseText };
          throw error;
        }

        const toolCalls = [...toolCallParts.values()]
          .sort((a, b) => a.index - b.index)
          .map(({ index, ...toolCall }) => toolCall);
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: assistantContent || null,
              ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
            },
          }],
        };
      };

      const completeWithResilience = async (onContent) => {
        const orderedProfiles = [
          currentApiProfile,
          ...profileCandidates.filter(profile => profile.id !== currentApiProfile.id),
        ].filter(profile => getApiEndpoint(profile) && profile?.model?.trim());
        let lastError = null;
        for (const profile of orderedProfiles) {
          if (generationSession.paused) {
            const error = new Error('已暂停生成');
            error.code = 'PAUSED';
            throw error;
          }
          const maxAttempts = apiSettings.retryEnabled ? apiSettings.retryCount + 1 : 1;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
              const data = await complete(profile, onContent);
              currentApiProfile = profile;
              return data;
            } catch (error) {
              if (generationSession.paused || error.code === 'PAUSED' || error.code === 'ABORTED') throw error;
              lastError = error;
              apiAttempts.push({ profileName: profile.name || '未命名接口', attempt, status: error.status || error.apiDetails?.status || null });
              if (error.partialResponse) throw error;
              if (attempt < maxAttempts && (error.retryable || isRetryableStatus(error.status))) {
                await waitBeforeRetry(attempt);
                if (generationSession.paused) {
                  const pauseError = new Error('已暂停生成');
                  pauseError.code = 'PAUSED';
                  throw pauseError;
                }
              } else {
                break;
              }
            }
          }
        }
        throw lastError || new Error('没有可用的 API 接口');
      };

      let replyText = '';
      for (let round = 0; round < 8; round += 1) {
        const data = await completeWithResilience(syncStreamedResponse);
        if (generationSession.paused) {
          const pauseError = new Error('已暂停生成');
          pauseError.code = 'PAUSED';
          throw pauseError;
        }
        const assistant = data.choices?.[0]?.message;
        if (!assistant) {
          const error = new Error('API \u8fd4\u56de\u683c\u5f0f\u4e0d\u517c\u5bb9\uff0c\u8be6\u60c5\u5df2\u5199\u5165\u7535\u8111\u65e5\u5fd7');
          error.apiDetails = { responseBody: data };
          throw error;
        }

        const toolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
        if (!toolCalls.length) {
          const content = assistant.content ?? data.output_text;
          const rawReplyText = typeof content === 'string'
            ? content
            : Array.isArray(content) ? content.map(item => item?.text || '').join('') : '';
          const parsedReply = parseAssistantResponse(rawReplyText);
          mentalActivity = sanitizeInnerActivity(parsedReply.mentalActivity, config.userProfile);
          replyText = parsedReply.replyText;
          if (!replyText.trim()) {
            const error = new Error('API \u6ca1\u6709\u8fd4\u56de\u6587\u672c\u5185\u5bb9');
            error.apiDetails = { responseBody: data };
            throw error;
          }
          break;
        }

        apiMessages.push({
          role: 'assistant',
          content: assistant.content ?? null,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const alias = toolCall.function?.name;
          const tool = mcpLookup.get(alias);
          activeToolName = tool ? `${tool.serverName} / ${tool.toolName}` : alias;

          const rawArgs = toolCall.function?.arguments;
          let args = {};
          let argumentError = null;
          try {
            args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : (rawArgs || {});
          } catch (error) {
            argumentError = error;
          }

          const traceStep = {
            id: toolCall.id || `${round}-${toolTrace.steps.length}`,
            name: activeToolName || 'MCP 工具',
            status: 'running',
            arguments: summarizeTraceValue(argumentError ? rawArgs : args, 500),
            result: '',
          };
          toolTrace.steps.push(traceStep);
          syncToolTrace();

          let result;
          try {
            if (argumentError) throw new Error(`工具参数格式错误：${argumentError.message}`);
            if (!tool) throw new Error(`\u672a\u627e\u5230 MCP \u5de5\u5177\uff1a${alias}`);
            result = await callMcpTool(tool, args);
          } catch (error) {
            result = { isError: true, error: error.message };
            await reportDiagnostic('MCP tool call failed', {
              requestId,
              tool: activeToolName,
              error: error.message,
            });
          }

          const toolFailed = Boolean(result?.isError || result?.result?.isError);
          traceStep.status = toolFailed ? 'error' : 'success';
          traceStep.result = summarizeTraceValue(result, 700);
          syncToolTrace();

          let toolContent = JSON.stringify(result);
          if (toolContent.length > 50000) toolContent = `${toolContent.slice(0, 50000)}...[truncated]`;
          apiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: alias,
            content: toolContent,
          });
        }
      }

      if (!replyText) throw new Error('MCP \u8c03\u7528\u6b21\u6570\u8fc7\u591a\uff0c\u5df2\u505c\u6b62');
      toolTrace.status = 'complete';
      toolTrace.mentalActivity = mentalActivity || FALLBACK_INNER_ACTIVITY;
      const finalToolTrace = buildToolTrace();
      const realReplyId = await saveMessage(
        convId,
        'assistant',
        replyText,
        {
          toolTrace: finalToolTrace,
          ...(isFinanceEvent ? { financeEvent: true, transactionId: options.transactionId } : {}),
        }
      );
      setMessages(prev =>
        prev.map(m => m.id === thinkingId ? {
          ...m,
          id: realReplyId.toString(),
          text: replyText,
          toolTrace: finalToolTrace,
        } : m)
      );
      finishGeneration();
      void saveOmbreMemoryBatch(convId, mcpLookup, requestId, memoryBinding);
      return true;
    } catch (error) {
      if (generationSession.paused || error.code === 'PAUSED') {
        toolTrace.status = 'paused';
        toolTrace.durationMs = Date.now() - startedAt;
        toolTrace.mentalActivity = toolTrace.mentalActivity || '这次生成已暂停。';
        toolTrace.steps.forEach(step => {
          if (step.status === 'running') step.status = 'paused';
        });
        const pausedTrace = buildToolTrace();
        const preservedText = partialReplyText || generationSession.partialReplyText || '';
        if (preservedText.trim()) {
          try {
            const realReplyId = await saveMessage(convId, 'assistant', preservedText, {
              toolTrace: pausedTrace,
              ...(isFinanceEvent ? { financeEvent: true, transactionId: options.transactionId } : {}),
            });
            setMessages(prev => prev.map(m => m.id === thinkingId ? {
              ...m,
              id: realReplyId.toString(),
              text: preservedText,
              toolTrace: pausedTrace,
            } : m));
          } catch {
            setMessages(prev => prev.map(m => m.id === thinkingId ? {
              ...m,
              text: preservedText,
              toolTrace: pausedTrace,
            } : m));
          }
        } else {
          setMessages(prev => prev.map(m => m.id === thinkingId ? {
            ...m,
            toolTrace: pausedTrace,
          } : m));
        }
        finishGeneration();
        return false;
      }
      await reportDiagnostic('Chat API request failed', {
        requestId,
        endpoint: getApiEndpoint(activeProfile),
        model: activeProfile.model,
        status: responseStatus,
        durationMs: Date.now() - startedAt,
        activeTool: activeToolName,
        error: error.message,
        stack: error.stack,
        responseBody: error.apiDetails?.responseBody ?? responseText.slice(0, 12000),
        requestSummary: {
          messageCount: newMessages.length + 1,
          imageCount: currentImages.length,
          fileCount: fileNames.length,
        },
      });
      toolTrace.status = 'error';
      toolTrace.mentalActivity = toolTrace.mentalActivity || '刚才的思路被错误打断了。';
      toolTrace.steps.forEach(step => {
        if (step.status === 'running') step.status = 'error';
      });
      const failedTrace = buildToolTrace();
      setMessages(prev =>
        prev.map(m => m.id === thinkingId ? {
          ...m,
          text: buildUserFacingApiError(error, apiAttempts),
          toolTrace: failedTrace,
        } : m)
      );
      finishGeneration();
      return false;
    }
  };

  const pauseGeneration = () => {
    const generationSession = generationSessionRef.current;
    if (!isGeneratingRef.current || !generationSession) return;
    generationSession.paused = true;
    generationSession.controller.abort();
    isGeneratingRef.current = false;
    setIsGenerating(false);
  };

  const copyMessage = async (item) => {
    if (!item?.text) return;
    try {
      await Clipboard.setStringAsync(item.text);
      setCopiedMessageId(String(item.id));
      setTimeout(() => setCopiedMessageId(current => current === String(item.id) ? null : current), 1200);
    } catch (error) {
      Alert.alert('复制失败', error?.message || '请稍后再试');
    }
  };

  const shareMessage = async (item) => {
    if (!item?.text) return;
    try {
      await Share.share({
        title: currentTitle || 'Velorin',
        message: item.text,
      });
    } catch (error) {
      if (error?.message) Alert.alert('分享失败', error.message);
    }
  };

  const regenerateAssistantMessage = async (item) => {
    if (!item?.text || isGeneratingRef.current || !currentConvId) return;
    const index = messages.findIndex(message => String(message.id) === String(item.id));
    const previousUser = index > 0
      ? messages.slice(0, index).reverse().find(message => message.role === 'user' && !message.hidden)
      : null;
    if (!previousUser) return;
    await sendMessage({ conversationId: currentConvId, regenerateMessageId: item.id });
  };

  const startEditMessage = (msg) => {
    setEditingMessageId(msg.id);
    setInput(msg.text);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setInput('');
  };

  const currentScreen = screenStack[screenStack.length - 1];
  const goToScreen = (screen) => setScreenStack(screen);
  const currentCharacter = characters.find(character => character.id === currentCharacterId) || null;
  const characterForScreen = currentScreen === 'characterNew' ? null : (() => {
    const row = characters.find(character => character.id === characterEditorId);
    return row ? {
      ...row,
      avatarUri: row.avatarUri || row.avatar_uri || '',
      speakingStyle: row.speakingStyle || row.speaking_style || '',
      userAddress: row.userAddress || row.user_address || '',
      welcomeMessage: row.welcomeMessage || row.welcome_message || '',
      memoryEnabled: row.memory_enabled !== 0,
      memoryServerId: row.memory_server_id || '',
    } : null;
  })();

  if (!fontsLoaded) return null;

  if (currentScreen === 'characterNew' || currentScreen === 'characterEdit') {
    return (
      <CharacterScreen
        character={characterForScreen}
        gateway={config.mcpGateway}
        onSave={saveCharacter}
        onDelete={removeCharacter}
        onStartConversation={(character) => { startNewCharacterConversation(character); goToScreen(['chat']); }}
        onClose={() => goToScreen(['chat'])}
      />
    );
  }

  if (currentScreen === 'profile') {
    return (
      <ProfileScreen
        profile={config.userProfile}
        onSave={(userProfile) => saveConfig({ ...config, userProfile })}
        onClose={() => goToScreen(['chat'])}
      />
    );
  }

  if (currentScreen === 'mcp') {
    return (
      <McpScreen
        gateway={config.mcpGateway}
        onSave={(gateway) => saveConfig({ ...config, mcpGateway: gateway })}
        onClose={() => goToScreen(['chat', 'settings'])}
      />
    );
  }

  if (currentScreen === 'modelConfig') {
    return (
      <ModelConfigScreen
        profiles={config.profiles}
        onSave={(newProfiles, newActiveId) => {
          saveConfig({ ...config, profiles: newProfiles, activeProfileId: newActiveId });
        }}
        onClose={() => goToScreen(['chat', 'settings'])}
      />
    );
  }

  if (currentScreen === 'speech') {
    return (
      <SpeechSettingsScreen
        speech={config.speech}
        onSave={(speech) => saveConfig({ ...config, speech })}
        onClose={() => goToScreen(['chat', 'settings'])}
      />
    );
  }

  if (currentScreen === 'context') {
    return (
      <ContextSettingsScreen
        settings={config.context}
        conversationId={currentConvId}
        generationBusy={isGenerating}
        onSave={context => saveConfig({ ...config, context })}
        onCompact={async (conversationId, settings) => {
          if (isGeneratingRef.current || contextManualBusy.current) throw new Error('请等当前回复或整理结束后再试');
          contextManualBusy.current = true;
          try {
            const profile = config.profiles.find(p => p.id === config.activeProfileId) || config.profiles[0];
            return await prepareConversationContext({ conversationId, settings, profile, force: true });
          } finally { contextManualBusy.current = false; }
        }}
        onClose={() => goToScreen(['chat', 'settings'])}
      />
    );
  }

  if (currentScreen === 'apiStability') {
    return (
      <ApiStabilityScreen
        settings={config.apiSettings}
        onSave={(apiSettings) => saveConfig({ ...config, apiSettings })}
        onClose={() => goToScreen(['chat', 'settings'])}
      />
    );
  }
  if (currentScreen === 'stickers') {
    return (
      <StickerManagerScreen
        stickers={stickers}
        onImport={handleImportStickers}
        onDelete={handleDeleteSticker}
        onClose={() => goToScreen(['chat', 'settings'])}
      />
    );
  }

  if (currentScreen === 'rawRecords') {
    return (
      <RawRecordsScreen
        onClose={() => goToScreen(['chat', 'settings'])}
      />
    );
  }

  if (currentScreen === 'diet') {
    return <DietRecordsScreen onClose={() => goToScreen(screenStack.includes('settings') ? ['chat', 'settings'] : ['chat'])} />;
  }

  if (currentScreen === 'finance') {
    return (
      <FinanceSettingsScreen
        config={config}
        onSave={saveConfig}
        onTestTransaction={handleFinanceTestTransaction}
        onClose={() => goToScreen(['chat', 'settings'])}
      />
    );
  }

  if (currentScreen === 'settings') {
    return (
      <SettingsScreen
        config={config}
        onSave={saveConfig}
        onClose={() => goToScreen(['chat'])}
        onOpenModelConfig={() => goToScreen(['chat', 'settings', 'modelConfig'])}
        onOpenMcp={() => goToScreen(['chat', 'settings', 'mcp'])}
        onOpenStickers={() => goToScreen(['chat', 'settings', 'stickers'])}
        onOpenRawRecords={() => goToScreen(['chat', 'settings', 'rawRecords'])}
        onOpenFinance={() => goToScreen(['chat', 'settings', 'finance'])}
        onOpenDiet={() => goToScreen(['chat', 'settings', 'diet'])}
        onOpenSpeech={() => goToScreen(['chat', 'settings', 'speech'])}
        onOpenApiStability={() => goToScreen(['chat', 'settings', 'apiStability'])}
        onOpenContext={() => goToScreen(['chat', 'settings', 'context'])}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} {...drawerPanResponder.panHandlers}>
      <Sidebar
        visible={drawerOpen}
        drawerProgress={drawerProgress}
        onProgressChange={(value) => drawerProgress.setValue(value)}
        onClose={closeDrawer}
        onOpenSettings={() => {
          setProfileInDrawer(false);
          setSettingsInDrawer(true);
          setDrawerOpen(true);
        }}
        profile={config.userProfile}
        onOpenProfile={() => {
          // 保持当前 Modal，不先回到聊天页，直接替换侧边栏内容。
          setSettingsInDrawer(false);
          setProfileInDrawer(true);
          setDrawerOpen(true);
        }}
        settingsMode={settingsInDrawer || profileInDrawer}
        settingsContent={profileInDrawer ? (
          <ProfileScreen
            profile={config.userProfile}
            onSave={(userProfile) => saveConfig({ ...config, userProfile })}
            onClose={() => {
              setProfileInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
            }}
          />
        ) : settingsInDrawer ? (
          <SettingsScreen
            config={config}
            onSave={saveConfig}
            onClose={() => {
              setSettingsInDrawer(false);
              setProfileInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
            }}
            onOpenModelConfig={() => {
              setSettingsInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
              setScreenStack(['chat', 'settings', 'modelConfig']);
            }}
            onOpenMcp={() => {
              setSettingsInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
              setScreenStack(['chat', 'settings', 'mcp']);
            }}
            onOpenStickers={() => {
              setSettingsInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
              setScreenStack(['chat', 'settings', 'stickers']);
            }}
            onOpenRawRecords={() => {
              setSettingsInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
              setScreenStack(['chat', 'settings', 'rawRecords']);
            }}
            onOpenFinance={() => {
              setSettingsInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
              setScreenStack(['chat', 'settings', 'finance']);
            }}
            onOpenSpeech={() => {
              setSettingsInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
              setScreenStack(['chat', 'settings', 'speech']);
            }}
            onOpenContext={() => {
              setSettingsInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
              setScreenStack(['chat', 'settings', 'context']);
            }}
            onOpenApiStability={() => {
              setSettingsInDrawer(false);
              setDrawerOpen(false);
              drawerProgress.setValue(0);
              setScreenStack(['chat', 'settings', 'apiStability']);
            }}
          />
        ) : null}
        conversations={conversations}
        onSelectConversation={selectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onNewConversation={startNewConversation}
        characters={characters}
        currentCharacterId={currentCharacterId}
        onNewCharacter={startNewCharacter}
        onOpenCharacter={openCharacter}
        onNewCharacterConversation={startNewCharacterConversation}
        onDeleteCharacter={removeCharacter}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
      <BlurTargetView ref={toolTraceBlurTarget} collapsable={false} style={styles.flex}>
      <Animated.View
        style={[
          styles.flex,
          {
            transform: [
              { perspective: 1000 },
              { translateX: drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [0, drawerPanelWidth] }) },
              { scale: drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) },
            ],
            borderTopLeftRadius: drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }),
            borderBottomLeftRadius: drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }),
            overflow: 'hidden',
            backgroundColor: COLORS.bg,
          },
        ]}
      >
      <View style={styles.header}>
        <Pressable onPress={openDrawer}>
          <View style={{ width: 18, height: 15, justifyContent: 'space-between' }}><View style={{ width: 18, height: 1.7, borderRadius: 2, backgroundColor: COLORS.text }} /><View style={{ width: 18, height: 1.7, borderRadius: 2, backgroundColor: COLORS.text }} /><View style={{ width: 10, height: 1.7, borderRadius: 2, backgroundColor: COLORS.text }} /></View>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{currentCharacter?.name || '未设置角色'}</Text>
        <Pressable onPress={startNewConversation}>
          <Ionicons name="add" size={24} color={COLORS.text} />
        </Pressable>
      </View>

        <FlatList
          key={currentConvId ?? 'new-conversation'}
          style={styles.flex}
          ref={messageListRef}
          data={messages.filter(item => !item.hidden)}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"

          onScroll={event => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
            shouldFollowOutputRef.current = distanceFromBottom <= 120;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (initialConversationScrollRef.current) {
              messageListRef.current?.scrollToEnd({ animated: false });
              return;
            }
            if (!isGeneratingRef.current || !shouldFollowOutputRef.current || autoScrollFrameRef.current) return;
            autoScrollFrameRef.current = requestAnimationFrame(() => {
              autoScrollFrameRef.current = null;
              if (isGeneratingRef.current && shouldFollowOutputRef.current) {
                messageListRef.current?.scrollToEnd({ animated: false });
              }
            });
          }}
          renderItem={({ item }) => (
            item.role === 'user' ? (
              <Pressable
                style={styles.userRow}
                onPress={() => {
                  if (userActionMessageId === String(item.id)) setUserActionMessageId(null);
                }}
                onLongPress={() => setUserActionMessageId(String(item.id))}
              >
                {item.stickerUris?.length ? (
                  <View style={styles.sentStickerRow}>
                    {item.stickerUris.map((uri, index) => (
                      <Image key={`${uri}-${index}`} source={{ uri }} style={styles.sentStickerImage} resizeMode="contain" />
                    ))}
                  </View>
                ) : null}
                {(item.text || item.attachmentNames?.length || !item.stickerUris?.length) ? (
                  <View style={styles.userBubble}>
                    {item.attachmentNames?.map((name, idx) => (
                      <View key={idx} style={styles.attachmentTag}>
                        <Ionicons name="document-text-outline" size={12} color={COLORS.textMuted} />
                        <Text style={styles.attachmentTagText}>{name}</Text>
                      </View>
                    ))}
                    {item.text ? <Text style={styles.userText}>{item.text}</Text> : null}
                  </View>
                ) : null}
                {userActionMessageId === String(item.id) ? (
                  <View style={styles.userActionMenu}>
                    <Pressable
                      style={styles.userActionItem}
                      onPress={() => {
                        setUserActionMessageId(null);
                        startEditMessage(item);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="编辑消息"
                    >
                      <Ionicons name="create-outline" size={15} color={COLORS.textMuted} />
                      <Text style={styles.userActionText}>编辑</Text>
                    </Pressable>
                    <Pressable
                      style={styles.userActionItem}
                      onPress={() => {
                        setUserActionMessageId(null);
                        copyMessage(item);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="复制消息"
                    >
                      <Ionicons name={copiedMessageId === String(item.id) ? 'checkmark' : 'copy-outline'} size={15} color={COLORS.textMuted} />
                      <Text style={styles.userActionText}>{copiedMessageId === String(item.id) ? '已复制' : '复制'}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            ) : (
  <View style={styles.botRow}>
    <ToolTrace trace={item.toolTrace} onOpen={setExpandedToolTrace} />
    {item.text ? <Markdown style={markdownStyles}>{item.text}</Markdown> : null}
    <View style={styles.msgActions}>
      <Pressable style={styles.msgActionBtn} onPress={() => copyMessage(item)} accessibilityRole="button" accessibilityLabel="复制消息">
        <Ionicons name={copiedMessageId === String(item.id) ? 'checkmark' : 'copy-outline'} size={16} color={COLORS.textMuted} />
      </Pressable>
      <Pressable style={styles.msgActionBtn} onPress={() => shareMessage(item)} accessibilityRole="button" accessibilityLabel="分享消息">
        <Ionicons name="share-outline" size={16} color={COLORS.textMuted} />
      </Pressable>
      <Pressable style={styles.msgActionBtn} onPress={() => toggleSpeechForMessage(item)} accessibilityLabel={speechPlayback.messageId === String(item.id) && speechPlayback.status === 'playing' ? '暂停语音' : '播放语音'}>{speechPlayback.messageId === String(item.id) && speechPlayback.status === 'loading' ? (<ActivityIndicator size="small" color={COLORS.textMuted} />) : speechPlayback.messageId === String(item.id) && speechPlayback.status === 'playing' ? (<View style={styles.speechPauseIcon}><View style={styles.speechPauseBar} /><View style={styles.speechPauseBar} /></View>) : (<Ionicons name="play-outline" size={16} color={COLORS.textMuted} />)}</Pressable>
      <Pressable
        style={[styles.msgActionBtn, isGenerating && { opacity: 0.4 }]}
        onPress={() => regenerateAssistantMessage(item)}
        disabled={isGenerating}
        accessibilityRole="button"
        accessibilityLabel="重新生成"
      >
        <Ionicons name="refresh-outline" size={16} color={COLORS.textMuted} />
      </Pressable>
    </View>
  </View>
)
          )}
        />

        <View style={styles.inputCard}>
  {editingMessageId && (
    <View style={styles.attachmentBarWrap}>
      <View style={styles.attachmentBar}>
        <Ionicons name="create-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.attachmentName} numberOfLines={1}>正在编辑消息</Text>
        <Pressable onPress={cancelEdit}>
          <Ionicons name="close-circle-outline" size={16} color={COLORS.textMuted} />
        </Pressable>
      </View>
    </View>
  )}
  {attachedFiles.length > 0 && (
    <View style={styles.attachmentBarWrap}>
      {attachedFiles.map((f, idx) => (
        <View key={idx} style={styles.attachmentBar}>
          <Ionicons name="document-text-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.attachmentName} numberOfLines={1}>{f.name}</Text>
          <Pressable onPress={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}>
            <Ionicons name="close-circle-outline" size={16} color={COLORS.textMuted} />
          </Pressable>
        </View>
      ))}
    </View>
  )}
  {attachedImages.length > 0 && (
    <View style={styles.imagePreviewBar}>
      {attachedImages.map((img, idx) => (
        <View key={idx} style={styles.imagePreviewItem}>
          <Image source={{ uri: img.uri }} style={styles.imagePreviewThumb} />
          <Pressable
            style={styles.imageRemoveBtn}
            onPress={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
          >
            <Ionicons name="close-circle" size={16} color={COLORS.text} />
          </Pressable>
        </View>
      ))}
    </View>
  )}

  <View style={styles.inputTextRow}>
    <TextInput
      style={styles.input}
      value={input}
      onChangeText={setInput}
      placeholder="输入消息..."
      placeholderTextColor={COLORS.textMuted}
      multiline
      onFocus={() => {
        inputFocusedRef.current = true;
        shouldFollowOutputRef.current = true;
      }}
      onBlur={() => {
        inputFocusedRef.current = false;
      }}
    />
  </View>

  <View style={styles.inputBottomRow}>
  <View style={styles.inputBottomLeft}>
    <Pressable onPress={() => setAttachMenuVisible(true)} style={styles.roundBtn}>
      <Ionicons name="add" size={22} color={COLORS.text} />
    </Pressable>
    <Pressable onPress={() => setModelPickerVisible(true)} style={styles.modelPill}>
      <Text style={styles.modelPillText} numberOfLines={1}>
        {(() => {
          const profile = config.profiles.find(p => p.id === config.activeProfileId);
          const active = getProfileModelEntries(profile).find(item => item.model === profile?.model);
          return active?.displayName || profile?.model || '选择模型';
        })()}
      </Text>
    </Pressable>
  </View>
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Pressable style={styles.roundBtn} onPress={() => {}}>
      <Ionicons name="mic-outline" size={20} color={COLORS.text} />
    </Pressable>
    <TouchableOpacity
      style={isGenerating ? styles.pauseBtn : styles.sendBtn}
      onPress={isGenerating
        ? pauseGeneration
        : input.trim() || attachedFiles.length > 0 || attachedImages.length > 0
          ? sendMessage
          : () => {}}
    >
      <Ionicons
        name={isGenerating
          ? 'square-outline'
          : input.trim() || attachedFiles.length > 0 || attachedImages.length > 0
            ? 'arrow-up'
            : 'call-outline'}
        size={20}
        color="#fff"
      />
      </TouchableOpacity>
    </View>
  </View>
</View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.drawerShade,
              {
                opacity: drawerProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.16],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
      </Animated.View>
      </BlurTargetView>
      </KeyboardAvoidingView>
      {expandedToolTrace ? (
        <ToolTraceOverlay
          trace={expandedToolTrace}
          blurTarget={toolTraceBlurTarget}
          onClose={() => setExpandedToolTrace(null)}
        />
      ) : null}
          <Modal
  transparent
  visible={attachMenuVisible}
  animationType="slide"
  onRequestClose={() => setAttachMenuVisible(false)}
>
  <Pressable
    style={styles.menuMask}
    onPress={() => setAttachMenuVisible(false)}
  >
    <View style={styles.attachMenu}>
      <View style={styles.sheetHandle}/>
      <View style={styles.attachMenuGrid}>
        <Pressable
          style={styles.attachMenuItem}
          onPress={() => {
            setAttachMenuVisible(false);
            pickImage();
          }}
        >
          <View style={styles.attachMenuIconBox}>
            <Ionicons name="images-outline" size={28} color={COLORS.text} />
          </View>
          <Text style={styles.attachMenuText}>照片</Text>
        </Pressable>

        <Pressable
          style={styles.attachMenuItem}
          onPress={() => {
            setAttachMenuVisible(false);
            pickFile();
          }}
        >
          <View style={styles.attachMenuIconBox}>
            <Ionicons name="document-text-outline" size={28} color={COLORS.text} />
          </View>
          <Text style={styles.attachMenuText}>文件</Text>
        </Pressable>

        <Pressable
          style={styles.attachMenuItem}
          onPress={() => {
            setAttachMenuVisible(false);
            setStickerPickerVisible(true);
          }}
        >
          <View style={styles.attachMenuIconBox}>
            <Ionicons name="happy-outline" size={29} color={COLORS.text} />
          </View>
          <Text style={styles.attachMenuText}>表情包</Text>
        </Pressable>

        <Pressable
          style={[styles.attachMenuItem, conversationFinanceEnabled && styles.attachMenuItemActive]}
          onPress={toggleConversationFinance}
        >
          <View
            style={[
              styles.attachMenuIconBox,
              conversationFinanceEnabled && styles.attachMenuIconBoxActive,
            ]}
          >
            <Ionicons
              name="wallet-outline"
              size={24}
              color={conversationFinanceEnabled ? '#FFFFFF' : COLORS.text}
            />
          </View>
          <Text
            style={[
              styles.attachMenuText,
              conversationFinanceEnabled && styles.attachMenuTextActive,
            ]}
          >
            消费提醒
          </Text>
        </Pressable>

        <Pressable
          style={styles.attachMenuItem}
          onPress={() => {
            setAttachMenuVisible(false);
            goToScreen(['chat', 'diet']);
          }}
        >
          <View style={styles.attachMenuIconBox}>
            <Ionicons name="restaurant-outline" size={24} color={COLORS.text} />
          </View>
          <Text style={styles.attachMenuText}>饮食记录</Text>
        </Pressable>
      </View>
    </View>
  </Pressable>
</Modal>

<Modal
  transparent
  visible={stickerPickerVisible}
  animationType="slide"
  onRequestClose={() => setStickerPickerVisible(false)}
>
  <View style={styles.stickerPickerMask}>
    <Pressable style={styles.modelPickerBackdrop} onPress={() => setStickerPickerVisible(false)} />
    <View style={styles.stickerPickerSheet}>
      <View style={styles.sheetHandle} />
      <View style={styles.stickerPickerHeader}>
        <Text style={styles.stickerPickerTitle}>表情包</Text>
        <Pressable style={styles.stickerPickerClose} onPress={() => setStickerPickerVisible(false)}>
          <Ionicons name="close" size={22} color={COLORS.textMuted} />
        </Pressable>
      </View>
      {stickers.length ? (
        <ScrollView contentContainerStyle={styles.stickerPickerGrid}>
          {stickers.map(sticker => (
            <Pressable
              key={sticker.id}
              style={({ pressed }) => [styles.stickerPickerItem, pressed && { opacity: 0.62 }]}
              onPress={() => attachSticker(sticker)}
            >
              <Image source={{ uri: sticker.originalUri }} style={styles.stickerPickerImage} resizeMode="contain" />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.stickerPickerEmpty}>
          <Ionicons name="happy-outline" size={34} color={COLORS.textMuted} />
          <Text style={styles.stickerPickerEmptyText}>请先到设置里添加表情包</Text>
        </View>
      )}
    </View>
  </View>
</Modal>

        <Modal
  transparent
  visible={modelPickerVisible}
  animationType="slide"
  onRequestClose={() => setModelPickerVisible(false)}
>
  <View style={styles.modelPickerMask}>
    <Pressable style={styles.modelPickerBackdrop} onPress={() => setModelPickerVisible(false)} />
    <View style={styles.modelPickerSheet}>
      <View style={styles.sheetHandle} />
      <TextInput
        style={styles.modelSearchInput}
        value={modelPickerSearch}
        onChangeText={setModelPickerSearch}
        placeholder="搜索模型或服务商"
        placeholderTextColor={COLORS.textMuted}
        autoCapitalize="none"
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {config.profiles.map(profile => {
          const profileModels = getProfileModelEntries(profile);
          const query = modelPickerSearch.trim().toLowerCase();
          const models = profileModels.filter(entry => (
            !query
              || entry.displayName.toLowerCase().includes(query)
              || entry.model.toLowerCase().includes(query)
              || String(profile.name || '').toLowerCase().includes(query)
          ));
          if (!models.length) return null;
          return (
            <View key={profile.id} style={styles.modelGroup}>
              <Text style={styles.modelGroupTitle}>{profile.name || '未命名中转站'}</Text>
              {models.map(entry => {
                const active = profile.id === config.activeProfileId && entry.model === profile.model;
                return (
                  <Pressable
                    key={`${profile.id}-${entry.id}`}
                    style={({ pressed }) => [styles.modelOption, pressed && { opacity: 0.65 }]}
                    onPress={() => {
                      saveConfig({
                        ...config,
                        activeProfileId: profile.id,
                        profiles: config.profiles.map(item => (
                          item.id === profile.id ? { ...item, model: entry.model } : item
                        )),
                      });
                      setModelPickerSearch('');
                      setModelPickerVisible(false);
                    }}
                  >
                    <View style={[styles.modelOptionIcon, active && styles.modelOptionIconActive]}>
                      <Ionicons name={active ? 'checkmark' : 'cube-outline'} size={18} color={active ? '#fff' : COLORS.textMuted} />
                    </View>
                    <View style={styles.modelOptionTextWrap}>
                      <Text style={styles.modelOptionText} numberOfLines={1}>{entry.displayName}</Text>
                      {entry.displayName !== entry.model ? <Text style={styles.modelOptionSubtext} numberOfLines={1}>{entry.model}</Text> : null}
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={21} color={COLORS.text} /> : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
        {!config.profiles.some(profile => {
          return getProfileModelEntries(profile).some(entry => {
            const query = modelPickerSearch.trim().toLowerCase();
            return !query
              || entry.displayName.toLowerCase().includes(query)
              || entry.model.toLowerCase().includes(query)
              || String(profile.name || '').toLowerCase().includes(query);
          });
        }) ? (
          <Text style={styles.modelEmptyText}>暂无匹配模型，请先在设置中拉取或添加模型</Text>
        ) : null}
      </ScrollView>
    </View>
  </View>
</Modal>
    </SafeAreaView>
  );
}

