import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import Reanimated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleEllipsis,
  CreditCard,
  FileText,
  FileCog,
  Factory,
  FolderTree,
  House,
  ImageIcon,
  LockKeyhole,
  LogOut,
  MailCheck,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  BadgePercent,
  Building2,
  ShoppingCart,
  Sparkles,
  Tags,
  Trash2,
  Truck,
  UsersRound,
  UserCog,
  Zap,
  X,
} from 'lucide-react-native';
import Header from '@/components/Header';
import ShopOrdersManager from '@/components/ShopOrdersManager';
import ShopProductsManager from '@/components/ShopProductsManager';
import ShopCustomersManager from '@/components/ShopCustomersManager';
import ShopNewsletterSubscribersManager from '@/components/ShopNewsletterSubscribersManager';
import ShopDiscountsManager from '@/components/ShopDiscountsManager';
import ShopCompanySettingsManager from '@/components/ShopCompanySettingsManager';
import ShopSuppliersManager from '@/components/ShopSuppliersManager';
import ShopNirManager from '@/components/ShopNirManager';
import ShopInvoiceConfigurator from '@/components/ShopInvoiceConfigurator';
import ShopInvoicesManager from '@/components/ShopInvoicesManager';
import ShopAutomationsManager from '@/components/ShopAutomationsManager';
import ShopUsersManager from '@/components/ShopUsersManager';
import ShopNotificationsButton from '@/components/ShopNotificationsButton';
import LogoutConfirmModal from '@/components/logout-confirm-modal';
import type { ShopNotification } from '@/services/shopApi';
import { ShopPaymentMethodsManager, ShopProductSourcesManager, ShopShippingManager } from '@/components/ShopMoreManagers';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useShopNavigation } from '@/contexts/ShopNavigationContext';
import {
  shopApi,
  shopOrderCustomerDisplayName,
  ShopBrand,
  ShopBrandPayload,
  ShopCategory,
  ShopCategoryPayload,
  ShopDashboardStats,
  ShopManufacturer,
  ShopManufacturerPayload,
} from '@/services/shopApi';

import ShopRegistryExportButton from '@/components/ShopRegistryExportButton';

type CatalogView = 'categories' | 'brands' | 'manufacturers';
type SettingsView = 'sources' | 'suppliers' | 'nirs' | 'invoices' | 'invoice-configurator' | 'automations' | 'payments' | 'shipping' | 'customers' | 'newsletter' | 'discounts' | 'company' | 'users';
type PrimaryTab = 'home' | 'orders' | 'products' | 'more';
type ShopView = PrimaryTab | CatalogView | SettingsView;
type DeleteTarget = { type: 'category'; item: ShopCategory } | { type: 'brand'; item: ShopBrand } | { type: 'manufacturer'; item: ShopManufacturer };
type DashboardSeriesKey = 'revenue' | 'returns' | 'pending' | 'orders';
type DashboardPeriod = '24h' | 'today' | 'yesterday' | '7d' | '14d' | '28d' | '30d' | '3m' | '6m' | '12m' | '16m' | 'current_week_sun' | 'current_week_mon' | 'previous_week_sun' | 'previous_week_mon' | 'current_month' | 'previous_month' | 'current_year' | 'previous_year' | 'all' | 'custom';
type DashboardGranularity = 'hour' | 'day' | 'week' | 'month';
const SECOND_HAND_CATEGORY_SYSTEM_KEY = 'second_hand_scooters';

function secondHandCategoryFirst(categories: ShopCategory[]): ShopCategory[] {
  return categories
    .map((category, index) => ({ category, index }))
    .sort((left, right) => {
      const leftPriority = left.category.system_key === SECOND_HAND_CATEGORY_SYSTEM_KEY ? 0 : 1;
      const rightPriority = right.category.system_key === SECOND_HAND_CATEGORY_SYSTEM_KEY ? 0 : 1;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ category }) => category);
}

const ReanimatedSvgPath = Reanimated.createAnimatedComponent(Path);
const dashboardGranularityLabels: Record<DashboardGranularity, string> = { hour: 'Orar', day: 'Zilnic', week: 'Săptămânal', month: 'Lunar' };
const dashboardGranularityShortLabels: Record<DashboardGranularity, string> = { hour: 'OR', day: 'ZI', week: 'SĂP', month: 'LUN' };
const dashboardGranularityDescriptions: Record<DashboardGranularity, string> = { hour: 'Detaliu pe fiecare oră', day: 'Detaliu pentru fiecare zi', week: 'Rezumat pe săptămâni', month: 'Rezumat pe luni' };
const shopMoneyFormatter = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shopCompactMoneyFormatter = new Intl.NumberFormat('ro-RO', { notation: 'compact', maximumFractionDigits: 2 });
const dashboardMobilePeriods: [DashboardPeriod, string][] = [
  ['24h', 'Ultimele 24 de ore'],
  ['today', 'Astăzi'],
  ['yesterday', 'Ieri'],
  ['7d', 'Ultimele 7 zile'],
  ['14d', 'Ultimele 14 zile'],
  ['28d', 'Ultimele 28 de zile'],
  ['30d', 'Ultimele 30 de zile'],
  ['3m', 'Ultimele 3 luni'],
  ['6m', 'Ultimele 6 luni'],
  ['12m', 'Ultimele 12 luni'],
  ['16m', 'Ultimele 16 luni'],
  ['current_week_sun', 'Săptămâna aceasta (Du – Azi)'],
  ['current_week_mon', 'Săptămâna aceasta (Lu – Azi)'],
  ['previous_week_sun', 'Săptămâna trecută (Du – Sâ)'],
  ['previous_week_mon', 'Săptămâna trecută (Lu – Du)'],
  ['current_month', 'Luna aceasta'],
  ['previous_month', 'Luna trecută'],
  ['current_year', 'Anul curent'],
  ['previous_year', 'Anul trecut'],
  ['all', 'Toată perioada'],
];

function dashboardRangeDayCount(startDate = '', endDate = '') {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return 30;
  const start = localDateFromIso(startDate).getTime();
  const end = localDateFromIso(endDate).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, Math.round((end - start) / 86400000) + 1) : 30;
}

function allowedDashboardGranularities(period: DashboardPeriod, startDate = '', endDate = ''): DashboardGranularity[] {
  if (period === '24h' || period === 'today' || period === 'yesterday') return ['hour'];
  if (period === '7d' || period === '14d' || period.startsWith('current_week') || period.startsWith('previous_week')) return ['day'];
  if (period === '28d' || period === '30d' || period === 'current_month' || period === 'previous_month') return ['day', 'week', 'month'];
  if (period === '3m' || period === '6m' || period === '12m' || period === '16m' || period === 'current_year' || period === 'previous_year' || period === 'all') return ['day', 'week', 'month'];
  const days = dashboardRangeDayCount(startDate, endDate);
  if (days <= 14) return ['day'];
  if (days < 28) return ['day', 'week'];
  if (days <= 730) return ['day', 'week', 'month'];
  return ['month'];
}

function preferredDashboardGranularity(period: DashboardPeriod, startDate = '', endDate = ''): DashboardGranularity {
  const allowed = allowedDashboardGranularities(period, startDate, endDate);
  if (allowed.includes('hour')) return 'hour';
  if (period === '6m' || period === '12m' || period === '16m' || period === 'current_year' || period === 'previous_year' || period === 'all' || (period === 'custom' && dashboardRangeDayCount(startDate, endDate) > 120)) return 'month';
  if (allowed.includes('day')) return 'day';
  if (allowed.includes('month')) return 'month';
  return 'week';
}

// Revalidarea sesiunii poate reconstrui layout-ul Expo. Pastram sectiunea
// SHOP activa, astfel incat utilizatorul sa nu fie trimis inapoi pe Acasa.
let persistedShopView: ShopView = 'home';
const persistedShopScrollOffsets: Partial<Record<ShopView, number>> = {};
type ShopDashboardSnapshot = {
  token: string;
  period: DashboardPeriod;
  startDate: string;
  endDate: string;
  granularity: DashboardGranularity;
  data: ShopDashboardStats;
};
// Pastreaza suficienta rezolutie pentru grafice, fara sa mentina sute sau mii
// de obiecte SVG in memorie pe telefon. Esantionarea uniforma conserva atat
// inceputul, cat si sfarsitul intervalului (spre deosebire de un simplu slice).
const MAX_SNAPSHOT_CHART_ROWS = 240;
const MAX_SNAPSHOT_RECENT_ORDERS = 5;
let persistedShopDashboardSnapshot: ShopDashboardSnapshot | null = null;
const SHOP_VIEW_STORAGE_KEY = 'cubisshop.shopView.v2';
const SHOP_DASHBOARD_PREFERENCES_STORAGE_KEY = 'cubisshop.shopDashboardPreferences.v1';
const shopViews = new Set<ShopView>(['home', 'orders', 'products', 'more', 'categories', 'brands', 'manufacturers', 'invoices', 'invoice-configurator', 'automations', 'payments', 'shipping', 'customers', 'newsletter', 'discounts', 'company', 'users']);
const dashboardPeriodValues = new Set<DashboardPeriod>(['24h', 'today', 'yesterday', '7d', '14d', '28d', '30d', '3m', '6m', '12m', '16m', 'current_week_sun', 'current_week_mon', 'previous_week_sun', 'previous_week_mon', 'current_month', 'previous_month', 'current_year', 'previous_year', 'all', 'custom']);

function readStoredDashboardPreferences(raw: string | null) {
  const fallback = { period: '7d' as DashboardPeriod, startDate: '', endDate: '', granularity: 'day' as DashboardGranularity };
  if (!raw) return fallback;
  try {
    const stored = JSON.parse(raw) as { period?: DashboardPeriod; startDate?: string; endDate?: string; granularity?: DashboardGranularity };
    if (!stored.period || !dashboardPeriodValues.has(stored.period)) return fallback;
    const validDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()));
    const startDate = validDate(stored.startDate) ? stored.startDate! : '';
    const endDate = validDate(stored.endDate) ? stored.endDate! : '';
    if (stored.period === 'custom' && (!startDate || !endDate || startDate > endDate)) return fallback;
    const allowed = allowedDashboardGranularities(stored.period, startDate, endDate);
    const granularity = stored.granularity && allowed.includes(stored.granularity) ? stored.granularity : preferredDashboardGranularity(stored.period, startDate, endDate);
    return { period: stored.period, startDate: stored.period === 'custom' ? startDate : '', endDate: stored.period === 'custom' ? endDate : '', granularity };
  } catch {
    return fallback;
  }
}

function compactDashboardSnapshot(data: ShopDashboardStats): ShopDashboardStats {
  const chartRows = data.daily_stats.length <= MAX_SNAPSHOT_CHART_ROWS
    ? data.daily_stats
    : Array.from({ length: MAX_SNAPSHOT_CHART_ROWS }, (_, index) => (
      data.daily_stats[Math.round(index * (data.daily_stats.length - 1) / (MAX_SNAPSHOT_CHART_ROWS - 1))]
    ));
  return {
    ...data,
    daily_stats: chartRows.map((row) => ({
      date: row.date,
      orders_count: row.orders_count,
      collected_revenue: row.collected_revenue,
      pending_cash: row.pending_cash,
      gross_revenue: row.gross_revenue,
      returns_count: row.returns_count,
      returns_total: row.returns_total,
      revenue: row.revenue,
      acquisitions: row.acquisitions,
      cost_of_goods_sold: row.cost_of_goods_sold,
      profit: row.profit,
    })),
    recent_orders: data.recent_orders.slice(0, MAX_SNAPSHOT_RECENT_ORDERS).map((order) => ({
      ...order,
      items: [],
      status_history: undefined,
      email_notification: undefined,
      invoice_automation: undefined,
      invoice: undefined,
    })),
  };
}

const orderStatusLabels: Record<string, string> = {
  new: 'NOUĂ',
  confirmed: 'CONFIRMATĂ',
  processing: 'ÎN PREGĂTIRE',
  shipped: 'PREDATĂ CURIERULUI',
  completed: 'LIVRATĂ',
  return_requested: 'RETUR SOLICITAT',
  return_refused: 'RETUR REFUZAT',
  return_confirmed: 'RETUR CONFIRMAT',
  refunded: 'RAMBURSATĂ',
  cancelled: 'COMANDĂ ANULATĂ',
};

const primaryTabs = [
  { key: 'home', title: 'Acasă', Icon: House },
  { key: 'orders', title: 'Comenzi', Icon: ShoppingCart },
  { key: 'products', title: 'Produse', Icon: Package },
  { key: 'more', title: 'Mai multe', Icon: CircleEllipsis },
] as const;

const primaryTabDetails = {
  orders: {
    eyebrow: 'GESTIONARE COMENZI',
    title: 'Comenzi',
    description: 'Urmareste comenzile si statusurile lor dintr-un singur loc.',
    emptyTitle: 'Zona de comenzi este pregatita',
    emptyText: 'Lista si actiunile pentru comenzi vor fi adaugate aici.',
    Icon: ShoppingCart,
    color: Theme.colors.brand.primaryText,
  },
  products: {
    eyebrow: 'CATALOG COMERCIAL',
    title: 'Produse',
    description: 'Administreaza produsele, preturile si informatiile comerciale.',
    emptyTitle: 'Zona de produse este pregatita',
    emptyText: 'Produsele si actiunile catalogului vor fi adaugate aici.',
    Icon: Package,
    color: Theme.colors.brand.primaryText,
  },
  more: {
    eyebrow: 'ADMINISTRARE SHOP',
    title: 'Mai multe',
    description: 'Gasesti aici instrumentele actuale si toate sectiunile care vor fi adaugate pe viitor.',
    emptyTitle: '',
    emptyText: '',
    Icon: CircleEllipsis,
    color: Colors.orange,
  },
} as const;

const moreAreaGroups = [
  {
    key: 'sales', title: 'VÂNZĂRI', color: Theme.colors.brand.primaryText,
    areas: [
      { key: 'shipping', title: 'Livrări', description: 'Costuri, praguri gratuite și termene de livrare.', Icon: Truck, color: Theme.colors.state.successBright },
      { key: 'customers', title: 'Clienți', description: 'Conturi, comenzi, valoare totală și controlul accesului.', Icon: UsersRound, color: Theme.colors.brand.primaryText },
      { key: 'newsletter', title: 'Abonați newsletter', description: 'Abonați, dezabonări și istoricul ultimelor notificări.', Icon: MailCheck, color: Theme.colors.state.successBright },
      { key: 'invoices', title: 'Facturi emise', description: 'Documentele emise și situația încasărilor.', Icon: FileText, color: Theme.colors.state.warningBright },
    ],
  },
  {
    key: 'catalog', title: 'CATALOG', color: Theme.colors.brand.primaryText,
    areas: [
      { key: 'categories', title: 'Categorii', description: 'Categorii, subcategorii și imagini.', Icon: FolderTree, color: Theme.colors.state.error },
      { key: 'brands', title: 'Compatibilități branduri', description: 'Mărcile cu care sunt compatibile produsele.', Icon: Tags, color: Theme.colors.brand.cyanStrong },
      { key: 'manufacturers', title: 'Producători', description: 'Companiile care fabrică produsele.', Icon: Factory, color: Theme.colors.brand.secondary },
      { key: 'discounts', title: 'Reduceri', description: 'Campanii globale sau per produs și anunțuri pe site.', Icon: BadgePercent, color: Theme.colors.state.warningBright },
    ],
  },
  {
    key: 'settings', title: 'CONFIGURARE', color: Theme.colors.brand.secondary,
    areas: [
      { key: 'payments', title: 'Metode de plată', description: 'Activează plata cu cardul sau ramburs la curier.', Icon: CreditCard, color: Theme.colors.brand.primaryText },
      { key: 'invoice-configurator', title: 'Facturare SmartBill', description: 'Serii, emitere și sincronizare direct din SmartBill.', Icon: FileCog, color: Theme.colors.brand.secondary },
      { key: 'automations', title: 'Automatizări', description: 'Emitere și trimitere automată a facturilor.', Icon: Zap, color: Theme.colors.state.warningBright },
      { key: 'company', title: 'Datele firmei', description: 'Identitate juridică, adresă, contact și date bancare.', Icon: Building2, color: Theme.colors.brand.primaryText },
      { key: 'users', title: 'Utilizatori', description: 'Conturi și acces la aplicațiile Cubis Shop.', Icon: UserCog, color: Theme.colors.brand.primaryText },
    ],
  },
] as const;

export default function ShopModuleScreen() {
  const { token, user, logout } = useAuth();
  const { pendingShopOrderId, consumePendingShopOrder } = useShopNavigation();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const persistedDashboard = persistedShopDashboardSnapshot?.token === token
    ? persistedShopDashboardSnapshot
    : null;
  const prewarmedDashboard = !persistedDashboard && token
    ? shopApi.peekDashboardStats(token, { period: '7d', granularity: 'day' })
    : null;
  const initialDashboardSnapshot = persistedDashboard || (prewarmedDashboard ? {
    token,
    period: '7d' as DashboardPeriod,
    startDate: '',
    endDate: '',
    granularity: 'day' as DashboardGranularity,
    data: compactDashboardSnapshot(prewarmedDashboard),
  } : null);
  const [homeGreeting, setHomeGreeting] = useState(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Bună dimineața' : hour < 18 ? 'Bună ziua' : 'Bună seara';
  });
  const [view, setView] = useState<ShopView>(persistedShopView);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const viewRef = useRef<ShopView>(persistedShopView);
  const settingsScrollRef = useRef<ScrollView | null>(null);
  const revealSettingsField = useCallback((target: number) => {
    setTimeout(() => {
      const responder = settingsScrollRef.current?.getScrollResponder?.() as { scrollResponderScrollNativeHandleToKeyboard?: (nodeHandle: number, extraHeight: number, preventNegativeScrollOffset: boolean) => void } | undefined;
      responder?.scrollResponderScrollNativeHandleToKeyboard?.(target, 150, true);
    }, 180);
  }, []);
  const confirmLogout = useCallback(async () => {
    setLogoutLoading(true);
    try {
      await logout();
      setLogoutConfirmVisible(false);
    } finally {
      setLogoutLoading(false);
    }
  }, [logout]);
  const [ordersInitialFilter, setOrdersInitialFilter] = useState<'all' | 'new'>('all');
  const [initialOrderId, setInitialOrderId] = useState<string | null>(null);
  const [initialNirId, setInitialNirId] = useState<string | null>(null);
  const [initialInvoiceId, setInitialInvoiceId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ShopDashboardStats | null>(() => initialDashboardSnapshot?.data || null);
  const [dashboardLoading, setDashboardLoading] = useState(() => !initialDashboardSnapshot);
  const dashboardLoadedRef = useRef(Boolean(initialDashboardSnapshot));
  const dashboardRequestRef = useRef(0);
  const dashboardTooltipDismissRef = useRef<(() => void) | null>(null);
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>(() => initialDashboardSnapshot?.period || '7d');
  const [dashboardGranularity, setDashboardGranularity] = useState<DashboardGranularity>(() => initialDashboardSnapshot?.granularity || 'day');
  const [dashboardGranularityMenu, setDashboardGranularityMenu] = useState(false);
  const dashboardGranularityTriggerRef = useRef<React.ElementRef<typeof View> | null>(null);
  const [dashboardGranularityMenuPosition, setDashboardGranularityMenuPosition] = useState({ top: 0, left: 0, width: 214 });
  const [dashboardStartDate, setDashboardStartDate] = useState(() => initialDashboardSnapshot?.startDate || '');
  const [dashboardEndDate, setDashboardEndDate] = useState(() => initialDashboardSnapshot?.endDate || '');
  const [dashboardAppliedStartDate, setDashboardAppliedStartDate] = useState(() => initialDashboardSnapshot?.startDate || '');
  const [dashboardAppliedEndDate, setDashboardAppliedEndDate] = useState(() => initialDashboardSnapshot?.endDate || '');
  const [dashboardRangeModal, setDashboardRangeModal] = useState(false);
  const [dashboardCustomEditor, setDashboardCustomEditor] = useState(false);
  const [dashboardDatePicker, setDashboardDatePicker] = useState<'start' | 'end' | null>(null);
  const [dashboardSeries, setDashboardSeries] = useState<DashboardSeriesKey[]>(['revenue', 'returns', 'pending', 'orders']);
  const [dashboardPreferencesReady, setDashboardPreferencesReady] = useState(false);
  const [dashboardRangeMotion] = useState(() => new Animated.Value(0));
  const [dashboardCustomMotion] = useState(() => new Animated.Value(0));
  const [dashboardGranularityMotion] = useState(() => new Animated.Value(0));
  const [homeEntranceMotion] = useState(() => new Animated.Value(0));
  const [homeScrollMotion] = useState(() => new Animated.Value(0));
  const [homePulseMotion] = useState(() => new Animated.Value(0));
  const [homeWaveMotion] = useState(() => new Animated.Value(0));
  const homeIconDrawProgress = useSharedValue(0);
  const homeIconLineAnimatedProps = useAnimatedProps(() => {
    const progress = Math.min(1, homeIconDrawProgress.value / 0.76);
    return {
      opacity: 0.38 + progress * 0.62,
      strokeDashoffset: 60 * (1 - progress),
    };
  });
  const homeIconArrowAnimatedProps = useAnimatedProps(() => {
    const progress = Math.max(0, Math.min(1, (homeIconDrawProgress.value - 0.58) / 0.42));
    return {
      opacity: progress,
      strokeDashoffset: 24 * (1 - progress),
    };
  });
  const homeIconMotionStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + homeIconDrawProgress.value * 0.28,
    transform: [{ translateY: 4 * (1 - homeIconDrawProgress.value) }],
  }));
  const dashboardScrollGesture = useMemo(() => Gesture.Native().disallowInterruption(false), []);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [brands, setBrands] = useState<ShopBrand[]>([]);
  const [manufacturers, setManufacturers] = useState<ShopManufacturer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categoryModal, setCategoryModal] = useState(false);
  const [brandModal, setBrandModal] = useState(false);
  const [manufacturerModal, setManufacturerModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ShopCategory | null>(null);
  const [editingBrand, setEditingBrand] = useState<ShopBrand | null>(null);
  const [editingManufacturer, setEditingManufacturer] = useState<ShopManufacturer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryParent, setCategoryParent] = useState<string | null>(null);
  const [categoryActive, setCategoryActive] = useState(true);
  const [categoryImage, setCategoryImage] = useState<string | null>(null);
  const [categoryImageBase64, setCategoryImageBase64] = useState<string | null>(null);
  const [categoryImageRemoved, setCategoryImageRemoved] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [brandWebsite, setBrandWebsite] = useState('');
  const [brandActive, setBrandActive] = useState(true);
  const [manufacturerName, setManufacturerName] = useState('');
  const [manufacturerWebsite, setManufacturerWebsite] = useState('');
  const [manufacturerActive, setManufacturerActive] = useState(true);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(SHOP_VIEW_STORAGE_KEY).then((stored) => {
      if (!active || !stored || !shopViews.has(stored as ShopView)) return;
      // Do not override a navigation action that happened while storage loaded.
      if (viewRef.current === 'home' && persistedShopView === 'home') setView(stored as ShopView);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    persistedShopView = view;
    viewRef.current = view;
    void SecureStore.setItemAsync(SHOP_VIEW_STORAGE_KEY, view).catch(() => {});
  }, [view]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const current = viewRef.current;
      if (current === 'home') return false;
      const primary: ShopView[] = ['orders', 'products', 'more'];
      setView(primary.includes(current) ? 'home' : 'more');
      return true;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(SHOP_DASHBOARD_PREFERENCES_STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        const preferences = readStoredDashboardPreferences(stored);
        setDashboardPeriod(preferences.period);
        setDashboardStartDate(preferences.startDate);
        setDashboardEndDate(preferences.endDate);
        setDashboardAppliedStartDate(preferences.startDate);
        setDashboardAppliedEndDate(preferences.endDate);
        setDashboardGranularity(preferences.granularity);
      })
      .catch(() => {})
      .finally(() => { if (active) setDashboardPreferencesReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dashboardPreferencesReady) return;
    void SecureStore.setItemAsync(SHOP_DASHBOARD_PREFERENCES_STORAGE_KEY, JSON.stringify({
      period: dashboardPeriod,
      startDate: dashboardPeriod === 'custom' ? dashboardAppliedStartDate : '',
      endDate: dashboardPeriod === 'custom' ? dashboardAppliedEndDate : '',
      granularity: dashboardGranularity,
    })).catch(() => {});
  }, [dashboardAppliedEndDate, dashboardAppliedStartDate, dashboardGranularity, dashboardPeriod, dashboardPreferencesReady]);

  useEffect(() => {
    if (view !== 'home') return;
    const updateGreeting = () => {
      const hour = new Date().getHours();
      setHomeGreeting(hour < 12 ? 'Bună dimineața' : hour < 18 ? 'Bună ziua' : 'Bună seara');
    };
    updateGreeting();
    const timer = setInterval(updateGreeting, 60000);
    return () => clearInterval(timer);
  }, [view]);

  const loadCatalog = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [nextCategories, nextBrands, nextManufacturers] = await Promise.all([
        shopApi.listCategories(token),
        shopApi.listBrands(token),
        shopApi.listManufacturers(token),
      ]);
      setCategories(secondHandCategoryFirst(nextCategories));
      setBrands(nextBrands);
      setManufacturers(nextManufacturers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Datele SHOP nu au putut fi incarcate.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    const requestId = ++dashboardRequestRef.current;
    setDashboardLoading(!dashboardLoadedRef.current);
    try {
      const nextDashboard = await shopApi.getDashboardStats(token, { period: dashboardPeriod, start_date: dashboardAppliedStartDate || undefined, end_date: dashboardAppliedEndDate || undefined, granularity: dashboardGranularity });
      if (requestId !== dashboardRequestRef.current) return;
      const compactDashboard = compactDashboardSnapshot(nextDashboard);
      persistedShopDashboardSnapshot = {
        token,
        period: dashboardPeriod,
        startDate: dashboardAppliedStartDate,
        endDate: dashboardAppliedEndDate,
        granularity: nextDashboard.range?.granularity || dashboardGranularity,
        data: compactDashboard,
      };
      setDashboard(compactDashboard);
      if (nextDashboard.range?.granularity && nextDashboard.range.granularity !== dashboardGranularity) setDashboardGranularity(nextDashboard.range.granularity);
      dashboardLoadedRef.current = true;
    } catch {
      if (requestId === dashboardRequestRef.current && !dashboardLoadedRef.current) setDashboard(null);
    } finally {
      if (requestId === dashboardRequestRef.current) setDashboardLoading(false);
    }
  }, [token, dashboardPeriod, dashboardAppliedStartDate, dashboardAppliedEndDate, dashboardGranularity]);

  useEffect(() => { if (view === 'home' && dashboardPreferencesReady) void loadDashboard(); }, [view, loadDashboard, dashboardPreferencesReady]);

  useEffect(() => {
    if (view !== 'home') return;
    homeEntranceMotion.setValue(0);
    homeScrollMotion.setValue(0);
    requestAnimationFrame(() => Animated.timing(homeEntranceMotion, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start());
  }, [homeEntranceMotion, homeScrollMotion, view]);

  useEffect(() => {
    if (view !== 'home') return;
    homePulseMotion.setValue(0);
    homeWaveMotion.setValue(0);
    homeIconDrawProgress.value = 0;
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(homePulseMotion, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(homePulseMotion, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    const wave = Animated.loop(Animated.sequence([
      Animated.delay(700),
      Animated.timing(homeWaveMotion, { toValue: 1, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false }),
      Animated.timing(homeWaveMotion, { toValue: -1, duration: 150, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
      Animated.timing(homeWaveMotion, { toValue: 1, duration: 150, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
      Animated.timing(homeWaveMotion, { toValue: 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false }),
      Animated.delay(1700),
    ]));
    homeIconDrawProgress.value = withRepeat(withSequence(
      withTiming(1, { duration: 1080, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
      withDelay(1150, withTiming(0, { duration: 320, easing: ReanimatedEasing.in(ReanimatedEasing.quad) })),
      withDelay(260, withTiming(0, { duration: 1 })),
    ), -1, false);
    pulse.start();
    wave.start();
    return () => { pulse.stop(); wave.stop(); cancelAnimation(homeIconDrawProgress); };
  }, [homeIconDrawProgress, homePulseMotion, homeWaveMotion, view]);

  useEffect(() => {
    if (!dashboardRangeModal) return;
    dashboardRangeMotion.setValue(0);
    requestAnimationFrame(() => Animated.timing(dashboardRangeMotion, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start());
  }, [dashboardRangeModal, dashboardRangeMotion]);

  const closeDashboardRange = useCallback(() => {
    setDashboardDatePicker(null);
    Animated.timing(dashboardRangeMotion, { toValue: 0, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setDashboardRangeModal(false));
  }, [dashboardRangeMotion]);

  const openCatalog = (next: CatalogView) => {
    setView(next);
    void loadCatalog();
  };

  const openOrders = useCallback((filter: 'all' | 'new' = 'all', orderId: string | null = null) => {
    setOrdersInitialFilter(filter);
    setInitialOrderId(orderId);
    setView('orders');
  }, []);

  useEffect(() => {
    if (!pendingShopOrderId) return;
    const timer = setTimeout(() => {
      openOrders('all', pendingShopOrderId);
      consumePendingShopOrder();
    }, 0);
    return () => clearTimeout(timer);
  }, [consumePendingShopOrder, openOrders, pendingShopOrderId]);

  const openInvoiceFromOrder = (invoiceId: string) => {
    setInitialInvoiceId(invoiceId);
    setView('invoices');
  };

  const openShopNotification = (item: ShopNotification) => {
    if (item.entity_type === 'order' && item.entity_id) openOrders('all', item.entity_id);
    else if (item.entity_type === 'invoice' && item.entity_id) openInvoiceFromOrder(item.entity_id);
  };
  const notificationButton = <ShopNotificationsButton onOpenEntity={openShopNotification} />;

  const openCategoryForm = (category?: ShopCategory) => {
    const current = category || null;
    setEditingCategory(current);
    setCategoryName(current?.name || '');
    setCategoryDescription(current?.description || '');
    setCategoryParent(current?.parent_id || null);
    setCategoryActive(current?.is_active ?? true);
    setCategoryImage(current?.thumbnail_url || null);
    setCategoryImageBase64(null);
    setCategoryImageRemoved(false);
    setCategoryModal(true);
  };

  const closeCategoryForm = () => {
    setCategoryModal(false);
    setEditingCategory(null);
    setCategoryName('');
    setCategoryDescription('');
    setCategoryParent(null);
    setCategoryActive(true);
    setCategoryImage(null);
    setCategoryImageBase64(null);
    setCategoryImageRemoved(false);
  };

  const openBrandForm = (brand?: ShopBrand) => {
    const current = brand || null;
    setEditingBrand(current);
    setBrandName(current?.name || '');
    setBrandWebsite(current?.website_url || '');
    setBrandActive(current?.is_active ?? true);
    setBrandModal(true);
  };

  const openManufacturerForm = (manufacturer?: ShopManufacturer) => {
    const current = manufacturer || null;
    setEditingManufacturer(current);
    setManufacturerName(current?.name || '');
    setManufacturerWebsite(current?.website_url || '');
    setManufacturerActive(current?.is_active ?? true);
    setManufacturerModal(true);
  };

  const pickCategoryImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Acces necesar', 'Permite accesul la fotografii pentru a alege miniatura categoriei.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.base64) {
      setCategoryImage(asset.uri);
      setCategoryImageBase64(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
      setCategoryImageRemoved(false);
    }
  };

  const saveCategory = async () => {
    if (!token || saving) return;
    if (!categoryName.trim()) {
      Alert.alert('Nume obligatoriu', 'Completeaza numele categoriei.');
      return;
    }
    setSaving(true);
    try {
      const payload: ShopCategoryPayload = {
        name: categoryName.trim(),
        description: categoryDescription.trim(),
        parent_id: categoryParent,
        is_active: categoryActive,
        ...(categoryImageBase64 ? { thumbnail_base64: categoryImageBase64 } : {}),
        ...(categoryImageRemoved ? { thumbnail_remove: true } : {}),
      };
      if (editingCategory) await shopApi.updateCategory(token, editingCategory.id, payload);
      else await shopApi.createCategory(token, payload);
      closeCategoryForm();
      await loadCatalog(true);
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const saveBrand = async () => {
    if (!token || saving) return;
    if (!brandName.trim()) {
      Alert.alert('Nume obligatoriu', 'Completeaza numele brandului.');
      return;
    }
    setSaving(true);
    try {
      const payload: ShopBrandPayload = {
        name: brandName.trim(),
        website_url: brandWebsite.trim(),
        is_active: brandActive,
      };
      if (editingBrand) await shopApi.updateBrand(token, editingBrand.id, payload);
      else await shopApi.createBrand(token, payload);
      setBrandModal(false);
      await loadCatalog(true);
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const saveManufacturer = async () => {
    if (!token || saving) return;
    if (!manufacturerName.trim()) {
      Alert.alert('Nume obligatoriu', 'Completeaza numele producatorului.');
      return;
    }
    setSaving(true);
    try {
      const payload: ShopManufacturerPayload = {
        name: manufacturerName.trim(),
        website_url: manufacturerWebsite.trim(),
        is_active: manufacturerActive,
      };
      if (editingManufacturer) await shopApi.updateManufacturer(token, editingManufacturer.id, payload);
      else await shopApi.createManufacturer(token, payload);
      setManufacturerModal(false);
      await loadCatalog(true);
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!token || !deleteTarget || saving) return;
    if (deleteTarget.type === 'category' && deleteTarget.item.is_protected) {
      setDeleteTarget(null);
      Alert.alert('Categorie protejata', 'Categoria pentru produse second-hand poate fi redenumita sau dezactivata, dar nu poate fi stearsa.');
      return;
    }
    setSaving(true);
    try {
      if (deleteTarget.type === 'category') await shopApi.deleteCategory(token, deleteTarget.item.id);
      else if (deleteTarget.type === 'brand') await shopApi.deleteBrand(token, deleteTarget.item.id);
      else await shopApi.deleteManufacturer(token, deleteTarget.item.id);
      setDeleteTarget(null);
      await loadCatalog(true);
    } catch (deleteError) {
      Alert.alert('Nu s-a putut sterge', deleteError instanceof Error ? deleteError.message : 'Incearca din nou.');
    } finally {
      setSaving(false);
    }
  };

  const availableParents = useMemo(
    () => categories.filter((category) => (
      category.id !== editingCategory?.id
      && (!editingCategory || !isCategoryDescendant(category.id, editingCategory.id, categories))
    )),
    [categories, editingCategory]
  );

  if (view === 'home') {
    const toggleDashboardSeries = (key: DashboardSeriesKey) => setDashboardSeries((current) => (
      current.includes(key) ? (current.length === 1 ? current : current.filter((item) => item !== key)) : [...current, key]
    ));
    const selectDashboardPeriod = (period: DashboardPeriod) => {
      setDashboardPeriod(period);
      setDashboardGranularity(preferredDashboardGranularity(period));
      setDashboardGranularityMenu(false);
      if (period !== 'custom') { setDashboardAppliedStartDate(''); setDashboardAppliedEndDate(''); }
    };
    const openDashboardRange = () => {
      const now = new Date();
      const startValue = new Date(now);
      startValue.setDate(startValue.getDate() - 29);
      const today = isoDateFromLocalDate(now);
      const start = isoDateFromLocalDate(startValue);
      if (!dashboardStartDate) setDashboardStartDate(start);
      if (!dashboardEndDate) setDashboardEndDate(today);
      setDashboardCustomEditor(false);
      dashboardCustomMotion.setValue(0);
      setDashboardDatePicker(null);
      setDashboardRangeModal(true);
    };
    const openDashboardCustomEditor = () => {
      setDashboardDatePicker(null);
      dashboardCustomMotion.setValue(0);
      setDashboardCustomEditor(true);
      requestAnimationFrame(() => Animated.timing(dashboardCustomMotion, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start());
    };
    const closeDashboardCustomEditor = () => {
      setDashboardDatePicker(null);
      Animated.timing(dashboardCustomMotion, { toValue: 0, duration: 180, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => setDashboardCustomEditor(false));
    };
    const granularityChoices = allowedDashboardGranularities(dashboardPeriod, dashboardAppliedStartDate, dashboardAppliedEndDate);
    const closeDashboardGranularityMenu = () => {
      Animated.timing(dashboardGranularityMotion, { toValue: 0, duration: 145, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => setDashboardGranularityMenu(false));
    };
    const openDashboardGranularityMenu = () => {
      if (dashboardGranularityMenu) { closeDashboardGranularityMenu(); return; }
      const showMenu = (x: number, y: number, triggerWidth: number, triggerHeight: number) => {
        const menuWidth = Math.min(232, Math.max(214, viewportWidth - 24));
        const menuHeight = 278;
        const left = Math.max(12, Math.min(x + triggerWidth - menuWidth, viewportWidth - menuWidth - 12));
        const below = y + triggerHeight + 8;
        const top = below + menuHeight <= viewportHeight - 10 ? below : Math.max(insets.top + 8, y - menuHeight - 8);
        setDashboardGranularityMenuPosition({ top, left, width: menuWidth });
        dashboardGranularityMotion.setValue(0);
        setDashboardGranularityMenu(true);
        requestAnimationFrame(() => Animated.spring(dashboardGranularityMotion, { toValue: 1, damping: 18, stiffness: 245, mass: 0.72, useNativeDriver: true }).start());
      };
      dashboardGranularityTriggerRef.current?.measureInWindow(showMenu);
    };
    const todayDate = new Date();
    const customRangeValid = Boolean(isValidIsoDate(dashboardStartDate) && isValidIsoDate(dashboardEndDate) && dashboardStartDate <= dashboardEndDate && dashboardEndDate <= isoDateFromLocalDate(todayDate));
    const handleDashboardDateChange = (event: DateTimePickerEvent, picked?: Date) => {
      const target = dashboardDatePicker;
      if (event.type === 'dismissed' || !picked || !target) { setDashboardDatePicker(null); return; }
      const value = isoDateFromLocalDate(picked);
      if (target === 'start') {
        setDashboardStartDate(value);
        if (dashboardEndDate && value > dashboardEndDate) setDashboardEndDate(value);
      } else {
        setDashboardEndDate(value);
        if (dashboardStartDate && value < dashboardStartDate) setDashboardStartDate(value);
      }
      if (Platform.OS !== 'ios') setDashboardDatePicker(null);
    };
    const homeDisplayName = String(user?.display_name || user?.username || 'utilizator').trim();
    return (
      <View style={styles.container}>
        <Header title="Acasă" right={notificationButton} />
        <Animated.View style={[styles.homePageMotion, { opacity: homeEntranceMotion }]}>
          <GestureDetector gesture={dashboardScrollGesture}>
          <Animated.ScrollView
            style={styles.homeScroll}
            contentContainerStyle={styles.homePage}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: homeScrollMotion } } }], { useNativeDriver: true })}
            onScrollBeginDrag={() => dashboardTooltipDismissRef.current?.()}
            onTouchStart={() => dashboardTooltipDismissRef.current?.()}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.homeHero, { opacity: homeScrollMotion.interpolate({ inputRange: [0, 175], outputRange: [1, 0.52], extrapolate: 'clamp' }), transform: [{ translateY: homeScrollMotion.interpolate({ inputRange: [0, 200], outputRange: [0, 58], extrapolate: 'clamp' }) }, { scale: homeEntranceMotion.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
            <LinearGradient colors={Theme.gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.homeHeroGradient} />
            <View style={styles.homeHeroGlowLarge} />
            <Animated.View style={[styles.homeHeroGlowSmall, { opacity: homePulseMotion.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), transform: [{ scale: homePulseMotion.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.22] }) }] }]} />
            <View style={styles.homeHeroCopy}>
              <View style={styles.homeHeroTitleRow}><Text style={styles.homeHeroTitle}>{homeGreeting}, {homeDisplayName}!</Text><Animated.Text style={[styles.homeHeroWave, { transform: [{ rotate: homeWaveMotion.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-15deg', '0deg', '18deg'] }) }] }]}>👋</Animated.Text></View>
              <View style={styles.homeHeroHint}><CircleHelp size={18} color="#EEF6FF" strokeWidth={2.2} /><Text style={styles.homeHeroText}>Ai control rapid asupra comenzilor și vânzărilor magazinului tău.</Text></View>
            </View>
            <Reanimated.View style={[styles.homeHeroChartIcon, homeIconMotionStyle]}><Svg width={48} height={44} viewBox="0 0 48 44"><ReanimatedSvgPath animatedProps={homeIconLineAnimatedProps} d="M5 35 17 23l9 7 16-19" fill="none" stroke="#EEF6FF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60 60" /><ReanimatedSvgPath animatedProps={homeIconArrowAnimatedProps} d="M31 11h11v11" fill="none" stroke="#EEF6FF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="24 24" /></Svg></Reanimated.View>
          </Animated.View>
          <Animated.View style={[styles.homeSheet, { transform: [{ translateY: homeEntranceMotion.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
            <View style={[styles.content, styles.homeContent, { paddingBottom: 94 + insets.bottom }]}>
          <View style={styles.homeOverviewHeader}><View style={styles.homeOverviewIcon}><Sparkles size={18} color="#087FF5" strokeWidth={2.35} /></View><View style={styles.homeOverviewCopy}><Text style={styles.homeOverviewTitle}>Privire de ansamblu</Text><Text style={styles.homeOverviewText}>Indicatorii esențiali ai magazinului</Text></View></View>
          <View style={styles.newOrdersBanner}><View style={styles.newOrdersIcon}><ShoppingCart size={21} color="#087FF5" /></View><View style={styles.newOrdersCopy}><Text style={styles.newOrdersValue}>{dashboard?.new_orders_count || 0}</Text><Text style={styles.newOrdersLabel}>comenzi noi</Text></View><TouchableOpacity style={styles.newOrdersButton} onPress={() => openOrders('new')}><Text style={styles.newOrdersButtonText}>Vezi comenzile</Text><ChevronRight size={16} color={Colors.white} /></TouchableOpacity></View>
          <View style={styles.mobileAnalytics}>
            <View style={styles.analyticsToolbar}>
              <TouchableOpacity style={styles.analyticsDateTrigger} onPress={openDashboardRange} activeOpacity={0.72}><CalendarDays size={19} color="#6B8094" /><Text numberOfLines={1} style={styles.analyticsDateText}>{formatDashboardRangeLabel(dashboardPeriod, dashboard?.range, dashboardAppliedStartDate, dashboardAppliedEndDate)}</Text><ChevronRight size={17} color="#6B8094" /></TouchableOpacity>
              <View ref={dashboardGranularityTriggerRef} collapsable={Platform.OS === 'web' ? undefined : false} style={styles.analyticsGranularityAnchor}><TouchableOpacity style={[styles.analyticsGranularityTrigger, dashboardGranularityMenu && styles.analyticsGranularityTriggerOpen]} onPress={openDashboardGranularityMenu} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="Alege gruparea graficului" accessibilityState={{ expanded: dashboardGranularityMenu }}><View><Text style={styles.analyticsGranularityTriggerLabel}>GRUPARE</Text><Text style={styles.analyticsGranularityText}>{dashboardGranularityLabels[dashboardGranularity]}</Text></View><Animated.View style={{ transform: [{ rotate: dashboardGranularityMotion.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}><ChevronDown size={16} color="#2B6FAF" /></Animated.View></TouchableOpacity></View>
            </View>
            <Modal visible={dashboardGranularityMenu} transparent animationType="none" statusBarTranslucent onRequestClose={closeDashboardGranularityMenu}><Pressable style={styles.analyticsGranularityBackdrop} onPress={closeDashboardGranularityMenu}><Animated.View style={[styles.analyticsGranularityMenu, dashboardGranularityMenuPosition, { opacity: dashboardGranularityMotion, transform: [{ translateY: dashboardGranularityMotion.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }, { scale: dashboardGranularityMotion.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}><Pressable onPress={(event) => event.stopPropagation()}><View style={styles.analyticsGranularityMenuHeader}><Text style={styles.analyticsGranularityMenuKicker}>AFIȘARE GRAFIC</Text><Text style={styles.analyticsGranularityMenuTitle}>Alege nivelul de detaliu</Text></View>{(Object.keys(dashboardGranularityLabels) as DashboardGranularity[]).map((granularity) => {
              const enabled = granularityChoices.includes(granularity);
              const active = dashboardGranularity === granularity;
              return <TouchableOpacity key={granularity} disabled={!enabled} activeOpacity={0.75} accessibilityRole="menuitem" accessibilityState={{ selected: active, disabled: !enabled }} style={[styles.analyticsGranularityOption, active && styles.analyticsGranularityOptionActive, !enabled && styles.analyticsGranularityOptionDisabled]} onPress={() => { setDashboardGranularity(granularity); closeDashboardGranularityMenu(); }}><View style={[styles.analyticsGranularityOptionMark, active && styles.analyticsGranularityOptionMarkActive]}><Text style={[styles.analyticsGranularityOptionMarkText, active && styles.analyticsGranularityOptionMarkTextActive]}>{dashboardGranularityShortLabels[granularity]}</Text></View><View style={styles.analyticsGranularityOptionCopy}><Text style={[styles.analyticsGranularityOptionText, active && styles.analyticsGranularityOptionTextActive]}>{dashboardGranularityLabels[granularity]}</Text><Text style={styles.analyticsGranularityOptionDescription}>{enabled ? dashboardGranularityDescriptions[granularity] : 'Indisponibil pentru interval'}</Text></View><View style={[styles.analyticsGranularityCheck, active && styles.analyticsGranularityCheckActive]}>{active && <Check size={14} color="#FFFFFF" strokeWidth={2.8} />}</View></TouchableOpacity>;
            })}</Pressable></Animated.View></Pressable></Modal>
            {dashboardLoading ? <View style={styles.analyticsLoading}><ActivityIndicator color="#087FF5" /><Text style={styles.dashboardLoadingText}>Se actualizează...</Text></View> : <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricPills}>
                <DashboardMetric title="Încasări" value={compactShopMoney(dashboard?.revenue || 0)} color="#087FF5" selected={dashboardSeries.includes('revenue')} onPress={() => toggleDashboardSeries('revenue')} />
                <DashboardMetric title={`Retururi · ${dashboard?.returns_count || 0}`} value={compactShopMoney(dashboard?.returns_total || 0)} color="#F472B6" selected={dashboardSeries.includes('returns')} onPress={() => toggleDashboardSeries('returns')} />
                <DashboardMetric title="De încasat" value={compactShopMoney(dashboard?.pending_cash || 0)} color="#FBBF24" selected={dashboardSeries.includes('pending')} onPress={() => toggleDashboardSeries('pending')} />
                <DashboardMetric title="Comenzi" value={String(dashboard?.orders_count || 0)} color="#F28B82" selected={dashboardSeries.includes('orders')} onPress={() => toggleDashboardSeries('orders')} />
              </ScrollView>
              <DashboardTrendChart rows={dashboard?.daily_stats || []} selected={dashboardSeries} granularity={dashboard?.range?.granularity || dashboardGranularity} dismissRef={dashboardTooltipDismissRef} scrollGesture={dashboardScrollGesture} />
            </>}
          </View>
          <View style={styles.sectionHeader}><View><Text style={styles.sectionKicker}>SCURTATURI</Text><Text style={styles.sectionTitle}>Acțiuni rapide</Text></View></View>
          <View style={styles.quickActions}><TouchableOpacity style={styles.quickAction} onPress={() => setView('products')}><View style={[styles.cardIcon, { backgroundColor: Theme.colors.surface.brandSoft }]}><Package size={22} color="#087FF5" /></View><View style={styles.quickActionCopy}><Text style={styles.quickActionTitle}>Produse</Text><Text style={styles.quickActionText}>Adaugă sau editează catalogul.</Text></View><ChevronRight size={18} color="#087FF5" /></TouchableOpacity><TouchableOpacity style={styles.quickAction} onPress={() => openOrders()}><View style={[styles.cardIcon, { backgroundColor: Theme.colors.surface.brandSoft }]}><ShoppingCart size={22} color="#087FF5" /></View><View style={styles.quickActionCopy}><Text style={styles.quickActionTitle}>Comenzi</Text><Text style={styles.quickActionText}>Verifică și procesează comenzile.</Text></View><ChevronRight size={18} color="#087FF5" /></TouchableOpacity><TouchableOpacity style={[styles.quickAction, styles.quickActionInvoice]} onPress={() => setView('invoices')}><View style={[styles.cardIcon, { backgroundColor: '#F59E0B16' }]}><FileText size={22} color="#F59E0B" /></View><View style={styles.quickActionCopy}><Text style={styles.quickActionTitle}>Facturi emise</Text><Text style={styles.quickActionText}>Vezi documentele fiscale și starea lor.</Text></View><ChevronRight size={18} color="#F59E0B" /></TouchableOpacity></View>
          <View style={styles.sectionHeader}><View><Text style={styles.sectionKicker}>ACTIVITATE RECENTA</Text><Text style={styles.sectionTitle}>Ultimele comenzi</Text></View><TouchableOpacity style={styles.sectionSeeAll} onPress={() => openOrders('new')}><Text style={styles.sectionSeeAllText}>Vezi toate</Text><ChevronRight size={15} color={Colors.white} /></TouchableOpacity></View>
          <View style={styles.recentOrders}>{dashboard?.recent_orders?.filter((order) => order.status === 'new').length ? dashboard.recent_orders.filter((order) => order.status === 'new').slice(0, 5).map((order) => <TouchableOpacity key={order.id} style={styles.recentOrder} onPress={() => openOrders('new', order.id)}><View><Text style={styles.recentOrderNumber}>{order.order_number}</Text><Text style={styles.recentOrderMeta}>{shopOrderCustomerDisplayName(order)} · {order.created_at}</Text></View><View style={styles.recentOrderRight}><Text style={styles.recentOrderTotal}>{formatShopMoney(order.total)}</Text><Text style={[styles.recentOrderStatus, styles.recentOrderNew]}>{orderStatusLabels[order.status] || order.status.toUpperCase()}</Text></View></TouchableOpacity>) : <Text style={styles.dashboardEmpty}>Nu există comenzi noi.</Text>}</View>
            </View>
          </Animated.View>
          </Animated.ScrollView>
          </GestureDetector>
        </Animated.View>

        <Modal visible={dashboardRangeModal} transparent animationType="none" statusBarTranslucent onRequestClose={dashboardCustomEditor ? closeDashboardCustomEditor : closeDashboardRange}>
          <View style={styles.rangeModalBackdrop}>
          <Animated.View style={[styles.rangeScreen, { paddingTop: insets.top, transform: [{ translateX: dashboardRangeMotion.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }] }]}>
            <View style={styles.rangeScreenHeader}><TouchableOpacity style={styles.rangeScreenClose} onPress={() => { if (dashboardCustomEditor) closeDashboardCustomEditor(); else closeDashboardRange(); }}><X size={25} color="#172B40" /></TouchableOpacity><Text style={styles.rangeScreenTitle}>{dashboardCustomEditor ? 'Interval personalizat' : 'Interval de date'}</Text></View>
            {dashboardCustomEditor ? <Animated.View style={[styles.rangeCustomMotion, { opacity: dashboardCustomMotion, transform: [{ translateX: dashboardCustomMotion.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) }] }]}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.rangeCustomScreen}>
              <Text style={styles.rangeCustomHint}>Alege prima și ultima zi. Calendarul păstrează automat intervalul în ordine și nu permite date din viitor.</Text>
              <View style={styles.smartDateFields}>
                <View><Text style={styles.customDateLabel}>DATA DE ÎNCEPUT</Text>{Platform.OS === 'web' ? <TextInput style={styles.customDateInput} value={dashboardStartDate} onChangeText={setDashboardStartDate} placeholder="AAAA-LL-ZZ" placeholderTextColor={Colors.textMuted} /> : <TouchableOpacity style={[styles.smartDateButton, dashboardDatePicker === 'start' && styles.smartDateButtonActive]} onPress={() => setDashboardDatePicker('start')} activeOpacity={0.72}><View style={styles.smartDateIcon}><CalendarDays size={19} color="#087FF5" /></View><View style={styles.smartDateCopy}><Text style={styles.smartDateValue}>{formatDashboardPickerDate(dashboardStartDate)}</Text><Text style={styles.smartDateIso}>{dashboardStartDate || 'AAAA-LL-ZZ'}</Text></View><ChevronRight size={19} color="#6B8094" /></TouchableOpacity>}</View>
                <View style={styles.smartDateConnector}><View style={styles.smartDateConnectorLine} /><Text style={styles.smartDateConnectorText}>până la</Text><View style={styles.smartDateConnectorLine} /></View>
                <View><Text style={styles.customDateLabel}>DATA DE SFÂRȘIT</Text>{Platform.OS === 'web' ? <TextInput style={styles.customDateInput} value={dashboardEndDate} onChangeText={setDashboardEndDate} placeholder="AAAA-LL-ZZ" placeholderTextColor={Colors.textMuted} /> : <TouchableOpacity style={[styles.smartDateButton, dashboardDatePicker === 'end' && styles.smartDateButtonActive]} onPress={() => setDashboardDatePicker('end')} activeOpacity={0.72}><View style={styles.smartDateIcon}><CalendarDays size={19} color="#087FF5" /></View><View style={styles.smartDateCopy}><Text style={styles.smartDateValue}>{formatDashboardPickerDate(dashboardEndDate)}</Text><Text style={styles.smartDateIso}>{dashboardEndDate || 'AAAA-LL-ZZ'}</Text></View><ChevronRight size={19} color="#6B8094" /></TouchableOpacity>}</View>
              </View>
              {dashboardDatePicker && Platform.OS !== 'web' && <View style={styles.smartPickerPanel}>
                <View style={styles.smartPickerHeader}><View><Text style={styles.smartPickerKicker}>{dashboardDatePicker === 'start' ? 'PRIMA ZI' : 'ULTIMA ZI'}</Text><Text style={styles.smartPickerTitle}>{dashboardDatePicker === 'start' ? 'Alege începutul' : 'Alege sfârșitul'}</Text></View>{Platform.OS === 'ios' && <TouchableOpacity style={styles.smartPickerDone} onPress={() => setDashboardDatePicker(null)}><Text style={styles.smartPickerDoneText}>Gata</Text></TouchableOpacity>}</View>
                <DateTimePicker
                  value={localDateFromIso(dashboardDatePicker === 'start' ? dashboardStartDate : dashboardEndDate, todayDate)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  locale="ro-RO"
                  themeVariant="dark"
                  maximumDate={dashboardDatePicker === 'start' && dashboardEndDate ? localDateFromIso(dashboardEndDate, todayDate) : todayDate}
                  minimumDate={dashboardDatePicker === 'end' && dashboardStartDate ? localDateFromIso(dashboardStartDate, todayDate) : undefined}
                  onChange={handleDashboardDateChange}
                />
              </View>}
              <View style={styles.rangeCustomSummary}><CalendarDays size={17} color={customRangeValid ? '#168457' : '#F28B82'} /><Text style={[styles.rangeCustomSummaryText, !customRangeValid && styles.rangeCustomSummaryInvalid]}>{customRangeValid ? `${formatDashboardPickerDate(dashboardStartDate)} – ${formatDashboardPickerDate(dashboardEndDate)}` : 'Alege un interval valid.'}</Text></View>
              <TouchableOpacity disabled={!customRangeValid} style={[styles.rangeCustomApply, !customRangeValid && styles.rangeCustomApplyDisabled]} onPress={() => { if (!customRangeValid) return; setDashboardAppliedStartDate(dashboardStartDate); setDashboardAppliedEndDate(dashboardEndDate); setDashboardGranularity(preferredDashboardGranularity('custom', dashboardStartDate, dashboardEndDate)); setDashboardGranularityMenu(false); setDashboardPeriod('custom'); closeDashboardRange(); }}><Text style={styles.rangeApplyText}>Aplică intervalul</Text></TouchableOpacity>
            </ScrollView></Animated.View> : <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.rangeList}>
              <TouchableOpacity style={styles.rangeListRow} onPress={openDashboardCustomEditor}><Text style={styles.rangeListText}>Personalizată</Text>{dashboardPeriod === 'custom' ? <Text style={styles.rangeListCheck}>✓</Text> : <ChevronRight size={20} color="#6B8094" />}</TouchableOpacity>
              {dashboardMobilePeriods.map(([period, label]) => <TouchableOpacity key={period} style={styles.rangeListRow} onPress={() => { selectDashboardPeriod(period); closeDashboardRange(); }}><Text style={[styles.rangeListText, dashboardPeriod === period && styles.rangeListTextActive]}>{label}</Text>{dashboardPeriod === period && <Text style={styles.rangeListCheck}>✓</Text>}</TouchableOpacity>)}
            </ScrollView>}
          </Animated.View>
          </View>
        </Modal>

        <ShopBottomNavigation activeTab="home" onSelect={(tab) => tab === 'orders' ? openOrders() : setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'products') {
    const details = primaryTabDetails.products;
    const ScreenIcon = details.Icon;
    const productHeader = <View style={styles.productHero}><View style={styles.productHeroAura} /><View style={styles.productHeroIcon}><ScreenIcon size={28} color={details.color} /></View><View style={styles.productHeroCopy}><Text style={[styles.kicker, { color: details.color }]}>CONTROL CATALOG</Text><Text style={styles.productHeroTitle}>Produsele magazinului</Text><Text style={styles.productHeroText}>Prețuri, stoc și publicare într-un singur loc.</Text></View><View style={styles.productHeroBadge}><View style={styles.productHeroBadgeDot} /><Text style={styles.productHeroBadgeText}>LIVE</Text></View></View>;
    return <View style={styles.container}><Header title={details.title} right={notificationButton} /><ShopProductsManager header={productHeader} bottomInset={insets.bottom} onOpenOrder={(orderId) => openOrders('all', orderId)} /><ShopBottomNavigation activeTab="products" onSelect={(tab) => tab === 'orders' ? openOrders() : setView(tab)} bottomInset={insets.bottom} /></View>;
  }

  if (view === 'orders' || view === 'more') {
    const details = primaryTabDetails[view];
    const ScreenIcon = details.Icon;
    const isMore = view === 'more';

    return (
      <View style={styles.container}>
        <Header title={details.title} right={notificationButton} />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 94 + insets.bottom }]}
          contentOffset={{ x: 0, y: persistedShopScrollOffsets[view] || 0 }}
          onScroll={(event) => { persistedShopScrollOffsets[view] = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}>
          {!isMore ? <View style={[styles.hero, { backgroundColor: `${details.color}12` }]}>
            <View style={[styles.heroIcon, { borderColor: `${details.color}40`, backgroundColor: `${details.color}18` }]}>
              <ScreenIcon size={22} color={details.color} />
            </View>
            <Text style={[styles.kicker, { color: details.color }]}>{details.eyebrow}</Text>
            <Text style={styles.title}>{details.title}</Text>
            <Text style={styles.subtitle}>{details.description}</Text>
          </View> : null}

          {view === 'orders' ? (
            <ShopOrdersManager initialStatusFilter={ordersInitialFilter} initialOrderId={initialOrderId} onInitialOrderHandled={() => setInitialOrderId(null)} onOpenInvoice={openInvoiceFromOrder} />
          ) : isMore ? (
            <>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionKicker}>TOATE INSTRUMENTELE</Text>
                  <Text style={styles.sectionTitle}>Administrare magazin</Text>
                </View>
              </View>
              <View style={styles.moreGroups}>
                {moreAreaGroups.map((group, groupIndex) => (
                  <View key={group.key} style={styles.moreGroup}>
                    <View style={styles.moreGroupHeader}>
                      <View style={[styles.moreGroupIndex, { backgroundColor: `${group.color}18` }]}><Text style={[styles.moreGroupIndexText, { color: group.color }]}>{String(groupIndex + 1).padStart(2, '0')}</Text></View>
                      <Text style={[styles.moreGroupTitle, { color: group.color }]}>{group.title}</Text>
                      <View style={[styles.moreGroupLine, { backgroundColor: `${group.color}28` }]} />
                    </View>
                    <View style={styles.moreList}>
                      {group.areas.map(({ key, title, description, Icon, color }) => {
                        const openArea = () => {
                          if (key === 'categories' || key === 'brands' || key === 'manufacturers') openCatalog(key);
                          else setView(key);
                        };
                        return (
                          <TouchableOpacity key={key} style={styles.moreCard} activeOpacity={0.72} accessibilityRole="button" onPress={openArea}>
                            <View style={[styles.moreCardIcon, { backgroundColor: `${color}16` }]}><Icon size={21} color={color} /></View>
                            <View style={styles.moreCardCopy}><Text style={styles.moreCardTitle}>{title}</Text><Text style={styles.moreCardDescription}>{description}</Text></View>
                            <View style={[styles.moreCardArrow, { backgroundColor: `${color}12` }]}><ChevronRight size={18} color={color} /></View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.sessionSection}>
                <View style={styles.moreGroupHeader}>
                  <View style={styles.sessionGroupIcon}><LogOut size={14} color={Theme.colors.state.error} /></View>
                  <Text style={styles.sessionGroupTitle}>SESIUNE</Text>
                  <View style={styles.sessionGroupLine} />
                </View>
                <TouchableOpacity
                  style={styles.logoutCard}
                  activeOpacity={0.76}
                  accessibilityRole="button"
                  accessibilityLabel="Delogare din aplicație"
                  onPress={() => setLogoutConfirmVisible(true)}>
                  <View style={styles.logoutCardIcon}><LogOut size={21} color={Theme.colors.state.error} /></View>
                  <View style={styles.moreCardCopy}>
                    <Text style={styles.logoutCardTitle}>Delogare</Text>
                    <Text style={styles.moreCardDescription}>Închide în siguranță sesiunea de pe acest telefon.</Text>
                  </View>
                  <View style={styles.logoutCardAction}><ChevronRight size={18} color={Theme.colors.state.error} /></View>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.primaryEmpty}>
              <View style={[styles.primaryEmptyIcon, { backgroundColor: `${details.color}14` }]}>
                <ScreenIcon size={32} color={details.color} />
              </View>
              <Text style={styles.primaryEmptyTitle}>{details.emptyTitle}</Text>
              <Text style={styles.primaryEmptyText}>{details.emptyText}</Text>
              <View style={[styles.comingSoonPill, { backgroundColor: `${details.color}14` }]}>
                <Text style={[styles.comingSoonText, { color: details.color }]}>IN CURAND</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <LogoutConfirmModal
          visible={logoutConfirmVisible}
          loading={logoutLoading}
          userName={user?.display_name || user?.username}
          onCancel={() => setLogoutConfirmVisible(false)}
          onConfirm={() => void confirmLogout()}
        />

        <ShopBottomNavigation activeTab={view} onSelect={(tab) => tab === 'orders' ? openOrders() : setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'nirs') {
    return (
      <View style={styles.container}>
        <Header title="NIR-uri" showBack onBack={() => setView('more')} right={notificationButton} />
        <ShopNirManager initialNirId={initialNirId} onInitialNirHandled={() => setInitialNirId(null)} />
      </View>
    );
  }

  if (view === 'invoice-configurator') {
    return (
      <View style={styles.container}>
        <Header title="Facturare SmartBill" showBack onBack={() => setView('more')} right={notificationButton} />
        <ShopInvoiceConfigurator bottomInset={insets.bottom} />
        <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'invoices') {
    return (
      <View style={styles.container}>
        <Header title="Facturi emise" showBack onBack={() => setView('more')} right={notificationButton} />
        <ShopInvoicesManager initialInvoiceId={initialInvoiceId} onInitialInvoiceHandled={() => setInitialInvoiceId(null)} />
        <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  if (view === 'sources' || view === 'suppliers' || view === 'payments' || view === 'shipping' || view === 'customers' || view === 'newsletter' || view === 'discounts' || view === 'company' || view === 'automations' || view === 'users') {
    const title = view === 'sources' ? 'Surse de aprovizionare' : view === 'suppliers' ? 'Furnizori' : view === 'payments' ? 'Metode de plată' : view === 'shipping' ? 'Livrări' : view === 'customers' ? 'Clienți' : view === 'newsletter' ? 'Abonați newsletter' : view === 'company' ? 'Datele firmei' : view === 'automations' ? 'Automatizări' : view === 'users' ? 'Utilizatori' : 'Reduceri';
    return (
      <View style={styles.container}>
        <Header title={title} showBack onBack={() => setView('more')} right={notificationButton} />
        <KeyboardAvoidingView style={styles.settingsKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          <ScrollView
            ref={settingsScrollRef}
            contentContainerStyle={{ paddingBottom: 180 + insets.bottom }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets>
            {view === 'sources' ? <ShopProductSourcesManager /> : view === 'suppliers' ? <ShopSuppliersManager /> : view === 'payments' ? <ShopPaymentMethodsManager /> : view === 'shipping' ? <ShopShippingManager /> : view === 'customers' ? <ShopCustomersManager onSearchFocus={() => setTimeout(() => settingsScrollRef.current?.scrollTo({ y: 390, animated: true }), 120)} onOpenOrder={(orderId) => openOrders('all', orderId)} /> : view === 'newsletter' ? <ShopNewsletterSubscribersManager onSearchFocus={() => setTimeout(() => settingsScrollRef.current?.scrollTo({ y: 370, animated: true }), 120)} /> : view === 'company' ? <ShopCompanySettingsManager onFieldFocus={revealSettingsField} /> : view === 'automations' ? <ShopAutomationsManager /> : view === 'users' ? <ShopUsersManager /> : <ShopDiscountsManager />}
          </ScrollView>
        </KeyboardAvoidingView>
        <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />
      </View>
    );
  }

  const isCategories = view === 'categories';
  const isBrands = view === 'brands';
  const compactCatalog = viewportWidth < 720;
  const viewTitle = isCategories ? 'Categorii și subcategorii' : isBrands ? 'Compatibilități branduri' : 'Producători';
  const viewSubtitle = isCategories ? 'Construiește o structură clară pentru fiecare produs.' : isBrands ? 'Grupează produsele după mărcile cu care sunt compatibile.' : 'Păstrează la îndemână companiile care fabrică produsele.';
  const viewCount = isCategories ? categories.length : isBrands ? brands.length : manufacturers.length;
  const catalogAccent = isCategories ? '#F45B7A' : isBrands ? '#009F8B' : '#087FF5';
  return (
    <View style={styles.container}>
      <Header
        title="Catalog SHOP"
        showBack
        onBack={() => setView('more')}
        right={
          <TouchableOpacity style={styles.headerAction} onPress={() => void loadCatalog()} disabled={loading}>
            <RefreshCw size={18} color={Colors.orange} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={[styles.catalogContent, { paddingBottom: 178 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <View style={styles.catalogHero}>
          <View style={[styles.catalogHeroAura, { backgroundColor: `${catalogAccent}10` }]} />
          <View style={[styles.catalogHeroIcon, { backgroundColor: `${catalogAccent}12` }]}>{isCategories ? <FolderTree size={27} color={catalogAccent} /> : isBrands ? <Tags size={27} color={catalogAccent} /> : <Factory size={27} color={catalogAccent} />}</View>
          <View style={styles.catalogHeroText}>
            <Text style={[styles.catalogKicker, { color: catalogAccent }]}>ORGANIZARE CATALOG</Text>
            <Text style={styles.catalogTitle}>{viewTitle}</Text>
            <Text style={styles.catalogSubtitle}>{viewSubtitle}</Text>
          </View>
          <View style={[styles.counter, { borderColor: `${catalogAccent}25` }]}><Text style={[styles.counterValue, { color: catalogAccent }]}>{viewCount}</Text><Text style={styles.counterLabel}>TOTAL</Text></View>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: isCategories }} style={[styles.tab, isCategories && styles.tabActive]} onPress={() => setView('categories')}><View style={[styles.tabIcon, isCategories && styles.tabIconActive]}><FolderTree size={16} color={isCategories ? '#FFFFFF' : '#F45B7A'} /></View><Text numberOfLines={1} style={[styles.tabText, isCategories && styles.tabTextActive]}>Categorii</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: isBrands }} style={[styles.tab, isBrands && styles.tabActive]} onPress={() => setView('brands')}><View style={[styles.tabIcon, isBrands && styles.tabIconActive]}><Tags size={16} color={isBrands ? '#FFFFFF' : '#009F8B'} /></View><Text numberOfLines={1} style={[styles.tabText, isBrands && styles.tabTextActive]}>Branduri</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: view === 'manufacturers' }} style={[styles.tab, view === 'manufacturers' && styles.tabActive]} onPress={() => setView('manufacturers')}><View style={[styles.tabIcon, view === 'manufacturers' && styles.tabIconActive]}><Factory size={16} color={view === 'manufacturers' ? '#FFFFFF' : '#087FF5'} /></View><Text numberOfLines={1} style={[styles.tabText, view === 'manufacturers' && styles.tabTextActive]}>Producători</Text></TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.stateBox}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se incarca datele...</Text></View>
        ) : error ? (
          <View style={styles.stateBox}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryButton} onPress={() => void loadCatalog()}><Text style={styles.retryText}>Incearca din nou</Text></TouchableOpacity></View>
        ) : isCategories ? (
          <CategoryTable compact={compactCatalog} categories={categories} onEdit={openCategoryForm} onDelete={(item) => setDeleteTarget({ type: 'category', item })} />
        ) : isBrands ? (
          <BrandTable compact={compactCatalog} brands={brands} onEdit={openBrandForm} onDelete={(item) => setDeleteTarget({ type: 'brand', item })} />
        ) : (
          <ManufacturerTable compact={compactCatalog} manufacturers={manufacturers} onEdit={openManufacturerForm} onDelete={(item) => setDeleteTarget({ type: 'manufacturer', item })} />
        )}
      </ScrollView>

      <View style={[styles.catalogFloatingActions, { bottom: 86 + insets.bottom }]}>
      <TouchableOpacity
        style={[styles.fab, { position: 'relative', right: 0, backgroundColor: catalogAccent }]}
        activeOpacity={0.82}
        accessibilityLabel={isCategories ? 'Adaugă categorie' : isBrands ? 'Adaugă compatibilitate brand' : 'Adaugă producător'}
        onPress={() => isCategories ? openCategoryForm() : isBrands ? openBrandForm() : openManufacturerForm()}>
        <Plus size={28} color={Colors.white} strokeWidth={2.6} />
      </TouchableOpacity>
      <ShopRegistryExportButton key={view} kind={isCategories ? 'categories' : isBrands ? 'brands' : 'manufacturers'} total={viewCount} />
      </View>

      <ShopBottomNavigation activeTab="more" onSelect={(tab) => setView(tab)} bottomInset={insets.bottom} />

      <Modal visible={categoryModal} transparent animationType="slide" onRequestClose={() => !saving && closeCategoryForm()}>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && closeCategoryForm()}>
          <Pressable style={[styles.modalCard, { paddingBottom: Math.max(20, insets.bottom) }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: '#F45B7A12' }]}><FolderTree size={24} color="#F45B7A" /></View>
              <View style={styles.modalHeaderCopy}><Text style={[styles.modalKicker, { color: '#F45B7A' }]}>STRUCTURĂ CATALOG</Text><Text style={styles.modalTitle}>{editingCategory ? 'Editează categoria' : 'Categorie nouă'}</Text><Text style={styles.modalSubtitle}>Imagine, identitate și poziție în catalog.</Text></View>
              <TouchableOpacity style={styles.closeButton} onPress={closeCategoryForm} disabled={saving}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
              {editingCategory?.is_protected ? <View style={styles.systemCategoryNote}>
                <View style={styles.systemCategoryNoteIcon}><LockKeyhole size={18} color={Colors.orange} /></View>
                <View style={styles.systemCategoryNoteCopy}><Text style={styles.systemCategoryNoteTitle}>Categorie permanentă a magazinului</Text><Text style={styles.systemCategoryNoteText}>O poți redenumi și activa sau dezactiva. ID-ul intern rămâne stabil, iar categoria nu poate fi ștearsă.</Text><Text selectable style={styles.systemCategoryKey}>ID: {editingCategory.system_key || editingCategory.id}</Text></View>
              </View> : null}
              <View style={styles.catalogFormSection}>
                <View style={styles.catalogFormSectionHead}><View style={styles.catalogFormStep}><Text style={styles.catalogFormStepText}>01</Text></View><View><Text style={styles.catalogFormSectionTitle}>Identitatea categoriei</Text><Text style={styles.catalogFormSectionText}>Numele și imaginea văzute în catalog.</Text></View></View>
                <Text style={styles.fieldLabel}>MINIATURĂ</Text>
                <View style={styles.imageRow}>
                  <TouchableOpacity style={styles.imagePicker} onPress={() => void pickCategoryImage()}>
                    {categoryImage && !categoryImageRemoved ? <Image source={{ uri: categoryImage }} style={styles.previewImage} /> : <ImageIcon size={27} color="#F45B7A" />}
                  </TouchableOpacity>
                  <View style={styles.imageActions}>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => void pickCategoryImage()}><Camera size={16} color="#F45B7A" /><Text style={[styles.secondaryButtonText, { color: '#F45B7A' }]}>Alege imaginea</Text></TouchableOpacity>
                    {categoryImage && !categoryImageRemoved && <TouchableOpacity onPress={() => { setCategoryImage(null); setCategoryImageBase64(null); setCategoryImageRemoved(true); }}><Text style={styles.removeImageText}>Șterge miniatura</Text></TouchableOpacity>}
                  </View>
                </View>
                <Text style={styles.fieldLabel}>NUME *</Text>
                <TextInput style={styles.input} value={categoryName} onChangeText={setCategoryName} placeholder="Ex: Accesorii" placeholderTextColor={Colors.textMuted} maxLength={120} />
                <Text style={styles.fieldLabel}>DESCRIERE</Text>
                <TextInput style={[styles.input, styles.textarea]} value={categoryDescription} onChangeText={setCategoryDescription} placeholder="Descriere scurtă pentru categorie" placeholderTextColor={Colors.textMuted} multiline maxLength={1000} />
              </View>
              <View style={styles.catalogFormSection}>
                <View style={styles.catalogFormSectionHead}><View style={styles.catalogFormStep}><Text style={styles.catalogFormStepText}>02</Text></View><View><Text style={styles.catalogFormSectionTitle}>Poziție și vizibilitate</Text><Text style={styles.catalogFormSectionText}>Alege nivelul și starea categoriei.</Text></View></View>
                <Text style={styles.fieldLabel}>CATEGORIE PĂRINTE</Text>
                <Text style={styles.fieldHint}>Alege un părinte doar dacă aceasta este o subcategorie.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.parentOptions}>
                  <ParentChip label="Fără părinte" selected={categoryParent === null} onPress={() => setCategoryParent(null)} />
                  {availableParents.map((category) => <ParentChip key={category.id} label={categoryHierarchyLabel(category, categories)} selected={categoryParent === category.id} onPress={() => setCategoryParent(category.id)} />)}
                </ScrollView>
                <View style={[styles.switchRow, categoryActive && styles.switchRowActive]}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Categorie activă</Text><Text style={styles.fieldHint}>Poate fi folosită în catalog.</Text></View><Switch value={categoryActive} onValueChange={setCategoryActive} trackColor={{ false: Theme.colors.border.default, true: '#F45B7A' }} thumbColor={Theme.colors.surface.base} /></View>
              </View>
              <TouchableOpacity style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={() => void saveCategory()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={18} color={Colors.white} /><Text style={styles.saveButtonText}>Salvează categoria</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={brandModal} transparent animationType="slide" onRequestClose={() => !saving && setBrandModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setBrandModal(false)}>
          <Pressable style={[styles.modalCard, styles.brandModal, { paddingBottom: Math.max(20, insets.bottom) }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: '#009F8B12' }]}><Tags size={24} color="#009F8B" /></View>
              <View style={styles.modalHeaderCopy}><Text style={[styles.modalKicker, { color: '#009F8B' }]}>COMPATIBILITATE SHOP</Text><Text style={styles.modalTitle}>{editingBrand ? 'Editează compatibilitatea' : 'Compatibilitate nouă'}</Text><Text style={styles.modalSubtitle}>Identitate și legătură oficială.</Text></View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setBrandModal(false)} disabled={saving}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
              <View style={styles.catalogFormSection}>
                <View style={styles.catalogFormSectionHead}><View style={styles.catalogFormStep}><Text style={styles.catalogFormStepText}>01</Text></View><View><Text style={styles.catalogFormSectionTitle}>Detaliile brandului</Text><Text style={styles.catalogFormSectionText}>Informațiile folosite în catalog.</Text></View></View>
                <Text style={styles.fieldLabel}>NUME *</Text>
                <TextInput style={styles.input} value={brandName} onChangeText={setBrandName} placeholder="Ex: Apple, Samsung" placeholderTextColor={Colors.textMuted} maxLength={120} />
                <Text style={styles.fieldLabel}>SITE WEB</Text>
                <TextInput style={styles.input} value={brandWebsite} onChangeText={setBrandWebsite} placeholder="https://..." placeholderTextColor={Colors.textMuted} autoCapitalize="none" keyboardType="url" maxLength={255} />
                <View style={[styles.switchRow, brandActive && styles.switchRowActive]}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Compatibilitate activă</Text><Text style={styles.fieldHint}>Poate fi asociată produselor.</Text></View><Switch value={brandActive} onValueChange={setBrandActive} trackColor={{ false: Theme.colors.border.default, true: '#009F8B' }} thumbColor={Theme.colors.surface.base} /></View>
              </View>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#009F8B' }, saving && styles.buttonDisabled]} onPress={() => void saveBrand()} disabled={saving}>
                  {saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={18} color={Colors.white} /><Text style={styles.saveButtonText}>Salvează compatibilitatea</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={manufacturerModal} transparent animationType="slide" onRequestClose={() => !saving && setManufacturerModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setManufacturerModal(false)}>
          <Pressable style={[styles.modalCard, styles.brandModal, { paddingBottom: Math.max(20, insets.bottom) }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: '#087FF512' }]}><Factory size={24} color="#087FF5" /></View>
              <View style={styles.modalHeaderCopy}><Text style={[styles.modalKicker, { color: '#087FF5' }]}>PRODUCĂTOR SHOP</Text><Text style={styles.modalTitle}>{editingManufacturer ? 'Editează producătorul' : 'Producător nou'}</Text><Text style={styles.modalSubtitle}>Identitate și prezență online.</Text></View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setManufacturerModal(false)} disabled={saving}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
              <View style={styles.catalogFormSection}>
                <View style={styles.catalogFormSectionHead}><View style={styles.catalogFormStep}><Text style={styles.catalogFormStepText}>01</Text></View><View><Text style={styles.catalogFormSectionTitle}>Detaliile producătorului</Text><Text style={styles.catalogFormSectionText}>Informațiile afișate în catalog.</Text></View></View>
                <Text style={styles.fieldLabel}>NUME *</Text>
                <TextInput style={styles.input} value={manufacturerName} onChangeText={setManufacturerName} placeholder="Ex: Bosch" placeholderTextColor={Colors.textMuted} maxLength={120} />
                <Text style={styles.fieldLabel}>SITE WEB</Text>
                <TextInput style={styles.input} value={manufacturerWebsite} onChangeText={setManufacturerWebsite} placeholder="https://..." placeholderTextColor={Colors.textMuted} autoCapitalize="none" keyboardType="url" maxLength={255} />
                <View style={[styles.switchRow, manufacturerActive && styles.switchRowActive]}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Producător activ</Text><Text style={styles.fieldHint}>Poate fi asociat produselor.</Text></View><Switch value={manufacturerActive} onValueChange={setManufacturerActive} trackColor={{ false: Theme.colors.border.default, true: '#087FF5' }} thumbColor={Theme.colors.surface.base} /></View>
              </View>
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#087FF5' }, saving && styles.buttonDisabled]} onPress={() => void saveManufacturer()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={18} color={Colors.white} /><Text style={styles.saveButtonText}>Salvează producătorul</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !saving && setDeleteTarget(null)}>
        <Pressable style={[styles.modalBackdrop, styles.deleteBackdrop]} onPress={() => !saving && setDeleteTarget(null)}>
          <Pressable style={styles.deletePanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.deleteIcon}><Trash2 size={25} color={Colors.error} /></View>
            <Text style={styles.deleteKicker}>CONFIRMARE STERGERE</Text>
            <Text style={styles.deleteTitle}>{deleteTarget?.type === 'category' ? 'Stergi categoria?' : deleteTarget?.type === 'brand' ? 'Stergi compatibilitatea?' : 'Stergi producatorul?'}</Text>
            <Text style={styles.deleteText}>
              {deleteTarget ? `„${deleteTarget.item.name}” va fi sters definitiv.` : ''}
              {deleteTarget?.type === 'category' ? ' Subcategoriile sale vor ramane in catalog fara parinte.' : ''}
            </Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setDeleteTarget(null)} disabled={saving}><Text style={styles.cancelButtonText}>Renunta</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.deleteButton, saving && styles.buttonDisabled]} onPress={() => void performDelete()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} /> : <><Trash2 size={17} color={Colors.white} /><Text style={styles.deleteButtonText}>Sterge</Text></>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ShopBottomNavigation({
  activeTab,
  onSelect,
  bottomInset,
}: {
  activeTab: PrimaryTab;
  onSelect: (tab: PrimaryTab) => void;
  bottomInset: number;
}) {
  return (
    <View
      style={[
        styles.bottomNavigation,
        { height: 66 + bottomInset, paddingBottom: Math.max(bottomInset, 6) },
      ]}>
      {primaryTabs.map(({ key, title, Icon }) => {
        const active = activeTab === key;
        return (
          <TouchableOpacity
            key={key}
            style={styles.bottomNavigationItem}
            activeOpacity={0.72}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(key)}>
            <View style={styles.bottomNavigationIcon}>
              <Icon
                size={21}
                color={active ? Colors.orange : Colors.textMuted}
                strokeWidth={active ? 2.6 : 2.1}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.bottomNavigationLabel, active && styles.bottomNavigationLabelActive]}>
              {title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function isCategoryDescendant(candidateId: string, ancestorId: string, categories: ShopCategory[]): boolean {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const visited = new Set<string>();
  let cursor = byId.get(candidateId);
  while (cursor?.parent_id && !visited.has(cursor.id)) {
    if (cursor.parent_id === ancestorId) return true;
    visited.add(cursor.id);
    cursor = byId.get(cursor.parent_id);
  }
  return false;
}

function categoryHierarchyLabel(category: ShopCategory, categories: ShopCategory[]): string {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const names = [category.name];
  const visited = new Set([category.id]);
  let parentId = category.parent_id;
  while (parentId && !visited.has(parentId) && names.length < 8) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parent_id;
  }
  return names.join(' › ');
}

function ParentChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[styles.parentChip, selected && styles.parentChipActive]} onPress={onPress}><Text numberOfLines={1} style={[styles.parentChipText, selected && styles.parentChipTextActive]}>{label}</Text></TouchableOpacity>;
}

function CategoryTable({ categories, onEdit, onDelete, compact = false }: { categories: ShopCategory[]; onEdit: (item: ShopCategory) => void; onDelete: (item: ShopCategory) => void; compact?: boolean }) {
  if (!categories.length) return <EmptyCatalog icon={<FolderTree size={31} color="#F45B7A" />} kicker="STRUCTURĂ CATALOG" title="Catalogul așteaptă prima categorie" text="Adaugă o categorie principală, apoi organizează subcategoriile exact cum ai nevoie." />;
  if (compact) return <View style={styles.catalogCardList}>{categories.map((category) => <View key={category.id} style={styles.catalogEntityCard}>
    <View style={styles.catalogEntityTop}>
      {category.thumbnail_url ? <Image source={{ uri: category.thumbnail_url }} style={styles.catalogEntityImage} /> : <View style={[styles.catalogEntityImageFallback, { backgroundColor: '#F45B7A12' }]}>{category.is_protected ? <LockKeyhole size={22} color="#F45B7A" /> : <FolderTree size={23} color="#F45B7A" />}</View>}
      <View style={styles.catalogEntityCopy}><View style={styles.catalogEntityTitleRow}><Text numberOfLines={1} style={styles.catalogEntityTitle}>{category.name}</Text>{category.is_protected ? <View style={styles.systemPill}><LockKeyhole size={10} color="#A45100" /><Text style={styles.systemPillText}>SISTEM</Text></View> : null}</View><Text numberOfLines={1} style={styles.catalogEntitySlug}>/{category.slug}</Text></View>
      <StatusBadge active={category.is_active} />
    </View>
    {category.description ? <Text numberOfLines={2} style={styles.catalogEntityDescription}>{category.description}</Text> : null}
    <View style={styles.catalogEntityFooter}><View style={styles.catalogEntityMeta}><FolderTree size={15} color="#F45B7A" /><View><Text style={styles.catalogEntityMetaLabel}>POZIȚIE ÎN CATALOG</Text><Text numberOfLines={1} style={styles.catalogEntityMetaValue}>{category.parent_name || 'Categorie principală'}</Text></View></View><View style={styles.catalogEntityActions}><TableAction label="Editează" onPress={() => onEdit(category)} icon={<Pencil size={17} color="#087FF5" />} />{category.is_protected ? <View accessibilityLabel="Categorie protejată împotriva ștergerii" style={styles.tableActionLocked}><LockKeyhole size={16} color="#A45100" /></View> : <TableAction label="Șterge" onPress={() => onDelete(category)} icon={<Trash2 size={17} color={Colors.error} />} danger />}</View></View>
  </View>)}</View>;
  return (
    <View style={styles.tableCard}><ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.tableWide}>
      <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colImage]}>POZA</Text><Text style={[styles.th, styles.colName]}>CATEGORIE</Text><Text style={[styles.th, styles.colParent]}>PARINTE</Text><Text style={[styles.th, styles.colStatus]}>STATUS</Text><Text style={[styles.th, styles.colActions]}>ACTIUNI</Text></View>
      {categories.map((category) => <View key={category.id} style={styles.tableRow}>
        <View style={styles.colImage}>{category.thumbnail_url ? <Image source={{ uri: category.thumbnail_url }} style={styles.tableImage} /> : category.parent_id ? <View style={styles.tableImageFallback}><ImageIcon size={18} color={Colors.textMuted} /></View> : null}</View>
        <View style={styles.colName}><View style={styles.cellTitleRow}><Text style={styles.cellTitle}>{category.name}</Text></View><Text style={styles.cellSub} numberOfLines={1}>/{category.slug}</Text>{category.description ? <Text style={styles.cellDescription} numberOfLines={1}>{category.description}</Text> : null}</View>
        <View style={styles.colParent}><Text style={category.parent_name ? styles.cellText : styles.cellMuted}>{category.parent_name || 'Categorie principala'}</Text></View>
        <View style={styles.colStatus}><StatusBadge active={category.is_active} /></View>
        <View style={[styles.colActions, styles.actionRow]}><TableAction label="Editeaza" onPress={() => onEdit(category)} icon={<Pencil size={16} color="#087FF5" />} />{category.is_protected ? <View accessibilityLabel="Categorie protejata impotriva stergerii" style={styles.tableActionLocked}><LockKeyhole size={16} color="#A8EAF4" /></View> : <TableAction label="Sterge" onPress={() => onDelete(category)} icon={<Trash2 size={16} color={Colors.error} />} danger />}</View>
      </View>)}
    </View></ScrollView></View>
  );
}

function BrandTable({ brands, onEdit, onDelete, compact = false }: { brands: ShopBrand[]; onEdit: (item: ShopBrand) => void; onDelete: (item: ShopBrand) => void; compact?: boolean }) {
  if (!brands.length) return <EmptyCatalog icon={<Tags size={31} color="#009F8B" />} kicker="COMPATIBILITĂȚI" title="Adaugă primul brand compatibil" text="Clienții vor înțelege mai ușor pentru ce mărci este potrivit fiecare produs." />;
  if (compact) return <View style={styles.catalogCardList}>{brands.map((brand) => <CatalogRegistryCard key={brand.id} item={brand} kind="brand" onEdit={() => onEdit(brand)} onDelete={() => onDelete(brand)} />)}</View>;
  return (
    <View style={styles.tableCard}><ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.tableWide}>
      <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colBrandName]}>COMPATIBILITATE</Text><Text style={[styles.th, styles.colWebsite]}>SITE WEB</Text><Text style={[styles.th, styles.colStatus]}>STATUS</Text><Text style={[styles.th, styles.colActions]}>ACTIUNI</Text></View>
      {brands.map((brand) => <View key={brand.id} style={styles.tableRow}>
        <View style={styles.colBrandName}><Text style={styles.cellTitle}>{brand.name}</Text><Text style={styles.cellSub}>/{brand.slug}</Text></View>
        <View style={styles.colWebsite}><Text style={brand.website_url ? styles.cellText : styles.cellMuted} numberOfLines={1}>{brand.website_url || '—'}</Text></View>
        <View style={styles.colStatus}><StatusBadge active={brand.is_active} /></View>
        <View style={[styles.colActions, styles.actionRow]}><TableAction label="Editeaza" onPress={() => onEdit(brand)} icon={<Pencil size={16} color="#087FF5" />} /><TableAction label="Sterge" onPress={() => onDelete(brand)} icon={<Trash2 size={16} color={Colors.error} />} danger /></View>
      </View>)}
    </View></ScrollView></View>
  );
}

function ManufacturerTable({ manufacturers, onEdit, onDelete, compact = false }: { manufacturers: ShopManufacturer[]; onEdit: (item: ShopManufacturer) => void; onDelete: (item: ShopManufacturer) => void; compact?: boolean }) {
  if (!manufacturers.length) return <EmptyCatalog icon={<Factory size={31} color="#087FF5" />} kicker="PRODUCĂTORI" title="Adaugă primul producător" text="Centralizează firmele care fabrică produsele și păstrează datele catalogului curate." />;
  if (compact) return <View style={styles.catalogCardList}>{manufacturers.map((manufacturer) => <CatalogRegistryCard key={manufacturer.id} item={manufacturer} kind="manufacturer" onEdit={() => onEdit(manufacturer)} onDelete={() => onDelete(manufacturer)} />)}</View>;
  return (
    <View style={styles.tableCard}><ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.tableWide}>
      <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colBrandName]}>PRODUCATOR</Text><Text style={[styles.th, styles.colWebsite]}>SITE WEB</Text><Text style={[styles.th, styles.colStatus]}>STATUS</Text><Text style={[styles.th, styles.colActions]}>ACTIUNI</Text></View>
      {manufacturers.map((manufacturer) => <View key={manufacturer.id} style={styles.tableRow}>
        <View style={styles.colBrandName}><Text style={styles.cellTitle}>{manufacturer.name}</Text><Text style={styles.cellSub}>/{manufacturer.slug}</Text></View>
        <View style={styles.colWebsite}><Text style={manufacturer.website_url ? styles.cellText : styles.cellMuted} numberOfLines={1}>{manufacturer.website_url || '—'}</Text></View>
        <View style={styles.colStatus}><StatusBadge active={manufacturer.is_active} /></View>
        <View style={[styles.colActions, styles.actionRow]}><TableAction label="Editeaza" onPress={() => onEdit(manufacturer)} icon={<Pencil size={16} color="#087FF5" />} /><TableAction label="Sterge" onPress={() => onDelete(manufacturer)} icon={<Trash2 size={16} color={Colors.error} />} danger /></View>
      </View>)}
    </View></ScrollView></View>
  );
}

function CatalogRegistryCard({ item, kind, onEdit, onDelete }: { item: ShopBrand | ShopManufacturer; kind: 'brand' | 'manufacturer'; onEdit: () => void; onDelete: () => void }) {
  const isBrand = kind === 'brand';
  const accent = isBrand ? '#009F8B' : '#087FF5';
  return <View style={styles.catalogEntityCard}>
    <View style={styles.catalogEntityTop}>
      <View style={[styles.catalogEntityImageFallback, { backgroundColor: `${accent}12` }]}>{isBrand ? <Tags size={23} color={accent} /> : <Factory size={23} color={accent} />}</View>
      <View style={styles.catalogEntityCopy}><Text numberOfLines={1} style={styles.catalogEntityTitle}>{item.name}</Text><Text numberOfLines={1} style={[styles.catalogEntitySlug, { color: accent }]}>/{item.slug}</Text></View>
      <StatusBadge active={item.is_active} />
    </View>
    <View style={styles.catalogEntityFooter}><View style={styles.catalogEntityMeta}>{isBrand ? <Tags size={15} color={accent} /> : <Factory size={15} color={accent} />}<View style={styles.catalogEntityMetaCopy}><Text style={styles.catalogEntityMetaLabel}>{isBrand ? 'SITE COMPATIBILITATE' : 'SITE PRODUCĂTOR'}</Text><Text numberOfLines={1} style={item.website_url ? styles.catalogEntityMetaValue : styles.catalogEntityMetaMuted}>{item.website_url || 'Nespecificat'}</Text></View></View><View style={styles.catalogEntityActions}><TableAction label="Editează" onPress={onEdit} icon={<Pencil size={17} color="#087FF5" />} /><TableAction label="Șterge" onPress={onDelete} icon={<Trash2 size={17} color={Colors.error} />} danger /></View></View>
  </View>;
}

function formatShopMoney(value: number) {
  return `${shopMoneyFormatter.format(Number(value || 0))} lei`;
}

function compactShopMoney(value: number) {
  return `${shopCompactMoneyFormatter.format(Number(value || 0))} lei`;
}

function isoDateFromLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateFromIso(value: string, fallback = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fallback;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(parsed.getTime()) || isoDateFromLocalDate(parsed) !== value ? fallback : parsed;
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isoDateFromLocalDate(localDateFromIso(value, new Date(0))) === value;
}

function formatDashboardPickerDate(value: string) {
  if (!value) return 'Alege data';
  return new Intl.DateTimeFormat('ro-RO', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(localDateFromIso(value)).replace('.', '');
}

function formatDashboardRangeLabel(period: DashboardPeriod, range?: ShopDashboardStats['range'], customStart = '', customEnd = '') {
  const label = dashboardMobilePeriods.find(([value]) => value === period)?.[1];
  if (period !== 'custom') return label || (period === '24h' ? 'Ultimele 24 de ore' : 'Alege perioada');
  const rangeStart = customStart || range?.start || '';
  const rangeEnd = customEnd || range?.end || '';
  if (!rangeStart || !rangeEnd) return 'Interval personalizat';
  const start = new Date(`${rangeStart}T12:00:00`);
  const end = new Date(`${rangeEnd}T12:00:00`);
  const startText = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' }).format(start).replace('.', '');
  const endText = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }).format(end).replace('.', '');
  return rangeStart === rangeEnd ? endText : `${startText} – ${endText}`;
}

function chartLineGeometry(values: number[], maximum: number, width: number, height: number, visualOffset = 0) {
  const bottom = height - 12;
  const step = values.length > 1 ? (width - 24) / (values.length - 1) : 0;
  let length = 0;
  let previous: { x: number; y: number } | null = null;
  const points = values.map((value, index) => {
    const x = 12 + index * step;
    const numericValue = Math.max(0, Number(value || 0));
    const rawY = bottom - (numericValue / Math.max(1, maximum)) * (height - 28);
    const y = numericValue > 0 ? Math.max(6, Math.min(bottom, rawY + visualOffset)) : rawY;
    if (previous) length += Math.hypot(x - previous.x, y - previous.y);
    previous = { x, y };
    return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return { path: points.join(' '), length: Math.max(1, length) };
}

function chartPointY(value: number, maximum: number, height: number, visualOffset = 0) {
  const bottom = height - 12;
  const numericValue = Math.max(0, Number(value || 0));
  const rawY = bottom - (numericValue / Math.max(1, maximum)) * (height - 28);
  return numericValue > 0 ? Math.max(6, Math.min(bottom, rawY + visualOffset)) : rawY;
}

function dashboardBucketDate(value: string) {
  const normalized = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value.slice(0, 19);
  const parsed = new Date(normalized.includes(' ') ? normalized.replace(' ', 'T') : `${normalized}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(2000, 0, 1, 12) : parsed;
}

function dashboardAxisLabel(value: string, granularity: DashboardGranularity, rowCount: number) {
  const date = dashboardBucketDate(value);
  const options: Intl.DateTimeFormatOptions = granularity === 'hour'
    ? { hour: '2-digit' }
    : granularity === 'month'
      ? (rowCount > 12 ? { month: 'short', year: '2-digit' } : { month: 'short' })
      : granularity === 'week'
        ? { day: 'numeric', month: 'short' }
        : rowCount <= 8 ? { weekday: 'short' } : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat('ro-RO', options).format(date).replace('.', '');
}

function dashboardTooltipDate(value: string, granularity: DashboardGranularity) {
  const options: Intl.DateTimeFormatOptions = granularity === 'hour'
    ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : granularity === 'month'
      ? { month: 'long', year: 'numeric' }
      : granularity === 'week'
        ? { day: 'numeric', month: 'short', year: 'numeric' }
        : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('ro-RO', options).format(dashboardBucketDate(value)).replace('.', '');
}

const AnimatedChartLine = React.memo(function AnimatedChartLine({ values, maximum, width, height, color, selected, visualOffset = 0, strokeWidth = 2.4 }: { values: number[]; maximum: number; width: number; height: number; color: string; selected: boolean; visualOffset?: number; strokeWidth?: number }) {
  const motion = useSharedValue(selected ? 1 : 0);
  const previousPath = useRef('');
  const geometry = useMemo(() => chartLineGeometry(values, maximum, width, height, visualOffset), [height, maximum, values, visualOffset, width]);
  useEffect(() => {
    cancelAnimation(motion);
    if (selected && previousPath.current !== geometry.path) motion.value = 0;
    previousPath.current = geometry.path;
    motion.value = withTiming(selected ? 1 : 0, {
      duration: selected ? 560 : 460,
      easing: ReanimatedEasing.bezier(0.2, 0.8, 0.2, 1),
    });
    return () => cancelAnimation(motion);
  }, [geometry.path, motion, selected]);
  const animatedProps = useAnimatedProps(() => ({
    opacity: 0.06 + motion.value * 0.94,
    transform: [
      { translateY: height - 12 },
      { scaleY: Math.max(0.001, motion.value) },
      { translateY: -(height - 12) },
    ],
  }));
  return <ReanimatedSvgPath animatedProps={animatedProps} d={geometry.path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
});

function DashboardTrendChart({ rows, selected, granularity, dismissRef, scrollGesture }: { rows: ShopDashboardStats['daily_stats']; selected: DashboardSeriesKey[]; granularity: DashboardGranularity; dismissRef: React.MutableRefObject<(() => void) | null>; scrollGesture: NativeGesture }) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(260, Math.min(windowWidth - 64, 720));
  const height = 176;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gestureStartX = useSharedValue(0);
  const gestureStartY = useSharedValue(0);
  const safeRows = useMemo(() => rows.length ? rows : Array.from({ length: 7 }, (_, index) => ({ date: `2000-01-${String(index + 1).padStart(2, '0')}`, collected_revenue: 0, pending_cash: 0, gross_revenue: 0, returns_count: 0, returns_total: 0, revenue: 0, orders_count: 0, acquisitions: 0, cost_of_goods_sold: 0, profit: 0 })), [rows]);
  const chartValues = useMemo(() => ({
    revenue: safeRows.map((row) => Number(row.revenue || 0)),
    returns: safeRows.map((row) => Number(row.returns_total || 0)),
    pending: safeRows.map((row) => Number(row.pending_cash || 0)),
    orders: safeRows.map((row) => Number(row.orders_count || 0)),
  }), [safeRows]);
  const moneyMaximum = useMemo(() => Math.max(1, ...chartValues.revenue, ...chartValues.returns, ...chartValues.pending), [chartValues]);
  const orderMaximum = useMemo(() => Math.max(1, ...chartValues.orders), [chartValues]);
  const labels = useMemo(() => rows.length ? safeRows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => index === 0 || index === safeRows.length - 1 || index % Math.max(1, Math.ceil(safeRows.length / 4)) === 0)
    .map(({ row, index }) => ({ key: `${row.date}-${index}`, text: dashboardAxisLabel(String(row.date), granularity, safeRows.length) })) : [], [granularity, rows.length, safeRows]);
  const selectedIndex = activeIndex === null ? null : Math.max(0, Math.min(safeRows.length - 1, activeIndex));
  const selectedRow = selectedIndex === null ? null : safeRows[selectedIndex];
  const selectedX = selectedIndex === null ? 12 : 12 + (safeRows.length > 1 ? selectedIndex * (width - 24) / (safeRows.length - 1) : 0);
  const selectTouchPoint = useCallback((locationX: number) => {
    const ratio = Math.max(0, Math.min(1, (locationX - 12) / Math.max(1, width - 24)));
    const nextIndex = Math.round(ratio * Math.max(0, safeRows.length - 1));
    setActiveIndex((current) => current === nextIndex ? current : nextIndex);
  }, [safeRows.length, width]);
  const chartGesture = useMemo(() => {
    const horizontalPan = Gesture.Pan()
      .manualActivation(true)
      .averageTouches(true)
      .shouldCancelWhenOutside(false)
      // Tine scrollul vertical in asteptare doar pana cand directia miscarii
      // devine clara: orizontal = grafic, vertical = pagina.
      .blocksExternalGesture(scrollGesture)
      .onTouchesDown((event, state) => {
        'worklet';
        const touch = event.allTouches[0];
        if (!touch || event.numberOfTouches !== 1) { state.fail(); return; }
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutable on the UI thread.
        gestureStartX.value = touch.x;
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutable on the UI thread.
        gestureStartY.value = touch.y;
      })
      .onTouchesMove((event, state) => {
        'worklet';
        const touch = event.allTouches[0];
        if (!touch || event.numberOfTouches !== 1) { state.fail(); return; }
        const deltaX = Math.abs(touch.x - gestureStartX.value);
        const deltaY = Math.abs(touch.y - gestureStartY.value);
        // Decide directia devreme, ca pagina si graficul sa nu poata raspunde
        // simultan la aceeasi glisare.
        if (deltaY >= 4 && deltaY >= deltaX * 0.9) state.fail();
        else if (deltaX >= 7 && deltaX > deltaY * 1.12) state.activate();
        else if (Math.max(deltaX, deltaY) >= 18) state.fail();
      })
      .onStart((event) => {
        'worklet';
        runOnJS(selectTouchPoint)(event.x);
      })
      .onUpdate((event) => {
        'worklet';
        runOnJS(selectTouchPoint)(event.x);
      });
    const pointTap = Gesture.Tap()
      .maxDistance(7)
      .maxDuration(350)
      .simultaneousWithExternalGesture(scrollGesture)
      .onEnd((event, success) => {
        'worklet';
        if (success) runOnJS(selectTouchPoint)(event.x);
      });
    return Gesture.Exclusive(horizontalPan, pointTap);
  }, [gestureStartX, gestureStartY, scrollGesture, selectTouchPoint]);
  useEffect(() => {
    const dismiss = () => setActiveIndex(null);
    dismissRef.current = dismiss;
    return () => { if (dismissRef.current === dismiss) dismissRef.current = null; };
  }, [dismissRef]);
  const allTooltipRows: { key: DashboardSeriesKey; label: string; color: string; value: string }[] = selectedRow ? [
    { key: 'revenue', label: 'Încasări', color: Theme.colors.brand.primaryText, value: formatShopMoney(Number(selectedRow.revenue || 0)) },
    { key: 'returns', label: `Retururi (${Number(selectedRow.returns_count || 0)})`, color: Theme.colors.data.returns, value: formatShopMoney(Number(selectedRow.returns_total || 0)) },
    { key: 'pending', label: 'De încasat', color: Theme.colors.state.warning, value: formatShopMoney(Number(selectedRow.pending_cash || 0)) },
    { key: 'orders', label: 'Comenzi', color: Theme.colors.data.orders, value: String(Number(selectedRow.orders_count || 0)) },
  ] : [];
  const tooltipRows = allTooltipRows.filter((item) => selected.includes(item.key));
  return <View style={styles.trendCard}>
    <View style={styles.trendChartWrap}>
      <GestureDetector gesture={chartGesture}>
      <View style={[styles.trendTouchSurface, { width, height }]}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Line x1="12" y1="12" x2={width - 12} y2="12" stroke="#DCE8F1" strokeWidth="1" />
          <Line x1="12" y1={height / 2} x2={width - 12} y2={height / 2} stroke="#DCE8F1" strokeWidth="1" />
          <Line x1="12" y1={height - 12} x2={width - 12} y2={height - 12} stroke="#C9DBE8" strokeWidth="1" />
          <AnimatedChartLine values={chartValues.revenue} maximum={moneyMaximum} width={width} height={height} color="#087FF5" selected={selected.includes('revenue')} />
          <AnimatedChartLine values={chartValues.returns} maximum={moneyMaximum} width={width} height={height} color="#F472B6" selected={selected.includes('returns')} />
          <AnimatedChartLine values={chartValues.pending} maximum={moneyMaximum} width={width} height={height} color="#FBBF24" selected={selected.includes('pending')} />
          <AnimatedChartLine values={chartValues.orders} maximum={orderMaximum} width={width} height={height} color="#F28B82" selected={selected.includes('orders')} visualOffset={-5} strokeWidth={3.2} />
          {selectedRow && <><Line x1={selectedX} y1="10" x2={selectedX} y2={height - 12} stroke="#536A80" strokeWidth="1" strokeDasharray="3 3" opacity="0.62" />
            {selected.includes('revenue') && <Circle cx={selectedX} cy={chartPointY(Number(selectedRow.revenue || 0), moneyMaximum, height)} r="4" fill="#F7FAFD" stroke="#087FF5" strokeWidth="2" />}
            {selected.includes('returns') && <Circle cx={selectedX} cy={chartPointY(Number(selectedRow.returns_total || 0), moneyMaximum, height)} r="4" fill="#F7FAFD" stroke="#F472B6" strokeWidth="2" />}
            {selected.includes('pending') && <Circle cx={selectedX} cy={chartPointY(Number(selectedRow.pending_cash || 0), moneyMaximum, height)} r="4" fill="#F7FAFD" stroke="#FBBF24" strokeWidth="2" />}
            {selected.includes('orders') && <Circle cx={selectedX} cy={chartPointY(Number(selectedRow.orders_count || 0), orderMaximum, height, -5)} r="4.5" fill="#F7FAFD" stroke="#F28B82" strokeWidth="2.6" />}</>}
        </Svg>
        {selectedRow && <View pointerEvents="none" style={[styles.trendTooltip, { left: Math.max(4, Math.min(width - 190, selectedX - 93)) }]}><Text style={styles.trendTooltipDate}>{dashboardTooltipDate(String(selectedRow.date), granularity)}</Text>{tooltipRows.map((item) => <View key={item.key} style={styles.trendTooltipRow}><View style={[styles.trendTooltipDot, { backgroundColor: item.color }]} /><Text style={styles.trendTooltipLabel}>{item.label}</Text><Text style={styles.trendTooltipValue}>{item.value}</Text></View>)}</View>}
      </View>
      </GestureDetector>
      <View style={[styles.trendLabels, { width }]}>{labels.map((label) => <Text key={label.key} style={styles.trendLabel}>{label.text}</Text>)}</View>
      <Text style={styles.trendTouchHint}>Atinge sau glisează pe grafic pentru detalii</Text>
    </View>
  </View>;
}

function DashboardMetric({ title, value, color, selected, onPress }: { title: string; value: string; color: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity activeOpacity={0.78} onPress={onPress} style={[styles.dashboardMetric, { borderColor: selected ? color : '#5F6368', backgroundColor: selected ? color : 'transparent' }]}><Text style={[styles.dashboardMetricTitle, selected && styles.dashboardMetricSelectedText]}>{title}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.dashboardMetricValue, selected && styles.dashboardMetricSelectedText]}>{value}</Text></TouchableOpacity>;
}

function StatusBadge({ active }: { active: boolean }) {
  return <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}><View style={[styles.badgeDot, { backgroundColor: active ? Colors.success : Colors.textMuted }]} /><Text style={[styles.badgeText, { color: active ? '#168457' : Colors.textSecondary }]}>{active ? 'Activă' : 'Inactivă'}</Text></View>;
}

function TableAction({ label, icon, onPress, danger }: { label: string; icon: React.ReactNode; onPress: () => void; danger?: boolean }) {
  return <TouchableOpacity accessibilityLabel={label} style={[styles.tableAction, danger && styles.tableActionDanger]} onPress={onPress}>{icon}</TouchableOpacity>;
}

function EmptyCatalog({ icon, kicker, title, text }: { icon: React.ReactNode; kicker: string; title: string; text: string }) {
  return <View style={styles.emptyBox}><View style={styles.emptyAura} /><View style={styles.emptyIcon}>{icon}</View><Text style={styles.emptyKicker}>{kicker}</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text><View style={styles.emptyHint}><Plus size={15} color="#087FF5" /><Text style={styles.emptyHintText}>Folosește butonul plutitor pentru a începe</Text></View></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  settingsKeyboard: { flex: 1 },
  content: { padding: 16, paddingBottom: 38 },
  homePageMotion: { flex: 1, backgroundColor: Theme.colors.background.canvas },
  homePage: { paddingTop: 11 },
  homeHero: { minHeight: 182, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', borderRadius: 29, marginHorizontal: 9, paddingHorizontal: 25, paddingTop: 20, paddingBottom: 34, backgroundColor: Colors.blue, shadowColor: Colors.blue, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 9 },
  homeHeroGradient: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  homeHeroGlowLarge: { position: 'absolute', right: -4, top: 33, width: 126, height: 126, borderRadius: 63, backgroundColor: '#FFFFFF18' },
  homeHeroGlowSmall: { position: 'absolute', right: 43, top: 86, width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFE0B8' },
  homeHeroCopy: { zIndex: 1, flex: 1, maxWidth: '70%' },
  homeHeroTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6 },
  homeHeroTitle: { flexShrink: 1, color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 23, lineHeight: 29, letterSpacing: -0.6 },
  homeHeroWave: { fontSize: 34, lineHeight: 38 },
  homeHeroHint: { maxWidth: 258, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: '#FFFFFF35', borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#0C3A6926', marginTop: 8 },
  homeHeroText: { minWidth: 0, flex: 1, color: '#F3FCFF', fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15 },
  homeHeroChartIcon: { width: 84, height: 84, zIndex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 42, backgroundColor: '#FFFFFF17' },
  homeSheet: {
    zIndex: 2,
    borderTopWidth: 1,
    borderColor: '#DCE8F3',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    overflow: 'hidden',
    backgroundColor: '#F8FBFE',
  },
  homeScroll: { flex: 1 },
  homeContent: { paddingTop: 18 },
  homeOverviewHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 2, marginBottom: 5 },
  homeOverviewIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#E8F3FF' },
  homeOverviewCopy: { minWidth: 0, flex: 1 },
  homeOverviewTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 20, lineHeight: 25, letterSpacing: -0.4 },
  homeOverviewText: { color: '#74869A', fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, marginTop: 1 },
  hero: { overflow: 'hidden', borderWidth: 0, borderRadius: 28, padding: 24, backgroundColor: Theme.colors.surface.base },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, heroIcon: { width: 44, height: 44, borderWidth: 1, borderColor: 'rgba(56,189,248,0.30)', borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(56,189,248,0.10)' }, heroRefresh: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Theme.colors.surface.muted },
  productHero: { minHeight: 154, position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 13, marginHorizontal: 12, marginTop: 10, padding: 17, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 27, backgroundColor: Theme.colors.surface.base, shadowColor: '#2B5E85', shadowOpacity: .08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  productHeroAura: { width: 200, height: 200, position: 'absolute', right: -95, top: -105, borderRadius: 100, backgroundColor: Theme.colors.surface.brandSoft },
  productHeroIcon: { width: 62, height: 62, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: Theme.colors.surface.brandSoft, transform: [{ rotate: '-4deg' }] },
  productHeroCopy: { minWidth: 0, flex: 1 }, productHeroTitle: { marginTop: 4, color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 20, lineHeight: 25 }, productHeroText: { maxWidth: 250, marginTop: 5, color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15 },
  productHeroBadge: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: Theme.colors.state.successSoft }, productHeroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.colors.state.success }, productHeroBadgeText: { color: Theme.colors.state.success, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: .7 },
  kicker: { color: Theme.colors.brand.primaryText, fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1.5 },
  title: { color: Colors.textPrimary, fontSize: 31, fontFamily: 'Inter-Bold', letterSpacing: 1, marginTop: 5 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20, fontFamily: 'Inter-Regular', marginTop: 8 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(34,197,94,0.07)', marginTop: 18 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  statusText: { color: Theme.colors.state.success, fontSize: 9, fontFamily: 'Inter-SemiBold' },
  periodSelector: { flexDirection: 'row', paddingTop: 14, paddingBottom: 2 },
  periodButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRightWidth: 0, borderColor: Theme.colors.border.default, borderRadius: 0, paddingHorizontal: 15, backgroundColor: Theme.colors.surface.base },
  periodButtonActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.brandSoft },
  periodMoreButton: { borderRightWidth: 1, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  periodButtonText: { color: Theme.colors.text.secondary, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  periodButtonTextActive: { color: Theme.colors.state.info },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 13, paddingHorizontal: 2 },
  sectionKicker: { color: Colors.orange, fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 1.3 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold', marginTop: 4 },
  sectionSeeAll: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 999, paddingHorizontal: 13, backgroundColor: Theme.colors.surface.muted },
  sectionSeeAllText: { color: Colors.navy, fontFamily: 'Inter-Bold', fontSize: 9 },
  mobileAnalytics: { minHeight: 345, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 24, paddingTop: 14, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: Theme.colors.surface.subtle, marginTop: 11 },
  analyticsToolbar: { zIndex: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  analyticsDateTrigger: { minWidth: 0, minHeight: 38, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 2 }, analyticsDateText: { minWidth: 0, flexShrink: 1, color: Theme.colors.text.secondary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  analyticsGranularityAnchor: { flexShrink: 0 },
  analyticsGranularityTrigger: { minWidth: 102, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 14, paddingHorizontal: 12, backgroundColor: Theme.colors.surface.muted },
  analyticsGranularityTriggerOpen: { borderColor: '#087FF5A8', backgroundColor: Theme.colors.surface.muted },
  analyticsGranularityTriggerLabel: { color: '#7E91AE', fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 1.05, marginBottom: 2 },
  analyticsGranularityText: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  analyticsGranularityBackdrop: { flex: 1, backgroundColor: 'rgba(4,6,9,0.18)' },
  analyticsGranularityMenu: { position: 'absolute', zIndex: 30, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 20, padding: 7, backgroundColor: Theme.colors.surface.muted, shadowColor: Theme.colors.shadow.color, shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 14 },
  analyticsGranularityMenuHeader: { minHeight: 55, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingHorizontal: 11 },
  analyticsGranularityMenuKicker: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1.2 },
  analyticsGranularityMenuTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 12, marginTop: 4 },
  analyticsGranularityOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 8, marginTop: 3 },
  analyticsGranularityOptionActive: { backgroundColor: Theme.colors.surface.brandSoft },
  analyticsGranularityOptionDisabled: { opacity: 0.36 },
  analyticsGranularityOptionMark: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 11, backgroundColor: Theme.colors.surface.muted },
  analyticsGranularityOptionMarkActive: { borderColor: '#087FF560', backgroundColor: Theme.colors.surface.brandSoft },
  analyticsGranularityOptionMarkText: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.35 },
  analyticsGranularityOptionMarkTextActive: { color: '#AECBFA' },
  analyticsGranularityOptionCopy: { minWidth: 0, flex: 1 },
  analyticsGranularityOptionText: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  analyticsGranularityOptionTextActive: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold' },
  analyticsGranularityOptionDescription: { color: '#858A91', fontFamily: 'Inter-Regular', fontSize: 7.5, marginTop: 2 },
  analyticsGranularityCheck: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 11 },
  analyticsGranularityCheckActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.brand.primaryAction },
  analyticsLoading: { minHeight: 235, alignItems: 'center', justifyContent: 'center', gap: 10 },
  metricPills: { alignItems: 'center', gap: 9, paddingTop: 14, paddingBottom: 9, paddingRight: 4 },
  dashboardLoading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 22, backgroundColor: Theme.colors.surface.base }, dashboardLoadingText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10 }, dashboardMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, dashboardMetric: { minWidth: 118, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderRadius: 28, paddingHorizontal: 17 }, dashboardMetricTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Regular', fontSize: 11 }, dashboardMetricValue: { color: Theme.colors.text.primary, fontFamily: 'Inter-Regular', fontSize: 17 }, dashboardMetricSelectedText: { color: Theme.colors.text.onBrand },
  trendCard: { overflow: 'hidden', paddingTop: 3, backgroundColor: 'transparent' },
  trendHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  trendKicker: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.2 },
  trendTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16, marginTop: 4 },
  trendTotal: { alignItems: 'flex-end' }, trendTotalLabel: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9 }, trendTotalValue: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 3 },
  trendChartWrap: { overflow: 'hidden', alignItems: 'center', marginTop: 2 },
  trendTouchSurface: { position: 'relative' },
  trendLabels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 3 },
  trendLabel: { color: '#80868B', fontFamily: 'Inter-Regular', fontSize: 8 },
  trendTouchHint: { color: '#6F7479', fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 8 },
  trendTooltip: { width: 186, position: 'absolute', top: 7, zIndex: 8, gap: 6, borderWidth: 1, borderColor: '#B8D8FA', borderRadius: 13, padding: 11, backgroundColor: Theme.colors.surface.base, shadowColor: '#31506D', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  trendTooltipDate: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 10, marginBottom: 2 }, trendTooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, trendTooltipDot: { width: 6, height: 6, borderRadius: 3 }, trendTooltipLabel: { flex: 1, color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 9 }, trendTooltipValue: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 9 },
  rangeOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: Theme.colors.overlay.scrim },
  rangeDialog: { width: '100%', maxWidth: 520, overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 27, padding: 20, backgroundColor: Theme.colors.surface.base },
  rangeDialogHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingBottom: 15, marginBottom: 7 },
  rangeDialogKicker: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.2 }, rangeDialogTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 22, marginTop: 4 },
  rangeClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: Theme.colors.surface.muted },
  rangeOption: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 12 }, rangeOptionText: { color: Theme.colors.text.primary, fontFamily: 'Inter-Regular', fontSize: 14 },
  rangeRadio: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Theme.colors.border.default, borderRadius: 10 }, rangeRadioActive: { borderColor: Theme.colors.border.focus }, rangeRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Theme.colors.brand.primaryAction },
  customDates: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D8E5EF', paddingTop: 15, marginTop: 5 }, customDateLabel: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 10, marginBottom: 6 }, customDateInput: { minHeight: 46, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 11, paddingHorizontal: 12, color: Theme.colors.text.primary, backgroundColor: Theme.colors.surface.base, fontFamily: 'Inter-Regular', fontSize: 13 },
  rangeFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 18 }, rangeCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, paddingHorizontal: 17 }, rangeCancelText: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 12 }, rangeApply: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, paddingHorizontal: 19, backgroundColor: Theme.colors.brand.primaryAction }, rangeApplyText: { color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 12 },
  rangeModalBackdrop: { flex: 1, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.28)' }, rangeScreen: { flex: 1, backgroundColor: Theme.colors.surface.base }, rangeCustomMotion: { flex: 1 },
  rangeScreenHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingHorizontal: 8 }, rangeScreenClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 }, rangeScreenTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 17 },
  rangeList: { paddingBottom: 28 }, rangeListKicker: { minHeight: 48, paddingTop: 20, paddingHorizontal: 7, color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 14 },
  rangeListRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingHorizontal: 7 }, rangeListText: { flex: 1, color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 14 }, rangeListTextActive: { color: Theme.colors.brand.primaryText }, rangeListCheck: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 24, marginRight: 7 },
  rangeCustomScreen: { flexGrow: 1, padding: 20, paddingBottom: 38 }, rangeCustomHint: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 20, marginBottom: 20 }, rangeCustomApply: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: Theme.colors.brand.primaryAction, marginTop: 18 }, rangeCustomApplyDisabled: { opacity: 0.34 },
  smartDateFields: { gap: 4 },
  smartDateButton: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 16, paddingHorizontal: 13, backgroundColor: Theme.colors.surface.base }, smartDateButtonActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.brandSoft },
  smartDateIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Theme.colors.surface.brandSoft }, smartDateCopy: { minWidth: 0, flex: 1 }, smartDateValue: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 13 }, smartDateIso: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 4 },
  smartDateConnector: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 18 }, smartDateConnectorText: { color: '#80868B', fontFamily: 'Inter-Regular', fontSize: 9 }, smartDateConnectorLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Theme.colors.surface.muted },
  smartPickerPanel: { overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 19, padding: 12, backgroundColor: Theme.colors.surface.base, marginTop: 17 }, smartPickerHeader: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5 }, smartPickerKicker: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.1 }, smartPickerTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-SemiBold', fontSize: 15, marginTop: 3 }, smartPickerDone: { minHeight: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingHorizontal: 14, backgroundColor: Theme.colors.brand.primaryAction }, smartPickerDoneText: { color: Theme.colors.text.onBrand, fontFamily: 'Inter-Bold', fontSize: 11 },
  rangeCustomSummary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, paddingHorizontal: 12, backgroundColor: Theme.colors.surface.muted, marginTop: 16 }, rangeCustomSummaryText: { minWidth: 0, flex: 1, color: Theme.colors.state.success, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15 }, rangeCustomSummaryInvalid: { color: Theme.colors.data.orders },
  newOrdersBanner: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(56,189,248,0.16)', borderRadius: 22, padding: 13, backgroundColor: 'rgba(56,189,248,0.07)', marginTop: 11 }, newOrdersIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'rgba(56,189,248,0.11)' }, newOrdersCopy: { flex: 1 }, newOrdersValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20 }, newOrdersLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 13, marginTop: 2 }, newOrdersButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 13, paddingHorizontal: 11, backgroundColor: '#1684B4' }, newOrdersButtonText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 },
  quickActions: { gap: 9 }, quickAction: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: 'transparent', borderRadius: 20, padding: 13, backgroundColor: Theme.colors.surface.base }, quickActionInvoice: { borderColor: '#F59E0B30', backgroundColor: Theme.colors.surface.base }, quickActionCopy: { flex: 1 }, quickActionTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, quickActionText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 3 }, recentOrders: { overflow: 'hidden', borderRadius: 21, backgroundColor: Theme.colors.surface.base }, recentOrder: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingHorizontal: 14 }, recentOrderNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 }, recentOrderMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, recentOrderRight: { alignItems: 'flex-end' }, recentOrderTotal: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 11 }, recentOrderStatus: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, marginTop: 4 }, recentOrderNew: { color: Theme.colors.brand.primaryText }, dashboardEmpty: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10, padding: 22, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48%', minHeight: 188, flexGrow: 1, borderWidth: 0, borderRadius: 24, padding: 18, backgroundColor: Theme.colors.surface.base },
  cardIcon: { width: 46, height: 46, borderWidth: 0, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  cardTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold' },
  cardDescription: { flex: 1, color: Colors.textSecondary, fontSize: 10, lineHeight: 15, fontFamily: 'Inter-Regular', marginTop: 5 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 },
  cardState: { fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 1.1 },
  moreGroups: { gap: 24 },
  moreGroup: { gap: 10 },
  moreGroupHeader: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 3 },
  moreGroupIndex: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  moreGroupIndexText: { fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.5 },
  moreGroupTitle: { fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 1.25 },
  moreGroupLine: { flex: 1, height: StyleSheet.hairlineWidth },
  moreList: { gap: 9 },
  moreCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 20, padding: 13, backgroundColor: Theme.colors.surface.base },
  moreCardIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  moreCardCopy: { flex: 1, minWidth: 0 },
  moreCardTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 13 },
  moreCardDescription: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, marginTop: 3 },
  moreCardArrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  sessionSection: { gap: 10, marginTop: 24 },
  sessionGroupIcon: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: Theme.colors.state.errorSoft },
  sessionGroupTitle: { color: Theme.colors.state.error, fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 1.25 },
  sessionGroupLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.errorDim },
  logoutCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: Colors.errorDim, borderRadius: 20, padding: 13, backgroundColor: Theme.colors.state.errorSoft },
  logoutCardIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.base },
  logoutCardTitle: { color: Theme.colors.state.error, fontFamily: 'Inter-SemiBold', fontSize: 13 },
  logoutCardAction: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: Theme.colors.surface.base },
  soonBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: 'rgba(245,158,11,0.11)' },
  soonBadgeText: { color: Theme.colors.state.warningBright, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7 },
  primaryEmpty: { minHeight: 280, alignItems: 'center', justifyContent: 'center', borderRadius: 26, padding: 28, backgroundColor: Theme.colors.surface.base, marginTop: 16 },
  primaryEmptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  primaryEmptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16, textAlign: 'center' },
  primaryEmptyText: { maxWidth: 310, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  comingSoonPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginTop: 17 },
  comingSoonText: { fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 },
  spvContent: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12, padding: 15 },
  spvHero: { minHeight: 310, justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 30, padding: 24, backgroundColor: Theme.colors.surface.brandSoft },
  spvGlow: { position: 'absolute', right: -70, top: -80, width: 230, height: 230, borderRadius: 115, borderWidth: 38, borderColor: '#087FF50D', backgroundColor: Theme.colors.surface.brandSoft },
  spvIcon: { width: 232, height: 68, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 17, backgroundColor: Theme.colors.surface.base, marginBottom: 18 },
  spvLogoImage: { width: 205, height: 56 },
  spvState: { position: 'absolute', right: 20, top: 20, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#2B6FAF12' },
  spvStateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2B6FAF' },
  spvStateText: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.9 },
  spvKicker: { color: Theme.colors.state.info, fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 1.2 },
  spvTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 27, marginTop: 7 },
  spvText: { maxWidth: 520, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 19, marginTop: 10 },
  spvInfo: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, padding: 17, backgroundColor: Theme.colors.surface.muted },
  spvInfoCopy: { flex: 1 },
  spvInfoTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 },
  spvInfoText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 4 },
  bottomNavigation: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: '#D8E5EF', paddingTop: 6, paddingHorizontal: 4, backgroundColor: Theme.colors.surface.base, shadowColor: '#31506D', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: -5 }, elevation: 18 },
  bottomNavigationItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  bottomNavigationIcon: { width: 38, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  bottomNavigationLabel: { color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 9 },
  bottomNavigationLabelActive: { color: Colors.orange, fontFamily: 'Inter-SemiBold' },
  headerAction: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.surface.brandSoft, borderWidth: 1, borderColor: Theme.colors.border.brandSoft },
  catalogContent: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 12 },
  catalogHero: { minHeight: 148, position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 13, padding: 17, borderRadius: 27, borderWidth: 1, borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.base, shadowColor: '#2B5E85', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  catalogHeroAura: { width: 190, height: 190, position: 'absolute', right: -88, top: -92, borderRadius: 95 },
  catalogHeroIcon: { width: 58, height: 58, flexShrink: 0, borderRadius: 19, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  catalogHeroText: { minWidth: 0, flex: 1 },
  catalogKicker: { fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.15 },
  catalogTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20, lineHeight: 25, marginTop: 4 },
  catalogSubtitle: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 15, marginTop: 5 },
  counter: { alignItems: 'center', minWidth: 50, paddingHorizontal: 8, paddingVertical: 9, borderWidth: 1, borderRadius: 16, backgroundColor: Theme.colors.surface.base },
  counterValue: { fontFamily: 'Inter-Bold', fontSize: 18 },
  counterLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.7 },
  tabs: { minHeight: 76, flexDirection: 'row', gap: 5, marginVertical: 12, padding: 5, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 23, backgroundColor: Theme.colors.surface.base },
  tab: { minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3, paddingVertical: 7, borderRadius: 18 },
  tabActive: { backgroundColor: Theme.colors.brand.primaryAction },
  tabIcon: { width: 28, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Theme.colors.surface.muted },
  tabIconActive: { backgroundColor: '#FFFFFF20' },
  tabText: { maxWidth: '100%', color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 8.5 },
  tabTextActive: { color: Colors.white },
  stateBox: { minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 25, backgroundColor: Theme.colors.surface.base },
  stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 12 },
  errorText: { color: Theme.colors.state.error, fontFamily: 'Inter-Regular', fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
  retryButton: { borderRadius: 10, backgroundColor: Colors.orangeDim, paddingHorizontal: 14, paddingVertical: 9 },
  retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  tableCard: { overflow: 'hidden', borderWidth: 0, borderRadius: 24, backgroundColor: Theme.colors.surface.base },
  tableWide: { minWidth: 770 },
  tableRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E5EF', paddingHorizontal: 16 },
  tableHead: { minHeight: 46, backgroundColor: Theme.colors.surface.muted },
  th: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8 },
  colImage: { width: 64 }, colName: { width: 255 }, colParent: { width: 190 }, colStatus: { width: 110 }, colActions: { width: 115 },
  colBrandName: { width: 260 }, colWebsite: { width: 280 },
  tableImage: { width: 42, height: 42, borderRadius: 11 },
  tableImageFallback: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.surface.muted },
  cellTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  cellTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cellSub: { color: Colors.orange, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 2 },
  cellDescription: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 2, maxWidth: 225 },
  cellText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 },
  cellMuted: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tableAction: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 0, backgroundColor: 'rgba(56,189,248,0.11)' },
  tableActionDanger: { backgroundColor: 'rgba(239,68,68,0.11)' },
  tableActionLocked: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(240,127,0,0.12)' },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  badgeActive: { borderColor: 'rgba(34,197,94,0.22)', backgroundColor: 'rgba(34,197,94,0.07)' },
  badgeInactive: { borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.muted },
  badgeDot: { width: 6, height: 6, borderRadius: 3 }, badgeText: { fontFamily: 'Inter-SemiBold', fontSize: 9 },
  catalogCardList: { gap: 9 },
  catalogEntityCard: { gap: 11, padding: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.base },
  catalogEntityTop: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  catalogEntityImage: { width: 52, height: 52, flexShrink: 0, borderRadius: 16, backgroundColor: Theme.colors.surface.muted },
  catalogEntityImageFallback: { width: 52, height: 52, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  catalogEntityCopy: { minWidth: 0, flex: 1 },
  catalogEntityTitleRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  catalogEntityTitle: { minWidth: 0, flexShrink: 1, color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 13 },
  catalogEntitySlug: { marginTop: 3, color: '#F45B7A', fontFamily: 'Inter-Medium', fontSize: 8.5 },
  catalogEntityDescription: { color: Theme.colors.text.secondary, fontFamily: 'Inter-Regular', fontSize: 9.5, lineHeight: 14 },
  systemPill: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8, backgroundColor: '#FFF2E2' },
  systemPillText: { color: '#A45100', fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.5 },
  catalogEntityFooter: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Theme.colors.border.subtle },
  catalogEntityMeta: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  catalogEntityMetaCopy: { minWidth: 0, flex: 1 },
  catalogEntityMetaLabel: { color: Theme.colors.text.muted, fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.65 },
  catalogEntityMetaValue: { marginTop: 2, color: Theme.colors.text.secondary, fontFamily: 'Inter-SemiBold', fontSize: 9 },
  catalogEntityMetaMuted: { marginTop: 2, color: Theme.colors.text.muted, fontFamily: 'Inter-Regular', fontSize: 9 },
  catalogEntityActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyBox: { minHeight: 320, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 25, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 27, backgroundColor: Theme.colors.surface.base },
  emptyAura: { width: 240, height: 240, position: 'absolute', left: -145, bottom: -145, borderRadius: 120, backgroundColor: Theme.colors.surface.brandSoft },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.surface.muted, marginBottom: 11, transform: [{ rotate: '-4deg' }] },
  emptyKicker: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.1, marginBottom: 7 },
  emptyTitle: { maxWidth: 290, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 17, lineHeight: 22, textAlign: 'center' },
  emptyText: { maxWidth: 295, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10.5, lineHeight: 16, textAlign: 'center', marginTop: 7 },
  emptyHint: { marginTop: 17, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft },
  emptyHintText: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-SemiBold', fontSize: 8.5 },
  catalogFloatingActions: { position: 'absolute', right: 17, flexDirection: 'row', alignItems: 'center', gap: 9 },
  fab: { position: 'absolute', right: 22, width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.brand.primaryAction, shadowColor: Theme.colors.shadow.color, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', paddingTop: 28, backgroundColor: Theme.colors.overlay.scrim },
  modalCard: { width: '100%', maxWidth: 760, maxHeight: '94%', alignSelf: 'center', paddingHorizontal: 13, paddingTop: 13, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderBottomWidth: 0, borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.subtle },
  brandModal: { maxHeight: '82%' },
  modalHeader: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 12, padding: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 21, backgroundColor: Theme.colors.surface.base },
  modalHeaderIcon: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 16, transform: [{ rotate: '-4deg' }] },
  modalHeaderCopy: { minWidth: 0, flex: 1 },
  modalKicker: { fontFamily: 'Inter-Bold', fontSize: 7.5, letterSpacing: 1.05 },
  modalTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 18, marginTop: 3 },
  modalSubtitle: { color: Theme.colors.text.muted, fontFamily: 'Inter-Regular', fontSize: 8.5, marginTop: 3 },
  modalBody: { gap: 11, paddingBottom: 5 },
  catalogFormSection: { gap: 2, padding: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.base },
  catalogFormSectionHead: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: Theme.colors.border.subtle },
  catalogFormStep: { width: 37, height: 37, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.brandSoft },
  catalogFormStepText: { color: Theme.colors.brand.primaryText, fontFamily: 'Inter-Bold', fontSize: 9 },
  catalogFormSectionTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 12 },
  catalogFormSectionText: { marginTop: 3, color: Theme.colors.text.muted, fontFamily: 'Inter-Regular', fontSize: 8.5 },
  systemCategoryNote: { flexDirection: 'row', gap: 11, marginBottom: 18, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(240,127,0,0.26)', backgroundColor: 'rgba(240,127,0,0.08)' },
  systemCategoryNoteIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(240,127,0,0.14)' },
  systemCategoryNoteCopy: { flex: 1 },
  systemCategoryNoteTitle: { color: Theme.colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 11 },
  systemCategoryNoteText: { marginTop: 4, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9.5, lineHeight: 14 },
  systemCategoryKey: { marginTop: 7, color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 8.5 },
  closeButton: { width: 40, height: 40, flexShrink: 0, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, backgroundColor: Theme.colors.surface.muted },
  fieldLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 0.8, marginBottom: 7, marginTop: 3 },
  fieldHint: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: -3, marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, backgroundColor: Theme.colors.surface.subtle, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 13, paddingHorizontal: 15, marginBottom: 14 },
  textarea: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  imagePicker: { width: 82, height: 82, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderStyle: 'dashed', backgroundColor: Theme.colors.surface.subtle },
  previewImage: { width: '100%', height: '100%' },
  imageActions: { flex: 1, alignItems: 'flex-start', gap: 9 },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: Theme.colors.surface.muted },
  secondaryButtonText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  removeImageText: { color: Theme.colors.state.error, fontFamily: 'Inter-SemiBold', fontSize: 9 },
  parentOptions: { gap: 7, paddingBottom: 16 },
  parentChip: { maxWidth: 220, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Theme.colors.surface.subtle },
  parentChipActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.brandSoft },
  parentChipText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  parentChipTextActive: { color: Theme.colors.brand.primaryText },
  switchRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, backgroundColor: Theme.colors.surface.subtle, marginBottom: 2 },
  switchRowActive: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft },
  switchCopy: { minWidth: 0, flex: 1 },
  switchTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 },
  saveButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, backgroundColor: Theme.colors.brand.primaryAction, marginBottom: 4 },
  saveButtonText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 12 },
  buttonDisabled: { opacity: 0.58 },
  deleteBackdrop: { justifyContent: 'center', paddingHorizontal: 22 },
  deletePanel: { width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'center', borderWidth: 0, borderRadius: 28, padding: 26, backgroundColor: Theme.colors.surface.base },
  deleteIcon: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.errorDim, marginBottom: 14 },
  deleteKicker: { color: Theme.colors.state.error, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1.2 },
  deleteTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 20, marginTop: 5 },
  deleteText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  deleteActions: { width: '100%', flexDirection: 'row', gap: 9, marginTop: 20 },
  cancelButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 0, borderRadius: 999, backgroundColor: Theme.colors.surface.muted },
  cancelButtonText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 11 },
  deleteButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, backgroundColor: Colors.error },
  deleteButtonText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 11 },
});
