import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { errorMessage, listVisits } from '../api';
import { formatDateTime } from '../format';
import { VISIT_STATUS_LABELS } from '../labels';
import type { Navigation } from '../navigation';
import { colors, radius, spacing, typography } from '../tokens';
import type { Visit } from '../types';
import { Badge, EmptyView, ErrorView, LoadingView, Screen, SectionTitle } from '../ui';

interface Props {
  nav: Navigation;
}

const VISIT_STATUS_TONES: Record<Visit['status'], 'neutral' | 'info' | 'success'> = {
  SCHEDULED: 'info',
  CONFIRMED: 'success',
  DONE: 'neutral',
  CANCELLED: 'neutral',
  NO_SHOW: 'neutral',
};

export function AgendaScreen({ nav }: Props) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }
    try {
      const data = await listVisits();
      setVisits(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const renderVisit = ({ item }: { item: Visit }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Visita ${formatDateTime(item.scheduledAt)}`}
      onPress={() => {
        nav.navigate({ name: 'visit-detail', visit: item });
      }}
      style={({ pressed }) => [styles.visitCard, pressed ? styles.visitCardPressed : null]}
    >
      <View style={styles.visitHeader}>
        <Text style={styles.visitDate}>{formatDateTime(item.scheduledAt)}</Text>
        <Badge label={VISIT_STATUS_LABELS[item.status]} tone={VISIT_STATUS_TONES[item.status]} />
      </View>
      <Text style={styles.visitMeta}>
        {item.propertyId !== null ? 'Imóvel vinculado' : 'Sem imóvel vinculado'}
      </Text>
    </Pressable>
  );

  if (loading) {
    return (
      <Screen>
        <LoadingView message="Carregando agenda…" />
      </Screen>
    );
  }

  if (error !== null && visits.length === 0) {
    return (
      <Screen>
        <ErrorView
          message={error}
          onRetry={() => {
            void load('initial');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={visits}
        keyExtractor={(item) => item.id}
        renderItem={renderVisit}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load('refresh');
            }}
            tintColor={colors.brand}
          />
        }
        ListHeaderComponent={
          <SectionTitle>Visitas agendadas ({String(visits.length)})</SectionTitle>
        }
        ListEmptyComponent={<EmptyView message="Nenhuma visita agendada para exibir." />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  visitCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  visitCardPressed: { opacity: 0.85 },
  visitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  visitDate: { ...typography.bodyLg, color: colors.textPrimary, fontWeight: '600' },
  visitMeta: { ...typography.body, color: colors.textSecondary },
});
