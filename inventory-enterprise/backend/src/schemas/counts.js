/**
 * Count Sheet Validation Schemas
 * 
 * Zod schemas for count sheet-related requests
 */

const { z } = require('zod');

// Create count sheet schema
const createCountSheetSchema = z.object({
  scheduledFor: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

// Add count line schema
const addCountLineSchema = z.object({
  itemId: z.string().min(1),
  locationId: z.string().min(1),
  lotId: z.string().optional(),
  countedQty: z.number(),
  countedUom: z.string().max(20).optional().default('ea'),
  notes: z.string().max(500).optional(),
});

// Count sheet params
const countSheetParamsSchema = z.object({
  id: z.string().min(1),
});

module.exports = {
  createCountSheetSchema,
  addCountLineSchema,
  countSheetParamsSchema,
};

