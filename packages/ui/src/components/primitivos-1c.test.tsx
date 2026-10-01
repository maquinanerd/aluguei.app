import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvisoModoTeste } from './AvisoModoTeste';
import { Modal } from './Modal';
import { ProgressBar } from './ProgressBar';
import { Switch } from './Switch';

/** Primitivos da Onda 1C (ADR-105; spec da gestão, §6 e §7) nas formas dos desenhos. */

describe('AvisoModoTeste nas formas dos prints', () => {
  it('faixa: selo branco, texto e "Saiba mais" (cobrança, 03-ajustes.dc.html:31)', () => {
    const html = renderToStaticMarkup(
      <AvisoModoTeste forma="faixa" acao="Saiba mais">
        Cobrança real e split pelo Asaas chegam em breve. Nenhum valor é cobrado ou transferido por
        este painel ainda.
      </AvisoModoTeste>,
    );
    expect(html).toContain('class="peg-aviso-faixa" role="status"');
    expect(html).toContain(
      '<span class="peg-aviso-selo peg-aviso-selo--branco">Modo de teste</span>',
    );
    expect(html).toContain('Cobrança real e split pelo Asaas chegam em breve.');
    expect(html).toContain('<span class="peg-aviso-faixa__acao">Saiba mais</span>');
  });

  it('selo: só o selo, para o cabeçalho do envelope (03-ajustes.dc.html:60)', () => {
    expect(renderToStaticMarkup(<AvisoModoTeste forma="selo" />)).toBe(
      '<span class="peg-aviso-selo">Modo de teste</span>',
    );
  });

  it('caixa com "!", e larga na tela do Pix', () => {
    const caixa = renderToStaticMarkup(
      <AvisoModoTeste forma="caixa">
        Assinatura real (Autentique) em breve. Hoje o envelope roda em modo de teste.
      </AvisoModoTeste>,
    );
    expect(caixa).toContain('class="peg-aviso-caixa" role="status"');
    expect(caixa).toContain('<span class="peg-aviso__marca" aria-hidden="true">!</span>');
    const larga = renderToStaticMarkup(
      <AvisoModoTeste forma="caixa" larga>
        Modo de teste.
      </AvisoModoTeste>,
    );
    expect(larga).toContain('class="peg-aviso-caixa peg-aviso-caixa--larga"');
  });

  it('alerta: faixa com borda e "!", sem o selo (análise cadastral, 03-ajustes.dc.html:69)', () => {
    const html = renderToStaticMarkup(
      <AvisoModoTeste forma="alerta">
        Consulta ao Serasa e SPC em breve. As regras abaixo usam só os dados informados na
        candidatura.
      </AvisoModoTeste>,
    );
    expect(html).toContain('class="peg-aviso-alerta" role="status"');
    expect(html).not.toContain('Modo de teste');
  });

  it('padrão: a faixa de antes, com o provedor', () => {
    const html = renderToStaticMarkup(<AvisoModoTeste provedor="Asaas" />);
    expect(html).toContain('Modo de teste · Asaas.');
    expect(html).toContain('peg-aviso-teste');
  });
});

describe('ProgressBar', () => {
  it('lê o valor para o leitor de tela e desenha a largura', () => {
    const html = renderToStaticMarkup(<ProgressBar value={45} label="Qualificados: 14 de 31" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Qualificados: 14 de 31"');
    expect(html).toContain('aria-valuenow="45"');
    expect(html).toContain('class="peg-progress peg-progress--brand"');
    expect(html).toContain('style="width:45%"');
  });

  it('sem rótulo, é decorativa: o número já está escrito ao lado', () => {
    const html = renderToStaticMarkup(<ProgressBar value={29} tone="neutral" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain('class="peg-progress peg-progress--neutral"');
  });

  it('fica entre 0 e 100 e aceita os tons e o trilho fino', () => {
    expect(renderToStaticMarkup(<ProgressBar value={130} label="x" />)).toContain(
      'aria-valuenow="100"',
    );
    expect(renderToStaticMarkup(<ProgressBar value={-5} label="x" />)).toContain(
      'aria-valuenow="0"',
    );
    expect(renderToStaticMarkup(<ProgressBar value={Number.NaN} label="x" />)).toContain(
      'style="width:0%"',
    );
    expect(
      renderToStaticMarkup(<ProgressBar value={100} label="x" tone="danger" size="sm" />),
    ).toContain('class="peg-progress peg-progress--danger peg-progress--sm"');
  });
});

describe('Switch', () => {
  it('30 × 18 por padrão e 26 × 16 no tamanho sm', () => {
    const padrao = renderToStaticMarkup(<Switch label="Aceita financiamento" defaultChecked />);
    expect(padrao).toContain('class="peg-switch"');
    expect(padrao).toContain('role="switch"');
    const pequeno = renderToStaticMarkup(<Switch label="Pública no portal" size="sm" />);
    expect(pequeno).toContain('class="peg-switch peg-switch--sm"');
  });
});

describe('Modal nas formas dos diálogos', () => {
  const nada = () => undefined;

  it('list (520): título, subtítulo e sem o "×"', () => {
    const html = renderToStaticMarkup(
      <Modal
        open
        onClose={nada}
        variant="list"
        title="Publicar anúncio"
        description="Kitnet 32 m² · Setor Universitário · IMV-0214"
        footer={<button type="button">Cancelar</button>}
      >
        <div className="peg-modal-list__row">Portal AchouImóvel</div>
      </Modal>,
    );
    expect(html).toContain('class="peg-modal peg-modal--list"');
    expect(html).toContain('<h2 class="peg-modal__title">Publicar anúncio</h2>');
    expect(html).toContain(
      '<p class="peg-modal__description">Kitnet 32 m² · Setor Universitário · IMV-0214</p>',
    );
    expect(html).not.toContain('aria-label="Fechar"');
  });

  it('notice (460) e a padrão, que mantém o "×"', () => {
    const aviso = renderToStaticMarkup(
      <Modal open onClose={nada} variant="notice" title="Limite de contratos ativos atingido">
        Nada foi apagado.
      </Modal>,
    );
    expect(aviso).toContain('class="peg-modal peg-modal--notice"');
    const padrao = renderToStaticMarkup(
      <Modal open onClose={nada} title="Editar" size="sm">
        x
      </Modal>,
    );
    expect(padrao).toContain('class="peg-modal peg-modal--sm"');
    expect(padrao).toContain('aria-label="Fechar"');
  });
});
