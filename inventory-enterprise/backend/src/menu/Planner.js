/**
 * Planner - Date math and week rotations for 4-week menu cycle
 * Handles Wed→Tue week structure
 *
 * @module menu/Planner
 * @version 14.4.2
 */

/**
 * Get the current 4-week cycle start date
 * Cycles start on Wednesdays
 *
 * @param {Date} [referenceDate] - Reference date (defaults to now)
 * @returns {Date} Cycle start date (most recent Wednesday)
 */
function getCycleStartDate(referenceDate = new Date()) {
  // For MVP, use a fixed cycle start (can be made dynamic later)
  // Let's use January 1, 2025 as cycle anchor (adjust if needed)
  const anchorDate = new Date('2025-01-01'); // Should be a Wednesday

  // Calculate days since anchor
  const daysSinceAnchor = Math.floor((referenceDate - anchorDate) / (1000 * 60 * 60 * 24));

  // Find current week in 4-week cycle (28 days)
  const cycleDay = daysSinceAnchor % 28;

  // Calculate this cycle's start (go back cycleDay days to Wednesday)
  const cycleStart = new Date(referenceDate);
  cycleStart.setDate(referenceDate.getDate() - cycleDay);
  cycleStart.setHours(0, 0, 0, 0);

  return cycleStart;
}

/**
 * Get week start date (Wednesday) for a given week number
 *
 * @param {number} weekNumber - Week number (1-4)
 * @param {Date} [cycleStart] - Cycle start date
 * @returns {Date} Week start date
 */
function getWeekStartDate(weekNumber, cycleStart = null) {
  if (weekNumber < 1 || weekNumber > 4) {
    throw new Error('Week number must be between 1 and 4');
  }

  const start = cycleStart || getCycleStartDate();

  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (weekNumber - 1) * 7);

  return weekStart;
}

/**
 * Generate 7 days (Wed→Tue) for a week
 *
 * @param {Date} weekStart - Week start date (Wednesday)
 * @returns {Array<string>} Array of ISO date strings (YYYY-MM-DD)
 */
function getWeekDays(weekStart) {
  const days = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    days.push(day.toISOString().split('T')[0]);
  }

  return days;
}

/**
 * Get day name for ISO date
 *
 * @param {string} isoDate - ISO date string (YYYY-MM-DD)
 * @returns {string} Day name (Wed, Thu, Fri, Sat, Sun, Mon, Tue)
 */
function getDayName(isoDate) {
  const date = new Date(isoDate + 'T00:00:00');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return dayNames[date.getDay()];
}

/**
 * Get current week number in cycle (1-4)
 *
 * @param {Date} [referenceDate] - Reference date (defaults to now)
 * @returns {number} Current week number (1-4)
 */
function getCurrentWeekNumber(referenceDate = new Date()) {
  const cycleStart = getCycleStartDate(referenceDate);
  const daysSinceCycleStart = Math.floor((referenceDate - cycleStart) / (1000 * 60 * 60 * 24));
  return Math.floor(daysSinceCycleStart / 7) + 1;
}

/**
 * Build 4-week menu structure with dates
 *
 * @returns {Array<Object>} Array of 4 weeks with dates
 */
function buildWeeksStructure() {
  const cycleStart = getCycleStartDate();
  const weeks = [];

  for (let weekNum = 1; weekNum <= 4; weekNum++) {
    const weekStart = getWeekStartDate(weekNum, cycleStart);
    const days = getWeekDays(weekStart);

    weeks.push({
      weekNumber: weekNum,
      startsOn: days[0], // Wednesday
      endsOn: days[6],   // Tuesday
      days: days.map(isoDate => ({
        isoDate,
        dayName: getDayName(isoDate),
        recipes: [] // Will be populated by RecipeBook
      }))
    });
  }

  return weeks;
}

module.exports = {
  getCycleStartDate,
  getWeekStartDate,
  getWeekDays,
  getDayName,
  getCurrentWeekNumber,
  buildWeeksStructure
};
