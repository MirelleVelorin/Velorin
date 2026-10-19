import { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View,
} from 'react-native';
import { SettingsText as Text, SettingsTextInput as TextInput } from '../components/SettingsTypography';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '../colors';
import { DEFAULT_API_PATH, getModelsEndpoint, normalizeApiProfile } from '../apiEndpoints';
import { styles, setting } from '../styles';
import { SwipeBackView } from '../components/SwipeBackView';

const normalizeModels = (data) => {
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return [...new Set(list.map(item => typeof item === 'string' ? item : item?.id || item?.name).filter(Boolean))].sort();
};

const normalizeModelEntry = (entry) => {
  if (typeof entry === 'string') return { id: entry, displayName: entry, model: entry };
  const model = entry?.model || entry?.id || entry?.name || '';
  return {
    id: entry?.id || model,
    displayName: entry?.displayName ?? entry?.label ?? model,
    model,
  };
};

const normalizeProfile = (profile) => {
  const legacy = Array.isArray(profile?.models) ? profile.models : (profile?.model ? [profile.model] : []);
  const models = legacy.map(normalizeModelEntry).filter(item => item.model);
  const activeModel = profile?.model || models[0]?.model || '';
  if (activeModel && !models.some(item => item.model === activeModel)) {
    models.unshift(normalizeModelEntry(activeModel));
  }
  return normalizeApiProfile({ ...profile, models, model: activeModel });
};

export function ModelConfigScreen({ profiles, onSave, onClose }) {
  const [list, setList] = useState(profiles.map(normalizeProfile));
  const [selectedId, setSelectedId] = useState(profiles[0]?.id || null);
  const [remoteModels, setRemoteModels] = useState([]);
  const [selectedRemoteModels, setSelectedRemoteModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const selected = list.find(p => p.id === selectedId);

  const updateSelected = (patch) => {
    setList(prev => prev.map(p => p.id === selectedId ? { ...p, ...patch } : p));
  };

  const addProfile = () => {
    const newProfile = {
      id: Date.now().toString(),
      name: '新配置',
      endpoint: '',
      baseUrl: '',
      apiPath: DEFAULT_API_PATH,
      apiKey: '',
      model: '',
      models: [],
      supportsVision: false,
    };
    setList(prev => [...prev, newProfile]);
    setSelectedId(newProfile.id);
  };

  const deleteProfile = () => {
    if (list.length <= 1) {
      Alert.alert('无法删除', '至少保留一个配置');
      return;
    }
    Alert.alert('删除配置', `确定删除「${selected.name}」吗？`, [
      { text: '取消' },
      { text: '删除', style: 'destructive', onPress: () => {
        const next = list.filter(p => p.id !== selectedId);
        setList(next);
        setSelectedId(next[0].id);
        setRemoteModels([]);
      } },
    ]);
  };

  const fetchModels = async () => {
    if (!selected?.baseUrl?.trim()) {
      Alert.alert('缺少 URL', '请先填写 API Base URL');
      return;
    }
    setLoadingModels(true);
    try {
      const response = await fetch(getModelsEndpoint(selected), {
        headers: {
          Accept: 'application/json',
          ...(selected.apiKey?.trim() ? { Authorization: `Bearer ${selected.apiKey.trim()}` } : {}),
        },
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
      }
      const models = normalizeModels(data);
      if (!models.length) throw new Error('接口没有返回模型列表');
      setRemoteModels(models);
      setSelectedRemoteModels([]);
    } catch (error) {
      Alert.alert('拉取失败', `${error.message}\n\n有些中转站不支持 /models，可以手动添加模型。`);
    } finally {
      setLoadingModels(false);
    }
  };

  const toggleRemoteModel = (model) => {
    setSelectedRemoteModels(prev => prev.includes(model) ? prev.filter(item => item !== model) : [...prev, model]);
  };

  const addSelectedModels = () => {
    if (!selectedRemoteModels.length || !selected) return;
    const currentModels = (selected.models || []).map(normalizeModelEntry);
    const additions = selectedRemoteModels.map(model => normalizeModelEntry(model));
    const models = [...currentModels];
    additions.forEach(entry => {
      if (!models.some(item => item.model === entry.model)) models.push(entry);
    });
    updateSelected({ models, model: selected.model || models[0]?.model || '' });
    setSelectedRemoteModels([]);
    setRemoteModels([]);
  };

  const updateModelEntry = (modelId, patch) => {
    setList(prev => prev.map(profile => {
      if (profile.id !== selectedId) return profile;
      const models = (profile.models || []).map(entry => {
        const normalized = normalizeModelEntry(entry);
        return normalized.id === modelId ? { ...normalized, ...patch } : normalized;
      });
      return { ...profile, models };
    }));
  };

  const removeModel = (modelId) => {
    if (!selected) return;
    const current = (selected.models || []).map(normalizeModelEntry);
    const removed = current.find(item => item.id === modelId);
    const models = current.filter(item => item.id !== modelId);
    updateSelected({ models, model: selected.model === removed?.model ? (models[0]?.model || '') : selected.model });
  };

  const availableModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return q ? remoteModels.filter(model => model.toLowerCase().includes(q)) : remoteModels;
  }, [modelSearch, remoteModels]);

  return (
    <SwipeBackView onSwipeBack={onClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <Pressable onPress={onClose}><Text style={{ color: COLORS.textMuted, fontSize: 15 }}>取消</Text></Pressable>
            <Text style={styles.headerTitle}>模型与参数配置</Text>
            <Pressable onPress={() => { onSave(list.map(normalizeApiProfile), selectedId); onClose(); }}>
              <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>保存</Text>
            </Pressable>
          </View>
          <ScrollView
            style={{ padding: 20 }}
            contentContainerStyle={{ paddingBottom: 180 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={setting.label}>中转站配置</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {list.map(p => (
                <Pressable key={p.id} onPress={() => { setSelectedId(p.id); setRemoteModels([]); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: p.id === selectedId ? COLORS.text : COLORS.surface }}>
                  <Text style={{ color: p.id === selectedId ? '#fff' : COLORS.text, fontSize: 14 }}>{p.name}</Text>
                </Pressable>
              ))}
              <Pressable onPress={addProfile} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border }}>
                <Text style={{ color: COLORS.text, fontSize: 14 }}>+ 新建</Text>
              </Pressable>
            </View>

            {selected && <>
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                <Pressable onPress={deleteProfile}><Text style={{ color: '#D33', fontSize: 14 }}>删除配置</Text></Pressable>
              </View>
              <Text style={setting.label}>中转站名称</Text>
              <TextInput style={setting.input} value={selected.name} onChangeText={v => updateSelected({ name: v })} />
              <Text style={setting.label}>API Base URL</Text>
              <TextInput style={setting.input} value={selected.baseUrl} onChangeText={v => updateSelected({ baseUrl: v })} placeholder="https://api.xxx.cn/v1" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              <Text style={setting.label}>API 路径</Text>
              <TextInput style={setting.input} value={selected.apiPath} onChangeText={v => updateSelected({ apiPath: v })} placeholder={DEFAULT_API_PATH} placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 6 }}>路径默认 /chat/completions，一般无需修改；更改路径不会切换接口协议。</Text>
              <Text style={setting.label}>API Key</Text>
              <TextInput style={setting.input} value={selected.apiKey} onChangeText={v => updateSelected({ apiKey: v })} placeholder="留空则使用默认Key" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" secureTextEntry />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 15, color: COLORS.text }}>从中转站拉取模型</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>自动访问 /models，拉取后选择要添加的模型</Text>
                </View>
                <Pressable onPress={fetchModels} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: COLORS.text }}>
                  {loadingModels ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 13 }}>拉取模型</Text>}
                </Pressable>
              </View>

              {remoteModels.length > 0 && <View style={{ marginTop: 14, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12 }}>
                <TextInput style={[setting.input, { backgroundColor: '#fff', marginBottom: 10 }]} value={modelSearch} onChangeText={setModelSearch} placeholder="搜索模型" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" />
                {availableModels.slice(0, 80).map(model => {
                  const checked = selectedRemoteModels.includes(model);
                  return <Pressable key={model} onPress={() => toggleRemoteModel(model)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
                    <Text style={{ fontSize: 20, width: 28, color: checked ? COLORS.text : COLORS.textMuted }}>{checked ? '✓' : '○'}</Text>
                    <Text style={{ flex: 1, color: COLORS.text, fontSize: 14 }}>{model}</Text>
                  </Pressable>;
                })}
                <Pressable onPress={addSelectedModels} style={{ marginTop: 8, backgroundColor: COLORS.text, borderRadius: 12, alignItems: 'center', paddingVertical: 11 }}>
                  <Text style={{ color: '#fff', fontSize: 14 }}>添加选中的模型（{selectedRemoteModels.length}）</Text>
                </Pressable>
              </View>}

              <Text style={setting.label}>已添加模型</Text>
              <View style={{ backgroundColor: COLORS.surface, borderRadius: 14, padding: 12 }}>
                {(selected.models || (selected.model ? [selected.model] : [])).map(entry => {
                  const model = normalizeModelEntry(entry);
                  return (
                    <View key={model.id} style={{ paddingVertical: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput
                          style={[setting.input, { flex: 1, backgroundColor: '#fff' }]}
                          value={model.displayName}
                          onChangeText={value => updateModelEntry(model.id, { displayName: value })}
                          placeholder="胶囊显示名称"
                          placeholderTextColor={COLORS.textMuted}
                        />
                        <Pressable onPress={() => removeModel(model.id)}><Text style={{ color: '#B35C5C', fontSize: 13 }}>移除</Text></Pressable>
                      </View>
                      <TextInput
                        style={[setting.input, { marginTop: 6, backgroundColor: '#fff', color: COLORS.textMuted }]}
                        value={model.model}
                        onChangeText={value => updateModelEntry(model.id, { model: value })}
                        placeholder="实际请求模型名"
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="none"
                      />
                    </View>
                  );
                })}
                {!(selected.models?.length || selected.model) && <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>还没有添加模型</Text>}
              </View>

              <Text style={setting.label}>当前默认实际模型</Text>
              <TextInput style={setting.input} value={selected.model} onChangeText={v => updateSelected({ model: v })} placeholder="也可以手动输入实际模型名" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                <Text style={{ fontSize: 15, color: COLORS.text }}>支持识图</Text>
                <Pressable onPress={() => updateSelected({ supportsVision: !selected.supportsVision })} style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: selected.supportsVision ? COLORS.text : COLORS.border, padding: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', marginLeft: selected.supportsVision ? 18 : 0 }} />
                </Pressable>
              </View>
            </>}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

