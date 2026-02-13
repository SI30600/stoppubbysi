import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface BlockedCall {
  id: string;
  phone_number: string;
  category_id: string | null;
  category_name: string;
  blocked_at: string;
  was_blocked: boolean;
  notes: string;
}

export default function HistoryScreen() {
  const [calls, setCalls] = useState<BlockedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/call-history?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setCalls(data);
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCalls();
  }, [fetchCalls]);

  const deleteCall = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/call-history/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCalls((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (error) {
      Alert.alert('Erreur', "Impossible de supprimer l'appel");
    }
  };

  const clearHistory = () => {
    Alert.alert(
      'Effacer l\'historique',
      'Voulez-vous vraiment effacer tout l\'historique ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Effacer',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/call-history`, {
                method: 'DELETE',
              });
              if (res.ok) {
                setCalls([]);
              }
            } catch (error) {
              Alert.alert('Erreur', "Impossible d'effacer l'historique");
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isToday) return `Aujourd'hui ${time}`;
    if (isYesterday) return `Hier ${time}`;

    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryColor = (categoryName: string) => {
    const colorMap: { [key: string]: string } = {
      'Démarchage Commercial': '#E91E63',
      'Énergie': '#FFC107',
      'Assurance': '#2196F3',
      'Téléphonie': '#9C27B0',
      'Immobilier': '#4CAF50',
      'Banque/Finance': '#FF9800',
      'Sondage': '#00BCD4',
      'Arnaque': '#F44336',
      'CPF/Formation': '#673AB7',
      'Rénovation': '#795548',
      'Autre': '#607D8B',
      'Inconnu': '#666',
    };
    return colorMap[categoryName] || '#E91E63';
  };

  const renderItem = ({ item }: { item: BlockedCall }) => (
    <View style={styles.callItem}>
      <View style={styles.callIconContainer}>
        <View style={[styles.callIcon, { backgroundColor: getCategoryColor(item.category_name) + '20' }]}>
          <Ionicons
            name="call"
            size={20}
            color={getCategoryColor(item.category_name)}
          />
        </View>
      </View>
      <View style={styles.callInfo}>
        <Text style={styles.callNumber}>{item.phone_number}</Text>
        <View style={styles.callMeta}>
          <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(item.category_name) + '20' }]}>
            <Text style={[styles.categoryBadgeText, { color: getCategoryColor(item.category_name) }]}>
              {item.category_name}
            </Text>
          </View>
        </View>
        {item.notes ? <Text style={styles.callNotes}>{item.notes}</Text> : null}
      </View>
      <View style={styles.callRight}>
        <Text style={styles.callTime}>{formatDate(item.blocked_at)}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            Alert.alert(
              'Supprimer',
              'Supprimer cet appel de l\'historique ?',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Supprimer',
                  style: 'destructive',
                  onPress: () => deleteCall(item.id),
                },
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={18} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E91E63" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header Actions */}
      {calls.length > 0 && (
        <View style={styles.headerActions}>
          <Text style={styles.totalText}>{calls.length} appels bloqués</Text>
          <TouchableOpacity style={styles.clearButton} onPress={clearHistory}>
            <Ionicons name="trash" size={16} color="#F44336" />
            <Text style={styles.clearButtonText}>Effacer tout</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Calls List */}
      <FlatList
        data={calls}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E91E63" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
            </View>
            <Text style={styles.emptyTitle}>Aucun appel bloqué</Text>
            <Text style={styles.emptyText}>
              Les appels bloqués apparaîtront ici
            </Text>
          </View>
        }
      />
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
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  totalText: {
    color: '#888',
    fontSize: 14,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F4433620',
    borderRadius: 8,
  },
  clearButtonText: {
    color: '#F44336',
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  callItem: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  callIconContainer: {
    marginRight: 12,
  },
  callIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callInfo: {
    flex: 1,
  },
  callNumber: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  callNotes: {
    color: '#666',
    fontSize: 12,
    marginTop: 6,
  },
  callRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  callTime: {
    color: '#666',
    fontSize: 11,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4CAF5020',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
});
