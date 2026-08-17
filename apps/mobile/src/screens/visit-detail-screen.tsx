import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { createInspection, errorMessage, getProperty } from '../api';
import { formatDateTime } from '../format';
import { PROPERTY_TYPE_LABELS, VISIT_STATUS_LABELS } from '../labels';
import type { Navigation } from '../navigation';
import { colors, spacing, typography } from '../tokens';
import type { Property, Visit } from '../types';
import {
  Badge,
  Button,
  Card,
  ErrorView,
  InfoText,
  InlineError,
  LoadingView,
  Screen,
  SectionTitle,
} from '../ui';

interface Props {
  visit: Visit;
  nav: Navigation;
}

function addressSummary(property: Property): string | null {
  const address = property.addresses[0];
  if (address === undefined) {
    return null;
  }
  const parts = [address.street, address.number, address.neighborhood, address.city].filter(
    (part): part is string => part !== null && part.length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

export function VisitDetailScreen({ visit, nav }: Props) {
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (visit.propertyId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getProperty(visit.propertyId);
      setProperty(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [visit.propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startInspection = async (): Promise<void> => {
    if (property === null) {
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const inspection = await createInspection(property.id, 'CHECKIN');
      nav.navigate({ name: 'inspection', inspectionId: inspection.id });
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const address = property !== null ? addressSummary(property) : null;

  return (
    <Screen scroll>
      <Card>
        <SectionTitle>Visita</SectionTitle>
        <InfoText>{formatDateTime(visit.scheduledAt)}</InfoText>
        <InfoText>Status: {VISIT_STATUS_LABELS[visit.status]}</InfoText>
        {visit.note !== null && visit.note.length > 0 ? (
          <InfoText>Obs.: {visit.note}</InfoText>
        ) : null}
      </Card>

      {loading ? <LoadingView message="Carregando imóvel…" /> : null}

      {!loading && error !== null ? <ErrorView message={error} /> : null}

      {!loading && error === null && property !== null ? (
        <Card>
          <SectionTitle>Imóvel</SectionTitle>
          <Text style={styles.propertyTitle}>{property.title}</Text>
          {address !== null ? <InfoText>{address}</InfoText> : null}
          <Text style={styles.propertyType}>
            {PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType}
          </Text>
          <Badge
            label={property.status === 'ACTIVE' ? 'Ativo' : 'Arquivado'}
            tone={property.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
        </Card>
      ) : null}

      {!loading && error === null && property === null ? (
        <Card>
          <InfoText>
            Esta visita não tem um imóvel vinculado — não é possível iniciar vistoria.
          </InfoText>
        </Card>
      ) : null}

      {createError !== null ? <InlineError message={createError} /> : null}

      {property !== null ? (
        <Button
          label="Iniciar vistoria de entrada"
          onPress={() => {
            void startInspection();
          }}
          loading={creating}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  propertyTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: spacing.xs },
  propertyType: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
});
