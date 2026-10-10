import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAndroidSearchBack from '@/hooks/useAndroidSearchBack';
import { ActivityIndicator, Alert, Animated, Easing, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ArrowLeft, BadgeCheck, Building2, ChevronRight, Clock3, Download, FileCheck2, Link2, Mail, MapPin, Package, Percent, RefreshCw, Search, Send, ShoppingBag, Trash2, Truck, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopInvoiceItem, ShopIssuedInvoice, ShopProduct } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';
import SwipeDownSheet, { type SwipeDownSheetHandle } from '@/components/SwipeDownSheet';

const themeColors: Record<string, string> = { smartbill: '#06B6D4', orange: '#087FF5', green: '#19A86B', red: '#EF4056', purple: '#087FF5' };
const shopApiBase = (process.env.EXPO_PUBLIC_SHOP_API_URL || 'https://cubisshop.ro/shop-api').replace(/\/$/, '');

function money(value: number, currency: string) {
  return `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function dateLabel(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function assetUrl(path?: string) {
  const value = String(path || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `${shopApiBase}/${value.replace(/^\/+/, '')}`;
}

function invoiceLine(item: ShopInvoiceItem) {
  const discount = Math.max(0, Math.min(100, Number(item.discount_percent || 0)));
  const baseNet = Number(item.quantity || 0) * Number(item.unit_price || 0);
  const discountNet = Math.max(0, Number(item.discount_amount ?? (baseNet * discount / 100)));
  const net = Math.max(0, baseNet - discountNet);
  const vat = net * Math.max(0, Number(item.vat_rate || 0)) / 100;
  const discountGross = Math.max(0, Number(item.discount_amount_gross ?? (discountNet * (1 + Math.max(0, Number(item.vat_rate || 0)) / 100))));
  return { baseNet, discountNet, discountGross, net, vat, gross: net + vat };
}

export default function ShopInvoicesManager({ initialInvoiceId = null, onInitialInvoiceHandled }: { initialInvoiceId?: string | null; onInitialInvoiceHandled?: () => void }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [invoices, setInvoices] = useState<ShopIssuedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  useAndroidSearchBack(query, useCallback(() => setQuery(''), []));
  const [status, setStatus] = useState<'all' | 'paid' | 'unpaid' | 'return'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedInvoice, setSelectedInvoice] = useState<ShopIssuedInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState('');
  const initialOpenedInvoiceId = useRef<string | null>(null);
  const invoiceSheetRef = useRef<SwipeDownSheetHandle>(null);
  const [discountPulse] = useState(() => new Animated.Value(0));

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try { setInvoices(await shopApi.listInvoices(token)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Facturile nu au putut fi încărcate.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(discountPulse, { toValue: 1, duration: 820, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(discountPulse, { toValue: 0, duration: 1050, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [discountPulse]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro-RO');
    return invoices.filter((invoice) => {
      if (status !== 'all' && invoice.status !== status) return false;
      if (!needle) return true;
      return [invoice.display_number, invoice.order_number, invoice.buyer_name, invoice.buyer_cui, invoice.customer_email, invoice.total, invoice.currency].join(' ').toLocaleLowerCase('ro-RO').includes(needle);
    });
  }, [invoices, query, status]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paidTotal = invoices.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.total || 0), 0);
  const unpaidTotal = invoices.filter((item) => item.status === 'unpaid').reduce((sum, item) => sum + Number(item.total || 0), 0);

  const download = async (invoice: ShopIssuedInvoice) => {
    if (!token || busy) return;
    setBusy(invoice.id);
    try {
      const file = await shopApi.getInvoicePublicLink(token, invoice.id, 'pdf');
      const uri = `${FileSystem.cacheDirectory}${String(file.file_name || 'factura.pdf').replace(/[\\/:*?"<>|]/g, '-')}`;
      await FileSystem.downloadAsync(file.url, uri);
      await Sharing.shareAsync(uri, { mimeType: file.mime_type, dialogTitle: `Descarcă ${invoice.display_number}` });
    } catch (downloadError) { Alert.alert('Descărcare nereușită', downloadError instanceof Error ? downloadError.message : 'Încearcă din nou.'); }
    finally { setBusy(null); }
  };

  const deleteInvoice = async (invoice: ShopIssuedInvoice) => {
    if (!token || busy) return;
    setBusy(invoice.id);
    let verifiedInvoice: ShopIssuedInvoice;
    try {
      verifiedInvoice = await shopApi.getInvoice(token, invoice.id);
      setSelectedInvoice((current) => current?.id === verifiedInvoice.id ? verifiedInvoice : current);
      setInvoices((current) => current.map((item) => item.id === verifiedInvoice.id
        ? { ...item, can_delete: Boolean(verifiedInvoice.can_delete), spv_status: verifiedInvoice.spv_status }
        : item));
    } catch (verifyError) {
      Alert.alert('Verificare nereușită', verifyError instanceof Error ? verifyError.message : 'Permisiunea de ștergere nu a putut fi verificată.');
      setBusy(null);
      return;
    }
    setBusy(null);
    if (!verifiedInvoice.can_delete) return;
    Alert.alert(
      'Ștergi ultima factură?',
      `${verifiedInvoice.display_number} este un document istoric local eligibil pentru ștergere. Stocul și mișcările vor fi refăcute. Facturile SmartBill nu pot fi șterse din Cubis.`,
      [
        { text: 'Renunță', style: 'cancel' },
        { text: 'Șterge factura', style: 'destructive', onPress: async () => {
          setBusy(verifiedInvoice.id);
          try {
            await shopApi.deleteInvoice(token, verifiedInvoice.id);
            setSelectedInvoice(null);
            setInvoices((current) => current.filter((item) => item.id !== verifiedInvoice.id));
            Alert.alert('Factura a fost ștearsă', `Numărul ${verifiedInvoice.display_number} este disponibil pentru următoarea factură.`);
            void load();
          } catch (deleteError) {
            Alert.alert('Factura nu a fost ștearsă', deleteError instanceof Error ? deleteError.message : 'Încearcă din nou.');
          } finally { setBusy(null); }
        } },
      ],
    );
  };

  const sendEmail = async (invoice: ShopIssuedInvoice) => {
    if (!token || busy) return;
    if (!invoice.customer_email) return Alert.alert('Adresă lipsă', 'Comanda nu are o adresă de e-mail validă.');
    Alert.alert('Trimite factura', `Trimiți ${invoice.display_number} la ${invoice.customer_email}?`, [
      { text: 'Renunță', style: 'cancel' },
      { text: 'Trimite', onPress: async () => {
        setBusy(invoice.id);
        try {
          const result = await shopApi.sendInvoiceEmail(token, invoice.id);
          if (!result.sent) throw new Error(result.error || 'E-mailul nu a putut fi trimis.');
          setInvoices((current) => current.map((item) => item.id === invoice.id ? { ...item, email_sent_at: new Date().toISOString(), email_last_error: null } : item));
          Alert.alert('Factura a fost trimisă', `Clientul a primit PDF-ul la ${result.recipient}.`);
        } catch (emailError) { Alert.alert('E-mail netrimis', emailError instanceof Error ? emailError.message : 'Încearcă din nou.'); }
        finally { setBusy(null); }
      } },
    ]);
  };

  const copyPublicLink = async (invoice: ShopIssuedInvoice) => {
    if (!token || busy) return;
    setBusy(invoice.id);
    try {
      const result = await shopApi.getInvoicePublicLink(token, invoice.id, 'pdf');
      await Clipboard.setStringAsync(result.url);
      Alert.alert('Link copiat', `Linkul securizat pentru ${invoice.display_number} a fost copiat.`);
    } catch (linkError) { Alert.alert('Link indisponibil', linkError instanceof Error ? linkError.message : 'Încearcă din nou.'); }
    finally { setBusy(null); }
  };

  const openInvoice = useCallback(async (invoice: ShopIssuedInvoice) => {
    if (!token) return;
    setSelectedInvoice({ ...invoice, can_delete: false });
    setSelectedProduct(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const detail = await shopApi.getInvoice(token, invoice.id);
      if (!detail?.payload) throw new Error('Serverul nu a trimis datele complete ale facturii. Reîncearcă după actualizare.');
      setSelectedInvoice(detail);
    }
    catch (openError) { setDetailError(openError instanceof Error ? openError.message : 'Fișa facturii nu a putut fi încărcată.'); }
    finally { setDetailLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!initialInvoiceId) {
      initialOpenedInvoiceId.current = null;
      return;
    }
    if (loading || initialOpenedInvoiceId.current === initialInvoiceId) return;
    const invoice = invoices.find((item) => item.id === initialInvoiceId);
    if (!invoice) return;
    initialOpenedInvoiceId.current = initialInvoiceId;
    onInitialInvoiceHandled?.();
    void openInvoice(invoice);
  }, [initialInvoiceId, invoices, loading, onInitialInvoiceHandled, openInvoice]);

  const openProduct = async (productId?: string | null) => {
    if (!token || !productId) return;
    setSelectedProduct(null);
    setProductError('');
    setProductLoading(true);
    try { setSelectedProduct(await shopApi.getProduct(token, productId)); }
    catch (openError) { setProductError(openError instanceof Error ? openError.message : 'Fișa produsului nu a putut fi încărcată.'); }
    finally { setProductLoading(false); }
  };

  const closeInvoice = () => {
    setSelectedInvoice(null);
    setSelectedProduct(null);
    setDetailError('');
    setProductError('');
  };

  const dismissInvoice = () => {
    if (invoiceSheetRef.current) invoiceSheetRef.current.dismiss();
    else closeInvoice();
  };

  const payload = selectedInvoice?.payload;
  const invoiceItems = payload?.items || [];
  const totals = invoiceItems.reduce((sum, item) => {
    const line = invoiceLine(item);
    return { net: sum.net + line.net, vat: sum.vat + line.vat, gross: sum.gross + line.gross };
  }, { net: 0, vat: 0, gross: 0 });
  const calculatedDiscount = invoiceItems.reduce((sum, item) => sum + invoiceLine(item).discountGross, 0);
  const discountTotal = Math.max(0, Number(payload?.discount_total || calculatedDiscount));
  const discountCode = String(payload?.discount_code || '').trim();
  const discountScale = discountPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] });
  const discountRotation = discountPulse.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '5deg'] });
  const invoiceGlowScale = discountPulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.1] });
  const invoiceGlowOpacity = discountPulse.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.34] });
  const invoiceMarkOffset = discountPulse.interpolate({ inputRange: [0, 1], outputRange: [2, -2] });
  const invoiceAccent = selectedInvoice ? (themeColors[selectedInvoice.theme] || Colors.orange) : Colors.orange;
  const productImage = selectedProduct?.images?.[0]?.url || '';
  const showingProduct = Boolean(productLoading || productError || selectedProduct);
  const sheetHeader = showingProduct
    ? <View style={styles.detailHeader}><TouchableOpacity style={styles.detailHeaderButton} onPress={() => { setSelectedProduct(null); setProductError(''); setProductLoading(false); }}><ArrowLeft size={20} color={Colors.textPrimary} /></TouchableOpacity><View style={styles.detailHeaderCopy}><Text style={styles.detailEyebrow}>FIȘA PRODUSULUI</Text><Text style={styles.detailTitle} numberOfLines={1}>{selectedProduct?.name || 'Se încarcă produsul...'}</Text></View><TouchableOpacity style={styles.detailHeaderButton} onPress={dismissInvoice}><X size={20} color={Colors.textPrimary} /></TouchableOpacity></View>
    : <View style={styles.detailHeader}><View style={[styles.detailHeaderIcon, { backgroundColor: `${invoiceAccent}20` }]}><FileCheck2 size={22} color={invoiceAccent} /></View><View style={styles.detailHeaderCopy}><Text style={[styles.detailEyebrow, { color: invoiceAccent }]}>FIȘA FACTURII EMISE</Text><Text style={styles.detailTitle}>{selectedInvoice?.display_number || 'Factură'}</Text></View><TouchableOpacity style={styles.detailHeaderButton} onPress={dismissInvoice}><X size={20} color={Colors.textPrimary} /></TouchableOpacity></View>;

  return <><ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 105 + insets.bottom }]} showsVerticalScrollIndicator={false}>
    <View style={styles.hero}><View style={styles.heroIcon}><FileCheck2 size={27} color="#087FF5" /></View><View style={styles.heroCopy}><Text style={styles.eyebrow}>DOCUMENTE SMARTBILL</Text><Text style={styles.title}>Facturi emise</Text><Text style={styles.subtitle}>Facturi SmartBill legate de comenzile Cubis, cu PDF-ul original și starea plății.</Text></View><TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color="#087FF5" /></TouchableOpacity></View>
    <View style={styles.metrics}><View style={[styles.metric, styles.metricPaid]}><BadgeCheck size={19} color="#34D399" /><View><Text style={styles.metricLabel}>ACHITATE</Text><Text style={styles.metricValue}>{money(paidTotal, 'RON')}</Text></View></View><View style={[styles.metric, styles.metricUnpaid]}><Clock3 size={19} color="#FBBF24" /><View><Text style={styles.metricLabel}>DE ÎNCASAT</Text><Text style={styles.metricValue}>{money(unpaidTotal, 'RON')}</Text></View></View></View>
    <View style={[styles.toolbar, { flexDirection: 'row', alignItems: 'center', gap: 9 }]}><View style={[styles.search, { flex: 1 }]}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Număr, comandă, client, CUI sau e-mail" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{(['all', 'paid', 'unpaid', 'return'] as const).map((value) => <TouchableOpacity key={value} style={[styles.filter, status === value && styles.filterActive]} onPress={() => { setStatus(value); setPage(1); }}><Text style={[styles.filterText, status === value && styles.filterTextActive]}>{value === 'all' ? `Toate · ${invoices.length}` : value === 'paid' ? 'Plătite' : value === 'return' ? 'Retururi' : 'Neplătite'}</Text></TouchableOpacity>)}</ScrollView>
    {loading ? <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se încarcă facturile emise...</Text></View> : error ? <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Încearcă din nou</Text></TouchableOpacity></View> : paged.length ? paged.map((invoice) => {
      const accent = themeColors[invoice.theme] || Colors.orange;
      return <LinearGradient key={invoice.id} colors={[`${accent}18`, Theme.colors.surface.subtle, Theme.colors.surface.base]} locations={[0, 0.38, 1]} style={[styles.card, { borderColor: `${accent}66` }]}>
        <View style={[styles.cardBar, { backgroundColor: accent }]} />
        <TouchableOpacity activeOpacity={0.78} style={styles.cardMain} onPress={() => void openInvoice(invoice)}>
          <View style={[styles.cardIcon, { backgroundColor: `${accent}19` }]}><FileCheck2 size={21} color={accent} /></View>
          <View style={styles.cardCopy}>
            <View style={styles.cardTop}>
              <Text style={styles.invoiceNumber}>{invoice.display_number}</Text>
              <View style={[styles.status, { backgroundColor: invoice.status === 'return' ? '#FB718518' : invoice.status === 'paid' ? '#34D39918' : '#FBBF2418' }]}><Text style={[styles.statusText, { color: invoice.status === 'return' ? '#FB7185' : invoice.status === 'paid' ? '#34D399' : '#FBBF24' }]}>{invoice.status === 'return' ? 'RETUR' : invoice.status === 'paid' ? 'PLĂTITĂ' : 'NEPLĂTITĂ'}</Text></View>
            </View>
            <Text style={styles.buyer} numberOfLines={1}>{invoice.buyer_name}</Text>
            <Text style={styles.meta}>{invoice.order_number} · {dateLabel(invoice.issue_date)} · SmartBill</Text>
            <View style={styles.emailMeta}><Mail size={12} color={invoice.email_sent_at ? '#34D399' : Colors.textMuted} /><Text style={[styles.emailText, invoice.email_sent_at && styles.emailSent]} numberOfLines={1}>{invoice.email_sent_at ? `Trimisă la ${invoice.customer_email}` : invoice.customer_email || 'Fără e-mail'}</Text></View>
          </View>
          <View style={[styles.openCircle, { borderColor: `${accent}77` }]}><ChevronRight size={18} color={accent} /></View>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.78} style={[styles.cardSummary, { borderTopColor: `${accent}42` }]} onPress={() => void openInvoice(invoice)}>
          <Text style={styles.totalLabel}>TOTAL FACTURĂ</Text>
          <Text style={[styles.total, { color: accent }]}>{money(invoice.total, invoice.currency)}</Text>
        </TouchableOpacity>
      </LinearGradient>;
    }) : <View style={styles.state}><FileCheck2 size={34} color="#087FF5" /><Text style={styles.emptyTitle}>Nu există facturi emise</Text><Text style={styles.stateText}>Emite prima factură din pagina unei comenzi.</Text></View>}
    {!loading && !error ? <ShopPagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} /> : null}
  </ScrollView><Modal visible={Boolean(selectedInvoice)} transparent animationType="fade" statusBarTranslucent onRequestClose={dismissInvoice}><GestureHandlerRootView style={styles.modalGestureRoot}><View style={styles.modalBackdrop}><SwipeDownSheet ref={invoiceSheetRef} visible={Boolean(selectedInvoice)} onClose={closeInvoice} disabled={Boolean(busy)} header={sheetHeader} style={[styles.detailSheet, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
    {showingProduct ? <>
      {productLoading ? <View style={styles.detailLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se pregătește fișa produsului...</Text></View> : productError ? <View style={styles.detailLoading}><Text style={styles.error}>{productError}</Text><TouchableOpacity style={styles.retry} onPress={() => setProductError('')}><Text style={styles.retryText}>Înapoi la factură</Text></TouchableOpacity></View> : selectedProduct ? <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.productHero}>{productImage ? <Image source={{ uri: productImage }} style={styles.productImage} resizeMode="contain" /> : <View style={styles.productImageEmpty}><Package size={42} color="#087FF5" /></View>}<View style={styles.productHeroCopy}><Text style={styles.productName}>{selectedProduct.name}</Text><View style={styles.productCodeBadge}><Text style={styles.productCodeLabel}>COD PRODUS</Text><Text selectable style={styles.productCodeValue}>{selectedProduct.sku || selectedProduct.supplier_product_code || 'FĂRĂ COD'}</Text></View>{selectedProduct.ean ? <Text selectable style={styles.productSku}>EAN {selectedProduct.ean}</Text> : null}<View style={[styles.productStock, { backgroundColor: selectedProduct.stock_available ? '#34D39918' : '#FB718518' }]}><Text style={{ color: selectedProduct.stock_available ? '#168457' : '#C43650', fontFamily: 'Inter-Bold', fontSize: 9 }}>{selectedProduct.stock_mode === 'unlimited' ? 'STOC NELIMITAT' : `${selectedProduct.stock_quantity} BUCĂȚI ÎN STOC`}</Text></View></View></View>
        <View style={styles.productMetrics}><View style={styles.productMetric}><Text style={styles.detailLabel}>PREȚ VÂNZARE</Text><Text style={styles.productPrice}>{money(selectedProduct.promotion_price ?? selectedProduct.sale_price ?? selectedProduct.price, selectedProduct.currency)}</Text></View><View style={styles.productMetric}><Text style={styles.detailLabel}>CATEGORIE</Text><Text style={styles.detailValue}>{selectedProduct.category_name || 'Necategorizat'}</Text></View></View>
        <View style={styles.detailBlock}><Text style={styles.detailBlockTitle}>Despre produs</Text><Text style={styles.detailParagraph}>{selectedProduct.short_description || selectedProduct.description_title || 'Produsul nu are încă o descriere scurtă.'}</Text></View>
        {selectedProduct.specifications?.length ? <View style={styles.detailBlock}><Text style={styles.detailBlockTitle}>Specificații</Text>{selectedProduct.specifications.map((specification, index) => <View key={`${specification.group}-${specification.label}-${index}`} style={styles.specRow}><View><Text style={styles.specGroup}>{specification.group}</Text><Text style={styles.specLabel}>{specification.label}</Text></View><Text style={styles.specValue}>{specification.value}</Text></View>)}</View> : null}
      </ScrollView> : null}
    </> : <>
      {detailLoading ? <View style={styles.detailLoading}><View style={[styles.detailLoadingIcon, { backgroundColor: `${invoiceAccent}18` }]}><ActivityIndicator size="large" color={invoiceAccent} /></View><Text style={styles.detailLoadingTitle}>Încărcăm fișa facturii</Text><Text style={styles.stateText}>Produsele, clientul și documentele vor apărea imediat.</Text></View> : detailError ? <View style={styles.detailLoading}><Text style={styles.error}>{detailError}</Text><TouchableOpacity style={styles.retry} onPress={() => selectedInvoice && void openInvoice(selectedInvoice)}><Text style={styles.retryText}>Reîncearcă</Text></TouchableOpacity></View> : selectedInvoice && payload ? <>
        <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
           <View style={[styles.invoiceHero, { borderColor: `${invoiceAccent}66`, backgroundColor: `${invoiceAccent}12` }]}>
             <Animated.View pointerEvents="none" style={[styles.invoiceHeroGlow, { backgroundColor: invoiceAccent, opacity: invoiceGlowOpacity, transform: [{ scale: invoiceGlowScale }] }]} />
             <View style={styles.invoiceHeroTop}><Animated.View style={[styles.invoiceHeroMark, { backgroundColor: `${invoiceAccent}20`, transform: [{ translateY: invoiceMarkOffset }] }]}><FileCheck2 size={24} color={invoiceAccent} /></Animated.View><View style={styles.invoiceHeroCopy}><Text style={styles.detailLabel}>{selectedInvoice.status === 'return' ? 'FACTURĂ DE RETUR' : 'DOCUMENT FISCAL'}</Text><Text style={styles.invoiceHeroNumber}>{selectedInvoice.display_number}</Text><Text style={styles.invoiceHeroMeta}>Comanda {selectedInvoice.order_number} · emisă {dateLabel(payload.issue_date)}</Text>{selectedInvoice.status === 'return' ? <Text style={styles.invoiceHeroMeta}>Retur pentru factura fiscală emisă {[payload.related_invoice?.series, payload.related_invoice?.number].filter(Boolean).join(' ')} · comanda {payload.order_reference || selectedInvoice.order_number}</Text> : null}</View></View>
             <View style={styles.invoiceHeroBadges}><View style={[styles.invoiceHeroStatus, { backgroundColor: selectedInvoice.status === 'return' ? '#FB71851D' : selectedInvoice.status === 'paid' ? '#34D3991D' : '#FBBF241D' }]}><Text style={{ color: selectedInvoice.status === 'return' ? '#C43650' : selectedInvoice.status === 'paid' ? '#168457' : '#FCD34D', fontFamily: 'Inter-Bold', fontSize: 9 }}>{selectedInvoice.status === 'return' ? 'RETUR' : selectedInvoice.status === 'paid' ? 'PLĂTITĂ' : 'NEPLĂTITĂ'}</Text></View><View style={[styles.invoiceHeroStatus, { backgroundColor: '#0891B21D' }]}><Text style={{ color: Theme.colors.brand.cyanStrong, fontFamily: 'Inter-Bold', fontSize: 9 }}>SMARTBILL</Text></View></View>
           </View>
          <View style={styles.partyGrid}>
            <View style={styles.partyCard}><View style={[styles.partyIcon, styles.partyIconSeller]}><Building2 size={23} color="#087FF5" /></View><Text style={styles.detailLabel}>FURNIZOR</Text><Text style={styles.partyName}>{payload.seller.name}</Text><Text style={styles.partyMeta}>CUI {payload.seller.cui || '—'}{payload.seller.registration_number ? ` · ${payload.seller.registration_number}` : ''}</Text><Text style={styles.partyMeta}>{payload.seller.address || 'Adresă necompletată'}</Text>{payload.seller.email || payload.seller.phone ? <Text style={styles.partyContact}>{[payload.seller.email, payload.seller.phone].filter(Boolean).join(' · ')}</Text> : null}</View>
            <View style={styles.partyCard}><View style={[styles.partyIcon, styles.partyIconBuyer]}><MapPin size={23} color="#079DBD" /></View><Text style={styles.detailLabel}>CLIENT</Text><Text style={styles.partyName}>{payload.buyer.name}</Text><Text style={styles.partyMeta}>{payload.buyer.cui ? `CUI ${payload.buyer.cui}` : 'Persoană fizică'}</Text><Text style={styles.partyMeta}>{payload.buyer.address || 'Adresă necompletată'}</Text>{payload.buyer.email || payload.buyer.phone ? <Text style={styles.partyContact}>{[payload.buyer.email, payload.buyer.phone].filter(Boolean).join(' · ')}</Text> : null}</View>
          </View>
          <View style={styles.detailBlock}><View style={styles.blockHeader}><View><Text style={styles.detailLabel}>POZIȚII FACTURATE</Text><Text style={styles.detailBlockTitle}>{invoiceItems.length} {invoiceItems.length === 1 ? 'poziție' : 'poziții'}</Text></View><ShoppingBag size={22} color={invoiceAccent} /></View>{invoiceItems.map((item, index) => {
            const line = invoiceLine(item);
            const image = assetUrl(item.image_path);
            const isDelivery = String(item.sku || '').trim().toUpperCase() === 'TRANSPORT';
            const hasDiscount = Number(item.discount_percent || 0) > 0 || line.discountGross > 0;
            const content = <><View style={[styles.invoiceProductImage, isDelivery && styles.invoiceDeliveryImage]}>{image && !isDelivery ? <Image source={{ uri: image }} style={styles.invoiceProductPhoto} resizeMode="contain" /> : isDelivery ? <Truck size={27} color="#087FF5" /> : <Package size={25} color={item.product_id ? invoiceAccent : Colors.textMuted} />}</View><View style={styles.invoiceProductCopy}><Text style={styles.invoiceProductName}>{item.name}</Text><Text style={styles.invoiceProductMeta}>{item.sku || 'Fără cod'} · {item.quantity} {item.unit} × {money(line.gross / Math.max(1, item.quantity), payload.currency)}</Text><Text style={styles.invoiceProductVat}>TVA {Number(item.vat_rate || 0).toLocaleString('ro-RO')}%</Text>{hasDiscount ? <View style={styles.lineDiscount}><Text style={styles.lineDiscountPercent}>−{Number(item.discount_percent || 0).toLocaleString('ro-RO', { maximumFractionDigits: 2 })}%</Text><Text style={styles.lineDiscountText}>Reducere {money(line.discountGross, payload.currency)}</Text></View> : null}</View><Text style={styles.invoiceProductTotal}>{money(line.gross, payload.currency)}</Text>{item.product_id ? <ChevronRight size={19} color={invoiceAccent} /> : null}</>;
            return item.product_id ? <TouchableOpacity key={`${item.sku}-${index}`} style={styles.invoiceProduct} activeOpacity={0.76} onPress={() => void openProduct(item.product_id)}>{content}</TouchableOpacity> : <View key={`${item.sku}-${index}`} style={styles.invoiceProduct}>{content}</View>;
          })}</View>
          <View style={styles.totalsCard}>{discountTotal > 0 ? <View style={styles.discountTotalRow}><View><Text style={styles.discountTotalLabel}>REDUCERE{discountCode ? ` · ${discountCode}` : ''}</Text><Text style={styles.discountTotalHint}>inclusă deja în subtotal</Text></View><Text style={styles.discountTotalValue}>−{money(discountTotal, payload.currency)}</Text></View> : null}<View><Text style={styles.totalsLabel}>Subtotal fără TVA</Text><Text style={styles.totalsValue}>{money(totals.net, payload.currency)}</Text></View><View><Text style={styles.totalsLabel}>TVA</Text><Text style={styles.totalsValue}>{money(totals.vat, payload.currency)}</Text></View><View style={[styles.grandTotal, { borderTopColor: `${invoiceAccent}55` }]}><Text style={styles.grandTotalLabel}>TOTAL FACTURĂ</Text><Text style={[styles.grandTotalValue, { color: invoiceAccent }]}>{money(selectedInvoice.total, payload.currency)}</Text></View></View>
          <View style={styles.detailBlock}><Text style={styles.detailBlockTitle}>Plată și emitere</Text><Text style={styles.detailParagraph}>{payload.payment?.method || 'Metodă neprecizată'} · scadență {dateLabel(payload.due_date || payload.issue_date)}</Text><Text style={styles.detailParagraph}>Emisă de {selectedInvoice.issued_by || 'Administrator'}{selectedInvoice.customer_email ? ` · ${selectedInvoice.customer_email}` : ''}</Text>{discountTotal > 0 ? <View style={styles.discountCallout}><Animated.View style={[styles.discountBadge, { transform: [{ scale: discountScale }, { rotate: discountRotation }] }]}><Percent size={24} color="#FFFFFF" strokeWidth={2.7} /></Animated.View><View style={styles.discountCopy}><Text style={styles.discountEyebrow}>REDUCERE APLICATĂ</Text><Text style={styles.discountTitle}>{discountCode ? `Cod ${discountCode}` : 'Promoție comercială'}</Text><Text style={styles.discountHint}>Reducerea este inclusă în prețurile pozițiilor.</Text></View><Text style={styles.discountAmount}>−{money(discountTotal, payload.currency)}</Text></View> : null}{payload.notes ? <Text style={styles.note}>{payload.notes}</Text> : null}</View>
        </ScrollView><View style={styles.detailActions}><TouchableOpacity style={styles.detailActionSecondary} disabled={Boolean(busy)} onPress={() => void sendEmail(selectedInvoice)}><Send size={17} color="#087FF5" /><Text style={styles.detailActionSecondaryText}>E-mail</Text></TouchableOpacity><TouchableOpacity style={styles.detailActionLink} disabled={Boolean(busy)} onPress={() => void copyPublicLink(selectedInvoice)}><Link2 size={17} color="#2B6FAF" /><Text style={styles.detailActionLinkText}>Obține link</Text></TouchableOpacity><TouchableOpacity style={[styles.detailActionPrimary, { backgroundColor: invoiceAccent }]} disabled={Boolean(busy)} onPress={() => void download(selectedInvoice)}><Download size={17} color="#FFFFFF" /><Text style={styles.detailActionPrimaryText}>PDF SmartBill</Text></TouchableOpacity>{selectedInvoice.can_delete ? <TouchableOpacity style={styles.detailActionDelete} disabled={Boolean(busy)} onPress={() => void deleteInvoice(selectedInvoice)}><Trash2 size={17} color="#C43650" /><Text style={styles.detailActionDeleteText}>Șterge</Text></TouchableOpacity> : null}</View>
      </> : null}
    </>}
  </SwipeDownSheet></View></GestureHandlerRootView></Modal></>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg }, content: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 14 },
  hero: { minHeight: 148, flexDirection: 'row', alignItems: 'center', gap: 13, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 28, padding: 18, backgroundColor: Theme.colors.surface.base }, heroIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: Theme.colors.surface.brandSoft }, heroCopy: { flex: 1, minWidth: 0 }, eyebrow: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 }, title: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 25, marginTop: 7 }, subtitle: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 6 }, refresh: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.muted },
  metrics: { flexDirection: 'row', gap: 9, marginTop: 10 }, metric: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 20, padding: 13 }, metricPaid: { borderColor: Theme.colors.state.success, backgroundColor: Theme.colors.surface.muted }, metricUnpaid: { borderColor: Theme.colors.state.success, backgroundColor: Theme.colors.surface.muted }, metricLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7 }, metricValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 3 },
  toolbar: { marginTop: 12 }, search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, paddingHorizontal: 14, backgroundColor: Theme.colors.surface.base }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, filters: { gap: 7, paddingVertical: 10 }, filter: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 99, paddingHorizontal: 14, backgroundColor: Theme.colors.surface.base }, filterActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim }, filterText: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 9 }, filterTextActive: { color: Theme.colors.brand.primaryText },
  card: { minHeight: 160, gap: 10, overflow: 'hidden', borderWidth: 1, borderRadius: 27, padding: 15, backgroundColor: Theme.colors.surface.base, marginBottom: 10, shadowColor: Theme.colors.shadow.color, shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 }, cardBar: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 5, borderTopRightRadius: 9, borderBottomRightRadius: 9 }, cardMain: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 }, cardIcon: { width: 54, height: 54, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18 }, cardCopy: { flex: 1, minWidth: 0 }, cardTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, invoiceNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16 }, status: { minHeight: 25, justifyContent: 'center', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 }, statusText: { fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.6 }, spvBadge: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 99, paddingHorizontal: 8 }, spvSent: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.state.successSoft }, spvPending: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.state.errorSoft }, spvText: { fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.45 }, buyer: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12.5, marginTop: 7 }, meta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 13, marginTop: 4 }, emailMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, emailText: { flex: 1, color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 8.5 }, emailSent: { color: Theme.colors.state.success }, openCircle: { width: 41, height: 41, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 21, backgroundColor: Theme.colors.surface.muted }, cardSummary: { width: '100%', minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, paddingTop: 11, paddingHorizontal: 4 }, totalLabel: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.9 }, total: { fontFamily: 'Inter-Bold', fontSize: 20 },
  state: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 24, padding: 25, backgroundColor: Theme.colors.surface.base }, stateText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10, textAlign: 'center' }, error: { color: Theme.colors.state.error, fontFamily: 'Inter-SemiBold', fontSize: 10, textAlign: 'center' }, retry: { minHeight: 40, justifyContent: 'center', borderRadius: 13, paddingHorizontal: 15, backgroundColor: Colors.orange }, retryText: { color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 9 }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15 },
  modalGestureRoot: { flex: 1 }, modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Theme.colors.overlay.scrim }, detailSheet: { width: '100%', maxWidth: 820, maxHeight: '96%', alignSelf: 'center', overflow: 'hidden', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderBottomWidth: 0, borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.base }, detailHeader: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#DEE8F0', paddingHorizontal: 15, backgroundColor: Theme.colors.surface.subtle }, detailHeaderIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, detailHeaderButton: { width: 43, height: 43, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.muted }, detailHeaderCopy: { flex: 1, minWidth: 0 }, detailEyebrow: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.9 }, detailTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20, marginTop: 3 }, detailLoading: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 11, padding: 25 }, detailLoadingIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 24, marginBottom: 5 }, detailLoadingTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 17 }, detailScroll: { gap: 12, padding: 14, paddingBottom: 24 }, invoiceHero: { minHeight: 166, alignItems: 'stretch', justifyContent: 'flex-start', gap: 13, overflow: 'hidden', borderWidth: 1, borderRadius: 23, padding: 17 }, invoiceHeroGlow: { width: 150, height: 150, position: 'absolute', right: -68, top: -76, borderRadius: 75 }, invoiceHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, invoiceHeroMark: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, invoiceHeroCopy: { flex: 1, minWidth: 0 }, detailLabel: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.9 }, invoiceHeroNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 24, marginTop: 5 }, invoiceHeroMeta: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Medium', fontSize: 10.5, lineHeight: 16, marginTop: 6 }, invoiceHeroBadges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, invoiceHeroStatus: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 }, invoiceSpvButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 17, paddingHorizontal: 11, backgroundColor: Theme.colors.surface.brandSoft }, invoiceSpvButtonIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Theme.colors.surface.brandSoft }, invoiceSpvButtonCopy: { flex: 1, minWidth: 0 }, invoiceSpvButtonTitle: { color: '#1D4F82', fontFamily: 'Inter-Bold', fontSize: 12 }, invoiceSpvButtonHint: { color: '#8DA9C8', fontFamily: 'Inter-Medium', fontSize: 8.5, marginTop: 3 }, partyGrid: { gap: 10 }, partyCard: { gap: 7, minHeight: 172, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, padding: 18, backgroundColor: Theme.colors.surface.base }, partyIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, partyIconSeller: { backgroundColor: '#09BFD918' }, partyIconBuyer: { backgroundColor: '#079DBD14' }, partyName: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 17, lineHeight: 22 }, partyMeta: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 17 }, partyContact: { color: '#9A929A', fontFamily: 'Inter-Medium', fontSize: 10.5, lineHeight: 16 }, detailBlock: { gap: 11, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, padding: 17, backgroundColor: Theme.colors.surface.base }, blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, detailBlockTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 17, marginTop: 4 }, detailParagraph: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18 }, note: { color: '#9A6818', fontFamily: 'Inter-Medium', fontSize: 10.5, lineHeight: 17, borderLeftWidth: 3, borderLeftColor: '#D8E5EF', paddingLeft: 11 }, invoiceProduct: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: '#E0E9F0', paddingVertical: 12 }, invoiceProductImage: { width: 60, height: 60, flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, backgroundColor: Theme.colors.surface.muted }, invoiceDeliveryImage: { borderColor: '#09BFD92E', backgroundColor: '#09BFD912' }, invoiceProductPhoto: { width: '100%', height: '100%', backgroundColor: Theme.colors.surface.base }, invoiceProductCopy: { flex: 1, minWidth: 0 }, invoiceProductName: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 18 }, invoiceProductMeta: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, marginTop: 4 }, invoiceProductVat: { color: Theme.colors.text.muted, fontFamily: 'Inter-Medium', fontSize: 9, marginTop: 3 }, invoiceProductTotal: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 12, textAlign: 'right' }, lineDiscount: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }, lineDiscountPercent: { overflow: 'hidden', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 4, color: Theme.colors.text.onBrand, backgroundColor: Theme.colors.brand.primaryAction, fontFamily: 'Inter-Bold', fontSize: 9 }, lineDiscountText: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-SemiBold', fontSize: 9.5 }, totalsCard: { gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, padding: 18, backgroundColor: Theme.colors.background.canvas }, totalsLabel: { color: '#B4AAA6', fontFamily: 'Inter-Medium', fontSize: 11 }, totalsValue: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 14, marginTop: 4 }, discountTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 14, padding: 11, backgroundColor: Theme.colors.surface.brandSoft }, discountTotalLabel: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 10, letterSpacing: 0.55 }, discountTotalHint: { color: '#9F9288', fontFamily: 'Inter-Medium', fontSize: 8.5, marginTop: 3 }, discountTotalValue: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 14 }, grandTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 14 }, grandTotalLabel: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 12 }, grandTotalValue: { fontFamily: 'Inter-Bold', fontSize: 22 }, discountCallout: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 19, padding: 13, backgroundColor: '#09BFD910' }, discountBadge: { width: 50, height: 50, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: Theme.colors.brand.primaryAction, shadowColor: Theme.colors.brand.primary, shadowOpacity: 0.42, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 7 }, discountCopy: { flex: 1, minWidth: 0 }, discountEyebrow: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8 }, discountTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 3 }, discountHint: { color: '#BAADA3', fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 13, marginTop: 3 }, discountAmount: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 13, textAlign: 'right' }, detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, borderTopWidth: 1, borderTopColor: '#DEE8F0', padding: 12, backgroundColor: Theme.colors.surface.subtle }, detailActionSecondary: { height: 48, minWidth: 84, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft }, detailActionSecondaryText: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8 }, detailActionLink: { height: 48, minWidth: 100, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft }, detailActionLinkText: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 8 }, detailActionPrimary: { height: 48, minWidth: 74, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15 }, detailActionPrimaryText: { color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 9 }, detailActionXlsx: { height: 48, minWidth: 74, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.state.successSoft }, detailActionXlsxText: { color: '#166534', fontFamily: 'Inter-Bold', fontSize: 8 }, detailActionXml: { height: 48, minWidth: 96, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft }, detailActionXmlText: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8 }, detailActionDelete: { height: 48, minWidth: 84, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: Theme.colors.state.error, borderRadius: 15, backgroundColor: Theme.colors.state.errorSoft }, detailActionDeleteText: { color: Theme.colors.state.error, fontFamily: 'Inter-Bold', fontSize: 8 }, productHero: { flexDirection: 'row', gap: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 23, padding: 14, backgroundColor: Theme.colors.surface.base }, productImage: { width: 114, height: 114, flexShrink: 0, borderRadius: 18, backgroundColor: Theme.colors.surface.base }, productImageEmpty: { width: 114, height: 114, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Theme.colors.surface.brandSoft }, productHeroCopy: { flex: 1, justifyContent: 'center', minWidth: 0 }, productName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16, lineHeight: 21 }, productSku: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 9, marginTop: 7 }, productStock: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6, marginTop: 10 }, productMetrics: { flexDirection: 'row', gap: 9 }, productMetric: { flex: 1, gap: 6, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 19, padding: 14, backgroundColor: Theme.colors.surface.base }, productPrice: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 15 }, detailValue: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 }, specRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#DEE8F0', paddingVertical: 8 }, specGroup: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7 }, specLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 9, marginTop: 3 }, specValue: { maxWidth: '48%', color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10, textAlign: 'right' },
  spvScheduledBadge: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#3B82F680', borderRadius: 99, paddingHorizontal: 8, backgroundColor: '#2563EB24' },
  spvScheduledText: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.4 },
  spvReferenceBadge: { minHeight: 26, justifyContent: 'center', borderWidth: 1, borderColor: '#087FF580', borderRadius: 99, paddingHorizontal: 9, backgroundColor: Theme.colors.surface.brandSoft },
  spvReferenceText: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.4 },
  productCodeBadge: { alignSelf: 'flex-start', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: Theme.colors.surface.brandSoft, marginTop: 8 },
  productCodeLabel: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.7 },
  productCodeValue: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 10, marginTop: 2 },
  invoiceSpvButtonSent: { borderColor: '#34D39966', backgroundColor: Theme.colors.surface.cyanSoft },
  invoiceSpvButtonProcessing: { opacity: 0.82, borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft },
  invoiceSpvButtonIconSent: { backgroundColor: '#34D3991C' },
});
