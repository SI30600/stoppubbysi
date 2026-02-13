import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_call-filter-2/artifacts/qwhs7ahd_logo%20SI.png';
const WEBSITE_URL = 'https://solutioninformatique.fr';
const SPARTAN_HELMET_URL = 'https://cdn-icons-png.flaticon.com/128/1800/1800190.png';
const APK_DOWNLOAD_URL = 'https://github.com/SI30600/stoppubbysi/releases/latest/download/stoppubbysi.apk';

interface Statistics {
  total_blocked_today: number;
  total_blocked_week: number;
  total_blocked_month: number;
  total_blocked_all: number;
  total_spam_numbers: number;
  top_categories: { name: string; count: number }[];
}

interface BlockedCall {
  id: string;
  phone_number: string;
  category_name: string;
  blocked_at: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export default function HomeScreen() {
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [recentCalls, setRecentCalls] = useState<BlockedCall[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkModalVisible, setCheckModalVisible] = useState(false);
  const [phoneToCheck, setPhoneToCheck] = useState('');
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, callsRes, catsRes] = await Promise.all([
        fetch(`${API_URL}/api/statistics`),
        fetch(`${API_URL}/api/call-history?limit=5`),
        fetch(`${API_URL}/api/categories`),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStatistics(statsData);
      }
      if (callsRes.ok) {
        const callsData = await callsRes.json();
        setRecentCalls(callsData);
      }
      if (catsRes.ok) {
        const catsData = await catsRes.json();
        setCategories(catsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const syncDatabase = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/api/sync-database`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        Alert.alert(
          'Synchronisation',
          `${data.new_numbers_added} nouveaux numéros ajoutés`,
          [{ text: 'OK' }]
        );
        fetchData();
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de synchroniser la base de données');
    } finally {
      setSyncing(false);
    }
  };

  const checkNumber = async () => {
    if (!phoneToCheck.trim()) return;
    setChecking(true);
    try {
      const res = await fetch(`${API_URL}/api/check-number/${encodeURIComponent(phoneToCheck)}`);
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de vérifier le numéro');
    } finally {
      setChecking(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E91E63" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E91E63" />
        }
      >
        {/* Header Card with Logo */}
        <TouchableOpacity 
          style={styles.headerCard} 
          onPress={() => Linking.openURL(WEBSITE_URL)}
          activeOpacity={0.8}
        >
          <Image 
            source={{ uri: LOGO_URL }} 
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.protectionBadge}>
            <Image 
              source={{ uri: SPARTAN_HELMET_URL }} 
              style={styles.spartanHelmet}
            />
            <Text style={styles.protectionText}>Protection Active</Text>
          </View>
          <Text style={styles.headerTitle}>StopPubbySi</Text>
          <Text style={styles.headerSubtitle}>
            {statistics?.total_spam_numbers || 0} numéros dans la base
          </Text>
          <Text style={styles.websiteLink}>solutioninformatique.fr</Text>
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => setCheckModalVisible(true)}>
            <Ionicons name="search" size={24} color="#fff" />
            <Text style={styles.actionText}>Vérifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.syncButton]}
            onPress={syncDatabase}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="sync" size={24} color="#fff" />
            )}
            <Text style={styles.actionText}>Sync</Text>
          </TouchableOpacity>
        </View>

        {/* Statistics Cards */}
        <Text style={styles.sectionTitle}>Statistiques</Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#E91E6320' }]}>
            <Text style={[styles.statNumber, { color: '#E91E63' }]}>
              {statistics?.total_blocked_today || 0}
            </Text>
            <Text style={styles.statLabel}>Aujourd'hui</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#2196F320' }]}>
            <Text style={[styles.statNumber, { color: '#2196F3' }]}>
              {statistics?.total_blocked_week || 0}
            </Text>
            <Text style={styles.statLabel}>Cette semaine</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#4CAF5020' }]}>
            <Text style={[styles.statNumber, { color: '#4CAF50' }]}>
              {statistics?.total_blocked_month || 0}
            </Text>
            <Text style={styles.statLabel}>Ce mois</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FF980020' }]}>
            <Text style={[styles.statNumber, { color: '#FF9800' }]}>
              {statistics?.total_blocked_all || 0}
            </Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        {/* Top Categories */}
        {statistics?.top_categories && statistics.top_categories.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top Catégories Bloquées</Text>
            <View style={styles.categoriesContainer}>
              {statistics.top_categories.map((cat, index) => (
                <View key={index} style={styles.categoryItem}>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{cat.name}</Text>
                    <Text style={styles.categoryCount}>{cat.count} appels</Text>
                  </View>
                  <View style={styles.categoryBar}>
                    <View
                      style={[
                        styles.categoryBarFill,
                        {
                          width: `${Math.min((cat.count / (statistics.top_categories[0]?.count || 1)) * 100, 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Recent Blocked Calls */}
        <Text style={styles.sectionTitle}>Appels Récents Bloqués</Text>
        {recentCalls.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
            <Text style={styles.emptyText}>Aucun appel bloqué récemment</Text>
          </View>
        ) : (
          <View style={styles.callsList}>
            {recentCalls.map((call) => (
              <View key={call.id} style={styles.callItem}>
                <View style={styles.callIcon}>
                  <Ionicons name="call" size={20} color="#E91E63" />
                </View>
                <View style={styles.callInfo}>
                  <Text style={styles.callNumber}>{call.phone_number}</Text>
                  <Text style={styles.callCategory}>{call.category_name}</Text>
                </View>
                <Text style={styles.callTime}>{formatDate(call.blocked_at)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Check Number Modal */}
      <Modal
        visible={checkModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setCheckModalVisible(false);
          setCheckResult(null);
          setPhoneToCheck('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vérifier un numéro</Text>
              <TouchableOpacity
                onPress={() => {
                  setCheckModalVisible(false);
                  setCheckResult(null);
                  setPhoneToCheck('');
                }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="+33 6 XX XX XX XX"
              placeholderTextColor="#666"
              value={phoneToCheck}
              onChangeText={setPhoneToCheck}
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={styles.checkButton}
              onPress={checkNumber}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.checkButtonText}>Vérifier</Text>
              )}
            </TouchableOpacity>

            {checkResult && (
              <View
                style={[
                  styles.resultCard,
                  { backgroundColor: checkResult.is_spam ? '#F4433620' : '#4CAF5020' },
                ]}
              >
                <Ionicons
                  name={checkResult.is_spam ? 'warning' : 'checkmark-circle'}
                  size={32}
                  color={checkResult.is_spam ? '#F44336' : '#4CAF50'}
                />
                <Text
                  style={[
                    styles.resultText,
                    { color: checkResult.is_spam ? '#F44336' : '#4CAF50' },
                  ]}
                >
                  {checkResult.is_spam ? 'Numéro suspect !' : 'Numéro non répertorié'}
                </Text>
                {checkResult.is_spam && (
                  <>
                    <Text style={styles.resultCategory}>{checkResult.category}</Text>
                    <Text style={styles.resultReports}>
                      {checkResult.reports_count} signalements
                    </Text>
                  </>
                )}
              </View>
            )}
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
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  headerCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 180,
    height: 100,
    marginBottom: 12,
  },
  protectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF5020',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
    gap: 8,
  },
  protectionText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  spartanHelmet: {
    width: 28,
    height: 28,
    tintColor: '#4CAF50',
  },
  headerIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E91E6320',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  websiteLink: {
    fontSize: 12,
    color: '#E91E63',
    marginTop: 8,
    textDecorationLine: 'underline',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#E91E63',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  syncButton: {
    backgroundColor: '#2196F3',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  categoriesContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  categoryItem: {
    marginBottom: 16,
  },
  categoryInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryName: {
    color: '#fff',
    fontSize: 14,
  },
  categoryCount: {
    color: '#888',
    fontSize: 12,
  },
  categoryBar: {
    height: 6,
    backgroundColor: '#2a2a4e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: '100%',
    backgroundColor: '#E91E63',
    borderRadius: 3,
  },
  emptyState: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
  },
  callsList: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  callIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E91E6320',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  callInfo: {
    flex: 1,
  },
  callNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  callCategory: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  callTime: {
    color: '#666',
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  input: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  checkButton: {
    backgroundColor: '#E91E63',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  checkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 16,
  },
  resultText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
  },
  resultCategory: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
  },
  resultReports: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
});
