import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_call-filter-2/artifacts/qmcd8gr5_StopPubbySi.png';

const LOADING_MESSAGES = [
  'Chargement...',
  'Connexion au serveur...',
  'Récupération des données...',
  'Mise à jour de la protection...',
  'Presque prêt...',
];

interface LoadingScreenProps {
  progress?: number; // 0 to 100
}

export default function LoadingScreen({ progress }: LoadingScreenProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [messageIndex, setMessageIndex] = useState(0);

  // Fade in animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Progress bar animation
  useEffect(() => {
    if (progress !== undefined) {
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      // Auto-animate if no progress provided
      const animateProgress = () => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(progressAnim, {
              toValue: 90,
              duration: 3000,
              useNativeDriver: false,
            }),
            Animated.timing(progressAnim, {
              toValue: 30,
              duration: 0,
              useNativeDriver: false,
            }),
          ])
        ).start();
      };
      animateProgress();
    }
  }, [progress]);

  // Cycle through messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Image
          source={{ uri: LOGO_URL }}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* App Name */}
      <Text style={styles.appName}>StopPubbySi</Text>
      <Text style={styles.tagline}>Protection anti-démarchage</Text>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBackground}>
          <Animated.View
            style={[
              styles.progressBar,
              { width: progressWidth },
            ]}
          />
        </View>
      </View>

      {/* Loading Message */}
      <Text style={styles.message}>{LOADING_MESSAGES[messageIndex]}</Text>

      {/* Dots animation */}
      <View style={styles.dotsContainer}>
        {[0, 1, 2].map((i) => (
          <DotAnimation key={i} delay={i * 200} />
        ))}
      </View>
    </Animated.View>
  );
}

// Animated dot component
function DotAnimation({ delay }: { delay: number }) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.5,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.dot,
        { transform: [{ scale: scaleAnim }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#E91E63',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  logo: {
    width: 80,
    height: 80,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#888',
    marginBottom: 40,
  },
  progressContainer: {
    width: width - 80,
    marginBottom: 20,
  },
  progressBackground: {
    height: 6,
    backgroundColor: '#2a2a4e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E91E63',
    borderRadius: 3,
  },
  message: {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E91E63',
  },
});
