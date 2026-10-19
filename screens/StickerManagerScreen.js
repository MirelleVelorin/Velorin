import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../colors';
import { SwipeBackView } from '../components/SwipeBackView';

export function StickerManagerScreen({ stickers, onImport, onDelete, onClose }) {
  const [importing, setImporting] = useState(false);

  const importItems = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await onImport();
      if (!result.canceled && result.failedCount > 0) {
        Alert.alert('导入完成', `成功 ${result.importedCount} 张，失败 ${result.failedCount} 张`);
      }
    } catch (error) {
      Alert.alert('导入失败', error?.message || '没有成功读取图片');
    } finally {
      setImporting(false);
    }
  };

  const confirmDelete = (sticker) => {
    Alert.alert('删除表情包', '要从表情包库中删除这张图片吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete(sticker.id) },
    ]);
  };

  return (
    <SwipeBackView onSwipeBack={onClose}>
      <SafeAreaView style={local.container}>
        <View style={local.header}>
          <Pressable style={local.headerButton} onPress={onClose}>
            <Ionicons name="arrow-back" size={28} color={COLORS.text} />
          </Pressable>
          <Text style={local.title}>表情包管理</Text>
          <Pressable style={local.headerButton} onPress={importItems} disabled={importing}>
            {importing
              ? <ActivityIndicator size="small" color={COLORS.text} />
              : <Ionicons name="add" size={30} color={COLORS.text} />}
          </Pressable>
        </View>

        <FlatList
          data={stickers}
          keyExtractor={item => item.id}
          numColumns={3}
          contentContainerStyle={[local.grid, !stickers.length && local.emptyGrid]}
          columnWrapperStyle={stickers.length ? local.row : undefined}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [local.stickerCell, pressed && { opacity: 0.65 }]}
              onLongPress={() => confirmDelete(item)}
            >
              <Image source={{ uri: item.originalUri }} style={local.stickerImage} resizeMode="contain" />
            </Pressable>
          )}
          ListEmptyComponent={(
            <View style={local.empty}>
              <View style={local.emptyIcon}>
                <Ionicons name="happy-outline" size={36} color={COLORS.textMuted} />
              </View>
              <Text style={local.emptyTitle}>还没有表情包</Text>
              <Text style={local.emptyText}>从相册批量导入，长按图片可以删除</Text>
              <Pressable style={local.importButton} onPress={importItems} disabled={importing}>
                <Ionicons name="images-outline" size={19} color="#fff" />
                <Text style={local.importButtonText}>从相册导入</Text>
              </Pressable>
            </View>
          )}
        />
      </SafeAreaView>
    </SwipeBackView>
  );
}

const local = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 25, fontWeight: '600', color: COLORS.text, marginLeft: 14 },
  grid: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 60 },
  emptyGrid: { flexGrow: 1 },
  row: { gap: 10, marginBottom: 10 },
  stickerCell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: '32%',
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  stickerImage: { width: '100%', height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 18, color: COLORS.text, fontWeight: '600' },
  emptyText: { fontSize: 14, color: COLORS.textMuted, marginTop: 8, marginBottom: 24 },
  importButton: {
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 23,
    backgroundColor: COLORS.text,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  importButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

