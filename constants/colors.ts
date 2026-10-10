/**
 * Cubis Shop design system.
 *
 * This is the single native source of truth for the brand palette. The app is
 * intentionally light-only until a second theme is designed and tested.
 */
export const Theme = {
  mode: 'light',
  colors: {
    brand: {
      primary: '#087FF5',
      primaryText: '#0667C8',
      primaryAction: '#0667C8',
      secondaryAction: '#08799A',
      secondary: '#09C9E5',
      cyanStrong: '#079DBD',
      navy: '#172B40',
      navySoft: '#31506D',
    },
    background: {
      canvas: '#F5F9FD',
      canvasAlt: '#EEF6FB',
    },
    surface: {
      base: '#FFFFFF',
      elevated: '#FFFFFF',
      subtle: '#F7FAFD',
      muted: '#F2F7FB',
      brandSoft: '#EEF6FF',
      cyanSoft: '#ECFBFD',
    },
    text: {
      primary: '#172B40',
      secondary: '#536A80',
      muted: '#63778B',
      disabled: '#9AAABB',
      onBrand: '#FFFFFF',
    },
    border: {
      default: '#D8E5EF',
      strong: '#CBD9E4',
      subtle: '#E5EDF4',
      focus: '#087FF5',
      brandSoft: '#B8D8FA',
    },
    state: {
      success: '#168457',
      successBright: '#22C55E',
      successSoft: '#EFFAF5',
      warning: '#9B6100',
      warningBright: '#F59E0B',
      warningSoft: '#FFF8E8',
      error: '#C43650',
      errorBright: '#EF4444',
      errorSoft: '#FFF1F3',
      info: '#2B6FAF',
      infoSoft: '#EEF6FF',
    },
    data: {
      revenue: '#087FF5',
      returns: '#C43678',
      pending: '#9B6100',
      orders: '#B24E45',
    },
    overlay: {
      scrim: 'rgba(12,31,50,0.56)',
      softScrim: 'rgba(12,31,50,0.28)',
    },
    glow: {
      cyanStrong: 'rgba(9,201,229,0.13)',
      cyanSoft: 'rgba(9,201,229,0.07)',
      blueStrong: 'rgba(8,127,245,0.09)',
      blueSoft: 'rgba(8,127,245,0.08)',
      vignette: 'rgba(245,249,253,0.18)',
    },
    shadow: {
      color: '#31506D',
    },
    transparent: 'transparent',
  },
  gradients: {
    brand: ['#08799A', '#0667C8', '#1551B6'] as const,
    action: ['#0667C8', '#08799A'] as const,
    canvas: ['#FFFFFF', '#F5FAFF', '#EEF8FC'] as const,
    modal: ['#ECFBFD', '#FFFFFF', '#EEF6FF'] as const,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 28,
    round: 999,
  },
  shadow: {
    card: {
      shadowColor: '#31506D',
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    modal: {
      shadowColor: '#173A59',
      shadowOpacity: 0.22,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 14 },
      elevation: 16,
    },
  },
  typography: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    semibold: 'Inter-SemiBold',
    bold: 'Inter-Bold',
  },
} as const;

/** Compatibility aliases for existing components. */
export const Colors = {
  bg: Theme.colors.background.canvas,
  surface: Theme.colors.surface.base,
  card: Theme.colors.surface.base,
  cardBorder: Theme.colors.border.default,

  orange: Theme.colors.brand.primaryAction,
  orangeLight: Theme.colors.brand.secondary,
  orangeDim: '#087FF51A',
  orangeMid: '#09C9E53D',

  navy: Theme.colors.brand.navy,
  navySoft: Theme.colors.brand.navySoft,
  blue: Theme.colors.brand.primary,
  cyan: Theme.colors.brand.secondary,
  blueSoft: Theme.colors.surface.brandSoft,

  white: Theme.colors.text.onBrand,
  textPrimary: Theme.colors.text.primary,
  textSecondary: Theme.colors.text.secondary,
  textMuted: Theme.colors.text.muted,

  success: Theme.colors.state.successBright,
  successDim: '#22C55E22',
  warning: Theme.colors.state.warningBright,
  warningDim: '#F59E0B22',
  error: Theme.colors.state.errorBright,
  errorDim: '#EF444422',

  statusInteresat: '#3B82F6',
  statusVaFolosi: Theme.colors.state.successBright,
  statusFolosit: Theme.colors.state.successBright,

  separator: Theme.colors.border.subtle,
  overlay: Theme.colors.overlay.scrim,
} as const;

export const StatusColors: Record<string, string> = {
  interesat: Colors.statusInteresat,
  va_folosi_codul: Colors.statusVaFolosi,
  cod_folosit: Colors.statusFolosit,
};

export const StatusLabels: Record<string, string> = {
  interesat: 'Interesat',
  va_folosi_codul: 'Cod QR Generat',
  cod_folosit: 'Cod Folosit',
};

/** 1 decimal max, trailing zero dropped: 1500 → "1500", 1500.5 → "1500.5" */
export function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r % 1 === 0 ? String(r | 0) : r.toFixed(1);
}
