import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { errorMessage, getReview } from '../api';
import { ObservationCard, SuggestionCard } from '../observation-cards';
import { colors, spacing } from '../tokens';
import type { ReviewData } from '../types';
import { EmptyView, ErrorView, LoadingView, Screen, SectionTitle } from '../ui';

interface Props {
  inspectionId: string;
}

export function InspectionReviewScreen({ inspectionId }: Props) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const review = await getReview(inspectionId);
      setData(review);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading && data === null) {
    return (
      <Screen>
        <LoadingView message="Carregando revisão…" />
      </Screen>
    );
  }

  if (error !== null && data === null) {
    return (
      <Screen>
        <ErrorView
          message={error}
          onRetry={() => {
            void load();
          }}
        />
      </Screen>
    );
  }

  if (data === null) {
    return (
      <Screen>
        <ErrorView message="Revisão indisponível" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void handleRefresh();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <SectionTitle>Observações ({String(data.observations.length)})</SectionTitle>
        {data.observations.length > 0 ? (
          data.observations.map((observation) => (
            <ObservationCard key={observation.id} observation={observation} />
          ))
        ) : (
          <EmptyView message="Nenhuma observação registrada." />
        )}

        <SectionTitle>Sugestões de IA ({String(data.aiSuggestions.length)})</SectionTitle>
        {data.aiSuggestions.length > 0 ? (
          data.aiSuggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))
        ) : (
          <EmptyView message="Nenhuma sugestão de IA gerada. Se ainda não processou, volte e acione “Processar”." />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
