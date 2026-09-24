import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { CanaisIntegrados, HeroB2B } from '@/components/b2b';
import { buscarPlanos } from '@/lib/api';
import { metadataDaPagina } from '@/lib/seo';
import { urlCadastro } from '@/lib/plataforma';
import { BENEFICIOS_CANAIS, CANAIS } from '../b2b-conteudo';

/**
 * Anunciar (Onda 3): o caminho de quem já tem sistema e quer só a vitrine e os
 * leads. É o plano sem módulo de gestão — e é a API que diz qual é ele, pelos
 * módulos do plano, em vez de a página fixar um código.
 */

export const metadata: Metadata = metadataDaPagina({
  titulo: 'Anunciar imóveis no AchouImóvel',
  descricao:
    'Publique seus imóveis no AchouImóvel e nos portais parceiros e receba os contatos numa caixa de leads, sem trocar o sistema que você já usa.',
  caminho: '/anunciar',
  robots: 'index, follow',
});

export const revalidate = 300;

export default async function AnunciarPage() {
  const dados = await buscarPlanos().catch(() => ({ plans: [] }));
  // Plano sem módulo de gestão: o Anunciante da entrega de design.
  const anunciante = dados.plans.find((plano) => plano.modules.length === 0);

  return (
    <>
      <SiteHeader variante="b2b" />

      <main className="pagina pagina--b2b">
        <HeroB2B
          sobretitulo="Plano Anunciante"
          titulo="Anuncie no AchouImóvel e receba os contatos onde você já trabalha."
          texto="Seus imóveis aparecem no portal e nos portais parceiros, e todo contato chega numa caixa de leads com o imóvel e a origem. Você continua no sistema que já usa; quando quiser o resto, é só contratar."
          acaoPrincipal={{
            href: urlCadastro(anunciante?.code),
            rotulo: 'Começar a anunciar',
          }}
          acaoSecundaria={{ href: '/planos', rotulo: 'Comparar planos' }}
        />

        <CanaisIntegrados
          titulo="Um cadastro, quatro vitrines"
          texto="O mesmo imóvel vai para o AchouImóvel, o Canal Pro, a OLX e o Imovelweb. Quando ele é alugado ou vendido, sai de todos de uma vez — sem anúncio velho no ar."
          beneficios={BENEFICIOS_CANAIS}
          canais={CANAIS}
        />

        <section className="secao">
          <h2 className="secao__titulo">O que vem no plano Anunciante</h2>
          <ul className="lista-beneficios">
            <li>Página do imóvel com o valor total do mês, sem taxa escondida</li>
            <li>Sua vitrine em /imobiliaria, com CRECI à vista</li>
            <li>Caixa de leads com o imóvel, o canal de origem e o contato</li>
            <li>Alerta de imóvel: quem não achou hoje volta quando aparecer</li>
          </ul>
          <p className="nota">
            O sistema de gestão (CRM, locação e financeiro) não entra neste plano: ele aparece com
            cadeado e abre quando você contratar.
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
