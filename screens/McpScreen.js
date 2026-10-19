import { useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking, Animated, Easing } from 'react-native';
import { SettingsText as Text, SettingsTextInput as TextInput } from '../components/SettingsTypography';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../colors';
import { styles, setting } from '../styles';
import { SwipeBackView } from '../components/SwipeBackView';

const DEFAULT_GATEWAY = {
  url: 'http://127.0.0.1:8787',
  token: '',
};

function normalizeGateway(gateway) {
  return { ...DEFAULT_GATEWAY, ...(gateway || {}) };
}

function cleanUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function McpToggle({ value, disabled, onChange }) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      disabled={disabled}
      hitSlop={8}
      style={{ width: 54, height: 32 }}
    >
      <Animated.View style={{
        width: 54,
        height: 32,
        borderRadius: 16,
        padding: 3,
        backgroundColor: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['#D8D5CF', '#1A1A1A'],
        }),
      }}>
        <Animated.View style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: '#fff',
          transform: [{
            translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }),
          }],
        }} />
      </Animated.View>
    </Pressable>
  );
}

export function McpScreen({ gateway, onSave, onClose }) {
  const [draft, setDraft] = useState(normalizeGateway(gateway));
  const [name, setName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [headers, setHeaders] = useState('{}');
  const [servers, setServers] = useState([]);
  const [status, setStatus] = useState({ type: 'idle', text: '请先连接网关' });
  const [loading, setLoading] = useState(false);
  const [oauthServer, setOauthServer] = useState(null);
  const [togglingServerId, setTogglingServerId] = useState(null);

  const gatewayHeaders = () => draft.token.trim()
    ? { Authorization: `Bearer ${draft.token.trim()}` }
    : {};

  const request = async (path, options = {}) => {
    const baseUrl = cleanUrl(draft.url);
    if (!baseUrl) throw new Error('请填写网关地址');
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...gatewayHeaders(), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `\u7f51\u5173\u54cd\u5e94 ${response.status}`);
      error.details = data;
      throw error;
    }
    return data;
  };

  const connectGateway = async () => {
    setLoading(true);
    setStatus({ type: 'idle', text: '连接网关中...' });
    try {
      const data = await request('/api/servers');
      const nextGateway = { ...draft, url: cleanUrl(draft.url) };
      setDraft(nextGateway);
      setServers(data.servers || []);
      setOauthServer((data.servers || []).find(item => item.authRequired && item.authUrl) || null);
      onSave(nextGateway);
      setStatus({ type: 'success', text: `网关已连接，已有 ${(data.servers || []).length} 个 MCP` });
    } catch (error) {
      setStatus({ type: 'error', text: `网关连接失败：${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const refreshServers = async () => {
    const data = await request('/api/servers');
    setServers(data.servers || []);
    const pending = (data.servers || []).find(item => item.authRequired && item.authUrl);
    setOauthServer(pending || null);
    return data;
  };

  const addRemoteMcp = async () => {
    if (!name.trim() || !mcpUrl.trim()) {
      setStatus({ type: 'error', text: '请填写 MCP 名称和 URL' });
      return;
    }
    try {
      const parsedHeaders = JSON.parse(headers || '{}');
      if (!parsedHeaders || Array.isArray(parsedHeaders)) throw new Error();
    } catch {
      setStatus({ type: 'error', text: '自定义请求头必须是 JSON 对象' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'idle', text: '正在连接 MCP...' });
    try {
      const data = await request('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: mcpUrl.trim(),
          bearerToken: bearerToken.trim(),
          headers: JSON.parse(headers || '{}'),
          callbackUrl: `${cleanUrl(draft.url)}/oauth/callback`,
        }),
      });
      setServers(prev => [...prev, data.server]);
      if (data.server.authRequired && data.server.authUrl) {
        setOauthServer(data.server);
        await Linking.openURL(data.server.authUrl);
        setStatus({ type: 'idle', text: '\u5df2\u6253\u5f00\u767b\u5f55\u9875\uff0c\u767b\u5f55\u540e\u70b9\u51fb\u201c\u5237\u65b0\u6388\u6743\u72b6\u6001\u201d' });
      } else {
        setStatus({ type: 'success', text: 'MCP \u5df2\u8fde\u63a5\u5e76\u4fdd\u5b58' });
      }
      setName('');
      setMcpUrl('');
      setBearerToken('');
      setHeaders('{}');
    } catch (error) {
      if (error.details?.authUrl) {
        setOauthServer({ authUrl: error.details.authUrl, authType: error.details.authType });
        setStatus({ type: 'idle', text: '\u8bf7\u5148\u767b\u5f55\u83b7\u53d6 Token\uff0c\u518d\u7c98\u8d34\u5230 Bearer \u4ee4\u724c\u6846\u91cd\u8bd5' });
      } else {
        setStatus({ type: 'error', text: `MCP \u8fde\u63a5\u5931\u8d25\uff1a${error.message}` });
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMcp = async (server, enabled) => {
    const previousEnabled = server.enabled !== false;
    setTogglingServerId(server.id);
    setServers(prev => prev.map(item => item.id === server.id ? { ...item, enabled } : item));
    try {
      const data = await request(`/api/servers/${encodeURIComponent(server.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setServers(prev => prev.map(item => item.id === server.id
        ? { ...item, ...data.server, toolCount: data.server.toolCount || item.toolCount }
        : item));
    } catch (error) {
      setServers(prev => prev.map(item => item.id === server.id ? { ...item, enabled: previousEnabled } : item));
      setStatus({ type: 'error', text: `切换失败：${error.message}` });
    } finally {
      setTogglingServerId(null);
    }
  };

  const removeMcp = (server) => {
    Alert.alert('删除 MCP', `确定删除「${server.name}」吗？`, [
      { text: '取消' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try {
          await request(`/api/servers/${encodeURIComponent(server.id)}`, { method: 'DELETE' });
          setServers(prev => prev.filter(item => item.id !== server.id));
          if (oauthServer?.id === server.id) setOauthServer(null);
        } catch (error) {
          setStatus({ type: 'error', text: `删除失败：${error.message}` });
        }
      } },
    ]);
  };

  return (
    <SwipeBackView onSwipeBack={onClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
      <View style={styles.header}>
        <Pressable onPress={onClose}>
          <Text style={{ color: COLORS.textMuted, fontSize: 15 }}>返回</Text>
        </Pressable>
        <Text style={styles.headerTitle}>MCP</Text>
        <Pressable onPress={() => onSave({ ...draft, url: cleanUrl(draft.url) })}>
          <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>保存</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 180 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '600' }}>连接网关</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 6 }}>
          网关运行在电脑上；下面的 MCP URL 才是具体 MCP 服务地址。
        </Text>

        <Text style={setting.label}>网关地址</Text>
        <TextInput
          style={setting.input}
          value={draft.url}
          onChangeText={url => setDraft(prev => ({ ...prev, url }))}
          placeholder="http://电脑IP:8787"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          keyboardType="url"
        />

        <Text style={setting.label}>网关访问令牌（可选）</Text>
        <TextInput
          style={setting.input}
          value={draft.token}
          onChangeText={token => setDraft(prev => ({ ...prev, token }))}
          placeholder="MCP_GATEWAY_TOKEN"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          secureTextEntry
        />

        <Pressable
          onPress={connectGateway}
          disabled={loading}
          style={{ marginTop: 16, backgroundColor: COLORS.surface, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
        >
          {loading ? <ActivityIndicator color={COLORS.text} /> : <Text style={{ color: COLORS.text, fontSize: 15 }}>连接网关并刷新列表</Text>}
        </Pressable>

        <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 24 }} />
        <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '600' }}>添加远程 MCP</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 6 }}>
          当前支持 Streamable HTTP。stdio 类型请直接写入电脑上的网关配置文件。
        </Text>

        <Text style={setting.label}>名称</Text>
        <TextInput
          style={setting.input}
          value={name}
          onChangeText={setName}
          placeholder="例如：GitHub MCP"
          placeholderTextColor={COLORS.textMuted}
        />

        <Text style={setting.label}>MCP URL</Text>
        <TextInput
          style={setting.input}
          value={mcpUrl}
          onChangeText={setMcpUrl}
          placeholder="https://example.com/mcp"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          keyboardType="url"
        />

        <Text style={setting.label}>Bearer 令牌（可选）</Text>
        <TextInput
          style={setting.input}
          value={bearerToken}
          onChangeText={setBearerToken}
          placeholder="MCP_BEARER_TOKEN"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          secureTextEntry
        />

        <Text style={setting.label}>自定义请求头 JSON（可选）</Text>
        <TextInput
          style={[setting.input, { height: 80, textAlignVertical: 'top' }]}
          value={headers}
          onChangeText={setHeaders}
          placeholder={'{"X-Api-Key":"..."}'}
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          multiline
        />

        <Pressable
          onPress={addRemoteMcp}
          disabled={loading}
          style={{ marginTop: 16, backgroundColor: COLORS.text, borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>连接并添加 MCP</Text>}
        </Pressable>

        {oauthServer ? (
          <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.text, fontSize: 13 }}>
              {oauthServer.authType === 'bearer' ? '\u8fd9\u4e2a MCP \u9700\u8981\u767b\u5f55\u83b7\u53d6 Token' : '\u8fd9\u4e2a MCP \u9700\u8981 OAuth \u767b\u5f55'}
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }}>
              <Pressable onPress={() => Linking.openURL(oauthServer.authUrl)} style={{ flex: 1, backgroundColor: COLORS.text, borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>{'\u6253\u5f00\u767b\u5f55\u9875'}</Text>
              </Pressable>
              {oauthServer.authType !== 'bearer' ? (
                <Pressable onPress={async () => { try { await refreshServers(); setStatus({ type: 'success', text: '\u6388\u6743\u72b6\u6001\u5df2\u5237\u65b0' }); } catch (error) { setStatus({ type: 'error', text: `\u5237\u65b0\u5931\u8d25\uff1a${error.message}` }); } }} style={{ flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ color: COLORS.text, fontSize: 13 }}>{'\u5237\u65b0\u6388\u6743\u72b6\u6001'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <Text style={{
          marginTop: 12,
          color: status.type === 'error' ? '#C33' : status.type === 'success' ? '#287A45' : COLORS.textMuted,
          fontSize: 13,
        }}>
          {status.text}
        </Text>

        <Text style={setting.label}>已连接的 MCP</Text>
        {servers.length === 0 ? (
          <Text style={{ color: COLORS.textMuted, fontSize: 14, paddingVertical: 12 }}>暂无 MCP。</Text>
        ) : servers.map(server => {
          const enabled = server.enabled !== false;
          const statusText = !enabled ? '已关闭' : server.authRequired ? '待授权' : server.connected ? '已连接' : '已开启';
          const transportText = server.transport === 'streamable-http' ? 'HTTP' : String(server.transport || 'MCP').toUpperCase();
          return (
            <Pressable
              key={server.id}
              onLongPress={() => removeMcp(server)}
              delayLongPress={550}
              style={{
                minHeight: 104,
                backgroundColor: '#fff',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#EEEAE4',
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                backgroundColor: '#F3F5F4',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
              }}>
                <Ionicons name="terminal-outline" size={28} color={COLORS.text} />
                <View style={{
                  position: 'absolute',
                  right: 3,
                  bottom: 3,
                  width: 13,
                  height: 13,
                  borderRadius: 7,
                  backgroundColor: enabled ? '#20C56B' : '#B8B5AF',
                  borderWidth: 2,
                  borderColor: '#fff',
                }} />
              </View>

              <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 16, fontWeight: '600' }}>
                  {server.name || server.id}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                  <View style={{
                    borderRadius: 12,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    backgroundColor: enabled ? '#EAF8EF' : '#F0EFEC',
                    borderWidth: 1,
                    borderColor: enabled ? '#BDE8CC' : '#DDDAD4',
                  }}>
                    <Text style={{ color: enabled ? '#32965A' : COLORS.textMuted, fontSize: 12 }}>{statusText}</Text>
                  </View>
                  <View style={{ borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: '#F2F0ED', borderWidth: 1, borderColor: '#D8D4CE' }}>
                    <Text style={{ color: COLORS.text, fontSize: 12 }}>{transportText}</Text>
                  </View>
                  <View style={{ borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: '#F2F0ED', borderWidth: 1, borderColor: '#D8D4CE' }}>
                    <Text style={{ color: COLORS.text, fontSize: 12 }}>工具:{server.toolCount || 0}</Text>
                  </View>
                </View>
              </View>

              <McpToggle
                value={enabled}
                disabled={togglingServerId === server.id}
                onChange={nextValue => toggleMcp(server, nextValue)}
              />
            </Pressable>
          );
        })}
      </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

