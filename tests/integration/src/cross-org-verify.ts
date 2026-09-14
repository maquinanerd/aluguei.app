import { sql } from 'drizzle-orm';
import type { AppDb } from '@aluguei/db';

/**
 * Verificação de integridade multi-tenant (P0-05): lista toda linha cuja
 * referência aponta para uma entidade de OUTRA organização. Esperado: vazio.
 * Também documentada em docs/audits/2026-09-10/G1_EXECUTION_REPORT.md.
 */
export const CROSS_ORG_VERIFY_SQL = `
WITH v(relation, row_id) AS (
  SELECT 'leads.party_id', c.id::text FROM leads c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'lead_property_interests.lead_id', c.id::text FROM lead_property_interests c JOIN leads r ON r.id = c.lead_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'lead_property_interests.property_id', c.id::text FROM lead_property_interests c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'visits.lead_id', c.id::text FROM visits c JOIN leads r ON r.id = c.lead_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'visits.party_id', c.id::text FROM visits c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'visits.property_id', c.id::text FROM visits c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'proposals.lead_id', c.id::text FROM proposals c JOIN leads r ON r.id = c.lead_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'proposals.party_id', c.id::text FROM proposals c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'proposals.property_id', c.id::text FROM proposals c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'rental_applications.lead_id', c.id::text FROM rental_applications c JOIN leads r ON r.id = c.lead_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'rental_applications.party_id', c.id::text FROM rental_applications c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'rental_applications.property_id', c.id::text FROM rental_applications c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'rental_applications.proposal_id', c.id::text FROM rental_applications c JOIN proposals r ON r.id = c.proposal_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'inspections.property_id', c.id::text FROM inspections c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'inspection_observations.room_id', c.id::text FROM inspection_observations c JOIN inspection_rooms r ON r.id = c.room_id WHERE r.org_id <> c.org_id OR r.inspection_id <> c.inspection_id
  UNION ALL SELECT 'inspection_observations.media_id', c.id::text FROM inspection_observations c JOIN inspection_media r ON r.id = c.media_id WHERE r.org_id <> c.org_id OR r.inspection_id <> c.inspection_id
  UNION ALL SELECT 'meta_ad_profiles.connection_id', c.id::text FROM meta_ad_profiles c JOIN meta_connections r ON r.id = c.connection_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'meta_ad_profiles.page_asset_id', c.id::text FROM meta_ad_profiles c JOIN meta_assets r ON r.id = c.page_asset_id WHERE r.org_id <> c.org_id OR r.connection_id <> c.connection_id
  UNION ALL SELECT 'meta_ad_profiles.instagram_asset_id', c.id::text FROM meta_ad_profiles c JOIN meta_assets r ON r.id = c.instagram_asset_id WHERE r.org_id <> c.org_id OR r.connection_id <> c.connection_id
  UNION ALL SELECT 'meta_ad_profiles.property_id', c.id::text FROM meta_ad_profiles c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'meta_ad_profiles.listing_id', c.id::text FROM meta_ad_profiles c JOIN listings r ON r.id = c.listing_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'tasks.assignee_user_id (nao-membro)', c.id::text FROM tasks c
    WHERE c.assignee_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = c.org_id AND m.user_id = c.assignee_user_id)
  UNION ALL SELECT 'tasks.related_entity_id', c.id::text FROM tasks c JOIN LATERAL (
      SELECT org_id FROM leads WHERE c.related_entity_type = 'LEAD' AND id::text = c.related_entity_id
      UNION ALL SELECT org_id FROM parties WHERE c.related_entity_type = 'PARTY' AND id::text = c.related_entity_id
      UNION ALL SELECT org_id FROM proposals WHERE c.related_entity_type = 'PROPOSAL' AND id::text = c.related_entity_id
      UNION ALL SELECT org_id FROM visits WHERE c.related_entity_type = 'VISIT' AND id::text = c.related_entity_id
      UNION ALL SELECT org_id FROM properties WHERE c.related_entity_type = 'PROPERTY' AND id::text = c.related_entity_id
    ) r ON true WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'timeline_events.entity_id', c.id::text FROM timeline_events c JOIN LATERAL (
      SELECT org_id FROM leads WHERE c.entity_type = 'LEAD' AND id::text = c.entity_id
      UNION ALL SELECT org_id FROM parties WHERE c.entity_type = 'PARTY' AND id::text = c.entity_id
      UNION ALL SELECT org_id FROM proposals WHERE c.entity_type = 'PROPOSAL' AND id::text = c.entity_id
      UNION ALL SELECT org_id FROM visits WHERE c.entity_type = 'VISIT' AND id::text = c.entity_id
      UNION ALL SELECT org_id FROM tasks WHERE c.entity_type = 'TASK' AND id::text = c.entity_id
    ) r ON true WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'meta_ad_profiles.media_selection[]', c.id::text FROM meta_ad_profiles c
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.media_selection) = 'array' THEN c.media_selection ELSE '[]'::jsonb END) e(val)
    JOIN property_media r ON r.id::text = e.val WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'meta_creative_links.media_refs[]', c.id::text FROM meta_creative_links c
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.media_refs) = 'array' THEN c.media_refs ELSE '[]'::jsonb END) e(val)
    JOIN property_media r ON r.id::text = e.val WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'meta_sync_jobs.payload.mediaRefs[]', c.id::text FROM meta_sync_jobs c
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.payload -> 'mediaRefs') = 'array' THEN c.payload -> 'mediaRefs' ELSE '[]'::jsonb END) e(val)
    JOIN property_media r ON r.id::text = e.val WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'party_consents.party_id', c.id::text FROM party_consents c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'screening_requests.party_id', c.id::text FROM screening_requests c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'screening_requests.consent_id', c.id::text FROM screening_requests c JOIN party_consents r ON r.id = c.consent_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'contracts.application_id', c.id::text FROM contracts c JOIN rental_applications r ON r.id = c.application_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'contracts.template_id', c.id::text FROM contracts c JOIN contract_templates r ON r.id = c.template_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'contract_parties.party_id', c.id::text FROM contract_parties c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'leases.tenant_party_id', c.id::text FROM leases c JOIN parties r ON r.id = c.tenant_party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'leases.landlord_party_id', c.id::text FROM leases c JOIN parties r ON r.id = c.landlord_party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'leases.property_id', c.id::text FROM leases c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'split_rules.landlord_party_id', c.id::text FROM split_rules c JOIN parties r ON r.id = c.landlord_party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'listings.property_id', c.id::text FROM listings c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'property_owners.party_id', c.id::text FROM property_owners c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'property_owners.property_id', c.id::text FROM property_owners c JOIN properties r ON r.id = c.property_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'portal_access.party_id', c.id::text FROM portal_access c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
  UNION ALL SELECT 'party_bank_accounts.party_id', c.id::text FROM party_bank_accounts c JOIN parties r ON r.id = c.party_id WHERE r.org_id <> c.org_id
)
SELECT relation, count(*)::int AS violations, min(row_id) AS sample_row_id
FROM v GROUP BY relation ORDER BY relation`;

export interface CrossOrgViolation {
  relation: string;
  violations: number;
  sample_row_id: string;
}

export async function findCrossOrgReferences(db: AppDb): Promise<CrossOrgViolation[]> {
  const result = await db.execute(sql.raw(CROSS_ORG_VERIFY_SQL));
  return result.rows as unknown as CrossOrgViolation[];
}
