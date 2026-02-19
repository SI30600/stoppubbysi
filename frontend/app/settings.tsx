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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import CallBlocker from '../modules/CallBlockerModule';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_call-filter-2/artifacts/qmcd8gr5_StopPubbySi.png';
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
  const [callBlockingEnabled, setCallBlockingEnabled] = useState(false);
  const [checkingCallBlocker, setCheckingCallBlocker] = useState(false);
  const [showTipsModal, setShowTipsModal] = useState(false);
  const [aiScreeningEnabled, setAiScreeningEnabled] = useState(false);
  const [isDefaultDialer, setIsDefaultDialer] = useState(false);

  // Check if call blocking is enabled on mount
  const checkCallBlockerStatus = useCallback(async () => {
    if (Platform.OS === 'android') {
      setCheckingCallBlocker(true);
      try {
        const isEnabled = await CallBlocker.isCallScreeningServiceEnabled();
        setCallBlockingEnabled(isEnabled);
        
        // Check if we are the default dialer
        const dialerEnabled = await CallBlocker.isDialerRoleHeld();
        setIsDefaultDialer(dialerEnabled);
        
        // Also check AI screening status
        const aiEnabled = await CallBlocker.isAIScreeningEnabled();
        setAiScreeningEnabled(aiEnabled);
      } catch (error) {
        console.error('Error checking call blocker status:', error);
      } finally {
        setCheckingCallBlocker(false);
      }
    }
  }, []);

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
      await Promise.all([fetchSettings(), fetchSignalSpamStatus(), checkCallBlockerStatus()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSettings, fetchSignalSpamStatus, checkCallBlockerStatus]);

  // Sync spam numbers to native module when settings are updated
  const syncSpamNumbersToNative = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const res = await fetch(`${API_URL}/api/spam-numbers`);
      if (res.ok) {
        const data = await res.json();
        const numbers = data.map((item: any) => item.phone_number);
        await CallBlocker.updateBlockedNumbers(numbers);
        console.log(`Synced ${numbers.length} spam numbers to native module`);
      }
    } catch (error) {
      console.error('Error syncing spam numbers to native:', error);
    }
  }, []);

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
      } else {
        // Sync to native module on Android
        if (Platform.OS === 'android') {
          if (key === 'auto_block_spam') {
            await CallBlocker.setAutoBlockEnabled(value);
            if (value) {
              await syncSpamNumbersToNative();
            }
          } else if (key === 'block_unknown_numbers') {
            await CallBlocker.setBlockUnknownNumbers(value);
          }
        }
      }
    } catch (error) {
      setSettings((prev) => ({ ...prev, [key]: previousValue }));
      Alert.alert('Erreur', 'Impossible de sauvegarder le paramètre');
    } finally {
      setSaving(false);
    }
  };

  const activateCallBlocking = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Non supporté',
        'Le blocage d\'appels en arrière-plan n\'est disponible que sur Android.'
      );
      return;
    }

    try {
      setCheckingCallBlocker(true);
      
      // Request the call screening role
      const requested = await CallBlocker.requestCallScreeningRole();
      
      if (requested) {
        // Wait a moment and check the status
        setTimeout(async () => {
          try {
            const isEnabled = await CallBlocker.isCallScreeningServiceEnabled();
            setCallBlockingEnabled(isEnabled);
            
            if (isEnabled) {
              // Sync spam numbers to native storage
              await syncSpamNumbersToNative();
              Alert.alert(
                'Activé !',
                'StopPubbySi est maintenant configuré pour bloquer les appels spam même quand l\'application est fermée.'
              );
            } else {
              Alert.alert(
                'Configuration requise',
                'Veuillez sélectionner StopPubbySi comme application de filtrage d\'appels dans les paramètres Android.'
              );
            }
          } catch (e) {
            console.error('Error checking status:', e);
          } finally {
            setCheckingCallBlocker(false);
          }
        }, 2000);
      } else {
        // Request failed or not supported
        setCheckingCallBlocker(false);
        Alert.alert(
          'Non disponible',
          'Cette fonctionnalité nécessite Android 10 ou supérieur.'
        );
      }
    } catch (error) {
      console.error('Error activating call blocking:', error);
      setCheckingCallBlocker(false);
      Alert.alert('Erreur', 'Impossible d\'activer le blocage d\'appels. Vérifiez que vous utilisez Android 10 ou supérieur.');
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

        {/* AI Screening Section */}
        {Platform.OS === 'android' && (
          <>
            <Text style={styles.sectionTitle}>Filtrage IA (Dialer)</Text>
            <View style={styles.section}>
              <View style={styles.infoItem}>
                <Ionicons name="sparkles" size={24} color="#9C27B0" />
                <Text style={styles.infoText}>
                  Pour que l'IA puisse répondre aux appels et parler à l'appelant, StopPubbySi doit devenir votre application Téléphone par défaut.
                </Text>
              </View>
              
              {/* Default Dialer Status */}
              <View style={styles.divider} />
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <View style={[styles.settingIconContainer, { backgroundColor: isDefaultDialer ? '#4CAF5020' : '#FF980020' }]}>
                    <Ionicons 
                      name={isDefaultDialer ? 'call' : 'call-outline'} 
                      size={20} 
                      color={isDefaultDialer ? '#4CAF50' : '#FF9800'} 
                    />
                  </View>
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>App Téléphone par défaut</Text>
                    <Text style={styles.settingDescription}>
                      {isDefaultDialer 
                        ? '✓ StopPubbySi gère vos appels'
                        : 'Requis pour le filtrage IA vocal'}
                    </Text>
                  </View>
                </View>
                {checkingCallBlocker ? (
                  <ActivityIndicator size="small" color="#9C27B0" />
                ) : (
                  <View style={[styles.statusBadge, { backgroundColor: isDefaultDialer ? '#4CAF5020' : '#FF980020' }]}>
                    <Text style={[styles.statusText, { color: isDefaultDialer ? '#4CAF50' : '#FF9800' }]}>
                      {isDefaultDialer ? 'Actif' : 'Inactif'}
                    </Text>
                  </View>
                )}
              </View>

              {!isDefaultDialer && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity 
                    style={styles.actionItem} 
                    onPress={async () => {
                      setCheckingCallBlocker(true);
                      try {
                        const result = await CallBlocker.requestDialerRole();
                        setTimeout(async () => {
                          const dialerEnabled = await CallBlocker.isDialerRoleHeld();
                          setIsDefaultDialer(dialerEnabled);
                          if (dialerEnabled) {
                            Alert.alert(
                              '✅ Configuré !',
                              'StopPubbySi est maintenant votre application Téléphone. L\'IA pourra répondre aux appels inconnus.',
                              [{ text: 'Super !' }]
                            );
                          }
                          setCheckingCallBlocker(false);
                        }, 2000);
                      } catch (e) {
                        setCheckingCallBlocker(false);
                        Alert.alert('Erreur', 'Impossible de configurer StopPubbySi comme app Téléphone.');
                      }
                    }}
                    disabled={checkingCallBlocker}
                  >
                    <View style={styles.settingInfo}>
                      <View style={[styles.settingIconContainer, { backgroundColor: '#9C27B020' }]}>
                        <Ionicons name="phone-portrait" size={20} color="#9C27B0" />
                      </View>
                      <View style={styles.settingText}>
                        <Text style={[styles.settingTitle, { color: '#9C27B0' }]}>
                          Devenir app Téléphone
                        </Text>
                        <Text style={styles.settingDescription}>
                          Remplacer l'app Téléphone par StopPubbySi
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9C27B0" />
                  </TouchableOpacity>
                </>
              )}
              
              <View style={styles.divider} />
              
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <View style={[styles.settingIconContainer, { backgroundColor: '#9C27B020' }]}>
                    <Ionicons name="mic" size={20} color="#9C27B0" />
                  </View>
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Filtrage vocal IA</Text>
                    <Text style={styles.settingDescription}>
                      Message : "Bonjour, veuillez vous identifier..."
                    </Text>
                  </View>
                </View>
                <Switch
                  value={aiScreeningEnabled}
                  onValueChange={async (value) => {
                    if (value && !isDefaultDialer) {
                      Alert.alert(
                        'Configuration requise',
                        'Pour activer le filtrage IA, vous devez d\'abord définir StopPubbySi comme application Téléphone par défaut.',
                        [{ text: 'Compris' }]
                      );
                      return;
                    }
                    setAiScreeningEnabled(value);
                    await CallBlocker.setAIScreeningEnabled(value);
                    if (value) {
                      await CallBlocker.setAIScreeningDelay(3);
                      Alert.alert(
                        'Filtrage IA activé',
                        'L\'IA répondra automatiquement aux appels inconnus après 3 secondes et demandera à l\'appelant de s\'identifier.',
                        [{ text: 'Compris' }]
                      );
                    }
                  }}
                  trackColor={{ false: '#2a2a4e', true: '#9C27B060' }}
                  thumbColor={aiScreeningEnabled ? '#9C27B0' : '#666'}
                  disabled={!isDefaultDialer}
                />
              </View>
              
              {!isDefaultDialer && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoItem}>
                    <Ionicons name="warning" size={20} color="#FF9800" />
                    <Text style={[styles.infoText, { color: '#FF9800' }]}>
                      Cliquez sur "Devenir app Téléphone" ci-dessus pour activer cette fonctionnalité.
                    </Text>
                  </View>
                </>
              )}
            </View>
          </>
        )}

        {/* Bloctel Section */}
        <Text style={styles.sectionTitle}>Bloctel - Liste d'opposition</Text>
        <View style={styles.section}>
          <View style={styles.infoItem}>
            <Ionicons name="shield-checkmark" size={24} color="#0066CC" />
            <Text style={styles.infoText}>
              Inscrivez-vous gratuitement sur Bloctel pour interdire légalement aux entreprises de vous démarcher par téléphone. Valable 3 ans, renouvelable.
            </Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity 
            style={styles.actionItem} 
            onPress={() => Linking.openURL('https://www.bloctel.gouv.fr/')}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconContainer, { backgroundColor: '#0066CC20' }]}>
                <Ionicons name="open-outline" size={20} color="#0066CC" />
              </View>
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: '#0066CC' }]}>S'inscrire sur Bloctel</Text>
                <Text style={styles.settingDescription}>
                  Service officiel du gouvernement français
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0066CC" />
          </TouchableOpacity>
        </View>

        {/* Tips Section */}
        <Text style={styles.sectionTitle}>Conseils</Text>
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.actionItem} 
            onPress={() => setShowTipsModal(true)}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.settingIconContainer, { backgroundColor: '#9C27B020' }]}>
                <Ionicons name="bulb" size={20} color="#9C27B0" />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Astuces anti-démarchage</Text>
                <Text style={styles.settingDescription}>
                  7 conseils pour réduire les appels commerciaux
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9C27B0" />
          </TouchableOpacity>
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
          {/* Background Call Blocking Status */}
          {Platform.OS === 'android' && (
            <>
              <View style={styles.settingItem}>
                <View style={styles.settingInfo}>
                  <View style={[styles.settingIconContainer, { backgroundColor: callBlockingEnabled ? '#4CAF5020' : '#E91E6320' }]}>
                    <Ionicons 
                      name={callBlockingEnabled ? 'shield-checkmark' : 'shield-outline'} 
                      size={20} 
                      color={callBlockingEnabled ? '#4CAF50' : '#E91E63'} 
                    />
                  </View>
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Blocage en arrière-plan</Text>
                    <Text style={styles.settingDescription}>
                      {callBlockingEnabled 
                        ? 'Actif - Les appels sont bloqués même app fermée'
                        : 'Inactif - Activez pour bloquer les appels automatiquement'}
                    </Text>
                  </View>
                </View>
                {checkingCallBlocker ? (
                  <ActivityIndicator size="small" color="#E91E63" />
                ) : (
                  <View style={[styles.statusBadge, { backgroundColor: callBlockingEnabled ? '#4CAF5020' : '#E91E6320' }]}>
                    <Text style={[styles.statusText, { color: callBlockingEnabled ? '#4CAF50' : '#E91E63' }]}>
                      {callBlockingEnabled ? 'Actif' : 'Inactif'}
                    </Text>
                  </View>
                )}
              </View>

              {!callBlockingEnabled && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity 
                    style={styles.actionItem} 
                    onPress={activateCallBlocking}
                    disabled={checkingCallBlocker}
                  >
                    <View style={styles.settingInfo}>
                      <View style={[styles.settingIconContainer, { backgroundColor: '#E91E6320' }]}>
                        <Ionicons name="power" size={20} color="#E91E63" />
                      </View>
                      <View style={styles.settingText}>
                        <Text style={[styles.settingTitle, { color: '#E91E63' }]}>
                          Activer le blocage d'appels
                        </Text>
                        <Text style={styles.settingDescription}>
                          Définir StopPubbySi comme app de filtrage
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#E91E63" />
                  </TouchableOpacity>
                </>
              )}

              {callBlockingEnabled && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity 
                    style={styles.actionItem} 
                    onPress={syncSpamNumbersToNative}
                  >
                    <View style={styles.settingInfo}>
                      <View style={[styles.settingIconContainer, { backgroundColor: '#2196F320' }]}>
                        <Ionicons name="refresh" size={20} color="#2196F3" />
                      </View>
                      <View style={styles.settingText}>
                        <Text style={styles.settingTitle}>Synchroniser la liste de blocage</Text>
                        <Text style={styles.settingDescription}>
                          Mettre à jour les numéros spam en local
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.divider} />
            </>
          )}

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

      {/* Tips Modal */}
      <Modal
        visible={showTipsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTipsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🛡️ Réduire les appels commerciaux</Text>
              <TouchableOpacity onPress={() => setShowTipsModal(false)}>
                <Ionicons name="close-circle" size={28} color="#888" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>1️⃣</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>Ne jamais confirmer ton identité ni dire "oui"</Text>
                  <Text style={styles.tipText}>
                    Exemple : au téléphone, répondre "Qui est à l'appareil ?" plutôt que de confirmer ton nom.
                  </Text>
                </View>
              </View>

              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>2️⃣</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>Ne pas engager la conversation</Text>
                  <Text style={styles.tipText}>
                    Parle le moins possible, raccroche rapidement.
                  </Text>
                </View>
              </View>

              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>3️⃣</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>Ne jamais rappeler un numéro inconnu</Text>
                  <Text style={styles.tipText}>
                    Rappeler confirme que ton numéro est actif et intéressant.
                  </Text>
                </View>
              </View>

              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>4️⃣</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>S'inscrire sur Bloctel</Text>
                  <Text style={styles.tipText}>
                    Site officiel : bloctel.gouv.fr{'\n'}
                    Protège légalement ton numéro pendant 3 ans.
                  </Text>
                </View>
              </View>

              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>5️⃣</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>Activer le filtrage anti-spam sur ton téléphone</Text>
                  <Text style={styles.tipText}>
                    iPhone : "Silence des appelants inconnus"{'\n'}
                    Android : "Filtrage des appels et SMS spam"
                  </Text>
                </View>
              </View>

              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>6️⃣</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>Nettoyer tes autorisations marketing</Text>
                  <Text style={styles.tipText}>
                    Décoche toutes les cases "J'accepte de recevoir des offres partenaires"{'\n'}
                    Utilise une adresse e-mail secondaire pour les inscriptions en ligne.
                  </Text>
                </View>
              </View>

              <View style={styles.tipItem}>
                <Text style={styles.tipNumber}>7️⃣</Text>
                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>Ne jamais cliquer sur les liens ou répondre aux SMS commerciaux</Text>
                  <Text style={styles.tipText}>
                    Chaque interaction rend ton numéro plus "valeur commerciale".
                  </Text>
                </View>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>

            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowTipsModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>Compris !</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  tipItem: {
    flexDirection: 'row',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  tipNumber: {
    fontSize: 20,
    marginRight: 12,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  tipText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
  },
  modalCloseButton: {
    backgroundColor: '#E91E63',
    marginHorizontal: 20,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
