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
import { useAuth } from '../contexts/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_call-filter-2/artifacts/qwhs7ahd_logo%20SI.png';
const WEBSITE_URL = 'https://solutioninformatique.fr';

interface Settings {
  block_unknown_numbers: boolean;
  notifications_enabled: boolean;
  auto_block_spam: boolean;
  signal_spam_enabled: boolean;
}

interface SignalSpamStatus {
  enabled: boolean;
  status: string;
  message: string;
  pending_reports: number;
}

export default function SettingsScreen() {
  const { user, isAuthenticated, login, logout, isLoading: authLoading } = useAuth();
  const [settings, setSettings] = useState<Settings>({
    block_unknown_numbers: false,
    notifications_enabled: true,
    auto_block_spam: true,
    signal_spam_enabled: false,
  });
  const [signalSpamStatus, setSignalSpamStatus] = useState<SignalSpamStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }, []);

  const fetchSignalSpamStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/signal-spam/status`);
      if (res.ok) {
        const data = await res.json();
        setSignalSpamStatus(data);
      }
    } catch (error) {
      console.error('Error fetching Signal Spam status:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchSettings(), fetchSignalSpamStatus()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSettings, fetchSignalSpamStatus]);

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

  const syncUserData = async () => {
    if (!isAuthenticated) {
      Alert.alert('Connexion requise', 'Connectez-vous avec Google pour synchroniser vos données');
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/api/sync-user-data`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        Alert.alert('Synchronisation', `Données synchronisées !\n${data.stats.spam_numbers} numéros\n${data.stats.blocked_calls} appels`);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de synchroniser');
    } finally {
      setSyncing(false);
    }
  };

  const openAndroidCallSettings = () => {
    if (Platform.OS === 'android') {
      Alert.alert(
        'Configuration Android',
        'Pour activer le blocage automatique sur Android:\n\n' +
        '1. Allez dans Paramètres > Applications\n' +
        '2. Sélectionnez StopPubbySi\n' +
        '3. Accordez les permissions "Téléphone"\n' +
        '4. Définissez comme app d\'identification d\'appels',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Ouvrir Paramètres', onPress: () => Linking.openSettings() }
        ]
      );
    } else if (Platform.OS === 'ios') {
      Alert.alert(
        'iOS',
        'Sur iOS, allez dans Réglages > Téléphone > Blocage et identification pour configurer le blocage.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Ouvrir Réglages', onPress: () => Linking.openSettings() }
        ]
      );
    } else {
      // Web - use window.alert
      if (typeof window !== 'undefined') {
        window.alert(
          'Version Web\n\n' +
          'Cette fonctionnalité n\'est disponible que sur l\'application mobile Android.\n\n' +
          'Téléchargez l\'APK pour bloquer les appels sur votre téléphone.'
        );
      }
    }
  };

  const handleGoogleAuth = async () => {
    if (isAuthenticated) {
      Alert.alert(
        'Déconnexion',
        'Voulez-vous vous déconnecter ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Déconnexion', style: 'destructive', onPress: logout }
        ]
      );
    } else {
      await login();
    }
  };

  if (loading || authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E91E63" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        
        {/* Google Account Section */}
        <Text style={styles.sectionTitle}>Compte & Synchronisation</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.accountItem} onPress={handleGoogleAuth}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconContainer, { backgroundColor: isAuthenticated ? '#4CAF5020' : '#2196F320' }]}>
                <Ionicons 
                  name={isAuthenticated ? 'person-circle' : 'logo-google'} 
                  size={24} 
                  color={isAuthenticated ? '#4CAF50' : '#2196F3'} 
                />
              </View>
              <View style={styles.settingText}>
                {isAuthenticated && user ? (
                  <>
                    <Text style={styles.settingTitle}>{user.name}</Text>
                    <Text style={styles.settingDescription}>{user.email}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.settingTitle}>Se connecter avec Google</Text>
                    <Text style={styles.settingDescription}>Synchronisez vos données entre appareils</Text>
                  </>
                )}
              </View>
            </View>
            <Ionicons 
              name={isAuthenticated ? 'log-out-outline' : 'chevron-forward'} 
              size={20} 
              color={isAuthenticated ? '#F44336' : '#666'} 
            />
          </TouchableOpacity>

          {isAuthenticated && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.actionItem} onPress={syncUserData} disabled={syncing}>
                <View style={styles.settingInfo}>
                  <View style={[styles.settingIconContainer, { backgroundColor: '#9C27B020' }]}>
                    {syncing ? (
                      <ActivityIndicator size="small" color="#9C27B0" />
                    ) : (
                      <Ionicons name="cloud-upload" size={20} color="#9C27B0" />
                    )}
                  </View>
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Synchroniser maintenant</Text>
                    <Text style={styles.settingDescription}>Sauvegarder vos données dans le cloud</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#666" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Signal Spam Section */}
        <Text style={styles.sectionTitle}>Signal Spam France</Text>
        <View style={styles.section}>
          <View style={styles.signalSpamStatus}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconContainer, { backgroundColor: '#FF980020' }]}>
                <Ionicons name="flag" size={20} color="#FF9800" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Intégration Signal Spam</Text>
                <Text style={styles.settingDescription}>
                  {signalSpamStatus?.message || 'En attente des accès API'}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: signalSpamStatus?.enabled ? '#4CAF5020' : '#FF980020' }]}>
              <Text style={[styles.statusText, { color: signalSpamStatus?.enabled ? '#4CAF50' : '#FF9800' }]}>
                {signalSpamStatus?.enabled ? 'Actif' : 'En attente'}
              </Text>
            </View>
          </View>
          
          {signalSpamStatus && signalSpamStatus.pending_reports > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoItem}>
                <Ionicons name="time" size={20} color="#888" />
                <Text style={styles.pendingText}>
                  {signalSpamStatus.pending_reports} signalement(s) en attente de synchronisation
                </Text>
              </View>
            </>
          )}
        </View>

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

        {/* Play Store Info */}
        <Text style={styles.sectionTitle}>Publication Play Store</Text>
        <View style={styles.section}>
          <View style={styles.infoItem}>
            <Ionicons name="storefront" size={24} color="#4CAF50" />
            <Text style={styles.infoText}>
              Pour publier sur le Play Store :{'\n'}
              1. Créez un compte Google Play Developer (25$){'\n'}
              2. Préparez les captures d'écran et description{'\n'}
              3. Générez le build APK/AAB signé{'\n'}
              4. Soumettez l'application pour review
            </Text>
          </View>
        </View>

        {/* Info Section */}
        <Text style={styles.sectionTitle}>Information</Text>
        <View style={styles.section}>
          <View style={styles.infoItem}>
            <Ionicons name="information-circle" size={24} color="#2196F3" />
            <Text style={styles.infoText}>
              StopPubbySi utilise une base de données de numéros spam connus en France. 
              La base est régulièrement mise à jour pour vous protéger des nouveaux numéros de démarchage.
            </Text>
          </View>
        </View>

        {/* About Section */}
        <TouchableOpacity 
          style={styles.aboutSection}
          onPress={() => Linking.openURL(WEBSITE_URL)}
          activeOpacity={0.8}
        >
          <Image 
            source={{ uri: LOGO_URL }} 
            style={styles.aboutLogo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>StopPubbySi</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appDescription}>
            Protection contre les appels indésirables
          </Text>
          <Text style={styles.websiteLink}>solutioninformatique.fr</Text>
        </TouchableOpacity>

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
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  signalSpamStatus: {
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
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pendingText: {
    flex: 1,
    color: '#888',
    fontSize: 13,
    marginLeft: 12,
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
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  aboutLogo: {
    width: 180,
    height: 100,
    marginBottom: 12,
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
  websiteLink: {
    fontSize: 12,
    color: '#E91E63',
    marginTop: 8,
    textDecorationLine: 'underline',
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
