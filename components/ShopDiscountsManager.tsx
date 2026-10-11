import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Check, ChevronRight, Clock3, ImageOff, Mail, Megaphone, Package, Pencil, Plus, Search, ShoppingBag, Tags, Trash2, UserRound, Users, X } from 'lucide-react-native';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopCustomerSummary, ShopProduct, ShopPromotion, ShopPromotionPayload, ShopPromotionStats } from '@/services/shopApi';

type PromotionForm = ShopPromotionPayload & { id: string | null; valueText: string; minText: string };

const emptyForm = (): PromotionForm => ({
  id: null, code: '', title: '', description: '', discount_type: 'percent', discount_value: 10, valueText: '10', min_order_value: 0, minText: '', audience: 'all', scope: 'global', product_id: null, product_ids: [], customer_ids: [], usage_mode: 'unlimited', auto_apply: true, show_banner: true, banner_text: '', valid_from: '', valid_until: '', is_active: true,
});
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value.replace(' ', 'T'))) : 'oricând';
const parsePromotionDate = (value?: string | null) => { const parsed = value ? new Date(String(value).replace(' ', 'T')) : new Date(); return Number.isNaN(parsed.getTime()) ? new Date() : parsed; };
const promotionDateValue = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
const promotionDateDisplay = (value?: string | null) => value ? new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsePromotionDate(value)) : 'Alege data și ora';
const moneyLabel = (value: number | null | undefined) => `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} lei`;
const promotionStatus = (item: Pick<ShopPromotion, 'is_active' | 'valid_until'>) => {
  if (!item.is_active) return { key: 'off' as const, label: 'OPRITĂ' };
  const until = item.valid_until ? new Date(String(item.valid_until).replace(' ', 'T')) : null;
  if (until && !Number.isNaN(until.getTime()) && until.getTime() < Date.now()) return { key: 'expired' as const, label: 'EXPIRATĂ' };
  return { key: 'active' as const, label: 'ACTIVĂ' };
};

export default function ShopDiscountsManager() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [items, setItems] = useState<ShopPromotion[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [allProductIds, setAllProductIds] = useState<string[] | null>(null);
  const [selectingAllProducts, setSelectingAllProducts] = useState(false);
  const [customers, setCustomers] = useState<ShopCustomerSummary[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PromotionForm | null>(null);
  const [details, setDetails] = useState<ShopPromotionStats | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [datePicker, setDatePicker] = useState<{ field: 'valid_from' | 'valid_until'; mode: 'date' | 'time'; value: Date } | null>(null);
  const productRequest = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const discounts = await shopApi.listPromotions(token);
      setItems(Array.isArray(discounts) ? discounts : []);
    } catch (error) { Alert.alert('Reducerile nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const loadProductOptions = useCallback(async (query = '', ids: string[] = []) => {
    if (!token) return;
    const cleanQuery = query.trim();
    const cleanIds = [...new Set(ids.filter(Boolean))];
    if (!cleanQuery && !cleanIds.length) {
      productRequest.current += 1;
      setProducts([]);
      setProductsLoading(false);
      return;
    }
    const request = ++productRequest.current;
    setProductsLoading(true);
    try {
      const catalog = await shopApi.listProductOptions(token, { q: cleanQuery, ids: cleanIds, limit: cleanIds.length ? 250 : 40 });
      if (request !== productRequest.current) return;
      setProducts(Array.isArray(catalog) ? catalog : []);
    } catch (error) {
      if (request === productRequest.current) Alert.alert('Căutarea nu a reușit', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { if (request === productRequest.current) setProductsLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!form || form.scope !== 'product') return;
    const query = productQuery.trim();
    const timer = setTimeout(() => { void loadProductOptions(query, query ? [] : form.product_ids); }, query ? 180 : 0);
    return () => clearTimeout(timer);
  }, [form, productQuery, loadProductOptions]);

  const loadCustomerOptions = useCallback(async () => {
    if (!token) return [] as ShopCustomerSummary[];
    if (customersLoaded || customersLoading) return customers;
    setCustomersLoading(true);
    try {
      const rows = await shopApi.listCustomers(token);
      const next = Array.isArray(rows) ? rows : [];
      setCustomers(next);
      setCustomersLoaded(true);
      return next;
    } catch (error) {
      Alert.alert('Clienții nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.');
      return [] as ShopCustomerSummary[];
    } finally { setCustomersLoading(false); }
  }, [token, customers, customersLoading, customersLoaded]);

  useEffect(() => {
    if (form?.audience === 'selected') void loadCustomerOptions();
  }, [form?.audience, loadCustomerOptions]);

  const activeCount = items.filter((item) => promotionStatus(item).key === 'active').length;
  const bannerCount = items.filter((item) => promotionStatus(item).key === 'active' && item.show_banner).length;
  const selectedIds = useMemo(() => form?.product_ids || [], [form?.product_ids]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allProductsSelected = Boolean(allProductIds?.length && allProductIds.every((id) => selectedIdSet.has(id)));
  const selectedProducts = useMemo(() => products.filter((product) => selectedIdSet.has(product.id)).sort((a, b) => a.name.localeCompare(b.name, 'ro-RO', { sensitivity: 'base' })), [products, selectedIdSet]);
  const matchingProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase('ro-RO');
    if (!query) return [];
    return [...products]
      .sort((a, b) => a.name.localeCompare(b.name, 'ro-RO', { sensitivity: 'base' }))
      .filter((product) => `${product.name} ${product.sku || ''} ${product.supplier_product_code || ''}`.toLocaleLowerCase('ro-RO').includes(query));
  }, [products, productQuery]);
  const selectedCustomerIds = useMemo(() => form?.customer_ids || [], [form?.customer_ids]);
  const selectedCustomerIdSet = useMemo(() => new Set(selectedCustomerIds), [selectedCustomerIds]);
  const selectedCustomers = useMemo(() => customers.filter((customer) => selectedCustomerIdSet.has(customer.id)).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ro-RO', { sensitivity: 'base' })), [customers, selectedCustomerIdSet]);
  const matchingCustomers = useMemo(() => {
    const query = customerQuery.trim().toLocaleLowerCase('ro-RO');
    if (!query) return [];
    return customers.filter((customer) => `${customer.full_name} ${customer.email} ${customer.phone || ''}`.toLocaleLowerCase('ro-RO').includes(query));
  }, [customers, customerQuery]);
  const allCustomersSelected = customers.length > 0 && customers.every((customer) => selectedCustomerIdSet.has(customer.id));

  const edit = (item?: ShopPromotion) => {
    setProductQuery('');
    setProducts([]);
    setAllProductIds(null);
    setCustomerQuery('');
    const next = item ? { ...item, product_ids: item.product_ids?.length ? item.product_ids : (item.product_id ? [item.product_id] : []), customer_ids: item.customer_ids || [], usage_mode: item.usage_mode || 'unlimited', valueText: String(item.discount_value), minText: item.min_order_value ? String(item.min_order_value) : '' } : emptyForm();
    setForm(next);
    if (next.product_ids.length) void loadProductOptions('', next.product_ids);
  };

  const toggleAllProducts = async () => {
    if (!token || !form || selectingAllProducts) return;
    setSelectingAllProducts(true);
    try {
      const ids = allProductIds || await shopApi.listProductOptionIds(token);
      setAllProductIds(ids);
      const currentIds = new Set(form.product_ids);
      const allSelected = ids.length > 0 && ids.every((id) => currentIds.has(id));
      setForm({ ...form, product_ids: allSelected ? [] : ids, product_id: allSelected ? null : ids[0] || null });
    } catch (error) { Alert.alert('Produsele nu au putut fi selectate', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setSelectingAllProducts(false); }
  };

  const toggleAllCustomers = async () => {
    if (!form) return;
    const rows = customersLoaded ? customers : await loadCustomerOptions();
    const ids = rows.map((customer) => customer.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedCustomerIdSet.has(id));
    setForm((current) => current ? { ...current, customer_ids: allSelected ? [] : ids } : current);
  };

  const openDatePicker = (field: 'valid_from' | 'valid_until') => setDatePicker({ field, mode: 'date', value: parsePromotionDate(form?.[field]) });
  const handleDatePicker = (event: DateTimePickerEvent, picked?: Date) => {
    if (!datePicker) return;
    if (event.type === 'dismissed' || !picked) return setDatePicker(null);
    const next = new Date(datePicker.value);
    if (datePicker.mode === 'date') {
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      setDatePicker({ ...datePicker, mode: 'time', value: next });
      return;
    }
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setForm((current) => current ? { ...current, [datePicker.field]: promotionDateValue(next) } : current);
    setDatePicker(null);
  };

  const save = async () => {
    if (!token || !form || saving) return;
    const discountValue = Number(form.valueText.replace(',', '.'));
    const minOrder = form.minText.trim() ? Number(form.minText.replace(',', '.')) : 0;
    if (!form.code.trim() || !form.title.trim()) return Alert.alert('Completează reducerea', 'Codul și titlul sunt obligatorii.');
    if (!discountValue || discountValue < 0) return Alert.alert('Valoare invalidă', 'Introdu o valoare mai mare decât zero.');
    if (form.scope === 'product' && !form.product_ids.length) return Alert.alert('Alege produsele', 'Reducerea per produs are nevoie de cel puțin un produs selectat.');
    if (form.audience === 'selected' && !form.customer_ids.length) return Alert.alert('Alege clienții', 'Selectează cel puțin un client care va beneficia de reducere.');
    const productIds = form.scope === 'product' ? form.product_ids : [];
    const customerIds = form.audience === 'selected' ? form.customer_ids : [];
    const payload: ShopPromotionPayload = { ...form, code: form.code.trim().toUpperCase(), title: form.title.trim(), description: form.description.trim(), banner_text: form.banner_text.trim() || form.title.trim(), discount_value: discountValue, min_order_value: minOrder, product_ids: productIds, product_id: productIds[0] || null, customer_ids: customerIds };
    delete (payload as Partial<PromotionForm>).id; delete (payload as Partial<PromotionForm>).valueText; delete (payload as Partial<PromotionForm>).minText;
    setSaving(true);
    try {
      if (form.id) await shopApi.updatePromotion(token, form.id, payload);
      else await shopApi.createPromotion(token, payload);
      setForm(null); await load();
    } catch (error) { Alert.alert('Reducerea nu s-a putut salva', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setSaving(false); }
  };

  const remove = (item: ShopPromotion) => Alert.alert('Ștergi reducerea?', `${item.title} nu va mai putea fi folosită.`, [{ text: 'Renunță', style: 'cancel' }, { text: 'Șterge', style: 'destructive', onPress: async () => { if (!token) return; try { await shopApi.deletePromotion(token, item.id); await load(); } catch (error) { Alert.alert('Nu s-a putut șterge', error instanceof Error ? error.message : 'Încearcă din nou.'); } } }]);

  const openDetails = async (item: ShopPromotion) => {
    if (!token || detailsLoading) return;
    setDetailsLoading(true);
    try { setDetails(await shopApi.getPromotionStats(token, item.id)); }
    catch (error) { Alert.alert('Statisticile nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setDetailsLoading(false); }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={Colors.orange} /><Text style={styles.loadingTitle}>Se pregătesc reducerile</Text></View>;

  return <View style={styles.page}>
    <View style={[styles.hero, compact && styles.heroCompact]}><View style={styles.heroAura} /><AnimatedPercentBadge size={compact ? 58 : 64} /><View style={styles.heroCopy}><Text style={styles.kicker}>CONTROL PROMOȚII</Text><Text style={styles.title}>{activeCount ? `${activeCount} ${activeCount === 1 ? 'campanie activă' : 'campanii active'}` : 'Oferte care convertesc'}</Text><Text style={styles.subtitle}>{items.length ? 'Urmărește ofertele și ajustează rapid publicul, produsele sau perioada.' : 'Creează prima ofertă și public-o în magazin în doar câțiva pași.'}</Text></View><TouchableOpacity accessibilityLabel="Adaugă reducere" style={styles.add} onPress={() => edit()}><Plus size={20} color="#FFFFFF" /></TouchableOpacity></View>
    <View style={[styles.metrics, compact && styles.metricsCompact]}><Metric compact={compact} Icon={Tags} label="ACTIVE" value={activeCount} color="#34D399" /><Metric compact={compact} Icon={Megaphone} label="ÎN BARA SITE-ULUI" value={bannerCount} color="#087FF5" /><Metric compact={compact} Icon={ShoppingBag} label="APLICĂRI" value={items.reduce((sum, item) => sum + Number(item.application_count || 0), 0)} color="#09BFD9" /></View>
    <View style={styles.info}><View style={styles.infoIcon}><Megaphone size={18} color="#087FF5" /></View><View style={styles.infoCopy}><Text style={styles.infoKicker}>VIZIBILITATE ÎN MAGAZIN</Text><Text style={styles.infoTitle}>Anunțul ajunge imediat la clienți</Text><Text style={styles.infoText}>Campaniile publice apar într-o bandă animată deasupra navigării.</Text></View><ChevronRight size={18} color="#087FF5" /></View>
    <View style={styles.list}>{items.map((item) => <PromotionCard key={item.id} item={item} compact={compact} onOpen={() => void openDetails(item)} onEdit={() => edit(item)} onDelete={() => remove(item)} />)}{!items.length ? <View style={styles.empty}><View style={styles.emptyAura} /><AnimatedPercentBadge size={72} /><Text style={styles.emptyKicker}>START RAPID</Text><Text style={styles.emptyTitle}>Prima campanie, gata în câteva minute</Text><Text style={styles.emptyText}>Alegi valoarea, publicul și perioada. Cubis Shop urmărește rezultatele pentru tine.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => edit()}><Plus size={17} color="#FFFFFF" /><Text style={styles.emptyButtonText}>Creează o reducere</Text></TouchableOpacity><View style={styles.emptySteps}><View style={styles.emptyStep}><Text style={styles.emptyStepNumber}>01</Text><Text style={styles.emptyStepLabel}>Oferta</Text></View><View style={styles.emptyStep}><Text style={styles.emptyStepNumber}>02</Text><Text style={styles.emptyStepLabel}>Publicul</Text></View><View style={styles.emptyStep}><Text style={styles.emptyStepNumber}>03</Text><Text style={styles.emptyStepLabel}>Rezultatele</Text></View></View></View> : null}</View>

    <Modal visible={Boolean(details)} transparent animationType="fade" onRequestClose={() => setDetails(null)}><View style={styles.backdrop}><View style={[styles.sheet, styles.statsSheet, compact && styles.sheetCompact, { paddingBottom: Math.max(14, insets.bottom) }]}>{details ? <><View style={styles.sheetHead}><AnimatedPercentBadge size={48} /><View style={styles.sheetHeadCopy}><Text style={styles.sheetKicker}>REZULTATE CAMPANIE</Text><Text numberOfLines={1} style={styles.sheetTitle}>{details.promotion.title}</Text><Text style={styles.sheetSubtitle}>Performanță și aplicări eligibile.</Text></View><TouchableOpacity style={styles.close} onPress={() => setDetails(null)}><X size={20} color="#536A80" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.statsContent} showsVerticalScrollIndicator={false}>
      <View style={styles.statsHero}><AnimatedPercentBadge size={66} /><View style={styles.statsHeroCopy}><Text style={styles.statsValue}>{details.promotion.discount_type === 'percent' ? `${details.promotion.discount_value}%` : moneyLabel(details.promotion.discount_value)}</Text><Text style={styles.statsCode}>COD {details.promotion.code} · <Text style={promotionStatus(details.promotion).key === 'expired' ? styles.statsStatusExpired : promotionStatus(details.promotion).key === 'off' ? styles.statsStatusOff : styles.statsStatusActive}>{promotionStatus(details.promotion).label}</Text></Text><Text style={styles.statsDescription}>{details.promotion.description || 'Campanie fără descriere.'}</Text></View></View>
      <View style={[styles.metrics, compact && styles.metricsCompact]}><Metric compact={compact} Icon={ShoppingBag} label="APLICĂRI VALIDE" value={details.summary.application_count} color="#34D399" /><Metric compact={compact} Icon={Tags} label="TOTAL REDUS" value={moneyLabel(details.summary.total_discount_given)} color="#09BFD9" /><Metric compact={compact} Icon={Users} label="VALOARE COMENZI" value={moneyLabel(details.summary.orders_total)} color="#087FF5" /></View>
      <View style={styles.statsFacts}><Text style={styles.statsFact}>Public: {audienceLabel(details.promotion)}</Text><Text style={styles.statsFact}>Aplicare: {details.promotion.scope === 'global' ? 'toată comanda' : `${details.promotion.product_ids.length} produse`}</Text><Text style={styles.statsFact}>Medie redusă: {moneyLabel(details.summary.average_discount)}</Text><Text style={styles.statsFact}>Perioadă: {dateLabel(details.promotion.valid_from)} — {dateLabel(details.promotion.valid_until)}</Text></View>
      <Text style={styles.statsSectionTitle}>ULTIMELE APLICĂRI</Text>
      <View style={styles.applicationList}>{details.applications.map((application) => <View key={application.id} style={[styles.applicationRow, !application.is_counted && styles.applicationExcluded]}><View style={styles.applicationIcon}><ShoppingBag size={17} color="#09BFD9" /></View><View style={styles.applicationCopy}><Text style={styles.applicationTitle}>{application.order_number} · {application.customer_display_name || application.customer_name}</Text><Text style={styles.applicationMeta}>{dateLabel(application.created_at)} · {application.is_counted ? 'inclusă în statistici' : 'anulată/rambursată'}</Text></View><View style={styles.applicationAmount}><Text style={styles.applicationDiscount}>-{moneyLabel(application.discount_total)}</Text><Text style={styles.applicationTotal}>{moneyLabel(application.total)}</Text></View></View>)}{!details.applications.length ? <View style={styles.productEmpty}><ShoppingBag size={21} color="#756C75" /><Text style={styles.productEmptyTitle}>Încă nu există aplicări</Text><Text style={styles.productLoadingText}>Primele comenzi cu această reducere vor apărea aici.</Text></View> : null}</View>
      <TouchableOpacity style={styles.statsEdit} onPress={() => { const item = details.promotion; setDetails(null); setTimeout(() => edit(item), 180); }}><Pencil size={17} color="#FFFFFF" /><Text>Editează reducerea</Text></TouchableOpacity>
    </ScrollView></> : null}</View></View></Modal>

    <Modal visible={Boolean(form)} transparent animationType="slide" onRequestClose={() => !saving && setForm(null)}><View style={styles.backdrop}><View style={[styles.sheet, compact && styles.sheetCompact, { paddingBottom: Math.max(14, insets.bottom) }]}>{form ? <><View style={styles.sheetHead}><AnimatedPercentBadge size={48} /><View style={styles.sheetHeadCopy}><Text style={styles.sheetKicker}>PROMOȚII CUBIS SHOP</Text><Text style={styles.sheetTitle}>{form.id ? 'Editează reducerea' : 'Reducere nouă'}</Text><Text style={styles.sheetSubtitle}>Configurează oferta într-un singur flux.</Text></View><TouchableOpacity style={styles.close} onPress={() => setForm(null)}><X size={20} color="#536A80" /></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
      <FormSection step="01" title="Identitatea campaniei" subtitle="Codul și mesajul pe care îl vor recunoaște clienții.">
        <View style={styles.fieldRow}><Field label="COD REDUCERE *" value={form.code} onChangeText={(value) => setForm({ ...form, code: value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="CUBIS10" /><Field label="TITLU *" value={form.title} onChangeText={(value) => setForm({ ...form, title: value })} placeholder="10% pentru comenzi mari" /></View>
        <Field label="DESCRIERE" value={form.description} onChangeText={(value) => setForm({ ...form, description: value })} placeholder="Detalii interne sau pentru client" multiline />
      </FormSection>
      <FormSection step="02" title="Valoare și eligibilitate" subtitle="Alege beneficiul, publicul și produsele incluse.">
      <Choice title="TIP REDUCERE" options={[['percent', 'Procent (%)'], ['fixed', 'Sumă fixă']]} selected={form.discount_type} onSelect={(value) => setForm({ ...form, discount_type: value as 'percent' | 'fixed' })} />
      <View style={styles.fieldRow}><Field label={form.discount_type === 'percent' ? 'REDUCERE % *' : 'REDUCERE LEI *'} value={form.valueText} onChangeText={(value) => setForm({ ...form, valueText: value })} keyboardType="decimal-pad" /><Field label="COMANDĂ MINIMĂ (LEI)" value={form.minText} onChangeText={(value) => setForm({ ...form, minText: value })} keyboardType="decimal-pad" placeholder="Fără prag" /></View>
      <Choice title="CINE BENEFICIAZĂ" options={[['all', 'Toți utilizatorii'], ['registered', 'Doar cei înregistrați'], ['selected', 'Clienți selectați']]} selected={form.audience} onSelect={(value) => setForm({ ...form, audience: value as ShopPromotion['audience'], customer_ids: value === 'selected' ? form.customer_ids : [] })} />
      {form.audience === 'selected' ? <View style={styles.customerPicker}>
        <View style={styles.productPickerHead}><View><Text style={styles.label}>CLIENȚI SELECTAȚI *</Text><Text style={styles.productPickerHint}>{selectedCustomerIds.length} selectați · caută după nume, e-mail sau telefon</Text></View><View style={styles.productPickerActions}><TouchableOpacity style={[styles.selectAll, allCustomersSelected && styles.selectAllActive]} onPress={() => void toggleAllCustomers()}>{customersLoading ? <ActivityIndicator size="small" color="#09BFD9" /> : <Users size={15} color={allCustomersSelected ? '#FFFFFF' : '#09BFD9'} />}<Text style={[styles.selectAllText, allCustomersSelected && styles.selectAllTextActive]}>{allCustomersSelected ? 'Deselectează toți' : 'Selectează toți clienții'}</Text></TouchableOpacity>{matchingCustomers.length ? <TouchableOpacity style={styles.selectResults} onPress={() => setForm({ ...form, customer_ids: [...new Set([...selectedCustomerIds, ...matchingCustomers.map((customer) => customer.id)])] })}><Plus size={14} color="#AFA5AE" /><Text style={styles.selectResultsText}>Selectează rezultatele</Text></TouchableOpacity> : null}</View></View>
        {selectedCustomers.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedProducts}>{selectedCustomers.map((customer) => <TouchableOpacity key={customer.id} style={styles.selectedCustomer} onPress={() => setForm({ ...form, customer_ids: selectedCustomerIds.filter((id) => id !== customer.id) })}><ClientAvatar customer={customer} small /><Text numberOfLines={1}>{customer.full_name || customer.email}</Text><X size={15} color="#536A80" /></TouchableOpacity>)}</ScrollView> : null}
        <View style={styles.productSearch}><Search size={17} color="#087FF5" /><TextInput value={customerQuery} onChangeText={setCustomerQuery} placeholder="Caută client după nume, e-mail sau telefon" placeholderTextColor="#686168" style={styles.productSearchInput} />{customerQuery ? <TouchableOpacity onPress={() => setCustomerQuery('')}><X size={17} color="#A69DA5" /></TouchableOpacity> : null}</View>
        {customersLoading ? <View style={styles.productLoading}><ActivityIndicator color="#087FF5" /><Text style={styles.productLoadingText}>Se încarcă lista clienților…</Text></View> : customerQuery.trim() ? <ScrollView style={styles.productResults} nestedScrollEnabled keyboardShouldPersistTaps="handled">{matchingCustomers.map((customer) => { const selected = selectedCustomerIdSet.has(customer.id); return <TouchableOpacity key={customer.id} style={[styles.productResult, selected && styles.productResultSelected]} onPress={() => setForm({ ...form, customer_ids: selected ? selectedCustomerIds.filter((id) => id !== customer.id) : [...selectedCustomerIds, customer.id] })}><ClientAvatar customer={customer} /><View style={styles.productResultCopy}><Text numberOfLines={1} style={styles.productName}>{customer.full_name || 'Client fără nume'}</Text><View style={styles.productDetails}><Mail size={12} color="#8E858E" /><Text numberOfLines={1} style={styles.productSku}>{customer.email}</Text><Text style={[styles.productStock, !customer.is_active && styles.productStockOut]}>{customer.is_active ? 'Cont activ' : 'Cont dezactivat'}</Text></View></View><View style={[styles.productCheck, selected && styles.productCheckActive]}>{selected ? <Check size={15} color="#FFFFFF" /> : null}</View></TouchableOpacity>; })}{!matchingCustomers.length ? <View style={styles.productEmpty}><UserRound size={20} color="#756C75" /><Text style={styles.productLoadingText}>Nu am găsit niciun client.</Text></View> : null}</ScrollView> : <View style={styles.productEmpty}><Users size={21} color="#087FF5" /><Text style={styles.productEmptyTitle}>Alege exact cine primește reducerea</Text><Text style={styles.productLoadingText}>Caută un client sau folosește butonul pentru a-i selecta pe toți.</Text></View>}
      </View> : null}
      <Choice title="UNDE SE APLICĂ" options={[['global', 'Toată comanda'], ['product', 'Produse selectate']]} selected={form.scope} onSelect={(value) => { setForm({ ...form, scope: value as 'global' | 'product', product_id: value === 'global' ? null : form.product_id, product_ids: value === 'global' ? [] : form.product_ids }); if (value === 'product') void loadProductOptions(); }} />
      {form.scope !== 'product' ? <TouchableOpacity style={styles.productPickerShortcut} onPress={() => { setForm({ ...form, scope: 'product' }); void loadProductOptions(); }}><View style={styles.productPickerShortcutIcon}><Package size={22} color="#09BFD9" /></View><View style={styles.productPickerShortcutCopy}><Text style={styles.productPickerShortcutKicker}>SELECTOR PRODUSE</Text><Text style={styles.productPickerShortcutTitle}>Alege produse din catalog</Text><Text style={styles.productPickerShortcutText}>Caută după nume sau cod, vezi poza și stocul ori selectează toate produsele.</Text></View><Plus size={20} color="#09BFD9" /></TouchableOpacity> : null}
      <Choice title="LIMITĂ DE UTILIZARE" options={[['unlimited', 'Fără limită'], ['once_per_customer', 'O dată per utilizator'], ['once_per_device', 'O dată per dispozitiv']]} selected={form.usage_mode} onSelect={(value) => setForm({ ...form, usage_mode: value as ShopPromotion['usage_mode'] })} />
      {form.scope === 'product' ? <View style={styles.productPicker}>
        <View style={styles.productPickerHead}><View><Text style={styles.label}>PRODUSE SELECTATE *</Text><Text style={styles.productPickerHint}>{selectedIds.length} selectate · caută în catalog după nume sau cod</Text></View><View style={styles.productPickerActions}><TouchableOpacity style={[styles.selectAll, allProductsSelected && styles.selectAllActive]} onPress={() => void toggleAllProducts()}>{selectingAllProducts ? <ActivityIndicator size="small" color="#09BFD9" /> : <Check size={15} color={allProductsSelected ? '#FFFFFF' : '#09BFD9'} />}<Text style={[styles.selectAllText, allProductsSelected && styles.selectAllTextActive]}>{allProductsSelected ? 'Deselectează toate' : 'Selectează toate produsele'}</Text></TouchableOpacity>{matchingProducts.length ? <TouchableOpacity style={styles.selectResults} onPress={() => { const next = [...new Set([...selectedIds, ...matchingProducts.map((product) => product.id)])]; setForm({ ...form, product_ids: next, product_id: next[0] || null }); }}><Plus size={14} color="#AFA5AE" /><Text style={styles.selectResultsText}>Selectează rezultatele</Text></TouchableOpacity> : null}</View></View>
        {selectedProducts.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedProducts}>{selectedProducts.map((product) => <TouchableOpacity key={product.id} style={styles.selectedProduct} onPress={() => { const next = selectedIds.filter((id) => id !== product.id); setForm({ ...form, product_ids: next, product_id: next[0] || null }); }}><ProductThumb product={product} small /><Text numberOfLines={1}>{product.name}</Text><X size={15} color="#536A80" /></TouchableOpacity>)}</ScrollView> : null}
        <View style={styles.productSearch}><Search size={17} color="#087FF5" /><TextInput value={productQuery} onChangeText={setProductQuery} placeholder="Caută după nume sau cod produs" placeholderTextColor="#686168" style={styles.productSearchInput} />{productQuery ? <TouchableOpacity onPress={() => setProductQuery('')}><X size={17} color="#A69DA5" /></TouchableOpacity> : null}</View>
        {productsLoading ? <View style={styles.productLoading}><ActivityIndicator color="#087FF5" /><Text style={styles.productLoadingText}>Căutăm produsele…</Text></View> : productQuery.trim() ? <ScrollView style={styles.productResults} nestedScrollEnabled keyboardShouldPersistTaps="handled">{matchingProducts.map((product) => { const selected = selectedIds.includes(product.id); const nextStock = product.stock_mode === 'unlimited' ? 'Stoc nelimitat' : product.stock_quantity > 0 ? (product.stock_quantity + ' în stoc') : 'Stoc epuizat'; return <TouchableOpacity key={product.id} style={[styles.productResult, selected && styles.productResultSelected]} onPress={() => { const next = selected ? selectedIds.filter((id) => id !== product.id) : [...selectedIds, product.id]; setForm({ ...form, product_ids: next, product_id: next[0] || null }); }}><ProductThumb product={product} /><View style={styles.productResultCopy}><Text numberOfLines={2} style={styles.productName}>{product.name}</Text><View style={styles.productDetails}><Text style={styles.productSku}>{product.sku || product.supplier_product_code || 'Fără cod'}</Text><Text style={[styles.productStock, product.stock_mode !== 'unlimited' && product.stock_quantity <= 0 && styles.productStockOut]}>{nextStock}</Text></View></View><View style={[styles.productCheck, selected && styles.productCheckActive]}>{selected ? <Check size={15} color="#FFFFFF" /> : null}</View></TouchableOpacity>; })}{!matchingProducts.length ? <View style={styles.productEmpty}><Search size={20} color="#756C75" /><Text style={styles.productLoadingText}>Nu am găsit produse pentru această căutare.</Text></View> : null}</ScrollView> : <View style={styles.productEmpty}><Search size={21} color="#087FF5" /><Text style={styles.productEmptyTitle}>Scrie numele sau codul produsului</Text><Text style={styles.productLoadingText}>Catalogul nu este încărcat în fundal. Rezultatele apar pe măsură ce scrii.</Text></View>}
      </View> : null}
      </FormSection>
      <FormSection step="03" title="Perioadă și vizibilitate" subtitle="Programează campania și decide cum apare în magazin.">
      <View style={styles.fieldRow}><DateField label="ÎNCEPE LA" value={form.valid_from} onPress={() => openDatePicker('valid_from')} onClear={() => setForm({ ...form, valid_from: '' })} /><DateField label="SE TERMINĂ LA" value={form.valid_until} onPress={() => openDatePicker('valid_until')} onClear={() => setForm({ ...form, valid_until: '' })} /></View>
      {datePicker ? <View style={styles.nativePicker}><View style={styles.nativePickerHead}><View style={styles.nativePickerIcon}>{datePicker.mode === 'date' ? <CalendarDays size={18} color="#087FF5" /> : <Clock3 size={18} color="#087FF5" />}</View><View><Text style={styles.nativePickerTitle}>{datePicker.mode === 'date' ? 'Alege data' : 'Alege ora'}</Text><Text style={styles.nativePickerText}>{datePicker.mode === 'date' ? 'După dată vei selecta și ora.' : 'Ultimul pas pentru programarea promoției.'}</Text></View></View><DateTimePicker value={datePicker.value} mode={datePicker.mode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} minuteInterval={5} onChange={handleDatePicker} themeVariant="light" /><TouchableOpacity style={styles.pickerCancel} onPress={() => setDatePicker(null)}><Text>Renunță</Text></TouchableOpacity></View> : null}
      <Field label="TEXT ÎN BARA SITE-ULUI" value={form.banner_text} onChangeText={(value) => setForm({ ...form, banner_text: value })} placeholder="Reducere specială Cubis Shop — descoperă oferta" />
      <Toggle title="Reducere activă" text="Campania poate fi folosită în perioada aleasă." value={form.is_active} onChange={(value) => setForm({ ...form, is_active: value })} />
      <Toggle title="Aplicare automată" text="Clientul primește automat cea mai bună reducere eligibilă." value={form.auto_apply} onChange={(value) => setForm({ ...form, auto_apply: value })} />
      <Toggle title="Afișează în bara site-ului" text="Anunțul apare animat deasupra meniului magazinului." value={form.show_banner} onChange={(value) => setForm({ ...form, show_banner: value })} />
      </FormSection>
      <TouchableOpacity disabled={saving} style={[styles.save, saving && styles.saveDisabled]} onPress={() => void save()}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.saveText}>Salvează campania</Text><View style={styles.saveIcon}><Text style={styles.savePercent}>%</Text></View></>}</TouchableOpacity>
    </ScrollView></> : null}</View></View></Modal>
  </View>;
}

function audienceLabel(item: ShopPromotion) { return item.audience === 'selected' ? `${item.customer_count} clienți selectați` : item.audience === 'registered' ? 'clienți autentificați' : 'toți clienții'; }
function Metric({ Icon, label, value, color, compact = false }: { Icon: typeof Tags; label: string; value: number | string; color: string; compact?: boolean }) { return <View style={[styles.metric, compact && styles.metricCompactCard]}><View style={[styles.metricIcon, compact && styles.metricIconCompact, { backgroundColor: `${color}18` }]}><Icon size={compact ? 17 : 20} color={color} /></View><View style={styles.metricCopy}><Text numberOfLines={2} style={[styles.metricLabel, compact && styles.metricLabelCompact, { color }]}>{label}</Text><Text numberOfLines={1} style={[styles.metricValue, compact && styles.metricValueCompact]}>{value}</Text></View></View>; }
function AnimatedPercentBadge({ size = 48 }: { size?: number }) {
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => { const loop = Animated.loop(Animated.sequence([Animated.timing(motion, { toValue: 1, duration: 850, useNativeDriver: true }), Animated.delay(1250), Animated.timing(motion, { toValue: 0, duration: 650, useNativeDriver: true }), Animated.delay(800)])); loop.start(); return () => loop.stop(); }, [motion]);
  const transform = [{ rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] }) }, { scale: motion.interpolate({ inputRange: [0, .55, 1], outputRange: [1, 1.13, 1] }) }];
  return <Animated.View style={[styles.percentBadge, { width: size, height: size, borderRadius: size * .34, transform }]}><View style={styles.percentRing} /><Text style={[styles.percentText, { fontSize: size * .42 }]}>%</Text></Animated.View>;
}
function PromotionCard({ item, compact, onOpen, onEdit, onDelete }: { item: ShopPromotion; compact: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const status = promotionStatus(item);
  return <TouchableOpacity activeOpacity={.82} onPress={onOpen} style={[styles.card, compact && styles.cardCompact, status.key !== 'active' && styles.cardOff, status.key === 'expired' && styles.cardExpired]}><AnimatedPercentBadge size={compact ? 42 : 46} /><View style={styles.cardCopy}><View style={styles.cardTop}><View style={styles.cardIdentity}><Text style={styles.cardCode}>COD {item.code}</Text><Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text></View><Text style={styles.cardValue}>{item.discount_type === 'percent' ? `${item.discount_value}%` : moneyLabel(item.discount_value)} <Text style={styles.cardScope}>· {item.scope === 'global' ? 'toată comanda' : `${item.product_ids.length} produse`}</Text></Text></View><View style={styles.cardBadges}><Text style={[styles.statusChip, status.key === 'off' && styles.statusChipOff, status.key === 'expired' && styles.statusChipExpired]}>{status.label}</Text><Text style={styles.metaChip}>PUBLIC · {audienceLabel(item)}</Text><Text style={styles.metaChip}>PERIOADĂ · {dateLabel(item.valid_from)} — {dateLabel(item.valid_until)}</Text><Text style={styles.tag}>{item.auto_apply ? 'AUTOMATĂ' : 'COD MANUAL'}</Text>{item.show_banner ? <Text style={styles.tag}>BANDĂ SITE</Text> : null}<Text style={styles.openStatsTag}>STATISTICI LA APĂSARE</Text></View></View><View style={[styles.cardActions, compact && styles.cardActionsCompact]}><TouchableOpacity style={[styles.action, compact && styles.actionCompact]} onPress={(event) => { event.stopPropagation(); onEdit(); }}><Pencil size={compact ? 15 : 17} color="#087FF5" /></TouchableOpacity><TouchableOpacity style={[styles.action, styles.delete, compact && styles.actionCompact]} onPress={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={compact ? 15 : 17} color="#FB7185" /></TouchableOpacity><View style={[styles.action, styles.openAction, compact && styles.actionCompact]}><ChevronRight size={compact ? 16 : 18} color="#09BFD9" /></View></View></TouchableOpacity>;
}
function ClientAvatar({ customer, small = false }: { customer: ShopCustomerSummary; small?: boolean }) { const initial = String(customer.full_name || customer.email || '?').trim().charAt(0).toUpperCase(); return <View style={[styles.customerAvatar, small && styles.customerAvatarSmall]}>{customer.avatar_url ? <Image source={{ uri: customer.avatar_url }} style={styles.productThumbImage} /> : <Text style={[styles.customerAvatarText, small && styles.customerAvatarTextSmall]}>{initial}</Text>}</View>; }
function ProductThumb({ product, small = false }: { product: ShopProduct; small?: boolean }) {
  const image = product.images?.[0]?.url;
  return <View style={[styles.productThumb, small && styles.productThumbSmall]}>{image ? <Image source={{ uri: image }} style={styles.productThumbImage} resizeMode="cover" /> : <ImageOff size={small ? 14 : 18} color="#817981" />}</View>;
}
function FormSection({ step, title, subtitle, children }: { step: string; title: string; subtitle: string; children: React.ReactNode }) { return <View style={styles.formSection}><View style={styles.formSectionHead}><View style={styles.formSectionStep}><Text style={styles.formSectionStepText}>{step}</Text></View><View style={styles.formSectionCopy}><Text style={styles.formSectionTitle}>{title}</Text><Text style={styles.formSectionSubtitle}>{subtitle}</Text></View></View><View style={styles.formSectionBody}>{children}</View></View>; }
function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, multiline, ...inputProps } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} placeholderTextColor="#686168" style={[styles.input, multiline && styles.textarea]} /></View>; }
function DateField({ label, value, onPress, onClear }: { label: string; value?: string | null; onPress: () => void; onClear: () => void }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TouchableOpacity style={styles.dateField} onPress={onPress}><View style={styles.dateFieldIcon}><CalendarDays size={19} color="#087FF5" /></View><View style={styles.dateFieldCopy}><Text style={[styles.dateFieldValue, !value && styles.dateFieldPlaceholder]}>{promotionDateDisplay(value)}</Text><Text style={styles.dateFieldHint}>Dată și oră</Text></View>{value ? <TouchableOpacity style={styles.dateClear} onPress={(event) => { event.stopPropagation(); onClear(); }}><X size={15} color="#A89FA8" /></TouchableOpacity> : <Clock3 size={17} color="#6F676F" />}</TouchableOpacity></View>; }
function Choice({ title, options, selected, onSelect }: { title: string; options: string[][]; selected: string; onSelect: (value: string) => void }) { return <View><Text style={styles.label}>{title}</Text><View style={styles.choices}>{options.map(([value, label]) => <TouchableOpacity key={value} style={[styles.choice, selected === value && styles.choiceActive]} onPress={() => onSelect(value)}><View style={[styles.radio, selected === value && styles.radioActive]}>{selected === value ? <View style={styles.radioCore} /> : null}</View><Text style={[styles.choiceText, selected === value && styles.choiceTextActive]}>{label}</Text></TouchableOpacity>)}</View></View>; }
function Toggle({ title, text, value, onChange }: { title: string; text: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={[styles.toggle, value && styles.toggleActive]}><View style={styles.toggleCopy}><Text style={styles.toggleTitle}>{title}</Text><Text style={styles.toggleText}>{text}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: Theme.colors.border.default, true: Theme.colors.brand.primaryAction }} thumbColor={Theme.colors.surface.base} ios_backgroundColor={Theme.colors.border.default} /></View>; }

const styles = StyleSheet.create({
  page: { padding: 12, gap: 11 },
  loading: { minHeight: 350, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingTitle: { color: Theme.colors.text.primary, fontSize: 15, fontWeight: '900' },
  hero: { minHeight: 142, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 28, backgroundColor: Theme.colors.surface.base, shadowColor: Theme.colors.brand.primary, shadowOpacity: .09, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  heroCompact: { minHeight: 130, padding: 16, gap: 11, borderRadius: 25 },
  heroAura: { width: 250, height: 250, position: 'absolute', right: -90, top: -150, borderRadius: 125, backgroundColor: Theme.colors.surface.brandSoft },
  heroIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft },
  heroCopy: { minWidth: 0, flex: 1 },
  kicker: { color: Theme.colors.brand.primaryText, fontSize: 8, fontWeight: '900', letterSpacing: 1.15 },
  title: { marginTop: 4, color: Theme.colors.text.primary, fontSize: 21, lineHeight: 25, fontWeight: '900', letterSpacing: -.55 },
  subtitle: { maxWidth: 620, marginTop: 5, color: Theme.colors.text.muted, fontSize: 10, lineHeight: 15 },
  add: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.brand.primaryAction, shadowColor: Theme.colors.brand.primary, shadowOpacity: .28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  metrics: { flexDirection: 'row', gap: 8 },
  metricsCompact: { flexDirection: 'row' },
  metric: { minHeight: 78, padding: 13, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 19, backgroundColor: Theme.colors.surface.base },
  metricCompactCard: { minWidth: 0, minHeight: 92, padding: 9, alignItems: 'flex-start', flexDirection: 'column', gap: 7, borderRadius: 18 },
  metricIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  metricIconCompact: { width: 34, height: 34, borderRadius: 12 },
  metricCopy: { minWidth: 0, flex: 1 },
  metricLabel: { fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  metricLabelCompact: { minHeight: 19, fontSize: 7, lineHeight: 9, letterSpacing: .45 },
  metricValue: { marginTop: 2, color: Theme.colors.text.primary, fontSize: 18, fontWeight: '900' },
  metricValueCompact: { marginTop: 1, fontSize: 16 },
  info: { minHeight: 78, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 20, backgroundColor: Theme.colors.surface.brandSoft },
  infoIcon: { width: 42, height: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Theme.colors.surface.base },
  infoCopy: { minWidth: 0, flex: 1 },
  infoKicker: { color: Theme.colors.brand.primaryText, fontSize: 7, fontWeight: '900', letterSpacing: .65 },
  infoTitle: { marginTop: 2, color: Theme.colors.text.primary, fontSize: 11, fontWeight: '900' },
  infoText: { marginTop: 2, color: Theme.colors.text.muted, fontSize: 9, lineHeight: 13 },
  percentBadge: { position: 'relative', overflow: 'hidden', flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft, shadowColor: Theme.colors.brand.primary, shadowOpacity: .28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }, percentRing: { width: '72%', height: '72%', position: 'absolute', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 999 }, percentText: { color: Theme.colors.brand.secondary, fontWeight: '900', fontStyle: 'italic' },
  list: { gap: 8 }, card: { minHeight: 92, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 19, backgroundColor: Theme.colors.surface.base }, cardCompact: { minHeight: 0, padding: 9, gap: 8, borderRadius: 16 }, cardOff: { opacity: .67 }, cardExpired: { opacity: 1, borderColor: Theme.colors.state.error, backgroundColor: Theme.colors.surface.base }, cardCopy: { minWidth: 0, flex: 1, gap: 6 }, cardTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 }, cardIdentity: { minWidth: 90, flexShrink: 1, gap: 2 }, cardTitle: { minWidth: 0, color: Theme.colors.text.primary, fontSize: 13, fontWeight: '900' }, cardCode: { color: Theme.colors.text.muted, fontSize: 7, fontWeight: '900', letterSpacing: .7 }, cardValue: { color: Theme.colors.brand.secondary, fontSize: 16, fontWeight: '900' }, cardScope: { color: Theme.colors.text.muted, fontSize: 9, fontWeight: '700' }, cardBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, statusChip: { paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden', borderRadius: 7, backgroundColor: Theme.colors.state.successSoft, color: '#0F6B45', fontSize: 7, fontWeight: '900' }, statusChipOff: { backgroundColor: Theme.colors.surface.muted, color: Theme.colors.text.secondary }, statusChipExpired: { backgroundColor: Theme.colors.state.errorSoft, color: Theme.colors.state.error }, metaChip: { paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden', borderRadius: 7, backgroundColor: Theme.colors.surface.muted, color: Theme.colors.text.secondary, fontSize: 7, fontWeight: '800' }, tag: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, overflow: 'hidden', backgroundColor: Theme.colors.surface.muted, color: '#0F6B45', fontSize: 7, fontWeight: '900' }, openStatsTag: { paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden', borderRadius: 7, backgroundColor: Theme.colors.surface.brandSoft, color: Theme.colors.brand.secondary, fontSize: 7, fontWeight: '900' }, cardActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, cardActionsCompact: { gap: 4 }, action: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Theme.colors.surface.brandSoft }, actionCompact: { width: 32, height: 32, borderRadius: 10 }, delete: { backgroundColor: Theme.colors.state.errorSoft }, openAction: { backgroundColor: Theme.colors.surface.muted },
  empty: { minHeight: 330, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 22, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 26, backgroundColor: Theme.colors.surface.base },
  emptyAura: { width: 260, height: 260, position: 'absolute', left: -150, bottom: -150, borderRadius: 130, backgroundColor: Theme.colors.surface.brandSoft },
  emptyKicker: { marginTop: 5, color: Theme.colors.brand.primaryText, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  emptyTitle: { maxWidth: 310, color: Theme.colors.text.primary, fontSize: 18, lineHeight: 23, fontWeight: '900', textAlign: 'center' },
  emptyText: { maxWidth: 310, color: Theme.colors.text.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  emptyButton: { minHeight: 46, marginTop: 6, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, backgroundColor: Theme.colors.brand.primaryAction },
  emptyButtonText: { color: Theme.colors.text.onBrand, fontSize: 11, fontWeight: '900' },
  emptySteps: { width: '100%', marginTop: 10, flexDirection: 'row', gap: 7 },
  emptyStep: { minWidth: 0, minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 14, backgroundColor: Theme.colors.surface.subtle },
  emptyStepNumber: { color: Theme.colors.brand.primaryText, fontSize: 8, fontWeight: '900' },
  emptyStepLabel: { color: Theme.colors.text.secondary, fontSize: 8, fontWeight: '800' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, backgroundColor: Theme.colors.overlay.scrim },
  sheet: { width: '100%', maxWidth: 940, maxHeight: '96%', overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 30, backgroundColor: Theme.colors.surface.subtle },
  sheetCompact: { alignSelf: 'stretch', maxHeight: '98%', borderRadius: 26 },
  sheetHead: { minHeight: 94, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: Theme.colors.border.subtle, backgroundColor: Theme.colors.surface.base },
  sheetHeadCopy: { minWidth: 0, flex: 1 },
  sheetKicker: { color: Theme.colors.brand.primaryText, fontSize: 8, fontWeight: '900', letterSpacing: 1.05 },
  sheetTitle: { marginTop: 3, color: Theme.colors.text.primary, fontSize: 19, fontWeight: '900' },
  sheetSubtitle: { marginTop: 3, color: Theme.colors.text.muted, fontSize: 9 },
  close: { width: 42, height: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 14, backgroundColor: Theme.colors.surface.muted },
  form: { padding: 12, gap: 11 },
  formSection: { gap: 13, padding: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.base },
  formSectionHead: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: Theme.colors.border.subtle },
  formSectionStep: { width: 38, height: 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft },
  formSectionStepText: { color: Theme.colors.brand.primaryText, fontSize: 9, fontWeight: '900' },
  formSectionCopy: { minWidth: 0, flex: 1 },
  formSectionTitle: { color: Theme.colors.text.primary, fontSize: 12, fontWeight: '900' },
  formSectionSubtitle: { marginTop: 3, color: Theme.colors.text.muted, fontSize: 8, lineHeight: 12 },
  formSectionBody: { gap: 12 },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { minWidth: 220, flex: 1, gap: 6 }, label: { color: Theme.colors.text.secondary, fontSize: 8, fontWeight: '900', letterSpacing: .75 }, input: { minHeight: 50, paddingHorizontal: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.subtle, color: Theme.colors.text.primary, fontSize: 12, fontWeight: '700' }, textarea: { minHeight: 84, paddingTop: 13 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 48, paddingHorizontal: 13, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.muted }, choiceActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.brandSoft }, radio: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 9 }, radioActive: { borderColor: Theme.colors.border.focus }, radioCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: Theme.colors.brand.primaryAction }, choiceText: { color: Theme.colors.text.muted, fontSize: 10, fontWeight: '800' }, choiceTextActive: { color: Theme.colors.text.primary },
  productPicker: { gap: 9 }, customerPicker: { gap: 9, padding: 11, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 18, backgroundColor: Theme.colors.surface.brandSoft }, productPickerHead: { minHeight: 42, gap: 9 }, productPickerHint: { marginTop: 3, color: Theme.colors.text.muted, fontSize: 9 }, productPickerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, selectAll: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 13, backgroundColor: Theme.colors.surface.muted }, selectAllActive: { borderColor: Theme.colors.brand.secondary, backgroundColor: Theme.colors.brand.secondary }, selectAllText: { color: Theme.colors.brand.secondary, fontSize: 9, fontWeight: '900' }, selectAllTextActive: { color: Theme.colors.text.onBrand }, selectResults: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 13, backgroundColor: Theme.colors.surface.muted }, selectResultsText: { color: Theme.colors.text.secondary, fontSize: 9, fontWeight: '900' }, selectedProducts: { gap: 7, paddingVertical: 2 }, selectedProduct: { maxWidth: 250, minHeight: 42, padding: 5, paddingRight: 9, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: Theme.colors.border.focus, borderRadius: 14, backgroundColor: Theme.colors.surface.brandSoft }, selectedCustomer: { maxWidth: 270, minHeight: 42, padding: 5, paddingRight: 9, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: Theme.colors.border.focus, borderRadius: 14, backgroundColor: Theme.colors.surface.brandSoft }, productSearch: { minHeight: 50, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.subtle }, productSearchInput: { minWidth: 0, flex: 1, color: Theme.colors.text.primary, fontSize: 12 }, productResults: { maxHeight: 310, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 16 }, productResult: { minHeight: 68, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#EAF2F8', backgroundColor: Theme.colors.surface.base }, productResultSelected: { backgroundColor: Theme.colors.surface.brandSoft }, productResultCopy: { minWidth: 0, flex: 1 }, productName: { color: Theme.colors.text.primary, fontSize: 10, lineHeight: 14, fontWeight: '800' }, productDetails: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }, productSku: { color: '#8E858E', fontSize: 8, fontWeight: '800' }, productStock: { color: '#44D995', fontSize: 8, fontWeight: '900' }, productStockOut: { color: Theme.colors.state.error }, productCheck: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 9, backgroundColor: Theme.colors.surface.muted }, productCheckActive: { borderColor: Theme.colors.brand.secondary, backgroundColor: Theme.colors.brand.secondary }, productThumb: { width: 48, height: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#F1EEEA' }, productThumbSmall: { width: 31, height: 31, borderRadius: 9 }, productThumbImage: { width: '100%', height: '100%' }, customerAvatar: { width: 48, height: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.surface.brandSoft }, customerAvatarSmall: { width: 31, height: 31, borderRadius: 10 }, customerAvatarText: { color: '#A8EAF4', fontSize: 17, fontWeight: '900' }, customerAvatarTextSmall: { fontSize: 11 },
  productPickerShortcut: { minHeight: 82, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 18, backgroundColor: Theme.colors.surface.muted }, productPickerShortcutIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft }, productPickerShortcutCopy: { minWidth: 0, flex: 1 }, productPickerShortcutKicker: { color: Theme.colors.brand.secondary, fontSize: 8, fontWeight: '900', letterSpacing: .8 }, productPickerShortcutTitle: { marginTop: 2, color: Theme.colors.text.primary, fontSize: 12, fontWeight: '900' }, productPickerShortcutText: { marginTop: 3, color: '#8E8580', fontSize: 9, lineHeight: 13 },
  productLoading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 16, backgroundColor: Theme.colors.surface.base }, productLoadingText: { maxWidth: 360, color: '#A39BA3', fontSize: 10, lineHeight: 15, fontWeight: '800', textAlign: 'center' }, productEmpty: { minHeight: 112, padding: 18, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderColor: Theme.colors.border.default, borderRadius: 16, backgroundColor: Theme.colors.surface.base }, productEmptyTitle: { color: Theme.colors.text.primary, fontSize: 11, fontWeight: '900' }, productMore: { paddingHorizontal: 8, color: '#8B838B', fontSize: 9, lineHeight: 14 },
  dateField: { minHeight: 58, padding: 7, paddingRight: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, backgroundColor: Theme.colors.surface.subtle }, dateFieldIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Theme.colors.surface.brandSoft }, dateFieldCopy: { minWidth: 0, flex: 1 }, dateFieldValue: { color: Theme.colors.text.primary, fontSize: 11, fontWeight: '900' }, dateFieldPlaceholder: { color: '#746D75' }, dateFieldHint: { marginTop: 2, color: '#6F686F', fontSize: 8, fontWeight: '700' }, dateClear: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: Theme.colors.surface.muted }, nativePicker: { padding: 12, gap: 9, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 20, backgroundColor: Theme.colors.surface.base }, nativePickerHead: { flexDirection: 'row', alignItems: 'center', gap: 10 }, nativePickerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft }, nativePickerTitle: { color: Theme.colors.text.primary, fontSize: 12, fontWeight: '900' }, nativePickerText: { marginTop: 2, color: '#887F7A', fontSize: 9 }, pickerCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.state.errorSoft },
  toggle: { minHeight: 67, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 17, backgroundColor: Theme.colors.surface.subtle }, toggleActive: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft }, toggleCopy: { minWidth: 0, flex: 1 }, toggleTitle: { color: Theme.colors.text.primary, fontSize: 11, fontWeight: '900' }, toggleText: { marginTop: 3, color: Theme.colors.text.muted, fontSize: 9, lineHeight: 13 }, save: { minHeight: 58, marginTop: 4, paddingLeft: 18, paddingRight: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, backgroundColor: Theme.colors.brand.primaryAction, shadowColor: Theme.colors.brand.primary, shadowOpacity: .24, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, saveDisabled: { opacity: .62 }, saveText: { color: Theme.colors.text.onBrand, fontSize: 12, fontWeight: '900' }, saveIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Theme.colors.brand.primary }, savePercent: { color: Theme.colors.text.onBrand, fontSize: 21, fontWeight: '900', fontStyle: 'italic' },
  statsSheet: { maxWidth: 860 }, statsContent: { padding: 16, gap: 13 }, statsHero: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.muted }, statsHeroCopy: { minWidth: 0, flex: 1 }, statsValue: { color: Theme.colors.brand.secondary, fontSize: 24, fontWeight: '900' }, statsCode: { marginTop: 2, color: '#B59D89', fontSize: 8, fontWeight: '900', letterSpacing: .8 }, statsStatusActive: { color: Theme.colors.state.success }, statsStatusOff: { color: '#9B939C' }, statsStatusExpired: { color: Theme.colors.state.error }, statsDescription: { marginTop: 6, color: '#9B9189', fontSize: 10, lineHeight: 15 }, statsFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, statsFact: { paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden', borderRadius: 10, backgroundColor: Theme.colors.surface.muted, color: Theme.colors.text.secondary, fontSize: 9, fontWeight: '800' }, statsSectionTitle: { marginTop: 3, color: '#8F878F', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, applicationList: { gap: 7 }, applicationRow: { minHeight: 64, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.base }, applicationExcluded: { opacity: .55 }, applicationIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft }, applicationCopy: { minWidth: 0, flex: 1 }, applicationTitle: { color: Theme.colors.text.primary, fontSize: 10, fontWeight: '900' }, applicationMeta: { marginTop: 3, color: '#7C747D', fontSize: 8 }, applicationAmount: { alignItems: 'flex-end', gap: 2 }, applicationDiscount: { color: Theme.colors.brand.secondary, fontSize: 10, fontWeight: '900' }, applicationTotal: { color: '#807880', fontSize: 8 }, statsEdit: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: Theme.colors.brand.primaryAction },
});
