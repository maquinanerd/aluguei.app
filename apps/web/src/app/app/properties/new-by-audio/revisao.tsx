'use client';

import { useState } from 'react';
import { Badge, Button, Group, Input, Stack } from '@aluguei/ui';
import {
  ESTADO_ROTULO,
  ESTADO_TOM,
  GRUPOS,
  ROTULO_DO_CAMPO,
  duracaoLegivel,
  faltaParaConfirmar,
  progressoDaRevisao,
  valorLegivel,
  valorParaApi,
  valorParaEdicao,
} from '@/lib/cadastro-audio';
import type { CampoDoRascunho, ChaveDoCampo, RascunhoDeAudio } from '@/lib/cadastro-audio';

/**
 * Revisão do cadastro por áudio (ADR-104).
 *
 * A IA sugere; a pessoa decide. Por isso a tela mostra **três coisas juntas**:
 * o valor, de onde ele veio (o trecho do áudio) e o que ainda falta. Um campo
 * preenchido sem dizer de onde veio pede confiança que a extração não merece.
 *
 * "Confirmar" não recalcula nada: ele só afirma que o valor sugerido está certo.
 * É o ato de uma pessoa assumir o número — que é a razão de o recurso existir
 * assim, e não gravando direto no cadastro.
 */
export function Revisao({
  rascunho,
  ocupado,
  aoSalvar,
  aoConfirmar,
  aoDescartar,
}: {
  rascunho: RascunhoDeAudio;
  ocupado: boolean;
  aoSalvar: (campos: Array<{ key: ChaveDoCampo; value: string | null }>) => void;
  aoConfirmar: () => void;
  aoDescartar: () => void;
}) {
  const [editando, setEditando] = useState<ChaveDoCampo | null>(null);
  const [rascunhoDoTexto, setRascunhoDoTexto] = useState('');
  const [destacado, setDestacado] = useState<ChaveDoCampo | null>(null);

  const progresso = progressoDaRevisao(rascunho.fields);
  const falta = faltaParaConfirmar(rascunho.fields);
  const duracao = duracaoLegivel(rascunho.audioSeconds);
  const porChave = new Map(rascunho.fields.map((campo) => [campo.key, campo]));

  function abrirEdicao(campo: CampoDoRascunho): void {
    setEditando(campo.key);
    setRascunhoDoTexto(valorParaEdicao(campo));
  }

  function salvarEdicao(chave: ChaveDoCampo): void {
    aoSalvar([{ key: chave, value: valorParaApi(chave, rascunhoDoTexto) }]);
    setEditando(null);
  }

  return (
    <Stack gap={4}>
      <div className="peg-card" style={{ padding: 16 }}>
        <Stack gap={2}>
          <Group between wrap>
            <span style={{ fontWeight: 600 }}>
              {progresso.confirmados} de {progresso.total} campos confirmados
            </span>
            {duracao === null ? null : (
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                áudio de {duracao}
              </span>
            )}
          </Group>
          <span className="peg-text-secondary" style={{ fontSize: 13 }}>
            {progresso.aConfirmar > 0
              ? `${String(progresso.aConfirmar)} valor(es) foram ditos com hesitação e esperam a sua confirmação.`
              : 'Nenhum valor pendente de confirmação.'}
          </span>
        </Stack>
      </div>

      {rascunho.transcript === null ? null : (
        <div className="peg-card" style={{ padding: 16 }}>
          <Stack gap={2}>
            <Group between>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Transcrição</span>
              <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                CPF, telefone e e-mail são removidos antes de guardar
              </span>
            </Group>
            <p
              className="peg-text-secondary"
              style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
            >
              {rascunho.transcript}
            </p>
          </Stack>
        </div>
      )}

      {GRUPOS.map((grupo) => {
        const campos = grupo.campos
          .map((chave) => porChave.get(chave))
          .filter((campo): campo is CampoDoRascunho => campo !== undefined);
        if (campos.length === 0) {
          return null;
        }
        const noGrupo = progressoDaRevisao(campos);
        return (
          <div key={grupo.titulo} className="peg-card" style={{ padding: 16 }}>
            <Stack gap={3}>
              <Group between>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{grupo.titulo}</span>
                <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
                  {noGrupo.confirmados} de {noGrupo.total}
                </span>
              </Group>

              <Stack gap={2}>
                {campos.map((campo) => (
                  <div key={campo.key} className="audio-field">
                    <Group between wrap className="audio-field__head">
                      <span style={{ fontSize: 13 }}>{ROTULO_DO_CAMPO[campo.key]}</span>
                      <Badge tone={ESTADO_TOM[campo.state]}>{ESTADO_ROTULO[campo.state]}</Badge>
                    </Group>

                    {editando === campo.key ? (
                      <Group gap={2} wrap className="audio-field__edit">
                        <Input
                          size="sm"
                          aria-label={`Valor de ${ROTULO_DO_CAMPO[campo.key]}`}
                          autoFocus
                          value={rascunhoDoTexto}
                          onChange={(evento) => {
                            setRascunhoDoTexto(evento.target.value);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="brand"
                          loading={ocupado}
                          onClick={() => {
                            salvarEdicao(campo.key);
                          }}
                        >
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="tertiary"
                          onClick={() => {
                            setEditando(null);
                          }}
                        >
                          Cancelar
                        </Button>
                      </Group>
                    ) : (
                      <Group between wrap>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{valorLegivel(campo)}</span>
                        <Group gap={2} wrap>
                          {campo.state === 'NEEDS_CONFIRMATION' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={ocupado}
                              onClick={() => {
                                // Confirmar é assumir o valor sugerido como seu:
                                // reenviamos o mesmo valor, e ele passa a contar
                                // como decidido por uma pessoa.
                                aoSalvar([{ key: campo.key, value: campo.value }]);
                              }}
                            >
                              Confirmar
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="tertiary"
                            onClick={() => {
                              abrirEdicao(campo);
                            }}
                          >
                            {campo.state === 'MISSING' ? 'Preencher' : 'Editar'}
                          </Button>
                          {campo.evidence === null ? null : (
                            <Button
                              size="sm"
                              variant="tertiary"
                              onClick={() => {
                                setDestacado(destacado === campo.key ? null : campo.key);
                              }}
                            >
                              {destacado === campo.key ? 'Ocultar trecho' : 'Ver trecho'}
                            </Button>
                          )}
                        </Group>
                      </Group>
                    )}

                    {destacado === campo.key && campo.evidence !== null ? (
                      <p className="audio-field__evidence">“{campo.evidence}”</p>
                    ) : null}
                  </div>
                ))}
              </Stack>
            </Stack>
          </div>
        );
      })}

      <div className="peg-card" style={{ padding: 16 }}>
        <Stack gap={3}>
          {falta.length === 0 ? (
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              Ao criar o imóvel, os valores acima passam a valer como cadastro. O áudio fica
              guardado junto.
            </span>
          ) : (
            <span role="status" style={{ fontSize: 13, color: 'var(--peg-warning-fg, #A05C06)' }}>
              Falta preencher: {falta.map((chave) => ROTULO_DO_CAMPO[chave]).join(', ')}.
            </span>
          )}
          <Group gap={2} wrap>
            <Button
              variant="brand"
              loading={ocupado}
              disabled={falta.length > 0}
              onClick={aoConfirmar}
            >
              Confirmar e criar imóvel
            </Button>
            <Button variant="tertiary" disabled={ocupado} onClick={aoDescartar}>
              Descartar rascunho
            </Button>
          </Group>
        </Stack>
      </div>
    </Stack>
  );
}
