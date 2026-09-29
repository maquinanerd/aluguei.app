'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AvisoModoTeste,
  Button,
  EmptyState,
  ErrorState,
  Stack,
  ToastProvider,
  useToast,
} from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import { useCapacidades } from '@/lib/capacidades';
import { PageToolbar } from '@/components/page-toolbar';
import { Gravador } from './gravador';
import { Revisao } from './revisao';
import type { ChaveDoCampo, RascunhoDeAudio } from '@/lib/cadastro-audio';

/**
 * Cadastro de imóvel por áudio (ADR-104): captura, processamento e revisão.
 *
 * A tela nasce **desligada** e é `/capabilities` que diz se ela pode funcionar:
 * sem provedor de transcrição com retenção zero declarada, ela explica isso e
 * manda para o cadastro comum, em vez de deixar o corretor gravar três minutos
 * para receber um erro no fim.
 */

interface RespostaDoRascunho {
  draft: RascunhoDeAudio;
}

function CadastroBody() {
  const toast = useToast();
  const router = useRouter();
  const capacidades = useCapacidades();
  const [rascunho, setRascunho] = useState<RascunhoDeAudio | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const audio = capacidades.data?.providers.audio ?? null;

  async function enviar(gravacao: Blob, segundos: number): Promise<void> {
    setOcupado(true);
    setErro(null);
    try {
      const aberto = await apiClient<RespostaDoRascunho>('/property-drafts', {
        method: 'POST',
        body: {},
      });
      const id = aberto.draft.id;
      setRascunho({ ...aberto.draft, status: 'PROCESSING' });

      const tipo =
        gravacao.type === '' ? 'audio/webm' : (gravacao.type.split(';')[0] ?? 'audio/webm');
      const destino = await apiClient<{ url: string; key: string }>(
        `/property-drafts/${id}/audio-url`,
        { method: 'POST', body: { mimeType: tipo, sizeBytes: gravacao.size } },
      );
      // PUT assinado: o áudio vai direto para o storage da imobiliária, sem
      // passar pela API nem ficar em log.
      const subida = await fetch(destino.url, {
        method: 'PUT',
        headers: { 'content-type': tipo },
        body: gravacao,
      });
      if (!subida.ok) {
        throw new Error('Falha ao enviar o áudio');
      }

      const processado = await apiClient<RespostaDoRascunho>(`/property-drafts/${id}/process`, {
        method: 'POST',
        body: { key: destino.key, seconds: segundos },
      });
      setRascunho(processado.draft);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível processar o áudio.');
      setRascunho(null);
    } finally {
      setOcupado(false);
    }
  }

  async function salvar(campos: Array<{ key: ChaveDoCampo; value: string | null }>): Promise<void> {
    if (!rascunho) return;
    setOcupado(true);
    try {
      const atualizado = await apiClient<RespostaDoRascunho>(
        `/property-drafts/${rascunho.id}/fields`,
        { method: 'PATCH', body: { fields: campos } },
      );
      setRascunho(atualizado.draft);
    } catch (err) {
      toast.error('Não foi possível salvar', err instanceof Error ? err.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar(): Promise<void> {
    if (!rascunho) return;
    setOcupado(true);
    try {
      const criado = await apiClient<{ propertyId: string }>(
        `/property-drafts/${rascunho.id}/confirm`,
        { method: 'POST', body: {} },
      );
      toast.success('Imóvel criado a partir do áudio');
      router.push(`/app/properties/${criado.propertyId}`);
    } catch (err) {
      toast.error(
        'Não foi possível criar o imóvel',
        err instanceof Error ? err.message : undefined,
      );
      setOcupado(false);
    }
  }

  async function descartar(): Promise<void> {
    if (!rascunho) return;
    setOcupado(true);
    try {
      await apiClient(`/property-drafts/${rascunho.id}/discard`, { method: 'POST', body: {} });
      setRascunho(null);
    } catch (err) {
      toast.error('Não foi possível descartar', err instanceof Error ? err.message : undefined);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="app-page">
      <PageToolbar
        title="Novo imóvel por áudio"
        description="Você fala, a IA preenche e você confirma. Nada é salvo sem a sua confirmação."
      />

      {capacidades.loading ? (
        <EmptyState title="Verificando se o recurso está disponível…" icon="activity" />
      ) : audio === null ? (
        <div className="peg-card" style={{ padding: 16 }}>
          <Stack gap={3}>
            <span style={{ fontWeight: 600 }}>Cadastro por áudio indisponível</span>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              O recurso só liga com um provedor de transcrição que não guarda nem treina com o
              áudio. Enquanto esse provedor não estiver configurado, ele fica desligado — gravar
              para mandar áudio a um serviço cujo tratamento não conhecemos é pior do que não ter o
              recurso.
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                router.push('/app/properties/new');
              }}
            >
              Cadastrar pelo formulário
            </Button>
          </Stack>
        </div>
      ) : (
        <Stack gap={4}>
          {/* Só existe um transcritor hoje, e ele é simulação; quando entrar um
              real, `/capabilities` devolve outro nome e o aviso some sozinho. */}
          <AvisoModoTeste provedor="transcrição">
            A transcrição está em simulação: o texto abaixo é de exemplo e{' '}
            <strong>não é o que foi dito no áudio</strong>. Confira cada campo antes de criar o
            imóvel.
          </AvisoModoTeste>

          {erro === null ? null : (
            <ErrorState
              body={erro}
              onRetry={() => {
                setErro(null);
              }}
            />
          )}

          {rascunho === null ? (
            <Gravador
              ocupado={ocupado}
              aoConcluir={(gravacao, segundos) => {
                void enviar(gravacao, segundos);
              }}
            />
          ) : rascunho.status === 'PROCESSING' ? (
            <EmptyState
              title="Organizando o cadastro…"
              body="Transcrevendo o áudio e preenchendo os campos. Não feche esta tela."
              icon="activity"
            />
          ) : (
            <Revisao
              rascunho={rascunho}
              ocupado={ocupado}
              aoSalvar={(campos) => {
                void salvar(campos);
              }}
              aoConfirmar={() => {
                void confirmar();
              }}
              aoDescartar={() => {
                void descartar();
              }}
            />
          )}
        </Stack>
      )}
    </div>
  );
}

export function CadastroPorAudio() {
  return (
    <ToastProvider>
      <CadastroBody />
    </ToastProvider>
  );
}
