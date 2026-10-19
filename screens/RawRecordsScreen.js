import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Pressable, ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { File, Paths } from 'expo-file-system';

import { COLORS } from '../colors';
import { loadAllMessages, loadConversations } from '../db';
import { SwipeBackView } from '../components/SwipeBackView';

const formatDate = (value) => {
  if (!value) return '';
  try { return new Date(value).toLocaleString(); } catch { return ''; }
};

const parseMetadata = (value) => {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
};

const toJsonLine = (message) => JSON.stringify({
  id: message.id,
  conversationId: message.conversation_id,
  role: message.role,
  content: message.content ?? '',
  metadata: parseMetadata(message.metadata),
  createdAt: message.created_at,
});

export function RawRecordsScreen({ onClose }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('jsonl');

  const refresh = async () => {
    setLoading(true);
    try {
      const [conversationRows, messageRows] = await Promise.all([
        loadConversations(),
        loadAllMessages(),
      ]);
      setConversations(conversationRows);
      setMessages(messageRows);
      setSelectedId(previous => previous ?? conversationRows[0]?.id ?? null);
    } catch (error) {
      Alert.alert('读取失败', error.message || '无法读取聊天记录');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const selectedMessages = useMemo(
    () => messages.filter(item => item.conversation_id === selectedId),
    [messages, selectedId]
  );
  const jsonl = useMemo(
    () => selectedMessages.map(toJsonLine).join('\n'),
    [selectedMessages]
  );
  const selectedConversation = conversations.find(item => item.id === selectedId);

  const shareJsonl = async () => {
    if (!jsonl) {
      Alert.alert('暂无记录', '这个对话还没有可以导出的消息。');
      return;
    }
    try {
      const file = new File(Paths.cache, `velorin-${selectedId || 'chat'}.jsonl`);
      file.write(`${jsonl}\n`);
      await Share.share({
        title: 'Velorin 原始聊天记录',
        message: jsonl,
        url: file.uri,
      });
    } catch (error) {
      Alert.alert('导出失败', error.message || '无法分享聊天记录');
    }
  };

  return (
    <SwipeBackView onSwipeBack={onClose}>
      <SafeAreaView style={local.container}>
        <View style={local.header}>
          <Pressable style={local.headerButton} onPress={onClose}>
            <Ionicons name="arrow-back" size={27} color={COLORS.text} />
          </Pressable>
          <Text style={local.title}>原始聊天记录</Text>
          <Pressable style={local.headerButton} onPress={shareJsonl}>
            <Ionicons name="share-outline" size={23} color={COLORS.text} />
          </Pressable>
        </View>

        <View style={local.modeRow}>
          <Pressable style={[local.modeButton, mode === 'jsonl' && local.modeButtonActive]} onPress={() => setMode('jsonl')}>
            <Text style={[local.modeText, mode === 'jsonl' && local.modeTextActive]}>JSONL 原文</Text>
          </Pressable>
          <Pressable style={[local.modeButton, mode === 'readable' && local.modeButtonActive]} onPress={() => setMode('readable')}>
            <Text style={[local.modeText, mode === 'readable' && local.modeTextActive]}>阅读模式</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.conversationTabs}>
          {conversations.map(item => (
            <Pressable
              key={item.id}
              onPress={() => setSelectedId(item.id)}
              style={[local.tab, item.id === selectedId && local.tabActive]}
            >
              <Text numberOfLines={1} style={[local.tabText, item.id === selectedId && local.tabTextActive]}>
                {item.title || `对话 ${item.id}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView style={local.content} contentContainerStyle={local.contentInner}>
          {loading ? <Text style={local.empty}>正在读取……</Text> : null}
          {!loading && !selectedMessages.length ? <Text style={local.empty}>还没有聊天记录</Text> : null}
          {!loading && selectedMessages.length > 0 ? (
            <>
              <Text style={local.meta}>
                {selectedConversation?.title || '未命名对话'} · {selectedMessages.length} 条消息
              </Text>
              {mode === 'jsonl' ? (
                <Text selectable style={local.rawText}>{jsonl}</Text>
              ) : selectedMessages.map(message => (
                <View key={message.id} style={local.messageCard}>
                  <View style={local.messageHeader}>
                    <Text style={local.role}>{message.role === 'assistant' ? 'AI' : '我'}</Text>
                    <Text style={local.time}>{formatDate(message.created_at)}</Text>
                  </View>
                  <Text selectable style={local.messageText}>{message.content || '(空内容)'}</Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

const local = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, marginLeft: 14, fontSize: 23, fontWeight: '600', color: COLORS.text },
  modeRow: { flexDirection: 'row', marginHorizontal: 22, marginBottom: 12, padding: 3, borderRadius: 14, backgroundColor: COLORS.surface },
  modeButton: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  modeButtonActive: { backgroundColor: '#FFFFFF' },
  modeText: { fontSize: 14, color: COLORS.textMuted },
  modeTextActive: { color: COLORS.text, fontWeight: '600' },
  conversationTabs: { paddingHorizontal: 22, gap: 8, paddingBottom: 14 },
  tab: { maxWidth: 180, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: '#FFFFFF' },
  tabActive: { backgroundColor: COLORS.text },
  tabText: { fontSize: 13, color: COLORS.textMuted },
  tabTextActive: { color: '#FFFFFF' },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 22, paddingBottom: 80 },
  meta: { marginBottom: 12, fontSize: 12, color: COLORS.textMuted },
  rawText: { padding: 14, borderRadius: 14, backgroundColor: '#FFFFFF', color: COLORS.text, fontSize: 12, lineHeight: 19 },
  messageCard: { marginBottom: 12, padding: 14, borderRadius: 14, backgroundColor: '#FFFFFF' },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  role: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  time: { fontSize: 11, color: COLORS.textMuted },
  messageText: { color: COLORS.text, fontSize: 15, lineHeight: 24 },
  empty: { paddingTop: 80, textAlign: 'center', color: COLORS.textMuted, fontSize: 15 },
});

