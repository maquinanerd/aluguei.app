import { z } from 'zod';

/**
 * Vocabulários do VRSync usados pelo AchouImóvel (ADR-107), conforme a documentação oficial do
 * Grupo OLX (developers.grupozap.com, conferida em 01/10/2026). Ficam num arquivo próprio porque o
 * contrato de canais e o do Grupo OLX usam os mesmos — e o CHECK do banco compara com estas listas.
 */

/** Portais em que o feed aparece, conforme o contrato que a imobiliária declara. */
export const grupoOlxDestinationSchema = z.enum(['ZAP', 'VIVAREAL', 'OLX']);

/** `PublicationType` do VRSync: o destaque contratado no Grupo OLX, não o destaque do AchouImóvel. */
export const grupoOlxPublicationTierSchema = z.enum([
  'STANDARD',
  'PREMIUM',
  'SUPER_PREMIUM',
  'PREMIERE_1',
  'PREMIERE_2',
  'TRIPLE',
]);

/** `PropertyType` do VRSync: os 24 valores da tabela de tipos da documentação. */
export const grupoOlxPropertyTypeSchema = z.enum([
  'Residential / Apartment',
  'Residential / Home',
  'Residential / Condo',
  'Residential / Village House',
  'Residential / Farm Ranch',
  'Residential / Penthouse',
  'Residential / Flat',
  'Residential / Kitnet',
  'Residential / Studio',
  'Residential / Loft',
  'Residential / Sobrado',
  'Residential / Agricultural',
  'Residential / Land Lot',
  'Commercial / Consultorio',
  'Commercial / Edificio Residencial',
  'Commercial / Industrial',
  'Commercial / Building',
  'Commercial / Garage',
  'Commercial / Hotel',
  'Commercial / Business',
  'Commercial / Corporate Floor',
  'Commercial / Land Lot',
  'Commercial / Office',
  'Commercial / Edificio Comercial',
]);

/** `displayAddress` do VRSync: o que o portal mostra. O endereço completo vai sempre. */
export const grupoOlxDisplayAddressSchema = z.enum(['Neighborhood', 'Street', 'All']);
