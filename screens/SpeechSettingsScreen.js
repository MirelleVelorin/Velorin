import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { SettingsText as Text, SettingsTextInput as TextInput } from '../components/SettingsTypography';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../colors';
import { SwipeBackView } from '../components/SwipeBackView';
import { SPEECH_TYPES, createSpeechProvider, normalizeSpeechSettings } from '../speechProviders';

export function SpeechSettingsScreen({ speech, onSave, onClose }) {
  const initial = normalizeSpeechSettings(speech);
  const [draft, setDraft] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.activeProviderId);
  const selected = draft.providers.find(item => item.id === selectedId) || draft.providers[0];

  const updateSelected = (patch) => {
    setDraft(previous => ({
      ...previous,
      providers: previous.providers.map(item => item.id === selectedId ? { ...item, ...patch } : item),
    }));
  };

  const addProvider = () => {
    const provider = createSpeechProvider('custom');
    setDraft(previous => ({ ...previous, providers: [...previous.providers, provider], activeProviderId: provider.id }));
    setSelectedId(provider.id);
  };

  const removeProvider = () => {
    if (draft.providers.length <= 1) {
      Alert.alert('无法删除', '至少保留一个语音服务');
      return;
    }
    Alert.alert('删除语音服务', `确定删除「${selected.name}」吗？`, [
      { text: '取消' },
      { text: '删除', style: 'destructive', onPress: () => {
        const next = draft.providers.filter(item => item.id !== selectedId);
        setDraft(previous => ({ ...previous, providers: next, activeProviderId: next[0].id }));
        setSelectedId(next[0].id);
      } },
    ]);
  };

  const saveAndClose = () => {
    onSave({ ...draft, activeProviderId: selectedId });
    onClose();
  };

  return (
    <SwipeBackView onSwipeBack={saveAndClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <Pressable style={styles.headerButton} onPress={saveAndClose}><Ionicons name="arrow-back" size={28} color={COLORS.text} /></Pressable>
            <Text style={styles.title}>语音朗读</Text>
            <View style={styles.headerButton} />
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>语音服务</Text>
            <View style={styles.card}>
              {draft.providers.map((provider, index) => (
                <View key={provider.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <Pressable style={styles.providerRow} onPress={() => setSelectedId(provider.id)}>
                    <Ionicons name="volume-high-outline" size={25} color={COLORS.text} />
                    <View style={styles.providerInfo}>
                      <Text style={styles.rowTitle}>{provider.name || '未命名服务'}</Text>
                      <Text style={styles.rowSubtitle}>{provider.type === 'custom' ? '自定义接口' : provider.type === 'minimax' ? 'MiniMax' : 'ElevenLabs'}{provider.id === selectedId ? ' · 当前使用' : ''}</Text>
                    </View>
                    <Ionicons name={provider.id === selectedId ? 'checkmark-circle' : 'chevron-forward'} size={23} color={provider.id === selectedId ? COLORS.text : COLORS.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
            <Pressable style={styles.addButton} onPress={addProvider}>
              <Ionicons name="add" size={20} color={COLORS.text} /><Text style={styles.addButtonText}>添加语音服务</Text>
            </Pressable>

            {selected ? <View style={styles.formCard}>
              <View style={styles.formTitleRow}>
                <Text style={styles.formTitle}>服务配置</Text>
                <Pressable onPress={removeProvider}><Text style={styles.deleteText}>删除</Text></Pressable>
              </View>
              <Text style={styles.label}>显示名称</Text>
              <TextInput style={styles.input} value={selected.name} onChangeText={name => updateSelected({ name })} placeholder="例如：我的 MiniMax" placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.label}>接口类型</Text>
              <View style={styles.typeList}>
                {Object.entries(SPEECH_TYPES).map(([type, item]) => (
                  <Pressable key={type} onPress={() => updateSelected({ type, endpoint: item.endpoint, model: item.model, name: selected.name === SPEECH_TYPES[selected.type]?.label ? item.label : selected.name })} style={[styles.typeButton, selected.type === type && styles.typeButtonActive]}>
                    <Text style={[styles.typeText, selected.type === type && styles.typeTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>API URL</Text>
              <TextInput style={styles.input} value={selected.endpoint} onChangeText={endpoint => updateSelected({ endpoint })} placeholder="填写语音接口 URL" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />
              <Text style={styles.label}>API Key</Text>
              <TextInput style={styles.input} value={selected.apiKey} onChangeText={apiKey => updateSelected({ apiKey })} placeholder="填写 API Key" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} secureTextEntry />
              <Text style={styles.label}>模型名</Text>
              <TextInput style={styles.input} value={selected.model} onChangeText={model => updateSelected({ model })} placeholder="例如：speech-02-hd" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />
              <Text style={styles.label}>Voice ID</Text>
              <TextInput style={styles.input} value={selected.voiceId} onChangeText={voiceId => updateSelected({ voiceId })} placeholder="填写音色 ID" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />
              <Text style={styles.help}>语音播放时会使用上面选中的服务。语音文件会缓存在本机，重复播放不会再次请求接口。</Text>
            </View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 25, fontWeight: '600', color: COLORS.text, marginLeft: 9 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 260 },
  sectionTitle: { fontSize: 16, color: COLORS.textMuted, marginLeft: 8, marginBottom: 10, marginTop: 10 },
  card: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 18, marginBottom: 14 },
  providerRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center' },
  providerInfo: { flex: 1, marginLeft: 18 },
  rowTitle: { fontSize: 18, color: COLORS.text },
  rowSubtitle: { marginTop: 4, fontSize: 12, color: COLORS.textMuted },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 44 },
  addButton: { minHeight: 52, borderRadius: 16, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  addButtonText: { marginLeft: 7, fontSize: 15, color: COLORS.text },
  formCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18 },
  formTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  formTitle: { fontSize: 18, color: COLORS.text },
  deleteText: { fontSize: 14, color: '#B35C5C' },
  label: { marginTop: 14, marginBottom: 7, fontSize: 14, color: COLORS.text },
  input: { minHeight: 46, borderRadius: 12, backgroundColor: COLORS.surface, paddingHorizontal: 13, fontSize: 14, color: COLORS.text },
  typeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeButton: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: COLORS.surface },
  typeButtonActive: { backgroundColor: COLORS.text },
  typeText: { fontSize: 13, color: COLORS.textMuted },
  typeTextActive: { color: '#fff' },
  help: { marginTop: 14, fontSize: 12, lineHeight: 17, color: COLORS.textMuted },
});

