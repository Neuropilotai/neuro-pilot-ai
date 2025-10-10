import GovernanceViewer from '../components/Owner/GovernanceViewer';

export default function Governance() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Governance Reports
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Weekly governance reports with KPIs, system changes, and compliance tracking
        </p>
      </div>
      <GovernanceViewer />
    </div>
  );
}
