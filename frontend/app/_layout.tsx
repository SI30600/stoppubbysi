import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../contexts/AuthContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: '#E91E63',
            tabBarInactiveTintColor: '#1a1a2e',
            tabBarStyle: styles.tabBar,
            tabBarLabelStyle: styles.tabBarLabel,
            headerStyle: styles.header,
            headerTitleStyle: styles.headerTitle,
            headerTintColor: '#fff',
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Accueil',
              headerTitle: 'StopPubbySi',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? "home" : "home-outline"} size={28} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="blocked"
            options={{
              title: 'Bloqués',
              headerTitle: 'Numéros Bloqués',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? "ban" : "ban-outline"} size={28} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="history"
            options={{
              title: 'Historique',
              headerTitle: 'Appels Filtrés',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? "time" : "time-outline"} size={28} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Paramètres',
              headerTitle: 'Paramètres',
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? "settings" : "settings-outline"} size={28} color={color} />
              ),
            }}
          />
        </Tabs>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e0e0e0',
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 70,
    height: Platform.OS === 'ios' ? 85 : 95,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
  header: {
    backgroundColor: '#1a1a2e',
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
