import { Tabs } from 'expo-router';
import React from 'react';

import { DesignIcon } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, tabHeaderOptions } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="(record)"
      screenOptions={{
        tabBarActiveTintColor: Colors.tint,
        ...tabHeaderOptions,
      }}
    >
      <Tabs.Screen
        name="(record)"
        options={{
          tabBarLabel: '記録',
          // 記録タブは配下にStack((record)/_layout.tsx)を持ち、そちらがヘッダーを出す。
          // ここでheaderShownを切らないとタブナビゲータのヘッダーと二重になる
          headerShown: false,
          tabBarIcon: ({ color }) => <DesignIcon name="assignment" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          tabBarLabel: 'カレンダー',
          // SF Symbolsの`calendar`にはMaterial Symbols「calendar_month」塗り版に相当する
          // バリアントが無く、weight調整だけでは近似に限界があったため、DesignIconで
          // デザイン案の公式パスをそのまま描画する
          tabBarIcon: ({ color }) => <DesignIcon name="calendar-month" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="(library)"
        options={{
          tabBarLabel: '種目',
          // 種目タブは配下にStack((library)/_layout.tsx)を持ち、そちらがヘッダーを出す
          // （headerTitle「種目ライブラリ」もそちらへ移した）。切らないとヘッダーが二重になる
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="dumbbell.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          tabBarLabel: '設定',
          headerTitle: '設定',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="gearshape.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
