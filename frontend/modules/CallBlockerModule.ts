import { NativeModules, Platform } from 'react-native';

const { CallBlockerModule } = NativeModules;

export interface CallBlockerSettings {
  auto_block_spam: boolean;
  block_unknown_numbers: boolean;
  ai_screening_enabled: boolean;
  ai_screening_delay: number;
}

export interface BlockedCallHistoryItem {
  phone_number: string;
  blocked_at: number;
  reason?: string;
}

export interface PendingScreening {
  phone_number: string;
  timestamp: number;
  status: string;
}

/**
 * Interface for the native CallBlocker module
 * This module handles background call blocking on Android using CallScreeningService
 */
const CallBlocker = {
  /**
   * Check if the app is set as the default call screening service
   */
  isCallScreeningServiceEnabled: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.isCallScreeningServiceEnabled();
    } catch (error) {
      console.error('Error checking call screening service:', error);
      return false;
    }
  },

  /**
   * Request the user to set this app as the default call screening app
   * This will open Android's system dialog
   */
  requestCallScreeningRole: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.requestCallScreeningRole();
    } catch (error) {
      console.error('Error requesting call screening role:', error);
      return false;
    }
  },

  /**
   * Update the list of blocked phone numbers in native storage
   * These numbers will be blocked even when the app is closed
   */
  updateBlockedNumbers: async (numbers: string[]): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.updateBlockedNumbers(numbers);
    } catch (error) {
      console.error('Error updating blocked numbers:', error);
      return false;
    }
  },

  /**
   * Enable or disable automatic spam blocking
   */
  setAutoBlockEnabled: async (enabled: boolean): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.setAutoBlockEnabled(enabled);
    } catch (error) {
      console.error('Error setting auto block:', error);
      return false;
    }
  },

  /**
   * Enable or disable blocking of unknown numbers (not in contacts)
   */
  setBlockUnknownNumbers: async (enabled: boolean): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.setBlockUnknownNumbers(enabled);
    } catch (error) {
      console.error('Error setting block unknown:', error);
      return false;
    }
  },

  // AI Screening methods

  /**
   * Enable or disable AI call screening
   */
  setAIScreeningEnabled: async (enabled: boolean): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.setAIScreeningEnabled(enabled);
    } catch (error) {
      console.error('Error setting AI screening:', error);
      return false;
    }
  },

  /**
   * Check if AI screening is enabled
   */
  isAIScreeningEnabled: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.isAIScreeningEnabled();
    } catch (error) {
      console.error('Error checking AI screening status:', error);
      return false;
    }
  },

  /**
   * Set the delay before AI screening activates (in seconds)
   */
  setAIScreeningDelay: async (delaySeconds: number): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.setAIScreeningDelay(delaySeconds);
    } catch (error) {
      console.error('Error setting AI screening delay:', error);
      return false;
    }
  },

  /**
   * Get the AI screening delay setting
   */
  getAIScreeningDelay: async (): Promise<number> => {
    if (Platform.OS !== 'android') {
      return 3;
    }
    try {
      return await CallBlockerModule.getAIScreeningDelay();
    } catch (error) {
      console.error('Error getting AI screening delay:', error);
      return 3;
    }
  },

  /**
   * Get pending AI screenings
   */
  getPendingScreenings: async (): Promise<PendingScreening[]> => {
    if (Platform.OS !== 'android') {
      return [];
    }
    try {
      return await CallBlockerModule.getPendingScreenings();
    } catch (error) {
      console.error('Error getting pending screenings:', error);
      return [];
    }
  },

  /**
   * Clear pending AI screenings
   */
  clearPendingScreenings: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.clearPendingScreenings();
    } catch (error) {
      console.error('Error clearing pending screenings:', error);
      return false;
    }
  },

  /**
   * Get the history of calls blocked by the native service
   */
  getBlockedCallHistory: async (): Promise<BlockedCallHistoryItem[]> => {
    if (Platform.OS !== 'android') {
      return [];
    }
    try {
      return await CallBlockerModule.getBlockedCallHistory();
    } catch (error) {
      console.error('Error getting blocked call history:', error);
      return [];
    }
  },

  /**
   * Clear the native blocked call history
   */
  clearBlockedCallHistory: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    try {
      return await CallBlockerModule.clearBlockedCallHistory();
    } catch (error) {
      console.error('Error clearing blocked call history:', error);
      return false;
    }
  },

  /**
   * Get current settings from native storage
   */
  getSettings: async (): Promise<CallBlockerSettings | null> => {
    if (Platform.OS !== 'android') {
      return null;
    }
    try {
      return await CallBlockerModule.getSettings();
    } catch (error) {
      console.error('Error getting settings:', error);
      return null;
    }
  },

  /**
   * Check if the platform supports background call blocking
   */
  isSupported: (): boolean => {
    return Platform.OS === 'android';
  },
};

export default CallBlocker;
