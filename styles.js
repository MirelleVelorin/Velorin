import { StyleSheet } from 'react-native';
import { COLORS } from './colors';

const FONT_FAMILY = 'NotoSansSC';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: '500', color: COLORS.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  messageList: { padding: 20, gap: 16 },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: COLORS.userBubble, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, maxWidth: '80%',
  },
  userText: { fontFamily: FONT_FAMILY, color: COLORS.userText, fontSize: 15, lineHeight: 22 },
  userActionMenu: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end',
    marginTop: 6, padding: 4, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 5, elevation: 3,
  },
  userActionItem: {
    minWidth: 58, height: 30, paddingHorizontal: 9,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 7,
  },
  userActionText: { fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.text },
  botRow: { alignItems: 'flex-start', width: '92%' },
  inputCard: {
  backgroundColor: '#fff',
  borderRadius: 28,
  margin: 12,
  paddingTop: 14,
  paddingHorizontal: 16,
  paddingBottom: 10,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
},
inputTextRow: {
  minHeight: 40,
  marginBottom: 10,
},
inputBottomRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},
roundBtn: {
  width: 34, height: 34, borderRadius: 17,
  backgroundColor: COLORS.surface,
  alignItems: 'center', justifyContent: 'center',
},
  input: {
  fontFamily: FONT_FAMILY,
  fontSize: 15,
  lineHeight: 18,
  includeFontPadding: false,
  textAlignVertical: 'top',
  maxHeight: 120,
  color: COLORS.text,
  padding: 0,
  paddingTop: 4,
},
  sendBtn: {
    backgroundColor: '#1A1A1A', borderRadius: 17, width: 34, height: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  pauseBtn: {
    backgroundColor: '#1A1A1A', borderRadius: 17, width: 34, height: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  msgActions: {
    flexDirection: 'row', gap: 4, marginTop: 6, marginLeft: 2,
  },
  msgActionBtn: {
    padding: 6, borderRadius: 8,
  },
  speechPauseIcon: {
    width: 16, height: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3,
  },
  speechPauseBar: {
    width: 2, height: 9, borderRadius: 1,
    backgroundColor: COLORS.textMuted,
  },
  attachmentBar: {
  flexDirection: 'row', alignItems: 'center', gap: 6,
  paddingHorizontal: 16, paddingVertical: 8,
  borderTopWidth: 1, borderTopColor: COLORS.border,
  backgroundColor: COLORS.surface,
},
attachmentName: {
  flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted,
},
attachmentTag: {
  flexDirection: 'row', alignItems: 'center', gap: 4,
  marginBottom: 6, opacity: 0.7,
},
attachmentTagText: {
  fontFamily: FONT_FAMILY,
  fontSize: 12, color: COLORS.textMuted,
},
attachmentBarWrap: {
  borderTopWidth: 1, borderTopColor: COLORS.border,
  backgroundColor: COLORS.surface,
},
imagePreviewBar: {
  flexDirection: 'row', gap: 8, padding: 8,
  borderTopWidth: 1, borderTopColor: COLORS.border,
  backgroundColor: COLORS.surface,
},
imagePreviewItem: {
  position: 'relative',
},
imagePreviewThumb: {
  width: 48, height: 48, borderRadius: 8,
},
imageRemoveBtn: {
  position: 'absolute', top: -6, right: -6,
  backgroundColor: COLORS.surface, borderRadius: 8,
},
sentStickerRow: {
  maxWidth: '82%',
  alignItems: 'flex-end',
  gap: 8,
  marginBottom: 6,
},
sentStickerImage: {
  width: 148,
  height: 148,
  borderRadius: 16,
},
stickerPickerMask: {
  flex: 1,
  justifyContent: 'flex-end',
  backgroundColor: 'rgba(0,0,0,0.3)',
},
stickerPickerSheet: {
  height: '52%',
  backgroundColor: COLORS.bg,
  borderTopLeftRadius: 26,
  borderTopRightRadius: 26,
  paddingTop: 12,
  paddingHorizontal: 14,
},
stickerPickerHeader: {
  height: 48,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 6,
},
stickerPickerTitle: {
  flex: 1,
  fontSize: 19,
  fontWeight: '600',
  color: COLORS.text,
},
stickerPickerClose: {
  width: 38,
  height: 38,
  borderRadius: 19,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.surface,
},
stickerPickerGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  paddingTop: 8,
  paddingBottom: 34,
},
stickerPickerItem: {
  width: '25%',
  aspectRatio: 1,
  padding: 7,
},
stickerPickerImage: {
  width: '100%',
  height: '100%',
  borderRadius: 12,
},
stickerPickerEmpty: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingBottom: 50,
},
stickerPickerEmptyText: {
  color: COLORS.textMuted,
  fontSize: 14,
  marginTop: 12,
},
modelPickerMask: {
  flex: 1,
  justifyContent: 'flex-end',
  backgroundColor: 'rgba(0,0,0,0.36)',
},
modelPickerBackdrop: { flex: 1 },
modelPickerSheet: {
  maxHeight: '78%',
  backgroundColor: COLORS.bg,
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  paddingTop: 12,
  paddingHorizontal: 18,
},
modelSearchInput: {
  height: 54,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: COLORS.border,
  backgroundColor: '#fff',
  paddingHorizontal: 18,
  fontSize: 16,
  color: COLORS.text,
  marginBottom: 16,
},
modelGroup: { marginBottom: 18 },
modelGroupTitle: {
  color: COLORS.textMuted,
  fontSize: 13,
  marginHorizontal: 8,
  marginBottom: 8,
},
modelOption: {
  minHeight: 62,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 10,
  borderRadius: 16,
  marginBottom: 6,
  backgroundColor: '#fff',
},
modelOptionIcon: {
  width: 38,
  height: 38,
  borderRadius: 19,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.surface,
  marginRight: 12,
},
modelOptionIconActive: { backgroundColor: COLORS.text },
modelOptionTextWrap: { flex: 1, minWidth: 0 },
modelOptionText: { color: COLORS.text, fontSize: 15 },
modelOptionSubtext: { color: COLORS.textMuted, fontSize: 11, marginTop: 3 },
modelEmptyText: { color: COLORS.textMuted, textAlign: 'center', paddingVertical: 36, fontSize: 14 },

menuMask:{
    flex:1,
    justifyContent:'flex-end',
    backgroundColor:'rgba(0,0,0,0.3)',
},

attachMenu:{
    backgroundColor:COLORS.bg,
    borderTopLeftRadius:24,
    borderTopRightRadius:24,
    paddingTop:12,
    paddingBottom:28,
    paddingHorizontal:18,
},

attachMenuGrid: {
  minHeight: 150,
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignContent: 'flex-start',
  paddingTop: 8,
},

attachMenuItem: {
  width: '25%',
  alignItems: 'center',
  marginBottom: 16,
},

attachMenuIconBox: {
  width: 58,
  height: 58,
  borderRadius: 15,
  backgroundColor: '#FFFFFF',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(232, 228, 220, 0.55)',
},

attachMenuIconBoxActive: {
  backgroundColor: COLORS.text,
  borderColor: COLORS.text,
},

attachMenuText: {
  marginTop: 7,
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  color: COLORS.textMuted,
  textAlign: 'center',
},

attachMenuTextActive: {
  color: '#FFFFFF',
},

attachMenuItemActive: {
  opacity: 1,
},

sheetHandle:{
    width:36,
    height:4,
    borderRadius:2,
    backgroundColor:COLORS.border,
    alignSelf:'center',
    marginBottom:12,
},

modelPill: {
  width: 110,
  height: 34, 
  borderRadius: 17,
  backgroundColor: COLORS.surface,
  alignItems: 'center', 
  justifyContent: 'center',
  marginLeft: 9,
},
modelPillText: {
  fontFamily: FONT_FAMILY,
  fontSize: 14,
  color: COLORS.text,
  transform: [{ translateY: -6 }],
},

  inputBottomLeft: {
    flexDirection: 'row',
    alignItems: 'center', 
    marginRight: 9,     
  },
  drawerShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
});

const sidebar = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'transparent' },
  panel: { width: '72%', backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingTop: 8 },
  edge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: -8,
    width: 8,
    backgroundColor: 'transparent',
  },
  title: { fontSize: 34, fontFamily: 'GreatVibes_400Regular', color: '#D99A73', paddingVertical: 8 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8 },
  newBtnText: { fontFamily: FONT_FAMILY, fontSize: 15, color: COLORS.text },
  newCharacterBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 9 },
  newCharacterText: { fontFamily: FONT_FAMILY, fontSize: 14, color: COLORS.textMuted },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionHint: { fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, marginRight: 8 },
  characterItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 8, paddingRight: 2 },
  characterItemActive: { backgroundColor: '#F3F5F8' },
  characterMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  characterAvatar: { width: 34, height: 34, borderRadius: 17 },
  characterAvatarFallback: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7ECF4' },
  characterAvatarLetter: { fontFamily: FONT_FAMILY, fontSize: 15, color: '#6E7F96', fontWeight: '600' },
  characterName: { flex: 1, fontFamily: FONT_FAMILY, fontSize: 14, color: COLORS.text },
  characterChatButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  emptyCharacters: { fontFamily: FONT_FAMILY, fontSize: 12, color: COLORS.textMuted, paddingHorizontal: 8, paddingVertical: 8 },
  sectionLabel: { fontFamily: FONT_FAMILY, fontSize: 11, color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 4, marginTop: 8 },
  item: { paddingVertical: 0, paddingHorizontal: 8, borderRadius: 10 },
  itemText: { fontFamily: FONT_FAMILY, fontSize: 15, color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  profileBar: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  profileButton: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7ECF4',
  },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  avatarLetter: { fontSize: 18, fontWeight: '600', color: '#6E7F96' },
  profileTextWrap: { flex: 1, minWidth: 0, marginLeft: 12 },
  username: {
    fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: '400',
    lineHeight: 20, includeFontPadding: false, color: COLORS.text,
    textShadowColor: COLORS.text, textShadowOffset: { width: 0.35, height: 0 }, textShadowRadius: 0.15,
  },
  profileSubtitle: {
    fontFamily: FONT_FAMILY, fontSize: 12,
    lineHeight: 16, includeFontPadding: false, color: COLORS.textMuted, marginTop: 2,
  },
  settingsBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  actionMask: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  actionCard: {
    width: '78%',
    borderRadius: 18,
    padding: 18,
    backgroundColor: COLORS.surface,
  },
  renameCard: {
    width: '84%',
    borderRadius: 18,
    padding: 18,
    backgroundColor: COLORS.surface,
  },
  actionTitle: { fontFamily: FONT_FAMILY, fontSize: 16, color: COLORS.text, marginBottom: 10 },
  actionButton: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionButtonText: { fontFamily: FONT_FAMILY, fontSize: 15, color: COLORS.text },
  actionCancel: { marginTop: 6, paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border },
  actionCancelText: { fontFamily: FONT_FAMILY, fontSize: 15, color: COLORS.textMuted },
  renameInput: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  renameActionButton: { paddingHorizontal: 12, paddingVertical: 8 },
  renameSaveButton: { borderRadius: 10, backgroundColor: COLORS.text },
  renameSaveText: { fontFamily: FONT_FAMILY, fontSize: 15, color: COLORS.surface },
});

const setting = StyleSheet.create({
  label: { fontFamily: FONT_FAMILY, fontSize: 13, color: COLORS.textMuted, marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontFamily: FONT_FAMILY, fontSize: 15,
    backgroundColor: COLORS.surface, color: COLORS.text,
  },
});

const markdownStyles = {
  body: { fontFamily: FONT_FAMILY, color: COLORS.text, fontSize: 15, lineHeight: 24 },
  code_inline: { fontFamily: FONT_FAMILY, backgroundColor: COLORS.surface, borderRadius: 4, paddingHorizontal: 4 },
  fence: { fontFamily: FONT_FAMILY, backgroundColor: COLORS.surface, borderRadius: 8, padding: 12 },
  strong: { fontWeight: '600' },
};

export { styles, sidebar, setting, markdownStyles };

