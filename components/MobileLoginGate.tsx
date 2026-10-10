import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as NativeAnimated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { ArrowRight, Eye, EyeOff, LockKeyhole, User } from 'lucide-react-native';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import AppAuroraBackground from '@/components/AppAuroraBackground';

const appIcon = require('../assets/images/cubis-shop-icon.png');

export default function MobileLoginGate({ children }: { children: React.ReactNode }) {
  const { user, login, loading, initializing, rememberedUsername, rememberedLogin } = useAuth();
  const passwordRef = useRef<TextInput | null>(null);
  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(rememberedLogin);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
  const [error, setError] = useState('');
  const buttonScale = useRef(new NativeAnimated.Value(1)).current;

  React.useEffect(() => {
    if (!username && rememberedUsername) setUsername(rememberedUsername);
  }, [rememberedUsername, username]);

  React.useEffect(() => setRememberMe(rememberedLogin), [rememberedLogin]);

  if (initializing) {
    return (
      <AppAuroraBackground>
        <StatusBar style="dark" />
        <View style={styles.initialLoader}>
          <View style={styles.initialLoaderMark}>
            <Image source={appIcon} style={styles.initialLoaderImage} resizeMode="cover" />
          </View>
          <ActivityIndicator size="small" color={Theme.colors.brand.primary} />
          <Text style={styles.initialLoaderText}>Pregătim spațiul tău de lucru…</Text>
        </View>
      </AppAuroraBackground>
    );
  }

  if (user) return <AppAuroraBackground>{children}</AppAuroraBackground>;

  const submit = async () => {
    if (!username.trim() || !password.trim() || loading) return;
    try {
      setError('');
      await login(username, password, rememberMe);
      setPassword('');
    } catch (e: any) {
      setError(e.message || 'Autentificarea nu a reușit. Verifică datele introduse.');
    }
  };

  const submitDisabled = !username.trim() || !password.trim() || loading;

  return (
    <AppAuroraBackground>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={styles.decorations}>
        <View style={styles.decorativeRingLarge} />
        <View style={styles.decorativeRingSmall} />
        <View style={styles.decorativeDot} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboard}
        enabled={Platform.OS === 'ios'}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(420).delay(40)} style={styles.brandRow}>
              <View style={styles.brandIconWrap}>
                <Image source={appIcon} style={styles.brandIcon} resizeMode="cover" accessibilityLabel="Cubis Shop" />
              </View>
              <View style={styles.brandNameWrap}>
                <Text style={styles.brandName}>Cubis Shop</Text>
                <Text style={styles.brandMeta}>Administrare magazin</Text>
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(520).delay(90).springify().damping(18).stiffness(130)}
              style={styles.card}>
              <Animated.View entering={FadeInUp.duration(420).delay(170)} style={styles.heading}>
                <Text style={styles.title}>Bine ai revenit</Text>
                <Text style={styles.subtitle}>Conectează-te pentru a continua.</Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(420).delay(230)} style={styles.field}>
                <Text style={styles.label}>Utilizator</Text>
                <View style={[styles.inputWrap, focusedField === 'username' && styles.inputWrapFocused]}>
                  <View style={[styles.inputIcon, focusedField === 'username' && styles.inputIconFocused]}>
                    <User size={18} color={focusedField === 'username' ? Theme.colors.brand.primary : '#71869A'} strokeWidth={1.9} />
                  </View>
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Numele de utilizator"
                    placeholderTextColor={Theme.colors.text.disabled}
                    autoComplete="username"
                    textContentType="username"
                    importantForAutofill="yes"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(420).delay(280)} style={styles.field}>
                <Text style={styles.label}>Parolă</Text>
                <View style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}>
                  <View style={[styles.inputIcon, focusedField === 'password' && styles.inputIconFocused]}>
                    <LockKeyhole size={18} color={focusedField === 'password' ? Theme.colors.brand.primary : '#71869A'} strokeWidth={1.9} />
                  </View>
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Parola ta"
                    placeholderTextColor={Theme.colors.text.disabled}
                    autoComplete="current-password"
                    textContentType="password"
                    importantForAutofill="yes"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!passwordVisible}
                    returnKeyType="done"
                    onSubmitEditing={submit}
                  />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={passwordVisible ? 'Ascunde parola' : 'Afișează parola'}
                    activeOpacity={0.7}
                    onPress={() => setPasswordVisible((current) => !current)}
                    style={styles.passwordToggle}>
                    {passwordVisible ? (
                      <Animated.View key="eye-off" entering={FadeIn.duration(160)}>
                        <EyeOff size={19} color={Theme.colors.brand.primary} strokeWidth={1.9} />
                      </Animated.View>
                    ) : (
                      <Animated.View key="eye-on" entering={FadeIn.duration(160)}>
                        <Eye size={19} color="#71869A" strokeWidth={1.9} />
                      </Animated.View>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(420).delay(320)} style={[styles.rememberRow, rememberMe && styles.rememberRowActive]}>
                <TouchableOpacity
                  style={styles.rememberCopy}
                  activeOpacity={0.8}
                  onPress={() => setRememberMe((current) => !current)}>
                  <Text style={styles.rememberTitle}>Ține-mă minte</Text>
                </TouchableOpacity>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ false: '#CBD8E4', true: '#86DDEA' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#CBD8E4"
                />
              </Animated.View>

              {error ? (
                <Animated.View entering={FadeIn.duration(180)} style={styles.errorBox}>
                  <Text style={styles.error} selectable>{error}</Text>
                </Animated.View>
              ) : null}

              <Animated.View entering={FadeInUp.duration(420).delay(360)}>
                <NativeAnimated.View style={{ transform: [{ scale: buttonScale }] }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Intră în aplicație"
                    android_ripple={{ color: 'rgba(255,255,255,0.16)', borderless: false }}
                    onPress={submit}
                    onPressIn={() => {
                      NativeAnimated.timing(buttonScale, {
                        toValue: 0.985,
                        duration: 90,
                        useNativeDriver: true,
                      }).start();
                    }}
                    onPressOut={() => {
                      NativeAnimated.timing(buttonScale, {
                        toValue: 1,
                        duration: 180,
                        useNativeDriver: true,
                      }).start();
                    }}
                    disabled={submitDisabled}
                    style={[styles.button, submitDisabled && styles.buttonDisabled]}>
                    {loading ? (
                      <>
                        <ActivityIndicator size="small" color={Colors.white} />
                        <Text style={styles.buttonText}>Se conectează…</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Intră în aplicație</Text>
                        <View style={styles.buttonArrow}>
                          <ArrowRight size={18} color={Colors.white} strokeWidth={2} />
                        </View>
                      </>
                    )}
                  </Pressable>
                </NativeAnimated.View>
              </Animated.View>
            </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppAuroraBackground>
  );
}

const styles = StyleSheet.create({
  initialLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13 },
  initialLoaderMark: {
    width: 76, height: 76, overflow: 'hidden', borderRadius: 23,
    backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card,
  },
  initialLoaderImage: { width: 76, height: 76 },
  initialLoaderText: { color: Theme.colors.text.secondary, fontSize: 12, fontFamily: Theme.typography.medium },
  keyboard: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1, justifyContent: 'flex-start', paddingHorizontal: 20, paddingTop: 54, paddingBottom: 42,
  },
  decorations: { ...StyleSheet.absoluteFill },
  decorativeRingLarge: {
    position: 'absolute', top: 86, right: -104, width: 218, height: 218,
    borderWidth: 1, borderColor: 'rgba(8,127,245,0.10)', borderRadius: 109,
  },
  decorativeRingSmall: {
    position: 'absolute', left: -43, bottom: 88, width: 126, height: 126,
    borderWidth: 1, borderColor: 'rgba(9,201,229,0.12)', borderRadius: 63,
  },
  decorativeDot: {
    position: 'absolute', top: '24%', left: 26, width: 8, height: 8,
    borderRadius: 4, backgroundColor: 'rgba(9,201,229,0.34)',
  },
  brandRow: {
    width: '100%', maxWidth: 440, alignSelf: 'center', flexDirection: 'row',
    alignItems: 'center', marginBottom: 18, paddingHorizontal: 5,
  },
  brandIconWrap: {
    width: 48, height: 48, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)', borderRadius: 15,
    backgroundColor: Theme.colors.surface.base, shadowColor: Theme.colors.shadow.color,
    shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  brandIcon: { width: 48, height: 48 },
  brandNameWrap: { flex: 1, marginLeft: 12, gap: 3 },
  brandName: {
    color: Theme.colors.text.primary, fontSize: 17, lineHeight: 19,
    fontFamily: Theme.typography.bold, letterSpacing: -0.4,
  },
  brandMeta: {
    color: Theme.colors.text.secondary, fontSize: 8,
    fontFamily: Theme.typography.medium, letterSpacing: 0.15,
  },
  card: {
    width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 22,
    paddingTop: 28, paddingBottom: 20, borderWidth: 1,
    borderColor: 'rgba(203,217,228,0.82)', borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.94)', shadowColor: '#17405F',
    shadowOpacity: 0.15, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 10,
  },
  heading: { marginBottom: 25 },
  title: {
    color: Theme.colors.text.primary, fontSize: 31, lineHeight: 36,
    fontFamily: Theme.typography.bold, letterSpacing: -1.05,
  },
  subtitle: {
    marginTop: 7, color: Theme.colors.text.secondary, fontSize: 12,
    lineHeight: 18, fontFamily: Theme.typography.regular,
  },
  field: { marginBottom: 16 },
  label: {
    marginBottom: 8, color: Theme.colors.brand.navySoft, fontSize: 9,
    fontFamily: Theme.typography.bold, letterSpacing: 0.8, textTransform: 'uppercase',
  },
  inputWrap: {
    height: 56, flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderColor: Theme.colors.border.default, borderRadius: 17,
    paddingHorizontal: 9, backgroundColor: Theme.colors.surface.subtle,
  },
  inputWrapFocused: {
    borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.base,
    shadowColor: Theme.colors.brand.primary, shadowOpacity: 0.10,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  inputIcon: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: 11, backgroundColor: Theme.colors.surface.muted,
  },
  inputIconFocused: { backgroundColor: Theme.colors.surface.brandSoft },
  input: {
    flex: 1, height: 54, paddingHorizontal: 11, color: Theme.colors.text.primary,
    fontSize: 14, fontFamily: Theme.typography.medium,
  },
  passwordToggle: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 11,
    backgroundColor: Theme.colors.surface.base, shadowColor: Theme.colors.shadow.color,
    shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  rememberRow: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 1, marginBottom: 18, paddingVertical: 7, paddingHorizontal: 13,
    borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 17,
    backgroundColor: Theme.colors.surface.subtle,
  },
  rememberRowActive: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft },
  rememberCopy: { flex: 1 },
  rememberTitle: {
    color: Theme.colors.text.primary, fontSize: 12,
    lineHeight: 15, fontFamily: Theme.typography.semibold, letterSpacing: 0,
  },
  errorBox: {
    marginTop: -4, marginBottom: 14, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#EFBDC7', borderRadius: 13,
    backgroundColor: Theme.colors.state.errorSoft,
  },
  error: { color: Theme.colors.state.error, fontSize: 10, lineHeight: 15, fontFamily: Theme.typography.medium },
  button: {
    height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, overflow: 'hidden', borderRadius: 28, backgroundColor: '#086FBD',
  },
  buttonDisabled: { backgroundColor: '#8EBFDC' },
  buttonText: {
    color: Theme.colors.text.onBrand, fontSize: 14,
    fontFamily: Theme.typography.semibold, letterSpacing: 0.15,
  },
  buttonArrow: {
    position: 'absolute', right: 12, width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center', borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
