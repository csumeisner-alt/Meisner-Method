import React from 'react';
import { Tabs } from 'expo-router';
import { MainTabSwipeBoundary } from '@/components/MainTabSwipeBoundary';

export default function MainTabsLayout() {
  return (
    <MainTabSwipeBoundary>
      <Tabs
        initialRouteName="index"
        backBehavior="history"
        detachInactiveScreens={false}
        tabBar={() => null}
        screenOptions={{
          headerShown: false,
          animation: 'none',
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
    </MainTabSwipeBoundary>
  );
}
