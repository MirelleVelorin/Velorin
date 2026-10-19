import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { COLORS } from '../colors';

const font = { fontFamily: 'NotoSansSC', fontWeight: '400', includeFontPadding: false };

function resolveStyle(style) {
  const flat = StyleSheet.flatten(style) || {};
  const weight = flat.fontWeight === 'bold' ? 700 : Number(flat.fontWeight || 400);
  // Preserve the bundled face instead of selecting a system bold font.
  const emphasis = weight > 400 ? {
    textShadowColor: flat.color || COLORS.text,
    textShadowOffset: { width: weight >= 600 ? 0.35 : 0.2, height: 0 },
    textShadowRadius: 0.15,
  } : null;
  return [style, font, emphasis];
}

export const SettingsText = forwardRef(function SettingsText({ style, ...props }, ref) {
  return <Text {...props} ref={ref} style={resolveStyle(style)} />;
});

export const SettingsTextInput = forwardRef(function SettingsTextInput({ style, ...props }, ref) {
  return <TextInput {...props} ref={ref} style={resolveStyle(style)} />;
});

