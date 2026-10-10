import React from 'react';
import { Image, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Theme } from '@/constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

const appIcon = require('../assets/images/cubis-shop-icon.png');

interface Props {
  title: string;
  right?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}

export default function Header({ title, right, showBack, onBack }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        {showBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backSlot}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel="Inapoi">
            <View style={styles.backBtn}>
              <ArrowLeft size={20} color={Colors.orange} strokeWidth={2.4} />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.brandSlot} accessibilityLabel="Cubis Shop">
            <View style={styles.brandIcon}>
              <Image source={appIcon} style={styles.brandImage} resizeMode="cover" />
            </View>
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
        <View style={styles.right}>{right}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: Theme.colors.surface.base },
  header: {
    backgroundColor: Theme.colors.surface.base,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#D8E5EF',
  },
  backSlot: {
    minWidth: 80,
    alignItems: 'flex-start',
  },
  brandSlot: { minWidth: 80, alignItems: 'flex-start' },
  brandIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: Theme.colors.surface.base, borderWidth: 1, borderColor: Theme.colors.border.default },
  brandImage: { width: 40, height: 40 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.orangeDim,
    borderWidth: 1,
    borderColor: Colors.orangeMid,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
    textAlign: 'center',
  },
  right: { minWidth: 80, alignItems: 'flex-end' },
});
