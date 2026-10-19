import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { COLORS } from '../colors';
import { SwipeBackView } from '../components/SwipeBackView';

const EMPTY_PROFILE = {
  name: '用户',
  preferredName: '',
  occupation: '',
  about: '',
  avatarUri: '',
};

export function ProfileScreen({ profile, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...EMPTY_PROFILE, ...profile });

  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const saveAndClose = () => {
    const next = { ...draft, name: draft.name.trim() || '用户' };
    onSave(next);
    onClose();
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
    const avatarUri = asset.base64
      ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
      : asset.uri;
    update('avatarUri', avatarUri);
  };

  return (
    <SwipeBackView onSwipeBack={saveAndClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <Pressable style={styles.headerButton} onPress={saveAndClose}>
              <Ionicons name="arrow-back" size={27} color={COLORS.text} />
            </Pressable>
            <Text style={styles.title}>用户信息</Text>
            <Pressable style={styles.saveButton} onPress={saveAndClose}>
              <Text style={styles.saveText}>保存</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.hero}>
              <Pressable style={styles.avatarButton} onPress={pickAvatar}>
                {draft.avatarUri ? (
                  <Image source={{ uri: draft.avatarUri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarLetter}>
                      {(draft.name.trim() || '用').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={16} color="#fff" />
                </View>
              </Pressable>
              <Text style={styles.heroName}>{draft.name.trim() || '用户'}</Text>
              <Text style={styles.heroHint}>点击头像即可更换</Text>
            </View>

            <Text style={styles.sectionTitle}>基本信息</Text>
            <View style={styles.card}>
              <ProfileField
                label="用户名"
                value={draft.name}
                placeholder="输入你的名字"
                onChangeText={value => update('name', value)}
              />
              <View style={styles.divider} />
              <ProfileField
                label="希望怎么称呼你"
                value={draft.preferredName}
                placeholder="例如：小夏"
                onChangeText={value => update('preferredName', value)}
              />
              <View style={styles.divider} />
              <ProfileField
                label="职业"
                value={draft.occupation}
                placeholder="填写职业或身份"
                onChangeText={value => update('occupation', value)}
              />
            </View>

            <Text style={styles.sectionTitle}>关于你</Text>
            <View style={styles.aboutCard}>
              <TextInput
                style={styles.aboutInput}
                value={draft.about}
                onChangeText={value => update('about', value)}
                placeholder="写一点希望 AI 了解的内容……"
                placeholderTextColor={COLORS.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.counter}>{draft.about.length}/500</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

function ProfileField({ label, value, placeholder, onChangeText }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        maxLength={80}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    marginLeft: 14,
    fontSize: 25,
    fontWeight: '600',
    color: COLORS.text,
  },
  saveButton: {
    minWidth: 58,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  content: { paddingHorizontal: 22, paddingBottom: 160 },
  hero: { alignItems: 'center', paddingTop: 18, paddingBottom: 28 },
  avatarButton: { width: 106, height: 106, marginBottom: 14 },
  avatarFallback: {
    width: 106,
    height: 106,
    borderRadius: 53,
    backgroundColor: '#DDE5F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 106, height: 106, borderRadius: 53 },
  avatarLetter: { fontSize: 40, fontWeight: '600', color: '#6E7F96' },
  cameraBadge: {
    position: 'absolute',
    right: 1,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.text,
    borderWidth: 3,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { fontSize: 22, fontWeight: '600', color: COLORS.text },
  heroHint: { fontSize: 13, color: COLORS.textMuted, marginTop: 5 },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 15,
    marginLeft: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 18,
    marginBottom: 22,
  },
  field: { minHeight: 78, justifyContent: 'center', paddingVertical: 11 },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 5 },
  input: { color: COLORS.text, fontSize: 17, padding: 0, minHeight: 26 },
  divider: { height: 1, backgroundColor: COLORS.border },
  aboutCard: {
    minHeight: 150,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 12,
  },
  aboutInput: {
    minHeight: 98,
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 23,
    padding: 0,
  },
  counter: { alignSelf: 'flex-end', color: COLORS.textMuted, fontSize: 12, marginTop: 6 },
});

