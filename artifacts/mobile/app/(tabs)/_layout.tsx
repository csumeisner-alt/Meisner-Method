import React from 'react';
import { Tabs } from 'expo-router';
import { Easing, View, useWindowDimensions } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function MainTabsLayout() {
  const { width } = useWindowDimensions();
  const colors = useColors();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        initialRouteName="index"
        backBehavior="history"
        detachInactiveScreens={false}
        tabBar={() => null}
        screenOptions={{
          headerShown: false,
          animation: 'shift',
          transitionSpec: {
            animation: 'timing',
            config: {
              duration: 300,
              easing: Easing.out(Easing.cubic),
            },
          },
          // Keep both the moving scenes and the area behind them opaque so a
          // native white surface cannot flash through during a tab switch.
          sceneStyleInterpolator: ({ current }) => ({
            sceneStyle: {
              backgroundColor: colors.background,
              transform: [{
                translateX: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-width, 0, width],
                }),
              }],
            },
          }),
          freezeOnBlur: false,
          lazy: true,
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="picks" />
        <Tabs.Screen name="paper" />
        <Tabs.Screen name="portfolio" />
        <Tabs.Screen name="event-arena" />
      </Tabs>
    </View>
  );
}
