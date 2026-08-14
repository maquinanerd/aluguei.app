'use client';

import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Divider,
  Drawer,
  Dropdown,
  Group,
  Icon,
  IconButton,
  Input,
  Kpi,
  Modal,
  Pagination,
  Radio,
  SearchInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Tabs,
  Tag,
  Textarea,
  ToastProvider,
  useToast,
} from '@aluguei/ui';

interface Row {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'ok' | 'warn' | 'danger';
}

const ROWS: Row[] = [
  { id: '1', name: 'Ana Beatriz Rocha', email: 'ana@imob.com', role: 'Admin', status: 'ok' },
  { id: '2', name: 'Carlos Eduardo Lima', email: 'carlos@imob.com', role: 'Agente', status: 'warn' },
  { id: '3', name: 'Fernanda Souza', email: 'fe@imob.com', role: 'Financeiro', status: 'ok' },
  { id: '4', name: 'João Pedro Alves', email: 'joao@imob.com', role: 'Vistoria', status: 'danger' },
  { id: '5', name: 'Mariana Castro', email: 'mari@imob.com', role: 'Agente', status: 'ok' },
  { id: '6', name: 'Ricardo Nunes', email: 'rica@imob.com', role: 'Viewer', status: 'ok' },
];

function DemoBody() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const [view, setView] = useState('tabela');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState('a');
  const [sel, setSel] = useState('');

  const columns = [
    {
      key: 'name',
      header: 'Nome',
      sortable: true,
      render: (r: Row) => (
        <Group gap={2}>
          <Avatar name={r.name} size="sm" brand />
          <span>{r.name}</span>
        </Group>
      ),
    },
    { key: 'email', header: 'E-mail', sortable: true, render: (r: Row) => r.email },
    { key: 'role', header: 'Função', render: (r: Row) => r.role },
    {
      key: 'status',
      header: 'Status',
      render: (r: Row) => (
        <Badge
          tone={r.status === 'ok' ? 'success' : r.status === 'warn' ? 'warning' : 'danger'}
        >
          {r.status === 'ok' ? 'Ativo' : r.status === 'warn' ? 'Pendente' : 'Bloqueado'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r: Row) => (
        <Dropdown
          ariaLabel={`Ações de ${r.name}`}
          trigger={
            <IconButton label="Mais ações" size="xs">
              <Icon name="moreVertical" size={16} />
            </IconButton>
          }
          items={[
            { key: 'edit', label: 'Editar', icon: 'edit', onSelect: () => { toast.info('Editar', r.name); } },
            { key: 'block', label: 'Bloquear', icon: 'lock', onSelect: () => { toast.warning('Bloqueado', r.name); } },
            { key: 'del', label: 'Remover', icon: 'trash', danger: true, onSelect: () => { toast.error('Remover', r.name); } },
          ]}
        />
      ),
    },
  ];

  const sorted = [...ROWS].sort((a, b) => {
    const av = a[sortKey as keyof Row];
    const bv = b[sortKey as keyof Row];
    const cmp = String(av as unknown).localeCompare(String(bv as unknown));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <Stack gap={6}>
      <h1 style={{ fontSize: 24 }}>Aluguei.app — Calibração PEG</h1>
      <p style={{ color: 'var(--peg-text-secondary)' }}>
        Laboratório visual da fundação. Comparar com design-source/peg-product-design-system/references.
      </p>

      {/* KPIs */}
      <div className="peg-grid cols-4">
        <Kpi label="Leads novos" value="128" delta="+12% esta semana" deltaTone="up" icon="trendingUp" />
        <Kpi label="Visitas agendadas" value="36" delta="-3 vs ontem" deltaTone="down" icon="calendar" />
        <Kpi label="Repasses pendentes" value="R$ 18,4 mil" delta="2 conciliações" deltaTone="neutral" icon="receipt" />
        <Kpi label="Taxa de conversão" value="23,6%" delta="+1,4 pp" deltaTone="up" icon="target" />
      </div>

      {/* Controles */}
      <Card title="Controles" padless>
        <Stack gap={4} style={{ padding: 24 }}>
          <Group gap={3} wrap>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="tertiary">Tertiary</Button>
            <Button variant="brand">Brand</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Carregando</Button>
            <Button variant="secondary" size="sm" icon={<Icon name="plus" size={14} />}>
              Adicionar
            </Button>
            <IconButton label="Editar" bordered>
              <Icon name="edit" size={16} />
            </IconButton>
            <IconButton label="Excluir">
              <Icon name="trash" size={16} />
            </IconButton>
          </Group>

          <Divider />

          <div className="peg-grid cols-2">
            <Input label="E-mail" placeholder="contato@imob.com.br" helper="Usado para login" />
            <Input label="CPF" optional placeholder="000.000.000-00" error="Documento inválido" />
            <SearchInput placeholder="Buscar imóvel, lead, contato…" />
            <Select
              label="Tipo de imóvel"
              placeholder="Selecione…"
              value={sel}
              onChange={(e) => { setSel(e.target.value); }}
              options={[
                { value: 'APARTMENT', label: 'Apartamento' },
                { value: 'HOUSE', label: 'Casa' },
                { value: 'COMMERCIAL', label: 'Comercial' },
                { value: 'LAND', label: 'Terreno' },
              ]}
            />
          </div>

          <Group gap={6} wrap>
            <Checkbox checked={checked} onChange={() => { setChecked((v) => !v); }} label="Aceita pets" />
            <Checkbox indeterminate label="Mobiliado (indeterminado)" />
            <Radio checked={radio === 'a'} onChange={() => { setRadio('a'); }} label="Pessoa física" />
            <Radio checked={radio === 'b'} onChange={() => { setRadio('b'); }} label="Pessoa jurídica" />
            <Switch checked={checked} onChange={() => { setChecked((v) => !v); }} label="Publicado no portal" />
          </Group>

          <Textarea label="Observações" placeholder="Anotações internas sobre o imóvel…" rows={3} />
        </Stack>
      </Card>

      {/* Tabs + Segmented */}
      <Group gap={4} between>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'overview', label: 'Visão geral' },
            { value: 'dados', label: 'Dados' },
            { value: 'midia', label: 'Mídia' },
            { value: 'historico', label: 'Histórico', count: 12 },
          ]}
        />
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: 'tabela', label: 'Tabela' },
            { value: 'grade', label: 'Grade' },
            { value: 'kanban', label: 'Kanban' },
          ]}
        />
      </Group>
      {tab === 'overview' ? (
        <Card padless>
          <DataTable
            columns={columns}
            rows={sorted}
            selectedIds={selected}
            onSelectIds={setSelected}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={(k) => {
              if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
              else {
                setSortKey(k);
                setSortDir('asc');
              }
            }}
            dense
          />
          <Pagination page={page} pageSize={5} total={12} onPageChange={setPage} />
        </Card>
      ) : (
        <Card>
          <p style={{ color: 'var(--peg-text-tertiary)' }}>Conteúdo da aba {tab}</p>
        </Card>
      )}

      {/* Tags + Badges */}
      <Group gap={2} wrap>
        <Tag icon="mapPin">Bela Vista, São Paulo</Tag>
        <Tag icon="home">2 dormitórios</Tag>
        <Tag onRemove={() => { toast.info('Removida'); }}>Condomínio R$ 900</Tag>
        <Badge tone="brand">Novo</Badge>
        <Badge tone="info">Em análise</Badge>
        <Badge tone="success">Publicado</Badge>
        <Badge tone="warning">Pendente</Badge>
        <Badge tone="danger">Vencido</Badge>
      </Group>

      {/* Modais / Drawers */}
      <Group gap={3}>
        <Button variant="secondary" onClick={() => { setModalOpen(true); }}>
          Abrir modal
        </Button>
        <Button variant="secondary" onClick={() => { setDrawerOpen(true); }}>
          Abrir drawer
        </Button>
      </Group>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); }}
        title="Nova cobrança"
        footer={
          <>
            <Button variant="tertiary" onClick={() => { setModalOpen(false); }}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => {
              setModalOpen(false);
              toast.success('Cobrança criada', 'Vence em 10/09/2026');
            }}>
              Criar cobrança
            </Button>
          </>
        }
      >
        <Stack gap={4}>
          <Input label="Valor" prefix="R$" placeholder="3.500,00" />
          <Select
            label="Forma de pagamento"
            options={[
              { value: 'PIX', label: 'Pix' },
              { value: 'BOLETO', label: 'Boleto' },
              { value: 'CREDIT_CARD', label: 'Cartão' },
            ]}
          />
        </Stack>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); }}
        title="Inspector contextual"
        footer={
          <Button variant="primary" onClick={() => { setDrawerOpen(false); }}>
            Aplicar
          </Button>
        }
      >
        <Stack gap={4}>
          <SearchInput placeholder="Buscar no contexto…" />
          <Input label="Próxima ação" placeholder="Ligar para o lead" />
          <Switch label="Notificar responsável" />
        </Stack>
      </Drawer>

      {/* toasts */}
      <Group gap={3}>
        <Button variant="secondary" onClick={() => { toast.success('Salvo', 'Alterações aplicadas.'); }}>
          Toast sucesso
        </Button>
        <Button variant="secondary" onClick={() => { toast.error('Falha', 'Serviço indisponível.'); }}>
          Toast erro
        </Button>
      </Group>
    </Stack>
  );
}

export function Calibration() {
  return (
    <ToastProvider>
      <DemoBody />
    </ToastProvider>
  );
}
