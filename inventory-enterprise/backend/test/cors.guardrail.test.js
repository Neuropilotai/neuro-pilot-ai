/**
 * CORS Security Guardrail Test
 *
 * Purpose: Ensure wildcard CORS never returns to production
 * This test MUST pass before any deployment is approved
 */

const { execSync } = require('child_process');

describe('CORS Security Guardrails', () => {
  const backend = process.env.BACKEND_URL || 'https://resourceful-achievement-production.up.railway.app';

  test('No wildcard Access-Control-Allow-Origin in production', () => {
    try {
      const out = execSync(
        `curl -sI -H "Origin: https://evil.example" ${backend}/api/health`,
        { encoding: 'utf8', timeout: 10000 }
      );

      // Check for wildcard ACAO header
      const hasWildcard = /^access-control-allow-origin:\s*\*/im.test(out);

      if (hasWildcard) {
        console.error('❌ CRITICAL SECURITY VIOLATION: Wildcard CORS detected!');
        console.error('Response headers:', out);
      }

      expect(hasWildcard).toBe(false);
    } catch (error) {
      // If curl fails, that's also a problem
      throw new Error(`Health endpoint unreachable: ${error.message}`);
    }
  });

  test('CORS blocks unauthorized origins', () => {
    try {
      const out = execSync(
        `curl -sI -H "Origin: https://evil.example" ${backend}/api/health`,
        { encoding: 'utf8', timeout: 10000 }
      );

      // Evil origin should NOT receive an ACAO header reflecting their origin
      const hasEvilOrigin = /^access-control-allow-origin:\s*https:\/\/evil\.example/im.test(out);

      expect(hasEvilOrigin).toBe(false);
    } catch (error) {
      throw new Error(`CORS test failed: ${error.message}`);
    }
  });

  test('CORS allows legitimate Vercel origin', () => {
    const legitimateOrigin = 'https://neuropilot-inventory.vercel.app';

    try {
      const out = execSync(
        `curl -sI -H "Origin: ${legitimateOrigin}" ${backend}/api/health`,
        { encoding: 'utf8', timeout: 10000 }
      );

      // Should have ACAO header with the legitimate origin
      const hasLegitOrigin = new RegExp(
        `^access-control-allow-origin:\\s*${legitimateOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'im'
      ).test(out);

      if (!hasLegitOrigin) {
        console.error('❌ Legitimate origin not allowed!');
        console.error('Response headers:', out);
      }

      expect(hasLegitOrigin).toBe(true);
    } catch (error) {
      throw new Error(`Legitimate origin test failed: ${error.message}`);
    }
  });

  test('Healthcheck endpoint returns 200', () => {
    try {
      const statusCode = execSync(
        `curl -s -o /dev/null -w "%{http_code}" ${backend}/api/health`,
        { encoding: 'utf8', timeout: 10000 }
      ).trim();

      expect(statusCode).toBe('200');
    } catch (error) {
      throw new Error(`Healthcheck failed: ${error.message}`);
    }
  });
});
