import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Archive, CheckCircle2, Database, FileCheck2, Mail, Power, RefreshCw, Save, Server, ShieldCheck } from 'lucide-react-native';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopSmartBillSettings } from '@/services/shopApi';

type Props = { bottomInset?: number };

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
  const dirty = Boolean(settings && (series !== (settings.invoice_series || '') || Number(dueDays) !== settings.due_days || notes.trim() !== settings.default_notes || archivePdf !== settings.archive_pdf_enabled || issuingEnabled !== settings.issuing_enabled));

  const toggleIssuing = (value: boolean) => {
    if (value && !settings?.issuing_ready) {
      Alert.alert('Emiterea nu poate fi activată', settings?.issuing_block_reason || 'Finalizează testarea conexiunilor, sincronizarea și alegerea seriei.');
      return;
    }
    setIssuingEnabled(value);
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

  if (busy === 'load') return <View style={styles.loading}><ActivityIndicator size="large" color={Theme.colors.brand.cyanStrong} /><Text style={styles.loadingTitle}>Se încarcă SmartBill</Text><Text style={styles.muted}>Cheile rămân exclusiv pe server.</Text></View>;

  return <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 110 + bottomInset }]} showsVerticalScrollIndicator={false}>
    <View style={styles.shell}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><FileCheck2 size={34} color={Theme.colors.brand.cyanStrong} /></View>
        <View style={styles.heroCopy}><Text style={styles.kicker}>FACTURARE EXCLUSIV SMARTBILL</Text><Text style={styles.title}>Configurare facturare SmartBill</Text><Text style={styles.subtitle}>V3 leagă produsele și gestiunile, iar V1 emite factura, citește seriile, stocul și PDF-ul original. Cubis nu calculează următorul număr fiscal.</Text></View>
        <View style={[styles.mode, settings?.issuing_enabled ? styles.modeLive : styles.modeSafe]}><ShieldCheck size={16} color={settings?.issuing_enabled ? Theme.colors.state.error : Theme.colors.state.success} /><Text style={settings?.issuing_enabled ? styles.modeLiveText : styles.modeSafeText}>{settings?.issuing_enabled ? 'EMITERE ACTIVĂ' : 'EMITERE BLOCATĂ'}</Text></View>
      </View>

      <View style={styles.syncCard}><View style={styles.syncIcon}><RefreshCw size={22} color={Theme.colors.brand.cyanStrong} /></View><View style={styles.flex}><Text style={styles.cardTitle}>Sincronizare automată SmartBill</Text><Text style={styles.cardText}>La pornire și la fiecare {Math.max(1, Math.round((settings?.auto_sync_interval_seconds || 300) / 60))} minute · Serii: {settings?.series_last_synced_at || 'în așteptare'} · Gestiuni produse: {settings?.warehouse_last_synced_at || 'în așteptare'}</Text></View><TouchableOpacity disabled={Boolean(busy) || !settings?.read_enabled} onPress={() => void run()} style={[styles.smallButton, (Boolean(busy) || !settings?.read_enabled) && styles.disabled]}>{busy === 'sync' ? <ActivityIndicator color={Theme.colors.brand.navy} /> : <Text style={styles.smallButtonText}>Actualizează acum</Text>}</TouchableOpacity></View>

      <View style={[styles.issuingCard, issuingEnabled && styles.issuingCardActive]}>
        <View style={[styles.issuingIcon, issuingEnabled && styles.issuingIconActive]}><Power size={23} color={issuingEnabled ? Theme.colors.brand.navy : Theme.colors.text.secondary} /></View>
        <View style={styles.flex}><Text style={styles.issuingTitle}>Facturare SmartBill</Text><Text style={styles.issuingText}>{issuingEnabled ? 'Activă pentru facturile noi. SmartBill alocă numărul și descarcă gestiunea fiecărui produs.' : (settings?.issuing_block_reason || 'Oprită. Nicio factură fiscală nu va fi emisă în SmartBill.')}</Text><Text style={styles.authority}>GESTIUNE ȘI STOC CONTABIL: EXCLUSIV SMARTBILL</Text></View>
        <Switch value={issuingEnabled} onValueChange={toggleIssuing} disabled={Boolean(busy) || (!issuingEnabled && !settings?.issuing_ready)} trackColor={{ false: Theme.colors.border.strong, true: Theme.colors.brand.secondaryAction }} thumbColor={issuingEnabled ? Theme.colors.surface.base : Theme.colors.text.muted} ios_backgroundColor={Theme.colors.border.strong} accessibilityLabel="Activează facturarea SmartBill" />
      </View>

      <View style={styles.formCard}>
        <View style={styles.formHead}><Database size={22} color={Theme.colors.brand.secondary} /><View><Text style={styles.cardTitle}>Reguli pentru facturile noi</Text><Text style={styles.cardText}>Valorile sunt referințe SmartBill, nu numerotare locală.</Text></View></View>
        <Text style={styles.label}>SERIE FACTURĂ</Text>
        <View style={styles.choiceGrid}>{availableSeries.map((item) => <TouchableOpacity key={item.name} onPress={() => setSeries(item.name)} style={[styles.choice, series === item.name && styles.choiceActive]}><View><Text style={styles.choiceTitle}>{item.name}</Text><Text style={styles.choiceMeta}>Următorul în SmartBill: {item.next_number || '—'}</Text></View>{series === item.name ? <CheckCircle2 size={20} color={Theme.colors.brand.cyanStrong} /> : null}</TouchableOpacity>)}</View>
        {!availableSeries.length ? <Text style={styles.empty}>Sincronizează întâi seriile din SmartBill V1.</Text> : null}
        <Text style={styles.cardText}>Gestiunea se selectează separat și explicit în fișa fiecărui produs; Cubis nu aplică automat aceeași gestiune întregului catalog.</Text>
        <View style={[styles.fieldRow, wide && styles.fieldRowWide]}><View style={styles.field}><Text style={styles.label}>ZILE SCADENȚĂ</Text><TextInput value={dueDays} onChangeText={setDueDays} keyboardType="number-pad" style={styles.input} placeholder="7" placeholderTextColor={Theme.colors.text.muted} /></View><View style={[styles.field, styles.fieldWide]}><Text style={styles.label}>NOTE IMPLICITE</Text><TextInput value={notes} onChangeText={setNotes} style={styles.input} placeholder="Mesaj opțional pentru client" placeholderTextColor={Theme.colors.text.muted} maxLength={4000} /></View></View>
        <View style={[styles.ruleGrid, wide && styles.fieldRowWide]}><TouchableOpacity onPress={() => setArchivePdf((value) => !value)} style={[styles.ruleCard, archivePdf && styles.ruleCardActive]}><Archive size={21} color={archivePdf ? Theme.colors.brand.cyanStrong : Theme.colors.text.secondary} /><View style={styles.flex}><Text style={styles.choiceTitle}>Arhivare PDF original</Text><Text style={styles.choiceMeta}>Descarcă și păstrează PDF-ul returnat de SmartBill după emitere.</Text></View><Text style={[styles.ruleState, archivePdf && styles.ruleStateActive]}>{archivePdf ? 'ACTIVĂ' : 'OPRITĂ'}</Text></TouchableOpacity><View style={[styles.ruleCard, settings?.email_enabled && styles.ruleCardActive]}><Mail size={21} color={settings?.email_enabled ? Theme.colors.brand.cyanStrong : Theme.colors.text.secondary} /><View style={styles.flex}><Text style={styles.choiceTitle}>E-mail prin SmartBill</Text><Text style={styles.choiceMeta}>Regulile automate Card/Ramburs rămân în Automatizări; poarta server este {settings?.email_enabled ? 'activă' : 'oprită'}.</Text></View><Text style={[styles.ruleState, settings?.email_enabled && styles.ruleStateActive]}>{settings?.email_enabled ? 'PERMIS' : 'BLOCAT'}</Text></View></View>
      </View>

      <View style={styles.safety}><Server size={23} color={Theme.colors.state.success} /><View style={styles.flex}><Text style={styles.safetyTitle}>Secrete numai pe server</Text><Text style={styles.safetyText}>Tokenurile V1/V3 nu sunt incluse în Expo/EAS. Gestiunea și SKU-ul se aleg exclusiv în fișa fiecărui produs.</Text></View></View>
      <View style={styles.referenceCard}><Text style={styles.cardTitle}>Capabilități verificate fără operații fiscale</Text>{Object.entries(settings?.capabilities || {}).map(([key, item]) => <View key={key} style={styles.capability}><Text style={styles.capabilityStatus}>{item.status.replace(/_/g, ' ').toUpperCase()}</Text><Text style={styles.choiceTitle}>{key.replace(/_/g, ' ')}</Text><Text style={styles.cardText}>{item.detail}</Text></View>)}</View>
      <TouchableOpacity disabled={!dirty || Boolean(busy)} onPress={() => void save()} style={[styles.save, (!dirty || Boolean(busy)) && styles.disabled]}>{busy === 'save' ? <ActivityIndicator color={Theme.colors.brand.navy} /> : <><Save size={20} color={Theme.colors.brand.navy} /><Text style={styles.saveText}>{dirty ? 'Salvează configurarea SmartBill' : 'Configurare salvată'}</Text></>}</TouchableOpacity>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 }, content: { padding: 15 }, shell: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: 14 }, flex: { flex: 1, minWidth: 0 },
  loading: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 10 }, loadingTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' }, muted: { color: Colors.textMuted, fontSize: 12 },
  hero: { overflow: 'hidden', gap: 15, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 28, padding: 22, backgroundColor: Theme.colors.surface.brandSoft }, heroIcon: { width: 65, height: 65, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.cyanSoft }, heroCopy: { maxWidth: 680 }, kicker: { color: Theme.colors.brand.cyanStrong, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { marginTop: 6, color: Theme.colors.text.primary, fontSize: 27, fontWeight: '900' }, subtitle: { marginTop: 9, color: Theme.colors.text.secondary, fontSize: 12, lineHeight: 19 }, mode: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 }, modeSafe: { backgroundColor: Theme.colors.state.successSoft }, modeLive: { backgroundColor: Theme.colors.state.errorSoft }, modeSafeText: { color: Theme.colors.state.success, fontSize: 8, fontWeight: '900' }, modeLiveText: { color: Theme.colors.state.error, fontSize: 8, fontWeight: '900' },
  cardTitle: { color: Theme.colors.text.primary, fontSize: 14, fontWeight: '900' }, cardText: { marginTop: 3, color: Theme.colors.text.secondary, fontSize: 10, lineHeight: 15 },
  syncCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 21, padding: 14, backgroundColor: Theme.colors.surface.brandSoft }, syncIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.cyanSoft }, smallButton: { minHeight: 42, justifyContent: 'center', borderRadius: 13, paddingHorizontal: 14, backgroundColor: Theme.colors.brand.secondary }, smallButtonText: { color: Theme.colors.brand.navy, fontSize: 10, fontWeight: '900' },
  issuingCard: { minHeight: 98, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 24, padding: 16, backgroundColor: Theme.colors.background.canvas }, issuingCardActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.brandSoft }, issuingIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.surface.brandSoft }, issuingIconActive: { backgroundColor: Theme.colors.brand.secondary }, issuingTitle: { color: Theme.colors.text.primary, fontSize: 15, fontWeight: '900' }, issuingText: { marginTop: 4, color: Theme.colors.text.secondary, fontSize: 10, lineHeight: 15 }, authority: { marginTop: 7, color: Theme.colors.brand.cyanStrong, fontSize: 7, fontWeight: '900', letterSpacing: .6 },
  formCard: { gap: 14, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 25, padding: 17, backgroundColor: Theme.colors.background.canvas }, formHead: { flexDirection: 'row', alignItems: 'center', gap: 11 }, label: { marginTop: 4, color: Theme.colors.text.secondary, fontSize: 8, fontWeight: '900', letterSpacing: .9 }, choiceGrid: { gap: 8 }, choice: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 16, paddingHorizontal: 13, backgroundColor: Theme.colors.background.canvas }, choiceActive: { borderColor: Theme.colors.border.focus, backgroundColor: Theme.colors.surface.cyanSoft }, choiceTitle: { color: Theme.colors.text.primary, fontSize: 12, fontWeight: '900' }, choiceMeta: { marginTop: 3, color: Theme.colors.text.muted, fontSize: 9 }, empty: { color: Theme.colors.state.error, fontSize: 10 }, fieldRow: { gap: 12 }, fieldRowWide: { flexDirection: 'row' }, field: { flex: 1, gap: 7 }, fieldWide: { flex: 2 }, input: { minHeight: 50, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 15, paddingHorizontal: 13, color: Theme.colors.text.primary, backgroundColor: Theme.colors.background.canvas },
  referenceCard: { gap: 11, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, padding: 16, backgroundColor: Theme.colors.background.canvas }, capability: { gap: 4, borderTopWidth: 1, borderTopColor: Theme.colors.border.default, paddingTop: 10 }, capabilityStatus: { color: Theme.colors.brand.cyanStrong, fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  ruleGrid: { gap: 9 }, ruleCard: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, padding: 12, backgroundColor: Theme.colors.background.canvas }, ruleCardActive: { borderColor: Theme.colors.brand.secondary, backgroundColor: Theme.colors.surface.cyanSoft }, ruleState: { color: Theme.colors.text.secondary, fontSize: 7, fontWeight: '900' }, ruleStateActive: { color: Theme.colors.brand.primaryText },
  safety: { flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: Theme.colors.state.success, borderRadius: 21, padding: 15, backgroundColor: Theme.colors.state.successSoft }, safetyTitle: { color: Theme.colors.state.success, fontSize: 13, fontWeight: '900' }, safetyText: { marginTop: 4, color: Theme.colors.text.secondary, fontSize: 10, lineHeight: 16 }, save: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 20, backgroundColor: Theme.colors.brand.secondary }, saveText: { color: Theme.colors.brand.navy, fontSize: 13, fontWeight: '900' }, disabled: { opacity: .45 },
});
