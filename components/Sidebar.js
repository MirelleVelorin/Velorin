import { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Pressable, Modal, Alert, Animated, Dimensions, PanResponder, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../colors';
import { sidebar } from '../styles';

export function Sidebar({
  visible,
  drawerProgress,
  onProgressChange,
  onClose,
  onOpenSettings,
  onOpenProfile,
  profile,
  conversations,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onNewConversation,
  characters = [],
  onOpenCharacter,
  onNewCharacter,
  onNewCharacterConversation,
  onDeleteCharacter,
  currentCharacterId = null,
  settingsMode = false,
  settingsContent = null,
}) {
  const [actionItem, setActionItem] = useState(null);
  const [characterActionItem, setCharacterActionItem] = useState(null);
  const [renameItem, setRenameItem] = useState(null);
  const [renameText, setRenameText] = useState('');
  const panelWidth = Dimensions.get('window').width * 0.72;
  const springConfig = {
    toValue: 1,
    useNativeDriver: true,
    stiffness: 220,
    damping: 28,
    mass: 0.8,
    overshootClamping: true,
    restDisplacementThreshold: 0.5,
    restSpeedThreshold: 0.5,
  };

  const closePanResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, state) =>
      state.dx < -8 && Math.abs(state.dx) > Math.abs(state.dy),
    onPanResponderMove: (_, state) => {
      const progress = Math.max(0, Math.min(1, 1 + state.dx / panelWidth));
      onProgressChange?.(progress);
    },
    onPanResponderRelease: (_, state) => {
      if (state.dx < -80 || state.vx < -0.8) {
        onClose?.();
      } else {
        Animated.spring(drawerProgress, { ...springConfig }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(drawerProgress, { ...springConfig }).start(),
  })).current;

  const closeThen = (callback) => onClose?.(callback);
  const panelTranslateX = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
    extrapolate: 'clamp',
  });
  const backdropOpacity = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
    extrapolate: 'clamp',
  });
  const profileOpacity = drawerProgress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  if (settingsMode) {
    return (
      <Modal visible transparent animationType="none" onRequestClose={() => onClose?.()}>
        {settingsContent}
      </Modal>
    );
  }

  return (
      <View pointerEvents={visible ? 'auto' : 'none'} style={sidebar.overlay}>
        <Animated.View
          style={[
            sidebar.panel,
            {
              width: panelWidth,
              transform: [{ translateX: panelTranslateX }],
            },
          ]}
          renderToHardwareTextureAndroid
          needsOffscreenAlphaCompositing
          {...closePanResponder.panHandlers}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <Text style={sidebar.title}>Velorin</Text>
            <TouchableOpacity
              style={sidebar.newBtn}
              onPress={() => closeThen(() => onNewConversation?.())}
            >
              <Ionicons name="add" size={18} color={COLORS.text} />
              <Text style={sidebar.newBtnText}>新对话</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sidebar.newCharacterBtn} onPress={() => onNewCharacter?.()}>
              <Ionicons name="person-add-outline" size={17} color={COLORS.textMuted} />
              <Text style={sidebar.newCharacterText}>新角色</Text>
            </TouchableOpacity>

            <View style={sidebar.divider} />
            <View style={sidebar.sectionHeader}>
              <Text style={sidebar.sectionLabel}>角色</Text>
              {characters.length > 0 ? <Text style={sidebar.sectionHint}>{characters.length}</Text> : null}
            </View>
            {characters.length ? characters.map(character => (
              <Pressable
                key={String(character.id)}
                style={[sidebar.characterItem, currentCharacterId === character.id && sidebar.characterItemActive]}
                onLongPress={() => setCharacterActionItem(character)}
                delayLongPress={350}
              >
                <Pressable style={sidebar.characterMain} onPress={() => onOpenCharacter?.(character)} onLongPress={() => setCharacterActionItem(character)} delayLongPress={350}>
                  {character.avatar_uri ? <Image source={{ uri: character.avatar_uri }} style={sidebar.characterAvatar} /> : (
                    <View style={sidebar.characterAvatarFallback}><Text style={sidebar.characterAvatarLetter}>{(character.name || '角').slice(0, 1)}</Text></View>
                  )}
                  <Text style={sidebar.characterName} numberOfLines={1}>{character.name}</Text>
                </Pressable>
                <Pressable style={sidebar.characterChatButton} onPress={() => closeThen(() => onNewCharacterConversation?.(character))}>
                  <Ionicons name="add" size={19} color={COLORS.textMuted} />
                </Pressable>
              </Pressable>
            )) : (
              <Text style={sidebar.emptyCharacters}>还没有角色，点击“新角色”创建</Text>
            )}

            <View style={sidebar.divider} />
            <Text style={sidebar.sectionLabel}>对话记录</Text>

            <FlatList
              data={conversations}
              keyExtractor={item => item.id.toString()}
              style={{ flex: 1 }}
              renderItem={({ item }) => (
                <Pressable
                  style={sidebar.item}
                  onPress={() => closeThen(() => onSelectConversation(item))}
                  onLongPress={() => setActionItem(item)}
                >
                  <Text style={sidebar.itemText} numberOfLines={1}>{item.title}</Text>
                </Pressable>
              )}
              ListEmptyComponent={(
                <Text style={{ color: COLORS.textMuted, padding: 8, fontSize: 13 }}>
                  暂无对话
                </Text>
              )}
            />
            <Animated.View style={[sidebar.profileBar, { opacity: profileOpacity }]}>
              <Pressable style={sidebar.profileButton} onPress={() => onOpenProfile?.()}>
                <View style={sidebar.avatar}>
                  {profile?.avatarUri ? (
                    <Image source={{ uri: profile.avatarUri }} style={sidebar.avatarImage} />
                  ) : (
                    <Text style={sidebar.avatarLetter}>
                      {(profile?.name?.trim() || '用').slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={sidebar.profileTextWrap}>
                  <Text style={sidebar.username} numberOfLines={1}>
                    {profile?.preferredName?.trim() || profile?.name?.trim() || '用户'}
                  </Text>
                  {profile?.preferredName?.trim() ? (
                    <Text style={sidebar.profileSubtitle} numberOfLines={1}>{profile.name?.trim() || '用户'}</Text>
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                style={sidebar.settingsBtn}
                onPress={() => onOpenSettings?.()}
              >
                <Ionicons name="settings-outline" size={25} color={COLORS.text} />
              </Pressable>
            </Animated.View>
          </SafeAreaView>
          <View pointerEvents="none" style={sidebar.edge} />
        </Animated.View>

        <Animated.View style={{ flex: 1, opacity: backdropOpacity }}>
          <Pressable style={sidebar.backdrop} onPress={() => onClose?.()} />
        </Animated.View>

        <Modal visible={Boolean(actionItem)} transparent animationType="fade" onRequestClose={() => setActionItem(null)}>
          <Pressable style={sidebar.actionMask} onPress={() => setActionItem(null)}>
            <Pressable style={sidebar.actionCard} onPress={event => event.stopPropagation()}>
              <Text style={sidebar.actionTitle} numberOfLines={1}>{actionItem?.title || '对话'}</Text>
              <TouchableOpacity
                style={sidebar.actionButton}
                onPress={() => {
                  const item = actionItem;
                  setActionItem(null);
                  setRenameItem(item);
                  setRenameText(item?.title || '');
                }}
              >
                <Text style={sidebar.actionButtonText}>重命名</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={sidebar.actionButton}
                onPress={() => {
                  const item = actionItem;
                  setActionItem(null);
                  Alert.alert('删除对话', '确定删除这个对话吗？', [
                    { text: '取消' },
                    { text: '删除', style: 'destructive', onPress: () => onDeleteConversation(item.id) },
                  ]);
                }}
              >
                <Text style={[sidebar.actionButtonText, { color: '#C75C5C' }]}>删除</Text>
              </TouchableOpacity>
              <TouchableOpacity style={sidebar.actionCancel} onPress={() => setActionItem(null)}>
                <Text style={sidebar.actionCancelText}>取消</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={Boolean(characterActionItem)} transparent animationType="fade" onRequestClose={() => setCharacterActionItem(null)}>
          <Pressable style={sidebar.actionMask} onPress={() => setCharacterActionItem(null)}>
            <Pressable style={sidebar.actionCard} onPress={event => event.stopPropagation()}>
              <Text style={sidebar.actionTitle} numberOfLines={1}>{characterActionItem?.name || '角色'}</Text>
              <TouchableOpacity
                style={sidebar.actionButton}
                onPress={() => {
                  const item = characterActionItem;
                  setCharacterActionItem(null);
                  if (item) onOpenCharacter?.(item);
                }}
              >
                <Text style={sidebar.actionButtonText}>编辑角色</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={sidebar.actionButton}
                onPress={() => {
                  const item = characterActionItem;
                  setCharacterActionItem(null);
                  if (!item) return;
                  Alert.alert('删除角色', '确定删除“' + item.name + '”吗？', [
                    { text: '取消' },
                    { text: '删除', style: 'destructive', onPress: () => onDeleteCharacter?.(item) },
                  ]);
                }}
              >
                <Text style={[sidebar.actionButtonText, { color: '#C75C5C' }]}>删除角色</Text>
              </TouchableOpacity>
              <TouchableOpacity style={sidebar.actionCancel} onPress={() => setCharacterActionItem(null)}>
                <Text style={sidebar.actionCancelText}>取消</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={Boolean(renameItem)} transparent animationType="fade" onRequestClose={() => setRenameItem(null)}>
          <View style={sidebar.actionMask}>
            <View style={sidebar.renameCard}>
              <Text style={sidebar.actionTitle}>重命名对话</Text>
              <TextInput
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
                selectTextOnFocus
                maxLength={60}
                placeholder="输入对话名称"
                placeholderTextColor={COLORS.textMuted}
                style={sidebar.renameInput}
              />
              <View style={sidebar.renameActions}>
                <TouchableOpacity style={sidebar.renameActionButton} onPress={() => setRenameItem(null)}>
                  <Text style={sidebar.actionCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sidebar.renameActionButton, sidebar.renameSaveButton]}
                  onPress={() => {
                    const title = renameText.trim();
                    if (!title || !renameItem) return;
                    onRenameConversation?.(renameItem.id, title);
                    setRenameItem(null);
                  }}
                >
                  <Text style={sidebar.renameSaveText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
  );
}

