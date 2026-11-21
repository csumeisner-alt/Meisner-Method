import React from 'react';
import { Tabs } from 'expo-router';
import { Easing, useWindowDimensions } from 'react-native';

export default function MainTabsLayout() {
  const { width } = useWindowDimensions();

  return (
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
        // Tab progress is -1/0/1 by route order, which reproduces the full-width
        // lateral push while keeping the routes in the stable tab navigator.
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
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
  );
}
