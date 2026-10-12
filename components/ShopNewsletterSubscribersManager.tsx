import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  Mail,
  MailCheck,
  MailX,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react-native';
import useAndroidSearchBack from '@/hooks/useAndroidSearchBack';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopNewsletterSubscriber } from '@/services/shopApi';

type Filter = 'all' | 'subscribed' | 'unsubscribed';
const PAGE_SIZE = 10;

const dateTime = (value?: string | null, fallback = '—') => value
  ? new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value.replace(' ', 'T')))
  : fallback;

const consentSourceLabel = (source?: string | null) => {
  const value = String(source || '').toLowerCase();
  if (value.startsWith('website_newsletter')) return 'Newsletter website';
  if (value === 'checkout_historical') return 'Checkout · istoric';
  if (value === 'checkout') return 'Checkout';
  return 'Consimțământ';
};

function initials(name: string, email: string) {
  const source = String(name || '').trim() || email.split('@')[0] || 'A';
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
}

export default function ShopNewsletterSubscribersManager({ onSearchFocus }: { onSearchFocus?: () => void }) {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const [items, setItems] = useState<ShopNewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [reveal] = useState(() => new Animated.Value(0));
  useAndroidSearchBack(query, useCallback(() => setQuery(''), []));

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await shopApi.listNewsletterSubscribers(token);
      setItems(Array.isArray(response) ? response : []);
    } catch (error) {
      Alert.alert('Abonații nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  const totals = useMemo(() => ({
    subscribed: items.filter((item) => item.is_subscribed).length,
    unsubscribed: items.filter((item) => !item.is_subscribed).length,
    notified: items.filter((item) => Boolean(item.last_notified_at)).length,
  }), [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro-RO');
    return items.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!needle) return true;
      return [item.full_name, item.email, item.phone].some((value) => String(value || '').toLocaleLowerCase('ro-RO').includes(needle));
    });
  }, [filter, items, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [filter, query, reveal, safePage]);

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.orange} /><Text style={styles.loadingTitle}>Se pregătește lista de abonați</Text><Text style={styles.loadingText}>Citirea stării newsletterului și a datelor de contact</Text></View>;

  return <View style={styles.page}>
    <LinearGradient colors={['#FFFFFF', '#F1FBF7', '#EEF6FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, compact && styles.heroCompact]}>
      <View style={styles.heroOrb} />
      <View style={styles.heroIcon}><MailCheck size={27} color="#0B9E70" /></View>
      <View style={styles.heroCopy}><Text style={styles.eyebrow}>NEWSLETTER CUBIS SHOP</Text><Text style={styles.heroTitle}>Comunitatea magazinului</Text><Text style={styles.heroText}>Abonări, consimțăminte și istoricul ultimelor notificări.</Text></View>
      <TouchableOpacity activeOpacity={0.72} style={styles.refresh} onPress={() => void load()} accessibilityLabel="Actualizează lista abonaților"><RefreshCw size={18} color="#087C54" /></TouchableOpacity>
    </LinearGradient>

    <View style={[styles.metrics, compact && styles.metricsCompact]}>
      <Metric Icon={CheckCircle2} label="ABONAȚI" value={totals.subscribed} color="#34D399" note="primesc noutățile" />
      <Metric Icon={MailX} label="DEZABONAȚI" value={totals.unsubscribed} color="#FB7185" note="nu mai primesc mesaje" />
      <Metric Icon={BellRing} label="NOTIFICAȚI" value={totals.notified} color="#F59E0B" note="au primit cel puțin un produs" />
    </View>

    <View style={styles.controls}>
      <View style={styles.search}><Search size={18} color="#087FF5" /><TextInput value={query} onFocus={onSearchFocus} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Nume, e-mail sau telefon" placeholderTextColor="#6D676D" style={styles.searchInput} />{query ? <TouchableOpacity style={styles.clear} onPress={() => { setQuery(''); setPage(1); }}><X size={16} color="#D6CDD5" /></TouchableOpacity> : null}</View>
      <View style={styles.filters}>{([
        ['all', 'Toți', items.length],
        ['subscribed', 'Abonați', totals.subscribed],
        ['unsubscribed', 'Dezabonați', totals.unsubscribed],
      ] as const).map(([key, label, count]) => <TouchableOpacity key={key} style={[styles.filter, filter === key && styles.filterActive]} onPress={() => { setFilter(key); setPage(1); }}><Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text><View style={[styles.filterCount, filter === key && styles.filterCountActive]}><Text style={[styles.filterCountText, filter === key && styles.filterCountTextActive]}>{count}</Text></View></TouchableOpacity>)}</View>
    </View>

    <View style={styles.listHead}><View><Text style={styles.listEyebrow}>LISTĂ NEWSLETTER</Text><Text style={styles.listTitle}>{filtered.length} {filtered.length === 1 ? 'persoană' : 'persoane'}</Text></View>{totalPages > 1 ? <Text style={styles.listHint}>Pagina {safePage} din {totalPages}</Text> : <View style={styles.synced}><View style={styles.syncedDot} /><Text style={styles.syncedText}>Actualizat</Text></View>}</View>
    <Animated.View style={[styles.list, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) }] }]}>
      {visible.map((item) => <View key={item.id} style={[styles.card, !item.is_subscribed && styles.cardOff]}>
        <View style={styles.cardTop}>
          <View style={[styles.avatar, !item.is_subscribed && styles.avatarOff]}><Text style={[styles.avatarText, !item.is_subscribed && styles.avatarTextOff]}>{initials(item.full_name, item.email)}</Text><View style={[styles.statusDot, !item.is_subscribed && styles.statusDotOff]} /></View>
          <View style={styles.identity}><Text numberOfLines={1} style={styles.name}>{item.full_name || 'Client fără nume'}</Text><View style={styles.emailLine}><Mail size={13} color="#698094" /><Text selectable numberOfLines={1} style={styles.emailText}>{item.email}</Text></View></View>
          <View style={[styles.badge, !item.is_subscribed && styles.badgeOff]}>{item.is_subscribed ? <CheckCircle2 size={13} color="#168457" /> : <MailX size={13} color="#C43650" />}<Text style={[styles.badgeText, !item.is_subscribed && styles.badgeTextOff]}>{item.is_subscribed ? 'Abonat' : 'Dezabonat'}</Text></View>
        </View>
        <View style={styles.cardDetails}>
          <Contact Icon={Phone} label="Telefon" value={item.phone || 'Necompletat'} />
          <Contact Icon={CalendarDays} label={consentSourceLabel(item.consent_source)} value={dateTime(item.consent_at)} />
        </View>
        <View style={[styles.activity, !item.is_subscribed && styles.activityOff]}>{item.is_subscribed ? <BellRing size={15} color="#9B6100" /> : <MailX size={15} color="#C43650" />}<View style={styles.activityCopy}><Text style={styles.activityLabel}>{item.is_subscribed ? 'Ultima notificare' : 'Dezabonare'}</Text><Text style={styles.activityValue}>{item.is_subscribed ? dateTime(item.last_notified_at, 'Nicio notificare trimisă') : dateTime(item.unsubscribed_at)}</Text></View></View>
        {item.last_error ? <View style={styles.error}><View style={styles.errorIcon}><X size={13} color="#C43650" /></View><Text numberOfLines={3} style={styles.errorText}>{item.last_error}</Text></View> : null}
      </View>)}
      {!visible.length ? <View style={styles.empty}><MailCheck size={30} color="#087FF5" /><Text style={styles.emptyTitle}>Nicio înregistrare aici</Text><Text style={styles.emptyText}>{query ? 'Schimbă termenul de căutare.' : 'Abonații vor apărea automat după abonarea din website sau din checkout.'}</Text></View> : null}
    </Animated.View>

    {filtered.length ? <View style={styles.pagination}><TouchableOpacity disabled={safePage === 1} style={[styles.pageButton, safePage === 1 && styles.disabled]} onPress={() => setPage((current) => Math.max(1, current - 1))}><Text style={styles.pageButtonText}>‹</Text></TouchableOpacity><View style={styles.pageStatus}><Text style={styles.pageStatusText}>{safePage} / {totalPages}</Text></View><TouchableOpacity disabled={safePage === totalPages} style={[styles.pageButton, safePage === totalPages && styles.disabled]} onPress={() => setPage((current) => Math.min(totalPages, current + 1))}><Text style={styles.pageButtonText}>›</Text></TouchableOpacity></View> : null}
  </View>;
}

function Metric({ Icon, label, value, color, note }: { Icon: typeof UserRound; label: string; value: number; color: string; note: string }) {
  return <View style={[styles.metric, { borderColor: `${color}25`, backgroundColor: `${color}0B` }]}><View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}><Icon size={19} color={color} /></View><View style={styles.metricCopy}><Text style={[styles.metricLabel, { color }]}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text numberOfLines={2} style={styles.metricNote}>{note}</Text></View></View>;
}

function Contact({ Icon, label, value }: { Icon: typeof Mail; label: string; value: string }) {
  return <View style={styles.contact}><View style={styles.contactIcon}><Icon size={14} color="#087FF5" /></View><View style={styles.contactCopy}><Text style={styles.contactLabel}>{label}</Text><Text selectable numberOfLines={1} style={styles.contactText}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  page: { padding: 12, gap: 12 },
  loading: { minHeight: 380, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingTitle: { marginTop: 8, color: Theme.colors.text.primary, fontSize: 17, fontWeight: '900' },
  loadingText: { color: Theme.colors.text.muted, fontSize: 11, textAlign: 'center' },
  hero: { minHeight: 138, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#CFE9DF', borderRadius: 27, ...Theme.shadow.card },
  heroCompact: { minHeight: 128, padding: 16, gap: 11 },
  heroOrb: { width: 190, height: 190, position: 'absolute', right: -76, top: -105, borderWidth: 26, borderColor: '#14A8730A', borderRadius: 95 },
  heroIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#14A87332', borderRadius: 18, backgroundColor: '#EAF9F3' },
  heroCopy: { minWidth: 0, flex: 1 },
  eyebrow: { color: '#087C54', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { marginTop: 4, color: Theme.colors.text.primary, fontSize: 20, fontWeight: '900', letterSpacing: -.5 },
  heroText: { maxWidth: 520, marginTop: 5, color: Theme.colors.text.muted, fontSize: 10, lineHeight: 14 },
  refresh: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#14A8732B', borderRadius: 14, backgroundColor: '#FFFFFFE8' },
  metrics: { padding: 6, flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 23, backgroundColor: '#FFFFFF', ...Theme.shadow.card },
  metricsCompact: { flexDirection: 'row' },
  metric: { minHeight: 105, paddingHorizontal: 6, paddingVertical: 9, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 17 },
  metricIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  metricCopy: { minWidth: 0, alignItems: 'center' },
  metricLabel: { marginTop: 6, fontSize: 7, fontWeight: '900', letterSpacing: .45, textAlign: 'center' },
  metricValue: { marginTop: 1, color: Theme.colors.text.primary, fontSize: 21, fontWeight: '900', lineHeight: 23 },
  metricNote: { minHeight: 22, color: Theme.colors.text.muted, fontSize: 7, lineHeight: 10, textAlign: 'center' },
  controls: { padding: 8, gap: 8, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card },
  search: { minHeight: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.strong, borderRadius: 16, backgroundColor: Theme.colors.surface.subtle },
  searchInput: { minWidth: 0, flex: 1, color: Theme.colors.text.primary, fontSize: 13, fontWeight: '700' },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Theme.colors.surface.muted },
  filters: { padding: 4, flexDirection: 'row', gap: 4, borderRadius: 15, backgroundColor: Theme.colors.surface.muted },
  filter: { minHeight: 40, paddingHorizontal: 6, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12 },
  filterActive: { backgroundColor: '#087C54' },
  filterText: { color: Theme.colors.text.muted, fontSize: 9, fontWeight: '900' },
  filterTextActive: { color: '#FFFFFF' },
  filterCount: { minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#FFFFFF' },
  filterCountActive: { backgroundColor: '#EAF9F3' },
  filterCountText: { color: Theme.colors.text.muted, fontSize: 8, fontWeight: '900' },
  filterCountTextActive: { color: '#087C54' },
  listHead: { paddingHorizontal: 3, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  listEyebrow: { color: '#087C54', fontSize: 7, fontWeight: '900', letterSpacing: .9 },
  listTitle: { marginTop: 2, color: Theme.colors.text.primary, fontSize: 16, fontWeight: '900' },
  listHint: { color: Theme.colors.text.muted, fontSize: 9 },
  synced: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  syncedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.colors.state.successBright },
  syncedText: { color: Theme.colors.text.muted, fontSize: 9, fontWeight: '700' },
  list: { gap: 10 },
  card: { padding: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#CEE8DD', borderRadius: 23, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card },
  cardOff: { borderColor: Theme.colors.border.default },
  cardTop: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BDE8D4', borderRadius: 16, backgroundColor: '#EAF9F3' },
  avatarOff: { borderColor: '#F6CBD4', backgroundColor: Theme.colors.state.errorSoft },
  avatarText: { color: Theme.colors.state.success, fontSize: 15, fontWeight: '900' },
  avatarTextOff: { color: Theme.colors.state.error },
  statusDot: { width: 10, height: 10, position: 'absolute', right: -2, bottom: -2, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 5, backgroundColor: Theme.colors.state.successBright },
  statusDotOff: { backgroundColor: Theme.colors.state.errorBright },
  identity: { minWidth: 0, flex: 1 },
  name: { color: Theme.colors.text.primary, fontSize: 14, fontWeight: '900' },
  emailLine: { minWidth: 0, marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  emailText: { minWidth: 0, flex: 1, color: Theme.colors.text.secondary, fontSize: 9, fontWeight: '700' },
  badge: { minHeight: 30, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#BDE8D4', borderRadius: 99, backgroundColor: Theme.colors.state.successSoft },
  badgeOff: { borderColor: '#F6CBD4', backgroundColor: Theme.colors.state.errorSoft },
  badgeText: { color: Theme.colors.state.success, fontSize: 8, fontWeight: '900' },
  badgeTextOff: { color: Theme.colors.state.error },
  cardDetails: { marginTop: 12, flexDirection: 'row', gap: 7 },
  contact: { minWidth: 0, minHeight: 53, paddingHorizontal: 9, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 14, backgroundColor: Theme.colors.surface.subtle },
  contactIcon: { width: 29, height: 29, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Theme.colors.surface.brandSoft },
  contactCopy: { minWidth: 0, flex: 1 },
  contactLabel: { color: Theme.colors.text.muted, fontSize: 7, fontWeight: '800' },
  contactText: { marginTop: 2, color: Theme.colors.text.primary, fontSize: 8, fontWeight: '800' },
  activity: { minHeight: 48, marginTop: 8, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: Theme.colors.state.warningSoft },
  activityOff: { backgroundColor: Theme.colors.state.errorSoft },
  activityCopy: { minWidth: 0, flex: 1 },
  activityLabel: { color: Theme.colors.text.muted, fontSize: 7, fontWeight: '800' },
  activityValue: { marginTop: 1, color: Theme.colors.text.primary, fontSize: 9, fontWeight: '800' },
  error: { marginTop: 8, padding: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: '#F6CBD4', borderRadius: 14, backgroundColor: Theme.colors.state.errorSoft },
  errorIcon: { width: 24, height: 24, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#FFFFFF' },
  errorText: { minWidth: 0, flex: 1, color: Theme.colors.state.error, fontSize: 9, lineHeight: 13 },
  empty: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: '#FFFFFF' },
  emptyTitle: { color: Theme.colors.text.primary, fontSize: 15, fontWeight: '900' },
  emptyText: { maxWidth: 310, color: Theme.colors.text.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  pagination: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  pageButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Theme.colors.surface.brandSoft },
  pageButtonText: { color: Theme.colors.brand.primaryText, fontSize: 22, fontWeight: '900' },
  pageStatus: { minWidth: 62, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Theme.colors.surface.muted },
  pageStatusText: { color: Theme.colors.text.secondary, fontSize: 10, fontWeight: '900' },
  disabled: { opacity: .28 },
});
