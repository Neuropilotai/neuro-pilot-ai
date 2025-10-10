import SystemHealthForecast from '../components/Owner/SystemHealthForecast';

export default function SystemHealth() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          System Health Forecast
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          AI-powered prediction of system health risks and performance degradation
        </p>
      </div>
      <SystemHealthForecast />
    </div>
  );
}
