import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from './tokens';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  accessibilityLabel,
}: ButtonProps) {
  const pressed = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: pressed, busy: loading }}
      disabled={pressed}
      onPress={onPress}
      style={({ pressed: isPressed }) => [
        styles.button,
        variant === 'primary'
          ? styles.buttonPrimary
          : variant === 'danger'
            ? styles.buttonDanger
            : styles.buttonSecondary,
        pressed ? styles.buttonDisabled : null,
        isPressed && !pressed ? styles.buttonPressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' ? colors.textPrimary : colors.brandOn}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'secondary' ? styles.textBrand : styles.textOnBrand,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
}

export function Screen({ children, scroll = false }: ScreenProps) {
  if (scroll) {
    return (
      // SafeAreaView do core está deprecated (recomendado react-native-safe-area-context),
      // que não está instalado — e dependências novas são proibidas nesta fase.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      <SafeAreaView style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.screenScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return <SafeAreaView style={styles.screen}>{children}</SafeAreaView>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand';

const BADGE_PALETTE: Record<BadgeTone, { background: string; text: string }> = {
  neutral: { background: colors.surfaceMuted, text: colors.textSecondary },
  info: { background: '#EAF1FD', text: colors.info },
  warning: { background: '#FDF3E7', text: colors.warning },
  success: { background: '#E8F5EE', text: colors.success },
  danger: { background: '#FDECEC', text: colors.danger },
  brand: { background: colors.brandSubtle, text: colors.brandStrong },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const palette = BADGE_PALETTE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.badgeText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

interface TextFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'email-address' | 'default';
}

export function TextField({
  value,
  onChangeText,
  accessibilityLabel,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
}: TextFieldProps) {
  return (
    <TextInput
      style={[styles.input, multiline ? styles.inputMultiline : null]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder ?? ''}
      placeholderTextColor={colors.textDisabled}
      accessibilityLabel={accessibilityLabel}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
    />
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

interface ErrorViewProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <View style={styles.stateView} accessibilityRole="alert">
      <Text style={styles.stateTitle}>Não foi possível carregar</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {onRetry !== undefined ? (
        <Button label="Tentar novamente" variant="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function LoadingView({ message = 'Carregando…' }: { message?: string }) {
  return (
    <View style={styles.stateView} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.stateMessage}>{message}</Text>
    </View>
  );
}

export function EmptyView({ message }: { message: string }) {
  return (
    <View style={styles.stateView}>
      <Text style={styles.stateMessage}>{message}</Text>
    </View>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <View style={styles.inlineError} accessibilityRole="alert">
      <Text style={styles.inlineErrorText}>{message}</Text>
    </View>
  );
}

export function InfoText({ children }: { children: ReactNode }) {
  return <Text style={styles.infoText}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  screenScrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: spacing.sm },
  field: { marginBottom: spacing.md },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  button: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { ...typography.bodyLg, fontWeight: '600' },
  textOnBrand: { color: colors.brandOn },
  textBrand: { color: colors.brandStrong },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.brandSubtle, borderColor: colors.brand },
  chipText: { ...typography.body, color: colors.textSecondary },
  chipTextSelected: { color: colors.brandStrong, fontWeight: '600' },
  stateView: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  stateTitle: { ...typography.h4, color: colors.textPrimary, textAlign: 'center' },
  stateMessage: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 1,
  },
  badgeText: { ...typography.label, fontWeight: '600' },
  inlineError: {
    backgroundColor: '#FDECEC',
    borderColor: '#F5C2C2',
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  inlineErrorText: { ...typography.body, color: colors.danger },
  infoText: { ...typography.body, color: colors.textSecondary },
});
