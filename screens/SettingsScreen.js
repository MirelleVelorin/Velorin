import { useState } from 'react';
import { View, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SettingsText as Text, SettingsTextInput as TextInput } from '../components/SettingsTypography';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../colors';
import { SwipeBackView } from '../components/SwipeBackView';

export function SettingsScreen({ config, onSave, onClose, onOpenModelConfig, onOpenMcp, onOpenStickers, onOpenRawRecords, onOpenFinance, onOpenDiet, onOpenSpeech, onOpenApiStability, onOpenContext }) {
  const [draft, setDraft] = useState(config);
  const saveAndClose = () => { onSave(draft); onClose(); };
  return (
    <SwipeBackView onSwipeBack={saveAndClose}>
      <SafeAreaView style={local.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={local.header}>
            <Pressable style={local.headerButton} onPress={saveAndClose}><Ionicons name="arrow-back" size={28} color={COLORS.text} /></Pressable>
            <Text style={local.title}>设置</Text><View style={local.headerButton} />
          </View>
          <ScrollView contentContainerStyle={local.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={local.sectionTitle}>模型与服务</Text>
            <View style={local.card}>
              <SettingRow icon="cube-outline" title="模型与参数配置" onPress={onOpenModelConfig} />
              <View style={local.divider} />
              <SettingRow icon="terminal-outline" title="MCP" onPress={onOpenMcp} />
              <View style={local.divider} />
              <SettingRow icon="happy-outline" title="表情包管理" onPress={onOpenStickers} />
              <View style={local.divider} />
              <SettingRow icon="document-text-outline" title="原始聊天记录" onPress={onOpenRawRecords} />
              <View style={local.divider} />
              <SettingRow icon="wallet-outline" title="理财与消费提醒" onPress={onOpenFinance} />
              <View style={local.divider} />
              <SettingRow icon="restaurant-outline" title="饮食记录" onPress={onOpenDiet} />
            </View>
            <Text style={local.sectionTitle}>通用设置</Text>
            <View style={local.card}>
              <SettingRow icon="volume-high-outline" title="语音朗读" onPress={onOpenSpeech} />
              <View style={local.divider} />
              <SettingRow icon="pulse-outline" title="接口稳定性" onPress={onOpenApiStability} />
              <View style={local.divider} />
              <SettingRow icon="layers-outline" title="上下文与记忆" onPress={onOpenContext} />
            </View>
            <Text style={local.sectionTitle}>AI 设置</Text>
            <View style={local.promptCard}>
              <View style={local.promptTitleRow}><Ionicons name="chatbox-ellipses-outline" size={24} color={COLORS.text} /><Text style={local.rowTitle}>系统提示词</Text></View>
              <TextInput style={local.promptInput} value={draft.systemPrompt} onChangeText={value => setDraft(previous => ({ ...previous, systemPrompt: value }))} placeholder="你是一个 helpful 的 AI。" placeholderTextColor={COLORS.textMuted} multiline textAlignVertical="top" />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

function SettingRow({ icon, title, onPress }) {
  return <Pressable style={local.row} onPress={onPress}><Ionicons name={icon} size={26} color={COLORS.text} /><Text style={local.rowTitle}>{title}</Text><Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} /></Pressable>;
}

const local = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 25, fontWeight: '600', color: COLORS.text, marginLeft: 9 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 260 },
  sectionTitle: { fontSize: 16, color: COLORS.textMuted, marginLeft: 8, marginBottom: 10, marginTop: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 18, marginBottom: 22 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { flex: 1, marginLeft: 18, fontSize: 18, color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 44 },
  promptCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18 },
  promptTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  promptInput: { minHeight: 120, borderRadius: 14, backgroundColor: COLORS.surface, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 22, color: COLORS.text },
});

