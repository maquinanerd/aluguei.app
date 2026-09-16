'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  ErrorState,
  Icon,
  Input,
  Modal,
  Stack,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import type { Column } from '@aluguei/ui';
import { PageToolbar } from '@/components/page-toolbar';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@/lib/use-query';
import { formatLimit, parseLimitInput } from '@/lib/platform';
import type { PlatformPlan } from '@/lib/platform';

interface PlanForm {
  code: string;
  name: string;
  description: string;
  maxUsers: string;
  maxProperties: string;
  maxPublishedListings: string;
  isActive: boolean;
}

const EMPTY_FORM: PlanForm = {
  code: '',
  name: '',
  description: '',
  maxUsers: '',
  maxProperties: '',
  maxPublishedListings: '',
  isActive: true,
};

function limitText(max: number | null): string {
  return max === null ? '' : String(max);
}

function PlansBody() {
  const toast = useToast();
  const plans = useQuery<{ plans: PlatformPlan[] }>('/platform/plans');
  const [editing, setEditing] = useState<PlatformPlan | 'new' | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof PlanForm, string>>>({});
  const [busy, setBusy] = useState(false);

  function openNew() {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditing('new');
  }

  function openEdit(plan: PlatformPlan) {
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? '',
      maxUsers: limitText(plan.maxUsers),
      maxProperties: limitText(plan.maxProperties),
      maxPublishedListings: limitText(plan.maxPublishedListings),
      isActive: plan.isActive,
    });
    setErrors({});
    setEditing(plan);
  }

  async function submit() {
    const users = parseLimitInput(form.maxUsers, 1);
    const properties = parseLimitInput(form.maxProperties, 0);
    const listings = parseLimitInput(form.maxPublishedListings, 0);
    const nextErrors: Partial<Record<keyof PlanForm, string>> = {};
    if (!users.ok) nextErrors.maxUsers = users.message;
    if (!properties.ok) nextErrors.maxProperties = properties.message;
    if (!listings.ok) nextErrors.maxPublishedListings = listings.message;
    if (editing === 'new' && !/^[A-Z0-9_]{2,40}$/.test(form.code.trim())) {
      nextErrors.code = 'Maiúsculas, dígitos e _ (2 a 40)';
    }
    if (form.name.trim() === '') nextErrors.name = 'Informe o nome';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !users.ok || !properties.ok || !listings.ok) {
      return;
    }

    const body = {
      name: form.name.trim(),
      description: form.description.trim() === '' ? null : form.description.trim(),
      maxUsers: users.value,
      maxProperties: properties.value,
      maxPublishedListings: listings.value,
    };
    setBusy(true);
    try {
      if (editing === 'new') {
        await apiClient('/platform/plans', {
          method: 'POST',
          body: { ...body, code: form.code.trim() },
        });
        toast.success('Plano criado');
      } else if (editing) {
        await apiClient(`/platform/plans/${editing.id}`, {
          method: 'PATCH',
          body: { ...body, isActive: form.isActive },
        });
        toast.success('Plano atualizado');
      }
      setEditing(null);
      plans.reload();
    } catch (err) {
      toast.error('Não foi possível salvar', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PlatformPlan>[] = [
    {
      key: 'name',
      header: 'Plano',
      render: (plan) => (
        <Stack gap={0}>
          <span style={{ fontWeight: 500 }}>{plan.name}</span>
          <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
            {plan.code}
          </span>
        </Stack>
      ),
    },
    { key: 'maxUsers', header: 'Usuários', render: (plan) => formatLimit(plan.maxUsers) },
    { key: 'maxProperties', header: 'Imóveis', render: (plan) => formatLimit(plan.maxProperties) },
    {
      key: 'maxPublishedListings',
      header: 'Anúncios publicados',
      render: (plan) => formatLimit(plan.maxPublishedListings),
    },
    {
      key: 'organizationCount',
      header: 'Imobiliárias',
      render: (plan) => plan.organizationCount.toLocaleString('pt-BR'),
    },
    {
      key: 'isActive',
      header: 'Situação',
      render: (plan) =>
        plan.isActive ? <Badge tone="success">Ativo</Badge> : <Badge>Desativado</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (plan) => (
        <Button
          variant="tertiary"
          size="xs"
          onClick={() => {
            openEdit(plan);
          }}
        >
          Editar
        </Button>
      ),
    },
  ];

  function field(key: 'maxUsers' | 'maxProperties' | 'maxPublishedListings', text: string) {
    return (
      <Input
        label={text}
        inputMode="numeric"
        value={form[key]}
        placeholder="Ilimitado"
        {...(errors[key] ? { error: errors[key] } : {})}
        helper="Vazio = ilimitado"
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
        }}
      />
    );
  }

  return (
    <div className="app-page">
      <PageToolbar
        title="Planos"
        description="Limites de uso por imobiliária. Sem cobrança: o plano só limita o uso."
        actions={
          <Button variant="brand" size="sm" icon={<Icon name="plus" size={14} />} onClick={openNew}>
            Novo plano
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={plans.data?.plans ?? []}
        loading={plans.loading}
        emptyTitle="Nenhum plano"
      />
      {plans.error ? <ErrorState body={plans.error} onRetry={plans.reload} /> : null}

      <Modal
        open={editing !== null}
        onClose={() => {
          setEditing(null);
        }}
        title={editing === 'new' ? 'Novo plano' : 'Editar plano'}
        footer={
          <>
            <Button
              variant="tertiary"
              onClick={() => {
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="plan-edit-form" loading={busy}>
              Salvar
            </Button>
          </>
        }
      >
        <form
          id="plan-edit-form"
          className="peg-stack"
          style={{ gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            label="Código"
            value={form.code}
            disabled={editing !== 'new'}
            {...(errors.code ? { error: errors.code } : {})}
            {...(editing === 'new' ? { helper: 'Não muda depois de criado' } : {})}
            onChange={(e) => {
              setForm({ ...form, code: e.target.value.toUpperCase() });
            }}
          />
          <Input
            label="Nome"
            required
            value={form.name}
            {...(errors.name ? { error: errors.name } : {})}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
            }}
          />
          <Textarea
            label="Descrição"
            optional
            maxLength={500}
            value={form.description}
            onChange={(e) => {
              setForm({ ...form, description: e.target.value });
            }}
          />
          {field('maxUsers', 'Usuários')}
          {field('maxProperties', 'Imóveis')}
          {field('maxPublishedListings', 'Anúncios publicados')}
          {editing !== 'new' ? (
            <Checkbox
              label="Plano ativo (desativado continua nas imobiliárias que já o usam)"
              checked={form.isActive}
              onChange={(e) => {
                setForm({ ...form, isActive: e.target.checked });
              }}
            />
          ) : null}
        </form>
      </Modal>
    </div>
  );
}

export function PlansClient() {
  return (
    <ToastProvider>
      <PlansBody />
    </ToastProvider>
  );
}
