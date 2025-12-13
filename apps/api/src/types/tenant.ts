/**
 * Tenant Type Definitions
 * 
 * TypeScript types for tenant/organization context
 */

import { Organization } from '@prisma/client';

/**
 * Tenant context attached to requests
 */
export interface TenantContext {
  orgId: string;
  organization: {
    id: string;
    name: string;
    subdomain: string | null;
    isActive: boolean;
  };
}

/**
 * Request with tenant context
 */
export interface TenantRequest {
  orgId?: string;
  tenant?: TenantContext;
  headers: {
    'x-org-id'?: string;
    'x-api-key'?: string;
    host?: string;
  };
  hostname?: string;
}

/**
 * Organization creation input
 */
export interface CreateOrganizationInput {
  name: string;
  subdomain?: string;
  apiKey?: string;
  isActive?: boolean;
}

/**
 * Organization update input
 */
export interface UpdateOrganizationInput {
  name?: string;
  subdomain?: string;
  apiKey?: string;
  isActive?: boolean;
}

/**
 * Tenant resolution result
 */
export type TenantResolutionResult = TenantContext | null;

/**
 * Tenant resolution method
 */
export type TenantResolutionMethod = 'header' | 'subdomain' | 'apikey' | 'default';

