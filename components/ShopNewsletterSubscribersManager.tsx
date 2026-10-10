import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <View style={styles.heroOrb} />
      <View style={styles.heroIcon}><MailCheck size={29} color="#09BFD9" /></View>
      <View style={styles.heroCopy}><Text style={styles.eyebrow}>NEWSLETTER CUBIS SHOP</Text><Text style={styles.heroTitle}>Clienți abonați</Text><Text style={styles.heroText}>Consimțăminte reale din checkout, starea dezabonării și livrarea ultimelor noutăți într-un singur loc.</Text></View>
      <TouchableOpacity style={styles.refresh} onPress={() => void load()} accessibilityLabel="Actualizează lista abonaților"><RefreshCw size={18} color="#EEF6FF" /></TouchableOpacity>
    </View>

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

    <View style={styles.listHead}><Text style={styles.listTitle}>{filtered.length} {filtered.length === 1 ? 'înregistrare' : 'înregistrări'}</Text><Text style={styles.listHint}>Pagina {safePage} din {totalPages}</Text></View>
    <Animated.View style={[styles.list, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) }] }]}>
      {visible.map((item) => <View key={item.id} style={[styles.card, !item.is_subscribed && styles.cardOff]}>
        <View style={[styles.avatar, !item.is_subscribed && styles.avatarOff]}><Text style={[styles.avatarText, !item.is_subscribed && styles.avatarTextOff]}>{initials(item.full_name, item.email)}</Text><View style={[styles.statusDot, !item.is_subscribed && styles.statusDotOff]} /></View>
        <View style={styles.cardBody}>
          <View style={styles.identityLine}><Text numberOfLines={1} style={styles.name}>{item.full_name || 'Client fără nume'}</Text><View style={[styles.badge, !item.is_subscribed && styles.badgeOff]}><Text style={[styles.badgeText, !item.is_subscribed && styles.badgeTextOff]}>{item.is_subscribed ? 'ABONAT' : 'DEZABONAT'}</Text></View></View>
          <View style={[styles.contactGrid, compact && styles.contactGridCompact]}><Contact Icon={Mail} value={item.email} /><Contact Icon={Phone} value={item.phone || 'Telefon necompletat'} /></View>
          <View style={styles.timeline}><View style={styles.timelineItem}><CalendarDays size={13} color="#087FF5" /><Text style={styles.timelineText}>Acord: {dateTime(item.consent_at)}</Text></View>{item.is_subscribed ? <View style={styles.timelineItem}><BellRing size={13} color="#F59E0B" /><Text style={styles.timelineText}>Ultimul e-mail: {dateTime(item.last_notified_at, 'încă netrimis')}</Text></View> : <View style={styles.timelineItem}><MailX size={13} color="#FB7185" /><Text style={styles.timelineText}>Retras: {dateTime(item.unsubscribed_at)}</Text></View>}</View>
          {item.last_error ? <View style={styles.error}><Text numberOfLines={2} style={styles.errorText}>Ultima trimitere: {item.last_error}</Text></View> : null}
        </View>
      </View>)}
      {!visible.length ? <View style={styles.empty}><MailCheck size={30} color="#087FF5" /><Text style={styles.emptyTitle}>Nicio înregistrare aici</Text><Text style={styles.emptyText}>{query ? 'Schimbă termenul de căutare.' : 'Abonații vor apărea automat după ce bifează opțiunea la checkout.'}</Text></View> : null}
    </Animated.View>

    {totalPages > 1 ? <View style={styles.pagination}><TouchableOpacity disabled={safePage === 1} style={[styles.pageButton, safePage === 1 && styles.disabled]} onPress={() => setPage((current) => Math.max(1, current - 1))}><Text style={styles.pageButtonText}>‹</Text></TouchableOpacity><View style={styles.pageStatus}><Text style={styles.pageStatusText}>{safePage} / {totalPages}</Text></View><TouchableOpacity disabled={safePage === totalPages} style={[styles.pageButton, safePage === totalPages && styles.disabled]} onPress={() => setPage((current) => Math.min(totalPages, current + 1))}><Text style={styles.pageButtonText}>›</Text></TouchableOpacity></View> : null}
  </View>;
}

function Metric({ Icon, label, value, color, note }: { Icon: typeof UserRound; label: string; value: number; color: string; note: string }) {
  return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}17` }]}><Icon size={21} color={color} /></View><View style={styles.metricCopy}><Text style={[styles.metricLabel, { color }]}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricNote}>{note}</Text></View></View>;
}

function Contact({ Icon, value }: { Icon: typeof Mail; value: string }) {
  return <View style={styles.contact}><Icon size={14} color="#8D858C" /><Text selectable numberOfLines={1} style={styles.contactText}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { padding: 14, gap: 12 },
  loading: { minHeight: 380, alignItems: 'center', justifyContent: 'center', gap: 8 }, loadingTitle: { marginTop: 8, color: Theme.colors.text.primary, fontSize: 17, fontWeight: '900' }, loadingText: { color: Theme.colors.text.muted, fontSize: 11, textAlign: 'center' },
  hero: { minHeight: 146, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 15, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 28, backgroundColor: Theme.colors.surface.base }, heroCompact: { minHeight: 176, alignItems: 'flex-start', paddingTop: 24 }, heroOrb: { width: 250, height: 250, position: 'absolute', right: -90, top: -130, borderRadius: 125, backgroundColor: Theme.colors.surface.brandSoft }, heroIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#09BFD945', borderRadius: 20, backgroundColor: Theme.colors.surface.brandSoft }, heroCopy: { minWidth: 0, flex: 1 }, eyebrow: { color: Theme.colors.brand.primaryText, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, heroTitle: { marginTop: 5, color: Theme.colors.text.primary, fontSize: 29, fontWeight: '900', letterSpacing: -1 }, heroText: { maxWidth: 660, marginTop: 5, color: '#9A918B', fontSize: 11, lineHeight: 17 }, refresh: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft },
  metrics: { flexDirection: 'row', gap: 9 }, metricsCompact: { flexDirection: 'column' }, metric: { minHeight: 92, padding: 13, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 20, backgroundColor: Theme.colors.surface.base }, metricIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, metricCopy: { minWidth: 0, flex: 1 }, metricLabel: { fontSize: 8, fontWeight: '900', letterSpacing: .9 }, metricValue: { marginTop: 1, color: Theme.colors.text.primary, fontSize: 21, fontWeight: '900' }, metricNote: { color: Theme.colors.text.muted, fontSize: 9 },
  controls: { padding: 10, gap: 9, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.base }, search: { minHeight: 50, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.base }, searchInput: { minWidth: 0, flex: 1, color: Theme.colors.text.primary, fontSize: 12, fontWeight: '700' }, clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Theme.colors.surface.muted }, filters: { flexDirection: 'row', gap: 6 }, filter: { minHeight: 39, paddingHorizontal: 11, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, backgroundColor: Theme.colors.surface.muted }, filterActive: { backgroundColor: Theme.colors.brand.primaryAction }, filterText: { color: '#A49CA4', fontSize: 9, fontWeight: '900' }, filterTextActive: { color: Theme.colors.brand.navy }, filterCount: { minWidth: 21, height: 21, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: Theme.colors.surface.muted }, filterCountActive: { backgroundColor: Theme.colors.surface.muted }, filterCountText: { color: '#CAC2CA', fontSize: 8, fontWeight: '900' }, filterCountTextActive: { color: Theme.colors.brand.navy },
  listHead: { paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, listTitle: { color: Theme.colors.text.primary, fontSize: 14, fontWeight: '900' }, listHint: { color: Theme.colors.text.muted, fontSize: 9 }, list: { gap: 8 }, card: { padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 21, backgroundColor: Theme.colors.surface.base }, cardOff: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.base }, avatar: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: Theme.colors.surface.cyanSoft }, avatarOff: { backgroundColor: Theme.colors.state.errorSoft }, avatarText: { color: Theme.colors.state.success, fontSize: 15, fontWeight: '900' }, avatarTextOff: { color: '#FDA4B7' }, statusDot: { width: 10, height: 10, position: 'absolute', right: -2, bottom: -2, borderWidth: 2, borderColor: Theme.colors.border.default, borderRadius: 5, backgroundColor: Theme.colors.state.successBright }, statusDotOff: { borderColor: Theme.colors.border.default, backgroundColor: '#FB7185' }, cardBody: { minWidth: 0, flex: 1 }, identityLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, name: { minWidth: 0, flexShrink: 1, color: Theme.colors.text.primary, fontSize: 13, fontWeight: '900' }, badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: Theme.colors.surface.cyanSoft }, badgeOff: { backgroundColor: Theme.colors.state.errorSoft }, badgeText: { color: '#58E09F', fontSize: 7, fontWeight: '900', letterSpacing: .5 }, badgeTextOff: { color: '#FB8EA5' }, contactGrid: { marginTop: 8, flexDirection: 'row', gap: 7 }, contactGridCompact: { flexDirection: 'column' }, contact: { minWidth: 0, flex: 1, paddingHorizontal: 9, minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: Theme.colors.surface.base }, contactText: { minWidth: 0, flex: 1, color: '#BEB5BC', fontSize: 9, fontWeight: '700' }, timeline: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, timelineText: { color: Theme.colors.text.muted, fontSize: 8 }, error: { marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: Theme.colors.state.errorSoft }, errorText: { color: Theme.colors.state.error, fontSize: 8, lineHeight: 12 }, empty: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: Theme.colors.border.default, borderRadius: 22 }, emptyTitle: { color: Theme.colors.text.primary, fontSize: 15, fontWeight: '900' }, emptyText: { maxWidth: 310, color: Theme.colors.text.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' }, pagination: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, pageButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Theme.colors.surface.brandSoft }, pageButtonText: { color: Theme.colors.brand.primaryText, fontSize: 22, fontWeight: '900' }, pageStatus: { minWidth: 62, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Theme.colors.surface.muted }, pageStatusText: { color: '#CFC7CE', fontSize: 10, fontWeight: '900' }, disabled: { opacity: .28 },
});
