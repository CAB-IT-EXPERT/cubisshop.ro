import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react-native';
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
      <View style={styles.heading}><View><Text style={styles.kicker}>ACCES APLICAȚII</Text><Text style={styles.title}>Utilizatori</Text></View><TouchableOpacity style={styles.add} onPress={startCreate}><Plus size={17} color={Colors.white} /><Text style={styles.addText}>Adaugă</Text></TouchableOpacity></View>
      {loading ? <View style={styles.state}><ActivityIndicator color={Colors.orange} /></View> : error ? <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={() => void load()}><Text style={styles.retry}>Reîncearcă</Text></TouchableOpacity></View> : rows.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(row.display_name || row.username).slice(0, 2).toUpperCase()}</Text></View>
          <View style={styles.copy}><Text style={styles.name}>{row.display_name}</Text><Text style={styles.meta}>@{row.username} · {roleLabels[row.role]} · {platformLabels[row.platform_access]}</Text><Text style={[styles.status, !row.is_active && styles.inactive]}>{row.is_active ? 'ACTIV' : 'INACTIV'}</Text></View>
          <TouchableOpacity style={styles.iconButton} onPress={() => startEdit(row)}><Pencil size={16} color={Colors.orange} /></TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} disabled={row.username.toLowerCase() === 'admin' || row.id === user.id} onPress={() => remove(row)}><Trash2 size={16} color={row.username.toLowerCase() === 'admin' || row.id === user.id ? Colors.textMuted : Colors.error} /></TouchableOpacity>
        </View>
      ))}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}><View style={styles.modal}>
          <View style={styles.modalHead}><Text style={styles.modalTitle}>{editing ? 'Editează utilizatorul' : 'Utilizator nou'}</Text><TouchableOpacity onPress={() => setOpen(false)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity></View>
          <Text style={styles.label}>UTILIZATOR</Text><TextInput style={styles.input} value={form.username} editable={!editing || editing.username.toLowerCase() !== 'admin'} autoCapitalize="none" onChangeText={(username) => setForm({ ...form, username })} />
          <Text style={styles.label}>NUME AFIȘAT</Text><TextInput style={styles.input} value={form.display_name} onChangeText={(display_name) => setForm({ ...form, display_name })} />
          <Text style={styles.label}>{editing ? 'PAROLĂ NOUĂ (OPȚIONAL)' : 'PAROLĂ'}</Text><TextInput style={styles.input} value={form.password} secureTextEntry onChangeText={(password) => setForm({ ...form, password })} />
          <Text style={styles.label}>ROL</Text><View style={styles.choices}>{(['admin', 'manager', 'user'] as UserRole[]).map((role) => <TouchableOpacity key={role} style={[styles.choice, form.role === role && styles.choiceActive]} onPress={() => setForm({ ...form, role })}><Text style={[styles.choiceText, form.role === role && styles.choiceTextActive]}>{roleLabels[role]}</Text></TouchableOpacity>)}</View>
          <Text style={styles.label}>PLATFORMĂ</Text><View style={styles.choices}>{(['desktop', 'mobile', 'both'] as PlatformAccess[]).map((platform_access) => <TouchableOpacity key={platform_access} style={[styles.choice, form.platform_access === platform_access && styles.choiceActive]} onPress={() => setForm({ ...form, platform_access })}><Text style={[styles.choiceText, form.platform_access === platform_access && styles.choiceTextActive]}>{platformLabels[platform_access]}</Text></TouchableOpacity>)}</View>
          <View style={styles.switchRow}><Text style={styles.switchText}>Cont activ</Text><Switch value={form.is_active} onValueChange={(is_active) => setForm({ ...form, is_active })} disabled={editing?.username.toLowerCase() === 'admin'} /></View>
          <TouchableOpacity style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>{saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Salvează</Text>}</TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, kicker: { color: Colors.orange, fontSize: 10, fontFamily: 'Inter-Bold', letterSpacing: 1 }, title: { color: Colors.textPrimary, fontSize: 23, fontFamily: 'Inter-Bold', marginTop: 3 }, add: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: Colors.orange, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 }, addText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 15, backgroundColor: Theme.colors.surface.muted, borderWidth: 1, borderColor: Theme.colors.border.default }, avatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orangeDim }, avatarText: { color: Colors.orange, fontFamily: 'Inter-Bold' }, copy: { flex: 1 }, name: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 14 }, meta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 3 }, status: { color: Colors.success, fontFamily: 'Inter-Bold', fontSize: 9, marginTop: 4 }, inactive: { color: Colors.error }, iconButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.surface.muted },
  state: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 }, stateText: { color: Colors.textMuted, textAlign: 'center', fontFamily: 'Inter-Regular' }, error: { color: Colors.error, textAlign: 'center' }, retry: { color: Colors.orange, fontFamily: 'Inter-Bold' },
  backdrop: { flex: 1, backgroundColor: Theme.colors.overlay.scrim, justifyContent: 'center', padding: 18 }, modal: { backgroundColor: Theme.colors.surface.base, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: Theme.colors.border.default }, modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, modalTitle: { color: Colors.textPrimary, fontSize: 18, fontFamily: 'Inter-Bold' }, label: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 0.8, marginTop: 10, marginBottom: 5 }, input: { height: 44, borderRadius: 12, paddingHorizontal: 12, color: Colors.textPrimary, backgroundColor: Theme.colors.surface.subtle, borderWidth: 1, borderColor: Theme.colors.border.default }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: Theme.colors.surface.muted }, choiceActive: { backgroundColor: Colors.orangeDim, borderWidth: 1, borderColor: Colors.orangeMid }, choiceText: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-SemiBold' }, choiceTextActive: { color: Colors.orange }, switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }, switchText: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold' }, save: { height: 48, borderRadius: 14, backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, saveText: { color: Colors.white, fontFamily: 'Inter-Bold' }, disabled: { opacity: 0.55 },
});
