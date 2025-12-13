/**
 * Location Validation Schemas
 * 
 * Zod schemas for location-related requests
 */

import { z } from 'zod';

// Location creation schema
export const createLocationSchema = z.object({
  name: z.string().min(1).max(255),
  site: z.string().max(100).optional().default('Main'),
  kind: z.enum(['FREEZER', 'COOLER', 'DRY']),
  sortOrder: z.number().int().optional().default(0),
});

// Location query parameters
export const locationQuerySchema = z.object({
  kind: z.enum(['FREEZER', 'COOLER', 'DRY']).optional(),
  site: z.string().optional(),
  isActive: z.string().regex(/^(true|false)$/).optional(),
});

// Location params
export const locationParamsSchema = z.object({
  id: z.string().min(1),
});

