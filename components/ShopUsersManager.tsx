import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, KeyRound, MonitorSmartphone, Pencil, Plus, ShieldCheck, Trash2, UserRound, UsersRound, X } from 'lucide-react-native';
import { Colors, Theme } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { createAppUser, deleteAppUser, getAppUsers, updateAppUser, type AppUserPayload } from '@/services/api';
import type { AppUser, PlatformAccess, UserRole } from '@/types';

const emptyForm: AppUserPayload = {
  username: '',
  display_name: '',
  password: '',
  role: 'user',
  platform_access: 'both',
  is_active: true,
};

const roleLabels: Record<UserRole, string> = { admin: 'Administrator', manager: 'Manager', user: 'Utilizator' };
const platformLabels: Record<PlatformAccess, string> = { desktop: 'Desktop', mobile: 'Mobil', both: 'Desktop + Mobil' };

export default function ShopUsersManager() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState<AppUserPayload>(emptyForm);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token || user?.role !== 'admin') return;
    try {
      setLoading(true);
      setError('');
      setRows(await getAppUsers(token));
    } catch (cause: any) {
      setError(cause.message || 'Utilizatorii nu au putut fi încărcați.');
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    const task = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(task);
  }, [load]);

  if (user?.role !== 'admin') {
    return <View style={styles.state}><ShieldCheck size={28} color={Colors.textMuted} /><Text style={styles.stateText}>Administrarea utilizatorilor este disponibilă doar administratorilor.</Text></View>;
  }

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const startEdit = (row: AppUser) => {
    setEditing(row);
    setForm({
      username: row.username,
      display_name: row.display_name,
      password: '',
      role: row.role,
      platform_access: row.platform_access,
      is_active: row.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.username.trim() || !form.display_name.trim()) return Alert.alert('Date incomplete', 'Completează utilizatorul și numele afișat.');
    if (!editing && (!form.password || form.password.length < 6)) return Alert.alert('Parolă prea scurtă', 'Parola trebuie să aibă minimum 6 caractere.');
    if (editing && form.password && form.password.length < 6) return Alert.alert('Parolă prea scurtă', 'Parola trebuie să aibă minimum 6 caractere.');
    try {
      setSaving(true);
      if (editing) await updateAppUser(token, editing.id, form);
      else await createAppUser(token, form);
      setOpen(false);
      await load();
    } catch (cause: any) {
      Alert.alert('Eroare', cause.message || 'Utilizatorul nu a putut fi salvat.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: AppUser) => Alert.alert('Ștergi utilizatorul?', `Contul ${row.username} va fi eliminat.`, [
    { text: 'Renunță', style: 'cancel' },
    { text: 'Șterge', style: 'destructive', onPress: async () => {
      try { await deleteAppUser(token, row.id); await load(); }
      catch (cause: any) { Alert.alert('Eroare', cause.message || 'Utilizatorul nu a putut fi șters.'); }
    } },
  ]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={Theme.gradients.action} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}><UsersRound size={24} color={Theme.colors.brand.primaryAction} /></View>
          <View style={styles.heroBadge}><View style={styles.onlineDot} /><Text style={styles.heroBadgeText}>ACCES SECURIZAT</Text></View>
        </View>
        <Text style={styles.heroTitle}>Echipa ta</Text>
        <Text style={styles.heroSubtitle}>Creează conturi și controlează simplu accesul în aplicațiile Cubis Shop.</Text>
      </LinearGradient>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{rows.length}</Text><Text style={styles.summaryLabel}>CONTURI</Text></View>
        <View style={styles.summaryCard}><Text style={[styles.summaryValue, styles.summaryValueSuccess]}>{rows.filter((row) => row.is_active).length}</Text><Text style={styles.summaryLabel}>ACTIVE</Text></View>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{rows.filter((row) => row.role === 'admin').length}</Text><Text style={styles.summaryLabel}>ADMIN</Text></View>
      </View>

      <View style={styles.heading}>
        <View><Text style={styles.kicker}>UTILIZATORI CREAȚI</Text><Text style={styles.title}>Conturi și acces</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Adaugă utilizator" style={styles.add} onPress={startCreate}><Plus size={18} color={Colors.white} /><Text style={styles.addText}>Adaugă</Text></TouchableOpacity>
      </View>

      {loading ? <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se încarcă utilizatorii…</Text></View> : error ? <View style={styles.state}><ShieldCheck size={28} color={Colors.error} /><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retryButton} onPress={() => void load()}><Text style={styles.retry}>Reîncearcă</Text></TouchableOpacity></View> : rows.length === 0 ? <View style={styles.state}><UserRound size={30} color={Colors.textMuted} /><Text style={styles.stateTitle}>Niciun utilizator încă</Text><Text style={styles.stateText}>Adaugă primul cont pentru echipa ta.</Text></View> : rows.map((row) => {
        const removeDisabled = row.username.toLowerCase() === 'admin' || row.id === user.id;
        return (
          <View key={row.id} style={styles.row}>
            <View style={styles.rowHead}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(row.display_name || row.username).slice(0, 2).toUpperCase()}</Text></View>
              <View style={styles.copy}>
                <View style={styles.nameLine}><Text numberOfLines={1} style={styles.name}>{row.display_name}</Text><View style={[styles.statusPill, !row.is_active && styles.statusPillInactive]}><View style={[styles.statusDot, !row.is_active && styles.statusDotInactive]} /><Text style={[styles.statusText, !row.is_active && styles.statusTextInactive]}>{row.is_active ? 'Activ' : 'Inactiv'}</Text></View></View>
                <Text numberOfLines={1} style={styles.meta}>@{row.username}</Text>
              </View>
            </View>
            <View style={styles.rowDetails}>
              <View style={styles.detailChip}><ShieldCheck size={13} color={Theme.colors.brand.primaryText} /><Text style={styles.detailText}>{roleLabels[row.role]}</Text></View>
              <View style={styles.detailChip}><MonitorSmartphone size={13} color={Theme.colors.brand.cyanStrong} /><Text style={styles.detailText}>{platformLabels[row.platform_access]}</Text></View>
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Editează ${row.display_name}`} style={styles.editButton} onPress={() => startEdit(row)}><Pencil size={15} color={Theme.colors.brand.primaryText} /><Text style={styles.editButtonText}>Editează</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Șterge ${row.display_name}`} style={[styles.deleteButton, removeDisabled && styles.buttonDisabled]} disabled={removeDisabled} onPress={() => remove(row)}><Trash2 size={15} color={removeDisabled ? Theme.colors.text.disabled : Theme.colors.state.error} /></TouchableOpacity>
            </View>
          </View>
        );
      })}

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHead}>
              <View style={styles.modalTitleWrap}><View style={styles.modalIcon}>{editing ? <Pencil size={18} color={Theme.colors.brand.primaryText} /> : <UserRound size={19} color={Theme.colors.brand.primaryText} />}</View><View><Text style={styles.modalTitle}>{editing ? 'Editează utilizatorul' : 'Utilizator nou'}</Text><Text style={styles.modalSubtitle}>Date de acces și permisiuni</Text></View></View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Închide" style={styles.closeButton} onPress={() => setOpen(false)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.fieldGroup}><Text style={styles.label}>NUME AFIȘAT</Text><View style={styles.inputShell}><UserRound size={17} color={Colors.textMuted} /><TextInput style={styles.input} value={form.display_name} placeholder="Ex. Maria Popescu" placeholderTextColor={Theme.colors.text.disabled} returnKeyType="next" onChangeText={(display_name) => setForm({ ...form, display_name })} /></View></View>
              <View style={styles.fieldGroup}><Text style={styles.label}>UTILIZATOR</Text><View style={styles.inputShell}><UserRound size={17} color={Colors.textMuted} /><TextInput style={styles.input} value={form.username} editable={!editing || editing.username.toLowerCase() !== 'admin'} autoCapitalize="none" autoCorrect={false} placeholder="nume.utilizator" placeholderTextColor={Theme.colors.text.disabled} returnKeyType="next" onChangeText={(username) => setForm({ ...form, username })} /></View></View>
              <View style={styles.fieldGroup}><Text style={styles.label}>{editing ? 'PAROLĂ NOUĂ (OPȚIONAL)' : 'PAROLĂ'}</Text><View style={styles.inputShell}><KeyRound size={17} color={Colors.textMuted} /><TextInput style={styles.input} value={form.password} secureTextEntry autoCapitalize="none" placeholder="Minimum 6 caractere" placeholderTextColor={Theme.colors.text.disabled} returnKeyType="done" onChangeText={(password) => setForm({ ...form, password })} /></View></View>

              <Text style={styles.label}>ROL</Text>
              <View style={styles.choices}>{(['admin', 'manager', 'user'] as UserRole[]).map((role) => <TouchableOpacity key={role} style={[styles.choice, form.role === role && styles.choiceActive]} onPress={() => setForm({ ...form, role })}><Text style={[styles.choiceText, form.role === role && styles.choiceTextActive]}>{roleLabels[role]}</Text>{form.role === role ? <CheckCircle2 size={14} color={Theme.colors.brand.primaryText} /> : null}</TouchableOpacity>)}</View>

              <Text style={styles.label}>ACCES PLATFORMĂ</Text>
              <View style={styles.choices}>{(['desktop', 'mobile', 'both'] as PlatformAccess[]).map((platform_access) => <TouchableOpacity key={platform_access} style={[styles.choice, form.platform_access === platform_access && styles.choiceActive]} onPress={() => setForm({ ...form, platform_access })}><Text style={[styles.choiceText, form.platform_access === platform_access && styles.choiceTextActive]}>{platformLabels[platform_access]}</Text>{form.platform_access === platform_access ? <CheckCircle2 size={14} color={Theme.colors.brand.primaryText} /> : null}</TouchableOpacity>)}</View>

              <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.switchText}>Cont activ</Text><Text style={styles.switchHint}>Utilizatorul se poate autentifica imediat.</Text></View><Switch value={form.is_active} onValueChange={(is_active) => setForm({ ...form, is_active })} disabled={editing?.username.toLowerCase() === 'admin'} trackColor={{ false: Theme.colors.border.strong, true: Theme.colors.brand.secondary }} thumbColor={Theme.colors.surface.base} /></View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setOpen(false)}><Text style={styles.cancelText}>Renunță</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>{saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Salvează utilizatorul</Text>}</TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Theme.spacing.md, gap: Theme.spacing.sm },
  hero: { minHeight: 194, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: Theme.radius.xl, padding: Theme.spacing.lg, ...Theme.shadow.card },
  heroTop: { position: 'absolute', top: Theme.spacing.lg, left: Theme.spacing.lg, right: Theme.spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: Theme.radius.md, backgroundColor: Theme.colors.surface.base },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.xs, borderRadius: Theme.radius.round, paddingHorizontal: Theme.spacing.sm, paddingVertical: 7, backgroundColor: Theme.colors.overlay.softScrim },
  onlineDot: { width: 7, height: 7, borderRadius: Theme.radius.round, backgroundColor: Theme.colors.state.successBright },
  heroBadgeText: { color: Theme.colors.text.onBrand, fontSize: 9, fontFamily: Theme.typography.bold, letterSpacing: 0.7 },
  heroTitle: { color: Theme.colors.text.onBrand, fontSize: 31, fontFamily: Theme.typography.bold, letterSpacing: -0.8 },
  heroSubtitle: { maxWidth: 320, marginTop: 7, color: Theme.colors.surface.cyanSoft, fontSize: 13, lineHeight: 19, fontFamily: Theme.typography.regular },
  summaryRow: { flexDirection: 'row', gap: Theme.spacing.xs },
  summaryCard: { flex: 1, minHeight: 68, justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: Theme.radius.md, paddingHorizontal: Theme.spacing.sm, backgroundColor: Theme.colors.surface.base },
  summaryValue: { color: Theme.colors.text.primary, fontSize: 21, fontFamily: Theme.typography.bold },
  summaryValueSuccess: { color: Theme.colors.state.success },
  summaryLabel: { marginTop: 2, color: Theme.colors.text.muted, fontSize: 8, fontFamily: Theme.typography.bold, letterSpacing: 0.8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Theme.spacing.xs, marginBottom: Theme.spacing.xs },
  kicker: { color: Theme.colors.brand.primaryText, fontSize: 9, fontFamily: Theme.typography.bold, letterSpacing: 1 },
  title: { marginTop: 4, color: Theme.colors.text.primary, fontSize: 22, fontFamily: Theme.typography.bold, letterSpacing: -0.35 },
  add: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Theme.radius.md, paddingHorizontal: Theme.spacing.md, backgroundColor: Theme.colors.brand.primaryAction },
  addText: { color: Theme.colors.text.onBrand, fontFamily: Theme.typography.bold, fontSize: 12 },
  row: { gap: Theme.spacing.sm, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: Theme.radius.lg, padding: Theme.spacing.md, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.card },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.sm },
  avatar: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: Theme.radius.md, backgroundColor: Theme.colors.surface.brandSoft },
  avatarText: { color: Theme.colors.brand.primaryText, fontSize: 14, fontFamily: Theme.typography.bold },
  copy: { minWidth: 0, flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.xs },
  name: { minWidth: 0, flex: 1, color: Theme.colors.text.primary, fontFamily: Theme.typography.semibold, fontSize: 15 },
  meta: { marginTop: 4, color: Theme.colors.text.muted, fontFamily: Theme.typography.regular, fontSize: 11 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Theme.radius.round, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: Theme.colors.state.successSoft },
  statusPillInactive: { backgroundColor: Theme.colors.state.errorSoft },
  statusDot: { width: 6, height: 6, borderRadius: Theme.radius.round, backgroundColor: Theme.colors.state.successBright },
  statusDotInactive: { backgroundColor: Theme.colors.state.errorBright },
  statusText: { color: Theme.colors.state.success, fontSize: 9, fontFamily: Theme.typography.bold },
  statusTextInactive: { color: Theme.colors.state.error },
  rowDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  detailChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Theme.radius.round, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: Theme.colors.surface.muted },
  detailText: { color: Theme.colors.text.secondary, fontSize: 10, fontFamily: Theme.typography.semibold },
  rowActions: { flexDirection: 'row', gap: Theme.spacing.xs },
  editButton: { minHeight: 38, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: Theme.colors.border.brandSoft, borderRadius: Theme.radius.sm, backgroundColor: Theme.colors.surface.brandSoft },
  editButtonText: { color: Theme.colors.brand.primaryText, fontSize: 11, fontFamily: Theme.typography.semibold },
  deleteButton: { width: 42, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.state.errorSoft, borderRadius: Theme.radius.sm, backgroundColor: Theme.colors.state.errorSoft },
  buttonDisabled: { borderColor: Theme.colors.border.subtle, backgroundColor: Theme.colors.surface.muted, opacity: 0.55 },
  state: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: Theme.spacing.sm, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: Theme.radius.lg, padding: Theme.spacing.lg, backgroundColor: Theme.colors.surface.base },
  stateTitle: { color: Theme.colors.text.primary, textAlign: 'center', fontFamily: Theme.typography.semibold },
  stateText: { color: Theme.colors.text.muted, textAlign: 'center', fontFamily: Theme.typography.regular },
  error: { color: Theme.colors.state.error, textAlign: 'center', fontFamily: Theme.typography.regular },
  retryButton: { borderRadius: Theme.radius.sm, paddingHorizontal: Theme.spacing.md, paddingVertical: 9, backgroundColor: Theme.colors.surface.brandSoft },
  retry: { color: Theme.colors.brand.primaryText, fontFamily: Theme.typography.bold },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Theme.colors.overlay.scrim },
  modal: { maxHeight: '92%', overflow: 'hidden', borderTopLeftRadius: Theme.radius.xxl, borderTopRightRadius: Theme.radius.xxl, backgroundColor: Theme.colors.surface.base, ...Theme.shadow.modal },
  sheetHandle: { width: 42, height: 4, alignSelf: 'center', marginTop: 9, borderRadius: Theme.radius.round, backgroundColor: Theme.colors.border.strong },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Theme.colors.border.subtle, paddingHorizontal: Theme.spacing.lg, paddingTop: Theme.spacing.sm, paddingBottom: Theme.spacing.md },
  modalTitleWrap: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.sm },
  modalIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Theme.radius.sm, backgroundColor: Theme.colors.surface.brandSoft },
  modalTitle: { color: Theme.colors.text.primary, fontSize: 17, fontFamily: Theme.typography.bold },
  modalSubtitle: { marginTop: 2, color: Theme.colors.text.muted, fontSize: 10, fontFamily: Theme.typography.regular },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Theme.radius.sm, backgroundColor: Theme.colors.surface.muted },
  modalScroll: { flexGrow: 0 },
  modalContent: { padding: Theme.spacing.lg, paddingBottom: Theme.spacing.xl },
  fieldGroup: { marginBottom: Theme.spacing.sm },
  label: { marginTop: Theme.spacing.sm, marginBottom: 7, color: Theme.colors.text.muted, fontSize: 9, fontFamily: Theme.typography.bold, letterSpacing: 0.75 },
  inputShell: { height: 50, flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.xs, borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: Theme.radius.md, paddingHorizontal: Theme.spacing.sm, backgroundColor: Theme.colors.surface.subtle },
  input: { minWidth: 0, height: '100%', flex: 1, paddingVertical: 0, color: Theme.colors.text.primary, fontSize: 13, fontFamily: Theme.typography.regular },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: Theme.radius.sm, paddingHorizontal: Theme.spacing.sm, backgroundColor: Theme.colors.surface.muted },
  choiceActive: { borderColor: Theme.colors.border.brandSoft, backgroundColor: Theme.colors.surface.brandSoft },
  choiceText: { color: Theme.colors.text.muted, fontSize: 10, fontFamily: Theme.typography.semibold },
  choiceTextActive: { color: Theme.colors.brand.primaryText },
  switchRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Theme.spacing.md, marginTop: Theme.spacing.lg, borderWidth: 1, borderColor: Theme.colors.border.subtle, borderRadius: Theme.radius.md, paddingHorizontal: Theme.spacing.md, backgroundColor: Theme.colors.surface.subtle },
  switchCopy: { minWidth: 0, flex: 1 },
  switchText: { color: Theme.colors.text.primary, fontFamily: Theme.typography.semibold },
  switchHint: { marginTop: 3, color: Theme.colors.text.muted, fontSize: 10, lineHeight: 14, fontFamily: Theme.typography.regular },
  modalActions: { flexDirection: 'row', gap: Theme.spacing.xs, borderTopWidth: 1, borderTopColor: Theme.colors.border.subtle, paddingHorizontal: Theme.spacing.lg, paddingTop: Theme.spacing.sm, paddingBottom: Theme.spacing.lg, backgroundColor: Theme.colors.surface.base },
  cancelButton: { height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Theme.colors.border.default, borderRadius: Theme.radius.md, paddingHorizontal: Theme.spacing.md, backgroundColor: Theme.colors.surface.base },
  cancelText: { color: Theme.colors.text.secondary, fontSize: 12, fontFamily: Theme.typography.semibold },
  save: { height: 50, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: Theme.radius.md, backgroundColor: Theme.colors.brand.primaryAction },
  saveText: { color: Theme.colors.text.onBrand, fontFamily: Theme.typography.bold, fontSize: 12 },
  disabled: { opacity: 0.55 },
});
