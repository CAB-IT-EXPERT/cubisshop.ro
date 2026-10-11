import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAndroidSearchBack from '@/hooks/useAndroidSearchBack';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, BadgeCheck, Ban, BellRing, Check, ChevronRight, CircleCheckBig, Clock3, CreditCard, Eye, FileCheck2, HandCoins, Mail, PackageCheck, PackageOpen, Pencil, Phone, Plus, RefreshCw, RotateCcw, Save, Search, Send, ShoppingCart, SlidersHorizontal, Star, Trash2, TrendingUp, Truck, WalletCards, Warehouse, X } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, shopOrderCustomerDisplayName, ShopOrder, ShopOrderPage, ShopProduct, ShopProductStats } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';
import { runWhenIdle } from '@/utils/runWhenIdle';

const orderStatuses = [
  { value: 'new', label: 'În procesare (Nouă)', shortLabel: 'Nouă', description: 'Comanda a fost primită și a intrat în procesare.', color: Theme.colors.brand.primaryText, icon: Clock3 },
  { value: 'confirmed', label: 'Confirmată', description: 'Comanda și plata au fost confirmate.', color: Theme.colors.state.successBright, icon: BadgeCheck },
  { value: 'processing', label: 'În pregătire', description: 'Produsele sunt pregătite pentru expediere.', color: Theme.colors.brand.secondary, icon: PackageOpen },
  { value: 'shipped', label: 'Predată curierului', description: 'Pachetul a plecat către client.', color: Theme.colors.brand.primaryText, icon: Truck },
  { value: 'completed', label: 'Livrată', description: 'Comanda a ajuns la destinație.', color: Theme.colors.state.successBright, icon: CircleCheckBig },
  { value: 'return_requested', label: 'Retur solicitat', description: 'Cererea de retur a fost înregistrată intern și așteaptă verificarea.', color: Theme.colors.data.returns, icon: RotateCcw },
  { value: 'return_refused', label: 'Retur refuzat', description: 'Solicitarea a fost verificată și refuzată. Acest pas poate fi sărit.', color: Theme.colors.state.error, icon: Ban },
  { value: 'return_confirmed', label: 'Retur confirmat', description: 'Returul a fost aprobat intern și poate continua către rambursare.', color: Theme.colors.brand.cyanStrong, icon: PackageCheck },
  { value: 'refunded', label: 'Rambursată', description: 'Comanda a fost returnată și rambursată.', color: Theme.colors.state.warningBright, icon: RotateCcw },
  { value: 'cancelled', label: 'Comandă anulată', description: 'Comanda nu mai este procesată.', color: Theme.colors.state.error, icon: Ban },
] satisfies { value: ShopOrder['status']; label: string; shortLabel?: string; description: string; color: string; icon: typeof Clock3 }[];

const paymentStatuses: { value: ShopOrder['payment_status']; label: string }[] = [
  { value: 'pending', label: 'In asteptare' },
  { value: 'paid', label: 'Platita' },
  { value: 'failed', label: 'Esuata' },
  { value: 'refunded', label: 'Rambursata' },
];

function money(value: number) {
  return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2 }).format(value) + ' lei';
}

function parseShopDate(value: string) {
  const raw = String(value || '').trim();
  const mysqlDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (mysqlDate) {
    return new Date(
      Number(mysqlDate[1]),
      Number(mysqlDate[2]) - 1,
      Number(mysqlDate[3]),
      Number(mysqlDate[4]),
      Number(mysqlDate[5]),
      Number(mysqlDate[6] || 0),
    );
  }
  return new Date(raw);
}

function dateTime(value: string) {
  const date = parseShopDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} · ${time}`;
}

function isCompanyOrder(order: ShopOrder) {
  return order.customer_type === 'company' || Boolean(String(order.company_name || order.company_cui || order.company_registration_number || '').trim());
}

const mainOrderFlow: ShopOrder['status'][] = ['new', 'confirmed', 'processing', 'shipped', 'completed', 'return_requested', 'return_refused', 'return_confirmed'];
const terminalOrderStatuses: ShopOrder['status'][] = ['refunded', 'cancelled'];

function canChangeOrderStatus(currentStatus: ShopOrder['status'], targetStatus: ShopOrder['status']) {
  if (currentStatus === targetStatus) return true;
  if (terminalOrderStatuses.includes(currentStatus)) return false;
  if (targetStatus === 'cancelled') return true;

  const flow: ShopOrder['status'][] = [...mainOrderFlow, 'refunded'];
  const currentIndex = flow.indexOf(currentStatus);
  const targetIndex = flow.indexOf(targetStatus);
  if (currentIndex < 0 || targetIndex < 0) return false;
  if (targetIndex > currentIndex) return true;

  const editableReturnStatuses: ShopOrder['status'][] = ['return_requested', 'return_refused'];
  return editableReturnStatuses.includes(currentStatus) && editableReturnStatuses.includes(targetStatus);
}

type OrderStatusFilter = 'all' | 'returned' | ShopOrder['status'];
type ReturnDecision = { order_item_id: string; product_name: string; product_sku?: string | null; requested_quantity: number; decision_status: 'pending' | 'accepted' | 'partial' | 'refused'; accepted_quantity: number; decision_reason: string };
type OrderItemDraft = { order_item_id: string; product_id: string; product_name: string; product_sku: string; image_url: string; unit_of_measure: string; quantity: number; unit_price: string; is_new?: boolean };
type OrderProductDraft = { mode: 'replace' | 'add'; order_item_id: string; product: ShopProduct; unit_price: string; quantity: string };
const ADD_ITEM_PICKER_TARGET = '__add_order_item__';

function returnDecisionWithAccepted(item: ReturnDecision, acceptedQuantity: number): ReturnDecision {
  const accepted = Math.max(0, Math.min(item.requested_quantity, acceptedQuantity));
  const refused = Math.max(0, item.requested_quantity - accepted);
  return {
    ...item,
    accepted_quantity: accepted,
    decision_status: accepted <= 0 ? 'refused' : refused <= 0 ? 'accepted' : 'partial',
    decision_reason: refused <= 0 ? '' : item.decision_reason,
  };
}
const emptyOrderSummary = {
  orders_count: 0,
  new_count: 0,
  processing_count: 0,
  returns_count: 0,
  returns_total: 0,
  collected: 0,
  pending_cash: 0,
  financial_total: 0,
};

type OrdersListRequest = {
  page: number;
  page_size: number;
  q?: string;
  status?: string;
  payment_method?: string;
  payment_status?: string;
};
type OrdersSnapshot = { result: ShopOrderPage; cachedAt: number };
const ORDERS_SNAPSHOT_TTL_MS = 20_000;
const ORDERS_SNAPSHOT_TOKEN_LIMIT = 2;
const ORDERS_SNAPSHOT_QUERY_LIMIT = 4;
const ordersSnapshots = new Map<string, Map<string, OrdersSnapshot>>();

function ordersSnapshotKey(request: OrdersListRequest) {
  return JSON.stringify([
    request.page,
    request.page_size,
    request.q || '',
    request.status || '',
    request.payment_method || '',
    request.payment_status || '',
  ]);
}

function readOrdersSnapshot(token: string, request: OrdersListRequest) {
  if (!token) return undefined;
  const tokenCache = ordersSnapshots.get(token);
  const key = ordersSnapshotKey(request);
  const snapshot = tokenCache?.get(key);
  if (!tokenCache || !snapshot) return undefined;
  tokenCache.delete(key);
  tokenCache.set(key, snapshot);
  ordersSnapshots.delete(token);
  ordersSnapshots.set(token, tokenCache);
  return snapshot;
}

function rememberOrdersSnapshot(token: string, request: OrdersListRequest, result: ShopOrderPage) {
  if (!token) return;
  let tokenCache = ordersSnapshots.get(token);
  if (!tokenCache) tokenCache = new Map();
  const key = ordersSnapshotKey(request);
  tokenCache.delete(key);
  while (tokenCache.size >= ORDERS_SNAPSHOT_QUERY_LIMIT) {
    const oldest = tokenCache.keys().next().value;
    if (!oldest) break;
    tokenCache.delete(oldest);
  }
  tokenCache.set(key, { result, cachedAt: Date.now() });
  ordersSnapshots.delete(token);
  while (ordersSnapshots.size >= ORDERS_SNAPSHOT_TOKEN_LIMIT) {
    const oldestToken = ordersSnapshots.keys().next().value;
    if (!oldestToken) break;
    ordersSnapshots.delete(oldestToken);
  }
  ordersSnapshots.set(token, tokenCache);
}

function clearOrdersSnapshots(token: string) {
  if (token) ordersSnapshots.delete(token);
}

function whatsappPhone(value: string) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = `40${digits.slice(1)}`;
  if (digits.length === 9) digits = `40${digits}`;
  return digits;
}

async function callCustomer(phone: string) {
  const target = String(phone || '').replace(/[^\d+]/g, '');
  if (!target) return Alert.alert('Apelare', 'Comanda nu are un număr de telefon valid.');
  try { await Linking.openURL(`tel:${target}`); }
  catch { Alert.alert('Apelare', 'Apelul nu a putut fi inițiat pe acest dispozitiv.'); }
}

async function openCustomerWhatsApp(phone: string) {
  const target = whatsappPhone(phone);
  if (!target) return Alert.alert('WhatsApp', 'Comanda nu are un număr de telefon valid.');
  const appUrl = `whatsapp://send?phone=${target}`;
  const webUrl = `https://wa.me/${target}`;
  try { await Linking.openURL((await Linking.canOpenURL(appUrl)) ? appUrl : webUrl); }
  catch { Alert.alert('WhatsApp', 'Conversația nu a putut fi deschisă.'); }
}

function WhatsAppLogo({ size = 17, color = '#51D88A' }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden><Path fill={color} d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.895 6.99c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.14 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></Svg>;
}

export default function ShopOrdersManager({ initialStatusFilter = 'all', initialOrderId = null, onInitialOrderHandled, onOpenInvoice }: { initialStatusFilter?: 'all' | ShopOrder['status']; initialOrderId?: string | null; onInitialOrderHandled?: () => void; onOpenInvoice?: (invoiceId: string) => void }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const initialRequest = useMemo<OrdersListRequest>(() => ({
    page: 1,
    page_size: 10,
    status: initialStatusFilter === 'all' ? undefined : initialStatusFilter,
  }), [initialStatusFilter]);
  const initialSnapshot = useMemo(() => readOrdersSnapshot(token || '', initialRequest), [initialRequest, token]);
  const [orders, setOrders] = useState<ShopOrder[]>(() => initialSnapshot?.result.orders || []);
  const [ordersTotal, setOrdersTotal] = useState(() => initialSnapshot?.result.total || 0);
  const [orderSummary, setOrderSummary] = useState(() => initialSnapshot?.result.summary || emptyOrderSummary);
  const [query, setQuery] = useState('');
  useAndroidSearchBack(query, useCallback(() => setQuery(''), []));
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>(initialStatusFilter);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'card' | 'cash'>('all');
  const [paymentStateFilter, setPaymentStateFilter] = useState<'all' | ShopOrder['payment_status']>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [loadedOnce, setLoadedOnce] = useState(() => Boolean(initialSnapshot));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ShopOrder | null>(null);
  const [status, setStatus] = useState<ShopOrder['status']>('new');
  const [paymentStatus, setPaymentStatus] = useState<ShopOrder['payment_status']>('pending');
  const [adminNotes, setAdminNotes] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnBankIban, setReturnBankIban] = useState('');
  const [returnAccountHolder, setReturnAccountHolder] = useState('');
  const [returnDecisions, setReturnDecisions] = useState<ReturnDecision[]>([]);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [statusEmailBusy, setStatusEmailBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErrorMessage, setDetailErrorMessage] = useState('');
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null);
  const [invoicePromptOrder, setInvoicePromptOrder] = useState<ShopOrder | null>(null);
  const [invoiceSendEmail, setInvoiceSendEmail] = useState(false);
  const [invoiceSendReturnEmail, setInvoiceSendReturnEmail] = useState(false);
  const [customerEditing, setCustomerEditing] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryEditing, setDeliveryEditing] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryCounty, setDeliveryCounty] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [shippingCostDraft, setShippingCostDraft] = useState('0.00');
  const [returnShippingPayer, setReturnShippingPayer] = useState<'customer' | 'company' | null>(null);
  const [returnShippingCostDraft, setReturnShippingCostDraft] = useState('0.00');
  const [orderItemDrafts, setOrderItemDrafts] = useState<OrderItemDraft[]>([]);
  const [itemPickerTarget, setItemPickerTarget] = useState<string | null>(null);
  const [itemProductSearch, setItemProductSearch] = useState('');
  const [itemProductOptions, setItemProductOptions] = useState<ShopProduct[]>([]);
  const [itemProductLoading, setItemProductLoading] = useState(false);
  const [replacementPriceDraft, setReplacementPriceDraft] = useState<OrderProductDraft | null>(null);
  const [replacementTransportPrompt, setReplacementTransportPrompt] = useState(false);
  const [replacementTransportConfirmed, setReplacementTransportConfirmed] = useState(false);
  const [productPanelId, setProductPanelId] = useState<string | null>(null);
  const [productPanel, setProductPanel] = useState<ShopProductStats | null>(null);
  const [productPanelLoading, setProductPanelLoading] = useState(false);
  const [productPanelError, setProductPanelError] = useState('');
  const [productPanelProgress] = useState(() => new Animated.Value(0));
  const productRequestId = useRef(0);
  const ordersRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const initialOpenedOrderId = useRef<string | null>(null);
  const initialLoadEffect = useRef(true);
  const itemProductRequestId = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 240);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!token || !itemPickerTarget) return;
    const requestId = ++itemProductRequestId.current;
    const timeout = setTimeout(async () => {
      setItemProductLoading(true);
      try {
        const result = await shopApi.listProductOptions(token, { q: itemProductSearch.trim(), limit: 50 });
        if (requestId === itemProductRequestId.current) setItemProductOptions(result);
      } catch {
        if (requestId === itemProductRequestId.current) setItemProductOptions([]);
      } finally {
        if (requestId === itemProductRequestId.current) setItemProductLoading(false);
      }
    }, itemProductSearch.trim() ? 220 : 0);
    return () => clearTimeout(timeout);
  }, [itemPickerTarget, itemProductSearch, token]);

  const load = useCallback(async (options: { showLoading?: boolean; silent?: boolean } = {}) => {
    if (!token) return;
    const requestId = ++ordersRequestId.current;
    const showLoading = options.showLoading ?? true;
    if (showLoading) setLoading(true);
    if (!options.silent) setError('');
    try {
      const request: OrdersListRequest = {
        page,
        page_size: pageSize,
        q: debouncedQuery || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        payment_method: paymentMethodFilter === 'all' ? undefined : paymentMethodFilter,
        payment_status: paymentStateFilter === 'all' ? undefined : paymentStateFilter,
      };
      const result = await shopApi.listOrders(token, request);
      if (requestId !== ordersRequestId.current) return;
      rememberOrdersSnapshot(token, request, result);
      setOrders(Array.isArray(result.orders) ? result.orders : []);
      setOrdersTotal(Number(result.total || 0));
      setOrderSummary(result.summary || emptyOrderSummary);
      setError('');
      if (Number(result.page || 1) !== page) setPage(Number(result.page || 1));
    }
    catch (loadError) {
      if (requestId === ordersRequestId.current && !options.silent) setError(loadError instanceof Error ? loadError.message : 'Comenzile nu au putut fi incarcate.');
    }
    finally {
      if (requestId === ordersRequestId.current) {
        setLoading(false);
        setLoadedOnce(true);
      }
    }
  }, [debouncedQuery, page, pageSize, paymentMethodFilter, paymentStateFilter, statusFilter, token]);

   
  useEffect(() => {
    const firstRun = initialLoadEffect.current;
    initialLoadEffect.current = false;
    if (!firstRun || !initialSnapshot) {
      void load();
      return;
    }
    if (Date.now() - initialSnapshot.cachedAt <= ORDERS_SNAPSHOT_TTL_MS) return;
    let interactionTask: ReturnType<typeof runWhenIdle> | null = null;
    const frame = requestAnimationFrame(() => {
      interactionTask = runWhenIdle(() => {
        void load({ showLoading: false, silent: true });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      interactionTask?.cancel();
    };
  }, [initialSnapshot, load]);

  const activeFilterCount = Number(statusFilter !== 'all') + Number(paymentMethodFilter !== 'all') + Number(paymentStateFilter !== 'all');
  const hasActiveSearch = Boolean(query.trim()) || activeFilterCount > 0;
  const resetFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setPaymentMethodFilter('all');
    setPaymentStateFilter('all');
    setPage(1);
  };
  const pagedOrders = orders;

  const applyOrderToEditor = useCallback((order: ShopOrder) => {
    setSelected(order);
    setStatus(order.status);
    setPaymentStatus(order.payment_status);
    setAdminNotes(order.admin_notes || '');
    setCancellationReason(order.customer_cancellation_reason || '');
    setReturnReason(order.return_reason || '');
    setReturnBankIban(order.return_bank_iban || '');
    setReturnAccountHolder(order.return_bank_account_holder || '');
    setReturnDecisions((order.return_items?.length ? order.return_items.map((item) => ({ order_item_id: item.order_item_id, product_name: item.product_name, product_sku: item.product_sku, requested_quantity: Number(item.requested_quantity), decision_status: item.decision_status, accepted_quantity: Number(item.accepted_quantity ?? item.requested_quantity), decision_reason: item.decision_reason || '' })) : order.items.map((item) => ({ order_item_id: item.id, product_name: item.product_name, product_sku: item.product_sku, requested_quantity: Number(item.quantity), decision_status: 'pending' as const, accepted_quantity: Number(item.quantity), decision_reason: '' }))));
    setNotifyCustomer(false);
    setCustomerEditing(false);
    setCustomerName(String(order.customer_name || '').toLocaleUpperCase('ro-RO'));
    setCustomerPhone(order.customer_phone || '');
    setCustomerEmail(order.customer_email || '');
    setDeliveryEditing(false);
    setDeliveryAddress(order.address || '');
    setDeliveryCity(order.city || '');
    setDeliveryCounty(order.county || '');
    setDeliveryPostalCode(order.postal_code || '');
    setShippingCostDraft(Number(order.shipping_cost || 0).toFixed(2));
    setReturnShippingPayer(order.return_shipping_payer || null);
    setReturnShippingCostDraft(Number(order.return_shipping_cost ?? order.configured_return_shipping_cost ?? order.shipping_cost ?? 0).toFixed(2));
    setReplacementPriceDraft(null);
    setReplacementTransportPrompt(false);
    setReplacementTransportConfirmed(false);
    setOrderItemDrafts((order.items || []).map((item) => ({
      order_item_id: item.id,
      product_id: item.product_id || '',
      product_name: item.product_name,
      product_sku: item.product_sku || '',
      image_url: item.image_url || '',
      unit_of_measure: item.unit_of_measure || 'buc',
      quantity: Number(item.quantity || 0),
      unit_price: String(Number(item.discount_total || 0) > 0 ? Number(item.discounted_unit_price ?? item.unit_price) : Number(item.unit_price)),
    })));
  }, []);

  const openOrder = useCallback(async (orderId: string, preview?: ShopOrder) => {
    const requestId = ++detailRequestId.current;
    if (preview) applyOrderToEditor(preview);
    if (!token) return;
    setDetailErrorMessage('');
    setDetailLoading(true);
    try {
      const detailed = await shopApi.getOrder(token, orderId);
      if (requestId !== detailRequestId.current) return;
      applyOrderToEditor(detailed);
    } catch (detailError) {
      if (requestId !== detailRequestId.current) return;
      const message = detailError instanceof Error ? detailError.message : 'Încearcă din nou.';
      setDetailErrorMessage(message);
      if (!preview) Alert.alert('Detaliile nu s-au putut actualiza', message);
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }, [applyOrderToEditor, token]);

  const open = useCallback((order: ShopOrder) => {
    void openOrder(order.id, order);
  }, [openOrder]);

  const closeOrder = useCallback(() => {
    detailRequestId.current += 1;
    setDetailLoading(false);
    setDetailErrorMessage('');
    setSelected(null);
    setAdminNotes('');
    setCancellationReason('');
    setReturnReason('');
    setReturnBankIban('');
    setReturnAccountHolder('');
    setReturnDecisions([]);
    setCustomerEditing(false);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setDeliveryAddress('');
    setDeliveryCity('');
    setDeliveryCounty('');
    setDeliveryPostalCode('');
    setShippingCostDraft('0.00');
    setOrderItemDrafts([]);
    setItemPickerTarget(null);
    setItemProductSearch('');
    setItemProductOptions([]);
    setReplacementPriceDraft(null);
    setReplacementTransportPrompt(false);
    setReplacementTransportConfirmed(false);
  }, []);

  const openItemProductPicker = useCallback((orderItemId: string) => {
    setItemProductSearch('');
    setItemProductOptions([]);
    setItemPickerTarget(orderItemId);
  }, []);

  const openAddProductPicker = useCallback(() => {
    setItemProductSearch('');
    setItemProductOptions([]);
    setItemPickerTarget(ADD_ITEM_PICKER_TARGET);
  }, []);

  const selectOrderItemProduct = useCallback((product: ShopProduct) => {
    if (!itemPickerTarget) return;
    const sitePrice = Number(product.sale_price && product.sale_price > 0 ? product.sale_price : product.price);
    setReplacementPriceDraft({ mode: itemPickerTarget === ADD_ITEM_PICKER_TARGET ? 'add' : 'replace', order_item_id: itemPickerTarget, product, unit_price: sitePrice > 0 ? sitePrice.toFixed(2) : '0.00', quantity: '1' });
    setItemPickerTarget(null);
    setItemProductSearch('');
  }, [itemPickerTarget]);

  const confirmReplacementPrice = useCallback(() => {
    if (!replacementPriceDraft) return;
    const quantity = Number(replacementPriceDraft.quantity.replace(',', '.'));
    if (replacementPriceDraft.mode === 'add' && (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)) {
      Alert.alert('Cantitate invalidă', 'Introdu o cantitate între 1 și 99.');
      return;
    }
    if (replacementPriceDraft.mode === 'add' && orderItemDrafts.some((item) => item.product_id === replacementPriceDraft.product.id)) {
      Alert.alert('Produs deja existent', 'Produsul selectat există deja în comandă. Alege un alt produs.');
      return;
    }
    const original = selected?.items.find((item) => item.id === replacementPriceDraft.order_item_id);
    if (original && replacementPriceDraft.product.id === String(original.product_id || '')) {
      Alert.alert('Alege alt produs', 'Înlocuirea trebuie făcută cu un produs diferit de cel existent în comandă.');
      return;
    }
    const salePrice = Number(replacementPriceDraft.unit_price.replace(',', '.'));
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      Alert.alert('Preț invalid', 'Introdu un preț de vânzare mai mare decât zero.');
      return;
    }
    if (replacementPriceDraft.mode === 'add') {
      setOrderItemDrafts((current) => [...current, {
        order_item_id: `new-${replacementPriceDraft.product.id}-${Date.now()}`,
        product_id: replacementPriceDraft.product.id,
        product_name: replacementPriceDraft.product.name,
        product_sku: replacementPriceDraft.product.sku || replacementPriceDraft.product.supplier_product_code || '',
        image_url: replacementPriceDraft.product.images?.[0]?.url || '',
        unit_of_measure: replacementPriceDraft.product.unit_of_measure || 'buc',
        quantity,
        unit_price: salePrice.toFixed(2),
        is_new: true,
      }]);
      setReplacementPriceDraft(null);
      return;
    }
    setOrderItemDrafts((current) => {
      const next = current.map((item) => item.order_item_id === replacementPriceDraft.order_item_id ? {
        ...item,
        product_id: replacementPriceDraft.product.id,
        product_name: replacementPriceDraft.product.name,
        product_sku: replacementPriceDraft.product.sku || replacementPriceDraft.product.supplier_product_code || '',
        image_url: replacementPriceDraft.product.images?.[0]?.url || '',
        unit_of_measure: replacementPriceDraft.product.unit_of_measure || 'buc',
        unit_price: salePrice.toFixed(2),
      } : item);
      const stillReplacing = Boolean(selected && next.some((draft) => draft.product_id !== String(selected.items.find((item) => item.id === draft.order_item_id)?.product_id || '')));
      if (!stillReplacing && selected) setShippingCostDraft(Number(selected.shipping_cost || 0).toFixed(2));
      return next;
    });
    setReplacementPriceDraft(null);
    if (selected?.status === 'completed' && selected.invoice) {
      setShippingCostDraft(Number(selected.shipping_cost || 0).toFixed(2));
      setReturnShippingPayer(null);
      setReturnShippingCostDraft(Number(selected.return_shipping_cost ?? selected.configured_return_shipping_cost ?? selected.shipping_cost ?? 0).toFixed(2));
      setReplacementTransportConfirmed(false);
      setReplacementTransportPrompt(true);
    }
  }, [orderItemDrafts, replacementPriceDraft, selected]);

  const confirmReplacementTransport = useCallback(() => {
    const invoiceShipping = Number(shippingCostDraft.replace(',', '.'));
    const returnShipping = Number(returnShippingCostDraft.replace(',', '.'));
    if (!Number.isFinite(invoiceShipping) || invoiceShipping < 0) {
      Alert.alert('Transport invalid', 'Introdu costul transportului pentru factura nouă.');
      return;
    }
    if (!returnShippingPayer) {
      Alert.alert('Alege cine suportă returul', 'Selectează Clientul sau Firma.');
      return;
    }
    if (returnShippingPayer === 'customer' && (!Number.isFinite(returnShipping) || returnShipping < 0)) {
      Alert.alert('Cost retur invalid', 'Introdu valoarea transportului de retur suportat de client.');
      return;
    }
    setReplacementTransportConfirmed(true);
    setReplacementTransportPrompt(false);
  }, [returnShippingCostDraft, returnShippingPayer, shippingCostDraft]);

  const openProductPanel = useCallback(async (productId: string) => {
    if (!token || !productId) return;
    const requestId = ++productRequestId.current;
    setProductPanelId(productId);
    setProductPanel(null);
    setProductPanelError('');
    setProductPanelLoading(true);
    productPanelProgress.setValue(0);
    Animated.timing(productPanelProgress, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    try {
      const nextProduct = await shopApi.getProductStats(token, productId);
      if (requestId === productRequestId.current) setProductPanel(nextProduct);
    } catch (productError) {
      if (requestId === productRequestId.current) setProductPanelError(productError instanceof Error ? productError.message : 'Fișa produsului nu a putut fi încărcată.');
    } finally {
      if (requestId === productRequestId.current) setProductPanelLoading(false);
    }
  }, [productPanelProgress, token]);

  const closeProductPanel = useCallback(() => {
    productRequestId.current += 1;
    Animated.timing(productPanelProgress, { toValue: 0, duration: 230, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setProductPanelId(null);
      setProductPanel(null);
      setProductPanelError('');
      setProductPanelLoading(false);
    });
  }, [productPanelProgress]);

  useEffect(() => {
    if (!initialOrderId || loading || initialOpenedOrderId.current === initialOrderId) return;
    const order = orders.find((item) => item.id === initialOrderId);
    initialOpenedOrderId.current = initialOrderId;
    onInitialOrderHandled?.();
    void openOrder(initialOrderId, order);
  }, [initialOrderId, loading, onInitialOrderHandled, openOrder, orders]);

  const save = async () => {
    if (!token || !selected || saving) return;
    const normalizedReturnIban = returnBankIban.trim().toUpperCase().replace(/\s+/g, '');
    const normalizedSavedReturnIban = String(selected.return_bank_iban || '').trim().toUpperCase().replace(/\s+/g, '');
    const changedOrderItems = orderItemDrafts.filter((draft) => {
      if (draft.is_new) return false;
      const original = selected.items.find((item) => item.id === draft.order_item_id);
      if (!original) return false;
      return draft.product_id !== String(original.product_id || '');
    });
    const addedOrderItems = orderItemDrafts.filter((draft) => draft.is_new);
    const removedOrderItemIds = selected.items
      .filter((item) => !orderItemDrafts.some((draft) => !draft.is_new && draft.order_item_id === item.id))
      .map((item) => item.id);
    const parsedShippingCost = Number(shippingCostDraft.replace(',', '.'));
    const parsedReturnShippingCost = Number(returnShippingCostDraft.replace(',', '.'));
    const itemsChanged = changedOrderItems.length > 0 || addedOrderItems.length > 0 || removedOrderItemIds.length > 0;
    const canEditOrderIdentity = !selected.invoice;
    const canEditCustomer = canEditOrderIdentity;
    const isDeliveredReplacement = selected.status === 'completed' && Boolean(selected.invoice) && changedOrderItems.length > 0;
    const needsReturnShippingChoice = (status === 'return_confirmed' || status === 'refunded') && !(['return_confirmed', 'refunded'] as ShopOrder['status'][]).includes(selected.status);
    const hasChanges = status !== selected.status
      || paymentStatus !== selected.payment_status
      || adminNotes.trim() !== String(selected.admin_notes || '').trim()
      || (canEditCustomer && customerName.trim().toLocaleUpperCase('ro-RO') !== String(selected.customer_name || '').trim())
      || (canEditCustomer && customerPhone.trim() !== String(selected.customer_phone || '').trim())
      || (canEditCustomer && customerEmail.trim().toLocaleLowerCase('ro-RO') !== String(selected.customer_email || '').trim().toLocaleLowerCase('ro-RO'))
      || (canEditOrderIdentity && deliveryAddress.trim() !== String(selected.address || '').trim())
      || (canEditOrderIdentity && deliveryCity.trim() !== String(selected.city || '').trim())
      || (canEditOrderIdentity && deliveryCounty.trim() !== String(selected.county || '').trim())
      || (canEditOrderIdentity && deliveryPostalCode.trim() !== String(selected.postal_code || '').trim())
      || returnReason.trim() !== String(selected.return_reason || '').trim()
      || returnAccountHolder.trim() !== String(selected.return_bank_account_holder || '').trim()
      || normalizedReturnIban !== normalizedSavedReturnIban
      || itemsChanged
      || ((isDeliveredReplacement || needsReturnShippingChoice) && returnShippingPayer !== selected.return_shipping_payer)
      || ((['return_requested', 'return_refused', 'return_confirmed', 'refunded'] as ShopOrder['status'][]).includes(status) && JSON.stringify(returnDecisions) !== JSON.stringify((selected.return_items || []).map((item) => ({ order_item_id: item.order_item_id, product_name: item.product_name, product_sku: item.product_sku, requested_quantity: Number(item.requested_quantity), decision_status: item.decision_status, accepted_quantity: Number(item.accepted_quantity ?? item.requested_quantity), decision_reason: item.decision_reason || '' }))));
    if (!hasChanges) {
      Alert.alert('Nicio modificare', 'Comanda este deja salvată. Nu a fost trimis niciun e-mail.');
      return;
    }
    if (!deliveryAddress.trim() || !deliveryCity.trim() || !deliveryCounty.trim()) {
      Alert.alert('Date de livrare incomplete', 'Adresa, localitatea și județul sunt obligatorii.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      Alert.alert('Date client incomplete', 'Numele și numărul de telefon sunt obligatorii.');
      return;
    }
    if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      Alert.alert('E-mail invalid', 'Introdu o adresă de e-mail validă sau lasă câmpul gol.');
      return;
    }
    if (!Number.isFinite(parsedShippingCost) || parsedShippingCost < 0) {
      Alert.alert('Cost transport invalid', 'Introdu un cost de transport egal sau mai mare decât zero.');
      return;
    }
    if (isDeliveredReplacement && !replacementTransportConfirmed) {
      Alert.alert('Completează transportul', 'Confirmă separat transportul facturii noi și transportul de retur.');
      setReplacementTransportPrompt(true);
      return;
    }
    if ((isDeliveredReplacement || needsReturnShippingChoice) && !returnShippingPayer) {
      Alert.alert('Alege cine suportă transportul', 'Selectează Clientul sau Firma înainte de salvare.');
      return;
    }
    if ((isDeliveredReplacement || needsReturnShippingChoice) && returnShippingPayer === 'customer' && (!Number.isFinite(parsedReturnShippingCost) || parsedReturnShippingCost < 0)) {
      Alert.alert('Cost retur invalid', 'Introdu valoarea transportului de retur suportat de client.');
      return;
    }
    if (changedOrderItems.some((item) => !item.product_id || !Number.isFinite(Number(item.unit_price.replace(',', '.'))) || Number(item.unit_price.replace(',', '.')) <= 0)) {
      Alert.alert('Produs sau preț invalid', 'Alege produsul și introdu prețul final de vânzare pentru fiecare poziție modificată.');
      return;
    }
    if (addedOrderItems.some((item) => !item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || !Number.isFinite(Number(item.unit_price.replace(',', '.'))) || Number(item.unit_price.replace(',', '.')) <= 0)) {
      Alert.alert('Produs, cantitate sau preț invalid', 'Verifică produsele adăugate. Cantitatea trebuie să fie între 1 și 99, iar prețul unitar mai mare decât zero.');
      return;
    }
    if (status === 'cancelled' && selected.status !== 'cancelled') {
      if (cancellationReason.trim().length < 3) {
        Alert.alert('Motiv obligatoriu', 'Scrie motivul anulării, de cel puțin 3 caractere.');
        return;
      }
      const proceed = await new Promise<boolean>((resolve) => Alert.alert('Anulezi comanda?', 'Anularea se salvează imediat, clientul este notificat automat, iar factura și stocul sunt corectate după regulile fiscale.', [{ text: 'Renunță', style: 'cancel', onPress: () => resolve(false) }, { text: 'Anulează comanda', style: 'destructive', onPress: () => resolve(true) }]));
      if (!proceed) return;
    }
    const isNewReturnFlow = (['return_requested', 'return_refused', 'return_confirmed', 'refunded'] as ShopOrder['status'][]).includes(status)
      && !selected.return_reason;
    if (isNewReturnFlow) {
      if (returnReason.trim().length < 3 || returnAccountHolder.trim().length < 3 || !returnBankIban.trim()) {
        Alert.alert('Date de retur incomplete', 'Completează motivul, titularul contului și IBAN-ul pentru rambursare.');
        return;
      }
    }
    if (status === 'return_confirmed' || status === 'refunded') {
      if (!returnDecisions.length || returnDecisions.some((item) => item.decision_status === 'pending')) {
        Alert.alert('Evaluează toate produsele', 'Acceptă sau refuză fiecare produs înainte de confirmarea returului.');
        return;
      }
      if (!returnDecisions.some((item) => item.accepted_quantity > 0)) {
        Alert.alert('Niciun produs acceptat', 'Pentru a confirma returul trebuie acceptat cel puțin un produs. Altfel folosește Retur refuzat.');
        return;
      }
      if (returnDecisions.some((item) => item.requested_quantity - item.accepted_quantity > 0 && item.decision_reason.trim().length < 3)) {
        Alert.alert('Motivează cantitatea refuzată', 'Pentru fiecare produs refuzat integral sau parțial, scrie motivul care va fi explicat clientului în e-mail.');
        return;
      }
    }
    if (status === 'return_refused' && (returnDecisions.some((item) => item.accepted_quantity > 0) || returnDecisions.some((item) => item.decision_reason.trim().length < 3))) {
      Alert.alert('Completează refuzul', 'Pentru Retur refuzat, marchează Refuză și scrie motivul pentru fiecare produs. Dacă accepți un produs, folosește Retur confirmat.');
      return;
    }
    setSaving(true);
    ordersRequestId.current += 1;
    try {
      const returnTarget = (['return_requested', 'return_refused', 'return_confirmed', 'refunded'] as ShopOrder['status'][]).includes(status);
      const shippingChoiceRequired = isDeliveredReplacement || needsReturnShippingChoice;
      const updated = await shopApi.updateOrder(token, selected.id, { status, payment_status: paymentStatus, admin_notes: adminNotes.trim(), notify_customer: status !== selected.status && (status === 'cancelled' ? true : notifyCustomer), cancellation_reason: status === 'cancelled' ? cancellationReason.trim() : undefined, return_reason: returnTarget ? returnReason.trim() : undefined, return_bank_iban: returnTarget ? normalizedReturnIban : undefined, return_bank_account_holder: returnTarget ? returnAccountHolder.trim() : undefined, return_shipping_payer: shippingChoiceRequired ? returnShippingPayer! : undefined, return_shipping_cost: shippingChoiceRequired ? (returnShippingPayer === 'customer' ? parsedReturnShippingCost : 0) : undefined, return_items: returnTarget ? returnDecisions.map((item) => ({ order_item_id: item.order_item_id, quantity: item.requested_quantity, decision_status: item.decision_status === 'pending' ? undefined : item.decision_status, accepted_quantity: item.decision_status === 'pending' ? 0 : item.accepted_quantity, refused_quantity: item.decision_status === 'pending' ? 0 : Math.max(0, item.requested_quantity - item.accepted_quantity), decision_reason: item.decision_reason })) : undefined, items: changedOrderItems.length ? changedOrderItems.map((item) => ({ order_item_id: item.order_item_id, product_id: item.product_id, unit_price: Number(item.unit_price.replace(',', '.')) })) : undefined, added_items: addedOrderItems.length ? addedOrderItems.map((item) => ({ product_id: item.product_id, quantity: item.quantity, unit_price: Number(item.unit_price.replace(',', '.')) })) : undefined, removed_item_ids: removedOrderItemIds.length ? removedOrderItemIds : undefined, shipping_cost: isDeliveredReplacement ? parsedShippingCost : undefined, charge_replacement_shipping: isDeliveredReplacement || undefined, customer_name: canEditCustomer ? customerName.trim().toLocaleUpperCase('ro-RO') : undefined, customer_phone: canEditCustomer ? customerPhone.trim() : undefined, customer_email: canEditCustomer ? customerEmail.trim().toLocaleLowerCase('ro-RO') : undefined, address: canEditOrderIdentity ? deliveryAddress.trim() : undefined, city: canEditOrderIdentity ? deliveryCity.trim() : undefined, county: canEditOrderIdentity ? deliveryCounty.trim() : undefined, postal_code: canEditOrderIdentity ? deliveryPostalCode.trim() : undefined });
      applyOrderToEditor(updated);
      setCustomerEditing(false);
      setCustomerName(String(updated.customer_name || '').toLocaleUpperCase('ro-RO'));
      setCustomerPhone(updated.customer_phone || '');
      setCustomerEmail(updated.customer_email || '');
      setDeliveryEditing(false);
      setDeliveryAddress(updated.address || '');
      setDeliveryCity(updated.city || '');
      setDeliveryCounty(updated.county || '');
      setDeliveryPostalCode(updated.postal_code || '');
      setCancellationReason(updated.customer_cancellation_reason || '');
      setReturnReason(updated.return_reason || '');
      setReturnBankIban(updated.return_bank_iban || '');
      setReturnAccountHolder(updated.return_bank_account_holder || '');
      setReturnDecisions((updated.return_items || []).map((item) => ({ order_item_id: item.order_item_id, product_name: item.product_name, product_sku: item.product_sku, requested_quantity: Number(item.requested_quantity), decision_status: item.decision_status, accepted_quantity: Number(item.accepted_quantity ?? item.requested_quantity), decision_reason: item.decision_reason || '' })));
      setNotifyCustomer(false);
      await load();
      const email = updated.email_notification;
      const modificationEmail = updated.order_modification_email;
      const automation = updated.invoice_automation;
      const orderMessage = email?.requested
        ? (email.sent ? `Statusul a fost salvat, iar clientul a primit e-mailul comenzii la ${email.recipient || selected.customer_email}.` : `Statusul a fost salvat, dar e-mailul comenzii nu a putut fi trimis: ${email.error || 'verifică setările SMTP.'}`)
        : `Statusul comenzii ${updated.order_number} a fost salvat.`;
      const automationMessage = automation?.processed
        ? automation.status === 'completed'
          ? automation.email_sent
            ? `\n\n${updated.invoice?.display_number || 'Factura'} a fost emisă automat și trimisă separat pe e-mail.`
            : `\n\n${updated.invoice?.display_number || 'Factura'} a fost emisă automat și este disponibilă în Facturi emise.`
          : `\n\nFactura automată nu s-a finalizat: ${automation.error || 'poate fi reluată în siguranță.'}`
        : '';
      const returnConfirmationMessage = updated.return_confirmation
        ? updated.return_confirmation.return_invoice
          ? updated.return_confirmation.return_invoice_email?.sent
            ? `\n\n${updated.return_confirmation.return_invoice.display_number || 'Factura de retur'} a fost emisă automat, conține referința facturii pozitive și a comenzii și a fost trimisă separat clientului.`
            : `\n\n${updated.return_confirmation.return_invoice.display_number || 'Factura de retur'} a fost emisă, dar PDF-ul nu a putut fi trimis: ${updated.return_confirmation.return_invoice_email?.error || 'verifică setările SMTP.'}`
          : '\n\nNu a fost emisă o factură de retur, deoarece comanda nu avea o factură pozitivă.'
        : '';
      const modificationMessage = itemsChanged
        ? modificationEmail?.sent
          ? `\n\nSumarul actualizat, cu pozele, produsele, cantitățile și prețurile, a fost trimis automat la ${modificationEmail.recipient || updated.customer_email}.`
          : `\n\nComanda a fost actualizată, dar sumarul nu a putut fi trimis pe e-mail: ${modificationEmail?.error || 'verifică setările SMTP.'}`
        : '';
      Alert.alert(
        automation?.processed || updated.return_confirmation?.return_invoice ? 'Comandă și factură actualizate' : 'Comanda actualizată',
        `${orderMessage}${automationMessage}${returnConfirmationMessage}${modificationMessage}`
      );
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally { setSaving(false); }
  };

  const sendCurrentStatus = async () => {
    if (!token || !selected || statusEmailBusy || !selected.customer_email) return;
    setStatusEmailBusy(true);
    try {
      const notification = await shopApi.sendOrderStatusEmail(token, selected.id);
      if (!notification.sent) throw new Error(notification.error || 'E-mailul nu a putut fi trimis.');
      Alert.alert('Status trimis', `Statusul curent al comenzii ${selected.order_number} a fost trimis la ${notification.recipient || selected.customer_email}.`);
    } catch (sendError) {
      Alert.alert('Statusul nu a putut fi trimis', sendError instanceof Error ? sendError.message : 'Încearcă din nou.');
    } finally {
      setStatusEmailBusy(false);
    }
  };

  const issueInvoice = async (order: ShopOrder, sendEmail: boolean, sendReturnEmail: boolean) => {
    if (!token || invoiceBusy) return;
    setInvoiceBusy(order.id);
    try {
      const invoice = await shopApi.issueInvoice(token, order.id, sendEmail, sendReturnEmail);
      clearOrdersSnapshots(token);
      const applyInvoice = (item: ShopOrder) => item.id === order.id ? { ...item, invoice } : item;
      setOrders((current) => current.map(applyInvoice));
      setSelected((current) => current ? applyInvoice(current) : current);
      setInvoicePromptOrder(null);
      setInvoiceSendEmail(false);
      setInvoiceSendReturnEmail(false);
      const notification = invoice.email_notification;
      const pairedMessage = invoice.return_invoice
        ? invoice.return_invoice_email?.sent
          ? `\n\n${invoice.return_invoice.display_number} a fost emisă automat ca factură de retur, cu referință la ${invoice.display_number} și la comanda ${order.order_number}, apoi trimisă clientului.`
          : invoice.return_invoice_email?.requested === false
            ? `\n\n${invoice.return_invoice.display_number} a fost emisă cu referințele complete și nu a fost trimisă pe e-mail, conform selecției tale.`
            : `\n\n${invoice.return_invoice.display_number} a fost emisă cu referințele complete, dar PDF-ul de retur nu a putut fi trimis: ${invoice.return_invoice_email?.error || 'verifică setările SMTP.'}`
        : '';
      Alert.alert(
        invoice.paired_documents ? 'Documentele au fost emise' : invoice.existing ? 'Factura exista deja' : 'Factura a fost emisă',
        (sendEmail
          ? (notification?.sent ? `${invoice.display_number} a fost trimisă la ${notification.recipient || invoice.customer_email}.` : `${invoice.display_number} a fost emisă, dar e-mailul nu a plecat: ${notification?.error || 'verifică setările SMTP.'}`)
          : `${invoice.display_number} este disponibilă în Facturi emise.`) + pairedMessage
      );
    } catch (issueError) {
      Alert.alert('Factura nu a putut fi emisă', issueError instanceof Error ? issueError.message : 'Încearcă din nou.');
    } finally { setInvoiceBusy(null); }
  };

  const chooseInvoiceAction = (order: ShopOrder) => {
    if (order.invoice) {
      closeOrder();
      onOpenInvoice?.(order.invoice.id);
      return;
    }
    if (order.status === 'cancelled' || order.status === 'refunded') {
      Alert.alert('Emiterea nu este permisă', 'Nu poți emite o factură normală pentru o comandă anulată sau rambursată.');
      return;
    }
    setInvoicePromptOrder(order);
    setInvoiceSendEmail(Boolean(order.customer_email));
    setInvoiceSendReturnEmail(order.status === 'return_confirmed' && Boolean(order.customer_email));
  };

  const canAddProducts = Boolean(selected
    && !(['return_requested', 'return_refused', 'return_confirmed', 'refunded', 'cancelled'] as ShopOrder['status'][]).includes(selected.status)
    && !selected.invoice);

  if (loading && !loadedOnce) return <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se incarca comenzile...</Text></View>;
  if (error) return <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Incearca din nou</Text></TouchableOpacity></View>;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroller} contentContainerStyle={styles.stats}>
        <OrderMetricCard icon={Clock3} color="#087FF5" label="În procesare" value={String(orderSummary.new_count)} help="Comenzi noi" />
        <OrderMetricCard icon={PackageOpen} color="#09BFD9" label="În pregătire" value={String(orderSummary.processing_count)} help="Se pregătesc" />
        <OrderMetricCard icon={RotateCcw} color="#F472B6" label={`Retururi · ${orderSummary.returns_count || 0}`} value={money(orderSummary.returns_total || 0)} help="Facturi de retur emise" />
        <OrderMetricCard icon={WalletCards} color="#087FF5" label="Total" value={money(orderSummary.financial_total)} help="Încasat + ramburs" />
        <OrderMetricCard icon={CreditCard} color="#34D399" label="Încasat" value={money(orderSummary.collected)} help="Plăți încasate" />
        <OrderMetricCard icon={HandCoins} color="#FBBF24" label="De încasat" value={money(orderSummary.pending_cash)} help="Ramburs în așteptare" />
      </ScrollView>
      <View style={styles.actions}>
        <View style={styles.search}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Client, dată, oră, telefon, status, plată sau număr" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View>
        <TouchableOpacity style={[styles.filterButton, (filtersOpen || activeFilterCount > 0) && styles.filterButtonActive]} onPress={() => setFiltersOpen((current) => !current)}>
          <SlidersHorizontal size={18} color={(filtersOpen || activeFilterCount > 0) ? Colors.orange : Colors.textSecondary} />
          {activeFilterCount ? <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View> : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color={Colors.textSecondary} /></TouchableOpacity>
      </View>
      {filtersOpen ? <View style={styles.filtersPanel}>
        <View style={styles.filtersHead}><View><Text style={styles.filtersTitle}>Filtre comenzi</Text><Text style={styles.filtersResult}>{ordersTotal} {ordersTotal === 1 ? 'rezultat' : 'rezultate'}</Text></View><TouchableOpacity onPress={resetFilters} disabled={!query && activeFilterCount === 0}><Text style={[styles.resetFilters, !query && activeFilterCount === 0 && styles.resetFiltersDisabled]}>Resetează</Text></TouchableOpacity></View>
        <Text style={styles.filterGroupLabel}>STATUS COMANDĂ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsContent}>
          <FilterChip label="Toate" active={statusFilter === 'all'} onPress={() => { setStatusFilter('all'); setPage(1); }} />
          <FilterChip label="Returnate" active={statusFilter === 'returned'} color="#F472B6" onPress={() => { setStatusFilter('returned'); setPage(1); }} />
          {orderStatuses.map((item) => <FilterChip key={item.value} label={item.label} active={statusFilter === item.value} color={item.color} onPress={() => { setStatusFilter(item.value); setPage(1); }} />)}
        </ScrollView>
        <Text style={styles.filterGroupLabel}>METODĂ DE PLATĂ</Text>
        <View style={styles.filterChipsWrap}><FilterChip label="Toate" active={paymentMethodFilter === 'all'} onPress={() => { setPaymentMethodFilter('all'); setPage(1); }} /><FilterChip label="Card online" active={paymentMethodFilter === 'card'} color="#087FF5" onPress={() => { setPaymentMethodFilter('card'); setPage(1); }} /><FilterChip label="Ramburs" active={paymentMethodFilter === 'cash'} color="#FBBF24" onPress={() => { setPaymentMethodFilter('cash'); setPage(1); }} /></View>
        <Text style={styles.filterGroupLabel}>STATUS PLATĂ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsContent}>
          <FilterChip label="Toate" active={paymentStateFilter === 'all'} onPress={() => { setPaymentStateFilter('all'); setPage(1); }} />
          {paymentStatuses.map((item) => <FilterChip key={item.value} label={item.label} active={paymentStateFilter === item.value} color={item.value === 'paid' ? '#34D399' : item.value === 'failed' ? '#FB7185' : '#FBBF24'} onPress={() => { setPaymentStateFilter(item.value); setPage(1); }} />)}
        </ScrollView>
      </View> : null}
      {pagedOrders.length ? pagedOrders.map((order) => {
        const statusMeta = orderStatuses.find((item) => item.value === order.status) || orderStatuses[0];
        return <TouchableOpacity key={order.id} style={styles.orderCard} activeOpacity={0.76} onPress={() => open(order)}>
          <View style={styles.orderCardMain}><View style={[styles.orderIcon, { backgroundColor: `${statusMeta.color}15` }]}><ShoppingCart size={22} color={statusMeta.color} /></View>
            <View style={styles.orderCopy}><View style={styles.orderTop}><View style={styles.orderIdentity}><Text style={styles.orderNumber}>{order.order_number}</Text><View style={[styles.customerTypeBadge, isCompanyOrder(order) && styles.customerTypeBadgeCompany]}><Text style={[styles.customerTypeBadgeText, isCompanyOrder(order) && styles.customerTypeBadgeTextCompany]}>{isCompanyOrder(order) ? 'PJ' : 'PF'}</Text></View></View><Text style={[styles.status, { color: statusMeta.color }]}>{(statusMeta.shortLabel || statusMeta.label).toUpperCase()}</Text></View><Text style={styles.customer}>{shopOrderCustomerDisplayName(order)} · {order.customer_phone}</Text></View>
            <View style={styles.orderArrow}><ChevronRight size={19} color={Theme.colors.brand.primaryText} strokeWidth={2.5} /></View>
          </View>
          <View style={styles.orderBottom}><View style={styles.orderDateMeta}><Clock3 size={13} color={Theme.colors.text.secondary} strokeWidth={2.2} /><Text numberOfLines={1} style={styles.orderDate}>{dateTime(order.created_at)}</Text></View><View style={[styles.paymentMethodChip, order.payment_method === 'card' ? styles.paymentMethodCard : styles.paymentMethodCash]}>{order.payment_method === 'card' ? <CreditCard size={12} color={Theme.colors.brand.primaryText} /> : <HandCoins size={12} color={Theme.colors.brand.primaryText} />}<Text style={[styles.paymentMethodText, order.payment_method === 'card' ? styles.paymentMethodCardText : styles.paymentMethodCashText]}>{order.payment_method === 'card' ? 'Card' : 'Ramburs'}</Text></View><Text style={styles.orderTotal}>{money(order.total)}</Text><TouchableOpacity disabled={Boolean(invoiceBusy)} accessibilityLabel={order.invoice ? `Deschide factura ${order.invoice.display_number}` : 'Emite factura'} style={[styles.invoiceQuick, order.invoice && styles.invoiceQuickIssued]} onPress={(event) => { event.stopPropagation(); chooseInvoiceAction(order); }}>{invoiceBusy === order.id || invoiceBusy === order.invoice?.id ? <ActivityIndicator size="small" color={order.invoice ? Theme.colors.state.success : Colors.orange} /> : <FileCheck2 size={18} color={order.invoice ? Theme.colors.state.success : Colors.orange} />}</TouchableOpacity></View>
        </TouchableOpacity>;
      }) : <View style={styles.empty}><PackageCheck size={34} color="#087FF5" /><Text style={styles.emptyTitle}>{hasActiveSearch ? 'Nicio comandă găsită' : 'Nicio comandă'}</Text><Text style={styles.emptyText}>{hasActiveSearch ? 'Schimbă căutarea sau resetează filtrele.' : 'Comenzile trimise de pe site vor apărea automat aici.'}</Text>{hasActiveSearch ? <TouchableOpacity style={styles.emptyReset} onPress={resetFilters}><Text style={styles.emptyResetText}>Resetează filtrele</Text></TouchableOpacity> : null}</View>}
      <ShopPagination page={page} pageSize={pageSize} total={ordersTotal} onPageChange={setPage} onPageSizeChange={setPageSize} />

      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => productPanelId ? closeProductPanel() : (!saving && closeOrder())}>
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}><TouchableOpacity accessibilityLabel="Închide comanda" style={styles.close} onPress={closeOrder}><X size={21} color={Colors.textSecondary} /></TouchableOpacity><View style={styles.modalHeaderCopy}><Text style={styles.modalKicker}>COMANDA SHOP</Text><Text style={styles.modalTitle}>{selected?.order_number}</Text></View><TouchableOpacity style={[styles.save, (saving || detailLoading || Boolean(detailErrorMessage)) && styles.disabled]} onPress={() => void save()} disabled={saving || detailLoading || Boolean(detailErrorMessage)}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={17} color={Colors.white} /><Text style={styles.saveText}>Salveaza</Text></>}</TouchableOpacity></View>
          {selected ? <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) + 30 }]} showsVerticalScrollIndicator={false}>
            {detailLoading ? <View style={styles.detailLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.detailLoadingText}>Actualizăm istoricul comenzii...</Text></View> : null}
            {!detailLoading && detailErrorMessage ? <View style={[styles.detailLoading, styles.detailError]}><Text style={styles.detailErrorText}>Detaliile complete nu s-au încărcat.</Text><TouchableOpacity style={styles.detailRetry} onPress={() => void openOrder(selected.id, selected)}><RefreshCw size={13} color="#FFFFFF" /><Text style={styles.detailRetryText}>Reîncearcă</Text></TouchableOpacity></View> : null}
            <ClientInfoBlock
              order={selected}
              editing={customerEditing}
              canEdit={!selected.invoice}
              onToggle={() => {
                if (customerEditing) {
                  setCustomerName(String(selected.customer_name || '').toLocaleUpperCase('ro-RO'));
                  setCustomerPhone(selected.customer_phone || '');
                  setCustomerEmail(selected.customer_email || '');
                }
                setCustomerEditing((current) => !current);
              }}
              name={customerName}
              phone={customerPhone}
              email={customerEmail}
              onNameChange={(value) => setCustomerName(value.toLocaleUpperCase('ro-RO'))}
              onPhoneChange={setCustomerPhone}
              onEmailChange={setCustomerEmail}
            />
            <DeliveryInfoBlock order={selected} editing={deliveryEditing} canEdit={!selected.invoice} onToggle={() => { if (deliveryEditing) { setDeliveryAddress(selected.address || ''); setDeliveryCity(selected.city || ''); setDeliveryCounty(selected.county || ''); setDeliveryPostalCode(selected.postal_code || ''); } setDeliveryEditing((current) => !current); }} address={deliveryAddress} city={deliveryCity} county={deliveryCounty} postalCode={deliveryPostalCode} onAddressChange={setDeliveryAddress} onCityChange={setDeliveryCity} onCountyChange={setDeliveryCounty} onPostalCodeChange={setDeliveryPostalCode} />
            <View style={styles.productsSectionHead}>
              <View style={styles.productsSectionCopy}><Text style={[styles.sectionLabel, styles.productsSectionLabel]}>PRODUSE · PREȚURI DE VÂNZARE</Text><Text style={styles.productsSectionHelp}>{selected.invoice ? 'Factura a fost emisă. Produsele comenzii nu mai pot fi adăugate, șterse sau înlocuite.' : 'Poți adăuga, înlocui sau șterge produsele comenzii.'}</Text></View>
              <TouchableOpacity disabled={!canAddProducts} style={[styles.addOrderItemButton, !canAddProducts && styles.disabled]} onPress={openAddProductPicker}><Plus size={16} color="#FFFFFF" strokeWidth={2.8} /><Text style={styles.addOrderItemButtonText}>Adaugă produs</Text></TouchableOpacity>
            </View>
            <View style={styles.items}>{orderItemDrafts.map((item) => {
              const editable = !selected.invoice
                && !(['return_requested', 'return_refused', 'return_confirmed', 'refunded', 'cancelled'] as ShopOrder['status'][]).includes(selected.status)
                && selected.status !== 'completed';
              return <View key={item.order_item_id} style={[styles.item, styles.itemEditable]}>
                {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="contain" /> : <View style={styles.itemQty}><Text style={styles.itemQtyText}>{item.quantity}×</Text></View>}
                <View style={styles.itemCopy}>
                  <View style={styles.itemNameRow}><Text selectable style={styles.itemName}>{item.product_name}</Text>{item.is_new ? <View style={styles.newItemBadge}><Text style={styles.newItemBadgeText}>NOU</Text></View> : null}</View>
                  <Text selectable style={styles.itemSku}>{item.quantity} {item.unit_of_measure} · {item.product_sku || 'Fără cod'}</Text>
                  <Text selectable style={styles.itemUnitPrice}>Preț unitar · {money(Number(item.unit_price.replace(',', '.')) || 0)}</Text>
                  <View style={styles.itemEditRow}>
                    {item.is_new ? <TouchableOpacity style={[styles.itemChangeButton, styles.removeNewItemButton]} onPress={() => setOrderItemDrafts((current) => current.filter((draft) => draft.order_item_id !== item.order_item_id))}><Trash2 size={13} color="#C43650" /><Text style={[styles.itemChangeText, styles.removeNewItemText]}>Elimină</Text></TouchableOpacity> : <><TouchableOpacity disabled={!editable} style={[styles.itemChangeButton, !editable && styles.disabled]} onPress={() => openItemProductPicker(item.order_item_id)}><Pencil size={13} color="#2B6FAF" /><Text style={styles.itemChangeText}>Schimbă produsul</Text></TouchableOpacity><TouchableOpacity disabled={!canAddProducts} style={[styles.itemChangeButton, styles.removeNewItemButton, !canAddProducts && styles.disabled]} onPress={() => {
                      if (orderItemDrafts.length <= 1) { Alert.alert('Produs obligatoriu', 'Comanda trebuie să păstreze cel puțin un produs.'); return; }
                      Alert.alert('Ștergi produsul?', `Ștergi „${item.product_name}” din comandă? La salvare se actualizează documentele interne și stocul.`, [{ text: 'Renunță', style: 'cancel' }, { text: 'Șterge', style: 'destructive', onPress: () => setOrderItemDrafts((current) => current.filter((draft) => draft.order_item_id !== item.order_item_id)) }]);
                    }}><Trash2 size={13} color="#C43650" /><Text style={[styles.itemChangeText, styles.removeNewItemText]}>Șterge</Text></TouchableOpacity></>}
                  </View>
                </View>
                <Text style={styles.itemTotal}>{money((Number(item.unit_price.replace(',', '.')) || 0) * item.quantity)}</Text>
                {item.product_id ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Deschide fișa produsului ${item.product_name}`} activeOpacity={0.72} style={styles.itemOpen} onPress={() => void openProductPanel(item.product_id)}><ChevronRight size={19} color="#FFFFFF" strokeWidth={2.7} /></TouchableOpacity> : null}
              </View>;
            })}</View>
            {selected.invoice ? <Text style={styles.itemCorrectionHint}>Factura emisă este un snapshot fiscal: modificarea catalogului nu îi schimbă denumirile, iar pozițiile comenzii nu mai pot fi editate.</Text> : null}
            <View style={styles.totals}>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>{`Produse${selected.vat_payer ? ' (TVA inclus)' : ''}`}</Text><Text style={styles.totalValue}>{money(orderItemDrafts.reduce((sum, item) => sum + (Number(item.unit_price.replace(',', '.')) || 0) * item.quantity, 0))}</Text></View>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Transport</Text><Text style={styles.totalValue}>{money(Number(shippingCostDraft.replace(',', '.')) || 0)}</Text></View>
              <View style={[styles.totalRow, styles.grandTotal]}><Text style={styles.grandTotalLabel}>{`Total de plată${selected.vat_payer ? ' (TVA inclus)' : ''}`}</Text><Text style={styles.grandTotalValue}>{money(orderItemDrafts.reduce((sum, item) => sum + (Number(item.unit_price.replace(',', '.')) || 0) * item.quantity, 0) + (Number(shippingCostDraft.replace(',', '.')) || 0))}</Text></View>
            </View>
            <View style={[styles.invoicePanel, selected.invoice && styles.invoicePanelIssued]}>
              <View style={styles.invoicePanelIcon}>{selected.invoice ? <FileCheck2 size={22} color="#34D399" /> : <FileCheck2 size={22} color={Colors.orange} />}</View>
              <View style={styles.invoicePanelCopy}><Text style={styles.invoicePanelKicker}>FACTURĂ FISCALĂ</Text><Text style={styles.invoicePanelTitle}>{selected.invoice ? selected.invoice.display_number : 'Factura nu este emisă'}</Text><Text style={styles.invoicePanelText}>{selected.invoice ? `${selected.invoice.status === 'paid' ? 'Plătită' : 'Neplătită'} · ${selected.invoice.provider === 'smartbill' ? 'SmartBill' : 'document istoric'} · ${selected.invoice.total.toLocaleString('ro-RO')} ${selected.invoice.currency}` : 'Factura se emite în SmartBill după verificarea SKU-urilor, gestiunilor și stocului.'}</Text></View>
              <TouchableOpacity disabled={Boolean(invoiceBusy)} style={[styles.invoicePanelButton, selected.invoice && styles.invoicePanelButtonIssued]} onPress={() => chooseInvoiceAction(selected)}>{invoiceBusy === selected.id || invoiceBusy === selected.invoice?.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : selected.invoice ? <><FileCheck2 size={16} color="#FFFFFF" /><Text style={styles.invoicePanelButtonText}>Vezi factura</Text></> : <><Send size={16} color="#FFFFFF" /><Text style={styles.invoicePanelButtonText}>Emite</Text></>}</TouchableOpacity>
            </View>
            {selected.return_invoice ? <View style={[styles.invoicePanel, styles.invoicePanelIssued, { borderColor: '#078F8866', backgroundColor: Theme.colors.surface.muted }]}>
              <View style={[styles.invoicePanelIcon, { backgroundColor: '#078F881C' }]}><RotateCcw size={22} color="#078F88" /></View>
              <View style={styles.invoicePanelCopy}><Text style={[styles.invoicePanelKicker, { color: Theme.colors.brand.cyanStrong }]}>{selected.return_invoice.invoice_type === 'correction_return' ? 'FACTURĂ NEGATIVĂ DE CORECȚIE' : 'FACTURĂ DE RETUR'}</Text><Text style={styles.invoicePanelTitle}>{selected.return_invoice.display_number}</Text><Text style={styles.invoicePanelText}>Referință fiscală pentru comanda {selected.order_number} · document existent, nemodificat de integrarea SmartBill</Text></View>
              <TouchableOpacity style={[styles.invoicePanelButton, styles.invoicePanelButtonIssued, { backgroundColor: '#168A7C' }]} onPress={() => { closeOrder(); onOpenInvoice?.(selected.return_invoice!.id); }}><FileCheck2 size={16} color="#FFFFFF" /><Text style={styles.invoicePanelButtonText}>Vezi returul</Text></TouchableOpacity>
            </View> : null}
            <Text style={styles.sectionLabel}>EVOLUȚIA COMENZII</Text>
            <OrderStatusTimeline order={selected} />
            <Text style={styles.sectionLabel}>STATUS COMANDA</Text>
            <View style={styles.statusPicker}>{orderStatuses.map((item, index) => {
              const StatusIcon = item.icon;
              const active = status === item.value;
              const allowed = canChangeOrderStatus(selected.status, item.value);
              return <View key={item.value} style={styles.statusTrackRow}>
                <View style={styles.statusTrackRail}><View style={[styles.statusTrackDot, active && { borderColor: item.color, backgroundColor: item.color }]}>{active ? <Check size={12} color="#F7FAFD" strokeWidth={3} /> : <Text style={styles.statusTrackIndex}>{String(index + 1).padStart(2, '0')}</Text>}</View>{index < orderStatuses.length - 1 ? <View style={styles.statusTrackLine} /> : null}</View>
                <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: active, disabled: !allowed }} disabled={!allowed} activeOpacity={0.76} style={[styles.statusOption, !allowed && styles.statusOptionLocked, active && { borderColor: item.color, backgroundColor: `${item.color}12` }]} onPress={() => { setStatus(item.value); setNotifyCustomer(Boolean(selected.customer_email) && item.value !== selected.status); }}>
                  <View style={[styles.statusOptionIcon, { backgroundColor: `${item.color}18` }]}><StatusIcon size={17} color={item.color} /></View>
                  <View style={styles.statusOptionCopy}><Text style={[styles.statusOptionTitle, active && { color: item.color }]}>{item.label}</Text><Text style={styles.statusOptionText}>{item.description}</Text></View>
                  <View style={[styles.radio, active && { borderColor: item.color, backgroundColor: item.color }]}>{active ? <Check size={12} color="#14110F" strokeWidth={3} /> : null}</View>
                </TouchableOpacity>
              </View>;
            })}</View>
            {status === 'cancelled' ? <View style={styles.cancellationReasonCard}><View style={styles.cancellationReasonHead}><Ban size={17} color="#FB7185" /><View><Text style={styles.cancellationReasonKicker}>MOTIV OBLIGATORIU</Text><Text style={styles.cancellationReasonTitle}>{selected.status === 'cancelled' ? 'Motivul anulării' : 'De ce anulăm comanda?'}</Text></View></View><TextInput editable={selected.status !== 'cancelled'} value={cancellationReason} onChangeText={setCancellationReason} multiline maxLength={1000} placeholder="Scrie motivul transmis clientului..." placeholderTextColor="#7B8FA3" style={[styles.cancellationReasonInput, selected.status === 'cancelled' && styles.cancellationReasonInputLocked]} /><Text style={styles.cancellationReasonHelp}>{selected.status === 'cancelled' ? 'Motiv salvat în istoricul comenzii.' : 'Anularea manuală poate fi făcută și după predarea către curier. Clientul primește automat confirmarea pe e-mail.'}</Text></View> : null}
            {(['return_requested', 'return_refused', 'return_confirmed', 'refunded'] as ShopOrder['status'][]).includes(status) ? <View style={styles.returnRequestCard}>
              <View style={styles.cancellationReasonHead}><RotateCcw size={18} color="#F472B6" /><View><Text style={styles.returnRequestKicker}>DATE RETUR</Text><Text style={styles.cancellationReasonTitle}>{selected.return_reason ? 'Datele returului' : 'Completează returul'}</Text></View></View>
              <TextInput editable={!selected.return_reason} value={returnReason} onChangeText={setReturnReason} multiline maxLength={1000} placeholder="Motivul returului..." placeholderTextColor="#7B8FA3" style={[styles.cancellationReasonInput, !!selected.return_reason && styles.cancellationReasonInputLocked]} />
              <TextInput editable={!selected.return_reason} value={returnAccountHolder} onChangeText={setReturnAccountHolder} maxLength={180} placeholder="Numele titularului contului" placeholderTextColor="#7B8FA3" style={[styles.returnRequestInput, !!selected.return_reason && styles.cancellationReasonInputLocked]} />
              <TextInput editable={!selected.return_reason} autoCapitalize="characters" value={returnBankIban} onChangeText={(value) => setReturnBankIban(value.toUpperCase())} maxLength={40} placeholder="IBAN pentru rambursare" placeholderTextColor="#7B8FA3" style={[styles.returnRequestInput, !!selected.return_reason && styles.cancellationReasonInputLocked]} />
              <Text style={[styles.sectionLabel, { marginTop: 14 }]}>PRODUSE SOLICITATE · DECIZIE PE CANTITATE</Text>
              {returnDecisions.map((item, itemIndex) => {
                const locked = selected.status === 'return_confirmed' || selected.status === 'refunded';
                const refusedQuantity = Math.max(0, item.requested_quantity - item.accepted_quantity);
                return <View key={item.order_item_id} style={[styles.returnDecisionCard, item.decision_status === 'partial' && styles.returnDecisionCardPartial]}>
                  <View style={styles.returnDecisionHead}>
                    <View style={{ flex: 1 }}><Text style={styles.returnDecisionName}>{item.product_name}</Text><Text style={styles.returnDecisionMeta}>{item.product_sku || 'Fără SKU'} · solicitat {item.requested_quantity}</Text></View>
                    <View style={styles.returnDecisionActions}>
                      <TouchableOpacity disabled={locked} onPress={() => setReturnDecisions((current) => current.map((entry, index) => index === itemIndex ? returnDecisionWithAccepted(entry, entry.requested_quantity) : entry))} style={[styles.returnDecisionButton, item.decision_status === 'accepted' && styles.returnDecisionAccept]}><Text style={styles.returnDecisionButtonText}>Acceptă tot</Text></TouchableOpacity>
                      <TouchableOpacity disabled={locked} onPress={() => setReturnDecisions((current) => current.map((entry, index) => index === itemIndex ? returnDecisionWithAccepted(entry, 0) : entry))} style={[styles.returnDecisionButton, item.decision_status === 'refused' && styles.returnDecisionRefuse]}><Text style={styles.returnDecisionButtonText}>Refuză tot</Text></TouchableOpacity>
                    </View>
                  </View>
                  {item.decision_status !== 'pending' ? <View style={styles.returnQuantityRow}>
                    <View style={styles.returnQuantitySummary}><Text style={styles.returnQuantityAccepted}>Acceptată {item.accepted_quantity}</Text><Text style={styles.returnQuantityRefused}>Refuzată {refusedQuantity}</Text></View>
                    <TouchableOpacity disabled={locked || item.accepted_quantity <= 0} onPress={() => setReturnDecisions((current) => current.map((entry, index) => index === itemIndex ? returnDecisionWithAccepted(entry, entry.accepted_quantity - 1) : entry))} style={styles.returnQtyButton}><Text style={styles.returnDecisionButtonText}>−</Text></TouchableOpacity>
                    <Text style={styles.returnQtyValue}>{item.accepted_quantity}</Text>
                    <TouchableOpacity disabled={locked || item.accepted_quantity >= item.requested_quantity} onPress={() => setReturnDecisions((current) => current.map((entry, index) => index === itemIndex ? returnDecisionWithAccepted(entry, entry.accepted_quantity + 1) : entry))} style={styles.returnQtyButton}><Text style={styles.returnDecisionButtonText}>+</Text></TouchableOpacity>
                  </View> : null}
                  {refusedQuantity > 0 && item.decision_status !== 'pending' ? <TextInput editable={!locked} value={item.decision_reason} onChangeText={(value) => setReturnDecisions((current) => current.map((entry, index) => index === itemIndex ? { ...entry, decision_reason: value } : entry))} placeholder={`Motiv pentru cele ${refusedQuantity} buc. refuzate`} placeholderTextColor="#7B8FA3" style={styles.returnRequestInput} /> : null}
                </View>;
              })}
              {(status === 'return_confirmed' || status === 'refunded') && !(['return_confirmed', 'refunded'] as ShopOrder['status'][]).includes(selected.status) ? <View style={styles.returnShippingChoice}>
                <Text style={styles.returnShippingChoiceTitle}>CINE SUPORTĂ TRANSPORTUL RETURULUI?</Text>
                <View style={styles.returnShippingChoiceRow}>{(['customer', 'company'] as const).map((payer) => <TouchableOpacity key={payer} onPress={() => setReturnShippingPayer(payer)} style={[styles.returnShippingChoiceButton, returnShippingPayer === payer && styles.returnShippingChoiceButtonActive]}><View style={[styles.radio, returnShippingPayer === payer && styles.radioActive]}>{returnShippingPayer === payer ? <Check size={12} color="#F7FAFD" strokeWidth={3} /> : null}</View><Text style={styles.returnShippingChoiceText}>{payer === 'customer' ? 'Clientul' : 'Firma'}</Text></TouchableOpacity>)}</View>
                {returnShippingPayer === 'customer' ? <View style={styles.returnShippingAmountRow}><Text style={styles.returnShippingAmountLabel}>VALOARE TRANSPORT RETUR</Text><View style={styles.shippingCostField}><TextInput selectTextOnFocus keyboardType="decimal-pad" value={returnShippingCostDraft} onChangeText={setReturnShippingCostDraft} style={styles.shippingCostInput} /><Text style={styles.shippingCostCurrency}>lei</Text></View></View> : <Text style={styles.returnShippingChoiceHelp}>{returnShippingPayer === 'company' ? 'Clientului nu i se reține transportul.' : 'Alegerea este obligatorie înainte de confirmare.'}</Text>}
              </View> : null}
              <View style={styles.returnAmounts}><View><Text style={styles.returnAmountLabel}>COST RETUR CURIER</Text><Text style={styles.returnAmountCost}>−{money(returnShippingPayer === 'company' ? 0 : Number(returnShippingCostDraft.replace(',', '.')) || 0)}</Text></View><View style={styles.returnAmountRight}><Text style={styles.returnAmountLabel}>ESTIMARE RESTITUIRE</Text><Text style={styles.returnAmountValue}>{money(Math.max(0, Number(selected.return_items_gross ?? selected.total ?? 0) + Number(selected.return_delivery_refund ?? 0) - (returnShippingPayer === 'company' ? 0 : Number(returnShippingCostDraft.replace(',', '.')) || 0)))}</Text></View></View>
              <Text style={styles.returnRequestHelp}>Corecția SmartBill folosește exclusiv cantitatea acceptată. Pentru retururile parțiale nesuportate automat, comanda este marcată pentru intervenție în SmartBill; Cubis nu generează NIR.</Text>
            </View> : null}
            {selected.return_deadline_at && (['return_requested', 'return_refused', 'return_confirmed', 'refunded'] as ShopOrder['status'][]).includes(status) ? <Text style={styles.returnRequestHelp}>{selected.return_policy_type === 'b2b_commercial' ? 'Retur comercial PJ' : 'Drept de retragere PF'} · termenul cererii: {dateTime(selected.return_deadline_at)}</Text> : null}
            <TouchableOpacity
              activeOpacity={0.78}
              disabled={status === 'cancelled' || !selected.customer_email || status === selected.status}
              style={[styles.notifyCard, notifyCustomer && styles.notifyCardActive, (status === 'cancelled' || !selected.customer_email || status === selected.status) && styles.notifyCardDisabled]}
              onPress={() => setNotifyCustomer((current) => !current)}>
              <View style={styles.notifyIcon}><BellRing size={19} color={notifyCustomer ? '#F7FAFD' : Colors.orange} /></View>
              <View style={styles.notifyCopy}><Text style={styles.notifyTitle}>{status === 'return_requested' ? 'Trimite confirmarea solicitării' : status === 'return_confirmed' ? 'Trimite confirmarea returului' : status === 'cancelled' ? 'Confirmare automată pe e-mail' : 'Trimite actualizarea pe e-mail'}</Text><Text style={styles.notifyText}>{!selected.customer_email ? 'Comanda nu are o adresă de e-mail.' : status === 'return_requested' ? `Clientul va primi e-mailul „Am primit solicitarea ta de retur” la ${selected.customer_email}.` : status === 'return_confirmed' ? `Clientul va primi confirmarea aprobării returului la ${selected.customer_email}. Factura de retur, dacă există o factură pozitivă, se trimite automat separat.` : status === 'cancelled' ? `Confirmarea anulării va fi trimisă automat la ${selected.customer_email}.` : status === selected.status ? 'Selectează un status diferit pentru a putea notifica clientul.' : `Clientul va primi rezumatul și linkul de urmărire la ${selected.customer_email}.`}</Text></View>
              <View style={[styles.checkbox, notifyCustomer && styles.checkboxActive]}>{notifyCustomer ? <Check size={13} color="#F7FAFD" strokeWidth={3} /> : <Mail size={13} color={Colors.textMuted} />}</View>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.78} disabled={!selected.customer_email || statusEmailBusy} style={[styles.currentStatusButton, (!selected.customer_email || statusEmailBusy) && styles.currentStatusButtonDisabled]} onPress={() => void sendCurrentStatus()}>
              <View style={styles.currentStatusIcon}>{statusEmailBusy ? <ActivityIndicator size="small" color="#2B6FAF" /> : <Send size={18} color="#2B6FAF" />}</View>
              <View style={styles.currentStatusCopy}><Text style={styles.currentStatusTitle}>Trimite statusul curent</Text><Text numberOfLines={2} style={styles.currentStatusText}>{selected.customer_email ? `Retrimite acum statusul „${orderStatuses.find((item) => item.value === selected.status)?.shortLabel || orderStatuses.find((item) => item.value === selected.status)?.label || selected.status}” la ${selected.customer_email}.` : 'Comanda nu are o adresă de e-mail.'}</Text></View>
              <Text style={styles.currentStatusAction}>{statusEmailBusy ? 'SE TRIMITE' : 'TRIMITE'}</Text>
            </TouchableOpacity>
            <Text style={styles.sectionLabel}>STATUS PLATA · {selected.payment_method === 'card' ? 'CARD' : 'RAMBURS'}</Text>
            <View style={styles.chips}>{paymentStatuses.map((item) => <TouchableOpacity key={item.value} style={[styles.chip, paymentStatus === item.value && styles.chipActive]} onPress={() => setPaymentStatus(item.value)}>{paymentStatus === item.value ? <Check size={13} color={Colors.orange} /> : null}<Text style={[styles.chipText, paymentStatus === item.value && styles.chipTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>
            {selected.customer_notes ? <InfoBlock title="Observatii client" lines={[selected.customer_notes]} /> : null}
            <Text style={styles.sectionLabel}>NOTITE INTERNE</Text><TextInput value={adminNotes} onChangeText={setAdminNotes} multiline placeholder="Adauga informatii vizibile doar in CRM" placeholderTextColor={Colors.textMuted} style={styles.notes} />
          </ScrollView> : null}
          {productPanelId ? <Animated.View
            style={[
              styles.productPanelLayer,
              {
                opacity: productPanelProgress,
                transform: [{ translateX: productPanelProgress.interpolate({ inputRange: [0, 1], outputRange: [34, 0] }) }],
              },
            ]}>
            <View style={styles.productPanelHeader}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Înapoi la comandă" style={styles.productPanelBack} onPress={closeProductPanel}><ArrowLeft size={20} color="#F5F9FD" strokeWidth={2.4} /></TouchableOpacity>
              <View style={styles.productPanelHeaderCopy}><Text style={styles.productPanelKicker}>FIȘA PRODUSULUI</Text><Text numberOfLines={1} style={styles.productPanelTitle}>{productPanel?.product.name || 'Se încarcă produsul...'}</Text><Text selectable style={styles.productPanelHint}>{productPanel ? `COD PRODUS · ${productPanel.product.sku || productPanel.product.supplier_product_code || 'FĂRĂ COD'}` : 'Comanda rămâne deschisă în fundal'}</Text></View>
              <View style={styles.productPanelMark}><PackageOpen size={20} color="#087FF5" /></View>
            </View>
            {productPanelLoading ? <View style={styles.productPanelState}><View style={styles.productPanelLoader}><ActivityIndicator color="#087FF5" /></View><Text style={styles.productPanelStateTitle}>Pregătim fișa produsului</Text><Text style={styles.productPanelStateText}>Datele produsului și istoricul vânzărilor se încarcă.</Text></View> : null}
            {!productPanelLoading && productPanelError ? <View style={styles.productPanelState}><View style={[styles.productPanelLoader, styles.productPanelErrorIcon]}><X size={21} color="#FB7185" /></View><Text style={styles.productPanelStateTitle}>Fișa nu s-a putut încărca</Text><Text style={styles.productPanelStateText}>{productPanelError}</Text><TouchableOpacity style={styles.productPanelRetry} onPress={() => void openProductPanel(productPanelId)}><RefreshCw size={15} color="#F7FAFD" /><Text style={styles.productPanelRetryText}>Încearcă din nou</Text></TouchableOpacity></View> : null}
            {!productPanelLoading && productPanel ? <ScrollView contentContainerStyle={[styles.productPanelContent, { paddingBottom: Math.max(insets.bottom, 18) + 28 }]} showsVerticalScrollIndicator={false}>
              <ProductPanelContent stats={productPanel} />
            </ScrollView> : null}
          </Animated.View> : null}
        </SafeAreaView>
      </Modal>
      <Modal visible={Boolean(itemPickerTarget)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setItemPickerTarget(null)}>
        <Pressable style={styles.productPickerBackdrop} onPress={() => setItemPickerTarget(null)}>
          <Pressable style={styles.productPickerPanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.productPickerHead}><View><Text style={styles.productPickerKicker}>{itemPickerTarget === ADD_ITEM_PICKER_TARGET ? 'ADAUGĂ ÎN COMANDĂ' : 'SCHIMBĂ PRODUSUL'}</Text><Text style={styles.productPickerTitle}>Caută după nume sau cod</Text></View><TouchableOpacity style={styles.productPickerClose} onPress={() => setItemPickerTarget(null)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity></View>
            <View style={styles.productPickerSearch}><Search size={17} color="#2B6FAF" /><TextInput autoFocus value={itemProductSearch} onChangeText={setItemProductSearch} placeholder="Denumire, cod, SKU sau EAN" placeholderTextColor={Colors.textMuted} style={styles.productPickerSearchInput} />{itemProductLoading ? <ActivityIndicator size="small" color="#2B6FAF" /> : null}</View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.productPickerResults}>
              {itemProductOptions.map((product) => {
                const sitePrice = Number(product.sale_price && product.sale_price > 0 ? product.sale_price : product.price);
                const imageUrl = product.images?.[0]?.url;
                const alreadyInOrder = itemPickerTarget === ADD_ITEM_PICKER_TARGET && orderItemDrafts.some((item) => item.product_id === product.id);
                return <TouchableOpacity key={product.id} disabled={alreadyInOrder} style={[styles.productPickerResult, alreadyInOrder && styles.disabled]} activeOpacity={0.75} onPress={() => selectOrderItemProduct(product)}>
                  {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.productPickerImage} resizeMode="contain" /> : <View style={styles.productPickerImageFallback}><PackageOpen size={20} color="#2B6FAF" /></View>}
                  <View style={styles.productPickerCopy}><Text style={styles.productPickerName}>{product.name}</Text><Text style={styles.productPickerMeta}>{product.sku || product.supplier_product_code || 'Fără cod'} · stoc {product.stock_mode === 'unlimited' ? 'nelimitat' : product.stock_quantity}</Text></View>
                  <View style={styles.productPickerPrice}><Text style={styles.productPickerPriceLabel}>{alreadyInOrder ? 'DEJA ÎN COMANDĂ' : 'PREȚ SITE'}</Text><Text style={styles.productPickerPriceValue}>{money(sitePrice)}</Text></View>
                </TouchableOpacity>;
              })}
              {!itemProductLoading && itemProductSearch.trim() && !itemProductOptions.length ? <View style={styles.productPickerEmpty}><Search size={22} color={Colors.textMuted} /><Text style={styles.productPickerEmptyText}>Nu am găsit produse. Încearcă denumirea sau codul.</Text></View> : null}
              {!itemProductSearch.trim() ? <Text style={styles.productPickerEmptyText}>Scrie denumirea sau codul produsului. Rezultatele apar automat.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={Boolean(replacementPriceDraft)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setReplacementPriceDraft(null)}>
        <Pressable style={styles.invoicePromptBackdrop} onPress={() => setReplacementPriceDraft(null)}>
          <Pressable style={[styles.invoicePrompt, styles.replacementPrompt]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.invoicePromptHead}><View style={[styles.invoicePromptLogo, styles.replacementPromptLogo]}><HandCoins size={25} color="#2B6FAF" /></View><TouchableOpacity style={styles.invoicePromptClose} onPress={() => setReplacementPriceDraft(null)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity></View>
            <Text style={[styles.invoicePromptEyebrow, { color: Theme.colors.state.info }]}>{replacementPriceDraft?.mode === 'add' ? 'PRODUS NOU ÎN COMANDĂ' : 'PRODUS ÎNLOCUITOR'}</Text>
            <Text style={styles.invoicePromptTitle}>{replacementPriceDraft?.mode === 'add' ? 'Cantitate și preț' : 'Prețul de vânzare'}</Text>
            <Text style={styles.invoicePromptSubtitle}>Prețul afișat pe site este completat automat. Poți seta cantitatea și prețul unitar convenit cu clientul pentru această comandă.</Text>
            {replacementPriceDraft ? <View style={styles.replacementProduct}>
              {replacementPriceDraft.product.images?.[0]?.url ? <Image source={{ uri: replacementPriceDraft.product.images[0].url }} style={styles.replacementProductImage} resizeMode="contain" /> : <View style={styles.replacementProductFallback}><PackageOpen size={22} color="#2B6FAF" /></View>}
              <View style={styles.replacementProductCopy}><Text style={styles.replacementProductName}>{replacementPriceDraft.product.name}</Text><Text style={styles.replacementProductMeta}>{replacementPriceDraft.product.sku || replacementPriceDraft.product.supplier_product_code || 'Fără cod'}</Text></View>
            </View> : null}
            {replacementPriceDraft?.mode === 'add' ? <View style={styles.replacementMoneyField}><Text style={styles.replacementMoneyLabel}>CANTITATE</Text><View style={styles.replacementMoneyInputWrap}><TextInput autoFocus selectTextOnFocus keyboardType="number-pad" value={replacementPriceDraft.quantity} onChangeText={(value) => setReplacementPriceDraft((current) => current ? { ...current, quantity: value.replace(/[^0-9]/g, '') } : current)} style={styles.replacementQuantityInput} /><Text style={styles.replacementMoneyCurrency}>{replacementPriceDraft.product.unit_of_measure || 'buc'}</Text></View></View> : null}
            <View style={styles.replacementMoneyField}><Text style={styles.replacementMoneyLabel}>PREȚ UNITAR</Text><View style={styles.replacementMoneyInputWrap}><TextInput autoFocus={replacementPriceDraft?.mode !== 'add'} selectTextOnFocus keyboardType="decimal-pad" value={replacementPriceDraft?.unit_price || ''} onChangeText={(value) => setReplacementPriceDraft((current) => current ? { ...current, unit_price: value } : current)} style={styles.replacementMoneyInput} /><Text style={styles.replacementMoneyCurrency}>lei</Text></View></View>
            <View style={styles.invoicePromptActions}><TouchableOpacity style={styles.invoicePromptCancel} onPress={() => setReplacementPriceDraft(null)}><Text style={styles.invoicePromptCancelText}>Renunță</Text></TouchableOpacity><TouchableOpacity style={[styles.invoicePromptConfirm, { backgroundColor: Theme.colors.brand.primary }]} onPress={confirmReplacementPrice}><Check size={18} color="#FFFFFF" /><Text style={styles.invoicePromptConfirmText}>{replacementPriceDraft?.mode === 'add' ? 'Adaugă în comandă' : 'Confirmă prețul'}</Text></TouchableOpacity></View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={replacementTransportPrompt} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setReplacementTransportPrompt(false)}>
        <Pressable style={styles.invoicePromptBackdrop} onPress={() => setReplacementTransportPrompt(false)}>
          <Pressable style={[styles.invoicePrompt, styles.replacementTransportPrompt]} onPress={(event) => event.stopPropagation()}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.invoicePromptScroll}>
              <View style={styles.invoicePromptHead}><View style={[styles.invoicePromptLogo, styles.replacementTransportLogo]}><Truck size={25} color="#087FF5" /></View><TouchableOpacity style={styles.invoicePromptClose} onPress={() => setReplacementTransportPrompt(false)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity></View>
              <Text style={[styles.invoicePromptEyebrow, { color: Theme.colors.brand.primaryText }]}>COMANDĂ LIVRATĂ ȘI FACTURATĂ</Text>
              <Text style={styles.invoicePromptTitle}>Transportul înlocuirii</Text>
              <Text style={styles.invoicePromptSubtitle}>Se emit factura de retur pentru produsul vechi și o factură nouă pentru produsul înlocuitor. Completează separat transportul facturii noi și transportul returului.</Text>
              <View style={styles.replacementMoneyField}><Text style={styles.replacementMoneyLabel}>TRANSPORT PE FACTURA NOUĂ</Text><View style={styles.replacementMoneyInputWrap}><TextInput selectTextOnFocus keyboardType="decimal-pad" value={shippingCostDraft} onChangeText={setShippingCostDraft} style={styles.replacementMoneyInput} /><Text style={styles.replacementMoneyCurrency}>lei</Text></View></View>
              <View style={[styles.returnShippingChoice, { marginTop: 12 }]}>
                <Text style={styles.returnShippingChoiceTitle}>CINE SUPORTĂ TRANSPORTUL RETURULUI?</Text>
                <View style={styles.returnShippingChoiceRow}>{(['customer', 'company'] as const).map((payer) => <TouchableOpacity key={payer} onPress={() => setReturnShippingPayer(payer)} style={[styles.returnShippingChoiceButton, returnShippingPayer === payer && styles.returnShippingChoiceButtonActive]}><View style={[styles.radio, returnShippingPayer === payer && styles.radioActive]}>{returnShippingPayer === payer ? <Check size={12} color="#F7FAFD" strokeWidth={3} /> : null}</View><Text style={styles.returnShippingChoiceText}>{payer === 'customer' ? 'Clientul' : 'Firma'}</Text></TouchableOpacity>)}</View>
                {returnShippingPayer === 'customer' ? <View style={styles.returnShippingAmountRow}><Text style={styles.returnShippingAmountLabel}>VALOARE TRANSPORT RETUR</Text><View style={styles.shippingCostField}><TextInput selectTextOnFocus keyboardType="decimal-pad" value={returnShippingCostDraft} onChangeText={setReturnShippingCostDraft} style={styles.shippingCostInput} /><Text style={styles.shippingCostCurrency}>lei</Text></View></View> : <Text style={styles.returnShippingChoiceHelp}>{returnShippingPayer === 'company' ? 'Clientului nu i se reține transportul de retur.' : 'Alege Clientul sau Firma pentru a continua.'}</Text>}
              </View>
              <View style={styles.invoicePromptActions}><TouchableOpacity style={styles.invoicePromptCancel} onPress={() => setReplacementTransportPrompt(false)}><Text style={styles.invoicePromptCancelText}>Înapoi</Text></TouchableOpacity><TouchableOpacity style={[styles.invoicePromptConfirm, { backgroundColor: Theme.colors.brand.primaryAction }]} onPress={confirmReplacementTransport}><Check size={18} color="#FFFFFF" /><Text style={styles.invoicePromptConfirmText}>Confirmă transportul</Text></TouchableOpacity></View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={Boolean(invoicePromptOrder)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !invoiceBusy && setInvoicePromptOrder(null)}>
        <Pressable style={styles.invoicePromptBackdrop} onPress={() => !invoiceBusy && setInvoicePromptOrder(null)}>
          <Pressable style={styles.invoicePrompt} onPress={(event) => event.stopPropagation()}>
            <View style={styles.invoicePromptGlow} />
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.invoicePromptScroll}>
            <View style={styles.invoicePromptHead}><View style={styles.invoicePromptLogo}><FileCheck2 size={26} color="#087FF5" /></View><TouchableOpacity disabled={Boolean(invoiceBusy)} style={styles.invoicePromptClose} onPress={() => setInvoicePromptOrder(null)}><X size={18} color={Colors.textSecondary} /></TouchableOpacity></View>
            <Text style={styles.invoicePromptEyebrow}>DOCUMENT FISCAL · TEMĂ FIXATĂ</Text>
            <Text style={styles.invoicePromptTitle}>{invoicePromptOrder?.status === 'return_confirmed' ? 'Emite factura și returul' : 'Emite factura'}</Text>
            <Text style={styles.invoicePromptSubtitle}>{invoicePromptOrder?.status === 'return_confirmed' ? 'Se emit împreună factura pozitivă și factura de retur. Returul va indica explicit factura pozitivă și comanda, iar tu alegi separat ce PDF-uri trimiți clientului.' : 'Factura va prelua datele, produsele și prețurile comenzii, apoi va scădea stocul. Ieșirea va fi legată automat de costurile reale de achiziție disponibile.'}</Text>
            <View style={styles.invoicePromptSummary}><View><Text style={styles.invoicePromptSummaryLabel}>COMANDĂ</Text><Text style={styles.invoicePromptSummaryValue}>{invoicePromptOrder?.order_number}</Text></View><View style={styles.invoicePromptSummaryRight}><Text style={styles.invoicePromptSummaryLabel}>TOTAL</Text><Text style={styles.invoicePromptSummaryTotal}>{invoicePromptOrder ? money(invoicePromptOrder.total) : ''}</Text></View></View>
            <TouchableOpacity activeOpacity={0.78} disabled={!invoicePromptOrder?.customer_email || Boolean(invoiceBusy)} onPress={() => setInvoiceSendEmail((value) => !value)} style={[styles.invoiceEmailSwitch, invoiceSendEmail && styles.invoiceEmailSwitchActive, !invoicePromptOrder?.customer_email && styles.invoiceEmailSwitchDisabled]}><View style={[styles.invoiceEmailIcon, invoiceSendEmail && styles.invoiceEmailIconActive]}><Mail size={21} color={invoiceSendEmail ? '#FFFFFF' : '#087FF5'} /></View><View style={styles.invoiceEmailCopy}><View style={styles.invoiceEmailTitleRow}><Text style={styles.invoiceEmailTitle}>{invoicePromptOrder?.status === 'return_confirmed' ? 'Trimite factura pozitivă' : 'Trimite factura și pe e-mail'}</Text><View style={[styles.invoiceEmailBadge, invoiceSendEmail && styles.invoiceEmailBadgeActive]}><Text style={[styles.invoiceEmailBadgeText, invoiceSendEmail && styles.invoiceEmailBadgeTextActive]}>{invoiceSendEmail ? 'ACTIV' : 'OPȚIONAL'}</Text></View></View><Text numberOfLines={2} style={styles.invoiceEmailText}>{invoicePromptOrder?.customer_email ? `Atașăm doar PDF-ul la ${invoicePromptOrder.customer_email}` : 'Comanda nu are o adresă de e-mail validă.'}</Text></View><View pointerEvents="none" style={styles.invoiceEmailControl}><Text style={[styles.invoiceEmailState, invoiceSendEmail && styles.invoiceEmailStateActive]}>{invoiceSendEmail ? 'DA' : 'NU'}</Text><Switch value={invoiceSendEmail} trackColor={{ false: '#CBD9E4', true: '#087FF5' }} thumbColor="#FFFFFF" ios_backgroundColor="#CBD9E4" /></View></TouchableOpacity>
            {invoicePromptOrder?.status === 'return_confirmed' ? <TouchableOpacity activeOpacity={0.78} disabled={!invoicePromptOrder.customer_email || Boolean(invoiceBusy)} onPress={() => setInvoiceSendReturnEmail((value) => !value)} style={[styles.invoiceEmailSwitch, invoiceSendReturnEmail && styles.invoiceEmailSwitchActive, !invoicePromptOrder.customer_email && styles.invoiceEmailSwitchDisabled]}><View style={[styles.invoiceEmailIcon, invoiceSendReturnEmail && styles.invoiceEmailIconActive]}><RotateCcw size={21} color={invoiceSendReturnEmail ? '#FFFFFF' : '#078F88'} /></View><View style={styles.invoiceEmailCopy}><View style={styles.invoiceEmailTitleRow}><Text style={styles.invoiceEmailTitle}>Trimite factura de retur</Text><View style={[styles.invoiceEmailBadge, invoiceSendReturnEmail && styles.invoiceEmailBadgeActive]}><Text style={[styles.invoiceEmailBadgeText, invoiceSendReturnEmail && styles.invoiceEmailBadgeTextActive]}>{invoiceSendReturnEmail ? 'ACTIV' : 'OPȚIONAL'}</Text></View></View><Text numberOfLines={2} style={styles.invoiceEmailText}>PDF separat, trimis la aceeași adresă a clientului.</Text></View><View pointerEvents="none" style={styles.invoiceEmailControl}><Text style={[styles.invoiceEmailState, invoiceSendReturnEmail && styles.invoiceEmailStateActive]}>{invoiceSendReturnEmail ? 'DA' : 'NU'}</Text><Switch value={invoiceSendReturnEmail} trackColor={{ false: '#CBD9E4', true: '#0F766E' }} thumbColor="#FFFFFF" ios_backgroundColor="#CBD9E4" /></View></TouchableOpacity> : null}
            <View style={styles.invoicePromptNotice}><BadgeCheck size={17} color="#34D399" /><Text style={styles.invoicePromptNoticeText}>{invoicePromptOrder?.status === 'return_confirmed' ? 'Documentele de retur se emit numai prin fluxul fiscal aprobat.' : 'SmartBill atribuie numărul real, iar factura emisă nu este regenerată când se modifică produsul din catalog.'}</Text></View>
            <View style={styles.invoicePromptActions}><TouchableOpacity disabled={Boolean(invoiceBusy)} style={styles.invoicePromptCancel} onPress={() => setInvoicePromptOrder(null)}><Text style={styles.invoicePromptCancelText}>Renunță</Text></TouchableOpacity><TouchableOpacity disabled={Boolean(invoiceBusy)} style={styles.invoicePromptConfirm} onPress={() => invoicePromptOrder && void issueInvoice(invoicePromptOrder, invoiceSendEmail, invoiceSendReturnEmail)}>{invoiceBusy ? <ActivityIndicator color="#FFFFFF" /> : <><FileCheck2 size={18} color="#FFFFFF" /><Text style={styles.invoicePromptConfirmText}>{invoicePromptOrder?.status === 'return_confirmed' ? 'Emite ambele' : invoiceSendEmail ? 'Emite și trimite' : 'Emite factura'}</Text></>}</TouchableOpacity></View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ProductPanelContent({ stats }: { stats: ShopProductStats }) {
  const product = stats.product;
  const imageUrl = product.images?.find((image) => Boolean(image.url))?.url;
  const currentPrice = Number(product.promotion_price ?? product.sale_price ?? product.price ?? 0);
  const regularPrice = Number(product.price || 0);
  const stockLabel = product.stock_mode === 'unlimited' ? 'Nelimitat' : `${Number(product.stock_quantity || 0)} buc.`;

  return <>
    <View style={styles.productHero}>
      {imageUrl ? <Image source={{ uri: imageUrl }} resizeMode="contain" style={styles.productHeroImage} /> : <View style={styles.productHeroImageFallback}><PackageOpen size={34} color="#087FF5" /></View>}
      <View style={styles.productHeroCopy}>
        <View style={styles.productHeroBadges}><View style={[styles.productStatusBadge, !product.is_active && styles.productStatusBadgeOff]}><Text style={[styles.productStatusBadgeText, !product.is_active && styles.productStatusBadgeTextOff]}>{product.is_active ? 'ACTIV' : 'OPRIT'}</Text></View>{product.is_featured ? <View style={styles.productFeaturedBadge}><Star size={10} color="#FBBF24" fill="#FBBF24" /><Text style={styles.productFeaturedBadgeText}>RECOMANDAT</Text></View> : null}</View>
        <Text style={styles.productHeroName}>{product.name}</Text>
        <View style={styles.productHeroCode}><Text style={styles.productHeroCodeLabel}>COD PRODUS</Text><Text selectable style={styles.productHeroSku}>{product.sku || product.supplier_product_code || 'FĂRĂ COD'}</Text></View>
        <View style={styles.productPriceLine}>{currentPrice < regularPrice ? <Text style={styles.productOldPrice}>{money(regularPrice)}</Text> : null}<Text style={styles.productCurrentPrice}>{money(currentPrice)}</Text></View>
      </View>
    </View>

    <View style={styles.productMetricGrid}>
      <ProductPanelMetric icon={<TrendingUp size={18} color="#34D399" />} color="#34D399" label="VÂNZĂRI" value={money(stats.revenue)} help={`${stats.orders_count} ${stats.orders_count === 1 ? 'comandă' : 'comenzi'}`} />
      <ProductPanelMetric icon={<ShoppingCart size={18} color="#087FF5" />} color="#087FF5" label="BUCĂȚI VÂNDUTE" value={String(stats.units_sold)} help="Cantitate totală" />
      <ProductPanelMetric icon={<Warehouse size={18} color="#FBBF24" />} color="#FBBF24" label="STOC" value={stockLabel} help={product.stock_available ? 'Disponibil pentru vânzare' : 'Indisponibil'} />
      <ProductPanelMetric icon={<Eye size={18} color="#087FF5" />} color="#087FF5" label="VIZUALIZĂRI" value={String(product.view_count || 0)} help={`${product.review_count || 0} recenzii`} />
    </View>

    <View style={styles.productInfoCard}>
      <View style={styles.productInfoHead}><Text style={styles.productInfoKicker}>IDENTITATE ȘI ACHIZIȚIE</Text><Text style={styles.productInfoTitle}>Date produs</Text></View>
      <ProductPanelRow label="Cod produs / SKU" value={product.sku || product.supplier_product_code || '—'} strong />
      <ProductPanelRow label="Categorie" value={product.category_name || 'Necategorizat'} />
      <ProductPanelRow label="Producător" value={product.manufacturer_name || 'Nespecificat'} />
      <ProductPanelRow label="Furnizor / sursă" value={product.source_name || product.source_domain || 'Nespecificat'} />
      <ProductPanelRow label="Cod furnizor" value={product.supplier_product_code || '—'} />
      <ProductPanelRow label="EAN" value={product.ean || '—'} />
      <ProductPanelRow label="Preț achiziție" value={money(product.cost_price)} strong />
      <ProductPanelRow label="Profit realizat" value={money(stats.profit)} strong positive={stats.profit >= 0} />
    </View>

    {product.short_description ? <View style={styles.productDescriptionCard}><Text style={styles.productDescriptionKicker}>DESCRIERE</Text><Text style={styles.productDescriptionTitle}>{product.description_title || 'Pe scurt'}</Text><Text style={styles.productDescriptionText}>{product.short_description}</Text></View> : null}

    <View style={styles.productInfoCard}>
      <View style={styles.productInfoHead}><Text style={styles.productInfoKicker}>ISTORIC RECENT</Text><Text style={styles.productInfoTitle}>Comenzi și vânzări</Text></View>
      {stats.orders.length ? stats.orders.slice(0, 5).map((sale) => <View key={sale.id} style={styles.productSaleRow}><View style={styles.productSaleIcon}><ShoppingCart size={15} color="#087FF5" /></View><View style={styles.productSaleCopy}><Text style={styles.productSaleOrder}>{sale.order_number}</Text><Text style={styles.productSaleMeta}>{sale.customer_display_name || sale.customer_name || 'Client'} · {dateTime(sale.created_at)}</Text></View><View style={styles.productSaleTotal}><Text style={styles.productSaleQty}>{sale.quantity}×</Text><Text style={styles.productSaleValue}>{money(sale.line_total)}</Text></View></View>) : <View style={styles.productPanelEmpty}><ShoppingCart size={18} color={Colors.textMuted} /><Text style={styles.productPanelEmptyText}>Produsul nu apare încă în nicio comandă.</Text></View>}
    </View>

    <View style={styles.productInfoCard}>
      <View style={styles.productInfoHead}><Text style={styles.productInfoKicker}>FEEDBACK CLIENȚI</Text><Text style={styles.productInfoTitle}>Recenzii · {product.review_average ? `${Number(product.review_average).toFixed(1)}/5` : 'fără notă'}</Text></View>
      {stats.reviews.length ? stats.reviews.slice(0, 3).map((review) => <View key={review.id} style={styles.productReview}><View style={styles.productReviewTop}><Text style={styles.productReviewName}>{review.customer_name || 'Client'}</Text><View style={styles.productReviewRating}><Star size={11} color="#FBBF24" fill="#FBBF24" /><Text style={styles.productReviewRatingText}>{review.rating}/5</Text></View></View><Text style={styles.productReviewText}>{review.message || 'Fără mesaj.'}</Text></View>) : <View style={styles.productPanelEmpty}><Star size={18} color={Colors.textMuted} /><Text style={styles.productPanelEmptyText}>Produsul nu are încă recenzii.</Text></View>}
    </View>
  </>;
}

function ProductPanelMetric({ icon, color, label, value, help }: { icon: React.ReactNode; color: string; label: string; value: string; help: string }) {
  return <View style={[styles.productMetric, { borderColor: `${color}35`, backgroundColor: `${color}0D` }]}><View style={[styles.productMetricIcon, { backgroundColor: `${color}19` }]}>{icon}</View><View style={styles.productMetricCopy}><Text style={[styles.productMetricLabel, { color }]}>{label}</Text><Text numberOfLines={1} style={styles.productMetricValue}>{value}</Text><Text numberOfLines={1} style={styles.productMetricHelp}>{help}</Text></View></View>;
}

function ProductPanelRow({ label, value, strong = false, positive = false }: { label: string; value: string; strong?: boolean; positive?: boolean }) {
  return <View style={styles.productPanelRow}><Text style={styles.productPanelRowLabel}>{label}</Text><Text style={[styles.productPanelRowValue, strong && styles.productPanelRowValueStrong, positive && styles.productPanelRowValuePositive]}>{value}</Text></View>;
}

function OrderStatusTimeline({ order }: { order: ShopOrder }) {
  const [reveal] = useState(() => new Animated.Value(0));
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  const terminalCurrent = terminalOrderStatuses.includes(order.status) ? orderStatuses.find((item) => item.value === order.status) : null;
  const visible = orderStatuses.filter((item) => mainOrderFlow.includes(item.value)).concat(terminalCurrent ? [terminalCurrent] : []);
  const flow = visible.filter((item) => mainOrderFlow.includes(item.value));
  const currentFlowIndex = flow.findIndex((item) => item.value === order.status);

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [order.id, order.status, history.length, reveal]);

  return <Animated.View style={[styles.timeline, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
    {visible.map((item, index) => {
      const StatusIcon = item.icon;
      const entry = [...history].reverse().find((historyEntry) => historyEntry.to_status === item.value);
      const flowIndex = flow.findIndex((flowItem) => flowItem.value === item.value);
      const reached = Boolean(entry) || item.value === order.status || (!terminalOrderStatuses.includes(order.status) && flowIndex >= 0 && currentFlowIndex >= 0 && flowIndex <= currentFlowIndex);
      const current = item.value === order.status;
      return <View key={item.value} style={styles.timelineRow}>
        <View style={styles.timelineRail}>
          <View style={[styles.timelineDot, reached && { backgroundColor: item.color, borderColor: item.color }, current && styles.timelineDotCurrent]}>
            <StatusIcon size={16} color={reached ? '#F7FAFD' : Colors.textMuted} strokeWidth={2.5} />
          </View>
          {index < visible.length - 1 ? <View style={[styles.timelineLine, reached && entry && { backgroundColor: `${item.color}88` }]} /> : null}
        </View>
        <View style={[styles.timelineCard, current && { borderColor: `${item.color}88`, backgroundColor: `${item.color}0F` }]}>
          <View style={styles.timelineTop}><Text style={[styles.timelineTitle, reached && { color: item.color }]}>{item.label}</Text>{current ? <Text style={[styles.timelineCurrent, { color: item.color }]}>ACUM</Text> : null}</View>
          <Text style={styles.timelineDescription}>{item.description}</Text>
          {entry ? <View style={styles.timelineMeta}><Text style={styles.timelineDate}>{dateTime(entry.created_at)}</Text>{entry.customer_notified ? <View style={styles.timelineMail}><Mail size={11} color="#34D399" /><Text style={styles.timelineMailText}>CLIENT NOTIFICAT</Text></View> : null}</View> : <Text style={styles.timelinePending}>{current ? 'Statusul curent' : 'Pas următor'}</Text>}
        </View>
      </View>;
    })}
  </Animated.View>;
}

function OrderMetricCard({ icon: Icon, color, label, value, help }: { icon: typeof Clock3; color: string; label: string; value: string; help: string }) {
  return <View style={[styles.metricCard, { borderColor: `${color}3D`, backgroundColor: `${color}0D` }]}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}1C` }]}><Icon size={17} color={color} strokeWidth={2.2} /></View>
    <View style={styles.metricCopy}><Text style={[styles.metricLabel, { color }]}>{label.toUpperCase()}</Text><Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.metricHelp} numberOfLines={2}>{help}</Text></View>
  </View>;
}

function FilterChip({ label, active, onPress, color = Colors.orange }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  return <TouchableOpacity activeOpacity={0.76} onPress={onPress} style={[styles.filterChip, active && { borderColor: color, backgroundColor: `${color}18` }]}>
    {active ? <Check size={12} color={color} strokeWidth={3} /> : null}
    <Text style={[styles.filterChipText, active && { color }]}>{label}</Text>
  </TouchableOpacity>;
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return <View style={styles.info}><View style={styles.infoHead}><Text style={styles.infoTitle}>{title.toUpperCase()}</Text></View>{lines.map((line, index) => <Text key={`${line}-${index}`} style={index === 0 ? styles.infoStrong : styles.infoText}>{line}</Text>)}</View>;
}

function DetailInfoRow({ label, value, strong = false }: { label: string; value?: string | null; strong?: boolean }) {
  return <View style={styles.detailInfoRow}><Text style={styles.detailInfoLabel}>{label}</Text><Text style={[styles.detailInfoValue, strong && styles.detailInfoValueStrong]}>{String(value || '').trim() || '—'}</Text></View>;
}

function ClientInfoBlock({ order, editing, canEdit, onToggle, name, phone, email, onNameChange, onPhoneChange, onEmailChange }: { order: ShopOrder; editing: boolean; canEdit: boolean; onToggle: () => void; name: string; phone: string; email: string; onNameChange: (value: string) => void; onPhoneChange: (value: string) => void; onEmailChange: (value: string) => void }) {
  const companyOrder = isCompanyOrder(order);
  return <View style={styles.info}>
    <View style={styles.infoHead}><View style={styles.infoTitleWithBadge}><Text style={styles.infoTitle}>CLIENT</Text><View style={[styles.customerTypeBadge, companyOrder && styles.customerTypeBadgeCompany]}><Text style={[styles.customerTypeBadgeText, companyOrder && styles.customerTypeBadgeTextCompany]}>{companyOrder ? 'PJ' : 'PF'}</Text></View></View>{canEdit ? <TouchableOpacity style={[styles.deliveryEditButton, editing && styles.deliveryEditButtonActive]} onPress={onToggle}>{editing ? <X size={14} color={Colors.orange} /> : <Pencil size={14} color={Colors.textPrimary} />}<Text style={[styles.deliveryEditButtonText, editing && styles.deliveryEditButtonTextActive]}>{editing ? 'Anulează' : 'Editează'}</Text></TouchableOpacity> : <Text style={styles.infoHeadHint}>BLOCATĂ DUPĂ FACTURARE</Text>}</View>
    {companyOrder ? <DetailInfoRow label="Denumire firmă" value={shopOrderCustomerDisplayName(order)} strong /> : null}
    {editing ? <>
      <CustomerEditRow label={companyOrder ? 'Persoană de contact' : 'Nume'} value={name} onChangeText={onNameChange} strong autoCapitalize="characters" />
      <CustomerEditRow label="Telefon" value={phone} onChangeText={onPhoneChange} keyboardType="phone-pad" />
      <CustomerEditRow label="E-mail" value={email} onChangeText={onEmailChange} keyboardType="email-address" autoCapitalize="none" />
      <Text style={styles.deliveryEditHelper}>Salvează comanda pentru a actualiza datele de contact.</Text>
    </> : <>
      <DetailInfoRow label={companyOrder ? 'Persoană de contact' : 'Nume'} value={companyOrder ? String(order.customer_contact_name || order.customer_name).toLocaleUpperCase('ro-RO') : shopOrderCustomerDisplayName(order)} strong={!companyOrder} />
      <DetailInfoRow label="Telefon" value={order.customer_phone} />
      <DetailInfoRow label="E-mail" value={order.customer_email || 'Fără e-mail'} />
    </>}
    {companyOrder ? <View style={styles.companyDetails}>
      <Text style={styles.companyDetailsTitle}>DATE FISCALE</Text>
      <DetailInfoRow label="CUI / CIF" value={order.company_cui} />
      <DetailInfoRow label="Registrul Comerțului" value={order.company_registration_number} />
      <DetailInfoRow label="Sediu social" value={order.company_address} />
    </View> : null}
    {!canEdit ? <Text style={styles.customerEditLocked}>Datele clientului nu mai pot fi schimbate după emiterea facturii.</Text> : null}
    <View style={styles.contactActions}>
      <TouchableOpacity style={styles.contactCall} activeOpacity={0.78} onPress={() => void callCustomer(order.customer_phone)}><Phone size={16} color="#172B40" /><Text style={styles.contactCallText}>Apelează</Text></TouchableOpacity>
      <TouchableOpacity style={styles.contactWhatsApp} activeOpacity={0.78} onPress={() => void openCustomerWhatsApp(order.customer_phone)}><WhatsAppLogo size={17} /><Text style={styles.contactWhatsAppText}>WhatsApp</Text></TouchableOpacity>
    </View>
  </View>;
}

function CustomerEditRow({ label, value, onChangeText, strong = false, keyboardType = 'default', autoCapitalize = 'sentences' }: { label: string; value: string; onChangeText: (value: string) => void; strong?: boolean; keyboardType?: 'default' | 'phone-pad' | 'email-address'; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters' }) {
  return <View style={styles.deliveryEditRow}><Text style={styles.detailInfoLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={false} style={[styles.deliveryInput, strong && styles.deliveryInputStrong]} placeholder="Completează" placeholderTextColor={Colors.textMuted} /></View>;
}

function DeliveryEditRow({ label, value, onChangeText, strong = false }: { label: string; value: string; onChangeText: (value: string) => void; strong?: boolean }) {
  return <View style={styles.deliveryEditRow}><Text style={styles.detailInfoLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.deliveryInput, strong && styles.deliveryInputStrong]} placeholder="Completează" placeholderTextColor={Colors.textMuted} /></View>;
}

function DeliveryInfoBlock({ order, editing, canEdit, onToggle, address, city, county, postalCode, onAddressChange, onCityChange, onCountyChange, onPostalCodeChange }: { order: ShopOrder; editing: boolean; canEdit: boolean; onToggle: () => void; address: string; city: string; county: string; postalCode: string; onAddressChange: (value: string) => void; onCityChange: (value: string) => void; onCountyChange: (value: string) => void; onPostalCodeChange: (value: string) => void }) {
  return <View style={styles.info}>
    <View style={styles.infoHead}><Text style={styles.infoTitle}>LIVRARE</Text>{canEdit ? <TouchableOpacity style={[styles.deliveryEditButton, editing && styles.deliveryEditButtonActive]} onPress={onToggle}>{editing ? <X size={14} color={Colors.orange} /> : <Pencil size={14} color={Colors.textPrimary} />}<Text style={[styles.deliveryEditButtonText, editing && styles.deliveryEditButtonTextActive]}>{editing ? 'Anulează' : 'Editează'}</Text></TouchableOpacity> : <Text style={styles.infoHeadHint}>BLOCATĂ DUPĂ FACTURARE</Text>}</View>
    {editing ? <><DeliveryEditRow label="Adresă completă" value={address} onChangeText={onAddressChange} strong /><DeliveryEditRow label="Localitate" value={city} onChangeText={onCityChange} /><DeliveryEditRow label="Județ" value={county} onChangeText={onCountyChange} /><DeliveryEditRow label="Cod poștal" value={postalCode} onChangeText={onPostalCodeChange} /><Text style={styles.deliveryEditHelper}>Salvează modificările folosind butonul „Salvează” din partea de sus.</Text></> : <><DetailInfoRow label="Adresă completă" value={order.address} strong /><DetailInfoRow label="Localitate" value={order.city} /><DetailInfoRow label="Județ" value={order.county} /><DetailInfoRow label="Cod poștal" value={order.postal_code} /></>}
    <DetailInfoRow label="Metodă livrare" value={order.shipping_method_name} />
    <DetailInfoRow label="Cost livrare" value={money(order.shipping_cost)} />
    <View style={[styles.orderPaymentRow, order.payment_method === 'card' ? styles.orderPaymentRowCard : styles.orderPaymentRowCash]}>
      <View style={[styles.orderPaymentIcon, order.payment_method === 'card' ? styles.orderPaymentIconCard : styles.orderPaymentIconCash]}>{order.payment_method === 'card' ? <CreditCard size={18} color="#087FF5" /> : <HandCoins size={18} color="#087FF5" />}</View>
      <View style={styles.orderPaymentCopy}><Text style={styles.orderPaymentLabel}>METODĂ DE PLATĂ</Text><Text style={styles.orderPaymentValue}>{order.payment_method === 'card' ? 'Card online' : 'Ramburs la curier'}</Text></View>
    </View>
    {!canEdit ? <Text style={styles.customerEditLocked}>Datele de livrare nu mai pot fi schimbate după emiterea facturii.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 }, state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 24, backgroundColor: Theme.colors.surface.base, marginTop: 16 }, stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 }, error: { color: Theme.colors.state.error, fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center', paddingHorizontal: 22 }, retry: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.orangeDim }, retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 7, marginBottom: 10 }, search: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 17, paddingHorizontal: 13, backgroundColor: Theme.colors.surface.base }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11 }, refresh: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 17, backgroundColor: Theme.colors.surface.muted },
  filterButton: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 17, backgroundColor: Theme.colors.surface.muted }, filterButtonActive: { borderColor: Theme.colors.border.focus, backgroundColor: Colors.orangeDim }, filterBadge: { position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 4, backgroundColor: Colors.orange }, filterBadgeText: { color: '#17110D', fontFamily: 'Inter-Bold', fontSize: 8 },
  filtersPanel: { overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 24, padding: 15, backgroundColor: Theme.colors.surface.base, marginBottom: 11 }, filtersHead: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DEE8F0', paddingBottom: 10, marginBottom: 12 }, filtersTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, filtersResult: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 3 }, resetFilters: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10, paddingVertical: 8 }, resetFiltersDisabled: { color: Colors.textMuted, opacity: 0.45 }, filterGroupLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8, marginTop: 4, marginBottom: 8 }, filterChipsContent: { gap: 7, paddingRight: 12, paddingBottom: 12 }, filterChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 12 }, filterChip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 999, paddingHorizontal: 12, backgroundColor: Theme.colors.surface.muted }, filterChipText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 9 },
  statsScroller: { marginBottom: 10 }, stats: { flexDirection: 'row', gap: 7, paddingRight: 10 }, metricCard: { width: 156, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden', borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 9 }, metricIcon: { width: 36, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, metricCopy: { flex: 1, minWidth: 0 }, metricLabel: { fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.65 }, metricValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 2 }, metricHelp: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 7.5, lineHeight: 10, marginTop: 2 },
  orderCard: { minHeight: 134, gap: 11, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.strong, borderRadius: 25, padding: 13, backgroundColor: Theme.colors.surface.base, marginBottom: 10, shadowColor: Theme.colors.shadow.color, shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 4 }, orderCardMain: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11 }, orderIcon: { width: 52, height: 52, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 17 }, orderCopy: { flex: 1, minWidth: 0 }, orderTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, orderIdentity: { minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }, orderNumber: { flexShrink: 1, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 12.5, lineHeight: 16 }, customerTypeBadge: { minWidth: 29, height: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 99, paddingHorizontal: 6, backgroundColor: Theme.colors.surface.brandSoft }, customerTypeBadgeCompany: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.cyanSoft }, customerTypeBadgeText: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.5 }, customerTypeBadgeTextCompany: { color: Theme.colors.state.success }, status: { fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.5 }, customer: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Medium', fontSize: 10, marginTop: 6 }, orderBottom: { width: '100%', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Theme.colors.border.strong, paddingTop: 10 }, orderDateMeta: { flex: 1, minWidth: 0, minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 11, paddingHorizontal: 8, backgroundColor: Theme.colors.surface.subtle }, orderDate: { flexShrink: 1, color: Theme.colors.text.secondary, fontFamily: 'Inter-SemiBold', fontSize: 8.5 }, paymentMethodChip: { height: 31, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 99, paddingHorizontal: 8 }, paymentMethodCard: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft }, paymentMethodCash: { borderColor: Theme.colors.border.strong, backgroundColor: Theme.colors.surface.cyanSoft }, paymentMethodText: { fontFamily: 'Inter-Bold', fontSize: 8 }, paymentMethodCardText: { color: Theme.colors.brand.primaryText }, paymentMethodCashText: { color: Theme.colors.brand.primaryText }, orderTotal: { flexShrink: 0, color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 11.5 }, invoiceQuick: { width: 40, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.strong, borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft }, invoiceQuickIssued: { borderColor: Theme.colors.state.success, backgroundColor: Theme.colors.state.successSoft }, orderArrow: { width: 42, height: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft },
  empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: Theme.colors.surface.base }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 13 }, emptyText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 5 }, emptyReset: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 15, backgroundColor: Colors.orangeDim, marginTop: 13 }, emptyResetText: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 9 },
  modalSafe: { flex: 1, backgroundColor: Colors.bg }, modalHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#D8E5EF', paddingHorizontal: 12, backgroundColor: Theme.colors.surface.base }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.muted }, modalHeaderCopy: { flex: 1 }, modalKicker: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1 }, modalTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 2 }, save: { minWidth: 96, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, backgroundColor: Colors.orange }, saveText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 }, disabled: { opacity: 0.55 }, modalContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  productPanelLayer: { ...StyleSheet.absoluteFill, zIndex: 40, elevation: 40, backgroundColor: Theme.colors.surface.base },
  productPanelHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#D8E5EF', paddingHorizontal: 12, backgroundColor: Theme.colors.surface.base },
  productPanelBack: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 14, backgroundColor: Theme.colors.surface.muted },
  productPanelHeaderCopy: { flex: 1, minWidth: 0 }, productPanelKicker: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1 }, productPanelTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 2 }, productPanelHint: { color: '#7F8993', fontFamily: 'Inter-Regular', fontSize: 7.5, marginTop: 2 },
  productPanelMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(56,189,248,.11)' },
  productHeroCode: { alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(56,189,248,.34)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: 'rgba(56,189,248,.08)', marginTop: 7 }, productHeroCodeLabel: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.75 },
  productPanelContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 14 },
  productPanelState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }, productPanelLoader: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(56,189,248,.28)', borderRadius: 19, backgroundColor: 'rgba(56,189,248,.09)' }, productPanelErrorIcon: { borderColor: 'rgba(251,113,133,.3)', backgroundColor: 'rgba(251,113,133,.09)' }, productPanelStateTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 15 }, productPanelStateText: { maxWidth: 340, color: '#8F888F', fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 6 }, productPanelRetry: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingHorizontal: 16, backgroundColor: Theme.colors.brand.primaryAction, marginTop: 16 }, productPanelRetryText: { color: '#F7FAFD', fontFamily: 'Inter-Bold', fontSize: 9 },
  productHero: { minHeight: 150, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(56,189,248,.24)', borderRadius: 24, padding: 14, backgroundColor: Theme.colors.surface.muted }, productHeroImage: { width: 116, height: 116, flexShrink: 0, borderRadius: 20, backgroundColor: Theme.colors.surface.muted }, productHeroImageFallback: { width: 116, height: 116, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(56,189,248,.09)' }, productHeroCopy: { flex: 1, minWidth: 0 }, productHeroBadges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 8 }, productStatusBadge: { minHeight: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 8, backgroundColor: 'rgba(52,211,153,.13)' }, productStatusBadgeOff: { backgroundColor: 'rgba(251,113,133,.13)' }, productStatusBadgeText: { color: Theme.colors.state.success, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.7 }, productStatusBadgeTextOff: { color: Theme.colors.state.error }, productFeaturedBadge: { minHeight: 21, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, backgroundColor: 'rgba(251,191,36,.1)' }, productFeaturedBadgeText: { color: Theme.colors.state.warning, fontFamily: 'Inter-Bold', fontSize: 6.3, letterSpacing: 0.45 }, productHeroName: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 15, lineHeight: 20 }, productHeroSku: { color: '#818991', fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 5 }, productPriceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 7, marginTop: 10 }, productOldPrice: { color: '#777179', fontFamily: 'Inter-SemiBold', fontSize: 9, textDecorationLine: 'line-through', textDecorationColor: '#09BFD9' }, productCurrentPrice: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 15 },
  productMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, productMetric: { minWidth: 150, flexGrow: 1, flexBasis: '47%', minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden', borderWidth: 1, borderRadius: 18, padding: 10 }, productMetricIcon: { width: 38, height: 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, productMetricCopy: { flex: 1, minWidth: 0 }, productMetricLabel: { fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.55 }, productMetricValue: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 3 }, productMetricHelp: { color: Theme.colors.text.muted, fontFamily: 'Inter-Regular', fontSize: 7.5, marginTop: 2 },
  productInfoCard: { overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, padding: 14, backgroundColor: Theme.colors.surface.base, marginTop: 10 }, productInfoHead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingBottom: 10, marginBottom: 2 }, productInfoKicker: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.8 }, productInfoTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 3 }, productPanelRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingVertical: 8 }, productPanelRowLabel: { flexShrink: 0, color: '#817B83', fontFamily: 'Inter-Medium', fontSize: 9 }, productPanelRowValue: { flex: 1, color: '#C9C2BC', fontFamily: 'Inter-SemiBold', fontSize: 9.5, lineHeight: 14, textAlign: 'right' }, productPanelRowValueStrong: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Bold', fontSize: 10.5 }, productPanelRowValuePositive: { color: Theme.colors.state.success },
  productDescriptionCard: { borderWidth: 1, borderColor: 'rgba(251,146,60,.2)', borderRadius: 21, padding: 14, backgroundColor: 'rgba(251,146,60,.055)', marginTop: 10 }, productDescriptionKicker: { color: Theme.colors.brand.secondary, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.8 }, productDescriptionTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 4 }, productDescriptionText: { color: '#A59DA4', fontFamily: 'Inter-Regular', fontSize: 9.5, lineHeight: 16, marginTop: 7 },
  productSaleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingVertical: 8 }, productSaleIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(56,189,248,.1)' }, productSaleCopy: { flex: 1, minWidth: 0 }, productSaleOrder: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Bold', fontSize: 9.5 }, productSaleMeta: { color: '#7E7880', fontFamily: 'Inter-Regular', fontSize: 7.5, marginTop: 3 }, productSaleTotal: { alignItems: 'flex-end', gap: 2 }, productSaleQty: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 7.5 }, productSaleValue: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 9.5 },
  productReview: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingVertical: 11 }, productReviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, productReviewName: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 9.5 }, productReviewRating: { flexDirection: 'row', alignItems: 'center', gap: 4 }, productReviewRatingText: { color: Theme.colors.state.warning, fontFamily: 'Inter-Bold', fontSize: 8 }, productReviewText: { color: '#999199', fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 6 }, productPanelEmpty: { minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 7 }, productPanelEmptyText: { color: '#817A82', fontFamily: 'Inter-Regular', fontSize: 9, textAlign: 'center' },
  detailLoading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 15, backgroundColor: Colors.orangeDim, marginBottom: 9 }, detailLoadingText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 9 }, detailError: { justifyContent: 'space-between', borderWidth: 1, borderColor: Theme.colors.state.error, paddingHorizontal: 11, backgroundColor: Theme.colors.state.errorSoft }, detailErrorText: { flex: 1, color: Theme.colors.state.error, fontFamily: 'Inter-SemiBold', fontSize: 9 }, detailRetry: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, backgroundColor: '#B94759' }, detailRetryText: { color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 8 },
  info: { borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 20, padding: 15, backgroundColor: Theme.colors.surface.base, marginBottom: 9 },
  infoHead: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DEE8F0', paddingBottom: 8, marginBottom: 4 },
  infoTitle: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.9 }, infoTitleWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 }, companyDetails: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D8E5EF', paddingTop: 8, marginTop: 8 }, companyDetailsTitle: { color: Theme.colors.state.success, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8, marginBottom: 2 },
  infoHeadHint: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.6 },
  infoStrong: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 }, infoText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 2 },
  detailInfoRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingVertical: 8 },
  detailInfoLabel: { flexShrink: 0, color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 9 },
  detailInfoValue: { flex: 1, color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10, lineHeight: 15, textAlign: 'right' },
  detailInfoValueStrong: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 },
  deliveryEditButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 11, paddingHorizontal: 9, backgroundColor: Theme.colors.surface.muted },
  deliveryEditButtonActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  deliveryEditButtonText: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 8 },
  deliveryEditButtonTextActive: { color: Colors.orange },
  deliveryEditRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#22C55E55', paddingVertical: 6 },
  deliveryInput: { flex: 1, minHeight: 38, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 11, paddingHorizontal: 10, color: Colors.textPrimary, backgroundColor: Theme.colors.surface.subtle, fontFamily: 'Inter-SemiBold', fontSize: 10, textAlign: 'right' },
  orderPaymentRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 10, marginTop: 10 },
  orderPaymentRowCard: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.brandSoft }, orderPaymentRowCash: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.cyanSoft },
  orderPaymentIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, orderPaymentIconCard: { backgroundColor: Theme.colors.surface.brandSoft }, orderPaymentIconCash: { backgroundColor: Theme.colors.surface.brandSoft },
  orderPaymentCopy: { flex: 1, minWidth: 0 }, orderPaymentLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 }, orderPaymentValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 3 },
  deliveryInputStrong: { fontFamily: 'Inter-Bold', fontSize: 11 },
  deliveryEditHelper: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12, borderRadius: 10, padding: 9, backgroundColor: Colors.orangeDim, marginTop: 8 },
  customerEditLocked: { color: Theme.colors.state.error, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12, borderRadius: 10, padding: 9, backgroundColor: Theme.colors.state.errorSoft, marginTop: 9 },
  contactActions: { flexDirection: 'row', gap: 8, paddingTop: 12 },
  contactCall: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: Theme.colors.surface.muted },
  contactCallText: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Bold', fontSize: 10 },
  contactWhatsApp: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: Theme.colors.state.success, borderRadius: 14, backgroundColor: Theme.colors.surface.cyanSoft },
  contactWhatsAppText: { color: '#51D88A', fontFamily: 'Inter-Bold', fontSize: 10 },
  sectionLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8, marginTop: 15, marginBottom: 8 },
  productsSectionHead: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 11, marginBottom: 8 },
  productsSectionCopy: { flex: 1, minWidth: 0 }, productsSectionLabel: { marginTop: 0, marginBottom: 3 }, productsSectionHelp: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12 },
  addOrderItemButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 12, backgroundColor: Theme.colors.brand.primary }, addOrderItemButtonText: { color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 9 },
  items: { overflow: 'hidden', borderRadius: 18, backgroundColor: Theme.colors.surface.base }, item: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DEE8F0', padding: 11 }, itemImage: { width: 48, height: 48, borderRadius: 15, backgroundColor: Theme.colors.background.canvas }, itemQty: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.orangeDim }, itemQtyText: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10 }, itemCopy: { flex: 1, minWidth: 0 }, itemNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, itemName: { flexShrink: 1, color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, newItemBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#2563EB22' }, newItemBadgeText: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.7 }, itemSku: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, itemTotal: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, itemOpen: { width: 39, height: 39, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 14, backgroundColor: Theme.colors.surface.muted },
  itemUnitPrices: { minHeight: 15, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 3 }, itemUnitPrice: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 8 }, itemOldPrice: { color: Colors.textMuted, fontFamily: 'Inter-SemiBold', fontSize: 8, textDecorationLine: 'line-through', textDecorationColor: Colors.orange }, itemDiscountPrice: { color: Theme.colors.state.success, fontFamily: 'Inter-Bold', fontSize: 8 }, itemTotals: { alignItems: 'flex-end', gap: 2 }, itemOldTotal: { color: Colors.textMuted, fontFamily: 'Inter-SemiBold', fontSize: 8, textDecorationLine: 'line-through', textDecorationColor: Colors.orange }, itemDiscountTotal: { color: Theme.colors.state.success, fontFamily: 'Inter-Bold', fontSize: 10 },
  itemEditable: { alignItems: 'flex-start', flexWrap: 'wrap', paddingVertical: 13 },
  itemEditRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  itemChangeButton: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 12, paddingHorizontal: 10, backgroundColor: Theme.colors.surface.brandSoft },
  itemChangeText: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 8.5 },
  removeNewItemButton: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.state.errorSoft }, removeNewItemText: { color: Theme.colors.state.error },
  itemPriceField: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 12, paddingHorizontal: 9, backgroundColor: Theme.colors.surface.brandSoft },
  itemPriceLabel: { color: '#B8A18D', fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.4 },
  itemPriceInput: { width: 74, paddingVertical: 0, color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 12, textAlign: 'right' },
  fieldLocked: { opacity: 0.48 },
  itemPriceCurrency: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 9 },
  shippingCostEditor: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 18, padding: 12, backgroundColor: Theme.colors.surface.brandSoft, marginTop: 9 },
  returnShippingChoice: { borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 18, padding: 12, backgroundColor: Theme.colors.surface.brandSoft, marginTop: 9, gap: 10 },
  returnShippingChoiceTitle: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.7 },
  returnShippingChoiceRow: { flexDirection: 'row', gap: 8 },
  returnShippingChoiceButton: { flex: 1, minHeight: 43, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 13, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.colors.surface.base },
  returnShippingChoiceButtonActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.brandSoft },
  radioActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.brand.primaryAction },
  returnShippingChoiceText: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 },
  returnShippingAmountRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  returnShippingAmountLabel: { flex: 1, color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 0.55 },
  returnShippingChoiceHelp: { color: '#A89DB2', fontFamily: 'Inter-Regular', fontSize: 8.5, lineHeight: 13 },
  shippingCostCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  shippingCostLabel: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.6 },
  shippingCostHelp: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 7.5, marginTop: 3 },
  shippingCostField: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 10, backgroundColor: Theme.colors.surface.subtle },
  shippingCostInput: { width: 72, paddingVertical: 0, color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 12, textAlign: 'right' },
  shippingCostCurrency: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 9 },
  itemCorrectionHint: { color: Theme.colors.state.info, fontFamily: 'Inter-Regular', fontSize: 8.5, lineHeight: 13, borderRadius: 13, padding: 10, backgroundColor: Theme.colors.surface.brandSoft, marginTop: 8 },
  productPickerBackdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: Theme.colors.overlay.scrim },
  productPickerPanel: { width: '100%', maxWidth: 620, maxHeight: '86%', alignSelf: 'center', overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 28, padding: 16, backgroundColor: Theme.colors.surface.base },
  productPickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productPickerKicker: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.9 },
  productPickerTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 21, marginTop: 4 },
  productPickerClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.muted },
  productPickerSearch: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, paddingHorizontal: 12, backgroundColor: Theme.colors.background.canvas, marginTop: 14 },
  productPickerSearchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  productPickerResults: { gap: 8, paddingTop: 12, paddingBottom: 8 },
  productPickerResult: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 16, padding: 9, backgroundColor: Theme.colors.surface.muted },
  productPickerImage: { width: 52, height: 52, borderRadius: 13, backgroundColor: Theme.colors.background.canvas },
  productPickerImageFallback: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft },
  productPickerCopy: { flex: 1, minWidth: 0 },
  productPickerName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10.5 },
  productPickerMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 },
  productPickerPrice: { alignItems: 'flex-end' },
  productPickerPriceLabel: { color: '#8DA9C7', fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.5 },
  productPickerPriceValue: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 11, marginTop: 4 },
  productPickerEmpty: { alignItems: 'center', gap: 9, paddingVertical: 26 },
  productPickerEmptyText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, textAlign: 'center', paddingVertical: 12 },
  replacementPrompt: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.base },
  replacementPromptLogo: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.brandSoft },
  replacementTransportPrompt: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.brandSoft },
  replacementTransportLogo: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.brandSoft },
  replacementProduct: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, padding: 10, backgroundColor: Theme.colors.surface.muted, marginTop: 15 },
  replacementProductImage: { width: 54, height: 54, borderRadius: 13, backgroundColor: Theme.colors.background.canvas },
  replacementProductFallback: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft },
  replacementProductCopy: { flex: 1, minWidth: 0 },
  replacementProductName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11.5 },
  replacementProductMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8.5, marginTop: 5 },
  replacementMoneyField: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: Theme.colors.surface.subtle, marginTop: 12 },
  replacementMoneyLabel: { flex: 1, color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.7 },
  replacementMoneyInputWrap: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 10, backgroundColor: Theme.colors.surface.brandSoft },
  replacementMoneyInput: { width: 94, paddingVertical: 0, color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 16, textAlign: 'right' },
  replacementQuantityInput: { width: 64, paddingVertical: 0, color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 16, textAlign: 'right' },
  replacementMoneyCurrency: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 10 },
  totals: { gap: 9, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 20, padding: 15, backgroundColor: Theme.colors.surface.subtle, marginTop: 9 },
  totalRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  totalLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 11 },
  totalValue: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12, fontVariant: ['tabular-nums'] },
  discountLabel: { color: Theme.colors.state.success, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  discountValue: { color: Theme.colors.state.success, fontFamily: 'Inter-Bold', fontSize: 12, fontVariant: ['tabular-nums'] },
  grandTotal: { borderTopWidth: 1, borderTopColor: '#D5E2EC', marginTop: 2, paddingTop: 12 },
  grandTotalLabel: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 },
  grandTotalValue: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 17, fontVariant: ['tabular-nums'] },
  invoicePanel: { minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, padding: 13, backgroundColor: Theme.colors.surface.muted, marginTop: 10 }, invoicePanelIssued: { borderColor: Theme.colors.state.success, backgroundColor: Theme.colors.surface.muted }, invoicePanelIcon: { width: 46, height: 46, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.muted }, invoicePanelCopy: { flex: 1, minWidth: 0 }, invoicePanelKicker: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.9 }, invoicePanelTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 4 }, invoicePanelText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8.5, lineHeight: 13, marginTop: 4 }, invoicePanelButton: { minWidth: 84, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 15, paddingHorizontal: 12, backgroundColor: Colors.orange }, invoicePanelButtonIssued: { backgroundColor: '#14865A' }, invoicePanelButtonText: { color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 9 },
  invoicePromptBackdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: Theme.colors.overlay.scrim }, invoicePrompt: { width: '100%', maxWidth: 510, maxHeight: '94%', alignSelf: 'center', overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 31, padding: 20, backgroundColor: Theme.colors.surface.brandSoft, shadowColor: Theme.colors.shadow.color, shadowOpacity: 0.5, shadowRadius: 28, shadowOffset: { width: 0, height: 18 }, elevation: 14 }, invoicePromptScroll: { paddingBottom: 2 }, invoicePromptGlow: { position: 'absolute', width: 190, height: 190, borderRadius: 999, right: -80, top: -95, backgroundColor: Theme.colors.surface.brandSoft }, invoicePromptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, invoicePromptLogo: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 18, backgroundColor: Theme.colors.surface.brandSoft }, invoicePromptClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Theme.colors.surface.muted }, invoicePromptEyebrow: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 1, marginTop: 18 }, invoicePromptTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 25, letterSpacing: -0.5, marginTop: 6 }, invoicePromptSubtitle: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 8 }, invoicePromptSummary: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 19, padding: 14, backgroundColor: Theme.colors.surface.base, marginTop: 16 }, invoicePromptSummaryRight: { alignItems: 'flex-end' }, invoicePromptSummaryLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 }, invoicePromptSummaryValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 4 }, invoicePromptSummaryTotal: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 4 }, invoiceEmailSwitch: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: Theme.colors.surface.base, marginTop: 11, shadowColor: Theme.colors.shadow.color, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, invoiceEmailSwitchActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.brandSoft }, invoiceEmailSwitchDisabled: { opacity: 0.48 }, invoiceEmailIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 16, backgroundColor: Theme.colors.surface.brandSoft }, invoiceEmailIconActive: { borderColor: Theme.colors.brand.secondary, backgroundColor: Theme.colors.brand.primaryAction }, invoiceEmailCopy: { flex: 1, minWidth: 0 }, invoiceEmailTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, invoiceEmailTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 12.5 }, invoiceEmailBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: Theme.colors.surface.muted }, invoiceEmailBadgeActive: { backgroundColor: Theme.colors.surface.brandSoft }, invoiceEmailBadgeText: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.55 }, invoiceEmailBadgeTextActive: { color: '#A54E16' }, invoiceEmailText: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 8.5, lineHeight: 13, marginTop: 5 }, invoiceEmailControl: { alignItems: 'center', gap: 4 }, invoiceEmailState: { color: Theme.colors.text.muted, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.6 }, invoiceEmailStateActive: { color: Theme.colors.brand.primaryText }, invoicePromptNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 11, backgroundColor: Theme.colors.state.successSoft, marginTop: 10 }, invoicePromptNoticeText: { flex: 1, color: Theme.colors.state.success, fontFamily: 'Inter-SemiBold', fontSize: 8.5, lineHeight: 13 }, invoicePromptActions: { flexDirection: 'row', gap: 9, marginTop: 15 }, invoicePromptCancel: { flex: 0.8, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, backgroundColor: Theme.colors.surface.muted }, invoicePromptCancelText: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 10 }, invoicePromptConfirm: { flex: 1.3, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 17, backgroundColor: Colors.orange, shadowColor: Colors.orange, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, invoicePromptConfirmText: { color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 10 },
  timeline: { overflow: 'hidden', borderRadius: 22, padding: 14, backgroundColor: Theme.colors.surface.base }, timelineRow: { flexDirection: 'row', alignItems: 'stretch', gap: 11 }, timelineRail: { width: 38, alignItems: 'center' }, timelineDot: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 12, backgroundColor: Theme.colors.surface.muted }, timelineDotCurrent: { shadowColor: Theme.colors.brand.primary, shadowOpacity: 0.28, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, timelineLine: { width: 2, flex: 1, minHeight: 30, borderRadius: 99, backgroundColor: Theme.colors.surface.muted, marginVertical: 4 }, timelineCard: { flex: 1, minHeight: 78, borderWidth: 1, borderColor: 'transparent', borderRadius: 17, padding: 12, marginBottom: 8, backgroundColor: Theme.colors.surface.muted }, timelineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, timelineTitle: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 11 }, timelineCurrent: { fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 }, timelineDescription: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 4 }, timelineMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }, timelineDate: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 8 }, timelineMail: { flexDirection: 'row', alignItems: 'center', gap: 4 }, timelineMailText: { color: Theme.colors.state.successBright, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.45 }, timelinePending: { color: Colors.textMuted, fontFamily: 'Inter-SemiBold', fontSize: 7, marginTop: 8 },
  statusPicker: { overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 22, padding: 12, backgroundColor: Theme.colors.surface.base }, statusTrackRow: { minHeight: 64, flexDirection: 'row', alignItems: 'stretch', gap: 9 }, statusTrackRail: { width: 28, alignItems: 'center' }, statusTrackDot: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 10, backgroundColor: Theme.colors.surface.muted }, statusTrackIndex: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7 }, statusTrackLine: { width: 2, flex: 1, minHeight: 25, borderRadius: 99, backgroundColor: Theme.colors.surface.muted, marginVertical: 3 }, statusOption: { flex: 1, minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 16, padding: 8, backgroundColor: Theme.colors.surface.subtle, marginBottom: 7 }, statusOptionLocked: { opacity: 0.46 }, statusOptionIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, statusOptionCopy: { flex: 1, minWidth: 0 }, statusOptionTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, statusOptionText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12, marginTop: 2 }, radio: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 99 },
  notifyCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 20, padding: 12, backgroundColor: Theme.colors.surface.base, marginTop: 10 }, notifyCardActive: { borderColor: Colors.orange, backgroundColor: Theme.colors.surface.brandSoft }, notifyCardDisabled: { opacity: 0.5 }, notifyIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.orangeDim }, notifyCopy: { flex: 1, minWidth: 0 }, notifyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, notifyText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 13, marginTop: 4 }, checkbox: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 8, backgroundColor: Theme.colors.surface.base }, checkboxActive: { borderColor: Colors.orange, backgroundColor: Colors.orange },
  currentStatusButton: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 18, padding: 11, backgroundColor: Theme.colors.surface.brandSoft, marginTop: 8 }, currentStatusButtonDisabled: { opacity: 0.48 }, currentStatusIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft }, currentStatusCopy: { flex: 1, minWidth: 0 }, currentStatusTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 10 }, currentStatusText: { color: '#8DA9C7', fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12, marginTop: 3 }, currentStatusAction: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.6 },
  cancellationReasonCard: { borderWidth: 1, borderColor: Theme.colors.state.error, borderRadius: 21, padding: 13, backgroundColor: Theme.colors.surface.muted, marginTop: 10 }, cancellationReasonHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, cancellationReasonKicker: { color: Theme.colors.state.error, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 }, cancellationReasonTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11, marginTop: 2 }, cancellationReasonInput: { minHeight: 94, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, padding: 12, color: Colors.textPrimary, backgroundColor: Theme.colors.surface.base, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, textAlignVertical: 'top', marginTop: 11 }, cancellationReasonInputLocked: { opacity: 0.72 }, cancellationReasonHelp: { color: '#AA8991', fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 13, marginTop: 8 },
  returnRequestCard: { borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 21, padding: 13, backgroundColor: Theme.colors.surface.muted, marginTop: 10 }, returnRequestKicker: { color: Theme.colors.data.returns, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 }, returnRequestInput: { minHeight: 50, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, paddingHorizontal: 12, color: Colors.textPrimary, backgroundColor: Theme.colors.surface.base, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 9 }, returnAmounts: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#D8E5EF', paddingTop: 12, marginTop: 12 }, returnAmountRight: { alignItems: 'flex-end' }, returnAmountLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.65 }, returnAmountCost: { color: Theme.colors.state.error, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 4 }, returnAmountValue: { color: Theme.colors.state.success, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 4 }, returnRequestHelp: { color: '#B794AC', fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 13, marginTop: 9 },
  returnDecisionCard: { marginTop: 8, padding: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.base }, returnDecisionCardPartial: { borderColor: '#F59E0B88', backgroundColor: Theme.colors.surface.base }, returnDecisionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 }, returnDecisionName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, returnDecisionMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, returnDecisionActions: { flexDirection: 'row', gap: 5 }, returnDecisionButton: { minHeight: 38, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: Theme.colors.border.default, justifyContent: 'center' }, returnDecisionAccept: { backgroundColor: Theme.colors.surface.cyanSoft, borderColor: Theme.colors.border.default }, returnDecisionRefuse: { backgroundColor: Theme.colors.state.errorSoft, borderColor: Theme.colors.state.error }, returnDecisionButtonText: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 8 }, returnQuantityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 }, returnQuantitySummary: { flex: 1, gap: 3 }, returnQuantityAccepted: { color: Theme.colors.brand.cyanStrong, fontFamily: 'Inter-Bold', fontSize: 9 }, returnQuantityRefused: { color: '#FB9AAD', fontFamily: 'Inter-Bold', fontSize: 9 }, returnQtyButton: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.surface.muted }, returnQtyValue: { minWidth: 26, textAlign: 'center', color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 999, paddingHorizontal: 12, backgroundColor: Theme.colors.surface.base }, chipActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim }, chipText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 9 }, chipTextActive: { color: Colors.orange }, notes: { minHeight: 100, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, padding: 13, color: Colors.textPrimary, backgroundColor: Theme.colors.surface.subtle, fontFamily: 'Inter-Regular', fontSize: 11, textAlignVertical: 'top' },
});
