import LearningFeed from '../components/Owner/LearningFeed';

export default function AILearning() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          AI Learning & Optimization
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Review and approve AI-generated tuning recommendations for autonomous system optimization
        </p>
      </div>
      <LearningFeed />
    </div>
  );
}
