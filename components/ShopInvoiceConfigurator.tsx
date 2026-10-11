import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Archive,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  LockKeyhole,
  Mail,
  Power,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react-native';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopSmartBillSettings } from '@/services/shopApi';

type Props = { bottomInset?: number };
type CapabilityTone = 'success' | 'warning' | 'blocked';

const smartBillLogo = require('../assets/images/smartbill-logo.png');

const capabilityLabels: Record<string, string> = {
  catalog_read: 'Catalog și stoc',
  invoice_issue: 'Emiterea facturilor',
  invoice_read: 'Citirea facturilor',
  stock_read: 'Stoc contabil',
  series_read: 'Serii fiscale',
  pdf_read: 'PDF original',
  multi_warehouse_invoice: 'Facturi din mai multe gestiuni',
  series_numbering: 'Numerotarea seriilor',
  full_reverse: 'Stornare integrală',
  partial_reverse: 'Stornare parțială',
  stock_reentry: 'Reintrarea în stoc',
  goods_receipts_v3: 'Recepții marfă V3',
};

const capabilityStatusLabels: Record<string, string> = {
  available: 'Disponibil',
  disponibil: 'Disponibil',
  documented: 'Documentat',
  smartbill_authoritative: 'Sursă SmartBill',
  documented_write_blocked: 'Documentat · blocat',
  manual_required: 'Verificare manuală',
  not_guaranteed_by_api_contract: 'Limitare API',
  draft_write_blocked: 'Draft · blocat',
};

function capabilityTone(status: string): CapabilityTone {
  if (status.includes('blocked')) return 'blocked';
  if (status === 'manual_required' || status === 'not_guaranteed_by_api_contract') return 'warning';
  return 'success';
}

export default function ShopInvoiceConfigurator({ bottomInset = 0 }: Props) {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const [settings, setSettings] = useState<ShopSmartBillSettings | null>(null);
  const [series, setSeries] = useState('');
  const [dueDays, setDueDays] = useState('7');
  const [notes, setNotes] = useState('');
  const [archivePdf, setArchivePdf] = useState(true);
  const [issuingEnabled, setIssuingEnabled] = useState(false);
  const [busy, setBusy] = useState('load');
  const [expandedCapability, setExpandedCapability] = useState<string | null>(null);
  const wide = width >= 720;

  const apply = useCallback((next: ShopSmartBillSettings) => {
    setSettings(next);
    setSeries(next.invoice_series || '');
    setDueDays(String(next.due_days));
    setNotes(next.default_notes || '');
    setArchivePdf(next.archive_pdf_enabled !== false);
    setIssuingEnabled(Boolean(next.issuing_enabled));
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy('load');
    try { apply(await shopApi.getSmartBillSettings(token)); }
    catch (error) { Alert.alert('SmartBill nu s-a încărcat', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setBusy(''); }
  }, [apply, token]);

  useEffect(() => { void load(); }, [load]);

  const availableSeries = useMemo(() => Array.isArray(settings?.series) ? settings.series : [], [settings?.series]);
  const selectedSeries = useMemo(() => availableSeries.find((item) => item.name === series) || null, [availableSeries, series]);
  const capabilities = useMemo(() => Object.entries(settings?.capabilities || {}), [settings?.capabilities]);
  const dirty = Boolean(settings && (series !== (settings.invoice_series || '') || Number(dueDays) !== settings.due_days || notes.trim() !== settings.default_notes || archivePdf !== settings.archive_pdf_enabled || issuingEnabled !== settings.issuing_enabled));
  const syncMinutes = Math.max(1, Math.round((settings?.auto_sync_interval_seconds || 300) / 60));

  const toggleIssuing = (value: boolean) => {
    if (value && !settings?.issuing_ready) {
      Alert.alert('Emiterea nu poate fi activată', settings?.issuing_block_reason || 'Finalizează testarea conexiunilor, sincronizarea și alegerea seriei.');
      return;
    }
    setIssuingEnabled(value);
  };

  const toggleCapability = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCapability((current) => current === key ? null : key);
  };

  const run = async () => {
    if (!token || busy) return;
    setBusy('sync');
    try {
      apply(await shopApi.syncSmartBillReferences(token));
      Alert.alert('Sincronizare terminată', 'Seriile și gestiunile produselor au fost actualizate. Sincronizarea automată rămâne activă.');
    } catch (error) { Alert.alert('Verificare eșuată', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setBusy(''); }
  };

  const save = async () => {
    if (!token || !settings || busy) return;
    if (!series || !selectedSeries) return Alert.alert('Serie obligatorie', 'Alege o serie preluată din SmartBill.');
    const parsedDueDays = Math.trunc(Number(dueDays));
    if (!Number.isFinite(parsedDueDays) || parsedDueDays < 0 || parsedDueDays > 365) return Alert.alert('Scadență invalidă', 'Alege între 0 și 365 de zile.');
    setBusy('save');
    try {
      apply(await shopApi.updateSmartBillSettings(token, { invoice_series: series, due_days: parsedDueDays, default_notes: notes.trim(), archive_pdf_enabled: archivePdf, issuing_enabled: issuingEnabled }));
      Alert.alert('Configurare salvată', 'SmartBill va aloca numărul real la emitere. Cubis nu menține o numerotare fiscală paralelă.');
    } catch (error) { Alert.alert('Configurare nesalvată', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setBusy(''); }
  };

  if (busy === 'load') return (
    <View style={styles.loading}>
      <View style={styles.loadingLogo}><Image source={smartBillLogo} resizeMode="contain" style={styles.loadingLogoImage} /></View>
      <ActivityIndicator size="small" color={Theme.colors.brand.primary} />
      <Text style={styles.loadingTitle}>Se încarcă SmartBill</Text>
      <Text style={styles.muted}>Conexiunea este verificată securizat.</Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: 116 + bottomInset }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.shell}>
        <LinearGradient colors={['#FFFFFF', '#F2F8FF', '#ECFBFD']} locations={[0, 0.56, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />
          <View style={styles.heroTop}>
            <View style={styles.heroLogo}><Image source={smartBillLogo} resizeMode="contain" style={styles.heroLogoImage} /></View>
            <View style={[styles.mode, issuingEnabled ? styles.modeLive : styles.modeSafe]}>
              <View style={[styles.modeDot, issuingEnabled ? styles.modeDotLive : styles.modeDotSafe]} />
              <Text style={issuingEnabled ? styles.modeLiveText : styles.modeSafeText}>{issuingEnabled ? 'EMITERE ACTIVĂ' : 'EMITERE OPRITĂ'}</Text>
            </View>
          </View>
          <Text style={styles.kicker}>INTEGRARE OFICIALĂ · V1 + V3</Text>
          <Text style={styles.title}>Facturare SmartBill</Text>
          <Text style={styles.subtitle}>SmartBill gestionează numărul fiscal, seriile și stocul contabil. Cubis păstrează configurarea simplă și sigură.</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><RefreshCw size={15} color={Theme.colors.brand.primaryText} /><View><Text style={styles.heroStatLabel}>SYNC</Text><Text style={styles.heroStatValue}>{syncMinutes} min</Text></View></View>
            <View style={styles.heroStat}><FileText size={15} color={Theme.colors.brand.primaryText} /><View><Text style={styles.heroStatLabel}>SERII</Text><Text style={styles.heroStatValue}>{availableSeries.length}</Text></View></View>
            <View style={styles.heroStat}><Boxes size={15} color={Theme.colors.brand.primaryText} /><View><Text style={styles.heroStatLabel}>GESTIUNI</Text><Text style={styles.heroStatValue}>{settings?.warehouses?.length || 0}</Text></View></View>
          </View>
        </LinearGradient>

        <View style={styles.syncCard}>
          <View style={styles.cardRow}>
            <View style={styles.syncIcon}><RefreshCw size={21} color={Theme.colors.brand.primaryText} /></View>
            <View style={styles.flex}><Text style={styles.cardEyebrow}>SINCRONIZARE AUTOMATĂ</Text><Text style={styles.cardTitle}>Referințe SmartBill actualizate periodic</Text><Text style={styles.cardText}>Serii: {settings?.series_last_synced_at || 'în așteptare'} · Gestiuni: {settings?.warehouse_last_synced_at || 'în așteptare'}</Text></View>
          </View>
          <TouchableOpacity disabled={Boolean(busy) || !settings?.read_enabled} onPress={() => void run()} activeOpacity={0.82} style={[styles.syncButton, (Boolean(busy) || !settings?.read_enabled) && styles.disabled]}>
            {busy === 'sync' ? <ActivityIndicator color={Theme.colors.text.onBrand} /> : <><RefreshCw size={16} color={Theme.colors.text.onBrand} /><Text style={styles.syncButtonText}>Actualizează acum</Text></>}
          </TouchableOpacity>
        </View>

        <View style={[styles.issuingCard, issuingEnabled && styles.issuingCardActive]}>
          <View style={styles.cardRow}>
            <View style={[styles.issuingIcon, issuingEnabled && styles.issuingIconActive]}><Power size={21} color={issuingEnabled ? Theme.colors.brand.primaryAction : Theme.colors.text.secondary} /></View>
            <View style={styles.flex}><Text style={styles.cardEyebrow}>EMITERE DOCUMENTE</Text><Text style={styles.issuingTitle}>Facturare SmartBill</Text></View>
            <Switch value={issuingEnabled} onValueChange={toggleIssuing} disabled={Boolean(busy) || (!issuingEnabled && !settings?.issuing_ready)} trackColor={{ false: Theme.colors.border.strong, true: '#9DCCFF' }} thumbColor={issuingEnabled ? Theme.colors.brand.primaryAction : Theme.colors.surface.base} ios_backgroundColor={Theme.colors.border.strong} accessibilityLabel="Activează facturarea SmartBill" />
          </View>
          <Text style={styles.issuingText}>{issuingEnabled ? 'Activă pentru facturile noi. SmartBill alocă numărul și operează gestiunea fiecărui produs.' : (settings?.issuing_block_reason || 'Oprită. Nicio factură fiscală nu va fi emisă în SmartBill.')}</Text>
          <View style={styles.authorityPill}><ShieldCheck size={13} color={Theme.colors.state.success} /><Text style={styles.authority}>STOC CONTABIL EXCLUSIV ÎN SMARTBILL</Text></View>
        </View>

        <View style={styles.formCard}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionIcon}><Database size={20} color={Theme.colors.brand.primaryText} /></View>
            <View style={styles.flex}><Text style={styles.cardEyebrow}>CONFIGURARE DOCUMENTE</Text><Text style={styles.cardTitle}>Reguli pentru facturile noi</Text><Text style={styles.cardText}>Numărul fiscal este alocat exclusiv de SmartBill.</Text></View>
          </View>

          <Text style={styles.label}>SERIA FACTURII</Text>
          <View style={[styles.choiceGrid, wide && styles.choiceGridWide]}>
            {availableSeries.map((item) => (
              <TouchableOpacity key={item.name} onPress={() => setSeries(item.name)} activeOpacity={0.82} style={[styles.choice, wide && styles.choiceWide, series === item.name && styles.choiceActive]}>
                <View style={[styles.receiptIcon, series === item.name && styles.receiptIconActive]}><FileText size={18} color={series === item.name ? Theme.colors.brand.primaryText : Theme.colors.text.secondary} /></View>
                <View style={styles.flex}><Text style={styles.choiceTitle}>Seria {item.name}</Text><Text style={styles.choiceMeta}>Următorul număr: {item.next_number || '—'}</Text></View>
                {series === item.name ? <CheckCircle2 size={20} color={Theme.colors.brand.primary} /> : null}
              </TouchableOpacity>
            ))}
          </View>
          {!availableSeries.length ? <Text style={styles.empty}>Sincronizează întâi seriile din SmartBill V1.</Text> : null}

          <View style={styles.infoNote}><View style={styles.infoDot}><Check size={13} color={Theme.colors.brand.primaryText} /></View><Text style={styles.infoNoteText}>Gestiunea se alege separat în fișa fiecărui produs; nu se aplică automat întregului catalog.</Text></View>

          <View style={[styles.fieldRow, wide && styles.fieldRowWide]}>
            <View style={styles.field}><Text style={styles.label}>ZILE SCADENȚĂ</Text><TextInput value={dueDays} onChangeText={setDueDays} keyboardType="number-pad" style={styles.input} placeholder="7" placeholderTextColor={Theme.colors.text.muted} /></View>
            <View style={[styles.field, styles.fieldWide]}><Text style={styles.label}>NOTE IMPLICITE</Text><TextInput value={notes} onChangeText={setNotes} style={styles.input} placeholder="Mesaj opțional pentru client" placeholderTextColor={Theme.colors.text.muted} maxLength={4000} /></View>
          </View>

          <View style={[styles.ruleGrid, wide && styles.ruleGridWide]}>
            <TouchableOpacity onPress={() => setArchivePdf((value) => !value)} activeOpacity={0.82} style={[styles.ruleCard, wide && styles.ruleCardWide, archivePdf && styles.ruleCardActive]}>
              <View style={[styles.ruleIcon, archivePdf && styles.ruleIconActive]}><Archive size={20} color={archivePdf ? Theme.colors.brand.primaryText : Theme.colors.text.secondary} /></View>
              <View style={styles.flex}><Text style={styles.choiceTitle}>Arhivare PDF original</Text><Text style={styles.choiceMeta}>Documentul original este păstrat securizat.</Text></View>
              <Text style={[styles.ruleState, archivePdf && styles.ruleStateActive]}>{archivePdf ? 'ACTIVĂ' : 'OPRITĂ'}</Text>
            </TouchableOpacity>
            <View style={[styles.ruleCard, wide && styles.ruleCardWide, settings?.email_enabled && styles.ruleCardActive]}>
              <View style={[styles.ruleIcon, settings?.email_enabled && styles.ruleIconActive]}><Mail size={20} color={settings?.email_enabled ? Theme.colors.brand.primaryText : Theme.colors.text.secondary} /></View>
              <View style={styles.flex}><Text style={styles.choiceTitle}>E-mail prin SmartBill</Text><Text style={styles.choiceMeta}>Regulile Card/Ramburs rămân în Automatizări.</Text></View>
              <Text style={[styles.ruleState, settings?.email_enabled && styles.ruleStateActive]}>{settings?.email_enabled ? 'PERMIS' : 'BLOCAT'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.safety}>
          <View style={styles.safetyIcon}><LockKeyhole size={20} color={Theme.colors.state.success} /></View>
          <View style={styles.flex}><Text style={styles.safetyTitle}>Cheile rămân protejate pe server</Text><Text style={styles.safetyText}>Tokenurile V1/V3 nu sunt incluse în aplicația mobilă.</Text></View>
        </View>

        <View style={styles.referenceCard}>
          <View style={styles.referenceHead}>
            <View style={styles.referenceIcon}><ShieldCheck size={20} color={Theme.colors.state.success} /></View>
            <View style={styles.flex}><Text style={styles.cardTitle}>Capabilități verificate</Text><Text style={styles.cardText}>Fără operații fiscale în timpul verificării.</Text></View>
            <View style={styles.countPill}><Text style={styles.countPillText}>{capabilities.length}</Text></View>
          </View>
          <View style={styles.capabilityList}>
            {capabilities.map(([key, item]) => {
              const normalizedStatus = String(item.status || '').trim().toLowerCase();
              const tone = capabilityTone(normalizedStatus);
              const expanded = expandedCapability === key;
              return (
                <View key={key} style={[styles.capability, expanded && styles.capabilityExpanded]}>
                  <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => toggleCapability(key)} activeOpacity={0.82} style={styles.capabilitySummary}>
                    <View style={styles.capabilityMain}>
                      <View style={[styles.statusPill, tone === 'warning' && styles.statusPillWarning, tone === 'blocked' && styles.statusPillBlocked]}>
                        <View style={[styles.statusDot, tone === 'warning' && styles.statusDotWarning, tone === 'blocked' && styles.statusDotBlocked]} />
                        <Text style={[styles.statusText, tone === 'warning' && styles.statusTextWarning, tone === 'blocked' && styles.statusTextBlocked]} numberOfLines={1}>{capabilityStatusLabels[normalizedStatus] || normalizedStatus.replace(/_/g, ' ') || 'Verificat'}</Text>
                      </View>
                      <Text style={styles.capabilityTitle}>{capabilityLabels[key] || key.replace(/_/g, ' ')}</Text>
                    </View>
                    <View style={[styles.chevron, expanded && styles.chevronExpanded]}>{expanded ? <ChevronDown size={17} color={Theme.colors.brand.primaryText} /> : <ChevronRight size={17} color={Theme.colors.text.secondary} />}</View>
                  </TouchableOpacity>
                  {expanded ? <View style={styles.capabilityDetail}><Text style={styles.capabilityDetailText}>{item.detail}</Text></View> : null}
                </View>
              );
            })}
            {!capabilities.length ? <View style={styles.capabilityEmpty}><CheckCircle2 size={18} color={Theme.colors.state.success} /><Text style={styles.capabilityDetailText}>Conexiunea este protejată. Nu există verificări suplimentare.</Text></View> : null}
          </View>
        </View>

        <TouchableOpacity disabled={!dirty || Boolean(busy)} onPress={() => void save()} activeOpacity={0.86} style={styles.save}>
          <LinearGradient colors={!dirty || Boolean(busy) ? ['#E7EEF4', '#E7EEF4'] : Theme.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveGradient}>
            {busy === 'save' ? <ActivityIndicator color={Theme.colors.text.onBrand} /> : <><View style={styles.saveCopy}><Text style={[styles.saveEyebrow, (!dirty || Boolean(busy)) && styles.saveTextDisabled]}>{dirty ? 'MODIFICĂRI NESALVATE' : 'CONFIGURAȚIE ACTUALIZATĂ'}</Text><Text style={[styles.saveText, (!dirty || Boolean(busy)) && styles.saveTextDisabled]}>{dirty ? 'Salvează configurarea' : 'Totul este salvat'}</Text></View><View style={[styles.saveIcon, (!dirty || Boolean(busy)) && styles.saveIconDisabled]}><Save size={19} color={!dirty || Boolean(busy) ? Theme.colors.text.disabled : Theme.colors.text.onBrand} /></View></>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 14 },
  shell: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  loading: { minHeight: 520, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingLogo: { width: 82, height: 82, alignItems: 'center', justifyContent: 'center', marginBottom: 5, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 27, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card },
  loadingLogoImage: { width: 62, height: 62 },
  loadingTitle: { color: Colors.textPrimary, fontFamily: Theme.typography.bold, fontSize: 17 },
  muted: { color: Colors.textMuted, fontFamily: Theme.typography.regular, fontSize: 11 },

  hero: { overflow: 'hidden', minHeight: 350, borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: 30, padding: 20, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card },
  heroGlowLarge: { position: 'absolute', right: -92, top: -105, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(9,201,229,0.10)' },
  heroGlowSmall: { position: 'absolute', left: -52, bottom: -76, width: 168, height: 168, borderRadius: 84, backgroundColor: 'rgba(8,127,245,0.07)' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroLogo: { width: 82, height: 82, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 26, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card },
  heroLogoImage: { width: 65, height: 65 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Theme.radius.round, paddingHorizontal: 10, paddingVertical: 7 },
  modeSafe: { backgroundColor: Theme.colors.surface.brandSoft },
  modeLive: { backgroundColor: Theme.colors.state.successSoft },
  modeDot: { width: 7, height: 7, borderRadius: 4 },
  modeDotSafe: { backgroundColor: Theme.colors.state.info },
  modeDotLive: { backgroundColor: Theme.colors.state.success },
  modeSafeText: { color: Theme.colors.state.info, fontFamily: Theme.typography.bold, fontSize: 7.5, letterSpacing: .45 },
  modeLiveText: { color: Theme.colors.state.success, fontFamily: Theme.typography.bold, fontSize: 7.5, letterSpacing: .45 },
  kicker: { marginTop: 20, color: Theme.colors.brand.primaryText, fontFamily: Theme.typography.bold, fontSize: 9, letterSpacing: 1.15 },
  title: { marginTop: 7, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 31, letterSpacing: -.7 },
  subtitle: { marginTop: 9, maxWidth: 620, color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 12, lineHeight: 19 },
  heroStats: { flexDirection: 'row', gap: 7, marginTop: 19 },
  heroStat: { flex: 1, minHeight: 53, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 16, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.78)' },
  heroStatLabel: { color: Theme.colors.text.muted, fontFamily: Theme.typography.bold, fontSize: 6.5, letterSpacing: .5 },
  heroStatValue: { marginTop: 2, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 11 },

  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardEyebrow: { color: Theme.colors.brand.primaryText, fontFamily: Theme.typography.bold, fontSize: 7.5, letterSpacing: .85 },
  cardTitle: { marginTop: 3, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 13.5 },
  cardText: { marginTop: 4, color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 9.5, lineHeight: 14.5 },
  syncCard: { gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 24, padding: 14, backgroundColor: Theme.colors.surface.base },
  syncIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft },
  syncButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: Theme.colors.brand.primaryAction },
  syncButtonText: { color: Theme.colors.text.onBrand, fontFamily: Theme.typography.bold, fontSize: 11 },

  issuingCard: { gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 24, padding: 15, backgroundColor: Theme.colors.surface.base },
  issuingCardActive: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft },
  issuingIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.muted },
  issuingIconActive: { backgroundColor: '#D9ECFF' },
  issuingTitle: { marginTop: 3, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 15 },
  issuingText: { color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 10, lineHeight: 15 },
  authorityPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Theme.radius.round, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: Theme.colors.state.successSoft },
  authority: { color: Theme.colors.state.success, fontFamily: Theme.typography.bold, fontSize: 7, letterSpacing: .55 },

  formCard: { gap: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 27, padding: 15, backgroundColor: Theme.colors.surface.base },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 2 },
  sectionIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.brandSoft },
  label: { marginTop: 3, color: Theme.colors.text.secondary, fontFamily: Theme.typography.bold, fontSize: 8, letterSpacing: .75 },
  choiceGrid: { gap: 8 },
  choiceGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  choice: { minHeight: 63, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 18, paddingHorizontal: 11, backgroundColor: Theme.colors.surface.subtle },
  choiceWide: { width: '49%' },
  choiceActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.brandSoft },
  receiptIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.muted },
  receiptIconActive: { backgroundColor: '#D9ECFF' },
  choiceTitle: { color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 11.5 },
  choiceMeta: { marginTop: 3, color: Theme.colors.text.muted, fontFamily: Theme.typography.regular, fontSize: 8.5, lineHeight: 12 },
  empty: { color: Theme.colors.state.error, fontFamily: Theme.typography.semibold, fontSize: 10 },
  infoNote: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, padding: 10, backgroundColor: Theme.colors.surface.brandSoft },
  infoDot: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Theme.colors.surface.base },
  infoNoteText: { flex: 1, color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 9, lineHeight: 14 },
  fieldRow: { gap: 11 },
  fieldRowWide: { flexDirection: 'row' },
  field: { flex: 1, gap: 6 },
  fieldWide: { flex: 2 },
  input: { minHeight: 50, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 16, paddingHorizontal: 13, color: Theme.colors.text.primary, fontFamily: Theme.typography.medium, fontSize: 12, backgroundColor: Theme.colors.surface.subtle },
  ruleGrid: { gap: 8 },
  ruleGridWide: { flexDirection: 'row' },
  ruleCard: { minHeight: 73, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 18, padding: 10, backgroundColor: Theme.colors.surface.subtle },
  ruleCardWide: { flex: 1 },
  ruleCardActive: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft },
  ruleIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Theme.colors.surface.muted },
  ruleIconActive: { backgroundColor: '#D9ECFF' },
  ruleState: { color: Theme.colors.text.secondary, fontFamily: Theme.typography.bold, fontSize: 7 },
  ruleStateActive: { color: Theme.colors.brand.primaryText },

  safety: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#B9E7CF', borderRadius: 22, padding: 13, backgroundColor: Theme.colors.state.successSoft },
  safetyIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Theme.colors.surface.base },
  safetyTitle: { color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 11.5 },
  safetyText: { marginTop: 3, color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 8.5, lineHeight: 13 },

  referenceCard: { gap: 11, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 27, padding: 13, backgroundColor: Theme.colors.surface.base },
  referenceHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 1, paddingVertical: 1 },
  referenceIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Theme.colors.state.successSoft },
  countPill: { minWidth: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.surface.brandSoft },
  countPillText: { color: Theme.colors.brand.primaryText, fontFamily: Theme.typography.bold, fontSize: 9 },
  capabilityList: { gap: 7 },
  capability: { overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 18, backgroundColor: Theme.colors.surface.subtle },
  capabilityExpanded: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.base },
  capabilitySummary: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9 },
  capabilityMain: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 6 },
  capabilityTitle: { paddingLeft: 2, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 10.5 },
  statusPill: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Theme.radius.round, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: Theme.colors.state.successSoft },
  statusPillWarning: { backgroundColor: Theme.colors.state.warningSoft },
  statusPillBlocked: { backgroundColor: Theme.colors.state.errorSoft },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.colors.state.success },
  statusDotWarning: { backgroundColor: Theme.colors.state.warning },
  statusDotBlocked: { backgroundColor: Theme.colors.state.error },
  statusText: { flexShrink: 1, color: Theme.colors.state.success, fontFamily: Theme.typography.bold, fontSize: 6.8, letterSpacing: .35, textTransform: 'uppercase' },
  statusTextWarning: { color: Theme.colors.state.warning },
  statusTextBlocked: { color: Theme.colors.state.error },
  chevron: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.surface.base },
  chevronExpanded: { backgroundColor: Theme.colors.surface.brandSoft },
  capabilityDetail: { borderTopWidth: 1, borderTopColor: Theme.colors.border.subtle, paddingHorizontal: 12, paddingVertical: 11 },
  capabilityDetailText: { color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 9, lineHeight: 14.5 },
  capabilityEmpty: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, padding: 11, backgroundColor: Theme.colors.state.successSoft },

  save: { overflow: 'hidden', minHeight: 66, borderRadius: 21 },
  saveGradient: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 17 },
  saveCopy: { flex: 1, minWidth: 0 },
  saveEyebrow: { color: 'rgba(255,255,255,0.72)', fontFamily: Theme.typography.bold, fontSize: 7, letterSpacing: .8 },
  saveText: { marginTop: 4, color: Theme.colors.text.onBrand, fontFamily: Theme.typography.bold, fontSize: 13 },
  saveTextDisabled: { color: Theme.colors.text.disabled },
  saveIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)' },
  saveIconDisabled: { backgroundColor: Theme.colors.surface.base },
  disabled: { opacity: .48 },
});
