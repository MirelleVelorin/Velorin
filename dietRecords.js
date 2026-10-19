import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_EDGE = 1024;
const rootDirectory = new Directory(Paths.document, 'diet-records');

const ensureDirectory = () => {
  rootDirectory.create({ intermediates: true, idempotent: true });
};

export async function pickDietRecordImage(source = 'library') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('请先允许使用相机');
  }
  const launch = source === 'camera'
    ? ImagePicker.launchCameraAsync
    : ImagePicker.launchImageLibraryAsync;
  const result = await launch({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  ensureDirectory();
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const target = new File(rootDirectory, `${id}.jpg`);
  const manipulator = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_EDGE || asset.height > MAX_EDGE) {
    if (asset.width >= asset.height) manipulator.resize({ width: MAX_EDGE });
    else manipulator.resize({ height: MAX_EDGE });
  }
  const rendered = await manipulator.renderAsync();
  const compressed = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.72,
  });
  await new File(compressed.uri).copy(target, { overwrite: true });
  return target.uri;
}

export function deleteDietRecordImage(uri) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The database record can still be deleted if its image file is already missing.
  }
}

