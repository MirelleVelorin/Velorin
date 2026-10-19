import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const STORAGE_KEY = 'velorin_stickers';
const MAX_AI_EDGE = 384;

const rootDirectory = new Directory(Paths.document, 'stickers');
const originalDirectory = new Directory(rootDirectory, 'original');
const aiDirectory = new Directory(rootDirectory, 'ai');

const ensureDirectories = () => {
  rootDirectory.create({ intermediates: true, idempotent: true });
  originalDirectory.create({ intermediates: true, idempotent: true });
  aiDirectory.create({ intermediates: true, idempotent: true });
};

const extensionForAsset = (asset) => {
  const fileName = String(asset.fileName || '');
  const match = fileName.match(/\.([a-zA-Z0-9]{2,5})$/);
  if (match) return match[1].toLowerCase();
  const mimeType = String(asset.mimeType || '').toLowerCase();
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('heic') || mimeType.includes('heif')) return 'heic';
  return 'jpg';
};

const saveStickerList = async (stickers) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stickers));
};

export async function loadStickers() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    const stickers = saved ? JSON.parse(saved) : [];
    return Array.isArray(stickers) ? stickers : [];
  } catch {
    return [];
  }
}

export async function importStickersFromLibrary() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 0,
    orderedSelection: true,
    quality: 1,
  });

  if (result.canceled) return { canceled: true, stickers: await loadStickers(), importedCount: 0, failedCount: 0 };

  ensureDirectories();
  const previous = await loadStickers();
  const imported = [];
  let failedCount = 0;

  for (let index = 0; index < result.assets.length; index += 1) {
    const asset = result.assets[index];
    const id = `${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`;
    const originalFile = new File(originalDirectory, `${id}.${extensionForAsset(asset)}`);
    const aiFile = new File(aiDirectory, `${id}.jpg`);

    try {
      await new File(asset.uri).copy(originalFile);

      const manipulator = ImageManipulator.manipulate(asset.uri);
      if (asset.width > MAX_AI_EDGE || asset.height > MAX_AI_EDGE) {
        if (asset.width >= asset.height) manipulator.resize({ width: MAX_AI_EDGE });
        else manipulator.resize({ height: MAX_AI_EDGE });
      }
      const rendered = await manipulator.renderAsync();
      const compressed = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.58,
      });
      await new File(compressed.uri).copy(aiFile, { overwrite: true });

      imported.push({
        id,
        name: asset.fileName || `表情包 ${previous.length + imported.length + 1}`,
        originalUri: originalFile.uri,
        compressedUri: aiFile.uri,
        mimeType: 'image/jpeg',
        createdAt: Date.now(),
      });
    } catch {
      failedCount += 1;
      if (originalFile.exists) originalFile.delete();
      if (aiFile.exists) aiFile.delete();
    }
  }

  const stickers = [...imported, ...previous];
  await saveStickerList(stickers);
  return { canceled: false, stickers, importedCount: imported.length, failedCount };
}

export async function deleteSticker(stickerId) {
  const stickers = await loadStickers();
  const target = stickers.find(item => item.id === stickerId);
  const next = stickers.filter(item => item.id !== stickerId);
  await saveStickerList(next);

  // 原图保留给已经发送过的历史消息，压缩图可以安全删除。
  if (target?.compressedUri) {
    const compressed = new File(target.compressedUri);
    if (compressed.exists) compressed.delete();
  }
  return next;
}

export async function readStickerBase64(uri) {
  return await new File(uri).base64();
}

