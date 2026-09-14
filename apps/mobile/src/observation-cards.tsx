import { StyleSheet, Text, View } from 'react-native';
import { formatPercent } from './format';
import { OBSERVATION_CATEGORY_LABELS, SEVERITY_LABELS } from './labels';
import { colors, radius, spacing, typography } from './tokens';
import type { AiSuggestion, Observation } from './types';
import { Badge, type BadgeTone } from './ui';

const SEVERITY_TONES: Record<Observation['severity'], BadgeTone> = {
  NONE: 'neutral',
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

const SUGGESTION_STATUS_LABELS: Record<AiSuggestion['status'], string> = {
  PENDING: 'Pendente',
  ACCEPTED: 'Aceita',
  REJECTED: 'Rejeitada',
  EDITED: 'Editada',
};

const SUGGESTION_STATUS_TONES: Record<AiSuggestion['status'], BadgeTone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'neutral',
  EDITED: 'info',
};

interface ObservationCardProps {
  observation: Observation;
  roomName?: string | null;
}

export function ObservationCard({ observation, roomName }: ObservationCardProps) {
  const metaParts = [
    roomName !== null && roomName !== undefined ? roomName : null,
    observation.source === 'AI' ? 'Sugestão de IA' : 'Humana',
  ].filter((part): part is string => part !== null);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Badge label={OBSERVATION_CATEGORY_LABELS[observation.category]} tone="neutral" />
        <Badge
          label={SEVERITY_LABELS[observation.severity]}
          tone={SEVERITY_TONES[observation.severity]}
        />
      </View>
      <Text style={styles.description}>{observation.description}</Text>
      <Text style={styles.meta}>{metaParts.join(' · ')}</Text>
    </View>
  );
}

interface SuggestionCardProps {
  suggestion: AiSuggestion;
}

export function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const payloadText = JSON.stringify(suggestion.payload);
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Badge label={suggestion.kind === 'VISUAL' ? 'Visual' : 'Transcrição'} tone="brand" />
        {suggestion.confidence !== null ? (
          <Badge label={`Confiança ${formatPercent(suggestion.confidence)}`} tone="neutral" />
        ) : null}
        <Badge
          label={SUGGESTION_STATUS_LABELS[suggestion.status]}
          tone={SUGGESTION_STATUS_TONES[suggestion.status]}
        />
      </View>
      <Text style={styles.description}>{payloadText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  description: { ...typography.body, color: colors.textPrimary },
  meta: { ...typography.label, color: colors.textTertiary, marginTop: spacing.xs },
});
