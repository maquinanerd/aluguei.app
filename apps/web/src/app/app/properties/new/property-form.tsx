'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Breadcrumb,
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
    <Stack gap={4} style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}>
      <Breadcrumb items={[{ label: 'Painel', href: '/app' }, { label: 'Imóveis', href: '/app/properties' }, { label: 'Novo imóvel' }]} />
      <div>
        <h1 className="app-page__title">Novo imóvel</h1>
        <p className="app-page__desc">Dados básicos do imóvel para começar o cadastro.</p>
      </div>

      <form onSubmit={(e) => { void submit(e); }} className="peg-stack" style={{ gap: 20 }}>
        <Card title="Identificação" padless>
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

        <Group gap={2} end>
          <Button variant="tertiary" onClick={() => { router.push('/app/properties'); }}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" loading={busy} icon={<Icon name="check" size={14} />}>
            Criar imóvel
          </Button>
        </Group>
      </form>
    </Stack>
  );
}

export function PropertyForm() {
  return (
    <ToastProvider>
      <PropertyFormBody />
    </ToastProvider>
  );
}
