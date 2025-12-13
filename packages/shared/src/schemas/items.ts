/**
 * Item Validation Schemas
 * 
 * Zod schemas for item-related requests
 */

import { z } from 'zod';

// Item creation schema
export const createItemSchema = z.object({
  itemNumber: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  nameEn: z.string().max(255).optional(),
  nameFr: z.string().max(255).optional(),
  category: z.string().max(100).optional(),
  canonicalUom: z.string().max(20).optional().default('g'),
  isPerishable: z.boolean().optional().default(false),
  requiresLot: z.boolean().optional().default(false),
  parLevel: z.number().positive().optional(),
});

// Item update schema
export const updateItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  nameEn: z.string().max(255).optional(),
  nameFr: z.string().max(255).optional(),
  category: z.string().max(100).optional(),
  canonicalUom: z.string().max(20).optional(),
  isPerishable: z.boolean().optional(),
  requiresLot: z.boolean().optional(),
  parLevel: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});

// Item query parameters
export const itemQuerySchema = z.object({
  category: z.string().optional(),
  isActive: z.string().regex(/^(true|false)$/).optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

// Item params (for GET /api/items/:id)
export const itemParamsSchema = z.object({
  id: z.string().min(1),
});

