import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { COLORS } from '../colors';
import { SwipeBackView } from '../components/SwipeBackView';

const EMPTY_CHARACTER = {
  name: '',
  avatarUri: '',
  persona: '',
  speakingStyle: '',
  userAddress: '',
  welcomeMessage: '',
  memoryEnabled: true,
  memoryServerId: '',
};

export function CharacterScreen({ character, gateway, onSave, onDelete, onStartConversation, onClose }) {
  const [draft, setDraft] = useState({ ...EMPTY_CHARACTER, ...character });
  const [memoryServers, setMemoryServers] = useState([]);
  const [memoryServersLoading, setMemoryServersLoading] = useState(false);
  const isEditing = Boolean(character?.id);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));

  useEffect(() => {
    let cancelled = false;
    const gatewayUrl = gateway?.url?.trim().replace(/\/+$/, '');
    if (!gatewayUrl) {
      setMemoryServers([]);
      return undefined;
    }
    const loadMemoryServers = async () => {
      setMemoryServersLoading(true);
      try {
        const headers = gateway?.token ? { Authorization: `Bearer ${gateway.token}` } : {};
        const response = await fetch(`${gatewayUrl}/api/servers`, { headers });
        const data = await response.json();
        const servers = (data.servers || []).filter(server => server.enabled !== false);
        const results = await Promise.all(servers.map(async server => {
          try {
            const toolResponse = await fetch(`${gatewayUrl}/api/tools?serverId=${encodeURIComponent(server.id)}`, { headers });
            const toolData = await toolResponse.json();
            const names = new Set((toolData.tools || []).map(tool => tool.name));
            const isOmbre = ['breath_search', 'grow', 'hold', 'trace'].every(name => names.has(name));
            return isOmbre ? { id: server.id, name: server.name || server.id, connected: server.connected !== false } : null;
          } catch {
            return null;
          }
        }));
        if (!cancelled) setMemoryServers(results.filter(Boolean));
      } catch {
        if (!cancelled) setMemoryServers([]);
      } finally {
        if (!cancelled) setMemoryServersLoading(false);
      }
    };
    loadMemoryServers();
    return () => { cancelled = true; };
  }, [gateway?.url, gateway?.token]);

  const saveAndClose = () => {
    const name = draft.name.trim();
    if (!name) return;
    onSave({ ...draft, name });
  };

  const importTextFile = async (key, maxLength, label) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const file = result.assets[0];
    if (!/\.(md|markdown|txt)$/i.test(file.name || '')) {
      Alert.alert('文件格式不支持', '请选择 .md、.markdown 或 .txt 文件');
      return;
    }

    try {
      const response = await fetch(file.uri);
      const rawText = (await response.text()).replace(/^\uFEFF/, '').trim();
      if (!rawText) {
        Alert.alert('文件为空', '这个文件里没有可导入的文字');
        return;
      }

      const applyImport = (mode) => {
        const combined = mode === 'append' && draft[key].trim()
          ? `${draft[key].trim()}\n\n${rawText}`
          : rawText;
        const next = combined.slice(0, maxLength);
        update(key, next);
        if (combined.length > maxLength) {
          Alert.alert('内容已截取', `${label}最多保留${maxLength}个字符，超出的部分没有导入。`);
        }
      };

      if (draft[key].trim()) {
        Alert.alert(`导入${label}`, '这里已经有内容，要怎么处理？', [
          { text: '取消', style: 'cancel' },
          { text: '替换', style: 'destructive', onPress: () => applyImport('replace') },
          { text: '追加', onPress: () => applyImport('append') },
        ]);
      } else {
        applyImport('replace');
      }
    } catch (error) {
      Alert.alert('读取失败', error?.message || '无法读取这个文件');
    }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.55,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    update('avatarUri', asset.base64
      ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
      : asset.uri);
  };

  return (
    <SwipeBackView onSwipeBack={onClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <Pressable style={styles.headerButton} onPress={onClose}>
              <Ionicons name="arrow-back" size={27} color={COLORS.text} />
            </Pressable>
            <Text style={styles.title}>{isEditing ? '角色卡' : '新建角色'}</Text>
            <Pressable style={styles.saveButton} onPress={saveAndClose}>
              <Text style={styles.saveText}>保存</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={styles.hero}>
              <Pressable style={styles.avatarButton} onPress={pickAvatar}>
                {draft.avatarUri ? <Image source={{ uri: draft.avatarUri }} style={styles.avatarImage} /> : (
                  <View style={styles.avatarFallback}><Ionicons name="person" size={36} color="#8A97A8" /></View>
                )}
                <View style={styles.cameraBadge}><Ionicons name="camera" size={16} color="#fff" /></View>
              </Pressable>
              <Text style={styles.heroName}>{draft.name.trim() || '未命名角色'}</Text>
              <Text style={styles.heroHint}>点击头像更换角色头像</Text>
            </View>

            <Text style={styles.sectionTitle}>基本信息</Text>
            <View style={styles.card}>
              <Field label="角色名" value={draft.name} placeholder="例如：Claude" onChangeText={value => update('name', value)} />
              <View style={styles.divider} />
              <Field label="怎么称呼你" value={draft.userAddress} placeholder="例如：小夏、宝贝" onChangeText={value => update('userAddress', value)} />
              <View style={styles.divider} />
            </View>

            <Text style={styles.sectionTitle}>角色设定</Text>
            <View style={styles.textCard}>
              <View style={styles.textCardHeader}>
                <Text style={styles.label}>人设与背景</Text>
                <Pressable style={styles.importButton} onPress={() => importTextFile('persona', 3000, '人设与背景')}>
                  <Ionicons name="document-text-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.importButtonText}>读取文件</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.textArea}
                value={draft.persona}
                onChangeText={value => update('persona', value)}
                placeholder="描述角色的身份、性格、经历和与你的关系……"
                placeholderTextColor={COLORS.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={3000}
              />
              <Text style={styles.counter}>{draft.persona.length}/3000</Text>
            </View>
            <View style={styles.textCard}>
              <View style={styles.textCardHeader}>
                <Text style={styles.label}>说话风格</Text>
                <Pressable style={styles.importButton} onPress={() => importTextFile('speakingStyle', 1000, '说话风格')}>
                  <Ionicons name="document-text-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.importButtonText}>读取文件</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.textAreaSmall}
                value={draft.speakingStyle}
                onChangeText={value => update('speakingStyle', value)}
                placeholder="例如：温柔、毒舌、活泼，偶尔使用表情……"
                placeholderTextColor={COLORS.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={1000}
              />
            </View>
            <Text style={styles.sectionTitle}>长期记忆</Text>
            <View style={styles.textCard}>
              <View style={styles.memoryHeader}>
                <View style={styles.memoryTitleWrap}>
                  <Text style={styles.memoryTitle}>Ombre Brain</Text>
                  <Text style={styles.memoryHint}>只保存和读取当前角色的长期记忆</Text>
                </View>
                <Switch
                  value={draft.memoryEnabled !== false}
                  onValueChange={value => update('memoryEnabled', value)}
                  trackColor={{ false: '#D5D9E0', true: COLORS.text }}
                  thumbColor="#FFFFFF"
                />
              </View>
              {draft.memoryEnabled !== false ? (
                <View style={styles.memoryOptions}>
                  <Text style={styles.memoryOptionLabel}>记忆实例</Text>
                  {memoryServersLoading ? <Text style={styles.memoryHint}>正在读取网关中的 Ombre 实例…</Text> : null}
                  <Pressable
                    style={[styles.memoryOption, !draft.memoryServerId && styles.memoryOptionSelected]}
                    onPress={() => update('memoryServerId', '')}
                  >
                    <View style={styles.memoryRadio}>{!draft.memoryServerId ? <View style={styles.memoryRadioDot} /> : null}</View>
                    <View style={styles.memoryOptionText}><Text style={styles.memoryOptionName}>自动使用默认实例</Text><Text style={styles.memoryHint}>兼容已有角色和旧配置</Text></View>
                  </Pressable>
                  {memoryServers.map(server => (
                    <Pressable
                      key={server.id}
                      style={[styles.memoryOption, draft.memoryServerId === server.id && styles.memoryOptionSelected]}
                      onPress={() => update('memoryServerId', server.id)}
                    >
                      <View style={styles.memoryRadio}>{draft.memoryServerId === server.id ? <View style={styles.memoryRadioDot} /> : null}</View>
                      <View style={styles.memoryOptionText}><Text style={styles.memoryOptionName}>{server.name}</Text><Text style={styles.memoryHint}>{server.connected ? '已连接' : '等待连接'}</Text></View>
                    </Pressable>
                  ))}
                  {!memoryServersLoading && memoryServers.length === 0 ? <Text style={styles.memoryHint}>暂未发现可用实例；保存后仍可稍后再绑定。</Text> : null}
                </View>
              ) : <Text style={styles.memoryHint}>已关闭：此角色不会读取或写入 Ombre Brain。</Text>}
            </View>

            <View style={styles.textCard}>
              <Text style={styles.label}>新对话欢迎语（可选）</Text>
              <TextInput
                style={styles.textAreaSmall}
                value={draft.welcomeMessage}
                onChangeText={value => update('welcomeMessage', value)}
                placeholder="留空则使用默认欢迎语"
                placeholderTextColor={COLORS.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
            </View>

            {isEditing ? (
              <View style={styles.actionRow}>
                <Pressable style={styles.startButton} onPress={() => onStartConversation?.(draft)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={19} color="#fff" />
                  <Text style={styles.startButtonText}>用这个角色开始新对话</Text>
                </Pressable>
                <Pressable style={styles.deleteButton} onPress={() => onDelete?.(draft)}>
                  <Ionicons name="trash-outline" size={19} color="#B35C5C" />
                  <Text style={styles.deleteText}>删除角色</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

function Field({ label, value, placeholder, onChangeText }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={COLORS.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 25, fontWeight: '600', color: COLORS.text, marginLeft: 9 },
  saveButton: { paddingHorizontal: 10, paddingVertical: 8 },
  saveText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 100 },
  hero: { alignItems: 'center', paddingVertical: 12 },
  avatarButton: { width: 96, height: 96, borderRadius: 48, marginBottom: 12 },
  avatarImage: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { flex: 1, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7ECF4' },
  cameraBadge: { position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.text },
  heroName: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  heroHint: { marginTop: 4, fontSize: 12, color: COLORS.textMuted },
  sectionTitle: { fontSize: 16, color: COLORS.textMuted, marginLeft: 8, marginBottom: 10, marginTop: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 18, paddingBottom: 12 },
  field: { minHeight: 66, justifyContent: 'center', paddingTop: 5 },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 5 },
  input: { padding: 0, fontSize: 16, lineHeight: 19, includeFontPadding: false, color: COLORS.text, fontFamily: 'NotoSansSC' },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 0 },
  textCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 12 },
  textCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  importButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: COLORS.bg },
  importButtonText: { fontSize: 12, color: COLORS.textMuted, fontFamily: 'NotoSansSC' },
  textArea: { minHeight: 150, color: COLORS.text, fontSize: 15, lineHeight: 23, padding: 0 },
  textAreaSmall: { minHeight: 72, color: COLORS.text, fontSize: 15, lineHeight: 23, padding: 0 },
  counter: { alignSelf: 'flex-end', color: COLORS.textMuted, fontSize: 11, marginTop: 6 },
  memoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memoryTitleWrap: { flex: 1, paddingRight: 12 },
  memoryTitle: { fontSize: 15, color: COLORS.text, fontFamily: 'NotoSansSC' },
  memoryHint: { fontSize: 12, lineHeight: 18, color: COLORS.textMuted, fontFamily: 'NotoSansSC' },
  memoryOptions: { marginTop: 12, gap: 8 },
  memoryOptionLabel: { fontSize: 12, color: COLORS.textMuted, fontFamily: 'NotoSansSC' },
  memoryOption: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, backgroundColor: COLORS.bg },
  memoryOptionSelected: { backgroundColor: '#EEF1F5' },
  memoryRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: COLORS.textMuted, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  memoryRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.text },
  memoryOptionText: { flex: 1 },
  memoryOptionName: { fontSize: 14, color: COLORS.text, fontFamily: 'NotoSansSC' },
  actionRow: { gap: 12, marginTop: 8 },
  startButton: { height: 48, borderRadius: 24, backgroundColor: COLORS.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  startButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deleteButton: { height: 44, borderRadius: 22, backgroundColor: '#FFF8F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  deleteText: { color: '#B35C5C', fontSize: 14 },
});

