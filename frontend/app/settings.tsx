import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_call-filter-2/artifacts/9xi9fvo8_logo%20solution%20informatique%20plein%20ecran.png';
const WEBSITE_URL = 'https://solutioninformatique.fr';

interface Settings {
  block_unknown_numbers: boolean;
  notifications_enabled: boolean;
  auto_block_spam: boolean;
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>({
    block_unknown_numbers: false,
    notifications_enabled: true,
    auto_block_spam: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async (key: keyof Settings, value: boolean) => {
    const previousValue = settings[key];
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });

      if (!res.ok) {
        setSettings((prev) => ({ ...prev, [key]: previousValue }));
        Alert.alert('Erreur', 'Impossible de sauvegarder le paramètre');
      }
    } catch (error) {
      setSettings((prev) => ({ ...prev, [key]: previousValue }));
      Alert.alert('Erreur', 'Impossible de sauvegarder le paramètre');
    } finally {
      setSaving(false);
    }
  };

  const openAndroidCallSettings = () => {
    if (Platform.OS === 'android') {
      // This would open Android call settings in a real app
      Alert.alert(
        'Configuration Android',
        'Pour activer le blocage automatique sur Android:\n\n' +
        '1. Allez dans Paramètres > Applications\n' +
        '2. Sélectionnez CallGuard\n' +
        '3. Accordez les permissions "Téléphone"\n' +
        '4. Définissez comme app d\'identification d\'appels',
        [{ text: 'Compris' }]
      );
    } else {
      Alert.alert(
        'iOS',
        'Sur iOS, allez dans Réglages > Téléphone > Blocage et identification pour configurer le blocage.',
        [{ text: 'OK' }]
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E91E63" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Protection Section */}
        <Text style={styles.sectionTitle}>Protection</Text>
        <View style={styles.section}>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="shield" size={20} color="#E91E63" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Blocage automatique</Text>
                <Text style={styles.settingDescription}>
                  Bloquer les numéros spam automatiquement
                </Text>
              </View>
            </View>
            <Switch
              value={settings.auto_block_spam}
              onValueChange={(value) => updateSetting('auto_block_spam', value)}
              trackColor={{ false: '#2a2a4e', true: '#E91E6360' }}
              thumbColor={settings.auto_block_spam ? '#E91E63' : '#666'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="person-remove" size={20} color="#FF9800" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Bloquer numéros inconnus</Text>
                <Text style={styles.settingDescription}>
                  Bloquer tous les appels de numéros non enregistrés
                </Text>
              </View>
            </View>
            <Switch
              value={settings.block_unknown_numbers}
              onValueChange={(value) => updateSetting('block_unknown_numbers', value)}
              trackColor={{ false: '#2a2a4e', true: '#FF980060' }}
              thumbColor={settings.block_unknown_numbers ? '#FF9800' : '#666'}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.section}>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="notifications" size={20} color="#2196F3" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Notifications</Text>
                <Text style={styles.settingDescription}>
                  Recevoir une alerte quand un appel est bloqué
                </Text>
              </View>
            </View>
            <Switch
              value={settings.notifications_enabled}
              onValueChange={(value) => updateSetting('notifications_enabled', value)}
              trackColor={{ false: '#2a2a4e', true: '#2196F360' }}
              thumbColor={settings.notifications_enabled ? '#2196F3' : '#666'}
            />
          </View>
        </View>

        {/* Android Configuration */}
        <Text style={styles.sectionTitle}>Configuration système</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionItem} onPress={openAndroidCallSettings}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconContainer, { backgroundColor: '#4CAF5020' }]}>
                <Ionicons name="settings" size={20} color="#4CAF50" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Permissions Android</Text>
                <Text style={styles.settingDescription}>
                  Configurer les permissions pour le blocage d'appels
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Info Section */}
        <Text style={styles.sectionTitle}>Information</Text>
        <View style={styles.section}>
          <View style={styles.infoItem}>
            <Ionicons name="information-circle" size={24} color="#2196F3" />
            <Text style={styles.infoText}>
              CallGuard utilise une base de données de numéros spam connus en France. 
              La base est régulièrement mise à jour pour vous protéger des nouveaux numéros de démarchage.
            </Text>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.aboutSection}>
          <View style={styles.appIcon}>
            <Ionicons name="shield-checkmark" size={40} color="#E91E63" />
          </View>
          <Text style={styles.appName}>CallGuard</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appDescription}>
            Protection contre les appels indésirables
          </Text>
        </View>

        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color="#E91E63" />
            <Text style={styles.savingText}>Sauvegarde...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1e',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 16,
    marginLeft: 4,
  },
  section: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E91E6320',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingText: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  settingDescription: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#2a2a4e',
    marginLeft: 64,
  },
  infoItem: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
  },
  aboutSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginTop: 16,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#E91E6320',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  appVersion: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
  },
  appDescription: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  savingText: {
    color: '#888',
    fontSize: 12,
  },
});
