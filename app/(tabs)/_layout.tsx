import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, tabHeaderOptions } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: Colors.tint,
        tabBarButton: HapticTab,
        ...tabHeaderOptions,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '記録',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="list.bullet.clipboard" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          tabBarLabel: '種目',
          headerTitle: '種目ライブラリ',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="dumbbell.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          tabBarLabel: 'リマインダー',
          headerTitle: '筋トレリマインダー',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="bell.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
