import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { CanaisIntegrados, DoisCaminhos, FluxoSistema, HeroB2B } from '@/components/b2b';
import { buscarPlanos } from '@/lib/api';
import { metadataDaPagina } from '@/lib/seo';
import { urlCadastro } from '@/lib/plataforma';
import { BENEFICIOS_CANAIS, CANAIS, FLUXO } from '../b2b-conteudo';

/**
 * Página de conversão B2B (Onda 3). Fala com a imobiliária, não com quem
 * procura imóvel: por isso o cabeçalho na variante `b2b` e todo botão levando ao
 * cadastro no painel, que é outro host (ADR-100).
 *
 * Lê os planos só para saber **quais existem** — os valores ficam em `/planos`.
 */

export const metadata: Metadata = metadataDaPagina({
  titulo: 'Sistema para imobiliária: portal, CRM, locação e vendas',
  descricao:
    'Publique no AchouImóvel, no Canal Pro, na OLX e no Imovelweb de uma vez, receba os leads no mesmo CRM e leve do atendimento ao contrato, à vistoria e ao repasse.',
  caminho: '/para-imobiliarias',
  robots: 'index, follow',
});

/**
 * A lista de planos muda pouco e não vale uma renderização por visita; o valor
 * é revalidado a cada cinco minutos.
 */
export const revalidate = 300;

export default async function ParaImobiliariasPage() {
  const dados = await buscarPlanos().catch(() => ({ plans: [] }));
  const anunciante = dados.plans.find((plano) => plano.modules.length === 0);

  return (
    <>
      <SiteHeader variante="b2b" />

      <main className="pagina pagina--b2b">
        <HeroB2B
          sobretitulo="AchouImóvel Gestão"
          titulo="Gerencie seus aluguéis e suas vendas e receba leads no mesmo lugar."
          texto="Publique no portal AchouImóvel e o contato de quem se interessou entra no seu CRM, com o imóvel e a origem. Do atendimento no WhatsApp ao contrato, à vistoria e ao repasse, tudo fica no mesmo sistema."
          acaoPrincipal={{ href: urlCadastro(), rotulo: 'Começar' }}
          acaoSecundaria={{ href: '/planos', rotulo: 'Ver planos' }}
        />

        <CanaisIntegrados
          titulo="Cadastre uma vez. Publique em todos os portais."
          texto="O imóvel sai do AchouImóvel Gestão direto para o Canal Pro, a OLX e o Imovelweb, além do portal AchouImóvel. Preço, fotos e descrição ficam sincronizados. Quando o imóvel é alugado ou vendido, sai de todos os canais de uma vez."
          beneficios={BENEFICIOS_CANAIS}
          canais={CANAIS}
        />

        <FluxoSistema titulo="Do anúncio ao repasse" passos={FLUXO} />

        <DoisCaminhos
          caminhos={[
            {
              chapeu: 'Já usa outro sistema',
              titulo: 'Anunciante',
              texto:
                'Anúncios no portal e caixa de leads. Você continua no seu sistema atual e recebe os contatos aqui.',
              link: {
                href: anunciante === undefined ? '/anunciar' : `/anunciar?plano=${anunciante.code}`,
                rotulo: 'Conhecer o plano Anunciante',
              },
            },
            {
              chapeu: 'Quer tudo num lugar só',
              titulo: 'Gestão Locação e Gestão Vendas',
              texto:
                'O sistema completo, com o portal incluído. Contrate as duas frentes juntas ou só a que você usa.',
              link: { href: '/gestao', rotulo: 'Ver o sistema por módulo' },
            },
          ]}
        />
      </main>

      <SiteFooter />
    </>
  );
}
