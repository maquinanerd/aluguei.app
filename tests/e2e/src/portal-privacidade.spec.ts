import { expect, test } from '@playwright/test';
import { api, PORTAL, registerViaApi, uniq } from './g2-b1-support';
import { VALID_CPFS, seedParty, seedPublishedListing } from './g2-b2-support';

/**
 * Critério 4 do prompt de fidelidade às telas (ADR-105): o HTML que o portal entrega — inclusive o
 * payload do React Server Components embutido na página — não traz rua, número, complemento, CEP,
 * proprietário nem `storage_key`. A API já tem essa garantia nos testes de integração
 * (`public-portal.test.ts`, `public-search.test.ts`); este teste olha o que o navegador recebe,
 * que é onde um campo a mais num componente do portal vazaria.
 *
 * Coordenada não entra pela API de endereço (vem de geocodificação, desligada na stack de E2E), e
 * por isso fica coberta só pela integração.
 */

// Valores que não aparecem por acaso numa página (um número solto poderia estar num hash).
const PRIVADO = {
  street: 'Rua Sigilosa Ponto Dois',
  number: 'SIGILO-0911',
  complement: 'Bloco Reservado 42B',
  zipCode: 'CEP-SIGILO-74987',
};

test('o HTML do portal não carrega endereço privado, proprietário nem storage_key', async ({
  request,
}) => {
  test.setTimeout(400_000);
  const { cookie } = await registerViaApi('privacidade');
  const id = uniq();
  const titulo = `Apartamento Privacidade ${id}`;

  const imovel = await api<{ property: { id: string } }>('POST', '/properties', {
    cookie,
    json: { title: titulo, propertyType: 'APARTMENT' },
  });
  expect(imovel.status).toBe(201);
  const propertyId = imovel.body.property.id;
  const termos = await api('PUT', `/properties/${propertyId}/financial-terms`, {
    cookie,
    json: { monthlyRentCents: 250_000, minimumLeaseMonths: 12 },
  });
  expect(termos.status).toBe(200);
  const endereco = await api('PUT', `/properties/${propertyId}/address`, {
    cookie,
    json: {
      privateAddress: { ...PRIVADO, neighborhood: 'Setor Bueno', city: 'Goiânia', state: 'GO' },
      publicAddress: { neighborhood: 'Setor Bueno', city: 'Goiânia', state: 'GO' },
    },
  });
  expect(endereco.status).toBe(200);

  const nomeDoDono = `Proprietária Sigilosa ${id}`;
  const cpf = VALID_CPFS[1];
  const donoId = await seedParty(cookie, nomeDoDono, cpf);
  const dono = await api('POST', `/properties/${propertyId}/owners`, {
    cookie,
    json: { partyId: donoId, ownershipSharePct: 100 },
  });
  expect(dono.status).toBe(201);

  const listingId = await seedPublishedListing(cookie, propertyId, titulo);
  const detalhe = await api<{ listing: { slug: string } }>('GET', `/listings/${listingId}`, {
    cookie,
  });
  expect(detalhe.status).toBe(200);
  const slug = detalhe.body.listing.slug;

  const proibidos = [
    PRIVADO.street,
    PRIVADO.number,
    PRIVADO.complement,
    PRIVADO.zipCode,
    nomeDoDono,
    cpf,
    'storage_key',
    'storageKey',
  ];

  const anuncio = await request.get(`${PORTAL}/imovel/${slug}`, { timeout: 240_000 });
  expect(anuncio.status(), 'a página do anúncio abre').toBe(200);
  const htmlDoAnuncio = await anuncio.text();
  // O anúncio mostra o bairro e a cidade: o teste confere que olhou a página certa.
  expect(htmlDoAnuncio).toContain('Setor Bueno');
  const vitrine = /href="(\/imobiliaria\/[^"]+)"/.exec(htmlDoAnuncio)?.[1];

  const paginas = [
    `/imovel/${slug}`,
    '/alugar/goiania-go',
    '/alugar/goiania-go/setor-bueno',
    '/',
    '/mapa-do-site',
    '/sitemap.xml',
    ...(vitrine === undefined ? [] : [vitrine]),
  ];
  for (const caminho of paginas) {
    const res = await request.get(`${PORTAL}${caminho}`, { timeout: 240_000 });
    expect(res.status(), `${caminho} responde`).toBeLessThan(500);
    const html = await res.text();
    const vazados = proibidos.filter((valor) => html.includes(valor));
    expect(vazados, `${caminho} não pode trazer dado privado`).toEqual([]);
  }
});
