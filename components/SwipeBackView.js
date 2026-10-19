import { useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';

const EDGE_SIZE = 32;
const CLOSE_DISTANCE = 90;

export function SwipeBackView({ onSwipeBack, children }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const gesture = useRef({ startX: 0, direction: null }).current;
  const screenWidth = Dimensions.get('window').width;

  const reset = () => {
    gesture.startX = 0;
    gesture.direction = null;
  };

  const settle = (shouldClose) => {
    const direction = gesture.direction === 'right' ? -1 : 1;
    if (shouldClose) {
      Animated.timing(translateX, {
        toValue: direction * screenWidth,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        reset();
        translateX.setValue(0);
        onSwipeBack?.();
      });
      return;
    }
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 5,
    }).start(reset);
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: (event) => {
      gesture.startX = event.nativeEvent.pageX;
      gesture.direction = null;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, state) => {
      if (!gesture.direction) {
        if (gesture.startX <= EDGE_SIZE && state.dx > 4) gesture.direction = 'left';
        if (gesture.startX >= screenWidth - EDGE_SIZE && state.dx < -4) gesture.direction = 'right';
      }
      if (!gesture.direction) return false;
      return Math.abs(state.dx) > Math.abs(state.dy) && Math.abs(state.dx) > 6;
    },
    onPanResponderMove: (_, state) => {
      const value = gesture.direction === 'left'
        ? Math.max(0, state.dx)
        : Math.min(0, state.dx);
      translateX.setValue(value);
    },
    onPanResponderRelease: (_, state) => {
      const distance = gesture.direction === 'left' ? state.dx : -state.dx;
      const velocity = gesture.direction === 'left' ? state.vx : -state.vx;
      settle(distance > CLOSE_DISTANCE || velocity > 0.8);
    },
    onPanResponderTerminate: () => settle(false),
  })).current;

  return (
    <Animated.View
      style={{ flex: 1, transform: [{ translateX }] }}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

