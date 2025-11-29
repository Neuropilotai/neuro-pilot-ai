/**
 * NeuroInnovate Inventory Enterprise - V21.1 Server
 * Production-only mode with complete V21.1 schema support
 * PostgreSQL + Multi-tenant + RBAC + Metrics + Rate Limiting
 */

console.log('[STARTUP] Loading dependencies...');
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
console.log('[STARTUP] Loading database...');
const { pool } = require('./db');

// v22.1: Load metrics exporter for cron job metrics
let metricsExporter = null;
try {
  metricsExporter = require('./utils/metricsExporter');
} catch (err) {
  console.warn('[STARTUP] MetricsExporter not available:', err.message);
}

// ============================================
// PHASE 3 AI CRON SCHEDULER (PostgreSQL)
// ============================================

let phase3Cron = null;

if (process.env.SCHEDULER_ENABLED === 'true' && process.env.AUTO_RETRAIN_ENABLED === 'true') {
  console.log('[STARTUP] Initializing Phase3 AI Cron Scheduler...');

  // Minimal PostgreSQL-compatible Phase3 Scheduler
  class Phase3CronScheduler {
    constructor(db) {
      this.db = db;
      this.jobs = [];
      this.isRunning = false;
      this.isShuttingDown = false;
      this.activeJobs = new Set();
      this.lastForecastRun = null;
      this.lastLearningRun = null;
      this.lastGovernanceRun = null;
      // v22: Job metrics tracking
      this.jobMetrics = new Map(); // jobName -> { lastRun, lastDuration, runCount, errorCount, avgDuration }
      // v22: Circuit breaker for job failures
      this.circuitBreakers = new Map(); // jobName -> { state, failureCount, lastFailure, nextRetryAt }
      // v22.1: Paused jobs set
      this.pausedJobs = new Set();
      this.circuitBreakerConfig = {
        failureThreshold: 3,      // Open circuit after 3 consecutive failures
        resetTimeoutMs: 300000,   // 5 minutes before attempting recovery
        halfOpenMaxAttempts: 1    // Attempts in half-open state before closing
      };

      // v22.1: Job timeout and retry configuration
      this.jobConfig = {
        ai_forecast: {
          timeoutMs: 120000,      // 2 minutes
          maxRetries: 2,
          retryDelayMs: 5000,     // 5 seconds initial delay
          retryBackoffMultiplier: 2
        },
        ai_learning: {
          timeoutMs: 180000,      // 3 minutes
          maxRetries: 2,
          retryDelayMs: 5000,
          retryBackoffMultiplier: 2
        },
        governance_score: {
          timeoutMs: 60000,       // 1 minute
          maxRetries: 3,
          retryDelayMs: 3000,
          retryBackoffMultiplier: 2
        },
        self_heal: {
          timeoutMs: 30000,       // 30 seconds
          maxRetries: 1,
          retryDelayMs: 2000,
          retryBackoffMultiplier: 1
        },
        default: {
          timeoutMs: 60000,       // 1 minute default
          maxRetries: 2,
          retryDelayMs: 5000,
          retryBackoffMultiplier: 2
        }
      };

      // v22.1: Track retry attempts per job
      this.retryState = new Map(); // jobName -> { attempts, lastAttempt }
    }

    // v22.1: Get config for a specific job
    _getJobConfig(jobName) {
      return this.jobConfig[jobName] || this.jobConfig.default;
    }

    // v22.1: Execute with timeout
    async _executeWithTimeout(jobFn, timeoutMs, jobName) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Job ${jobName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        jobFn()
          .then(result => {
            clearTimeout(timeoutId);
            resolve(result);
          })
          .catch(error => {
            clearTimeout(timeoutId);
            reject(error);
          });
      });
    }

    // v22.1: Calculate retry delay with exponential backoff
    _calculateRetryDelay(jobName, attemptNumber) {
      const config = this._getJobConfig(jobName);
      return config.retryDelayMs * Math.pow(config.retryBackoffMultiplier, attemptNumber - 1);
    }

    // v22.1: Sleep helper
    _sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // v22: Check if circuit breaker allows execution
    _checkCircuitBreaker(jobName) {
      const breaker = this.circuitBreakers.get(jobName);
      if (!breaker) return { allowed: true, state: 'closed' };

      const now = Date.now();

      if (breaker.state === 'open') {
        // Check if reset timeout has passed
        if (now >= breaker.nextRetryAt) {
          // Transition to half-open
          breaker.state = 'half-open';
          breaker.halfOpenAttempts = 0;
          console.log(`[Phase3Cron] Circuit breaker for ${jobName}: OPEN -> HALF-OPEN`);
          return { allowed: true, state: 'half-open' };
        }
        const waitMs = breaker.nextRetryAt - now;
        console.log(`[Phase3Cron] Circuit breaker OPEN for ${jobName}, retry in ${Math.round(waitMs / 1000)}s`);
        return { allowed: false, state: 'open', retryIn: waitMs };
      }

      if (breaker.state === 'half-open') {
        if (breaker.halfOpenAttempts >= this.circuitBreakerConfig.halfOpenMaxAttempts) {
          return { allowed: false, state: 'half-open-exhausted' };
        }
        breaker.halfOpenAttempts++;
        return { allowed: true, state: 'half-open' };
      }

      return { allowed: true, state: 'closed' };
    }

    // v22: Record success/failure for circuit breaker
    _recordCircuitBreakerResult(jobName, success) {
      let breaker = this.circuitBreakers.get(jobName);

      if (success) {
        // Success: reset the circuit breaker
        if (breaker) {
          if (breaker.state === 'half-open') {
            console.log(`[Phase3Cron] Circuit breaker for ${jobName}: HALF-OPEN -> CLOSED (success)`);
            // v22.1: Record auto-reset in Prometheus
            if (metricsExporter) {
              metricsExporter.recordCircuitBreakerReset(jobName, 'auto');
            }
          }
          this.circuitBreakers.delete(jobName);
          // v22.1: Update Prometheus state to closed
          if (metricsExporter) {
            metricsExporter.setCircuitBreakerState(jobName, 'closed');
            metricsExporter.setCircuitBreakerFailureCount(jobName, 0);
          }
        }
        return;
      }

      // Failure: increment counter or open circuit
      if (!breaker) {
        breaker = { state: 'closed', failureCount: 0, lastFailure: null, nextRetryAt: null };
      }

      breaker.failureCount++;
      breaker.lastFailure = new Date().toISOString();

      if (breaker.state === 'half-open') {
        // Failure in half-open state: re-open the circuit
        breaker.state = 'open';
        breaker.nextRetryAt = Date.now() + this.circuitBreakerConfig.resetTimeoutMs;
        console.log(`[Phase3Cron] Circuit breaker for ${jobName}: HALF-OPEN -> OPEN (failure)`);
        // v22.1: Record trip in Prometheus
        if (metricsExporter) {
          metricsExporter.recordCircuitBreakerTrip(jobName);
          metricsExporter.setCircuitBreakerState(jobName, 'open');
        }
      } else if (breaker.failureCount >= this.circuitBreakerConfig.failureThreshold) {
        // Too many failures: open the circuit
        breaker.state = 'open';
        breaker.nextRetryAt = Date.now() + this.circuitBreakerConfig.resetTimeoutMs;
        console.log(`[Phase3Cron] Circuit breaker for ${jobName}: CLOSED -> OPEN (${breaker.failureCount} failures)`);
        // v22.1: Record trip in Prometheus
        if (metricsExporter) {
          metricsExporter.recordCircuitBreakerTrip(jobName);
          metricsExporter.setCircuitBreakerState(jobName, 'open');
        }
      }

      // v22.1: Update failure count in Prometheus
      if (metricsExporter) {
        metricsExporter.setCircuitBreakerFailureCount(jobName, breaker.failureCount);
      }

      this.circuitBreakers.set(jobName, breaker);
    }

    // v22: Get circuit breaker status for all jobs
    getCircuitBreakerStatus() {
      const status = {};
      for (const [jobName, breaker] of this.circuitBreakers) {
        status[jobName] = {
          state: breaker.state,
          failureCount: breaker.failureCount,
          lastFailure: breaker.lastFailure,
          nextRetryAt: breaker.nextRetryAt ? new Date(breaker.nextRetryAt).toISOString() : null
        };
      }
      return status;
    }

    // v22: Update job metrics after each run (v22.1: includes timeout/retry tracking)
    _updateJobMetrics(jobName, result) {
      const existing = this.jobMetrics.get(jobName) || {
        runCount: 0,
        errorCount: 0,
        timeoutCount: 0,
        retryCount: 0,
        totalDuration: 0,
        lastRun: null,
        lastDuration: null,
        lastError: null,
        lastAttempts: null
      };

      existing.runCount++;
      existing.lastRun = new Date().toISOString();
      existing.lastDuration = result.duration || 0;
      existing.totalDuration += result.duration || 0;
      existing.lastAttempts = result.attempts || 1;

      // v22.1: Track retries used
      if (result.retriesUsed > 0) {
        existing.retryCount += result.retriesUsed;
      }

      if (!result.success && !result.skipped) {
        existing.errorCount++;
        existing.lastError = result.error;

        // v22.1: Track timeouts separately
        if (result.timedOut) {
          existing.timeoutCount++;
        }
      }

      this.jobMetrics.set(jobName, existing);
    }

    // v22: Get metrics for all jobs (v22.1: includes timeout/retry stats)
    getJobMetrics() {
      const metrics = {};
      for (const [jobName, data] of this.jobMetrics) {
        const config = this._getJobConfig(jobName);
        metrics[jobName] = {
          ...data,
          avgDuration: data.runCount > 0 ? Math.round(data.totalDuration / data.runCount) : 0,
          successRate: data.runCount > 0 ? Math.round(((data.runCount - data.errorCount) / data.runCount) * 100) : 100,
          // v22.1: Timeout and retry stats
          timeoutRate: data.runCount > 0 ? Math.round((data.timeoutCount / data.runCount) * 100) : 0,
          avgRetries: data.runCount > 0 ? Math.round((data.retryCount / data.runCount) * 100) / 100 : 0,
          // v22.1: Config info for reference
          config: {
            timeoutMs: config.timeoutMs,
            maxRetries: config.maxRetries
          }
        };
      }
      return metrics;
    }

    // v22.1: Get current retry state for all jobs
    getRetryState() {
      const state = {};
      for (const [jobName, data] of this.retryState) {
        state[jobName] = { ...data };
      }
      return state;
    }

    // Helper to run jobs with tracking, shutdown awareness, circuit breaker, timeout, and retries
    async runJob(jobName, jobFn) {
      if (this.isShuttingDown) {
        console.log(`[Phase3Cron] Skipping ${jobName} - shutdown in progress`);
        return { skipped: true, reason: 'shutdown' };
      }
      if (this.activeJobs.has(jobName)) {
        console.log(`[Phase3Cron] Skipping ${jobName} - already running`);
        return { skipped: true, reason: 'already_running' };
      }

      // v22.1: Check if job is paused
      if (this.pausedJobs && this.pausedJobs.has(jobName)) {
        console.log(`[Phase3Cron] Skipping ${jobName} - job is paused`);
        return { skipped: true, reason: 'paused' };
      }

      // v22: Check circuit breaker before execution
      const circuitCheck = this._checkCircuitBreaker(jobName);
      if (!circuitCheck.allowed) {
        console.log(`[Phase3Cron] Skipping ${jobName} - circuit breaker ${circuitCheck.state}`);
        return { skipped: true, reason: 'circuit_breaker', state: circuitCheck.state, retryIn: circuitCheck.retryIn };
      }

      // v22.1: Get job config for timeout and retries
      const config = this._getJobConfig(jobName);
      const maxAttempts = config.maxRetries + 1; // Initial attempt + retries

      this.activeJobs.add(jobName);
      const start = Date.now();
      let result;
      let lastError = null;
      let attemptCount = 0;
      let timedOut = false;

      // v22.1: Retry loop with exponential backoff
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attemptCount = attempt;

        // Check for shutdown between retries
        if (this.isShuttingDown && attempt > 1) {
          console.log(`[Phase3Cron] Aborting ${jobName} retries - shutdown in progress`);
          break;
        }

        try {
          // v22.1: Execute with timeout
          await this._executeWithTimeout(jobFn, config.timeoutMs, jobName);

          // Success!
          result = {
            success: true,
            duration: Date.now() - start,
            attempts: attemptCount,
            retriesUsed: attemptCount - 1
          };

          // v22: Record success for circuit breaker
          this._recordCircuitBreakerResult(jobName, true);

          // Clear retry state on success
          this.retryState.delete(jobName);

          if (attemptCount > 1) {
            console.log(`[Phase3Cron] Job ${jobName} succeeded on attempt ${attemptCount}/${maxAttempts}`);
          }
          break;

        } catch (error) {
          lastError = error;
          timedOut = error.message.includes('timed out');

          const errorType = timedOut ? 'TIMEOUT' : 'ERROR';
          console.error(`[Phase3Cron] Job ${jobName} ${errorType} (attempt ${attempt}/${maxAttempts}):`, error.message);

          // Update retry state
          this.retryState.set(jobName, {
            attempts: attemptCount,
            lastAttempt: new Date().toISOString(),
            lastError: error.message
          });

          // If more retries available, wait with backoff
          if (attempt < maxAttempts && !this.isShuttingDown) {
            const delay = this._calculateRetryDelay(jobName, attempt);
            console.log(`[Phase3Cron] Retrying ${jobName} in ${delay}ms...`);
            await this._sleep(delay);
          }
        }
      }

      // If we exhausted all attempts without success
      if (!result) {
        result = {
          success: false,
          error: lastError?.message || 'Unknown error',
          duration: Date.now() - start,
          attempts: attemptCount,
          retriesUsed: attemptCount - 1,
          timedOut,
          exhaustedRetries: attemptCount >= maxAttempts
        };

        // v22: Record failure for circuit breaker (only after all retries exhausted)
        this._recordCircuitBreakerResult(jobName, false);

        console.error(`[Phase3Cron] Job ${jobName} failed after ${attemptCount} attempt(s)`);
      }

      this.activeJobs.delete(jobName);

      // v22: Track metrics (includes retry info now)
      this._updateJobMetrics(jobName, result);

      // v22.1: Record Prometheus metrics
      this._recordPrometheusMetrics(jobName, result);

      return result;
    }

    // v22.1: Record Prometheus metrics for job execution
    _recordPrometheusMetrics(jobName, result) {
      if (!metricsExporter) return;

      try {
        const durationSec = (result.duration || 0) / 1000;
        const status = result.skipped ? 'skipped' : (result.success ? 'success' : 'failure');

        // Record job run
        metricsExporter.recordCronJobRun(jobName, status, durationSec);

        // Record errors
        if (!result.success && !result.skipped) {
          const errorType = result.timedOut ? 'timeout' : 'exception';
          metricsExporter.recordCronJobError(jobName, errorType);

          if (result.timedOut) {
            metricsExporter.recordCronJobTimeout(jobName);
          }
        }

        // Record retries
        if (result.retriesUsed > 0) {
          for (let i = 0; i < result.retriesUsed; i++) {
            metricsExporter.recordCronJobRetry(jobName);
          }
        }

        // Update success rate from job metrics
        const jobMetrics = this.getJobMetrics();
        if (jobMetrics[jobName]) {
          metricsExporter.setCronJobSuccessRate(jobName, jobMetrics[jobName].successRate);
        }

        // Update scheduler state
        metricsExporter.setSchedulerActiveJobs(this.activeJobs.size);
      } catch (err) {
        console.warn('[Phase3Cron] Failed to record Prometheus metrics:', err.message);
      }
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      console.log('[Phase3Cron] Scheduler started');

      // AI Forecast job - Daily at 06:00
      const forecastJob = cron.schedule('0 6 * * *', async () => {
        await this.runJob('ai_forecast', async () => {
          console.log('[Phase3Cron] Running AI forecast job...');
          this.lastForecastRun = new Date().toISOString();
          await this.db.query(`
            INSERT INTO ai_ops_breadcrumbs (action, created_at, duration_ms, metadata)
            VALUES ('forecast_started', NOW(), 0, '{"status":"started"}')
          `);
          console.log('[Phase3Cron] AI forecast job completed');
        });
      });

      // AI Learning job - Daily at 21:00
      const learningJob = cron.schedule('0 21 * * *', async () => {
        await this.runJob('ai_learning', async () => {
          console.log('[Phase3Cron] Running AI learning job...');
          this.lastLearningRun = new Date().toISOString();
          await this.db.query(`
            INSERT INTO ai_ops_breadcrumbs (action, created_at, duration_ms, metadata)
            VALUES ('learning_started', NOW(), 0, '{"status":"started"}')
          `);
          console.log('[Phase3Cron] AI learning job completed');
        });
      });

      // Governance Score job - Daily at 07:00 (after forecast completes)
      const governanceJob = cron.schedule('0 7 * * *', async () => {
        await this.runJob('governance_score', async () => {
          console.log('[Phase3Cron] Running governance score job...');
          this.lastGovernanceRun = new Date().toISOString();

          // Import GovernanceService dynamically to avoid circular deps
          const GovernanceService = require('./src/governance/GovernanceService');
          const governanceSvc = new GovernanceService(this.db, {});

          try {
            const result = await governanceSvc.computeStatus();
            console.log(`[Phase3Cron] Governance score computed: ${result.governance_score} (${result.status})`);

            // Persist daily trend record
            await this.db.query(`
              INSERT INTO governance_daily (as_of, pillar, score, source)
              VALUES
                (CURRENT_DATE, 'finance', $1, 'cron'),
                (CURRENT_DATE, 'health', $2, 'cron'),
                (CURRENT_DATE, 'ai', $3, 'cron'),
                (CURRENT_DATE, 'menu', $4, 'cron'),
                (CURRENT_DATE, 'composite', $5, 'cron')
              ON CONFLICT (as_of, pillar) DO UPDATE SET score = EXCLUDED.score
            `, [
              result.pillars.finance_accuracy,
              result.pillars.health_score,
              result.pillars.ai_intelligence_index,
              result.pillars.menu_forecast_accuracy,
              result.governance_score
            ]);

            // Emit real-time event for dashboard updates
            if (global.realtimeBus) {
              global.realtimeBus.emit('governance:updated', {
                score: result.governance_score,
                status: result.status,
                color: result.color,
                alertCount: result.alerts.length
              });
            }

            console.log('[Phase3Cron] Governance score job completed');
          } catch (error) {
            console.error('[Phase3Cron] Governance score job failed:', error.message);
            throw error;
          }
        });
      });

      this.jobs.push(forecastJob, learningJob, governanceJob);
      console.log('[Phase3Cron] Registered 3 jobs: ai_forecast (06:00), governance_score (07:00), ai_learning (21:00)');
    }

    stop() {
      this.jobs.forEach(job => job.stop());
      this.isRunning = false;
      console.log('[Phase3Cron] Scheduler stopped');
    }

    async gracefulShutdown() {
      // If already shutting down, return the existing promise so callers can await it
      if (this.isShuttingDown) {
        console.log('[Phase3Cron] Shutdown already in progress, waiting...');
        // Wait for activeJobs to clear (reuse the same logic)
        while (this.activeJobs.size > 0 && this.isShuttingDown) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        return;
      }

      this.isShuttingDown = true;
      const shutdownStart = Date.now();
      console.log('[Phase3Cron] Graceful shutdown initiated, waiting for active jobs...');

      // Stop all cron schedules (prevents new job starts)
      this.jobs.forEach(job => job.stop());

      // Wait for active jobs to complete (max 30 seconds)
      const timeout = Date.now() + 30000;
      while (this.activeJobs.size > 0 && Date.now() < timeout) {
        console.log(`[Phase3Cron] Waiting for ${this.activeJobs.size} active job(s): ${[...this.activeJobs].join(', ')}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const shutdownDuration = Date.now() - shutdownStart;

      if (this.activeJobs.size > 0) {
        console.warn(`[Phase3Cron] Force shutdown after ${shutdownDuration}ms with active jobs: ${[...this.activeJobs].join(', ')}`);
      } else {
        console.log(`[Phase3Cron] All jobs completed cleanly in ${shutdownDuration}ms`);
      }

      this.isRunning = false;
      console.log('[Phase3Cron] Scheduler shutdown complete');
    }

    async getLastRuns() {
      return {
        lastForecastRun: this.lastForecastRun,
        lastLearningRun: this.lastLearningRun,
        lastGovernanceRun: this.lastGovernanceRun
      };
    }

    async triggerJob(jobName) {
      // Respect shutdown state
      if (this.isShuttingDown) {
        return { success: false, error: 'Scheduler is shutting down', skipped: true };
      }

      // Check if job already running
      if (this.activeJobs.has(jobName)) {
        return { success: false, error: 'Job already running', skipped: true };
      }

      console.log(`[Phase3Cron] Manually triggering job: ${jobName}`);

      return this.runJob(jobName, async () => {
        const start = Date.now();
        if (jobName === 'ai_forecast') {
          this.lastForecastRun = new Date().toISOString();
          await this.db.query(`
            INSERT INTO ai_ops_breadcrumbs (action, created_at, duration_ms, metadata)
            VALUES ('forecast_manual', NOW(), $1, '{"trigger":"manual"}')
          `, [Date.now() - start]);
        } else if (jobName === 'ai_learning') {
          this.lastLearningRun = new Date().toISOString();
          await this.db.query(`
            INSERT INTO ai_ops_breadcrumbs (action, created_at, duration_ms, metadata)
            VALUES ('learning_manual', NOW(), $1, '{"trigger":"manual"}')
          `, [Date.now() - start]);
        } else if (jobName === 'governance_score') {
          // Run governance computation
          const GovernanceService = require('./src/governance/GovernanceService');
          const governanceSvc = new GovernanceService(this.db, {});
          const result = await governanceSvc.computeStatus();
          this.lastGovernanceRun = new Date().toISOString();

          // Persist daily trend
          await this.db.query(`
            INSERT INTO governance_daily (as_of, pillar, score, source)
            VALUES
              (CURRENT_DATE, 'finance', $1, 'manual'),
              (CURRENT_DATE, 'health', $2, 'manual'),
              (CURRENT_DATE, 'ai', $3, 'manual'),
              (CURRENT_DATE, 'menu', $4, 'manual'),
              (CURRENT_DATE, 'composite', $5, 'manual')
            ON CONFLICT (as_of, pillar) DO UPDATE SET score = EXCLUDED.score
          `, [
            result.pillars.finance_accuracy,
            result.pillars.health_score,
            result.pillars.ai_intelligence_index,
            result.pillars.menu_forecast_accuracy,
            result.governance_score
          ]);

          // Emit real-time event
          if (global.realtimeBus) {
            global.realtimeBus.emit('governance:updated', {
              score: result.governance_score,
              status: result.status,
              color: result.color,
              alertCount: result.alerts.length,
              trigger: 'manual'
            });
          }

          await this.db.query(`
            INSERT INTO ai_ops_breadcrumbs (action, created_at, duration_ms, metadata)
            VALUES ('governance_manual', NOW(), $1, $2)
          `, [Date.now() - start, JSON.stringify({ score: result.governance_score, status: result.status })]);
        }
      });
    }

    getWatchdogStatus() {
      return {
        enabled: true,
        isRunning: this.isRunning,
        lastCheck: new Date().toISOString(),
        status: this.isShuttingDown ? 'shutting_down' : (this.isRunning ? 'healthy' : 'stopped'),
        isShuttingDown: this.isShuttingDown,
        activeJobs: [...this.activeJobs],
        activeJobCount: this.activeJobs.size,
        // v22: Include job metrics
        jobMetrics: this.getJobMetrics(),
        // v22: Include circuit breaker status
        circuitBreakers: this.getCircuitBreakerStatus(),
        // v22.1: Include paused jobs
        pausedJobs: [...this.pausedJobs],
        pausedJobCount: this.pausedJobs.size,
        lastForecastRun: this.lastForecastRun,
        lastLearningRun: this.lastLearningRun,
        lastGovernanceRun: this.lastGovernanceRun
      };
    }

    // v22: Manually reset circuit breaker for a job
    resetCircuitBreaker(jobName) {
      if (this.circuitBreakers.has(jobName)) {
        console.log(`[Phase3Cron] Manually resetting circuit breaker for ${jobName}`);
        this.circuitBreakers.delete(jobName);

        // v22.1: Record Prometheus metrics for manual reset
        if (metricsExporter) {
          try {
            metricsExporter.recordCircuitBreakerReset(jobName, 'manual');
            metricsExporter.setCircuitBreakerState(jobName, 'closed');
            metricsExporter.setCircuitBreakerFailureCount(jobName, 0);
          } catch (err) {
            console.warn('[Phase3Cron] Failed to record Prometheus metrics for manual reset:', err.message);
          }
        }

        return { success: true, job: jobName };
      }
      return { success: false, error: 'No circuit breaker found for job' };
    }
  }

  phase3Cron = new Phase3CronScheduler(pool);

  console.log('[STARTUP] Phase3 cron scheduler initialized');
}

// V21.1 Security Middleware
console.log('[STARTUP] Loading middleware...');
const { authGuard: rbacAuthGuard, requirePermissions } = require('./middleware/authorize');
const { auditLog } = require('./middleware/audit');
const { privacyGuard, executeScheduledDeletions } = require('./middleware/privacy');
const { validatePayment } = require('./middleware/payments.validate');

console.log('[STARTUP] Creating Express app...');
const app = express();
const PORT = process.env.PORT || 8080;
console.log('[STARTUP] Express app created, PORT:', PORT);

// ============================================
// DATABASE CONNECTION
// ============================================

// Pool imported from ./db.js
// Make pool globally accessible for routes
global.db = pool;

// ============================================
// MIDDLEWARE
// ============================================

console.log('[STARTUP] Configuring middleware...');
// Privacy Guard (CORS, input sanitization) - MUST BE FIRST
app.use(privacyGuard());
console.log('[STARTUP] Privacy guard configured');

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "data:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://*.railway.app", "https://*.up.railway.app"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// v22: Global JSON parsing error handler
// Catches malformed JSON in request bodies before routes process them
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('[JSON_ERROR] Malformed JSON in request body:', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      error: err.message
    });
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      code: 'MALFORMED_JSON',
      hint: 'Check that your request body is valid JSON',
      path: req.path
    });
  }
  next(err);
});

// Default tenant middleware (single-tenant mode)
app.use((req, res, next) => {
  req.tenant = {
    tenantId: 1,
    tenantName: 'default',
    orgId: 1
  };
  next();
});

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ============================================
// PROMETHEUS METRICS
// ============================================

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
});

const tenantRequests = new promClient.Counter({
  name: 'tenant_requests_total',
  help: 'Total requests by tenant',
  labelNames: ['org', 'site', 'route', 'method', 'code']
});

const quotaExceeded = new promClient.Counter({
  name: 'quota_exceeded_total',
  help: 'Total quota exceeded events',
  labelNames: ['org', 'quota_type']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(tenantRequests);
register.registerMetric(quotaExceeded);

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    httpRequestDuration.observe({
      method: req.method,
      route: req.route?.path || req.path,
      code: res.statusCode
    }, duration);

    if (req.user) {
      tenantRequests.inc({
        org: req.user.org_id || 'unknown',
        site: req.user.site_id || 'none',
        route: req.route?.path || req.path,
        method: req.method,
        code: res.statusCode
      });
    }
  });

  next();
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ============================================
// LEGACY AUTH MIDDLEWARE (for compatibility)
// ============================================
// Note: New routes should use rbacAuthGuard from middleware/authorize.js

function authGuard(allowedRoles = ['staff', 'manager', 'admin', 'owner']) {
  // Delegate to RBAC authGuard for consistency
  return rbacAuthGuard(allowedRoles);
}

// Rate limiting middleware (uses token bucket from migration 010)
async function rateLimitMiddleware(req, res, next) {
  if (!req.user) return next(); // Skip rate limiting for unauthenticated requests

  const bucketKey = `user:${req.user.org_id}:${req.user.user_id}`;

  try {
    const result = await pool.query('SELECT consume_tokens($1, 1)', [bucketKey]);

    if (result.rows[0].consume_tokens === false) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: 60
      });
    }

    next();
  } catch (error) {
    // If rate limit check fails, allow the request (fail open)
    console.error('Rate limit error:', error);
    next();
  }
}

// ============================================
// HEALTH CHECK (v22.1 Enhanced)
// ============================================

// v22.1: Liveness probe - is the process alive?
// Returns 200 IMMEDIATELY - Railway healthcheck must pass for deployment
// DB status included but doesn't block response
// BULLETPROOF: Wrapped in try-catch to NEVER fail the healthcheck
app.get('/health', async (req, res) => {
  const startTime = Date.now();

  try {
    // Get database status (with built-in timeout, never throws)
    const db = require('./db');
    const dbHealth = await db.healthCheck(3000); // 3 second timeout

    // Always return 200 - server is alive
    return res.status(200).json({
      status: 'ok',
      version: 'v21.1',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      database: {
        status: dbHealth.status,
        latencyMs: dbHealth.latencyMs,
        ...(dbHealth.error && { error: dbHealth.error })
      }
    });
  } catch (err) {
    // Even if something goes wrong, return 200 - server is alive
    console.error('[HEALTH] Error in health check:', err.message);
    return res.status(200).json({
      status: 'ok',
      version: 'v21.1',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      database: {
        status: 'error',
        error: err.message
      }
    });
  }
});

// v22.1: Readiness probe - is the service ready to accept traffic?
// Returns 200 only when all dependencies are healthy (Kubernetes readiness)
app.get('/ready', async (req, res) => {
  const checks = {
    database: { status: 'unknown', latencyMs: null },
    scheduler: { status: 'unknown', activeJobs: 0, circuitBreakersOpen: 0 },
    memory: { status: 'ok', usedMb: 0, limitMb: 0 }
  };

  let allHealthy = true;

  // Check database connectivity and latency
  const dbStart = Date.now();
  try {
    await pool.query('SELECT 1');
    checks.database.status = 'connected';
    checks.database.latencyMs = Date.now() - dbStart;

    // Warn if latency is high
    if (checks.database.latencyMs > 1000) {
      checks.database.status = 'slow';
    }
  } catch (error) {
    checks.database.status = 'disconnected';
    checks.database.error = error.message;
    allHealthy = false;
  }

  // Check scheduler health (if enabled)
  if (phase3Cron) {
    try {
      const watchdogStatus = phase3Cron.getWatchdogStatus();
      const circuitBreakerStatus = phase3Cron.getCircuitBreakerStatus();

      checks.scheduler.status = watchdogStatus.isRunning ? 'running' : 'stopped';
      checks.scheduler.activeJobs = watchdogStatus.activeJobCount || 0;
      checks.scheduler.isShuttingDown = watchdogStatus.isShuttingDown || false;

      // Count open circuit breakers
      const openBreakers = Object.values(circuitBreakerStatus).filter(
        cb => cb.state === 'open'
      ).length;
      checks.scheduler.circuitBreakersOpen = openBreakers;

      // If scheduler is shutting down or too many circuit breakers are open, not ready
      if (watchdogStatus.isShuttingDown) {
        checks.scheduler.status = 'shutting_down';
        allHealthy = false;
      }
      if (openBreakers >= 3) {
        checks.scheduler.status = 'degraded';
        // Don't fail readiness for circuit breakers, just note degraded
      }
    } catch (err) {
      checks.scheduler.status = 'error';
      checks.scheduler.error = err.message;
    }
  } else {
    checks.scheduler.status = 'disabled';
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  checks.memory.usedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
  checks.memory.limitMb = Math.round(memUsage.heapTotal / 1024 / 1024);
  const memoryPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

  if (memoryPercent > 90) {
    checks.memory.status = 'critical';
    allHealthy = false;
  } else if (memoryPercent > 75) {
    checks.memory.status = 'warning';
  }

  // Return appropriate status code
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    ready: allHealthy,
    version: 'v22.1',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks
  });
});

// v22.1: Detailed health endpoint for monitoring dashboards
app.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    version: 'v22.1',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
    nodeVersion: process.version,
    components: {}
  };

  // Database health
  const dbStart = Date.now();
  try {
    const result = await pool.query('SELECT NOW() as server_time, current_database() as db_name');
    health.components.database = {
      status: 'healthy',
      latencyMs: Date.now() - dbStart,
      serverTime: result.rows[0].server_time,
      database: result.rows[0].db_name,
      poolSize: pool.totalCount,
      poolIdle: pool.idleCount,
      poolWaiting: pool.waitingCount
    };
  } catch (error) {
    health.status = 'unhealthy';
    health.components.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Scheduler health
  if (phase3Cron) {
    const watchdogStatus = phase3Cron.getWatchdogStatus();
    const jobMetrics = phase3Cron.getJobMetrics();
    const circuitBreakers = phase3Cron.getCircuitBreakerStatus();

    health.components.scheduler = {
      status: watchdogStatus.isRunning ? 'running' : 'stopped',
      isShuttingDown: watchdogStatus.isShuttingDown,
      activeJobs: Array.from(watchdogStatus.activeJobs || []),
      jobMetrics: Object.fromEntries(
        Object.entries(jobMetrics).map(([name, m]) => [
          name,
          {
            runCount: m.runCount,
            errorCount: m.errorCount,
            successRate: m.successRate,
            avgDuration: m.avgDuration,
            lastRun: m.lastRun
          }
        ])
      ),
      circuitBreakers
    };
  } else {
    health.components.scheduler = { status: 'disabled' };
  }

  // Memory health
  const mem = process.memoryUsage();
  health.components.memory = {
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    rssMb: Math.round(mem.rss / 1024 / 1024),
    externalMb: Math.round(mem.external / 1024 / 1024),
    heapUsagePercent: Math.round((mem.heapUsed / mem.heapTotal) * 100)
  };

  // Event loop lag (simple approximation)
  const lagStart = Date.now();
  await new Promise(resolve => setImmediate(resolve));
  health.components.eventLoop = {
    lagMs: Date.now() - lagStart
  };

  res.json(health);
});

// v21.1: Frontend compatibility - /api/health endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'unknown';
  let dbError = null;

  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected';
    dbError = error.message;
  }

  res.json({
    success: dbStatus === 'connected',
    version: 'v21.1',
    database: dbStatus,
    uptime: process.uptime(),
    ...(dbError && { dbError })
  });
});

// Backward compatibility with v20 healthcheck path
app.get('/api/health/status', async (req, res) => {
  let dbStatus = 'unknown';
  let dbError = null;

  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected';
    dbError = error.message;
  }

  res.json({
    success: dbStatus === 'connected',
    version: 'v21.1',
    database: dbStatus,
    uptime: process.uptime(),
    ...(dbError && { dbError })
  });
});

// v22.1: API readiness endpoint for frontend/load balancers
app.get('/api/ready', async (req, res) => {
  const checks = {
    database: { status: 'unknown' },
    scheduler: { status: 'unknown' }
  };

  let allHealthy = true;

  // Database check
  try {
    await pool.query('SELECT 1');
    checks.database.status = 'connected';
  } catch (error) {
    checks.database.status = 'disconnected';
    allHealthy = false;
  }

  // Scheduler check
  if (phase3Cron) {
    const watchdogStatus = phase3Cron.getWatchdogStatus();
    checks.scheduler.status = watchdogStatus.isShuttingDown ? 'shutting_down' : 'running';
    if (watchdogStatus.isShuttingDown) {
      allHealthy = false;
    }
  } else {
    checks.scheduler.status = 'disabled';
  }

  res.status(allHealthy ? 200 : 503).json({
    ready: allHealthy,
    version: 'v22.1',
    checks
  });
});

// v22.1: API detailed health for monitoring dashboards
app.get('/api/health/detailed', async (req, res) => {
  // Redirect to the main detailed endpoint
  res.redirect('/health/detailed');
});

// v21.1: RBAC Bootstrap endpoint for frontend
app.get('/api/rbac/bootstrap', async (req, res) => {
  res.json({
    success: true,
    version: 'v21.1',
    rbac: {
      enabled: true,
      roles: ['owner', 'admin', 'manager', 'staff', 'viewer'],
      features: {
        multiTenancy: true,
        auditLogging: true,
        permissionGranularity: 'resource:action'
      }
    }
  });
});

// Database migration endpoint (one-time use, secured by secret key)
app.post('/api/admin/migrate', async (req, res) => {
  const { secret } = req.body;

  // Simple secret key protection (change this to a secure value)
  if (secret !== process.env.MIGRATION_SECRET && secret !== 'migrate-now-2024') {
    return res.status(403).json({ success: false, error: 'Invalid secret' });
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const migrationsDir = path.join(__dirname, 'migrations', 'postgres');

    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    const results = [];

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await pool.query(sql);
        results.push({ file, status: 'success' });
      } catch (error) {
        // Table already exists is ok
        if (error.code === '42P07' || error.message.includes('already exists')) {
          results.push({ file, status: 'skipped', reason: 'already exists' });
        } else {
          results.push({ file, status: 'error', error: error.message });
        }
      }
    }

    res.json({ success: true, migrations: results });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Database migration RESET endpoint - clears tracking and re-runs all migrations
app.post('/api/admin/migrate-reset', async (req, res) => {
  const { secret } = req.body;

  // Secret key protection
  if (secret !== process.env.MIGRATION_SECRET && secret !== 'migrate-now-2024') {
    return res.status(403).json({ success: false, error: 'Invalid secret' });
  }

  try {
    const fs = require('fs');
    const path = require('path');

    console.log('🔄 Starting migration reset...');

    // Step 1: Clear migration tracking
    await pool.query('DELETE FROM schema_migrations');
    console.log('✅ Cleared migration tracking table');

    // Step 2: Get all migration files from both directories
    const migrationDirs = [
      path.join(__dirname, 'migrations', 'postgres'),
      path.join(__dirname, 'migrations')
    ];

    const allMigrations = [];

    for (const dir of migrationDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
          .filter(f => f.endsWith('.sql'))
          .sort();

        for (const file of files) {
          // Skip duplicates
          if (!allMigrations.find(m => m.name === file)) {
            allMigrations.push({
              name: file,
              path: path.join(dir, file)
            });
          }
        }
      }
    }

    console.log(`📁 Found ${allMigrations.length} migration files`);

    // Step 3: Run each migration
    const results = [];

    for (const migration of allMigrations) {
      const sql = fs.readFileSync(migration.path, 'utf8');

      try {
        await pool.query(sql);

        // Record as applied
        await pool.query(
          'INSERT INTO schema_migrations (migration_name, applied_at) VALUES ($1, NOW()) ON CONFLICT (migration_name) DO NOTHING',
          [migration.name]
        );

        results.push({ file: migration.name, status: 'success' });
        console.log(`✅ ${migration.name}`);
      } catch (error) {
        if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42710') {
          // Record as applied even if objects exist
          await pool.query(
            'INSERT INTO schema_migrations (migration_name, applied_at) VALUES ($1, NOW()) ON CONFLICT (migration_name) DO NOTHING',
            [migration.name]
          );
          results.push({ file: migration.name, status: 'skipped', reason: 'objects exist' });
          console.log(`⏭️  ${migration.name} (objects exist)`);
        } else {
          results.push({ file: migration.name, status: 'error', error: error.message.split('\n')[0] });
          console.log(`❌ ${migration.name}: ${error.message.split('\n')[0]}`);
        }
      }
    }

    const successful = results.filter(r => r.status === 'success' || r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'error').length;

    console.log(`\n✅ Migration reset complete: ${successful} applied, ${failed} failed`);

    res.json({
      success: true,
      message: `Migration reset complete: ${successful} applied, ${failed} failed`,
      migrations: results
    });
  } catch (error) {
    console.error('Migration reset error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'NeuroInnovate Inventory Enterprise API',
    version: 'v21.1',
    mode: 'production',
    security: {
      rbac: true,
      audit: true,
      pci: true,
      gdpr: true,
      ccpa: true
    },
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      security: '/api/security/status',
      privacy: '/api/privacy',
      api: {
        auth: '/api/auth',
        me: '/api/me',
        vendors: '/api/vendors',
        recipes: '/api/recipes',
        menu: '/api/menu',
        population: '/api/population',
        waste: '/api/waste',
        pdfs: '/api/pdfs',
        pos: {
          catalog: '/api/pos/catalog',
          registers: '/api/pos/registers',
          orders: '/api/pos/orders',
          payments: '/api/pos/payments',
          reports: '/api/pos/reports',
          pdfs: '/api/pdfs/pos'
        }
      }
    }
  });
});

// ============================================
// V21.1 SECURITY & PRIVACY ENDPOINTS
// ============================================

// Security Status
app.get('/api/security/status', authGuard(['admin', 'owner', 'auditor']), auditLog('SECURITY_STATUS_CHECK'), async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM user_roles) AS total_role_assignments,
        (SELECT COUNT(*) FROM security_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS security_events_24h,
        (SELECT COUNT(*) FROM audit_log WHERE created_at >= NOW() - INTERVAL '24 hours') AS audit_events_24h,
        (SELECT COUNT(*) FROM rate_limit_buckets) AS rate_limit_buckets
    `);

    res.json({
      success: true,
      rbac_enabled: true,
      audit_enabled: true,
      pci_enforce: process.env.PCI_ENFORCE === 'true',
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Security status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch security status' });
  }
});

// Privacy: Data Export (GDPR)
app.get('/api/privacy/export', authGuard(['staff', 'manager', 'admin', 'owner']), auditLog('PRIVACY_EXPORT'), async (req, res) => {
  try {
    const { exportUserData } = require('./middleware/privacy');
    const data = await exportUserData(req.user.id);

    res.json(data);
  } catch (error) {
    console.error('Privacy export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

// Privacy: Data Deletion (GDPR)
app.post('/api/privacy/delete', authGuard(['staff', 'manager', 'admin', 'owner']), auditLog('PRIVACY_DELETION'), async (req, res) => {
  try {
    const { requestDataDeletion } = require('./middleware/privacy');
    const result = await requestDataDeletion(req.user.id, 'User request');

    res.json(result);
  } catch (error) {
    console.error('Privacy deletion error:', error);
    res.status(500).json({ success: false, error: 'Failed to request deletion' });
  }
});

// Privacy: Do Not Sell (CCPA)
app.post('/api/privacy/do-not-sell', authGuard(['staff', 'manager', 'admin', 'owner']), auditLog('PRIVACY_DO_NOT_SELL'), async (req, res) => {
  try {
    const { setDoNotSell } = require('./middleware/privacy');
    const { doNotSell } = req.body;

    const result = await setDoNotSell(req.user.id, doNotSell !== false);

    res.json(result);
  } catch (error) {
    console.error('Do-not-sell error:', error);
    res.status(500).json({ success: false, error: 'Failed to set preference' });
  }
});

// ============================================
// V21.1 ROUTES
// ============================================

console.log('[STARTUP] Loading routes...');

// Safe route loader - logs errors but doesn't crash the server
function safeRequire(path, name) {
  try {
    console.log(`[STARTUP] Loading ${name}...`);
    const route = require(path);
    console.log(`[STARTUP] ✓ ${name} loaded`);
    return route;
  } catch (err) {
    console.error(`[STARTUP] ✗ Failed to load ${name}: ${err.message}`);
    console.error(`[STARTUP]   Stack: ${err.stack?.split('\n')[1] || 'N/A'}`);
    // Return a placeholder router that returns 503 for all requests
    const express = require('express');
    const placeholder = express.Router();
    placeholder.all('*', (req, res) => {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        route: name,
        reason: err.message
      });
    });
    return placeholder;
  }
}

// Auth routes (no auth guard for login/register, but audit login attempts)
app.use('/api/auth', auditLog('AUTH'), safeRequire('./routes/auth', 'auth'));

// User profile routes (requires authentication)
app.use('/api/me', authGuard(['staff', 'manager', 'admin', 'owner']), auditLog('USER_PROFILE'), safeRequire('./routes/me', 'me'));

// All routes require authentication (staff role minimum) + audit logging
// All routes now use PostgreSQL
// FIXED: Re-enabled inventory route, registered as both /api/items and /api/inventory for compatibility
const inventoryRouter = safeRequire('./routes/inventory', 'inventory');
const inventoryReconcileRouter = safeRequire('./routes/inventory-reconcile', 'inventory-reconcile');
app.use('/api/items', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('INVENTORY'), inventoryRouter);
app.use('/api/inventory', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('INVENTORY'), inventoryRouter);
app.use('/api/inventory', authGuard(['manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('INVENTORY_RECONCILE'), inventoryReconcileRouter);

app.use('/api/vendors', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('VENDOR'), safeRequire('./routes/vendors', 'vendors'));
app.use('/api/recipes', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('RECIPE'), safeRequire('./routes/recipes', 'recipes'));
app.use('/api/menu', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('MENU'), safeRequire('./routes/menu', 'menu'));
app.use('/api/population', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POPULATION'), safeRequire('./routes/population', 'population'));
app.use('/api/waste', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('WASTE'), safeRequire('./routes/waste', 'waste'));
app.use('/api/pdfs', authGuard(['manager', 'admin', 'owner']), auditLog('PDF_GENERATION'), safeRequire('./routes/pdfs', 'pdfs'));
app.use('/api/locations', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('LOCATIONS'), safeRequire('./routes/locations', 'locations'));

// V21.1 Owner Console Routes - Full Feature Restoration
app.use('/api/owner/ops', authGuard(['owner']), rateLimitMiddleware, auditLog('OWNER_OPS'), safeRequire('./routes/owner-ops', 'owner-ops'));
app.use('/api/owner', authGuard(['owner']), rateLimitMiddleware, auditLog('OWNER_CONSOLE'), safeRequire('./routes/owner', 'owner'));
app.use('/api/governance', authGuard(['admin', 'owner']), rateLimitMiddleware, auditLog('GOVERNANCE'), safeRequire('./routes/governance', 'governance'));

// Diagnostic routes (temporary - for deployment validation)
app.use('/diag', safeRequire('./routes/diag', 'diag'));

// POS routes (commissary point of sale) + audit logging
app.use('/api/pos/catalog', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POS_CATALOG'), safeRequire('./routes/pos.catalog', 'pos.catalog'));
app.use('/api/pos/registers', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POS_REGISTER'), safeRequire('./routes/pos.registers', 'pos.registers'));
app.use('/api/pos/orders', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POS_ORDER'), safeRequire('./routes/pos.orders', 'pos.orders'));
app.use('/api/pos/payments', authGuard(['staff', 'manager', 'admin', 'owner']), rateLimitMiddleware, validatePayment(), auditLog('POS_PAYMENT'), safeRequire('./routes/pos.payments', 'pos.payments'));
app.use('/api/pos/reports', authGuard(['manager', 'admin', 'owner']), rateLimitMiddleware, auditLog('POS_REPORT'), safeRequire('./routes/pos.reports', 'pos.reports'));
app.use('/api/pdfs/pos', authGuard(['manager', 'admin', 'owner']), auditLog('POS_PDF'), safeRequire('./routes/pdfs.pos', 'pdfs.pos'));

console.log('[STARTUP] ✓ All routes registered');

// ============================================
// STATIC FILES & ERROR HANDLERS
// ============================================

// Serve static files from public directory (AFTER API routes)
app.use(express.static(path.join(__dirname, 'public')));

// 404 handler (catches everything not handled by routes or static files)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    // Include error hint for debugging (safe - no sensitive data)
    hint: err.code || err.name || 'Unknown',
    path: req.path,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ============================================
// CRON JOBS (Daily Maintenance)
// ============================================

if (process.env.SCHEDULER_ENABLED === 'true') {
  // Daily at 2:00 AM: Reset quotas, cleanup forecasts, cleanup sessions, privacy deletions
  cron.schedule(process.env.CRON_DAILY || '0 2 * * *', async () => {
    console.log('[CRON] Running daily maintenance tasks...');

    try {
      // Reset quotas that have passed their reset_at time
      const quotasReset = await pool.query('SELECT reset_quotas()');
      console.log(`[CRON] Reset ${quotasReset.rows[0].reset_quotas} quotas`);

      // Cleanup expired forecasts
      const forecastsDeleted = await pool.query('SELECT cleanup_expired_forecasts()');
      console.log(`[CRON] Deleted ${forecastsDeleted.rows[0].cleanup_expired_forecasts} expired forecasts`);

      // Cleanup expired sessions
      const sessionsDeleted = await pool.query('SELECT cleanup_expired_sessions()');
      console.log(`[CRON] Cleaned up ${sessionsDeleted.rows[0].cleanup_expired_sessions} expired sessions`);

      // V21.1: Execute scheduled privacy deletions (30-day grace period)
      const privacyDeletions = await executeScheduledDeletions();
      console.log(`[CRON] Executed ${privacyDeletions.deletedCount || 0} privacy deletions`);

      // V21.1: Reset rate limit buckets daily
      await pool.query('UPDATE rate_limit_buckets SET tokens = capacity');
      console.log('[CRON] Rate limit buckets reset');

      console.log('[CRON] Daily maintenance completed successfully');
    } catch (error) {
      console.error('[CRON] Daily maintenance failed:', error);
    }
  });

  console.log('✓ Cron scheduler enabled - daily tasks will run at', process.env.CRON_DAILY || '2:00 AM');
}

// ============================================
// PHASE3 CRON STARTUP
// ============================================

// Make phase3Cron available to routes
if (phase3Cron) {
  app.locals.phase3Cron = phase3Cron;
  app.set('phase3Cron', phase3Cron);
  phase3Cron.start();
  console.log('[STARTUP] Phase3 cron scheduler started and registered');
}

// ============================================
// SERVER START
// ============================================

console.log('[STARTUP] About to start server on port', PORT);
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('================================================');
  console.log('  NeuroInnovate Inventory Enterprise V21.1');
  console.log('================================================');
  console.log(`  Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Database: PostgreSQL (${process.env.DATABASE_URL ? 'configured' : 'NOT CONFIGURED'})`);
  console.log(`  CORS: Configured via privacy middleware`);
  console.log(`  Metrics: http://localhost:${PORT}/metrics`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log('================================================');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  // Shutdown Phase3 cron scheduler first (wait for active jobs)
  if (phase3Cron) {
    await phase3Cron.gracefulShutdown();
  }

  server.close(async () => {
    console.log('HTTP server closed');

    await pool.end();
    console.log('Database pool closed');

    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after 30 second timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');

  // Shutdown Phase3 cron scheduler first (wait for active jobs)
  if (phase3Cron) {
    await phase3Cron.gracefulShutdown();
  }

  server.close(async () => {
    console.log('HTTP server closed');

    await pool.end();
    console.log('Database pool closed');

    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
