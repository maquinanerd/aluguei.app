'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Checkbox,
  Group,
  Icon,
  Input,
  Select,
  Stack,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { PROPERTY_TYPE_LABELS } from '@/lib/labels';

interface PropertyPayload {
  title: string;
  propertyType: string;
  description?: string;
  status?: string;
  totalAreaSqm?: number;
  builtAreaSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpots?: number;
  furnished?: boolean;
  petsAllowed?: boolean;
}

/** Etapas do fluxo de captação (mockup) — reflete a visão do produto. */
const STEPS = [
  { label: 'Áudio', available: false },
  { label: 'Transcrição', available: false },
  { label: 'Revisão dos dados', available: true },
  { label: 'Mídia e anúncio', available: false },
  { label: 'Publicação', available: false },
];

function PropertyFormBody() {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [propertyType, setPropertyType] = useState('APARTMENT');
  const [description, setDescription] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [parkingSpots, setParkingSpots] = useState('');
  const [totalAreaSqm, setTotalAreaSqm] = useState('');
  const [builtAreaSqm, setBuiltAreaSqm] = useState('');
  const [furnished, setFurnished] = useState(false);
  const [petsAllowed, setPetsAllowed] = useState(false);
  const [busy, setBusy] = useState(false);

  function num(v: string): number | undefined {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const payload: PropertyPayload = {
        title: title.trim(),
        propertyType,
        furnished,
        petsAllowed,
      };
      if (description.trim()) payload.description = description.trim();
      const bedroomsN = num(bedrooms);
      if (bedroomsN !== undefined) payload.bedrooms = Math.round(bedroomsN);
      const bathroomsN = num(bathrooms);
      if (bathroomsN !== undefined) payload.bathrooms = Math.round(bathroomsN);
      const parkingN = num(parkingSpots);
      if (parkingN !== undefined) payload.parkingSpots = Math.round(parkingN);
      const totalAreaN = num(totalAreaSqm);
      if (totalAreaN !== undefined) payload.totalAreaSqm = totalAreaN;
      const builtAreaN = num(builtAreaSqm);
      if (builtAreaN !== undefined) payload.builtAreaSqm = builtAreaN;
      const res = await apiClient<{ property: { id: string } }>('/properties', { method: 'POST', body: payload });
      toast.success('Imóvel criado');
      router.push(`/app/properties/${res.property.id}`);
      router.refresh();
    } catch (err) {
      toast.error('Falha ao criar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="focus-page">
      {/* Header superior do Focus Mode (mockup) */}
      <header className="focus-header">
        <button
          type="button"
          className="peg-icon-btn peg-icon-btn--sm"
          aria-label="Fechar e voltar para imóveis"
          onClick={() => { router.push('/app/properties'); }}
        >
          <Icon name="x" size={18} />
        </button>
        <div className="peg-stack" style={{ gap: 0, minWidth: 0 }}>
          <h1 className="focus-header__title">Novo imóvel</h1>
          <span className="focus-header__hint">Revisão dos dados do cadastro</span>
        </div>
        <div className="peg-spacer" />
        <nav className="focus-stepper" aria-label="Progresso do cadastro">
          {STEPS.map((s, i) => (
            <span key={s.label} className="peg-group" style={{ gap: 6 }}>
              <span
                className={s.available ? 'focus-step focus-step--active' : 'focus-step'}
                aria-current={s.available ? 'step' : undefined}
                aria-disabled={!s.available || undefined}
              >
                {s.available ? <Icon name="check" size={12} /> : String(i + 1)}
              </span>
              <span className={s.available ? 'focus-step__label focus-step__label--active' : 'focus-step__label'}>
                {s.label}
              </span>
              {i < STEPS.length - 1 ? <span className="focus-stepper__sep" /> : null}
            </span>
          ))}
        </nav>
        <div className="peg-spacer" />
        <Button variant="tertiary" size="sm" onClick={() => { router.push('/app/properties'); }}>
          Cancelar
        </Button>
        <Button type="submit" form="property-form" variant="brand" size="sm" loading={busy} icon={<Icon name="check" size={14} />}>
          Criar imóvel
        </Button>
      </header>

      <div className="focus-layout">
        {/* Left rail (mockup ~340px): contexto do fluxo */}
        <aside className="focus-rail">
          <h2 className="peg-inspector__section-title">Captação por áudio</h2>
          <p className="focus-rail__text">
            Grave ou envie o áudio descrevendo o imóvel. O Aluguei.app transcreve e extrai os dados
            automaticamente para revisão.
          </p>
          <Stack gap={2} style={{ marginTop: 12 }}>
            <RailStep done={false} label="Gravar/enviar áudio" />
            <RailStep done={false} label="Speech-to-text" />
            <RailStep done={false} label="Extração estruturada" />
            <RailStep done={false} label="Dados canônicos" />
            <RailStep done label="Revisão humana" />
            <RailStep done={false} label="Imagens + análise visual" />
            <RailStep done={false} label="Texto do anúncio" />
            <RailStep done={false} label="Canais + publicação" />
          </Stack>
          <div className="focus-rail__note">
            A captação por voz e a análise de mídia por IA entram em uma próxima etapa do produto.
            Por enquanto, você pode cadastrar os dados básicos manualmente.
          </div>
        </aside>

        {/* Main column: dados extraídos / formulário real */}
        <main className="focus-main">
          <form id="property-form" onSubmit={(e) => { void submit(e); }} className="peg-stack" style={{ gap: 16 }}>
            <Card title="Dados extraídos" padless>
              <Stack gap={4} style={{ padding: 20 }}>
                <Input label="Título do anúncio" required value={title} onChange={(e) => { setTitle(e.target.value); }} placeholder="Ex.: Apartamento 2 dormitórios na Vila Mariana" />
                <div className="peg-grid cols-2">
                  <Select
                    label="Tipo de imóvel"
                    value={propertyType}
                    onChange={(e) => { setPropertyType(e.target.value); }}
                    options={Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  />
                  <Input label="Área total (m²)" optional inputMode="decimal" value={totalAreaSqm} onChange={(e) => { setTotalAreaSqm(e.target.value); }} />
                </div>
                <div className="peg-grid cols-3">
                  <Input label="Dormitórios" optional inputMode="numeric" value={bedrooms} onChange={(e) => { setBedrooms(e.target.value); }} />
                  <Input label="Banheiros" optional inputMode="numeric" value={bathrooms} onChange={(e) => { setBathrooms(e.target.value); }} />
                  <Input label="Vagas" optional inputMode="numeric" value={parkingSpots} onChange={(e) => { setParkingSpots(e.target.value); }} />
                </div>
                <Input label="Área construída (m²)" optional inputMode="decimal" value={builtAreaSqm} onChange={(e) => { setBuiltAreaSqm(e.target.value); }} />
                <Textarea label="Descrição" optional rows={4} value={description} onChange={(e) => { setDescription(e.target.value); }} placeholder="Descreva o imóvel para o anúncio…" />
              </Stack>
            </Card>

            <Card title="Condições" padless>
              <Group gap={6} style={{ padding: 20 }} wrap>
                <Checkbox checked={furnished} onChange={() => { setFurnished((v) => !v); }} label="Mobiliado" ref={undefined} />
                <Checkbox checked={petsAllowed} onChange={() => { setPetsAllowed((v) => !v); }} label="Aceita pets" ref={undefined} />
              </Group>
            </Card>
          </form>
        </main>
      </div>
    </div>
  );
}

function RailStep({ done, label: l }: { done: boolean; label: string }) {
  return (
    <div className="focus-rail__step">
      <span className={done ? 'focus-rail__step-dot focus-rail__step-dot--done' : 'focus-rail__step-dot'} />
      <span className={done ? 'focus-rail__step-label focus-rail__step-label--done' : 'focus-rail__step-label'}>{l}</span>
      {done ? <Icon name="check" size={12} className="peg-text-tertiary" /> : null}
    </div>
  );
}

export function PropertyForm() {
  return (
    <ToastProvider>
      <PropertyFormBody />
    </ToastProvider>
  );
}
