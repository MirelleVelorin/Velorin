const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function loadTrace() {
  const effects = [];
  const listeners = [];
  const absoluteFill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };
  const react = {
    useState: value => [value, () => {}],
    useEffect: effect => effects.push(effect),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  };
  const native = {
    Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    // Match RN 0.86: deliberately no absoluteFillObject alias.
    StyleSheet: { absoluteFill, hairlineWidth: 1, create: styles => styles },
    BackHandler: { addEventListener: (name, callback) => {
      const listener = { name, callback, removed: false };
      listeners.push(listener);
      return { remove: () => { listener.removed = true; } };
    } },
  };
  const code = babel.transformFileSync(path.join(__dirname, '../components/ToolTrace.js'), {
    babelrc: false, configFile: false,
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'classic' }],
      '@babel/plugin-transform-modules-commonjs',
    ],
  }).code;
  const exports = {};
  vm.runInNewContext(code, {
    exports, React: react,
    require: name => {
      if (name === 'react') return react;
      if (name === 'react-native') return native;
      if (name === '@expo/vector-icons/Ionicons') return 'Ionicons';
      if (name === 'expo-blur') return { BlurView: 'BlurView' };
      if (name === '../colors') return { COLORS: {} };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { ...exports, effects, listeners };
}

function assertFullScreen(style) {
  assert.equal(style.position, 'absolute');
  for (const edge of ['top', 'right', 'bottom', 'left']) assert.equal(style[edge], 0);
}

test('thought overlay stays outside normal chat layout on RN 0.86', () => {
  const { ToolTraceOverlay } = loadTrace();
  const overlay = ToolTraceOverlay({ trace: {}, onClose() {} });
  assertFullScreen(overlay.props.style);
  assert.equal(overlay.props.style.justifyContent, 'flex-end');
  const sheet = overlay.children[1].type(overlay.children[1].props);
  assert.equal(sheet.props.style.height, '56%');
  assert.equal(sheet.props.style.borderTopLeftRadius, 30);
  assert.equal(sheet.props.style.borderTopRightRadius, 30);
});

test('backdrop has full-screen blur and an independent gray tint; tapping closes it', () => {
  const { ToolTraceOverlay } = loadTrace();
  let closed = 0;
  const blurTarget = { current: {} };
  const overlay = ToolTraceOverlay({ trace: {}, blurTarget, onClose: () => closed++ });
  const element = overlay.children[0];
  const backdrop = element.type(element.props);
  assert.equal(backdrop.type, 'Pressable');
  assertFullScreen(backdrop.props.style);
  const [blur, tint] = backdrop.children;
  assertFullScreen(blur.props.style);
  assert.equal(blur.props.blurTarget, blurTarget);
  assert.equal(blur.props.blurMethod, 'dimezisBlurView');
  assert.equal(blur.props.intensity, 12);
  assert.equal(blur.props.blurReductionFactor, 1);
  assert.equal(blur.props.tint, 'dark');
  assertFullScreen(tint.props.style);
  assert.equal(tint.props.style.backgroundColor, 'rgba(72, 76, 84, 0.10)');
  assert.equal(blur.props.pointerEvents, 'none');
  assert.equal(tint.props.pointerEvents, 'none');
  backdrop.props.onPress();
  assert.equal(closed, 1);
});

test('Android back closes thought overlay and listener is removed on unmount', () => {
  const { ToolTraceOverlay, effects, listeners } = loadTrace();
  let closed = 0;
  ToolTraceOverlay({ trace: {}, onClose: () => closed++ });
  const cleanup = effects[0]();
  assert.equal(listeners[0].name, 'hardwareBackPress');
  assert.equal(listeners[0].callback(), true);
  assert.equal(closed, 1);
  cleanup();
  assert.equal(listeners[0].removed, true);
});

test('no trace does not render an overlay or intercept Android back', () => {
  const { ToolTraceOverlay, effects, listeners } = loadTrace();
  assert.equal(ToolTraceOverlay({ trace: null, onClose() {} }), null);
  effects[0]();
  assert.equal(listeners.length, 0);
});

