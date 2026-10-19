import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsText as Text, SettingsTextInput as TextInput } from '../components/SettingsTypography';
import { COLORS } from '../colors';
import { deleteDietRecord, loadDietRecords, saveDietRecord, updateDietRecord } from '../db';
import { deleteDietRecordImage, pickDietRecordImage } from '../dietRecords';
import { SwipeBackView } from '../components/SwipeBackView';

const RATINGS = [
  '好吃，可以常点',
  '好吃，但不宜常点',
  '一般',
  '不好吃，不会再点',
  '不好吃，但可能会再次尝试',
];
const MEAL_TYPES = ['早餐', '午餐', '晚餐', '零食', '饮品', '其他'];
const FLAVORS = ['清淡', '咸香', '甜', '辣', '酸', '其他'];

export function DietRecordsScreen({ onClose }) {
  const [page, setPage] = useState('list');
  const [records, setRecords] = useState([]);
  const [foodName, setFoodName] = useState('');
  const [price, setPrice] = useState('');
  const [rating, setRating] = useState(RATINGS[0]);
  const [mealType, setMealType] = useState('晚餐');
  const [flavor, setFlavor] = useState([]);
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const draftImageRef = useRef(null);
  const originalImageRef = useRef(null);

  const refresh = async () => setRecords(await loadDietRecords(500));
  useEffect(() => {
    refresh();
    return () => deleteDietRecordImage(draftImageRef.current);
  }, []);

  const stats = useMemo(() => {
    const countBy = (key, splitValues = false) => records.reduce((map, item) => {
      const rawValue = item[key];
      const values = splitValues
        ? String(rawValue || '').split(/[、,，/]/).map(value => value.trim()).filter(Boolean)
        : [rawValue || '未填写'];
      (values.length ? values : ['未填写']).forEach(value => {
        map[value] = (map[value] || 0) + 1;
      });
      return map;
    }, {});
    const top = map => Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || '暂无';
    return {
      total: records.length,
      totalPrice: records.reduce((sum, item) => sum + Number(item.price || 0), 0),
      topFlavor: top(countBy('flavor', true)),
      topMeal: top(countBy('meal_type')),
      topFood: top(countBy('food_name')),
    };
  }, [records]);

  const chooseImage = async source => {
    try {
      const uri = await pickDietRecordImage(source);
      if (uri) {
        const previousUri = draftImageRef.current;
        draftImageRef.current = uri;
        setImageUri(uri);
        if (previousUri && previousUri !== uri) deleteDietRecordImage(previousUri);
      }
    } catch (error) {
      Alert.alert('图片获取失败', error?.message || '请稍后再试');
    }
  };

  const discardDraftImage = () => {
    if (draftImageRef.current) deleteDietRecordImage(draftImageRef.current);
    draftImageRef.current = null;
  };

  const resetForm = () => {
    setFoodName('');
    setPrice('');
    setRating(RATINGS[0]);
    setMealType('晚餐');
    setFlavor([]);
    setNote('');
    draftImageRef.current = null;
    originalImageRef.current = null;
    setEditingRecord(null);
    setImageUri(null);
  };

  const submit = async () => {
    if (!foodName.trim()) {
      Alert.alert('还差一步', '请先填写食物名称');
      return;
    }
    setBusy(true);
    try {
      const payload = { foodName, price, rating, mealType, flavor, note, imageUri };
      if (page === 'edit' && editingRecord?.id) {
        await updateDietRecord(editingRecord.id, payload);
        if (originalImageRef.current && originalImageRef.current !== imageUri) {
          deleteDietRecordImage(originalImageRef.current);
        }
      } else {
        await saveDietRecord(payload);
      }
      draftImageRef.current = null;
      await refresh();
      resetForm();
      setPage('list');
    } catch (error) {
      Alert.alert('保存失败', error?.message || '请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = record => {
    discardDraftImage();
    setEditingRecord(record);
    originalImageRef.current = record.image_uri || null;
    setFoodName(record.food_name || '');
    setPrice(record.price ? String(record.price) : '');
    setRating(record.rating || RATINGS[0]);
    setMealType(record.meal_type || '晚餐');
    setFlavor(String(record.flavor || '').split(/[、,，/]/).map(value => value.trim()).filter(Boolean));
    setNote(record.note || '');
    setImageUri(record.image_uri || null);
    setPage('edit');
  };

  const showRecordActions = record => {
    Alert.alert('记录操作', record.food_name, [
      { text: '取消', style: 'cancel' },
      { text: '修改记录', onPress: () => startEdit(record) },
      {
        text: '删除记录',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDietRecord(record.id);
            deleteDietRecordImage(record.image_uri);
            await refresh();
          } catch (error) {
            Alert.alert('删除失败', error?.message || '请稍后再试');
          }
        },
      },
    ]);
  };

  const goBack = () => {
    if (page === 'new' || page === 'edit') {
      discardDraftImage();
      resetForm();
      setPage('list');
    } else onClose?.();
  };

  return (
    <SwipeBackView onSwipeBack={goBack}>
      <SafeAreaView style={local.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={local.header}>
            <Pressable style={local.headerButton} onPress={goBack} accessibilityRole="button" accessibilityLabel="返回">
              <Ionicons name="arrow-back" size={28} color={COLORS.text} />
            </Pressable>
            <Text style={local.title}>{page === 'new' ? '新增饮食记录' : page === 'edit' ? '修改饮食记录' : '饮食记录'}</Text>
            {page === 'list' ? (
              <Pressable style={local.headerButton} onPress={() => setPage('new')} accessibilityRole="button" accessibilityLabel="新增记录">
                <Ionicons name="add" size={28} color={COLORS.text} />
              </Pressable>
            ) : <View style={local.headerButton} />}
          </View>

          {page === 'new' || page === 'edit' ? (
            <ScrollView contentContainerStyle={local.content} keyboardShouldPersistTaps="handled">
              <Text style={local.sectionTitle}>记录这顿饭</Text>
              <View style={local.card}>
                <View style={local.photoRow}>
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={local.preview} />
                  ) : (
                    <View style={local.photoEmpty}>
                      <Ionicons name="camera-outline" size={28} color={COLORS.textMuted} />
                    </View>
                  )}
                  <View style={local.photoActions}>
                    <Text style={local.rowTitle}>{imageUri ? '修改照片' : '添加照片'}</Text>
                    <Text style={local.rowSubtitle}>照片只保存在本机，也可以不上传照片</Text>
                    <View style={local.actionRow}>
                      <SmallButton icon="camera-outline" title="拍照" onPress={() => chooseImage('camera')} />
                      <SmallButton icon="images-outline" title="相册" onPress={() => chooseImage('library')} />
                    </View>
                  </View>
                </View>
                <TextInput value={foodName} onChangeText={setFoodName} placeholder="吃了什么？" placeholderTextColor={COLORS.textMuted} style={local.input} />
                <TextInput value={price} onChangeText={value => setPrice(value.replace(/[^0-9.]/g, ''))} placeholder="价格（可选）" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" style={local.input} />
                <Text style={local.fieldLabel}>评价</Text>
                <ChipWrap values={RATINGS} value={rating} onChange={setRating} />
                <Text style={local.fieldLabel}>餐食类型</Text>
                <ChipWrap values={MEAL_TYPES} value={mealType} onChange={setMealType} />
                <Text style={local.fieldLabel}>口味</Text>
                <ChipWrap values={FLAVORS} value={flavor} onChange={setFlavor} multiple />
                {imageUri ? <Pressable style={local.removePhotoButton} onPress={() => { discardDraftImage(); setImageUri(null); }}><Ionicons name="trash-outline" size={15} color={COLORS.textMuted} /><Text style={local.removePhotoText}>移除照片</Text></Pressable> : null}
                <TextInput value={note} onChangeText={setNote} placeholder="备注（可选）" placeholderTextColor={COLORS.textMuted} style={[local.input, local.noteInput]} multiline />
                <Pressable style={local.saveButton} onPress={submit} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={19} color="#fff" /><Text style={local.saveButtonText}>{page === 'edit' ? '保存修改' : '保存记录'}</Text></>}
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={local.content} keyboardShouldPersistTaps="handled">
              {records.length ? (
                <>
                  <Text style={local.sectionTitle}>你的饮食概览</Text>
                  <View style={local.statsGrid}>
                    <Stat label="记录次数" value={`${stats.total}`} />
                    <Stat label="累计花费" value={`¥${stats.totalPrice.toFixed(2)}`} />
                    <Stat label="常见口味" value={stats.topFlavor} />
                    <Stat label="常见类型" value={stats.topMeal} />
                  </View>
                  <View style={local.topFoodCard}>
                    <Ionicons name="trophy-outline" size={20} color={COLORS.textMuted} />
                    <Text style={local.topFoodText}>吃过最多：{stats.topFood}</Text>
                  </View>
                  <Text style={local.sectionTitle}>最近记录</Text>
                  {records.map(record => (
                    <View key={record.id} style={local.recordCard}>
                      {record.image_uri ? <Image source={{ uri: record.image_uri }} style={local.recordImage} /> : <View style={local.recordImageEmpty}><Ionicons name="restaurant-outline" size={22} color={COLORS.textMuted} /></View>}
                      <View style={local.recordBody}>
                        <Text style={local.recordName} numberOfLines={1}>{record.food_name}</Text>
                        <Text style={local.recordMeta} numberOfLines={1}>{record.meal_type || '未分类'} · {record.flavor || '口味未填'}{record.price ? ` · ¥${Number(record.price).toFixed(2)}` : ''}</Text>
                        <Text style={local.recordRating} numberOfLines={1}>{record.rating}</Text>
                        <Text style={local.recordDate}>{new Date(record.timestamp).toLocaleDateString()}</Text>
                      </View>
                      <Pressable style={local.moreButton} onPress={() => showRecordActions(record)} accessibilityRole="button" accessibilityLabel={`更多操作：${record.food_name}`} hitSlop={8}>
                        <Ionicons name="ellipsis-vertical" size={20} color={COLORS.textMuted} />
                      </Pressable>
                    </View>
                  ))}
                </>
              ) : (
                <View style={local.emptyCard}>
                  <Ionicons name="restaurant-outline" size={34} color={COLORS.textMuted} />
                  <Text style={local.emptyText}>还没有饮食记录</Text>
                  <Text style={local.emptyHint}>记下每顿饭，之后可以查看自己的饮食偏好。</Text>
                </View>
              )}
              <Pressable style={local.addRecordButton} onPress={() => setPage('new')}>
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={local.saveButtonText}>新增记录</Text>
              </Pressable>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SwipeBackView>
  );
}

function ChipWrap({ values, value, onChange, allowEmpty = false, multiple = false }) {
  const selectedValues = multiple ? (Array.isArray(value) ? value : []) : [];
  return (
    <View style={local.chipWrap}>
      {values.map(item => {
        const selected = multiple ? selectedValues.includes(item) : value === item;
        return (
          <Pressable
            key={item}
            style={[local.chip, selected && local.chipActive]}
            onPress={() => {
              if (multiple) {
                onChange(selected
                  ? selectedValues.filter(selectedItem => selectedItem !== item)
                  : [...selectedValues, item]);
              } else {
                onChange(value === item && allowEmpty ? '' : item);
              }
            }}
          >
            <Text style={[local.chipText, selected && local.chipTextActive]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SmallButton({ icon, title, onPress }) {
  return <Pressable style={local.smallButton} onPress={onPress}><Ionicons name={icon} size={16} color={COLORS.text} /><Text style={local.smallButtonText}>{title}</Text></Pressable>;
}

function Stat({ label, value }) {
  return <View style={local.statCard}><Text style={local.statValue} numberOfLines={1}>{value}</Text><Text style={local.statLabel}>{label}</Text></View>;
}

const local = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 25, fontWeight: '600', color: COLORS.text, marginLeft: 9 },
  content: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 80 },
  sectionTitle: { fontSize: 16, color: COLORS.textMuted, marginLeft: 8, marginBottom: 10, marginTop: 10 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10 },
  photoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  photoEmpty: { width: 82, height: 82, borderRadius: 16, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  preview: { width: 82, height: 82, borderRadius: 16, backgroundColor: COLORS.surface },
  photoActions: { flex: 1, marginLeft: 14 },
  rowTitle: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  rowSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 5, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 32, borderRadius: 16, backgroundColor: COLORS.surface },
  smallButtonText: { fontSize: 13, color: COLORS.text },
  input: { minHeight: 45, borderRadius: 13, backgroundColor: COLORS.surface, paddingHorizontal: 13, paddingVertical: 10, color: COLORS.text, fontSize: 15, marginTop: 9 },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  removePhotoButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9, paddingVertical: 4 },
  removePhotoText: { fontSize: 12, color: COLORS.textMuted },
  fieldLabel: { fontSize: 13, color: COLORS.textMuted, marginTop: 15, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, paddingHorizontal: 11, minHeight: 32, justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  chipText: { fontSize: 12, color: COLORS.textMuted },
  chipTextActive: { color: '#fff' },
  saveButton: { height: 46, borderRadius: 23, backgroundColor: COLORS.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18 },
  addRecordButton: { height: 46, borderRadius: 23, backgroundColor: COLORS.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18, marginBottom: 20 },
  saveButtonText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', minHeight: 76, borderRadius: 16, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12 },
  statValue: { fontSize: 17, color: COLORS.text, fontWeight: '600' },
  statLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 7 },
  topFoodCard: { minHeight: 48, borderRadius: 16, backgroundColor: '#fff', marginTop: 10, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 8 },
  topFoodText: { color: COLORS.text, fontSize: 14 },
  recordCard: { minHeight: 82, borderRadius: 16, backgroundColor: '#fff', padding: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  recordImage: { width: 62, height: 62, borderRadius: 12, backgroundColor: COLORS.surface },
  recordImageEmpty: { width: 62, height: 62, borderRadius: 12, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  recordBody: { flex: 1, marginLeft: 12, minWidth: 0 },
  recordName: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  recordMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 5 },
  recordRating: { fontSize: 12, color: COLORS.text, marginTop: 5 },
  recordDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  moreButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  emptyCard: { minHeight: 210, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, marginTop: 14 },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyHint: { color: COLORS.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
});

