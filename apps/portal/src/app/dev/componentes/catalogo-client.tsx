'use client';

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Acordeao,
  BarraFiltrosCelular,
  BlocoGrade,
  Botao,
  BotaoLink,
  BotoesQuartos,
  Campo,
  CheckboxLgpd,
  Chip,
  ChipsDeFiltro,
  EstadoVazio,
  FiltrosLaterais,
  Gaveta,
  GrupoFiltro,
  ImovelCard,
  Logotipo,
  OpcaoMarcavel,
  Ordenacao,
  ReguaValor,
  Segmentado,
  SiteFooter,
  SiteHeader,
} from '@/components';
import { AlertaImovel } from '@/components/AlertaImovel';
import { FaixaTipo, Paginacao } from '@/components/busca';
import { TIPOS_IMOVEL, TIPO_IMOVEL } from '@/lib/tipos';
import type { TipoImovel } from '@/lib/tipos';
import {
  BREAKPOINTS,
  CARDS_DE_AMOSTRA,
  CARD_ALUGUEL,
  CARD_AMBOS,
  CARD_VENDA,
  ESCALA_DE_TIPO,
  ESPACAMENTO,
  RAIO,
  REFERENCIAS,
  TIPOS,
  TOKENS_DE_COR,
} from './identidade';

/**
 * Tela 01 da rodada de fidelidade (`telas/portal/00-identidade.dc.html`): a identidade do portal
 * com os componentes de verdade — logotipo, blocos e card vêm de `@/components` e as cores e
 * medidas, dos tokens —, seguida dos estados de cada componente base (seção 6, que a tela não tem).
 * Os números são fictícios, como na tela.
 */

const CORES_DO_LOGOTIPO: TipoImovel[] = [
  'apartamento',
  'casa',
  'casa-condominio',
  'sobrado',
  'kitnet-studio',
  'cobertura',
  'sala-loja',
];

const CONTAGEM_POR_TIPO: Record<TipoImovel, number> = {
  apartamento: 48,
  casa: 12,
  'casa-condominio': 3,
  sobrado: 2,
  'kitnet-studio': 9,
  cobertura: 4,
  'sala-loja': 7,
};

const CARACTERISTICAS = [
  { rotulo: 'Mobiliado', contagem: 11, valor: 'mobiliado' },
  { rotulo: 'Aceita pet', contagem: 19, valor: 'pet' },
  { rotulo: 'Com vaga', contagem: 44, valor: 'vaga' },
  { rotulo: 'Com suíte', contagem: 27, valor: 'suite' },
];

const QUARTOS = ['1', '2', '3', '4+'].map((rotulo) => ({
  rotulo,
  href: '#s8',
  marcado: rotulo === '2',
}));

function Quadro({
  rotulo,
  children,
  largura,
}: {
  rotulo: string;
  children: ReactNode;
  largura?: number;
}) {
  return (
    <div className="ident__quadro">
      <span className="ident__rotulo-quadro">{rotulo}</span>
      <div
        className="ident__moldura"
        style={largura === undefined ? undefined : ({ maxWidth: largura } as CSSProperties)}
      >
        {children}
      </div>
    </div>
  );
}

function FiltrosDeExemplo({ tamanho }: { tamanho: 'desktop' | 'celular' }) {
  const grupos = [
    <GrupoFiltro key="finalidade" rotulo="Finalidade" tamanho={tamanho}>
      <Segmentado
        rotulo="Finalidade"
        altura={tamanho === 'desktop' ? 40 : 44}
        valor="aluguel"
        opcoes={[
          { valor: 'aluguel', rotulo: 'Alugar', href: '#s8' },
          { valor: 'venda', rotulo: 'Comprar', href: '#s8' },
        ]}
      />
    </GrupoFiltro>,
    <GrupoFiltro key="tipo" rotulo="Tipo" tamanho={tamanho} lista>
      {TIPOS_IMOVEL.map((tipo) => (
        <OpcaoMarcavel
          key={tipo}
          rotulo={TIPO_IMOVEL[tipo].nome}
          tipo={tipo}
          contagem={CONTAGEM_POR_TIPO[tipo]}
          marcado={tipo === 'apartamento'}
          href="#s8"
          tamanho={tamanho}
        />
      ))}
    </GrupoFiltro>,
    <GrupoFiltro key="quartos" rotulo="Quartos" tamanho={tamanho}>
      <BotoesQuartos opcoes={QUARTOS} tamanho={tamanho} />
    </GrupoFiltro>,
  ];
  if (tamanho === 'celular') {
    // A gaveta tem Finalidade, Quartos e Tipo, nessa ordem (telas/portal/02-busca).
    return <>{[grupos[0], grupos[2], grupos[1]]}</>;
  }
  return (
    <FiltrosLaterais>
      {grupos}
      <div className="filtros__grupo">
        <ReguaValor
          nome="ate"
          valorCents={300_000}
          minimoCents={100_000}
          maximoCents={450_000}
          passoCents={10_000}
        />
      </div>
      <GrupoFiltro rotulo="Características" lista>
        {CARACTERISTICAS.map((item) => (
          <OpcaoMarcavel
            key={item.valor}
            rotulo={item.rotulo}
            contagem={item.contagem}
            marcado={false}
            nome="com"
            valor={item.valor}
          />
        ))}
      </GrupoFiltro>
    </FiltrosLaterais>
  );
}

export function Catalogo() {
  const [gaveta, setGaveta] = useState(false);

  return (
    <main className="ident">
      <header className="ident__capa" data-screen-label="00 Capa">
        <div className="ident__sobretitulo">
          Entrega 1 de 2 · Avaliação das referências e proposta de identidade · para aprovação
        </div>
        <h1 className="ident__titulo">AchouImóvel: identidade do portal</h1>
        <p className="ident__abertura">
          A base é a linguagem do OpaPreço, adaptada para imóvel. O portal é branco, com uma só cor
          de acento. Nenhuma parte usa fundo escuro, sombra pesada ou gradiente.
        </p>
        <nav className="ident__indice">
          <a href="#s1">1. Referências</a>
          <a href="#s2">2. Logotipo e acento</a>
          <a href="#s3">3. Tokens</a>
          <a href="#s4">4. Tipos de imóvel</a>
          <a href="#s6">5. Componentes</a>
          <a href="#s7">Decisões para aprovar</a>
          <a href="#s8">6. Estados dos componentes</a>
        </nav>
      </header>

      <section id="s1" className="ident__secao ident__secao--20" data-screen-label="01 Referências">
        <h2 className="ident__h2">1. Avaliação das referências</h2>
        <p className="ident__texto ident__texto--70">
          Cada referência foi lida em relação ao AchouImóvel: o que ela resolve que nós também
          precisamos resolver, e o que quebraria uma regra do produto.
        </p>
        <div className="ident__rolagem ident__rolagem--filete">
          <div className="ident__referencias">
            <div className="ident__th ident__th--primeira">Arquivo</div>
            <div className="ident__th">Aproveitar</div>
            <div className="ident__th">Evitar</div>
            <div className="ident__th">Motivo</div>
            {REFERENCIAS.map((referencia) => (
              <div className="ident__linha-ref" key={referencia.nome}>
                <div className="ident__td ident__td--primeira">
                  <span className="ident__ref-nome">{referencia.nome}</span>
                  <span className="ident__ref-arquivo">{referencia.arquivo}</span>
                </div>
                <div className="ident__td">{referencia.usar}</div>
                <div className="ident__td">{referencia.evitar}</div>
                <div className="ident__td ident__td--motivo">{referencia.motivo}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="s2"
        className="ident__secao ident__secao--24"
        data-screen-label="02 Logotipo e acento"
      >
        <h2 className="ident__h2">2. Logotipo e cor de acento</h2>
        <div className="ident__marcas">
          <div className="ident__marca">
            <div className="ident__logo-30">
              <Logotipo tamanho={30} />
            </div>
            <div className="ident__nota-marca">
              Portal · <b>achouimovel.online</b>. Guton 800, tracking −0,04em. &quot;Imóvel&quot;
              muda de cor conforme a seção do site: verde do acento na Home e nas páginas gerais, e
              a cor do tipo nas páginas de cada tipo (azul em Apartamento, laranja em Casa etc.).
              &quot;Achou&quot; fica sempre em #111111.
            </div>
          </div>
          <div className="ident__marca">
            <div className="ident__assinatura">
              <span className="ident__logo-30">
                <Logotipo tamanho={30} />
              </span>
              <span className="ident__filete" />
              <span className="ident__gestao">Gestão</span>
            </div>
            <div className="ident__nota-marca">
              Gestão · <b>app.achouimovel.online</b>. Mesma marca com filete vertical e
              &quot;Gestão&quot; em 600, como a assinatura do OpaPreço. Na sidebar de 238px entra em
              21px.
            </div>
          </div>
        </div>
        <div className="ident__logos-cores">
          {CORES_DO_LOGOTIPO.map((tipo) => (
            <Logotipo key={tipo} tamanho={20} cor={tipo} />
          ))}
        </div>
        <div className="ident__acentos">
          <div className="ident__acento ident__acento--escolhido">
            <div className="ident__acento-topo">
              <span className="ident__acento-nome">A · Verde</span>
              <span className="ident__recomendada">Recomendada</span>
            </div>
            <div className="ident__amostra" style={{ background: 'var(--brand-accent)' }}>
              #037A4B · 5,4:1 no branco
            </div>
            <div className="ident__preco" style={{ color: 'var(--brand-accent)' }}>
              R$ 2.910<span>/mês</span>
            </div>
            <p className="ident__acento-texto">
              Nenhum portal da referência usa verde (QuintoAndar e VivaReal azul, ZAP roxo, MySide
              vermelho). Conversa com o botão &quot;Chamar no WhatsApp&quot; e não disputa com o
              azul primário da gestão nem com o vermelho de erro.
            </p>
          </div>
          <div className="ident__acento">
            <span className="ident__acento-nome">B · Terracota do OpaPreço</span>
            <div className="ident__amostra" style={{ background: '#C2410C' }}>
              #C2410C · 5,2:1 no branco
            </div>
            <div className="ident__preco" style={{ color: '#C2410C' }}>
              R$ 2.910<span>/mês</span>
            </div>
            <p className="ident__acento-texto">
              Lembra tijolo e telha. Risco: as duas marcas do mesmo dono ficam iguais, e o laranja
              fica perto do vermelho de &quot;vencida&quot; e &quot;recusada&quot;.
            </p>
          </div>
          <div className="ident__acento">
            <span className="ident__acento-nome">C · Azul-petróleo</span>
            <div className="ident__amostra" style={{ background: '#0E5A7A' }}>
              #0E5A7A · 7,4:1 no branco
            </div>
            <div className="ident__preco" style={{ color: '#0E5A7A' }}>
              R$ 2.910<span>/mês</span>
            </div>
            <p className="ident__acento-texto">
              Sóbrio e seguro. Risco: fica no território do QuintoAndar e do VivaReal e perde
              contraste com os azuis de Apartamento.
            </p>
          </div>
        </div>
      </section>

      <section id="s3" className="ident__secao ident__secao--28" data-screen-label="03 Tokens">
        <h2 className="ident__h2">3. Tokens</h2>
        <div className="ident__tokens-cor">
          <div className="ident__lista">
            <h3 className="ident__h3">Cor · portal e marca</h3>
            {TOKENS_DE_COR.map((token) => (
              <div className="ident__linha-cor" key={token.nome}>
                <span
                  className="ident__swatch"
                  style={{ background: `var(${token.nome})` } as CSSProperties}
                />
                <code className="ident__codigo">{token.nome}</code>
                <code className="ident__codigo ident__codigo--valor">{token.valor}</code>
                <span className="ident__uso">{token.uso}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ident__lista">
          <h3 className="ident__h3">Tipografia · Guton 400–800, sem caixa alta</h3>
          <div className="ident__rolagem">
            <div className="ident__tipografia">
              {ESCALA_DE_TIPO.map((token) => (
                <div className="ident__linha-tipo" key={token.nome}>
                  <code className="ident__codigo ident__celula ident__celula--primeira">
                    {token.nome}
                  </code>
                  <span className="ident__celula">{token.tamanho}</span>
                  <span className="ident__celula">{token.peso}</span>
                  <span className="ident__celula">{token.tracking}</span>
                  <span className="ident__celula ident__celula--uso">{token.uso}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ident__tres">
          <div className="ident__lista">
            <h3 className="ident__h3">Espaçamento</h3>
            {ESPACAMENTO.map((item) => (
              <div className="ident__par" key={item.nome}>
                <code className="ident__codigo">{item.nome}</code>
                <span>{item.valor}</span>
              </div>
            ))}
          </div>
          <div className="ident__lista">
            <h3 className="ident__h3">Raio</h3>
            {RAIO.map((item) => (
              <div className="ident__par" key={item.nome}>
                <code className="ident__codigo">{item.nome}</code>
                <span>{item.valor}</span>
              </div>
            ))}
            <p className="ident__nota-raio">
              Portal: raio 0 na estrutura (faixas, seções, cabeçalho, mosaico) e 4px no que é foto
              ou alvo de toque. Foto de ambiente com canto vivo em tamanho de card parece recorte de
              tela; 4px diz &quot;foto&quot; sem virar bolha.
            </p>
          </div>
          <div className="ident__lista">
            <h3 className="ident__h3">Breakpoints</h3>
            {BREAKPOINTS.map((item) => (
              <div className="ident__par ident__par--breakpoint" key={item.nome}>
                <code className="ident__codigo">{item.nome}</code>
                <span>{item.valor}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="s4"
        className="ident__secao ident__secao--20"
        data-screen-label="04 Tipos de imóvel"
      >
        <h2 className="ident__h2">4. Cor por tipo de imóvel</h2>
        <p className="ident__texto ident__texto--72">
          Substitui a cor por nicho do OpaPreço. Aparece como quadrado de 10px antes do tipo, filete
          de 4px no menu, bloco no mosaico da home e faixa no topo da página de busca. Nunca como
          fundo de card nem em texto corrido, e sempre ao lado do nome. Paleta e grade vêm da
          identidade Oficina Conectada: bloco de cor cheia com grade branca de 1px a 14–16%, e fundo
          branco com a mesma grade no tom do acento a 8%. Textos em caixa normal, nunca em caixa
          alta.
        </p>
        <div className="ident__tipos">
          {TIPOS.map((amostra) => (
            <div className="ident__tipo" key={amostra.tipo}>
              <BlocoGrade cor={amostra.tipo} grade="tile" linha="forte" className="ident__bloco">
                <span className="ident__bloco-nome">{TIPO_IMOVEL[amostra.tipo].nome}</span>
                <span className="ident__bloco-exemplo">{amostra.exemplo}</span>
              </BlocoGrade>
              <div className="ident__tipo-legenda">
                <span className="ident__tipo-nome">
                  <span
                    className="ident__quadrado"
                    style={{ background: TIPO_IMOVEL[amostra.tipo].cor }}
                  />
                  {TIPO_IMOVEL[amostra.tipo].nome}
                </span>
                <code className="ident__mono">
                  {amostra.fundo} / {amostra.texto}
                </code>
                <span>{amostra.contraste}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="ident__rodape-secao">As contagens no mosaico são fictícias.</p>
      </section>

      <section id="s6" className="ident__secao ident__secao--28" data-screen-label="06 Componentes">
        <h2 className="ident__h2">5. Componente de amostra</h2>
        <div className="ident__lista ident__lista--14">
          <div className="ident__cabecalho-amostra">
            <h3 className="ident__h3-amostra">ImovelCard · portal</h3>
            <span className="ident__nota-amostra">
              Variantes: aluguel, venda, os dois. Valores fictícios. Fotos em cover, sem endereço.
            </span>
          </div>
          <div className="ident__cards">
            {CARDS_DE_AMOSTRA.map((imovel) => (
              <ImovelCard key={imovel.slug} imovel={imovel} variante="amostra" />
            ))}
          </div>
          <div className="ident__anatomia">
            Anatomia: foto 4:3 com raio 4 e contador de fotos · quadrado do tipo + tipo · bairro ·
            valor em acento (aluguel: total mensal; venda: preço) · linha de apoio com os valores
            separados · atributos · imobiliária com CRECI. O card inteiro é o link; sem botão
            &quot;Contatar&quot; repetido em cada card.
          </div>
        </div>
      </section>

      <section id="s7" className="ident__decisoes" data-screen-label="07 Decisões">
        <h2 className="ident__h2 ident__h2--sem-filete">Decisões para aprovar</h2>
        <ol className="ident__decisoes-lista">
          <li>
            <b>Acento:</b> verde-quintal #037A4B (A), terracota (B) ou azul-petróleo (C).
          </li>
          <li>
            <b>Segundo fundo do portal:</b> #F4F4F2 neutro no lugar do #F4F2EF quente. Como a foto
            do imóvel ocupa o quadro inteiro, esse fundo só aparece em faixas e enquanto a foto
            carrega; o tom quente puxaria o verde para o oliva.
          </li>
          <li>
            <b>Raio:</b> 0 na estrutura do portal, 4px em foto, card, botão e campo.
          </li>
          <li>
            <b>Tipos de imóvel:</b> sete tipos com a paleta Oficina Conectada. Terreno e lançamento
            ficam fora porque estão fora do escopo.
          </li>
          <li>
            <b>Grade:</b> 48px no desktop, 40px no celular, 34px nos blocos do mosaico. Blocos
            coloridos no hero e na faixa &quot;Para imobiliárias&quot;; o resto do fundo é branco
            com grade clara.
          </li>
        </ol>
      </section>

      <section id="s8" className="ident__secao ident__secao--28">
        <h2 className="ident__h2">6. Estados dos componentes</h2>
        <p className="ident__texto ident__texto--72">
          Cada componente base com as formas que as telas usam, montado com os componentes do
          portal. Largura de 390 para ver as formas do celular. Valores fictícios.
        </p>

        <Quadro rotulo="SiteHeader · consumidor, item ativo Alugar, busca de apartamento">
          <SiteHeader cor="apartamento" ativo="/alugar" />
        </Quadro>
        <Quadro rotulo="SiteHeader · B2B, item ativo Para imobiliárias">
          <SiteHeader variante="b2b" ativo="/para-imobiliarias" />
        </Quadro>
        <Quadro rotulo="SiteHeader · só logo com Anunciar imóvel (indisponível, vitrine) e só logo (404)">
          <SiteHeader variante="logo" comAcao />
          <SiteHeader variante="logo" />
        </Quadro>

        <Quadro rotulo="FaixaTipo com a trilha dentro · busca com anúncios">
          <FaixaTipo
            tipo="apartamento"
            trilhos={[
              { rotulo: 'Aluguel', href: '#s8' },
              { rotulo: 'Goiânia', href: '#s8' },
              { rotulo: 'Setor Bueno', href: '#s8' },
              { rotulo: 'Apartamento', href: '#s8' },
              { rotulo: '2 quartos' },
            ]}
            titulo="48 apartamentos de 2 quartos para alugar no Setor Bueno, Goiânia, GO"
            links={[
              { rotulo: 'Ver 31 à venda no Setor Bueno', href: '#s8' },
              { rotulo: 'Todos os apartamentos em Goiânia', href: '#s8' },
            ]}
          />
        </Quadro>

        <Quadro rotulo="FiltrosLaterais, ChipsFiltro, Ordenacao, ImovelCard na lista e Paginacao">
          <div className="ident__busca">
            <FiltrosDeExemplo tamanho="desktop" />
            <div className="ident__resultados">
              <div className="ident__barra-resultados">
                <ChipsDeFiltro
                  chips={[
                    { rotulo: 'Apartamento', hrefRemover: '#s8' },
                    { rotulo: '2 quartos', hrefRemover: '#s8' },
                    { rotulo: 'Até R$ 3.000', hrefRemover: '#s8' },
                  ]}
                  hrefLimpar="#s8"
                />
                <Ordenacao valor="RECENT" />
              </div>
              <div className="ident__grade-3">
                <ImovelCard imovel={CARD_ALUGUEL} variante="lista" />
                <ImovelCard imovel={{ ...CARD_VENDA, fotos: 0 }} variante="lista" />
                <ImovelCard imovel={CARD_AMBOS} variante="lista" />
              </div>
              <Paginacao pagina={1} totalPaginas={3} caminhoBase="/dev/componentes" />
            </div>
          </div>
        </Quadro>

        <Quadro rotulo="ImovelCard · poucos (sem contador e sem linha de apoio) e parecido (só o bairro, 19px)">
          <div className="ident__grade-4">
            <ImovelCard imovel={CARD_AMBOS} variante="poucos" />
            <ImovelCard imovel={CARD_ALUGUEL} variante="parecido" />
            <ImovelCard imovel={CARD_VENDA} variante="parecido" />
            <ImovelCard imovel={CARD_AMBOS} variante="parecido" />
          </div>
        </Quadro>

        <Quadro rotulo="Celular · barra de filtros presa ao topo e gaveta de filtros" largura={390}>
          <BarraFiltrosCelular
            aplicados={3}
            aoAbrirFiltros={() => {
              setGaveta(true);
            }}
            ordenacao={<Ordenacao valor="RECENT" tamanho="celular" />}
          />
          <Gaveta
            aberta={gaveta}
            titulo="Filtros"
            aoFechar={() => {
              setGaveta(false);
            }}
            acaoDoTopo={
              <a className="gaveta__limpar" href="#s8">
                Limpar
              </a>
            }
            rodape={
              <Botao
                altura={52}
                larguraTotal
                onClick={() => {
                  setGaveta(false);
                }}
              >
                Ver 48 imóveis
              </Botao>
            }
          >
            <FiltrosDeExemplo tamanho="celular" />
          </Gaveta>
        </Quadro>

        <Quadro rotulo="Segmentado · preenchido 40 (filtros), preenchido 44 (gaveta, alerta) e sublinhado">
          <div className="ident__linha">
            <div className="ident__caixa-260">
              <Segmentado
                rotulo="Finalidade"
                altura={40}
                valor="aluguel"
                opcoes={[
                  { valor: 'aluguel', rotulo: 'Alugar' },
                  { valor: 'venda', rotulo: 'Comprar' },
                ]}
              />
            </div>
            <div className="ident__caixa-260">
              <Segmentado
                rotulo="Finalidade"
                valor="aluguel"
                opcoes={[
                  { valor: 'aluguel', rotulo: 'Alugar' },
                  { valor: 'venda', rotulo: 'Comprar' },
                ]}
              />
            </div>
            <div className="ident__caixa-260">
              <Segmentado
                rotulo="Finalidade"
                forma="sublinhado"
                valor="aluguel"
                opcoes={[
                  { valor: 'aluguel', rotulo: 'Alugar' },
                  { valor: 'venda', rotulo: 'Comprar' },
                ]}
              />
            </div>
          </div>
        </Quadro>

        <Quadro rotulo="Chips · removível (busca), etiqueta (resumo do alerta) e sugestão (busca vazia)">
          <div className="ident__linha">
            <Chip aoRemover={() => undefined} rotuloRemover="Tirar o filtro de 2 quartos">
              2 quartos
            </Chip>
            <Chip>Goiânia · Setor Bueno</Chip>
            <a className="chip chip--sugestao" href="#s8">
              3 quartos à venda no Setor Bueno
            </a>
          </div>
        </Quadro>

        <Quadro rotulo="Botões · alturas 52, 50, 48, 46 e 40; verde, contorno, escuro, cinza, texto; enviando e indisponível">
          <div className="ident__linha">
            <Botao altura={52}>Buscar imóveis para alugar</Botao>
            <Botao altura={50}>Criar alerta</Botao>
            <Botao altura={48} variante="contorno">
              Criar alerta para este bairro
            </Botao>
            <Botao altura={46} variante="escuro">
              Cancelar alerta
            </Botao>
            <Botao altura={46} variante="cinza">
              Manter
            </Botao>
            <Botao altura={40}>Começar</Botao>
            <Botao variante="texto">Limpar tudo</Botao>
          </div>
          <div className="ident__linha">
            <div className="ident__caixa-340">
              <Botao altura={52} larguraTotal carregando>
                Enviando…
              </Botao>
            </div>
            <div className="ident__caixa-340">
              <Botao altura={52} larguraTotal disabled>
                Escolha uma cidade
              </Botao>
            </div>
            <BotaoLink href="#s8" variante="contorno" altura={48}>
              Link com cara de botão
            </BotaoLink>
          </div>
        </Quadro>

        <Quadro rotulo="Campo e consentimento · vazio, preenchido, erro, texto longo; consentimento normal e com erro">
          <div className="ident__formulario">
            <Campo id="c-nome" rotulo="Seu nome" placeholder="Seu nome" />
            <Campo id="c-preenchido" rotulo="Seu nome" defaultValue="Fernanda Souza" />
            <Campo
              id="c-telefone"
              rotulo="Telefone com DDD"
              defaultValue="(62) 9 88"
              erro="Informe o celular com DDD."
            />
            <Campo
              id="c-mensagem"
              rotulo="Mensagem"
              multilinha
              defaultValue="Olá, tenho interesse neste apartamento e gostaria de agendar uma visita."
            />
            <CheckboxLgpd id="c-lgpd" />
            <CheckboxLgpd id="c-lgpd-erro" erro="Marque a autorização para enviar." />
          </div>
        </Quadro>

        <Quadro rotulo="AlertaImovel · bloco cinza (busca), caixa (poucos anúncios e busca vazia) e modal">
          <div className="ident__alertas">
            <AlertaImovel
              purpose="RENT"
              city="goiania-go"
              neighborhood="setor-bueno"
              propertyType="APARTMENT"
              bedrooms={2}
              sobretitulo="Alerta de imóvel"
              titulo="Receba os novos apartamentos de 2 quartos no Setor Bueno."
            />
            <AlertaImovel
              purpose="RENT"
              city="goiania-go"
              neighborhood="setor-sul"
              forma="caixa"
              sobretitulo="Poucas opções agora"
              titulo="Avisamos quando aparecer uma kitnet no Setor Sul."
            />
            <AlertaImovel
              purpose="SALE"
              city="goiania-go"
              neighborhood="setor-bueno"
              bedrooms={4}
              forma="caixa"
              titulo="Criar alerta para esta busca"
            />
            <div className="ident__modal">
              <AlertaImovel
                purpose="RENT"
                city="goiania-go"
                neighborhood="setor-bueno"
                bedrooms={2}
                forma="modal"
                titulo="Avisamos quando aparecer um imóvel assim"
                chips={[
                  'Alugar',
                  'Goiânia · Setor Bueno',
                  'Apartamento',
                  '2 quartos',
                  'Até R$ 3.000',
                ]}
              />
            </div>
          </div>
        </Quadro>

        <Quadro rotulo="EstadoVazio · busca sem anúncio, com sugestões">
          <EstadoVazio
            titulo="Nenhum imóvel com esses filtros agora."
            sugestoes={[
              { rotulo: '3 quartos à venda no Setor Bueno', href: '#s8-1' },
              { rotulo: '4 quartos à venda no Setor Marista', href: '#s8-2' },
              { rotulo: 'Casas de 4 quartos em Goiânia', href: '#s8-3' },
              { rotulo: 'Todos à venda no Setor Bueno', href: '#s8-4' },
            ]}
          >
            Tente outro número de quartos ou veja os bairros ao lado. Você também pode criar um
            alerta e receber o próximo que for publicado.
          </EstadoVazio>
        </Quadro>

        <Quadro rotulo="Acordeão · FAQ calculado da busca">
          <Acordeao
            abertoInicial={0}
            itens={[
              {
                pergunta: 'Quanto custa alugar um apartamento de 2 quartos no Setor Bueno?',
                resposta:
                  'O valor total mediano é R$ 2.720 por mês, somando aluguel, condomínio e IPTU. Metade dos 48 anúncios ativos custa menos que isso.',
              },
              {
                pergunta: 'Por que o endereço não aparece?',
                resposta:
                  'O portal mostra bairro e cidade. O endereço exato você recebe no contato com a imobiliária.',
              },
            ]}
          />
        </Quadro>

        <Quadro rotulo="SiteFooter · desktop; no celular o bloco da marca vem primeiro e as colunas viram acordeão">
          <SiteFooter versao="30/09/2026" />
        </Quadro>
      </section>
    </main>
  );
}
