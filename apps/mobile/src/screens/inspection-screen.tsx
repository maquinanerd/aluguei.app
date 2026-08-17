import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  addObservation,
  addRoom,
  errorMessage,
  getInspection,
  processInspection,
  setInspectionStatus,
} from '../api';
import {
  INSPECTION_STATUS_LABELS,
  INSPECTION_TYPE_LABELS,
  OBSERVATION_CATEGORY_LABELS,
  SEVERITY_LABELS,
} from '../labels';
import type { Navigation } from '../navigation';
import { ObservationCard } from '../observation-cards';
import { colors, spacing, typography } from '../tokens';
import type {
  InspectionAggregate,
  InspectionStatus,
  ObservationCategory,
  Severity,
} from '../types';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyView,
  ErrorView,
  Field,
  InfoText,
  InlineError,
  LoadingView,
  Screen,
  SectionTitle,
  TextField,
} from '../ui';

interface Props {
  inspectionId: string;
  nav: Navigation;
}

const CATEGORIES: ObservationCategory[] = [
  'DAMAGE',
  'CONDITION',
  'CLEANLINESS',
  'FURNITURE',
  'INSTALLATION',
  'OTHER',
];

const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH'];

const STATUS_TONES: Record<InspectionStatus, 'neutral' | 'info' | 'warning' | 'success'> = {
  DRAFT: 'neutral',
  CAPTURING: 'info',
  PROCESSING: 'warning',
  REVIEW: 'warning',
  COMPLETED: 'success',
  SIGNED: 'success',
};

export function InspectionScreen({ inspectionId, nav }: Props) {
  const [data, setData] = useState<InspectionAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [processMessage, setProcessMessage] = useState<string | null>(null);

  const [roomInputVisible, setRoomInputVisible] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [submittingRoom, setSubmittingRoom] = useState(false);

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ObservationCategory>('DAMAGE');
  const [severity, setSeverity] = useState<Severity>('LOW');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [submittingObservation, setSubmittingObservation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await getInspection(inspectionId);
      setData(next);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  const refresh = useCallback(async () => {
    try {
      const next = await getInspection(inspectionId);
      setData(next);
      setActionError(null);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const submitRoom = async (): Promise<void> => {
    const name = roomName.trim();
    if (name === '') {
      setActionError('Informe o nome do ambiente.');
      return;
    }
    setSubmittingRoom(true);
    setActionError(null);
    try {
      await addRoom(inspectionId, name);
      setRoomName('');
      setRoomInputVisible(false);
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSubmittingRoom(false);
    }
  };

  const submitObservation = async (): Promise<void> => {
    const trimmed = description.trim();
    if (trimmed === '') {
      setActionError('Descreva a observação.');
      return;
    }
    setSubmittingObservation(true);
    setActionError(null);
    try {
      await addObservation(inspectionId, {
        ...(selectedRoomId === '' ? {} : { roomId: selectedRoomId }),
        category,
        severity,
        description: trimmed,
      });
      setDescription('');
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSubmittingObservation(false);
    }
  };

  const startCapture = async (): Promise<void> => {
    setActionError(null);
    setCapturing(true);
    try {
      await setInspectionStatus(inspectionId, 'CAPTURING');
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setCapturing(false);
    }
  };

  const runProcess = async (): Promise<void> => {
    setActionError(null);
    setProcessMessage(null);
    setProcessing(true);
    try {
      await processInspection(inspectionId);
      setProcessMessage('Processamento enfileirado. Atualize para acompanhar a revisão.');
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setProcessing(false);
    }
  };

  const complete = async (): Promise<void> => {
    setActionError(null);
    setCompleting(true);
    try {
      await setInspectionStatus(inspectionId, 'COMPLETED');
      await refresh();
    } catch (err) {
      // Guard da máquina de estado (ex.: sugestões pendentes) → 409 com a mensagem da API.
      setActionError(errorMessage(err));
    } finally {
      setCompleting(false);
    }
  };

  if (loading && data === null) {
    return (
      <Screen>
        <LoadingView message="Carregando vistoria…" />
      </Screen>
    );
  }

  if (loadError !== null && data === null) {
    return (
      <Screen>
        <ErrorView
          message={loadError}
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
        <ErrorView message="Vistoria indisponível" />
      </Screen>
    );
  }

  const { inspection, rooms, observations } = data;
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));
  const canOpenReview =
    inspection.status === 'PROCESSING' ||
    inspection.status === 'REVIEW' ||
    inspection.status === 'COMPLETED' ||
    inspection.status === 'SIGNED';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
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
        <Card>
          <View style={styles.statusRow}>
            <Text style={styles.typeLabel}>
              Vistoria de {INSPECTION_TYPE_LABELS[inspection.type] ?? inspection.type}
            </Text>
            <Badge
              label={INSPECTION_STATUS_LABELS[inspection.status]}
              tone={STATUS_TONES[inspection.status]}
            />
          </View>
          <InfoText>
            {inspection.status === 'COMPLETED'
              ? 'Vistoria concluída.'
              : `Status atual: ${INSPECTION_STATUS_LABELS[inspection.status]}`}
          </InfoText>
          {inspection.scheduledAt !== null ? (
            <InfoText>
              Agendada: {new Date(inspection.scheduledAt).toLocaleDateString('pt-BR')}
            </InfoText>
          ) : null}

          <View style={styles.actionRow}>
            {inspection.status === 'DRAFT' ? (
              <Button
                label="Iniciar captura"
                onPress={() => {
                  void startCapture();
                }}
                loading={capturing}
              />
            ) : null}
            {inspection.status === 'CAPTURING' ? (
              <Button
                label="Processar"
                onPress={() => {
                  void runProcess();
                }}
                loading={processing}
              />
            ) : null}
            {inspection.status === 'REVIEW' ? (
              <Button
                label="Concluir vistoria"
                onPress={() => {
                  void complete();
                }}
                loading={completing}
              />
            ) : null}
          </View>

          {inspection.status === 'PROCESSING' ? (
            <InfoText>Processamento em andamento — atualize para ver as sugestões de IA.</InfoText>
          ) : null}
          {processMessage !== null ? <InfoText>{processMessage}</InfoText> : null}

          {canOpenReview ? (
            <View style={styles.actionRow}>
              <Button
                label="Ver revisão"
                variant="secondary"
                onPress={() => {
                  nav.navigate({ name: 'inspection-review', inspectionId });
                }}
              />
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Button
              label="Atualizar"
              variant="secondary"
              onPress={() => {
                void handleRefresh();
              }}
            />
          </View>
        </Card>

        {actionError !== null ? <InlineError message={actionError} /> : null}

        <SectionTitle>Ambientes ({String(rooms.length)})</SectionTitle>
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <Card key={room.id}>
              <Text style={styles.roomName}>{room.name}</Text>
            </Card>
          ))
        ) : (
          <EmptyView message="Nenhum ambiente adicionado ainda." />
        )}

        {roomInputVisible ? (
          <Card>
            <Field label="Nome do ambiente">
              <TextField
                value={roomName}
                onChangeText={setRoomName}
                accessibilityLabel="Nome do ambiente"
                placeholder="Ex.: Sala de estar"
                autoCapitalize="sentences"
              />
            </Field>
            <View style={styles.actionRow}>
              <Button
                label="Salvar ambiente"
                onPress={() => {
                  void submitRoom();
                }}
                loading={submittingRoom}
              />
              <Button
                label="Cancelar"
                variant="secondary"
                onPress={() => {
                  setRoomInputVisible(false);
                }}
              />
            </View>
          </Card>
        ) : (
          <Button
            label="Adicionar ambiente"
            variant="secondary"
            onPress={() => {
              setRoomInputVisible(true);
            }}
          />
        )}

        <View style={styles.sectionGap} />

        <SectionTitle>Nova observação</SectionTitle>
        <Card>
          <Field label="Ambiente">
            <ChipRow>
              <Chip
                label="Sem ambiente"
                selected={selectedRoomId === ''}
                onPress={() => {
                  setSelectedRoomId('');
                }}
              />
              {rooms.map((room) => (
                <Chip
                  key={room.id}
                  label={room.name}
                  selected={selectedRoomId === room.id}
                  onPress={() => {
                    setSelectedRoomId(room.id);
                  }}
                />
              ))}
            </ChipRow>
          </Field>
          <Field label="Categoria">
            <ChipRow>
              {CATEGORIES.map((item) => (
                <Chip
                  key={item}
                  label={OBSERVATION_CATEGORY_LABELS[item]}
                  selected={category === item}
                  onPress={() => {
                    setCategory(item);
                  }}
                />
              ))}
            </ChipRow>
          </Field>
          <Field label="Severidade">
            <ChipRow>
              {SEVERITIES.map((item) => (
                <Chip
                  key={item}
                  label={SEVERITY_LABELS[item]}
                  selected={severity === item}
                  onPress={() => {
                    setSeverity(item);
                  }}
                />
              ))}
            </ChipRow>
          </Field>
          <Field label="Descrição">
            <TextField
              value={description}
              onChangeText={setDescription}
              accessibilityLabel="Descrição da observação"
              placeholder="Descreva o que foi observado…"
              multiline
            />
          </Field>
          <Button
            label="Adicionar observação"
            onPress={() => {
              void submitObservation();
            }}
            loading={submittingObservation}
          />
        </Card>

        <View style={styles.sectionGap} />

        <SectionTitle>Observações ({String(observations.length)})</SectionTitle>
        {observations.length > 0 ? (
          observations.map((observation) => (
            <ObservationCard
              key={observation.id}
              observation={observation}
              roomName={
                observation.roomId !== null ? (roomNameById.get(observation.roomId) ?? null) : null
              }
            />
          ))
        ) : (
          <EmptyView message="Nenhuma observação registrada." />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeLabel: { ...typography.h4, color: colors.textPrimary, flexShrink: 1 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  roomName: { ...typography.bodyLg, color: colors.textPrimary },
  sectionGap: { height: spacing.xxl },
});
