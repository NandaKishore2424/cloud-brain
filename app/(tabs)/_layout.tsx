import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Icon, fontFamily, useTheme, type IconName } from '@/design';

type TabDef = {
  name: string;
  title: string;
  icon: IconName;
  iconActive: IconName;
};

/**
 * Tab order is by expected frequency of use, not by feature importance.
 * Money is logged several times a day; notes are read occasionally. The most
 * frequent destination sits where the thumb already rests.
 */
const TABS: readonly TabDef[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'money', title: 'Money', icon: 'wallet-outline', iconActive: 'wallet' },
  { name: 'todos', title: 'Todos', icon: 'checkbox-outline', iconActive: 'checkbox' },
  { name: 'notes', title: 'Notes', icon: 'document-text-outline', iconActive: 'document-text' },
];

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fontFamily.medium,
          fontSize: 11,
          letterSpacing: 0.2,
        },
        // Android ripple defaults to a grey blob that fights the accent colour.
        tabBarButtonTestID: undefined,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, size }) => (
              <Icon
                name={focused ? tab.iconActive : tab.icon}
                size={size - 2}
                color={focused ? 'accent' : 'textSubtle'}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
