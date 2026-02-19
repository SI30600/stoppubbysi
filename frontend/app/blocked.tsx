import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface SpamNumber {
  id: string;
  phone_number: string;
  category_id: string;
  category_name: string;
  source: string;
  reports_count: number;
  description: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  is_custom: boolean;
}

export default function BlockedScreen() {
  const [spamNumbers, setSpamNumbers] = useState<SpamNumber[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newNumberCategory, setNewNumberCategory] = useState('');
  const [newNumberDescription, setNewNumberDescription] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#E91E63');
  const [adding, setAdding] = useState(false);

  const colors = ['#E91E63', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#F44336', '#795548'];

  const fetchData = useCallback(async () => {
    try {
      let url = `${API_URL}/api/spam-numbers`;
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category_id', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);
      if (params.toString()) url += `?${params.toString()}`;

      const [numbersRes, catsRes] = await Promise.all([
        fetch(url),
        fetch(`${API_URL}/api/categories`),
      ]);

      if (numbersRes.ok) {
        const numbersData = await numbersRes.json();
        setSpamNumbers(numbersData);
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
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const addNumber = async () => {
    if (!newNumber.trim() || !newNumberCategory) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`${API_URL}/api/spam-numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: newNumber,
          category_id: newNumberCategory,
          description: newNumberDescription,
        }),
      });
      if (res.ok) {
        Alert.alert('Succès', 'Numéro ajouté à la liste');
        setAddModalVisible(false);
        setNewNumber('');
        setNewNumberCategory('');
        setNewNumberDescription('');
        fetchData();
      } else {
        Alert.alert('Erreur', "Impossible d'ajouter le numéro");
      }
    } catch (error) {
      Alert.alert('Erreur', "Impossible d'ajouter le numéro");
    } finally {
      setAdding(false);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom de catégorie');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`${API_URL}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName,
          description: newCategoryDescription,
          color: newCategoryColor,
        }),
      });
      if (res.ok) {
        Alert.alert('Succès', 'Catégorie créée');
        setCategoryModalVisible(false);
        setNewCategoryName('');
        setNewCategoryDescription('');
        fetchData();
      } else {
        Alert.alert('Erreur', 'Impossible de créer la catégorie');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de créer la catégorie');
    } finally {
      setAdding(false);
    }
  };

  const removeNumber = async (id: string) => {
    Alert.alert(
      'Débloquer',
      'Voulez-vous vraiment débloquer ce numéro ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/spam-numbers/${id}`, {
                method: 'DELETE',
              });
              if (res.ok) {
                fetchData();
              }
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de débloquer le numéro');
            }
          },
        },
      ]
    );
  };

  const getCategoryColor = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.color || '#E91E63';
  };

  const renderItem = ({ item }: { item: SpamNumber }) => (
    <View style={styles.numberItem}>
      <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(item.category_id) }]} />
      <View style={styles.numberInfo}>
        <Text style={styles.numberText}>{item.phone_number}</Text>
        <Text style={styles.categoryText}>{item.category_name}</Text>
        {item.description ? <Text style={styles.descriptionText}>{item.description}</Text> : null}
      </View>
      <View style={styles.numberMeta}>
        <View style={styles.reportsContainer}>
          <Ionicons name="flag" size={12} color="#888" />
          <Text style={styles.reportsText}>{item.reports_count}</Text>
        </View>
        <TouchableOpacity style={styles.removeButton} onPress={() => removeNumber(item.id)}>
          <Ionicons name="close-circle" size={24} color="#F44336" />
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
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un numéro..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryFilter}
        contentContainerStyle={styles.categoryFilterContent}
      >
        <TouchableOpacity
          style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>
            Tous
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryChip,
              selectedCategory === cat.id && styles.categoryChipActive,
              selectedCategory === cat.id && { backgroundColor: cat.color },
            ]}
            onPress={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
          >
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === cat.id && styles.categoryChipTextActive,
              ]}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.addCategoryChip}
          onPress={() => setCategoryModalVisible(true)}
        >
          <Ionicons name="add" size={16} color="#E91E63" />
        </TouchableOpacity>
      </ScrollView>

      {/* Numbers List */}
      <FlatList
        data={spamNumbers}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E91E63" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search" size={48} color="#444" />
            <Text style={styles.emptyText}>Aucun numéro trouvé</Text>
          </View>
        }
      />

      {/* Add Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setAddModalVisible(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Number Modal */}
      <Modal visible={addModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un numéro</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Numéro de téléphone *"
              placeholderTextColor="#666"
              value={newNumber}
              onChangeText={setNewNumber}
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>Catégorie *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categorySelect}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryOption,
                    newNumberCategory === cat.id && { backgroundColor: cat.color },
                  ]}
                  onPress={() => setNewNumberCategory(cat.id)}
                >
                  <Text
                    style={[
                      styles.categoryOptionText,
                      newNumberCategory === cat.id && { color: '#fff' },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description (optionnel)"
              placeholderTextColor="#666"
              value={newNumberDescription}
              onChangeText={setNewNumberDescription}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity style={styles.submitButton} onPress={addNumber} disabled={adding}>
              {adding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Ajouter</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Category Modal */}
      <Modal visible={categoryModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle catégorie</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Nom de la catégorie *"
              placeholderTextColor="#666"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description (optionnel)"
              placeholderTextColor="#666"
              value={newCategoryDescription}
              onChangeText={setNewCategoryDescription}
              multiline
              numberOfLines={2}
            />

            <Text style={styles.inputLabel}>Couleur</Text>
            <View style={styles.colorPicker}>
              {colors.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    newCategoryColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setNewCategoryColor(color)}
                >
                  {newCategoryColor === color && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={addCategory} disabled={adding}>
              {adding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Créer</Text>
              )}
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
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    padding: 14,
    fontSize: 16,
  },
  categoryFilter: {
    maxHeight: 50,
  },
  categoryFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#E91E63',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 13,
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  addCategoryChip: {
    backgroundColor: '#1a1a2e',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E91E63',
    borderStyle: 'dashed',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  numberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  categoryDot: {
    width: 8,
    height: '100%',
    minHeight: 40,
    borderRadius: 4,
    marginRight: 12,
  },
  numberInfo: {
    flex: 1,
  },
  numberText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryText: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  descriptionText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  numberMeta: {
    alignItems: 'flex-end',
  },
  reportsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  reportsText: {
    color: '#888',
    fontSize: 12,
  },
  removeButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#666',
    marginTop: 12,
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#E91E63',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000,
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
    maxHeight: '80%',
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
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  categorySelect: {
    marginBottom: 16,
    maxHeight: 50,
  },
  categoryOption: {
    backgroundColor: '#2a2a4e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryOptionText: {
    color: '#888',
    fontSize: 13,
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  submitButton: {
    backgroundColor: '#E91E63',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
