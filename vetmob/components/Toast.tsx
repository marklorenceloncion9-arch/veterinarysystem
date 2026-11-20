import { useState, useEffect, useCallback } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

interface ToastOptions {
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

let toastInstance: {
  show: (options: ToastOptions) => void;
  hide: () => void;
} | null = null;

// Diri ipakita ang toast message.
export const showToast = (options: ToastOptions) => {
  toastInstance?.show(options);
};

// Diri tagoon ang toast message.
export const hideToast = () => {
  toastInstance?.hide();
};

// Diri ang provider sa toast sa tibuok app.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { topInset } = useResponsiveLayout();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'success' | 'error' | 'info'>('info');
  const translateY = new Animated.Value(-100);
  const opacity = new Animated.Value(0);

  // Diri ipakita ang toast uban ang animation.
  const show = useCallback((options: ToastOptions) => {
    setMessage(options.message);
    setType(options.type);
    setVisible(true);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto hide
    setTimeout(() => {
      hide();
    }, options.duration || 3000);
  }, []);

  // Diri tagoon ang toast uban ang animation.
  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
    });
  }, []);

  useEffect(() => {
    toastInstance = { show, hide };
    return () => {
      toastInstance = null;
    };
  }, [show, hide]);

  // Diri pilion ang icon base sa klase sa toast.
  const getIconName = () => {
    switch (type) {
      case 'success': return 'check-circle';
      case 'error': return 'error';
      case 'info': return 'info';
    }
  };

  // Diri pilion ang kolor sa icon sa toast.
  const getIconColor = () => {
    switch (type) {
      case 'success': return '#16a34a';
      case 'error': return '#dc2626';
      case 'info': return '#1F7A8C';
    }
  };

  // Diri pilion ang background sa toast.
  const getBackgroundColor = () => {
    switch (type) {
      case 'success': return '#dcfce7';
      case 'error': return '#fee2e2';
      case 'info': return '#D6EAEF';
    }
  };

  // Diri pilion ang kolor sa text sa toast.
  const getTextColor = () => {
    switch (type) {
      case 'success': return '#166534';
      case 'error': return '#991b1b';
      case 'info': return '#16324F';
    }
  };

  if (!visible) return <>{children}</>;

  return (
    <>
      {children}
      <Animated.View
        style={[
          styles.container,
          {
            top: topInset + 8,
            transform: [{ translateY }],
            opacity,
            backgroundColor: getBackgroundColor(),
          },
        ]}
      >
        <View style={styles.content}>
          <MaterialIcons name={getIconName()} size={24} color={getIconColor()} />
          <Text style={[styles.message, { color: getTextColor() }]}>{message}</Text>
          <TouchableOpacity onPress={hide} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={getTextColor()} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    marginHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
});
