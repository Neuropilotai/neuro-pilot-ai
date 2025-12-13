/**
 * Query Scoping Utility
 * 
 * Helper functions to automatically scope queries by orgId
 * Works with existing PostgreSQL pool pattern
 */

const { pool } = require('../../db');

/**
 * Add orgId filter to WHERE clause
 * @param {string} orgId - Organization ID
 * @param {object} where - Existing where clause
 * @returns {object} Where clause with orgId added
 */
function scopeWhere(orgId, where = {}) {
  return {
    ...where,
    org_id: orgId,
  };
}

/**
 * Validate that a result belongs to the specified org
 * @param {string} orgId - Expected organization ID
 * @param {object} result - Database result
 * @param {string} resourceName - Name of resource for error message
 */
function validateOrgAccess(orgId, result, resourceName = 'Resource') {
  if (!result) {
    return; // Not found is handled by caller
  }

  if (result.org_id !== orgId) {
    throw new Error(
      `${resourceName} does not belong to organization ${orgId}`
    );
  }
}

/**
 * Validate that all results belong to the specified org
 * @param {string} orgId - Expected organization ID
 * @param {Array} results - Database results
 * @param {string} resourceName - Name of resource for error message
 */
function validateOrgAccessMany(orgId, results, resourceName = 'Resources') {
  const invalid = results.filter((r) => r.org_id !== orgId);
  
  if (invalid.length > 0) {
    throw new Error(
      `${invalid.length} ${resourceName} do not belong to organization ${orgId}`
    );
  }

  return results;
}

/**
 * Execute a scoped query
 * Automatically adds org_id filter
 * @param {string} orgId - Organization ID
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
async function executeScopedQuery(orgId, query, params = []) {
  // Add org_id to WHERE clause if not already present
  let scopedQuery = query;
  const scopedParams = [...params];
  
  if (query.toUpperCase().includes('WHERE')) {
    scopedQuery = query.replace(/WHERE/i, `WHERE org_id = $${scopedParams.length + 1} AND`);
    scopedParams.push(orgId);
  } else {
    // Find insertion point (before ORDER BY, GROUP BY, LIMIT, or end)
    const match = query.match(/(ORDER BY|GROUP BY|LIMIT|$)/i);
    if (match) {
      const index = match.index;
      scopedQuery = query.slice(0, index) + ` WHERE org_id = $${scopedParams.length + 1} ` + query.slice(index);
      scopedParams.push(orgId);
    }
  }
  
  const result = await pool.query(scopedQuery, scopedParams);
  return result.rows;
}

module.exports = {
  scopeWhere,
  validateOrgAccess,
  validateOrgAccessMany,
  executeScopedQuery,
};

