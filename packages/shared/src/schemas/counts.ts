/**
 * Count Sheet Validation Schemas
 * 
 * Zod schemas for count sheet-related requests
 */

import { z } from 'zod';

// Create count sheet schema
export const createCountSheetSchema = z.object({
  scheduledFor: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

// Add count line schema
export const addCountLineSchema = z.object({
  itemId: z.string().min(1),
  locationId: z.string().min(1),
  lotId: z.string().optional(),
  countedQty: z.number(),
  countedUom: z.string().max(20).optional().default('ea'),
  notes: z.string().max(500).optional(),
});

// Count sheet params
export const countSheetParamsSchema = z.object({
  id: z.string().min(1),
});

