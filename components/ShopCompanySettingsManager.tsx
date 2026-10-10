import { Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { ShopCompanySettings, shopApi } from '@/services/shopApi';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Landmark,
  MapPin,
  Save,
  ShieldCheck,
  Stamp,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const FieldFocusContext = React.createContext<((target: number) => void) | undefined>(undefined);

type DialogState = {
  kind: 'success' | 'error' | 'delete';
  title: string;
  message: string;
} | null;

const emptyCompany = (): ShopCompanySettings => ({
  id: 0,
  legal_name: '',
  trade_name: 'Cubis Shop',
  cui: '',
  registration_number: '',
  address: '',
  city: '',
  county: '',
  postal_code: '',
  country: 'România',
  physical_address: 'București–Ilfov',
  email: '',
  phone: '',
  website: 'https://cubisshop.ro',
  bank_name: '',
  iban: '',
  share_capital: '',
  stamp_url: null,
  is_default: false,
  vat_payer: false,
  vat_rate: 19,
});

export default function ShopCompanySettingsManager({ onFieldFocus }: { onFieldFocus?: (target: number) => void }) {
  const { token } = useAuth();
  const [companies, setCompanies] = useState<ShopCompanySettings[]>([]);
  const [company, setCompany] = useState<ShopCompanySettings>(emptyCompany());
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [stampMenuOpen, setStampMenuOpen] = useState(false);

  const selectCompany = (next: ShopCompanySettings) => {
    setCompany({ ...next, stamp_base64: undefined, remove_stamp: false });
    setStampPreview(next.stamp_url || null);
  };

  const load = useCallback(async (preferredId?: number) => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await shopApi.listCompanySettings(token);
      setCompanies(list);
      selectCompany(list.find((item) => item.id === preferredId) || list.find((item) => item.is_default) || list[0] || emptyCompany());
    } catch (error) {
      setDialog({ kind: 'error', title: 'Firmele nu s-au putut încărca', message: error instanceof Error ? error.message : 'Încearcă din nou.' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const update = <K extends keyof ShopCompanySettings>(key: K, value: ShopCompanySettings[K]) => {
    setCompany((current) => ({ ...current, [key]: value }));
  };

  const completion = useMemo(() => {
    const fields = [company.legal_name, company.cui, company.address, company.email, company.phone, company.iban];
    return Math.round((fields.filter((value) => String(value || '').trim()).length / fields.length) * 100);
  }, [company.address, company.cui, company.email, company.iban, company.legal_name, company.phone]);

  const pickStamp = async () => {
    setStampMenuOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setDialog({ kind: 'error', title: 'Acces necesar', message: 'Permite accesul la fotografii pentru a selecta ștampila.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: .85,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.base64) {
      setStampPreview(asset.uri);
      setCompany((current) => ({
        ...current,
        stamp_base64: `data:${asset.mimeType || 'image/png'};base64,${asset.base64}`,
        remove_stamp: false,
      }));
    }
  };

  const removeStamp = () => {
    setStampMenuOpen(false);
    setStampPreview(null);
    setCompany((current) => ({ ...current, stamp_base64: undefined, stamp_url: null, remove_stamp: true }));
  };

  const save = async () => {
    if (!token || saving) return;
    Keyboard.dismiss();
    if (!company.legal_name.trim()) {
      setDialog({ kind: 'error', title: 'Completează denumirea legală', message: 'Acest câmp este obligatoriu pentru salvarea profilului firmei.' });
      return;
    }
    setSaving(true);
    try {
      const saved = company.id
        ? await shopApi.updateCompanySettings(token, company.id, company)
        : await shopApi.createCompanySettings(token, company);
      await load(saved.id);
      setDialog({
        kind: 'success',
        title: 'Firma a fost salvată',
        message: saved.is_default ? 'Aceasta este firma folosită implicit în aplicație.' : 'Datele firmei sunt acum actualizate.',
      });
    } catch (error) {
      setDialog({ kind: 'error', title: 'Datele nu s-au putut salva', message: error instanceof Error ? error.message : 'Încearcă din nou.' });
    } finally {
      setSaving(false);
    }
  };

  const requestCompanyRemoval = () => {
    if (!token || !company.id) return;
    Keyboard.dismiss();
    setDialog({ kind: 'delete', title: 'Ștergi această firmă?', message: 'Datele și ștampila asociată vor fi eliminate definitiv.' });
  };

  const confirmCompanyRemoval = async () => {
    if (!token || !company.id || deleting) return;
    setDeleting(true);
    try {
      await shopApi.deleteCompanySettings(token, company.id);
      setDialog(null);
      await load();
    } catch (error) {
      setDialog({ kind: 'error', title: 'Firma nu s-a putut șterge', message: error instanceof Error ? error.message : 'Încearcă din nou.' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <View style={styles.loading}>
      <View style={styles.loadingIcon}><ActivityIndicator size="small" color={Theme.colors.brand.primary} /></View>
      <Text style={styles.loadingTitle}>Pregătim datele firmei</Text>
      <Text style={styles.loadingText}>Sincronizăm profilul comercial.</Text>
    </View>;
  }

  return <FieldFocusContext.Provider value={onFieldFocus}>
    <View style={styles.page}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}><Building2 size={25} color={Theme.colors.brand.primaryAction} /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>IDENTITATE COMERCIALĂ</Text>
            <Text style={styles.title}>Datele firmei</Text>
            <Text style={styles.subtitle}>Informațiile folosite în documentele și comenzile magazinului.</Text>
          </View>
        </View>
        <View style={styles.heroPills}>
          <View style={[styles.heroPill, company.is_default && styles.heroPillSuccess]}>
            <View style={[styles.statusDot, company.is_default && styles.statusDotSuccess]} />
            <Text style={[styles.heroPillText, company.is_default && styles.heroPillTextSuccess]}>{company.is_default ? 'Firmă implicită' : 'Firmă secundară'}</Text>
          </View>
          <View style={styles.heroPill}><Text style={styles.heroPillText}>Profil {completion}%</Text></View>
        </View>
      </View>

      {companies.length > 0 ? <View style={styles.selectorBlock}>
        <Text style={styles.selectorLabel}>{companies.length > 1 ? 'ALEGE SOCIETATEA' : 'SOCIETATEA ACTIVĂ'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.companyRail}>
          {companies.map((item) => {
            const selected = company.id === item.id;
            return <TouchableOpacity key={item.id} activeOpacity={.78} onPress={() => selectCompany(item)} style={[styles.companyChip, selected && styles.companyChipActive]}>
              <View style={[styles.companyMark, selected && styles.companyMarkActive]}>
                {selected ? <Check size={17} color={Theme.colors.text.onBrand} strokeWidth={2.6} /> : <Building2 size={17} color={Theme.colors.text.secondary} />}
              </View>
              <View style={styles.companyChipCopy}>
                <Text numberOfLines={1} style={styles.companyChipTitle}>{item.trade_name || item.legal_name}</Text>
                <Text numberOfLines={1} style={styles.companyChipMeta}>{item.cui || 'CUI necompletat'}{item.is_default ? ' · implicită' : ''}</Text>
              </View>
              <ChevronRight size={17} color={selected ? Theme.colors.brand.primaryAction : Theme.colors.text.disabled} />
            </TouchableOpacity>;
          })}
        </ScrollView>
      </View> : null}

      <View style={[styles.defaultCard, company.is_default && styles.defaultCardActive]}>
        <View style={[styles.defaultIcon, company.is_default && styles.defaultIconActive]}>
          <ShieldCheck size={21} color={company.is_default ? Theme.colors.state.success : Theme.colors.text.secondary} />
        </View>
        <View style={styles.flexCopy}>
          <Text style={styles.defaultTitle}>Firmă implicită</Text>
          <Text style={styles.defaultText}>Selectată automat în documente și comenzi.</Text>
        </View>
        <AppSwitch value={company.is_default} onValueChange={(value) => update('is_default', value)} />
      </View>

      <Section number="01" Icon={Building2} title="Identitate juridică" description="Datele oficiale ale societății.">
        <Field label="Denumire legală *" value={company.legal_name} onChangeText={(value) => update('legal_name', value)} placeholder="Denumirea completă a firmei" />
        <Field label="Nume comercial" value={company.trade_name} onChangeText={(value) => update('trade_name', value)} placeholder="Cubis Shop" />
        <Row>
          <Field label="CUI / CIF" value={company.cui} onChangeText={(value) => update('cui', value)} />
          <Field label="Registrul comerțului" value={company.registration_number} onChangeText={(value) => update('registration_number', value)} />
        </Row>
        <View style={[styles.settingCard, company.vat_payer && styles.settingCardActive]}>
          <View style={styles.flexCopy}>
            <Text style={styles.settingTitle}>Plătitoare de TVA</Text>
            <Text style={styles.settingText}>Societate înregistrată în scopuri de TVA.</Text>
          </View>
          <AppSwitch value={company.vat_payer} onValueChange={(value) => update('vat_payer', value)} />
        </View>
        {company.vat_payer ? <View style={styles.vatRateCard}>
          <View style={styles.flexCopy}>
            <Text style={styles.settingTitle}>Cota TVA</Text>
            <Text style={styles.settingText}>Folosită intern în modulele financiare.</Text>
          </View>
          <View style={styles.vatRateInput}>
            <TextInput value={String(company.vat_rate ?? 19)} onChangeText={(value) => update('vat_rate', Math.max(0, Math.min(100, Number(value.replace(',', '.')) || 0)))} keyboardType="decimal-pad" selectTextOnFocus style={styles.vatRateText} />
            <Text style={styles.vatRateSuffix}>%</Text>
          </View>
        </View> : null}
      </Section>

      <Section number="02" Icon={MapPin} title="Sediu și contact" description="Adresa juridică și datele generale de contact.">
        <Field label="Adresa sediului social" value={company.address} onChangeText={(value) => update('address', value)} />
        <Row>
          <Field label="Localitate" value={company.city} onChangeText={(value) => update('city', value)} />
          <Field label="Județ" value={company.county} onChangeText={(value) => update('county', value)} />
        </Row>
        <Row>
          <Field label="Cod poștal" value={company.postal_code} onChangeText={(value) => update('postal_code', value)} />
          <Field label="Țară" value={company.country} onChangeText={(value) => update('country', value)} />
        </Row>
        <Field label="E-mail" value={company.email} onChangeText={(value) => update('email', value)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Telefon" value={company.phone} onChangeText={(value) => update('phone', value)} keyboardType="phone-pad" />
        <Field label="Website" value={company.website} onChangeText={(value) => update('website', value)} autoCapitalize="none" />
      </Section>

      <Section number="03" Icon={MapPin} title="Adresă publică" description="Zona afișată clienților în pagina de contact.">
        <Field label="Adresă fizică / zonă deservită" value={company.physical_address} onChangeText={(value) => update('physical_address', value)} placeholder="București–Ilfov" />
      </Section>

      <Section number="04" Icon={Landmark} title="Date bancare" description="Informațiile afișate pe documentele financiare.">
        <Field label="Banca" value={company.bank_name} onChangeText={(value) => update('bank_name', value)} />
        <Field label="IBAN" value={company.iban} onChangeText={(value) => update('iban', value.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" />
        <Field label="Capital social" value={company.share_capital} onChangeText={(value) => update('share_capital', value)} placeholder="Ex: 200 lei" />
      </Section>

      <Section number="05" Icon={Stamp} title="Ștampila firmei" description="Imagine opțională pentru documentele generate.">
        <TouchableOpacity activeOpacity={.8} style={[styles.stampPreview, stampPreview && styles.stampPreviewFilled]} onPress={() => setStampMenuOpen(true)}>
          {stampPreview
            ? <Image source={{ uri: stampPreview }} resizeMode="contain" style={styles.stampImage} />
            : <><View style={styles.stampEmptyIcon}><Stamp size={27} color={Theme.colors.brand.primaryAction} /></View><Text style={styles.stampEmptyTitle}>Adaugă ștampila</Text><Text style={styles.stampEmptyText}>PNG sau JPG din galeria telefonului</Text></>}
        </TouchableOpacity>
        <View style={styles.stampActions}>
          <TouchableOpacity activeOpacity={.78} style={styles.tonalButton} onPress={() => setStampMenuOpen(true)}>
            <Upload size={18} color={Theme.colors.brand.primaryAction} />
            <Text style={styles.tonalButtonText}>{stampPreview ? 'Schimbă imaginea' : 'Alege imaginea'}</Text>
          </TouchableOpacity>
          {stampPreview ? <TouchableOpacity activeOpacity={.78} style={styles.errorButton} onPress={removeStamp}>
            <Trash2 size={18} color={Theme.colors.state.error} />
            <Text style={styles.errorButtonText}>Elimină</Text>
          </TouchableOpacity> : null}
        </View>
      </Section>

      <View style={styles.actions}>
        <TouchableOpacity activeOpacity={.82} style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>
          {saving ? <ActivityIndicator color={Theme.colors.text.onBrand} /> : <><Save size={19} color={Theme.colors.text.onBrand} /><Text style={styles.saveText}>{company.id ? 'Salvează modificările' : 'Adaugă firma'}</Text></>}
        </TouchableOpacity>
        {company.id && companies.length > 1 ? <TouchableOpacity accessibilityLabel="Șterge firma" activeOpacity={.78} style={styles.deleteCompany} onPress={requestCompanyRemoval}><Trash2 size={20} color={Theme.colors.state.error} /></TouchableOpacity> : null}
      </View>
    </View>

    <StampSheet visible={stampMenuOpen} hasStamp={Boolean(stampPreview)} onClose={() => setStampMenuOpen(false)} onPick={() => void pickStamp()} onRemove={removeStamp} />
    <CompanyDialog dialog={dialog} busy={deleting} onClose={() => !deleting && setDialog(null)} onConfirmDelete={() => void confirmCompanyRemoval()} />
  </FieldFocusContext.Provider>;
}

function Section({ number, Icon, title, description, children }: React.PropsWithChildren<{ number: string; Icon: typeof Building2; title: string; description: string }>) {
  return <View style={styles.section}>
    <View style={styles.sectionHead}>
      <View style={styles.sectionIcon}><Icon size={20} color={Theme.colors.brand.primaryAction} /></View>
      <View style={styles.flexCopy}>
        <Text style={styles.sectionEyebrow}>SECȚIUNEA {number}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionText}>{description}</Text>
      </View>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>;
}

function Row({ children }: React.PropsWithChildren) {
  return <View style={styles.row}>{children}</View>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const revealField = React.useContext(FieldFocusContext);
  const [focused, setFocused] = useState(false);
  const { label, onFocus, onBlur, ...input } = props;
  return <View style={styles.field}>
    <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
    <TextInput
      {...input}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
        revealField?.(event.nativeEvent.target);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      placeholderTextColor={Theme.colors.text.disabled}
      style={[styles.input, focused && styles.inputFocused]}
    />
  </View>;
}

function AppSwitch({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) {
  return <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#DDE5EC', true: '#A9D0FA' }} thumbColor={value ? Theme.colors.brand.primaryAction : Theme.colors.surface.base} ios_backgroundColor="#DDE5EC" />;
}

function StampSheet({ visible, hasStamp, onClose, onPick, onRemove }: { visible: boolean; hasStamp: boolean; onClose: () => void; onPick: () => void; onRemove: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable style={styles.modalBackdrop} onPress={onClose}>
      <Pressable style={styles.bottomSheet} onPress={(event) => event.stopPropagation()}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHead}>
          <View style={styles.dialogIcon}><Stamp size={23} color={Theme.colors.brand.primaryAction} /></View>
          <View style={styles.flexCopy}><Text style={styles.sheetTitle}>Ștampila firmei</Text><Text style={styles.sheetText}>Alege o imagine clară, cu fundal transparent sau alb.</Text></View>
          <TouchableOpacity accessibilityLabel="Închide" style={styles.closeButton} onPress={onClose}><X size={20} color={Theme.colors.text.secondary} /></TouchableOpacity>
        </View>
        <TouchableOpacity activeOpacity={.8} style={styles.sheetPrimaryAction} onPress={onPick}>
          <View style={styles.sheetActionIcon}><Upload size={20} color={Theme.colors.brand.primaryAction} /></View>
          <View style={styles.flexCopy}><Text style={styles.sheetActionTitle}>{hasStamp ? 'Alege altă imagine' : 'Alege din galerie'}</Text><Text style={styles.sheetActionText}>PNG sau JPG</Text></View>
          <ChevronRight size={20} color={Theme.colors.text.muted} />
        </TouchableOpacity>
        {hasStamp ? <TouchableOpacity activeOpacity={.8} style={styles.sheetDeleteAction} onPress={onRemove}><Trash2 size={19} color={Theme.colors.state.error} /><Text style={styles.sheetDeleteText}>Elimină ștampila actuală</Text></TouchableOpacity> : null}
      </Pressable>
    </Pressable>
  </Modal>;
}

function CompanyDialog({ dialog, busy, onClose, onConfirmDelete }: { dialog: DialogState; busy: boolean; onClose: () => void; onConfirmDelete: () => void }) {
  if (!dialog) return null;
  const isDelete = dialog.kind === 'delete';
  const isSuccess = dialog.kind === 'success';
  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable style={styles.dialogBackdrop} onPress={onClose}>
      <Pressable style={styles.dialogCard} onPress={(event) => event.stopPropagation()}>
        <View style={[styles.dialogIconLarge, isSuccess ? styles.dialogIconSuccess : dialog.kind === 'error' || isDelete ? styles.dialogIconError : null]}>
          {isSuccess ? <CheckCircle2 size={28} color={Theme.colors.state.success} /> : <AlertCircle size={28} color={Theme.colors.state.error} />}
        </View>
        <Text style={styles.dialogTitle}>{dialog.title}</Text>
        <Text style={styles.dialogMessage}>{dialog.message}</Text>
        <View style={styles.dialogActions}>
          {isDelete ? <>
            <TouchableOpacity disabled={busy} style={styles.dialogSecondary} onPress={onClose}><Text style={styles.dialogSecondaryText}>Renunță</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} style={[styles.dialogDestructive, busy && styles.disabled]} onPress={onConfirmDelete}>{busy ? <ActivityIndicator color={Theme.colors.text.onBrand} /> : <Text style={styles.dialogDestructiveText}>Șterge firma</Text>}</TouchableOpacity>
          </> : <TouchableOpacity style={styles.dialogPrimary} onPress={onClose}><Text style={styles.dialogPrimaryText}>Am înțeles</Text></TouchableOpacity>}
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 14, paddingTop: 13, gap: 14 },
  flexCopy: { minWidth: 0, flex: 1 },
  loading: { minHeight: 430, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: Theme.colors.surface.brandSoft },
  loadingTitle: { marginTop: 16, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 17 },
  loadingText: { marginTop: 5, color: Theme.colors.text.muted, fontFamily: Theme.typography.regular, fontSize: 13 },

  hero: { padding: 18, borderRadius: 28, backgroundColor: Theme.colors.surface.brandSoft },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  heroIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Theme.colors.surface.base },
  heroCopy: { minWidth: 0, flex: 1, paddingTop: 1 },
  kicker: { color: Theme.colors.brand.primaryText, fontFamily: Theme.typography.bold, fontSize: 10, letterSpacing: 1 },
  title: { marginTop: 5, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 25, lineHeight: 30 },
  subtitle: { marginTop: 5, color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 12, lineHeight: 18 },
  heroPills: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroPill: { minHeight: 30, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Theme.radius.round, backgroundColor: Theme.colors.surface.base },
  heroPillSuccess: { backgroundColor: Theme.colors.state.successSoft },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.colors.text.disabled },
  statusDotSuccess: { backgroundColor: Theme.colors.state.successBright },
  heroPillText: { color: Theme.colors.text.secondary, fontFamily: Theme.typography.semibold, fontSize: 11 },
  heroPillTextSuccess: { color: Theme.colors.state.success },

  selectorBlock: { gap: 8 },
  selectorLabel: { paddingHorizontal: 4, color: Theme.colors.text.muted, fontFamily: Theme.typography.bold, fontSize: 10, letterSpacing: .8 },
  companyRail: { gap: 10, paddingHorizontal: 1 },
  companyChip: { width: 264, minHeight: 72, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 22, backgroundColor: Theme.colors.surface.base },
  companyChipActive: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft },
  companyMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.muted },
  companyMarkActive: { backgroundColor: Theme.colors.brand.primaryAction },
  companyChipCopy: { minWidth: 0, flex: 1 },
  companyChipTitle: { color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 13 },
  companyChipMeta: { marginTop: 3, color: Theme.colors.text.muted, fontFamily: Theme.typography.medium, fontSize: 10 },

  defaultCard: { minHeight: 78, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 22, backgroundColor: Theme.colors.surface.subtle },
  defaultCardActive: { borderColor: '#CBEBDD', backgroundColor: Theme.colors.state.successSoft },
  defaultIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.base },
  defaultIconActive: { backgroundColor: '#E0F5EA' },
  defaultTitle: { color: Theme.colors.text.primary, fontFamily: Theme.typography.semibold, fontSize: 13 },
  defaultText: { marginTop: 3, color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 11, lineHeight: 15 },

  section: { overflow: 'hidden', borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: 26, backgroundColor: Theme.colors.surface.base },
  sectionHead: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Theme.colors.surface.subtle },
  sectionIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.surface.brandSoft },
  sectionEyebrow: { color: Theme.colors.brand.primaryText, fontFamily: Theme.typography.bold, fontSize: 9, letterSpacing: .8 },
  sectionTitle: { marginTop: 2, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 15 },
  sectionText: { marginTop: 3, color: Theme.colors.text.muted, fontFamily: Theme.typography.regular, fontSize: 11, lineHeight: 15 },
  sectionBody: { padding: 14, gap: 13 },
  row: { flexDirection: 'row', gap: 10 },
  field: { minWidth: 0, flex: 1, gap: 7 },
  label: { paddingLeft: 3, color: Theme.colors.text.secondary, fontFamily: Theme.typography.semibold, fontSize: 11 },
  labelFocused: { color: Theme.colors.brand.primaryText },
  input: { minHeight: 54, paddingHorizontal: 14, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: 17, color: Theme.colors.text.primary, backgroundColor: Theme.colors.surface.base, fontFamily: Theme.typography.medium, fontSize: 13 },
  inputFocused: { borderWidth: 2, borderColor: Theme.colors.border.focus, paddingHorizontal: 13, backgroundColor: Theme.colors.surface.brandSoft },

  settingCard: { minHeight: 72, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, backgroundColor: Theme.colors.surface.muted },
  settingCardActive: { backgroundColor: Theme.colors.surface.brandSoft },
  settingTitle: { color: Theme.colors.text.primary, fontFamily: Theme.typography.semibold, fontSize: 12 },
  settingText: { marginTop: 3, color: Theme.colors.text.muted, fontFamily: Theme.typography.regular, fontSize: 10, lineHeight: 14 },
  vatRateCard: { minHeight: 78, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#F0DDAE', borderRadius: 19, backgroundColor: Theme.colors.state.warningSoft },
  vatRateInput: { width: 88, height: 50, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E6CC8E', borderRadius: 15, backgroundColor: Theme.colors.surface.base },
  vatRateText: { flex: 1, color: Theme.colors.state.warning, fontFamily: Theme.typography.bold, fontSize: 17, textAlign: 'right' },
  vatRateSuffix: { marginLeft: 4, color: Theme.colors.state.warning, fontFamily: Theme.typography.bold, fontSize: 13 },

  stampPreview: { minHeight: 142, padding: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: Theme.colors.border.brandSoft, borderRadius: 22, backgroundColor: Theme.colors.surface.subtle },
  stampPreviewFilled: { borderStyle: 'solid', backgroundColor: Theme.colors.surface.base },
  stampImage: { width: '100%', height: 110 },
  stampEmptyIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: Theme.colors.surface.brandSoft },
  stampEmptyTitle: { marginTop: 11, color: Theme.colors.text.primary, fontFamily: Theme.typography.semibold, fontSize: 13 },
  stampEmptyText: { marginTop: 4, color: Theme.colors.text.muted, fontFamily: Theme.typography.regular, fontSize: 10 },
  stampActions: { flexDirection: 'row', gap: 9 },
  tonalButton: { minHeight: 50, paddingHorizontal: 15, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, backgroundColor: Theme.colors.surface.brandSoft },
  tonalButtonText: { color: Theme.colors.brand.primaryText, fontFamily: Theme.typography.semibold, fontSize: 12 },
  errorButton: { minHeight: 50, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: Theme.colors.state.errorSoft },
  errorButtonText: { color: Theme.colors.state.error, fontFamily: Theme.typography.semibold, fontSize: 12 },

  actions: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  save: { minHeight: 58, paddingHorizontal: 20, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 19, backgroundColor: Theme.colors.brand.primaryAction },
  disabled: { opacity: .58 },
  saveText: { color: Theme.colors.text.onBrand, fontFamily: Theme.typography.bold, fontSize: 13 },
  deleteCompany: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: Theme.colors.state.errorSoft },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 12, backgroundColor: Theme.colors.overlay.scrim },
  bottomSheet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, borderRadius: 30, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.modal },
  sheetHandle: { width: 42, height: 4, alignSelf: 'center', marginBottom: 17, borderRadius: 2, backgroundColor: Theme.colors.border.strong },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dialogIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.surface.brandSoft },
  sheetTitle: { color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 18 },
  sheetText: { marginTop: 3, color: Theme.colors.text.muted, fontFamily: Theme.typography.regular, fontSize: 11, lineHeight: 16 },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.muted },
  sheetPrimaryAction: { minHeight: 72, marginTop: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 21, backgroundColor: Theme.colors.surface.brandSoft },
  sheetActionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Theme.colors.surface.base },
  sheetActionTitle: { color: Theme.colors.text.primary, fontFamily: Theme.typography.semibold, fontSize: 13 },
  sheetActionText: { marginTop: 3, color: Theme.colors.text.muted, fontFamily: Theme.typography.regular, fontSize: 10 },
  sheetDeleteAction: { minHeight: 50, marginTop: 10, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, backgroundColor: Theme.colors.state.errorSoft },
  sheetDeleteText: { color: Theme.colors.state.error, fontFamily: Theme.typography.semibold, fontSize: 12 },

  dialogBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Theme.colors.overlay.scrim },
  dialogCard: { width: '100%', maxWidth: 370, padding: 22, borderRadius: 30, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.modal },
  dialogIconLarge: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: Theme.colors.surface.brandSoft },
  dialogIconSuccess: { backgroundColor: Theme.colors.state.successSoft },
  dialogIconError: { backgroundColor: Theme.colors.state.errorSoft },
  dialogTitle: { marginTop: 18, color: Theme.colors.text.primary, fontFamily: Theme.typography.bold, fontSize: 21, lineHeight: 27 },
  dialogMessage: { marginTop: 7, color: Theme.colors.text.secondary, fontFamily: Theme.typography.regular, fontSize: 13, lineHeight: 19 },
  dialogActions: { marginTop: 22, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  dialogPrimary: { minHeight: 48, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.brand.primaryAction },
  dialogPrimaryText: { color: Theme.colors.text.onBrand, fontFamily: Theme.typography.bold, fontSize: 12 },
  dialogSecondary: { minHeight: 48, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.surface.muted },
  dialogSecondaryText: { color: Theme.colors.text.secondary, fontFamily: Theme.typography.semibold, fontSize: 12 },
  dialogDestructive: { minHeight: 48, minWidth: 118, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: Theme.colors.state.error },
  dialogDestructiveText: { color: Theme.colors.text.onBrand, fontFamily: Theme.typography.bold, fontSize: 12 },
});
