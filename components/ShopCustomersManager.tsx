import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAndroidSearchBack from '@/hooks/useAndroidSearchBack';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ban,
  CalendarDays,
  ChevronRight,
  Mail,
  PackageCheck,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react-native';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopCustomerDetail, ShopCustomerSummary, ShopOrder } from '@/services/shopApi';

const money = (value: number) => `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} lei`;
const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value.replace(' ', 'T')))
  : 'Nicio activitate';

const orderStatus: Record<string, string> = {
  new: 'În procesare', confirmed: 'Confirmată', processing: 'În pregătire', shipped: 'Predată curierului', completed: 'Livrată', return_requested: 'Retur solicitat', return_refused: 'Retur refuzat', return_confirmed: 'Retur confirmat', refunded: 'Rambursată', cancelled: 'Anulată',
};
const CUSTOMER_PAGE_SIZE = 8;

function paginationItems(totalPages: number, currentPage: number): (number | 'ellipsis')[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 2) [2, 3].forEach((page) => pages.add(page));
  if (currentPage >= totalPages - 1) [totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
  const ordered = [...pages].filter((page) => page > 0 && page <= totalPages).sort((a, b) => a - b);
  return ordered.flatMap((page, index) => index && page - ordered[index - 1] > 1 ? ['ellipsis', page] : [page]);
}

function initials(name: string) {
  return String(name || 'Client').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}

export default function ShopCustomersManager({ onSearchFocus, onOpenOrder }: { onSearchFocus?: () => void; onOpenOrder?: (orderId: string) => void }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [items, setItems] = useState<ShopCustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  useAndroidSearchBack(query, useCallback(() => setQuery(''), []));
  const [page, setPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const [selected, setSelected] = useState<ShopCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [statusDialog, setStatusDialog] = useState<(ShopCustomerSummary | ShopCustomerDetail) | null>(null);
  const listAnimation = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await shopApi.listCustomers(token);
      setItems(Array.isArray(response) ? response : []);
    } catch (error) {
      Alert.alert('Clienții nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro-RO');
    if (!needle) return items;
    return items.filter((item) => [item.full_name, item.email, item.phone].some((value) => String(value || '').toLocaleLowerCase('ro-RO').includes(needle)));
  }, [items, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / CUSTOMER_PAGE_SIZE));
  const visibleItems = useMemo(() => filtered.slice((page - 1) * CUSTOMER_PAGE_SIZE, page * CUSTOMER_PAGE_SIZE), [filtered, page]);
  const pages = useMemo(() => paginationItems(totalPages, page), [totalPages, page]);
  const detailOrders = selected?.orders || [];
  const detailTotalPages = Math.max(1, Math.ceil(detailOrders.length / CUSTOMER_PAGE_SIZE));
  const visibleDetailOrders = detailOrders.slice((detailPage - 1) * CUSTOMER_PAGE_SIZE, detailPage * CUSTOMER_PAGE_SIZE);
  const detailPages = paginationItems(detailTotalPages, detailPage);

  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);
  useEffect(() => { setDetailPage((current) => Math.min(current, detailTotalPages)); }, [detailTotalPages]);
  useEffect(() => {
    listAnimation.setValue(0);
    Animated.timing(listAnimation, { toValue: 1, duration: 190, useNativeDriver: true }).start();
  }, [listAnimation, page, query]);

  const totals = useMemo(() => ({
    active: items.filter((item) => item.is_active).length,
    orders: items.reduce((sum, item) => sum + item.orders_count, 0),
    value: items.reduce((sum, item) => sum + item.orders_total, 0),
  }), [items]);

  const openCustomer = async (id: string) => {
    if (!token) return;
    setDetailLoading(true);
    try { setDetailPage(1); setSelected(await shopApi.getCustomer(token, id)); }
    catch (error) { Alert.alert('Fișa nu s-a putut deschide', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setDetailLoading(false); }
  };

  const saveStatus = async (customer: ShopCustomerSummary | ShopCustomerDetail, next: boolean) => {
    if (!token || statusSaving) return;
    setStatusSaving(customer.id);
    try {
      await shopApi.updateCustomerStatus(token, customer.id, next);
      setItems((current) => current.map((item) => item.id === customer.id ? { ...item, is_active: next } : item));
      setSelected((current) => current?.id === customer.id ? { ...current, is_active: next } : current);
      setStatusDialog(null);
    } catch (error) {
      Alert.alert('Starea nu s-a putut modifica', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setStatusSaving(null); }
  };

  const changeStatus = (customer: ShopCustomerSummary | ShopCustomerDetail, next: boolean) => {
    if (next) return void saveStatus(customer, true);
    setStatusDialog(customer);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={Colors.orange} /><Text style={styles.loadingTitle}>Se pregătesc clienții</Text><Text style={styles.loadingText}>Conturi, comenzi și valori cumulate</Text></View>;

  return <View style={[styles.page, !compact && styles.pageWide]}>
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <View style={styles.heroGlow} />
      <View style={[styles.heroIcon, compact && styles.heroIconCompact]}><UsersRound size={compact ? 24 : 27} color="#087FF5" /></View>
      <View style={styles.heroCopy}><Text style={styles.eyebrow}>RELAȚII CU CLIENȚII</Text><Text style={styles.heroTitle}>Clienți</Text><Text style={styles.heroText}>Vezi istoricul complet și controlează în siguranță accesul fiecărui cont.</Text></View>
      <TouchableOpacity style={styles.refresh} onPress={() => void load()} accessibilityLabel="Actualizează clienții"><RefreshCw size={18} color={Colors.white} /></TouchableOpacity>
    </View>

    <View style={[styles.metrics, compact && styles.metricsCompact]}>
      <Metric compact={compact} Icon={UserRound} color="#087FF5" label="CLIENȚI" value={String(items.length)} note={`${totals.active} activi`} />
      <Metric compact={compact} Icon={ShoppingBag} color="#087FF5" label="COMENZI" value={String(totals.orders)} note="înregistrate" />
      <Metric compact={compact} Icon={WalletCards} color="#168457" label="VALOARE" value={money(totals.value)} note="comenzi valide" />
    </View>

    <View style={styles.searchBox}><Search size={19} color="#087FF5" /><View style={styles.searchCopy}><Text style={styles.searchLabel}>CAUTĂ UN CLIENT</Text><TextInput value={query} onFocus={onSearchFocus} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Nume, adresă de e-mail sau telefon" placeholderTextColor="#69636D" style={styles.searchInput} /></View>{query ? <TouchableOpacity style={styles.clear} onPress={() => { setQuery(''); setPage(1); }}><X size={17} color="#CFC8D1" /></TouchableOpacity> : null}</View>

    <View style={styles.listHead}><Text style={styles.listTitle}>{filtered.length} {filtered.length === 1 ? 'client' : 'clienți'}</Text><Text style={styles.listHint}>{filtered.length ? `Pagina ${page} din ${totalPages}` : 'Caută după datele clientului'}</Text></View>
    <Animated.View style={[styles.list, !compact && styles.listWide, { opacity: listAnimation, transform: [{ translateY: listAnimation.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
      {visibleItems.map((item) => <TouchableOpacity key={item.id} style={[styles.card, !compact && styles.cardWide, !item.is_active && styles.cardDisabled]} onPress={() => void openCustomer(item.id)} activeOpacity={0.72}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(item.full_name)}</Text><View style={[styles.statusDot, !item.is_active && styles.statusDotOff]} /></View>
        <View style={styles.cardCopy}><View style={styles.nameLine}><Text numberOfLines={1} style={styles.customerName}>{item.full_name}</Text><View style={[styles.statusBadge, !item.is_active && styles.statusBadgeOff]}><Text style={[styles.statusBadgeText, !item.is_active && styles.statusBadgeTextOff]}>{item.is_active ? 'ACTIV' : 'OPRIT'}</Text></View></View><Text numberOfLines={1} style={styles.customerEmail}>{item.email}{item.phone ? ` · ${item.phone}` : ''}</Text><View style={styles.customerStats}><Text style={styles.customerStatStrong}>{item.orders_count} comenzi</Text><View style={styles.metaDot} /><Text style={styles.customerStatValue}>{money(item.orders_total)}</Text></View><Text numberOfLines={1} style={styles.customerMeta}>Ultima activitate: {dateTime(item.last_order_at)}</Text></View>
        {!compact ? <View style={styles.inlineSwitch}><Text style={styles.inlineSwitchLabel}>{item.is_active ? 'Acces permis' : 'Acces blocat'}</Text><Switch value={item.is_active} disabled={statusSaving === item.id} onValueChange={(value) => void changeStatus(item, value)} trackColor={{ false: '#F3C1CA', true: '#B8D8FA' }} thumbColor={item.is_active ? Theme.colors.brand.primaryAction : Theme.colors.state.error} /></View> : null}
        <View style={styles.openIcon}><ChevronRight size={19} color="#172B40" /></View>
      </TouchableOpacity>)}
      {!filtered.length ? <View style={styles.empty}><Search size={26} color="#087FF5" /><Text style={styles.emptyTitle}>Niciun client găsit</Text><Text style={styles.emptyText}>Încearcă alt nume, e-mail sau număr de telefon.</Text></View> : null}
    </Animated.View>
    {filtered.length ? <View style={styles.pagination}>
      <TouchableOpacity accessibilityLabel="Pagina anterioară" disabled={page === 1} style={[styles.pageDirection, page === 1 && styles.pageDisabled]} onPress={() => setPage((current) => Math.max(1, current - 1))}><Text style={styles.pageDirectionText}>‹</Text></TouchableOpacity>
      {pages.map((item, index) => item === 'ellipsis' ? <Text key={`ellipsis-${index}`} style={styles.pageEllipsis}>…</Text> : <TouchableOpacity key={item} style={[styles.pageButton, page === item && styles.pageButtonActive]} onPress={() => setPage(item)}><Text style={[styles.pageButtonText, page === item && styles.pageButtonTextActive]}>{item}</Text></TouchableOpacity>)}
      <TouchableOpacity accessibilityLabel="Pagina următoare" disabled={page === totalPages} style={[styles.pageDirection, page === totalPages && styles.pageDisabled]} onPress={() => setPage((current) => Math.min(totalPages, current + 1))}><Text style={styles.pageDirectionText}>›</Text></TouchableOpacity>
    </View> : null}

    <Modal visible={Boolean(selected) || detailLoading} transparent animationType="fade" onRequestClose={() => !detailLoading && setSelected(null)}>
      <View style={[styles.backdrop, compact && styles.backdropCompact]}>
        <View style={[styles.sheet, compact && styles.sheetCompact, { paddingBottom: Math.max(16, insets.bottom) }]}>
          {detailLoading && !selected ? <View style={styles.detailLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.loadingTitle}>Se deschide fișa clientului</Text></View> : selected ? <>
            <View style={styles.sheetHeader}><View style={styles.sheetAvatar}><Text style={styles.sheetAvatarText}>{initials(selected.full_name)}</Text></View><View style={styles.sheetHeadCopy}><Text style={styles.sheetKicker}>FIȘĂ CLIENT</Text><Text numberOfLines={1} style={styles.sheetTitle}>{selected.full_name}</Text><Text numberOfLines={1} style={styles.sheetEmail}>{selected.email}</Text></View><TouchableOpacity style={styles.close} onPress={() => setSelected(null)}><X size={20} color="#172B40" /></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
              <View style={[styles.accessCard, !selected.is_active && styles.accessCardOff]}><View style={[styles.accessIcon, !selected.is_active && styles.accessIconOff]}>{selected.is_active ? <ShieldCheck size={23} color={Theme.colors.state.success} /> : <Ban size={23} color={Theme.colors.state.error} />}</View><View style={styles.accessCopy}><Text style={styles.accessTitle}>{selected.is_active ? 'Cont activ' : 'Cont dezactivat'}</Text><Text style={styles.accessText}>{selected.is_active ? 'Clientul se poate autentifica și își poate administra contul.' : 'Autentificarea este blocată, iar sesiunile au fost închise.'}</Text></View><Switch value={selected.is_active} disabled={statusSaving === selected.id} onValueChange={(value) => void changeStatus(selected, value)} trackColor={{ false: '#F3C1CA', true: '#BCE8D4' }} thumbColor={selected.is_active ? Theme.colors.state.success : Theme.colors.state.error} /></View>
              {!selected.is_active ? <View style={styles.disabledPreview}><View style={styles.disabledPreviewMark}>!</View><View><Text style={styles.disabledPreviewLabel}>MESAJ AFIȘAT CLIENTULUI</Text><Text style={styles.disabledPreviewText}>Acest cont a fost dezactivat. Contactează Cubis Shop pentru mai multe detalii.</Text></View></View> : null}

              <View style={styles.contactGrid}><InfoCard Icon={Mail} label="E-MAIL" value={selected.email} color="#087FF5" /><InfoCard Icon={Phone} label="TELEFON" value={selected.phone || 'Necompletat'} color="#34D399" /><InfoCard Icon={CalendarDays} label="CLIENT DIN" value={dateTime(selected.created_at)} color="#087FF5" /><InfoCard Icon={PackageCheck} label="ULTIMA COMANDĂ" value={dateTime(selected.last_order_at)} color="#09BFD9" /></View>
              <View style={styles.detailMetrics}><View style={styles.detailMetric}><Text style={styles.detailMetricLabel}>TOTAL COMENZI</Text><Text style={styles.detailMetricValue}>{selected.orders_count}</Text></View><View style={styles.detailMetric}><Text style={styles.detailMetricLabel}>VALOARE TOTALĂ</Text><Text style={styles.detailMetricValue}>{money(selected.orders_total)}</Text></View></View>
              <View style={styles.ordersHead}><View><Text style={styles.ordersKicker}>ISTORIC COMERCIAL</Text><Text style={styles.ordersTitle}>Comenzile clientului</Text></View><View style={styles.ordersCount}><Text style={styles.ordersCountText}>{selected.orders.length}</Text></View></View>
              <View style={styles.ordersList}>{visibleDetailOrders.map((order) => <OrderCard key={order.id} order={order} onPress={() => { setSelected(null); onOpenOrder?.(order.id); }} />)}{!selected.orders.length ? <View style={styles.emptyOrders}><ShoppingBag size={22} color="#087FF5" /><Text style={styles.emptyOrdersText}>Clientul nu are încă nicio comandă.</Text></View> : null}</View>
              {detailOrders.length ? <View style={styles.pagination}><TouchableOpacity accessibilityLabel="Pagina anterioară a comenzilor" disabled={detailPage === 1} style={[styles.pageDirection, detailPage === 1 && styles.pageDisabled]} onPress={() => setDetailPage((current) => Math.max(1, current - 1))}><Text style={styles.pageDirectionText}>‹</Text></TouchableOpacity>{detailPages.map((item, index) => item === 'ellipsis' ? <Text key={`detail-ellipsis-${index}`} style={styles.pageEllipsis}>…</Text> : <TouchableOpacity key={`detail-page-${item}`} style={[styles.pageButton, detailPage === item && styles.pageButtonActive]} onPress={() => setDetailPage(item)}><Text style={[styles.pageButtonText, detailPage === item && styles.pageButtonTextActive]}>{item}</Text></TouchableOpacity>)}<TouchableOpacity accessibilityLabel="Pagina următoare a comenzilor" disabled={detailPage === detailTotalPages} style={[styles.pageDirection, detailPage === detailTotalPages && styles.pageDisabled]} onPress={() => setDetailPage((current) => Math.min(detailTotalPages, current + 1))}><Text style={styles.pageDirectionText}>›</Text></TouchableOpacity></View> : null}
            </ScrollView>
          </> : null}
        </View>
      </View>
    </Modal>

    <Modal visible={Boolean(statusDialog)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !statusSaving && setStatusDialog(null)}>
      <View style={styles.confirmBackdrop}>
        <View style={[styles.confirmCard, compact && styles.confirmCardCompact, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          <View style={[styles.confirmHandle, compact && styles.confirmHandleCompact]} />
          <View style={styles.confirmIcon}><Ban size={26} color={Theme.colors.state.error} /></View>
          <Text style={styles.confirmKicker}>CONTROL ACCES</Text>
          <Text style={styles.confirmTitle}>Dezactivezi contul?</Text>
          <Text style={styles.confirmText}><Text style={styles.confirmName}>{statusDialog?.full_name || statusDialog?.email}</Text> va fi deconectat imediat. Istoricul comenzilor și toate datele comerciale rămân păstrate.</Text>
          <View style={styles.confirmNotice}><ShieldCheck size={18} color={Theme.colors.brand.primaryText} /><Text style={styles.confirmNoticeText}>Poți reactiva contul oricând din aceeași fișă.</Text></View>
          <View style={styles.confirmActions}>
            <TouchableOpacity disabled={Boolean(statusSaving)} style={styles.confirmCancel} onPress={() => setStatusDialog(null)}><Text style={styles.confirmCancelText}>Păstrează activ</Text></TouchableOpacity>
            <TouchableOpacity disabled={Boolean(statusSaving)} style={[styles.confirmDanger, Boolean(statusSaving) && styles.actionDisabled]} onPress={() => statusDialog && void saveStatus(statusDialog, false)}>{statusSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ban size={17} color="#FFFFFF" />}<Text style={styles.confirmDangerText}>{statusSaving ? 'Se dezactivează…' : 'Dezactivează'}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

function Metric({ Icon, color, label, value, note, compact }: { Icon: typeof UserRound; color: string; label: string; value: string; note: string; compact: boolean }) {
  return <View style={[styles.metric, compact && styles.metricCompact]}><View style={[styles.metricIcon, compact && styles.metricIconCompact, { backgroundColor: `${color}18` }]}><Icon size={compact ? 18 : 21} color={color} /></View><View style={styles.metricCopy}><Text style={[styles.metricLabel, { color }]}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58} style={[styles.metricValue, compact && styles.metricValueCompact]}>{value}</Text><Text numberOfLines={1} style={styles.metricNote}>{note}</Text></View></View>;
}

function InfoCard({ Icon, label, value, color }: { Icon: typeof Mail; label: string; value: string; color: string }) {
  return <View style={styles.infoCard}><View style={[styles.infoIcon, { backgroundColor: `${color}16` }]}><Icon size={18} color={color} /></View><View style={styles.infoCopy}><Text style={styles.infoLabel}>{label}</Text><Text numberOfLines={2} style={styles.infoValue}>{value}</Text></View></View>;
}

function OrderCard({ order, onPress }: { order: ShopOrder; onPress: () => void }) {
  return <TouchableOpacity style={styles.orderCard} activeOpacity={0.74} accessibilityRole="button" accessibilityLabel={`Deschide comanda ${order.order_number}`} onPress={onPress}><View style={styles.orderTop}><View style={styles.orderIdentity}><Text style={styles.orderNumber}>{order.order_number}</Text><Text style={styles.orderDate}>{dateTime(order.created_at)}</Text></View><View style={styles.orderAmount}><Text style={styles.orderAmountValue}>{money(order.total)}</Text><Text style={styles.orderStatus}>{orderStatus[order.status] || order.status}</Text></View><View style={styles.orderOpen}><ChevronRight size={18} color="#09BFD9" /></View></View><View style={styles.orderProducts}>{order.items?.slice(0, 3).map((item) => <View key={item.id} style={styles.orderProduct}><View style={styles.productThumb}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productThumbImage} resizeMode="contain" /> : <Text style={styles.productThumbText}>{item.product_name?.[0]?.toUpperCase() || 'P'}</Text>}</View><View style={styles.productCopy}><Text numberOfLines={1} style={styles.productName}>{item.product_name}</Text><Text style={styles.productMeta}>{item.quantity} × {money(item.unit_price)}</Text></View></View>)}</View>{order.items?.length > 3 ? <Text style={styles.moreProducts}>+ încă {order.items.length - 3} produse</Text> : null}</TouchableOpacity>;
}

const styles = StyleSheet.create({
  page: { width: '100%', padding: 14, gap: 13 }, pageWide: { maxWidth: 1360, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 24 }, loading: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 7 }, loadingTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900' }, loadingText: { color: Colors.textMuted, fontSize: 12 },
  hero: { minHeight: 140, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 28, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card }, heroCompact: { minHeight: 126, padding: 16, gap: 11, borderRadius: 24, shadowOpacity: 0.06 }, heroGlow: { width: 260, height: 260, position: 'absolute', right: -70, top: -150, borderRadius: 130, backgroundColor: Theme.colors.surface.brandSoft }, heroIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft }, heroIconCompact: { width: 48, height: 48, borderRadius: 16 }, heroCopy: { minWidth: 0, flex: 1 }, eyebrow: { color: Theme.colors.brand.primaryText, fontSize: 9, fontWeight: '900', letterSpacing: 1.25 }, heroTitle: { marginTop: 3, color: Theme.colors.text.primary, fontSize: 29, fontWeight: '900', letterSpacing: -1.1 }, heroText: { maxWidth: 620, marginTop: 4, color: Theme.colors.text.secondary, fontSize: 12, lineHeight: 17 }, refresh: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.brand.primaryAction, ...Theme.shadow.card },
  metrics: { flexDirection: 'row', gap: 10 }, metricsCompact: { gap: 7 }, metric: { minWidth: 0, minHeight: 96, padding: 14, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 21, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card }, metricCompact: { minHeight: 112, padding: 10, alignItems: 'flex-start', flexDirection: 'column', gap: 7, borderRadius: 18, shadowOpacity: .05 }, metricIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, metricIconCompact: { width: 34, height: 34, borderRadius: 11 }, metricCopy: { minWidth: 0, flexShrink: 1 }, metricLabel: { fontSize: 8, fontWeight: '900', letterSpacing: .9 }, metricValue: { maxWidth: 200, marginTop: 2, color: Theme.colors.text.primary, fontSize: 18, fontWeight: '900' }, metricValueCompact: { maxWidth: 86, fontSize: 16 }, metricNote: { marginTop: 2, color: Theme.colors.text.muted, fontSize: 9 },
  searchBox: { minHeight: 72, padding: 10, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 21, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card }, searchCopy: { minWidth: 0, flex: 1 }, searchLabel: { color: Theme.colors.brand.primaryText, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, searchInput: { height: 31, padding: 0, color: Theme.colors.text.primary, fontSize: 14, fontWeight: '700' }, clear: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.muted },
  listHead: { paddingHorizontal: 4, paddingTop: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, listTitle: { color: Theme.colors.text.primary, fontSize: 15, fontWeight: '900' }, listHint: { color: Theme.colors.text.muted, fontSize: 10 }, list: { gap: 9 }, listWide: { flexDirection: 'row', flexWrap: 'wrap' }, card: { minHeight: 108, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card }, cardWide: { width: '49%', flexGrow: 1, minWidth: 430 }, cardDisabled: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.subtle, opacity: .86 }, avatar: { width: 55, height: 55, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 18, backgroundColor: Theme.colors.surface.brandSoft }, avatarText: { color: Theme.colors.brand.primaryText, fontSize: 16, fontWeight: '900' }, statusDot: { width: 11, height: 11, position: 'absolute', right: -2, bottom: -2, borderWidth: 2, borderColor: Theme.colors.surface.base, borderRadius: 6, backgroundColor: Theme.colors.state.successBright }, statusDotOff: { backgroundColor: Theme.colors.state.errorBright }, cardCopy: { minWidth: 0, flex: 1, gap: 3 }, nameLine: { flexDirection: 'row', alignItems: 'center', gap: 7 }, customerName: { minWidth: 0, flexShrink: 1, color: Theme.colors.text.primary, fontSize: 14, fontWeight: '900' }, statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, backgroundColor: Theme.colors.state.successSoft }, statusBadgeOff: { backgroundColor: Theme.colors.state.errorSoft }, statusBadgeText: { color: Theme.colors.state.success, fontSize: 7, fontWeight: '900', letterSpacing: .4 }, statusBadgeTextOff: { color: Theme.colors.state.error }, customerEmail: { color: Theme.colors.text.secondary, fontSize: 10 }, customerStats: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }, customerStatStrong: { color: Theme.colors.text.secondary, fontSize: 9, fontWeight: '800' }, customerStatValue: { color: Theme.colors.brand.primaryText, fontSize: 9, fontWeight: '900' }, metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Theme.colors.border.strong }, customerMeta: { color: Theme.colors.text.muted, fontSize: 8.5 }, inlineSwitch: { alignItems: 'flex-end', gap: 4 }, inlineSwitchLabel: { color: Theme.colors.text.muted, fontSize: 8, fontWeight: '700' }, openIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft }, empty: { minHeight: 220, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.base }, emptyTitle: { color: Theme.colors.text.primary, fontSize: 15, fontWeight: '900' }, emptyText: { color: Theme.colors.text.muted, fontSize: 11 },
  pagination: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 4 }, pageButton: { minWidth: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 11, backgroundColor: Theme.colors.surface.muted }, pageButtonActive: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.brand.primaryAction }, pageButtonText: { color: Theme.colors.text.muted, fontSize: 11, fontWeight: '900' }, pageButtonTextActive: { color: Theme.colors.text.onBrand }, pageDirection: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: Theme.colors.surface.cyanSoft }, pageDirectionText: { color: Theme.colors.brand.primaryText, fontSize: 21, fontWeight: '800', lineHeight: 22 }, pageDisabled: { opacity: 0.28 }, pageEllipsis: { width: 22, color: Theme.colors.text.muted, textAlign: 'center', fontSize: 15, fontWeight: '900' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: Theme.colors.overlay.scrim }, backdropCompact: { justifyContent: 'flex-end', padding: 0 }, sheet: { width: '100%', maxWidth: 980, maxHeight: '92%', overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 30, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.modal }, sheetCompact: { maxHeight: '94%', alignSelf: 'stretch', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }, detailLoading: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 10 }, sheetHeader: { minHeight: 102, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.brandSoft }, sheetAvatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: Theme.colors.brand.primaryAction, ...Theme.shadow.card }, sheetAvatarText: { color: Theme.colors.text.onBrand, fontSize: 17, fontWeight: '900' }, sheetHeadCopy: { minWidth: 0, flex: 1 }, sheetKicker: { color: Theme.colors.brand.primaryText, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, sheetTitle: { marginTop: 3, color: Theme.colors.text.primary, fontSize: 20, fontWeight: '900' }, sheetEmail: { marginTop: 2, color: Theme.colors.text.secondary, fontSize: 10 }, close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 14, backgroundColor: Theme.colors.surface.base }, sheetScroll: { padding: 18, gap: 12 },
  accessCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#BCE8D4', borderRadius: 20, backgroundColor: Theme.colors.state.successSoft }, accessCardOff: { borderColor: '#F3C1CA', backgroundColor: Theme.colors.state.errorSoft }, accessIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FFFFFF' }, accessIconOff: { backgroundColor: '#FFFFFF' }, accessCopy: { minWidth: 0, flex: 1 }, accessTitle: { color: Theme.colors.text.primary, fontSize: 13, fontWeight: '900' }, accessText: { marginTop: 3, color: Theme.colors.text.secondary, fontSize: 10, lineHeight: 15 }, disabledPreview: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 18, backgroundColor: Theme.colors.surface.brandSoft }, disabledPreviewMark: { width: 38, height: 38, textAlign: 'center', textAlignVertical: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: Theme.colors.brand.primaryAction, color: Theme.colors.text.onBrand, fontSize: 18, fontWeight: '900' }, disabledPreviewLabel: { color: Theme.colors.brand.primaryText, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, disabledPreviewText: { maxWidth: 720, marginTop: 3, color: Theme.colors.text.secondary, fontSize: 10, lineHeight: 15 },
  contactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, infoCard: { minWidth: 210, padding: 12, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, backgroundColor: Theme.colors.surface.base }, infoIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, infoCopy: { minWidth: 0, flex: 1 }, infoLabel: { color: Theme.colors.text.muted, fontSize: 8, fontWeight: '900', letterSpacing: .7 }, infoValue: { marginTop: 3, color: Theme.colors.text.primary, fontSize: 10, fontWeight: '800' }, detailMetrics: { flexDirection: 'row', gap: 8 }, detailMetric: { minWidth: 0, flex: 1, padding: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, backgroundColor: Theme.colors.surface.base }, detailMetricLabel: { color: Theme.colors.text.muted, fontSize: 8, fontWeight: '900', letterSpacing: .8 }, detailMetricValue: { marginTop: 5, color: Theme.colors.text.primary, fontSize: 18, fontWeight: '900' },
  ordersHead: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, ordersKicker: { color: Theme.colors.brand.primaryText, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, ordersTitle: { marginTop: 3, color: Theme.colors.text.primary, fontSize: 18, fontWeight: '900' }, ordersCount: { minWidth: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft }, ordersCountText: { color: Theme.colors.brand.primaryText, fontSize: 12, fontWeight: '900' }, ordersList: { gap: 8 }, orderCard: { padding: 13, gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 19, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card }, orderTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, orderIdentity: { minWidth: 0, flex: 1 }, orderNumber: { color: Theme.colors.text.primary, fontSize: 12, fontWeight: '900' }, orderDate: { marginTop: 3, color: Theme.colors.text.muted, fontSize: 9 }, orderAmount: { alignItems: 'flex-end', gap: 3 }, orderAmountValue: { color: Theme.colors.brand.primaryText, fontSize: 12, fontWeight: '900' }, orderStatus: { color: Theme.colors.text.muted, fontSize: 8, fontWeight: '800' }, orderOpen: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Theme.colors.surface.brandSoft }, orderVat: { color: Theme.colors.brand.primaryText, fontSize: 7, fontWeight: '900' }, orderProducts: { gap: 5 }, orderProduct: { minHeight: 52, padding: 7, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, backgroundColor: Theme.colors.surface.muted }, productThumb: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 11, backgroundColor: Theme.colors.surface.brandSoft }, productThumbImage: { width: '100%', height: '100%', backgroundColor: Theme.colors.surface.base }, productThumbText: { color: Theme.colors.brand.primaryText, fontSize: 12, fontWeight: '900' }, productCopy: { minWidth: 0, flex: 1 }, productName: { color: Theme.colors.text.primary, fontSize: 10, fontWeight: '800' }, productMeta: { marginTop: 2, color: Theme.colors.text.muted, fontSize: 8 }, moreProducts: { color: Theme.colors.brand.primaryText, fontSize: 9, fontWeight: '800' }, emptyOrders: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: Theme.colors.border.subtle, borderRadius: 18 }, emptyOrdersText: { color: Theme.colors.text.muted, fontSize: 10 },
  confirmBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: Theme.colors.overlay.scrim }, confirmCard: { width: '100%', maxWidth: 440, alignItems: 'center', padding: 24, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 30, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.modal }, confirmCardCompact: { maxWidth: 520, alignSelf: 'stretch', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginTop: 'auto' }, confirmHandle: { display: 'none', width: 44, height: 4, marginTop: -10, marginBottom: 18, borderRadius: 2, backgroundColor: Theme.colors.border.strong }, confirmHandleCompact: { display: 'flex' }, confirmIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: Theme.colors.state.errorSoft }, confirmKicker: { marginTop: 15, color: Theme.colors.state.error, fontSize: 8, fontWeight: '900', letterSpacing: 1.3 }, confirmTitle: { marginTop: 5, color: Theme.colors.text.primary, fontSize: 22, fontWeight: '900', textAlign: 'center' }, confirmText: { maxWidth: 360, marginTop: 9, color: Theme.colors.text.secondary, fontSize: 12, lineHeight: 18, textAlign: 'center' }, confirmName: { color: Theme.colors.text.primary, fontWeight: '900' }, confirmNotice: { width: '100%', marginTop: 18, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft }, confirmNoticeText: { flexShrink: 1, color: Theme.colors.brand.primaryText, fontSize: 10, fontWeight: '700' }, confirmActions: { width: '100%', marginTop: 18, flexDirection: 'row', gap: 9 }, confirmCancel: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.base }, confirmCancelText: { color: Theme.colors.text.secondary, fontSize: 11, fontWeight: '900' }, confirmDanger: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: Theme.colors.state.error }, confirmDangerText: { color: Theme.colors.text.onBrand, fontSize: 11, fontWeight: '900' }, actionDisabled: { opacity: .6 },
});
