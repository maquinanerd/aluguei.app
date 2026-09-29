'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Stack } from '@aluguei/ui';

/**
 * Gravação do ditado, no celular (ADR-104).
 *
 * Três cuidados que a tela precisa ter:
 *
 * 1. **Navegador sem gravação existe.** Em vez de um botão que não faz nada, a
 *    tela diz o que houve e oferece o cadastro comum.
 * 2. **Permissão negada é resposta, não erro.** O texto explica o que fazer.
 * 3. **O áudio fica no celular até a pessoa concluir.** Nada sai enquanto ela
 *    estiver falando; enviar pedaço por pedaço mandaria para fora um ditado que
 *    ela ainda pode descartar.
 */

const ROTEIRO = [
  'Tipo, finalidade e valores',
  'Quartos, banheiros, vagas e área',
  'Endereço e bairro',
  'Condomínio e IPTU',
  'O que o imóvel tem de melhor',
];

type Situacao = 'PARADO' | 'GRAVANDO' | 'PRONTO';

export function Gravador({
  ocupado,
  aoConcluir,
}: {
  ocupado: boolean;
  aoConcluir: (audio: Blob, segundos: number) => void;
}) {
  const [situacao, setSituacao] = useState<Situacao>('PARADO');
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [suportado, setSuportado] = useState(true);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);

  useEffect(() => {
    // `mediaDevices` some em origem não segura (http fora de localhost), embora
    // o tipo diga que existe sempre: a checagem é de runtime, não de tipo.
    const midia = (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    setSuportado(
      typeof window.MediaRecorder !== 'undefined' && typeof midia?.getUserMedia === 'function',
    );
  }, []);

  useEffect(() => {
    if (situacao !== 'GRAVANDO') {
      return;
    }
    const id = setInterval(() => {
      setSegundos((valor) => valor + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [situacao]);

  // A trilha do microfone continua aberta se a pessoa sair no meio; fechar é
  // obrigação nossa, não do navegador.
  useEffect(() => {
    return () => {
      gravador.current?.stream.getTracks().forEach((trilha) => {
        trilha.stop();
      });
    };
  }, []);

  async function comecar(): Promise<void> {
    setErro(null);
    try {
      const trilha = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(trilha);
      pedacos.current = [];
      mr.ondataavailable = (evento) => {
        if (evento.data.size > 0) {
          pedacos.current.push(evento.data);
        }
      };
      mr.onstop = () => {
        trilha.getTracks().forEach((t) => {
          t.stop();
        });
        setSituacao('PRONTO');
      };
      gravador.current = mr;
      mr.start();
      setSegundos(0);
      setSituacao('GRAVANDO');
    } catch {
      setErro(
        'Não foi possível usar o microfone. Autorize o acesso no navegador e tente de novo, ou use o cadastro comum.',
      );
    }
  }

  function parar(): void {
    gravador.current?.stop();
  }

  function enviar(): void {
    const tipo = gravador.current?.mimeType ?? 'audio/webm';
    aoConcluir(new Blob(pedacos.current, { type: tipo }), segundos);
  }

  if (!suportado) {
    return (
      <div className="peg-card" style={{ padding: 16 }}>
        <Stack gap={2}>
          <span style={{ fontWeight: 600 }}>Este navegador não grava áudio</span>
          <span className="peg-text-secondary" style={{ fontSize: 13 }}>
            Abra em outro navegador ou use o <a href="/app/properties/new">cadastro comum</a>, que
            faz a mesma coisa com o teclado.
          </span>
        </Stack>
      </div>
    );
  }

  const relogio = `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;

  return (
    <Stack gap={4}>
      <div className="peg-card" style={{ padding: 16 }}>
        <Stack gap={3}>
          <span style={{ fontWeight: 600 }}>Fale o que souber, em qualquer ordem</span>
          <ul className="peg-stack gap-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {ROTEIRO.map((item) => (
              <li key={item} className="peg-text-secondary" style={{ fontSize: 13 }}>
                · {item}
              </li>
            ))}
          </ul>
        </Stack>
      </div>

      {erro === null ? null : (
        <span role="alert" style={{ fontSize: 13, color: 'var(--peg-danger)' }}>
          {erro}
        </span>
      )}

      <div className="peg-card audio-capture" style={{ padding: 20 }}>
        <Stack gap={3}>
          <span
            aria-live="polite"
            style={{ fontSize: 32, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            {relogio}
          </span>
          <span className="peg-text-secondary" style={{ fontSize: 13 }}>
            {situacao === 'GRAVANDO'
              ? 'Gravando · o áudio fica guardado junto com o imóvel'
              : situacao === 'PRONTO'
                ? 'Gravação concluída. Enviar manda o áudio para transcrição.'
                : 'O áudio só sai do aparelho quando você concluir.'}
          </span>

          {situacao === 'PARADO' ? (
            <Button
              variant="brand"
              fullWidth
              onClick={() => {
                void comecar();
              }}
            >
              Começar a gravar
            </Button>
          ) : null}
          {situacao === 'GRAVANDO' ? (
            <Button variant="secondary" fullWidth onClick={parar}>
              Concluir gravação
            </Button>
          ) : null}
          {situacao === 'PRONTO' ? (
            <Stack gap={2}>
              <Button variant="brand" fullWidth loading={ocupado} onClick={enviar}>
                Enviar para a IA
              </Button>
              <Button
                variant="tertiary"
                fullWidth
                disabled={ocupado}
                onClick={() => {
                  pedacos.current = [];
                  setSegundos(0);
                  setSituacao('PARADO');
                }}
              >
                Gravar de novo
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </div>
    </Stack>
  );
}
