import { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Modal,
  FlatList,
  Animated,
  ActivityIndicator,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL } from '@/config/api';
import { showToast } from '@/components/Toast';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import ElSalvadorPlaceField from '@/components/ElSalvadorPlaceField';
import type { MeetingCoordinate } from '@/components/meetingPlaceMap.shared';

const imageMediaTypes: any = (ImagePicker as any).MediaType?.Images
  ? [(ImagePicker as any).MediaType.Images]
  : (ImagePicker as any).MediaTypeOptions.Images;

const STRENGTH_COLORS: Record<string, string> = {
  Weak: '#ef4444',
  Fair: '#eab308',
  Good: '#3C91E6',
  Strong: '#22c55e',
};

// Diri ang register screen sa bag-ong user.
export default function RegisterScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 1: Personal Info
  const [lastname, setLastname] = useState('');
  const [firstname, setFirstname] = useState('');
  const [middlename, setMiddlename] = useState('');
  const [age, setAge] = useState('');
  const [barangayId, setBarangayId] = useState<number | null>(null);
  const [barangayName, setBarangayName] = useState('');
  const [zone, setZone] = useState('');
  const [street, setStreet] = useState('');
  const [streetCoordinate, setStreetCoordinate] = useState<MeetingCoordinate | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [facebook, setFacebook] = useState('');

  // Dropdown states
  const [barangayModalVisible, setBarangayModalVisible] = useState(false);
  const [zoneModalVisible, setZoneModalVisible] = useState(false);

  // Dropdown data
  const [barangays, setBarangays] = useState<{ id: number; name: string }[]>([]);
  const [loadingBarangays, setLoadingBarangays] = useState(true);
  const [zones, setZones] = useState<{ id: number; barangay_id: number; name: string }[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);

  // Fetch barangays from API
  useEffect(() => {
    // Diri kuhaon ang lista sa barangay.
    const fetchBarangays = async () => {
      try {
        const barangayUrl = `${API_BASE_URL}/api/mobile/barangays`;
        const response = await axios.get(barangayUrl);
        if (response.data.success) {
          setBarangays(response.data.barangays);
        }
      } catch (error) {
        const err = error as { config?: { url?: string }; response?: { status?: number; data?: unknown } };
        console.error('Failed to fetch barangays:', err.config?.url, err.response?.status);
      } finally {
        setLoadingBarangays(false);
      }
    };

    fetchBarangays();
  }, []);

  // Fetch zones from API
  useEffect(() => {
    // Diri kuhaon ang lista sa zone.
    const fetchZones = async () => {
      try {
        const zoneUrl = `${API_BASE_URL}/api/mobile/zones`;
        const response = await axios.get(zoneUrl);
        if (response.data.success) {
          setZones(response.data.zones);
        }
      } catch (error) {
        const err = error as { config?: { url?: string }; response?: { status?: number; data?: unknown } };
        console.error('Failed to fetch zones:', err.config?.url, err.response?.status);
      } finally {
        setLoadingZones(false);
      }
    };

    fetchZones();
  }, []);

  // Zones are barangay-specific, so only offer the selected barangay's zones
  const barangayZones = zones.filter((z) => z.barangay_id === barangayId);
  
  // Step 2: Account Info
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 3: Verification document
  const [idDocumentUri, setIdDocumentUri] = useState<string | null>(null);
  const [idDocumentUrl, setIdDocumentUrl] = useState('');
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);

  // Email availability check
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Name availability check
  const [nameChecking, setNameChecking] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [errors, setErrors] = useState<{ [key: string]: string | undefined }>({});
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  // Diri uyugon ang form kung naay sayop.
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 100, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  // Real-time validation helpers
  // Diri susihon kung igo ba ka taas ang ngalan.
  const validateName = (value: string) => value.trim().length >= 2 ? undefined : 'Name must be at least 2 characters';
  // Diri susihon kung sakto ang email.
  const validateEmail = (value: string) => {
    if (!value.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
    return undefined;
  };
  // Diri susihon kung sakto ang phone number.
  const validatePhone = (value: string) => {
    if (!value.trim()) return 'Phone number is required';
    if (!/^\d{10,11}$/.test(value.replace(/\D/g, ''))) return 'Please enter a valid phone number';
    return undefined;
  };
  // Diri susihon kung sakto ang edad.
  const validateAge = (value: string) => {
    if (!value.trim()) return 'Age is required';
    const num = Number(value);
    if (isNaN(num) || num < 1 || num > 120) return 'Please enter a valid age (1-120)';
    return undefined;
  };
  // Diri susihon kung sakto ang password.
  const validatePassword = (value: string) => {
    if (!value) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return undefined;
  };

  // Diri i-validate ang unang step sa registration.
  const validateStep1 = () => {
    const newErrors: { [key: string]: string | undefined } = {};
    
    const firstnameError = validateName(firstname);
    const lastnameError = validateName(lastname);
    const phoneError = validatePhone(phoneNumber);
    const ageError = validateAge(age);

    if (firstnameError) newErrors.firstname = firstnameError;
    if (lastnameError) newErrors.lastname = lastnameError;
    if (phoneError) newErrors.phoneNumber = phoneError;
    if (ageError) newErrors.age = ageError;
    if (!barangayId) newErrors.barangay = 'Select a barangay first.';
    if (!zone) newErrors.zone = 'Select a zone after choosing a barangay.';
    if (!street.trim() || !streetCoordinate) {
      newErrors.street = barangayId && zone
        ? 'Search, tap the map, or use GPS to pin a location in your zone.'
        : 'Select a barangay and zone first, then pin your location.';
    }
    if (nameAvailable === false) {
      newErrors.firstname = 'This first and last name combination is already registered.';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      shake();
      return false;
    }
    return true;
  };

  // Diri i-validate ang ikaduhang step sa registration.
  const validateStep2 = () => {
    const newErrors: { [key: string]: string | undefined } = {};

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    
    if (emailError) newErrors.email = emailError;
    if (passwordError) newErrors.password = passwordError;
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (emailAvailable === false) {
      newErrors.email = 'This email is already registered.';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      shake();
      return false;
    }
    return true;
  };

  // Diri i-validate ang ikatulong step, apil ang ID.
  const validateStep3 = () => {
    const newErrors: { [key: string]: string | undefined } = {};
    if (!idDocumentUrl) {
      newErrors.idDocument = 'Please upload a photo of your barangay residence proof, National ID, or Voter\'s ID.';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      shake();
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (step !== 2) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || validateEmail(trimmed)) {
      setEmailAvailable(null);
      return;
    }

    if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    emailCheckTimer.current = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const response = await axios.get(`${API_BASE_URL}/api/mobile/check-email`, {
          params: { email: trimmed },
        });
        if (response.data.success) {
          setEmailAvailable(response.data.available);
          if (!response.data.available) {
            setErrors((prev) => ({ ...prev, email: 'This email is already registered.' }));
          }
        }
      } catch {
        setEmailAvailable(null);
      } finally {
        setEmailChecking(false);
      }
    }, 500);

    return () => {
      if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    };
  }, [email, step]);

  useEffect(() => {
    if (step !== 1) return;
    const first = firstname.trim();
    const last = lastname.trim();
    if (!first || !last || validateName(first) || validateName(last)) {
      setNameAvailable(null);
      return;
    }

    if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    nameCheckTimer.current = setTimeout(async () => {
      setNameChecking(true);
      try {
        const response = await axios.get(`${API_BASE_URL}/api/mobile/check-name`, {
          params: { firstname: first, lastname: last },
        });
        if (response.data.success) {
          setNameAvailable(response.data.available);
          if (!response.data.available) {
            setErrors((prev) => ({
              ...prev,
              firstname: 'This first and last name combination is already registered.',
            }));
          }
        }
      } catch {
        setNameAvailable(null);
      } finally {
        setNameChecking(false);
      }
    }, 500);

    return () => {
      if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    };
  }, [firstname, lastname, step]);

  // Diri pilion ug i-upload ang litrato sa ID.
  const pickIdDocument = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos to upload your ID.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imageMediaTypes,
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const uri = result.assets[0].uri;
    setIdDocumentUri(uri);
    setUploadingDocument(true);
    setErrors((prev) => ({ ...prev, idDocument: undefined }));

    try {
      const url = await uploadImageToCloudinary(uri);
      setIdDocumentUrl(url);
    } catch {
      setIdDocumentUri(null);
      setIdDocumentUrl('');
      showToast({ type: 'error', message: 'Failed to upload document. Please try again.' });
    } finally {
      setUploadingDocument(false);
    }
  };

  // Get password strength
  // Diri sukdon kung kusgan ba ang password.
  const getPasswordStrength = (pwd: string) => {
    if (pwd.length === 0) return { label: '', color: '', width: 0 };
    if (pwd.length < 6) return { label: 'Weak', color: 'bg-red-500', width: 33 };
    if (pwd.length < 8) return { label: 'Fair', color: 'bg-yellow-500', width: 66 };
    if (pwd.length < 10 || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) return { label: 'Good', color: 'bg-blue-500', width: 80 };
    return { label: 'Strong', color: 'bg-green-500', width: 100 };
  };

  const passwordStrength = getPasswordStrength(password);

  // Diri pilion ang border style sa input.
  const inputBorder = (hasError: boolean) => {
    if (hasError) return styles.inputError;
    return styles.inputDefault;
  };

  // Diri ipakita ang step indicator sa registration.
  const StepIndicator = () => (
    <View style={styles.stepRow}>
      {[1, 2, 3].map((n, index) => (
        <View key={n} style={styles.stepBlockWrap}>
          <View style={styles.stepBlock}>
            <View style={[styles.stepBadge, step >= n && styles.stepBadgeActive]}>
              {step > n ? (
                <MaterialIcons name="check" size={14} color="#ffffff" />
              ) : (
                <Text style={[styles.stepNum, step === n && styles.stepNumActive]}>{n}</Text>
              )}
            </View>
            <Text style={[styles.stepLabel, step === n && styles.stepLabelActive]}>
              {n === 1 ? 'Personal' : n === 2 ? 'Account' : 'Verify'}
            </Text>
          </View>
          {index < 2 && <View style={[styles.stepLineInline, step > n && styles.stepLineActive]} />}
        </View>
      ))}
    </View>
  );

  // Diri moadto sa sunod nga step kung valid na.
  const handleNext = async () => {
    if (step === 1) {
      if (!validateStep1()) return;

      const first = firstname.trim();
      const last = lastname.trim();
      if (!validateName(first) && !validateName(last)) {
        try {
          const response = await axios.get(`${API_BASE_URL}/api/mobile/check-name`, {
            params: { firstname: first, lastname: last },
          });
          if (response.data.success && !response.data.available) {
            setErrors((prev) => ({
              ...prev,
              firstname: 'This first and last name combination is already registered.',
            }));
            shake();
            return;
          }
        } catch {
          showToast({ type: 'error', message: 'Could not verify name. Please try again.' });
          return;
        }
      }

      setStep(2);
      setErrors({});
      return;
    }
    if (step === 2 && validateStep2()) {
      setStep(3);
      setErrors({});
    }
  };

  // Diri mobalik sa miaging step.
  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else {
      setStep(1);
    }
    setErrors({});
  };

  // Diri i-submit ang registration sa server.
  const handleRegister = async () => {
    if (!validateStep3()) return;

    setLoading(true);
    try {
      const fullName = `${firstname} ${lastname}`.trim();
      
      const response = await axios.post(`${API_BASE_URL}/api/mobile/register`, {
        name: fullName,
        email: email.trim().toLowerCase(),
        password,
        password_confirmation: confirmPassword,
        firstname,
        lastname,
        middlename,
        age: Number(age),
        barangay_id: barangayId,
        zone,
        street,
        street_latitude: streetCoordinate?.latitude ?? null,
        street_longitude: streetCoordinate?.longitude ?? null,
        phone_number: phoneNumber,
        facebook,
        id_document_url: idDocumentUrl,
        role: 'client',
      });

      if (response.data.success) {
        setShowPendingModal(true);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Registration failed. Please try again.';
      const validationErrors = error.response?.data?.messages;
      
      if (validationErrors) {
        const errorText = Object.values(validationErrors).flat().join('\n');
        showToast({ type: 'error', message: errorText });
      } else {
        showToast({ type: 'error', message: errorMsg });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerSafe}>
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
          <Text style={styles.brandTitle} maxFontSizeMultiplier={1.15}>Create account</Text>
          <Text style={styles.brandSubtitle} maxFontSizeMultiplier={1.2}>
            Register to book visits for your pets
          </Text>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <Text style={styles.sheetGreeting}>
          {step === 1 ? 'Tell us about yourself' : step === 2 ? 'Set up your login' : 'Upload verification document'}
        </Text>
        <StepIndicator />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
            <Animated.View style={{ transform: [{ translateX: shakeAnimation }] }}>
              {step === 1 ? (
                <>
                  <View style={styles.row}>
                    <View style={styles.rowItem}>
                      <Text style={styles.label}>First Name</Text>
                      <View style={[styles.inputWrap, inputBorder(!!errors.firstname)]}>
                        <TextInput
                          style={styles.inputPlain}
                          placeholder="First name"
                          placeholderTextColor="#94a3b8"
                          value={firstname}
                          onChangeText={(text) => {
                            setFirstname(text);
                            setNameAvailable(null);
                            if (errors.firstname) setErrors({ ...errors, firstname: undefined });
                          }}
                          autoComplete="given-name"
                        />
                      </View>
                      {errors.firstname ? <Text style={styles.fieldError}>{errors.firstname}</Text> : null}
                    </View>
                    <View style={styles.rowItem}>
                      <Text style={styles.label}>Last Name</Text>
                      <View style={[styles.inputWrap, inputBorder(!!errors.lastname)]}>
                        <TextInput
                          style={styles.inputPlain}
                          placeholder="Last name"
                          placeholderTextColor="#94a3b8"
                          value={lastname}
                          onChangeText={(text) => {
                            setLastname(text);
                            setNameAvailable(null);
                            if (errors.lastname) setErrors({ ...errors, lastname: undefined });
                          }}
                          autoComplete="family-name"
                        />
                      </View>
                      {errors.lastname ? <Text style={styles.fieldError}>{errors.lastname}</Text> : null}
                    </View>
                  </View>
                  {nameChecking ? (
                    <Text style={styles.fieldHint}>Checking name availability...</Text>
                  ) : !errors.firstname && firstname.trim() && lastname.trim() && nameAvailable === true ? (
                    <Text style={styles.fieldSuccess}>Name is available.</Text>
                  ) : null}

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Middle Name</Text>
                    <View style={[styles.inputWrap, styles.inputDefault]}>
                      <View style={styles.inputIconBox} pointerEvents="none">
                        <MaterialIcons name="person-outline" size={18} color="#64748b" />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Optional"
                        placeholderTextColor="#94a3b8"
                        value={middlename}
                        onChangeText={setMiddlename}
                        autoComplete="additional-name"
                      />
                    </View>
                  </View>

                  <View style={styles.row}>
                    <View style={styles.rowItem}>
                      <Text style={styles.label}>Age</Text>
                      <View style={[styles.inputWrap, inputBorder(!!errors.age)]}>
                        <View style={[styles.inputIconBox, errors.age && styles.inputIconBoxError]} pointerEvents="none">
                          <MaterialIcons name="cake" size={18} color={errors.age ? '#ef4444' : '#64748b'} />
                        </View>
                        <TextInput
                          style={styles.input}
                          placeholder="Age"
                          placeholderTextColor="#94a3b8"
                          value={age}
                          onChangeText={(text) => {
                            setAge(text);
                            if (errors.age) setErrors({ ...errors, age: undefined });
                          }}
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                      </View>
                      {errors.age ? <Text style={styles.fieldError}>{errors.age}</Text> : null}
                    </View>
                    <View style={styles.rowItem}>
                      <Text style={styles.label}>Phone</Text>
                      <View style={[styles.inputWrap, inputBorder(!!errors.phoneNumber)]}>
                        <View style={[styles.inputIconBox, errors.phoneNumber && styles.inputIconBoxError]} pointerEvents="none">
                          <MaterialIcons name="phone" size={18} color={errors.phoneNumber ? '#ef4444' : '#64748b'} />
                        </View>
                        <TextInput
                          style={styles.input}
                          placeholder="Phone"
                          placeholderTextColor="#94a3b8"
                          value={phoneNumber}
                          onChangeText={(text) => {
                            setPhoneNumber(text);
                            if (errors.phoneNumber) setErrors({ ...errors, phoneNumber: undefined });
                          }}
                          keyboardType="phone-pad"
                          autoComplete="tel"
                        />
                      </View>
                      {errors.phoneNumber ? <Text style={styles.fieldError}>{errors.phoneNumber}</Text> : null}
                    </View>
                  </View>

                  <View style={styles.row}>
                    <View style={styles.rowItem}>
                      <Text style={styles.label}>Barangay</Text>
                      <TouchableOpacity
                        style={[
                          styles.inputWrap,
                          inputBorder(!!errors.barangay),
                          loadingBarangays && styles.inputDisabled,
                        ]}
                        onPress={() => !loadingBarangays && setBarangayModalVisible(true)}
                        disabled={loadingBarangays}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.selectText, !barangayName && styles.selectPlaceholder]} numberOfLines={1}>
                          {loadingBarangays ? 'Loading...' : (barangayName || 'Select')}
                        </Text>
                        {!loadingBarangays && <MaterialIcons name="arrow-drop-down" size={22} color="#64748b" />}
                      </TouchableOpacity>
                      {errors.barangay ? <Text style={styles.fieldError}>{errors.barangay}</Text> : null}
                    </View>
                    <View style={styles.rowItem}>
                      <Text style={styles.label}>Zone</Text>
                      <TouchableOpacity
                        style={[
                          styles.inputWrap,
                          inputBorder(!!errors.zone),
                          (loadingZones || !barangayId) && styles.inputDisabled,
                        ]}
                        onPress={() => {
                          if (!barangayId) {
                            setErrors((prev) => ({ ...prev, barangay: 'Select a barangay first.' }));
                            return;
                          }
                          if (!loadingZones) setZoneModalVisible(true);
                        }}
                        disabled={loadingZones || !barangayId}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.selectText, !zone && styles.selectPlaceholder]} numberOfLines={1}>
                          {loadingZones ? 'Loading...' : (zone || (barangayId ? 'Select' : 'Pick barangay first'))}
                        </Text>
                        {!loadingZones && <MaterialIcons name="arrow-drop-down" size={22} color="#64748b" />}
                      </TouchableOpacity>
                      {errors.zone ? <Text style={styles.fieldError}>{errors.zone}</Text> : null}
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Location</Text>
                    <ElSalvadorPlaceField
                      value={street}
                      barangay={barangayName}
                      zone={zone}
                      showMap
                      onChange={(place) => {
                        setStreet(place);
                        if (!place) setStreetCoordinate(null);
                        if (errors.street) setErrors({ ...errors, street: undefined });
                      }}
                      onResolvedPlace={(place) => {
                        if (!place) {
                          setStreetCoordinate(null);
                          return;
                        }
                        setStreet(place.label);
                        setStreetCoordinate(place.coordinate);
                        if (errors.street) setErrors({ ...errors, street: undefined });
                      }}
                      variant="pill"
                      hasError={!!errors.street}
                    />
                    {errors.street ? <Text style={styles.fieldError}>{errors.street}</Text> : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Facebook</Text>
                    <View style={[styles.inputWrap, styles.inputDefault]}>
                      <View style={styles.inputIconBox} pointerEvents="none">
                        <MaterialIcons name="facebook" size={18} color="#64748b" />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Profile link (optional)"
                        placeholderTextColor="#94a3b8"
                        value={facebook}
                        onChangeText={setFacebook}
                      />
                    </View>
                  </View>

                  <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
                    <Text style={styles.primaryBtnText}>Continue</Text>
                    <MaterialIcons name="arrow-forward" size={18} color="#ffffff" />
                  </TouchableOpacity>
                </>
              ) : step === 2 ? (
                <>
                  <View style={styles.fieldGroupFirst}>
                    <Text style={styles.label}>Email</Text>
                    <View style={[styles.inputWrap, inputBorder(!!errors.email)]}>
                      <View style={[styles.inputIconBox, errors.email && styles.inputIconBoxError]} pointerEvents="none">
                        <MaterialIcons name="email" size={18} color={errors.email ? '#ef4444' : '#64748b'} />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your email"
                        placeholderTextColor="#94a3b8"
                        value={email}
                        onChangeText={(text) => {
                          setEmail(text);
                          setEmailAvailable(null);
                          if (errors.email) setErrors({ ...errors, email: undefined });
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                      />
                      {emailChecking ? (
                        <ActivityIndicator size="small" color="#1F7A8C" />
                      ) : !errors.email && email && emailAvailable === true ? (
                        <MaterialIcons name="check-circle" size={18} color="#22c55e" />
                      ) : !errors.email && email && emailAvailable === false ? (
                        <MaterialIcons name="cancel" size={18} color="#ef4444" />
                      ) : null}
                    </View>
                    {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
                    {!errors.email && emailAvailable === true ? (
                      <Text style={styles.fieldSuccess}>Email is available.</Text>
                    ) : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Password</Text>
                    <View style={[styles.inputWrap, inputBorder(!!errors.password)]}>
                      <View style={[styles.inputIconBox, errors.password && styles.inputIconBoxError]} pointerEvents="none">
                        <MaterialIcons name="lock" size={18} color={errors.password ? '#ef4444' : '#64748b'} />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Create password (min 6 chars)"
                        placeholderTextColor="#94a3b8"
                        value={password}
                        onChangeText={(text) => {
                          setPassword(text);
                          if (errors.password) setErrors({ ...errors, password: undefined });
                        }}
                        secureTextEntry={!showPassword}
                        autoComplete="new-password"
                      />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                        <MaterialIcons
                          name={showPassword ? 'visibility-off' : 'visibility'}
                          size={20}
                          color="#64748b"
                        />
                      </TouchableOpacity>
                    </View>
                    {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}

                    {password.length > 0 && (
                      <View style={styles.strengthWrap}>
                        <View style={styles.strengthRow}>
                          <View style={styles.strengthTrack}>
                            <View
                              style={[
                                styles.strengthBar,
                                {
                                  width: `${passwordStrength.width}%`,
                                  backgroundColor: STRENGTH_COLORS[passwordStrength.label] || '#e2e8f0',
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.strengthLabel}>{passwordStrength.label}</Text>
                        </View>
                        <Text style={styles.strengthHint}>Use 8+ chars with uppercase, number & symbol</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Confirm Password</Text>
                    <View style={[styles.inputWrap, inputBorder(!!errors.confirmPassword)]}>
                      <View style={[styles.inputIconBox, errors.confirmPassword && styles.inputIconBoxError]} pointerEvents="none">
                        <MaterialIcons name="lock-outline" size={18} color={errors.confirmPassword ? '#ef4444' : '#64748b'} />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Confirm your password"
                        placeholderTextColor="#94a3b8"
                        value={confirmPassword}
                        onChangeText={(text) => {
                          setConfirmPassword(text);
                          if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: undefined });
                        }}
                        secureTextEntry={!showConfirmPassword}
                        autoComplete="new-password"
                      />
                      <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} hitSlop={8}>
                        <MaterialIcons
                          name={showConfirmPassword ? 'visibility-off' : 'visibility'}
                          size={20}
                          color="#64748b"
                        />
                      </TouchableOpacity>
                      {!errors.confirmPassword && confirmPassword && confirmPassword === password ? (
                        <MaterialIcons name="check-circle" size={18} color="#22c55e" />
                      ) : null}
                    </View>
                    {errors.confirmPassword ? <Text style={styles.fieldError}>{errors.confirmPassword}</Text> : null}
                  </View>

                  <View style={styles.btnRow}>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={handleBack} disabled={loading}>
                      <Text style={styles.secondaryBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnHalf]} onPress={handleNext}>
                      <Text style={styles.primaryBtnText}>Continue</Text>
                      <MaterialIcons name="arrow-forward" size={18} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.verifyHint}>
                    Upload a clear photo of your barangay residence proof, National ID, or Voter&apos;s ID.
                  </Text>

                  <TouchableOpacity
                    style={[styles.uploadBox, errors.idDocument && styles.uploadBoxError]}
                    onPress={pickIdDocument}
                    disabled={uploadingDocument}
                    activeOpacity={0.85}
                  >
                    {uploadingDocument ? (
                      <ActivityIndicator size="large" color="#1F7A8C" />
                    ) : idDocumentUri ? (
                      <Image source={{ uri: idDocumentUri }} style={styles.uploadPreview} resizeMode="cover" />
                    ) : (
                      <>
                        <MaterialIcons name="add-a-photo" size={36} color="#1F7A8C" />
                        <Text style={styles.uploadTitle}>Tap to upload photo</Text>
                        <Text style={styles.uploadSubtitle}>Barangay residence · National ID · Voter&apos;s ID</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {errors.idDocument ? <Text style={styles.fieldError}>{errors.idDocument}</Text> : null}

                  <View style={styles.btnRow}>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={handleBack} disabled={loading}>
                      <Text style={styles.secondaryBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.primaryBtnHalf, loading && styles.primaryBtnDisabled]}
                      onPress={handleRegister}
                      disabled={loading || uploadingDocument}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Submit Registration</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity
              style={styles.footerBtn}
              onPress={() => !loading && router.push('/(auth)/login')}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={barangayModalVisible}
        onRequestClose={() => setBarangayModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBarangayModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setBarangayModalVisible(false)} hitSlop={12}>
              <MaterialIcons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
            <View style={styles.modalIconWrap}>
              <MaterialIcons name="location-city" size={26} color="#1F7A8C" />
            </View>
            <Text style={styles.modalTitle}>Select Barangay</Text>
            <Text style={styles.modalSubtitle}>Choose your barangay in El Salvador City</Text>
            <FlatList
              data={barangays}
              keyExtractor={(item) => String(item.id)}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    if (item.id !== barangayId) {
                      setZone('');
                      setStreet('');
                      setStreetCoordinate(null);
                    }
                    setBarangayId(item.id);
                    setBarangayName(item.name);
                    setBarangayModalVisible(false);
                    setErrors((prev) => ({ ...prev, barangay: undefined, zone: undefined, street: undefined }));
                  }}
                  style={[styles.modalListItem, barangayId === item.id && styles.modalListItemActive]}
                >
                  <Text style={[styles.modalListText, barangayId === item.id && styles.modalListTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={zoneModalVisible}
        onRequestClose={() => setZoneModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setZoneModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setZoneModalVisible(false)} hitSlop={12}>
              <MaterialIcons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
            <View style={styles.modalIconWrap}>
              <MaterialIcons name="location-on" size={26} color="#1F7A8C" />
            </View>
            <Text style={styles.modalTitle}>Select Zone</Text>
            <Text style={styles.modalSubtitle}>
              {barangayName ? `Choose your zone in ${barangayName}` : 'Choose your zone'}
            </Text>
            <FlatList
              data={barangayZones}
              keyExtractor={(item) => String(item.id)}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    if (item.name !== zone) {
                      setStreet('');
                      setStreetCoordinate(null);
                    }
                    setZone(item.name);
                    setZoneModalVisible(false);
                    setErrors((prev) => ({ ...prev, zone: undefined, street: undefined }));
                  }}
                  style={[styles.modalListItem, zone === item.name && styles.modalListItemActive]}
                >
                  <Text style={[styles.modalListText, zone === item.name && styles.modalListTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" transparent visible={showPendingModal} onRequestClose={() => {}}>
        <Pressable style={styles.modalOverlay}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalIconWrap, { backgroundColor: '#fffbeb' }]}>
              <MaterialIcons name="hourglass-top" size={28} color="#d97706" />
            </View>
            <Text style={[styles.modalTitle, { color: '#92400e' }]}>Account Under Review</Text>
            <Text style={[styles.modalSubtitle, { color: '#b45309' }]}>
              Your registration was submitted to El Salvador Vet Clinic. Your account is under review. Please sign in to add animals and book appointments. Your owner name will show as Under Review until approved. Once approved, your real name will appear and you will receive an email confirmation.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 16, backgroundColor: '#d97706' }]}
              onPress={() => {
                setShowPendingModal(false);
                router.replace('/(auth)/login');
              }}
            >
              <Text style={styles.primaryBtnText}>Go to Sign In</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  headerSafe: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  brandBlock: {
    alignItems: 'center',
    paddingHorizontal: 12,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1F7A8C',
    borderWidth: 3,
    borderColor: '#16324F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#1F7A8C',
    textAlign: 'center',
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
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 4,
    gap: 4,
  },
  stepBlockWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepBlock: {
    alignItems: 'center',
    minWidth: 56,
  },
  stepLineInline: {
    width: 24,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 18,
    marginHorizontal: 2,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeActive: {
    backgroundColor: '#16324F',
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  stepNumActive: {
    color: '#ffffff',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 4,
  },
  stepLabelActive: {
    color: '#1F7A8C',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 18,
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#1F7A8C',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#ffffff',
    marginTop: 8,
    marginHorizontal: 14,
    paddingTop: 6,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  sheetGreeting: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#16324F',
    marginTop: 14,
    marginBottom: 2,
  },
  sheetScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  rowItem: {
    flex: 1,
  },
  fieldGroupFirst: {
    marginTop: 4,
  },
  fieldGroup: {
    marginTop: 14,
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
    gap: 8,
  },
  inputIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputIconBoxError: {
    backgroundColor: '#fee2e2',
  },
  inputDefault: {
    borderColor: '#e2e8f0',
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  inputDisabled: {
    opacity: 0.7,
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
  inputPlain: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: '#0f172a',
    paddingVertical: Platform.OS === 'android' ? 8 : 12,
    paddingHorizontal: 10,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  selectText: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    paddingVertical: 12,
    paddingLeft: 10,
  },
  selectPlaceholder: {
    color: '#94a3b8',
  },
  fieldError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  fieldSuccess: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  fieldHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    marginLeft: 4,
  },
  verifyHint: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 16,
  },
  uploadBox: {
    minHeight: 200,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#86BBC8',
    borderStyle: 'dashed',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 16,
  },
  uploadBoxError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  uploadPreview: {
    width: '100%',
    height: 200,
    borderRadius: 20,
  },
  uploadTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  uploadSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  strengthWrap: {
    marginTop: 10,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  strengthTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  strengthBar: {
    height: '100%',
    borderRadius: 999,
  },
  strengthLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    minWidth: 44,
  },
  strengthHint: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: '#16324F',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
    shadowColor: '#16324F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryBtnHalf: {
    flex: 1,
    marginTop: 0,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  footerSafe: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  footer: {
    alignItems: 'center',
    gap: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
  },
  footerBtn: {
    alignSelf: 'stretch',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#16324F',
    paddingVertical: 12,
    alignItems: 'center',
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16324F',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
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
    marginBottom: 12,
    lineHeight: 19,
  },
  modalList: {
    maxHeight: 280,
  },
  modalListItem: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 4,
    borderRadius: 12,
  },
  modalListItemActive: {
    backgroundColor: '#EEF6F8',
  },
  modalListText: {
    fontSize: 15,
    color: '#334155',
  },
  modalListTextActive: {
    color: '#1F7A8C',
    fontWeight: '700',
  },
});
