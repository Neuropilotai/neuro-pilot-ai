import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8083';

export default function AIAgentControl() {
  const { token } = useAuthStore();
  const [runningCommand, setRunningCommand] = useState(null);
  const [commandResult, setCommandResult] = useState(null);

  const aiCommands = [
    {
      id: 'optimize',
      name: 'Run Optimization',
      icon: '⚡',
      description: 'AI Tuner analyzes system performance and generates optimization proposals',
      color: 'blue'
    },
    {
      id: 'predict',
      name: 'Health Prediction',
      icon: '🏥',
      description: '24-hour health prediction with risk assessment',
      color: 'green'
    },
    {
      id: 'scan',
      name: 'Security Scan',
      icon: '🔒',
      description: 'Scan for security anomalies and potential threats',
      color: 'red'
    },
    {
      id: 'govern',
      name: 'Governance Report',
      icon: '📋',
      description: 'Generate compliance and governance report',
      color: 'purple'
    },
    {
      id: 'heal',
      name: 'Self-Heal',
      icon: '🔧',
      description: 'Automatically detect and fix system issues',
      color: 'yellow'
    },
    {
      id: 'learn',
      name: 'Learning Cycle',
      icon: '🧠',
      description: 'Analyze patterns and generate insights from learning data',
      color: 'indigo'
    },
    {
      id: 'analyze',
      name: 'Comprehensive Analysis',
      icon: '🔬',
      description: 'Run all AI agents and generate complete system analysis',
      color: 'pink'
    }
  ];

  const runCommand = async (commandId) => {
    setRunningCommand(commandId);
    setCommandResult(null);

    const endpoint = commandId === 'optimize' ? 'run-tuner' :
                    commandId === 'predict' ? 'run-health-prediction' :
                    commandId === 'scan' ? 'run-security-scan' :
                    commandId === 'govern' ? 'run-governance' :
                    commandId === 'heal' ? 'run-self-heal' :
                    commandId === 'learn' ? 'run-learning-cycle' :
                    commandId === 'analyze' ? 'run-comprehensive-analysis' :
                    'run-tuner';

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/owner/console/ai/${endpoint}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCommandResult(response.data);
      toast.success(`${commandId} completed successfully`);
    } catch (error) {
      toast.error(`Failed to run ${commandId}`);
      console.error(error);
      setCommandResult({
        error: error.response?.data?.error || error.message
      });
    } finally {
      setRunningCommand(null);
    }
  };

  const getColorClasses = (color) => {
    const colors = {
      blue: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200',
      green: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200',
      red: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200',
      purple: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900 dark:text-purple-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200',
      indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-200',
      pink: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900 dark:text-pink-200'
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">AI Agent Control</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Execute AI commands to optimize, predict, and monitor your system
        </p>
      </div>

      {/* AI Command Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {aiCommands.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => runCommand(cmd.id)}
            disabled={runningCommand !== null}
            className={`
              p-6 rounded-lg border-2 text-left transition-all
              ${getColorClasses(cmd.color)}
              ${runningCommand === cmd.id ? 'opacity-70 cursor-wait' : 'hover:shadow-lg'}
              ${runningCommand && runningCommand !== cmd.id ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-3xl">{cmd.icon}</span>
              {runningCommand === cmd.id && (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
            </div>
            <h3 className="font-semibold text-lg mb-2">{cmd.name}</h3>
            <p className="text-sm opacity-90">{cmd.description}</p>
          </button>
        ))}
      </div>

      {/* Command Result */}
      {commandResult && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Command Result
            </h3>
            <button
              onClick={() => setCommandResult(null)}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {commandResult.error ? (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 p-4 rounded-lg">
              <p className="font-medium">Error:</p>
              <p className="mt-1">{commandResult.error}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {commandResult.type && (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Type:</span> {commandResult.type}
                </div>
              )}
              {commandResult.confidence && (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Confidence:</span> {(commandResult.confidence * 100).toFixed(1)}%
                </div>
              )}
              <pre className="bg-white dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700 overflow-auto text-xs">
                {JSON.stringify(commandResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
