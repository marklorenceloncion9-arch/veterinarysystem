import { useEffect, useState, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Animated,
  Text,
  Image,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/auth-context';
import { getHomeRoute } from '@/utils/auth-routing';
import { showToast } from '@/components/Toast';

const OTP_EXPIRY_SECONDS = 600;

// Diri i-format ang countdown sa OTP nga mm:ss.
function formatOtpCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Diri ang login screen sa app.
export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  // Walk-in account claim states
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimPassword, setClaimPassword] = useState('');
  const [claimPasswordConfirmation, setClaimPasswordConfirmation] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimErrors, setClaimErrors] = useState<{ password?: string; password_confirmation?: string }>({});
  
  // Forgot password states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState(1); // 1: email, 2: OTP, 3: new password
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotErrors, setForgotErrors] = useState<{ email?: string; otp?: string; password?: string; confirmPassword?: string }>({});
  const [showOtpSuccess, setShowOtpSuccess] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);

  useEffect(() => {
    if (!showForgotModal || forgotStep < 2) return undefined;
    const timer = setInterval(() => {
      setOtpExpiresIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [showForgotModal, forgotStep]);

  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (!showForgotModal || forgotStep !== 2) return undefined;
    const focusTimer = setTimeout(() => otpRefs.current[0]?.focus(), 250);
    return () => clearTimeout(focusTimer);
  }, [showForgotModal, forgotStep]);

  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  // Diri uyugon ang form kung naay sayop.
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  // Diri susihon kung sakto ang email.
  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
    return undefined;
  };

  // Diri susihon kung sakto ang password sa login.
  const validatePassword = (value: string): string | undefined => {
    if (!value) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return undefined;
  };

  // Diri susihon ang password sa pag-claim sa account.
  const validateClaimPassword = (value: string): string | undefined => {
    if (!value) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    return undefined;
  };

  // Diri i-validate ang tibuok login form.
  const validateForm = () => {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    const newErrors: { email?: string; password?: string } = {};
    if (emailError) newErrors.email = emailError;
    if (passwordError) newErrors.password = passwordError;

    setErrors(newErrors);

    if (emailError || passwordError) {
      shake();
      return false;
    }
    return true;
  };

  // Diri ipakita ang sayop nga email o password sa field.
  const credentialMessage = (raw: string) => {
    const text = raw.toLowerCase();
    const mentionsPassword = text.includes('password');
    const mentionsEmail = text.includes('email') || text.includes('user not found') || text.includes('account not found');
    if (mentionsEmail && mentionsPassword) {
      setErrors({ email: 'Incorrect email', password: 'Incorrect password' });
      shake();
      return 'Incorrect email or password';
    }
    if (mentionsPassword) {
      setErrors({ password: 'Incorrect password' });
      shake();
      return 'Incorrect password';
    }
    if (mentionsEmail) {
      setErrors({ email: 'Incorrect email' });
      shake();
      return 'Incorrect email';
    }
    if (/invalid|credentials|unauthorized/.test(text)) {
      setErrors({ email: 'Incorrect email', password: 'Incorrect password' });
      shake();
      return 'Incorrect email or password';
    }
    return raw;
  };

  // Diri mo-login ang user gamit ang email ug password.
  const handleLogin = async () => {
    if (!validateForm()) return;

    setLoading(true);
    let signedIn = false;
    console.log('Attempting login to:', `${API_BASE_URL}/api/mobile/login`);
    console.log('Login credentials:', { email, password: '***' }); // Log email only for security
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/mobile/login`,
        {
          email: email.trim().toLowerCase(),
          password,
        },
        { timeout: 15000 }
      );

      console.log('Login response:', response.data);

      if (response.data.success) {
        signedIn = true;
        showToast({ type: 'success', message: 'Login successful!' });
        // Store token and user data using auth context
        console.log('Login API success, calling auth context login...');
        await login(response.data.token, response.data.user);
        console.log('Auth context login completed, navigating to home...');
        router.replace(getHomeRoute(response.data.user));
      } else {
        const message = credentialMessage(response.data.error || 'Login failed');
        showToast({ type: 'error', message });
      }
    } catch (error: any) {
      console.error('Login error:', error);
      console.error('Error response data:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      if (error.response?.data?.approval_rejected) {
        setLoading(false);
        Alert.alert(
          'Registration Not Approved',
          error.response?.data?.error || 'The account you created did not match the photo you provided. Please register again with correct information and a matching ID or residence document.',
        );
        return;
      }

      // Check if this is a walk-in client who needs to use forgot password
      if (error.response?.data?.walk_in_forgot_password_required) {
        setLoading(false);
        const walkInEmail = error.response?.data?.user?.email || email;
        // Show alert explaining the situation, then redirect to forgot password
        Alert.alert(
          'Walk-in Client Account',
          'Your account was created at the clinic. Please use Forgot Password to set up your password.',
          [
            {
              text: 'Go to Forgot Password',
              onPress: () => {
                const normalized = walkInEmail.trim().toLowerCase();
                setForgotEmail(normalized);
                setShowForgotModal(true);
                // Auto-send OTP for convenience
                setTimeout(() => {
                  handleSendOtpForWalkIn(normalized);
                }, 500);
              }
            }
          ]
        );
        return;
      }
      
      let message = 'Login failed. Please try again.';
      const responseError = error.response?.data?.error;
      if (error.code === 'ECONNABORTED') {
        message = 'Server timed out. Check that Laragon is running and update COMPUTER_IP in config/api.ts to your PC\'s current Wi‑Fi IP.';
      } else if (error.message === 'Network Error') {
        message = 'Cannot reach the server. Make sure your phone and PC are on the same Wi‑Fi and Laragon is running.';
      } else if (responseError) {
        message = credentialMessage(responseError);
        if (error.response.data.debug) {
          console.log('Debug info:', error.response.data.debug);
        }
      } else if (error.response?.status === 401) {
        message = credentialMessage('Incorrect email or password');
      } else if (error.message) {
        message = error.message;
      }
      
      showToast({ type: 'error', message });
    } finally {
      if (!signedIn) setLoading(false);
    }
  };

  // Handle walk-in account password setup
  // Diri i-claim ang walk-in account ug butangan og password.
  const handleClaimAccount = async () => {
    const passwordError = validateClaimPassword(claimPassword);
    const confirmationError = claimPassword !== claimPasswordConfirmation 
      ? 'Passwords do not match' 
      : undefined;

    const newErrors: { password?: string; password_confirmation?: string } = {};
    if (passwordError) newErrors.password = passwordError;
    if (confirmationError) newErrors.password_confirmation = confirmationError;

    setClaimErrors(newErrors);

    if (passwordError || confirmationError) {
      shake();
      return;
    }

    setClaimLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/mobile/claim-account`, {
        email,
        password: claimPassword,
        password_confirmation: claimPasswordConfirmation,
      });

      if (response.data.success) {
        showToast({ type: 'success', message: 'Your account has been set up! You can now log in with your new password.' });
        setShowClaimModal(false);
        setClaimPassword('');
        setClaimPasswordConfirmation('');
        setPassword(claimPassword); // Pre-fill for convenience
      } else {
        showToast({ type: 'error', message: response.data.error || 'Failed to set up account' });
      }
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Failed to set up account. Please try again.';
      showToast({ type: 'error', message });
    } finally {
      setClaimLoading(false);
    }
  };

  // Diri kuhaon ang error message gikan sa forgot password API.
  const forgotApiError = (error: any, fallback: string) => {
    const data = error?.response?.data;
    const messages = data?.messages;
    if (messages && typeof messages === 'object') {
      const first = Object.values(messages)
        .flat()
        .find((item) => typeof item === 'string' && item);
      if (typeof first === 'string') return first;
    }
    return data?.error || data?.message || error?.message || fallback;
  };

  // Forgot Password Functions
  // Diri ipadala ang OTP sa email para sa forgot password.
  const handleSendOtp = async () => {
    if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      setForgotErrors({ email: 'Please enter a valid email' });
      shake();
      return;
    }

    await sendOtpWithEmail(forgotEmail);
  };

  // Diri ipadala ang OTP para sa walk-in nga account.
  const handleSendOtpForWalkIn = async (email: string) => {
    await sendOtpWithEmail(email);
  };

  // Diri ang tinuod nga pagpadala sa OTP sa email.
  const sendOtpWithEmail = async (emailToUse: string) => {
    setForgotLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/mobile/send-otp`, {
        email: emailToUse.trim().toLowerCase(),
        purpose: 'password_reset',
      });

      if (response.data.success) {
        if (response.data.otp) {
          // Email failed, show OTP for testing
          Alert.alert('OTP Generated', `Your OTP is: ${response.data.otp}\n\n(Email failed: ${response.data.email_error || 'Check config'})`);
        } else {
          // Email sent successfully
          Alert.alert('OTP Sent', 'Check your email for the OTP code.');
        }
        setOtpExpiresIn(response.data.expires_in || OTP_EXPIRY_SECONDS);
        setForgotStep(2);
        setForgotErrors({});
      } else {
        Alert.alert('Error', response.data.error || 'Failed to send OTP');
      }
    } catch (error: any) {
      Alert.alert('Error', forgotApiError(error, 'Failed to send OTP'));
    } finally {
      setForgotLoading(false);
    }
  };

  // Diri dawaton ang matag digit sa OTP input.
  const handleOtpDigit = (index: number, text: string) => {
    const digits = text.replace(/\D/g, '');
    if (!digits) {
      setForgotOtp(forgotOtp.slice(0, index) + forgotOtp.slice(index + 1));
      return;
    }

    if (digits.length > 1) {
      const next = (forgotOtp.slice(0, index) + digits).replace(/\D/g, '').slice(0, 6);
      setForgotOtp(next);
      otpRefs.current[Math.min(next.length, 5)]?.focus();
      return;
    }

    const next = (forgotOtp.slice(0, index) + digits + forgotOtp.slice(index + 1)).slice(0, 6);
    setForgotOtp(next);
    if (index < 5) otpRefs.current[index + 1]?.focus();
  };

  // Diri i-verify ang OTP nga gi-type sa user.
  const handleVerifyOtp = async () => {
    if (otpExpiresIn <= 0) {
      setForgotErrors({ otp: 'This code has expired. Please resend a new one.' });
      shake();
      return;
    }

    if (!forgotOtp || forgotOtp.length !== 6) {
      setForgotErrors({ otp: 'Please enter the 6-digit OTP' });
      shake();
      return;
    }

    setForgotLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/mobile/verify-otp`, {
        email: forgotEmail.trim().toLowerCase(),
        code: forgotOtp,
        purpose: 'password_reset',
      });

      if (response.data.success) {
        setForgotErrors({});
        setShowOtpSuccess(true);
        setTimeout(() => {
          setShowOtpSuccess(false);
          setForgotStep(3);
        }, 2000);
      } else {
        Alert.alert('Error', response.data.error || 'Invalid OTP');
      }
    } catch (error: any) {
      Alert.alert('Error', forgotApiError(error, 'Failed to verify OTP'));
    } finally {
      setForgotLoading(false);
    }
  };

  // Diri i-reset ang password human ma-verify ang OTP.
  const handleResetPassword = async () => {
    const errors: { password?: string; confirmPassword?: string } = {};
    if (!forgotNewPassword || forgotNewPassword.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setForgotErrors(errors);
      shake();
      return;
    }

    setForgotLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/mobile/reset-password-otp`, {
        email: forgotEmail.trim().toLowerCase(),
        code: forgotOtp,
        password: forgotNewPassword,
        password_confirmation: forgotConfirmPassword,
      });

      if (response.data.success) {
        Alert.alert(
          'Success',
          'Password reset successfully! You can now log in with your new password.',
          [
            {
              text: 'OK',
              onPress: () => {
                setShowForgotModal(false);
                setForgotStep(1);
                setForgotEmail('');
                setForgotOtp('');
                setForgotNewPassword('');
                setForgotConfirmPassword('');
                setPassword(forgotNewPassword); // Pre-fill for convenience
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', response.data.error || 'Failed to reset password');
      }
    } catch (error: any) {
      Alert.alert('Error', forgotApiError(error, 'Failed to reset password'));
    } finally {
      setForgotLoading(false);
    }
  };

  // Diri isira ug limpyohan ang forgot password form.
  const resetForgotForm = () => {
    setShowForgotModal(false);
    setForgotStep(1);
    setForgotEmail('');
    setForgotOtp('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotErrors({});
    setOtpExpiresIn(0);
  };

  // Diri pilion ang border style sa input field.
  const inputBorder = (field: 'email' | 'password', hasError: boolean) => {
    if (hasError) return styles.inputError;
    if (focusedField === field) return styles.inputFocused;
    return styles.inputDefault;
  };

  // Diri ipakita ang mga step sa forgot password.
  const ForgotStepIndicator = () => {
    const steps = ['Email', 'Verify', 'Password'];
    return (
      <View style={styles.forgotSteps}>
        {steps.map((label, index) => {
          const stepNum = index + 1;
          const active = forgotStep === stepNum;
          const done = forgotStep > stepNum;
          return (
            <View key={label} style={styles.forgotStepWrap}>
              <View style={styles.forgotStepBlock}>
                <View style={[styles.forgotStepBadge, (active || done) && styles.forgotStepBadgeActive]}>
                  {done ? (
                    <MaterialIcons name="check" size={14} color="#ffffff" />
                  ) : (
                    <Text style={[styles.forgotStepNum, (active || done) && styles.forgotStepNumActive]}>{stepNum}</Text>
                  )}
                </View>
                <Text style={[styles.forgotStepLabel, active && styles.forgotStepLabelActive]}>{label}</Text>
              </View>
              {index < steps.length - 1 && (
                <View style={[styles.forgotStepLine, done && styles.forgotStepLineActive]} />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // Diri ang wrapper sa forgot password modal.
  const ForgotModalShell = ({
    children,
    onClose,
  }: {
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.forgotOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.forgotBackdrop} />
        <View style={styles.forgotCenterWrap}>
          <View style={styles.forgotSheet}>
            <View style={styles.forgotSheetHeader}>
              <View style={styles.forgotSheetTitleRow}>
                <View style={styles.forgotSheetIcon}>
                  <MaterialIcons name="lock-reset" size={22} color="#1F7A8C" />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.forgotSheetTitle}>Reset Password</Text>
                  <Text style={styles.forgotSheetSubtitle}>
                    {forgotStep === 1
                      ? 'Enter your email to get a verification code'
                      : forgotStep === 2
                        ? 'Enter the 6-digit code from your email'
                        : 'Choose a new password for your account'}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.forgotCloseBtn}>
                  <MaterialIcons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
              {ForgotStepIndicator()}
            </View>
            <View style={styles.forgotSheetBody}>{children}</View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // Diri ang wrapper sa kasagarang modal sa login.
  const ModalShell = ({
    icon,
    title,
    subtitle,
    children,
    onClose,
  }: {
    icon: keyof typeof MaterialIcons.glyphMap;
    title: string;
    subtitle: string;
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <Pressable style={styles.modalOverlay} onPress={onClose}>
      <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
        <TouchableOpacity style={styles.modalClose} onPress={onClose} hitSlop={12}>
          <MaterialIcons name="close" size={22} color="#64748b" />
        </TouchableOpacity>
        <View style={styles.modalIconWrap}>
          <MaterialIcons name={icon} size={26} color="#1F7A8C" />
        </View>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalSubtitle}>{subtitle}</Text>
        {children}
      </Pressable>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
            <View style={styles.brandBlock}>
              <View style={styles.logoWrap}>
                <View style={styles.logoBox}>
                  <Image
                    source={require('../../assets/images/elsalvet-logo.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
              <Text style={styles.brandKicker} maxFontSizeMultiplier={1.2}>ALAGANG ELSALVET</Text>
              <Text style={styles.brandTitle} maxFontSizeMultiplier={1.15}>Welcome back</Text>
              <Text style={styles.brandSubtitle} maxFontSizeMultiplier={1.2}>
                Alaga mo, Atiman Ko!
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sheetGreeting} maxFontSizeMultiplier={1.2}>
                Sign in
              </Text>
              <Text style={styles.sheetSubGreeting} maxFontSizeMultiplier={1.2}>
                Use the email you registered with
              </Text>

              {/* Email */}
              <Animated.View style={{ transform: [{ translateX: errors.email ? shakeAnimation : 0 }] }}>
                <Text style={styles.label}>Email Address</Text>
                <Pressable
                  style={[styles.inputWrap, inputBorder('email', !!errors.email)]}
                  onPress={() => emailRef.current?.focus()}
                >
                  <View style={[styles.inputIconBox, focusedField === 'email' && styles.inputIconBoxActive, errors.email && styles.inputIconBoxError]} pointerEvents="none">
                    <MaterialIcons name="email" size={18} color={errors.email ? '#ef4444' : focusedField === 'email' ? '#1F7A8C' : '#475569'} />
                  </View>
                  <TextInput
                    ref={emailRef}
                    style={styles.input}
                    placeholder="Enter your email"
                    placeholderTextColor="#64748b"
                    selectionColor="#1F7A8C"
                    cursorColor="#1F7A8C"
                    underlineColorAndroid="transparent"
                    keyboardAppearance="light"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errors.email) setErrors({ ...errors, email: validateEmail(text) });
                    }}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => {
                      setFocusedField((prev) => (prev === 'email' ? null : prev));
                      setErrors({ ...errors, email: validateEmail(email) });
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    editable={!loading}
                    maxFontSizeMultiplier={1.2}
                  />
                  {email.length > 0 && !errors.email && (
                    <MaterialIcons name="check-circle" size={18} color="#16a34a" />
                  )}
                </Pressable>
                {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
              </Animated.View>

              {/* Password */}
              <Animated.View style={[styles.fieldGroup, { transform: [{ translateX: errors.password ? shakeAnimation : 0 }] }]}>
                <Text style={styles.label}>Password</Text>
                <Pressable
                  style={[styles.inputWrap, inputBorder('password', !!errors.password)]}
                  onPress={() => passwordRef.current?.focus()}
                >
                  <View style={[styles.inputIconBox, focusedField === 'password' && styles.inputIconBoxActive, errors.password && styles.inputIconBoxError]} pointerEvents="none">
                    <MaterialIcons name="lock" size={18} color={errors.password ? '#ef4444' : focusedField === 'password' ? '#1F7A8C' : '#475569'} />
                  </View>
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#64748b"
                    selectionColor="#1F7A8C"
                    cursorColor="#1F7A8C"
                    underlineColorAndroid="transparent"
                    keyboardAppearance="light"
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (errors.password) setErrors({ ...errors, password: validatePassword(text) });
                    }}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => {
                      setFocusedField((prev) => (prev === 'password' ? null : prev));
                      setErrors({ ...errors, password: validatePassword(password) });
                    }}
                    secureTextEntry={!showPassword}
                    autoComplete={Platform.OS === 'android' ? 'password' : 'password'}
                    textContentType="password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    editable={!loading}
                    maxFontSizeMultiplier={1.2}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} disabled={loading} hitSlop={8}>
                    <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color="#475569" />
                  </TouchableOpacity>
                </Pressable>
                {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
              </Animated.View>

              <TouchableOpacity
                style={styles.forgotBtn}
                disabled={loading}
                onPress={() => {
                  setForgotEmail(email.trim().toLowerCase());
                  setShowForgotModal(true);
                }}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.signInBtn, (loading || authLoading) && styles.signInBtnDisabled]}
                onPress={handleLogin}
                disabled={loading || authLoading}
                activeOpacity={0.88}
              >
                <View style={styles.signInInner}>
                  {loading || authLoading ? (
                    <>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.signInText}>Signing in...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.signInText}>Sign In</Text>
                      <View style={styles.signInArrow}>
                        <MaterialIcons name="arrow-forward" size={18} color="#1F7A8C" />
                      </View>
                    </>
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Don't have an account?</Text>
                <TouchableOpacity
                  style={styles.footerBtn}
                  onPress={() => !loading && router.push('/(auth)/register')}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.footerLink}>Create account</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Claim Account Modal */}
      {showClaimModal && (
        <ModalShell
          icon="person-add"
          title="Set Up Your Account"
          subtitle="You were registered as a walk-in client. Set your password to get started."
          onClose={() => {
            setShowClaimModal(false);
            setClaimPassword('');
            setClaimPasswordConfirmation('');
            setClaimErrors({});
          }}
        >
          <View style={styles.modalField}>
            <Text style={styles.modalLabel}>New Password</Text>
            <View style={[styles.modalInput, claimErrors.password && styles.inputError]}>
              <MaterialIcons name="lock" size={20} color={claimErrors.password ? '#ef4444' : '#64748b'} />
              <TextInput
                style={styles.modalInputText}
                placeholder="Min. 8 characters"
                placeholderTextColor="#64748b"
                selectionColor="#1F7A8C"
                underlineColorAndroid="transparent"
                keyboardAppearance="light"
                value={claimPassword}
                onChangeText={setClaimPassword}
                secureTextEntry
                editable={!claimLoading}
              />
            </View>
            {claimErrors.password && <Text style={styles.modalError}>{claimErrors.password}</Text>}
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalLabel}>Confirm Password</Text>
            <View style={[styles.modalInput, claimErrors.password_confirmation && styles.inputError]}>
              <MaterialIcons name="lock" size={20} color={claimErrors.password_confirmation ? '#ef4444' : '#64748b'} />
              <TextInput
                style={styles.modalInputText}
                placeholder="Re-enter password"
                placeholderTextColor="#64748b"
                selectionColor="#1F7A8C"
                underlineColorAndroid="transparent"
                keyboardAppearance="light"
                value={claimPasswordConfirmation}
                onChangeText={setClaimPasswordConfirmation}
                secureTextEntry
                editable={!claimLoading}
              />
            </View>
            {claimErrors.password_confirmation && (
              <Text style={styles.modalError}>{claimErrors.password_confirmation}</Text>
            )}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalBtnOutline}
              onPress={() => {
                setShowClaimModal(false);
                setClaimPassword('');
                setClaimPasswordConfirmation('');
                setClaimErrors({});
              }}
              disabled={claimLoading}
            >
              <Text style={styles.modalBtnOutlineText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleClaimAccount} disabled={claimLoading}>
              {claimLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.modalBtnPrimaryText}>Set Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </ModalShell>
      )}

      {/* Forgot Password Modal */}
      {showForgotModal && ForgotModalShell({
        onClose: resetForgotForm,
        children: (
        <>
          {forgotStep === 1 && (
            <>
              <Text style={styles.forgotFieldLabel}>Email Address</Text>
              <View style={[styles.forgotInput, forgotErrors.email && styles.inputError]}>
                <MaterialIcons name="email" size={20} color={forgotErrors.email ? '#ef4444' : '#64748b'} />
                <TextInput
                  style={styles.forgotInputText}
                  placeholder="you@example.com"
                  placeholderTextColor="#64748b"
                selectionColor="#1F7A8C"
                underlineColorAndroid="transparent"
                keyboardAppearance="light"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!forgotLoading}
                />
              </View>
              {forgotErrors.email ? <Text style={styles.fieldError}>{forgotErrors.email}</Text> : null}

              <View style={styles.forgotActions}>
                <TouchableOpacity style={styles.forgotBtnSecondary} onPress={resetForgotForm} disabled={forgotLoading}>
                  <Text style={styles.forgotBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.forgotBtnPrimary} onPress={handleSendOtp} disabled={forgotLoading}>
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.forgotBtnPrimaryText}>Send Code</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {forgotStep === 2 && (
            <>
              {showOtpSuccess && (
                <View style={styles.otpSuccess}>
                  <MaterialIcons name="check-circle" size={22} color="#16a34a" />
                  <Text style={styles.otpSuccessText}>Code verified! Setting up password...</Text>
                </View>
              )}

              <Text style={styles.forgotFieldLabel}>Verification Code</Text>
              <View style={styles.otpRow}>
                {Array.from({ length: 6 }, (_, index) => (
                  <TextInput
                    key={index}
                    ref={(node) => {
                      otpRefs.current[index] = node;
                    }}
                    style={[
                      styles.otpBox,
                      (forgotOtp.length === index || Boolean(forgotOtp[index])) && styles.otpBoxActive,
                      forgotErrors.otp && styles.otpBoxError,
                    ]}
                    value={forgotOtp[index] ?? ''}
                    onChangeText={(text) => handleOtpDigit(index, text)}
                    onKeyPress={({ nativeEvent }) => {
                      if (nativeEvent.key === 'Backspace' && !forgotOtp[index] && index > 0) {
                        setForgotOtp(forgotOtp.slice(0, index - 1) + forgotOtp.slice(index));
                        otpRefs.current[index - 1]?.focus();
                      }
                    }}
                    keyboardType="number-pad"
                    maxLength={index === 0 ? 6 : 1}
                    textAlign="center"
                    selectTextOnFocus
                    selectionColor="#1F7A8C"
                    cursorColor="#1F7A8C"
                    underlineColorAndroid="transparent"
                    keyboardAppearance="light"
                    editable={!forgotLoading && otpExpiresIn > 0}
                  />
                ))}
              </View>
              {forgotErrors.otp ? <Text style={styles.fieldError}>{forgotErrors.otp}</Text> : null}

              <Text style={[styles.otpCountdown, otpExpiresIn <= 60 && styles.otpCountdownUrgent]}>
                {otpExpiresIn > 0
                  ? `Code expires in ${formatOtpCountdown(otpExpiresIn)}`
                  : 'Code expired. Request a new one.'}
              </Text>

              <TouchableOpacity style={styles.resendBtn} onPress={handleSendOtp} disabled={forgotLoading}>
                <Text style={styles.resendText}>
                  {otpExpiresIn > 0 ? "Didn't get it? Resend code" : 'Resend code'}
                </Text>
              </TouchableOpacity>

              <View style={styles.forgotActions}>
                <TouchableOpacity style={styles.forgotBtnSecondary} onPress={() => setForgotStep(1)} disabled={forgotLoading}>
                  <Text style={styles.forgotBtnSecondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.forgotBtnPrimary, (forgotLoading || otpExpiresIn <= 0) && styles.signInBtnDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={forgotLoading || otpExpiresIn <= 0}
                >
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.forgotBtnPrimaryText}>Verify</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {forgotStep === 3 && (
            <>
              <Text style={styles.forgotFieldLabel}>New Password</Text>
              <View style={[styles.forgotInput, forgotErrors.password && styles.inputError]}>
                <MaterialIcons name="lock" size={20} color={forgotErrors.password ? '#ef4444' : '#64748b'} />
                <TextInput
                  style={styles.forgotInputText}
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#64748b"
                selectionColor="#1F7A8C"
                underlineColorAndroid="transparent"
                keyboardAppearance="light"
                  value={forgotNewPassword}
                  onChangeText={setForgotNewPassword}
                  secureTextEntry
                  editable={!forgotLoading}
                />
              </View>
              {forgotErrors.password ? <Text style={styles.fieldError}>{forgotErrors.password}</Text> : null}

              <Text style={[styles.forgotFieldLabel, { marginTop: 12 }]}>Confirm Password</Text>
              <View style={[styles.forgotInput, forgotErrors.confirmPassword && styles.inputError]}>
                <MaterialIcons name="lock" size={20} color={forgotErrors.confirmPassword ? '#ef4444' : '#64748b'} />
                <TextInput
                  style={styles.forgotInputText}
                  placeholder="Re-enter password"
                  placeholderTextColor="#64748b"
                selectionColor="#1F7A8C"
                underlineColorAndroid="transparent"
                keyboardAppearance="light"
                  value={forgotConfirmPassword}
                  onChangeText={setForgotConfirmPassword}
                  secureTextEntry
                  editable={!forgotLoading}
                />
              </View>
              {forgotErrors.confirmPassword ? (
                <Text style={styles.fieldError}>{forgotErrors.confirmPassword}</Text>
              ) : null}

              <View style={styles.forgotActions}>
                <TouchableOpacity style={styles.forgotBtnSecondary} onPress={() => setForgotStep(2)} disabled={forgotLoading}>
                  <Text style={styles.forgotBtnSecondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.forgotBtnPrimary} onPress={handleResetPassword} disabled={forgotLoading}>
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.forgotBtnPrimaryText}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </>
        ),
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  flex: {
    flex: 1,
  },
  brandBlock: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  logoWrap: {
    marginBottom: 6,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#D6EAEF',
  },
  logoImage: {
    width: 50,
    height: 50,
  },
  logoBadge: {
    position: 'absolute',
    right: -2,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1F7A8C',
    borderWidth: 3,
    borderColor: '#16324F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1F7A8C',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#16324F',
    textAlign: 'center',
  },
  brandSubtitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
  },
  sheetGreeting: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: '#16324F',
  },
  sheetSubGreeting: {
    textAlign: 'center',
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 20,
  },
  sheetScroll: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 32,
  },
  fieldGroup: {
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginLeft: 14,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    borderWidth: 1.5,
    paddingLeft: 7,
    paddingRight: 16,
    minHeight: 56,
    gap: 10,
  },
  inputIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputIconBoxActive: {
    backgroundColor: '#D6EAEF',
  },
  inputIconBoxError: {
    backgroundColor: '#fee2e2',
  },
  inputDefault: {
    borderColor: '#e2e8f0',
  },
  inputFocused: {
    borderColor: '#1F7A8C',
    backgroundColor: '#EEF6F8',
    shadowColor: '#1F7A8C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: '#0f172a',
    paddingVertical: Platform.OS === 'android' ? 8 : 12,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  fieldError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    marginBottom: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#EEF6F8',
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F7A8C',
  },
  signInBtn: {
    backgroundColor: '#16324F',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16324F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  signInBtnDisabled: {
    opacity: 0.7,
  },
  signInInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  signInText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  signInArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    marginTop: 18,
    gap: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#334155',
  },
  footerBtn: {
    alignSelf: 'stretch',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#16324F',
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16324F',
  },
  forgotOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  forgotBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    zIndex: 0,
  },
  forgotSafe: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  forgotCenterWrap: {
    width: '100%',
    maxWidth: 400,
    zIndex: 2,
    elevation: 8,
  },
  forgotSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    overflow: 'hidden',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 16,
  },
  forgotSheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    backgroundColor: '#EEF6F8',
  },
  forgotSheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  forgotSheetIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  forgotSheetSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 18,
  },
  forgotCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotStepWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  forgotStepBlock: {
    alignItems: 'center',
    minWidth: 56,
  },
  forgotStepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotStepBadgeActive: {
    backgroundColor: '#1F7A8C',
  },
  forgotStepNum: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  forgotStepNumActive: {
    color: '#ffffff',
  },
  forgotStepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 4,
  },
  forgotStepLabelActive: {
    color: '#1F7A8C',
  },
  forgotStepLine: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 18,
    marginHorizontal: 4,
  },
  forgotStepLineActive: {
    backgroundColor: '#1F7A8C',
  },
  forgotSheetBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
  },
  forgotFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginLeft: 14,
  },
  forgotInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    minHeight: 54,
  },
  forgotInputText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: '#0f172a',
    paddingVertical: Platform.OS === 'android' ? 8 : 12,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  forgotActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  forgotBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  forgotBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  forgotBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#1F7A8C',
    alignItems: 'center',
  },
  forgotBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 100,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 16,
  },
  modalClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
    padding: 4,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EEF6F8',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 19,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: '#1F7A8C',
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  stepDotTextActive: {
    color: '#ffffff',
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: '#1F7A8C',
  },
  modalField: {
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
    marginLeft: 4,
  },
  modalInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  modalInputText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: '#0f172a',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  otpBoxActive: {
    borderColor: '#1F7A8C',
    backgroundColor: '#ffffff',
  },
  otpBoxError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  modalError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 6,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalBtnOutline: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  modalBtnOutlineText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  modalBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#1F7A8C',
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  otpCountdown: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#1F7A8C',
  },
  otpCountdownUrgent: {
    color: '#dc2626',
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F7A8C',
  },
  otpSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 999,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  otpSuccessText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#15803d',
  },
});
