const fs = require('fs').promises;
const path = require('path');

class WeeklyTradingTracker {
    constructor() {
        this.trackingFile = path.join(__dirname, 'weekly_trading_progress.json');
        this.startDate = new Date();
        this.endDate = new Date(this.startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
        
        this.dailySnapshots = [];
        this.milestones = [
            { amount: 600, message: '🎯 First milestone: +$100 (20% gain)' },
            { amount: 750, message: '🚀 Second milestone: +$250 (50% gain)' },
            { amount: 1000, message: '💰 Third milestone: +$500 (100% gain - doubled!)' },
            { amount: 1500, message: '🌟 Fourth milestone: +$1000 (200% gain - tripled!)' },
            { amount: 2000, message: '🏆 Fifth milestone: +$1500 (300% gain - quadrupled!)' }
        ];
        this.achievedMilestones = [];
    }
    
    async initializeWeeklyTracking() {
        try {
            const data = await fs.readFile(this.trackingFile, 'utf8');
            const saved = JSON.parse(data);
            
            this.startDate = new Date(saved.startDate);
            this.endDate = new Date(saved.endDate);
            this.dailySnapshots = saved.dailySnapshots || [];
            this.achievedMilestones = saved.achievedMilestones || [];
            
            console.log('📊 Loaded existing weekly tracking data');
        } catch (error) {
            console.log('🆕 Starting fresh weekly tracking');
            await this.saveProgress();
        }
    }
    
    async saveProgress() {
        const data = {
            startDate: this.startDate,
            endDate: this.endDate,
            dailySnapshots: this.dailySnapshots,
            achievedMilestones: this.achievedMilestones,
            lastUpdate: new Date()
        };
        
        await fs.writeFile(this.trackingFile, JSON.stringify(data, null, 2));
    }
    
    async recordDailySnapshot(tradingData) {
        const today = new Date().toDateString();
        const existingIndex = this.dailySnapshots.findIndex(s => s.date === today);
        
        const snapshot = {
            date: today,
            balance: tradingData.wallet.currentBalance,
            totalPnL: tradingData.wallet.totalPnL,
            totalTrades: tradingData.wallet.trades.length,
            winRate: this.calculateWinRate(tradingData.wallet.trades),
            bestStrategy: tradingData.wallet.learningMetrics.bestStrategy,
            dayNumber: Math.floor((new Date() - this.startDate) / (1000 * 60 * 60 * 24)) + 1
        };
        
        if (existingIndex >= 0) {
            this.dailySnapshots[existingIndex] = snapshot;
        } else {
            this.dailySnapshots.push(snapshot);
        }
        
        // Check for new milestones
        await this.checkMilestones(snapshot.balance);
        
        await this.saveProgress();
        return snapshot;
    }
    
    calculateWinRate(trades) {
        if (trades.length === 0) return 0;
        const wins = trades.filter(t => t.pnl > 0).length;
        return (wins / trades.length) * 100;
    }
    
    async checkMilestones(currentBalance) {
        for (const milestone of this.milestones) {
            const alreadyAchieved = this.achievedMilestones.find(m => m.amount === milestone.amount);
            
            if (!alreadyAchieved && currentBalance >= milestone.amount) {
                const achievement = {
                    ...milestone,
                    achievedAt: new Date(),
                    balance: currentBalance,
                    dayNumber: Math.floor((new Date() - this.startDate) / (1000 * 60 * 60 * 24)) + 1
                };
                
                this.achievedMilestones.push(achievement);
                console.log(`\\n🎉 MILESTONE ACHIEVED! ${milestone.message}`);
                console.log(`💰 Current balance: $${currentBalance.toFixed(2)}`);
                console.log(`📅 Achieved on Day ${achievement.dayNumber}\\n`);
            }
        }
    }
    
    generateWeeklyReport() {
        const now = new Date();
        const daysElapsed = Math.floor((now - this.startDate) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, 7 - daysElapsed);
        
        const latestSnapshot = this.dailySnapshots[this.dailySnapshots.length - 1];
        const startingBalance = 500;
        const currentBalance = latestSnapshot ? latestSnapshot.balance : startingBalance;
        const totalReturn = ((currentBalance - startingBalance) / startingBalance) * 100;
        
        const report = {
            weekProgress: {
                startDate: this.startDate.toDateString(),
                endDate: this.endDate.toDateString(),
                daysElapsed: daysElapsed,
                daysRemaining: daysRemaining,
                percentComplete: (daysElapsed / 7) * 100
            },
            performance: {
                startingBalance: startingBalance,
                currentBalance: currentBalance,
                totalGainLoss: currentBalance - startingBalance,
                totalReturn: totalReturn,
                averageDailyReturn: daysElapsed > 0 ? totalReturn / daysElapsed : 0
            },
            milestones: {
                achieved: this.achievedMilestones.length,
                total: this.milestones.length,
                nextMilestone: this.milestones.find(m => currentBalance < m.amount)
            },
            dailyProgress: this.dailySnapshots,
            projectedWeekEnd: daysElapsed > 0 ? startingBalance + (currentBalance - startingBalance) * (7 / daysElapsed) : startingBalance
        };
        
        return report;
    }
    
    displayWeeklyReport() {
        const report = this.generateWeeklyReport();
        
        console.log('\\n' + '='.repeat(60));
        console.log('📊 WEEKLY TRADING CHALLENGE REPORT');
        console.log('='.repeat(60));
        
        console.log('\\n📅 WEEK PROGRESS:');
        console.log(`   Start Date: ${report.weekProgress.startDate}`);
        console.log(`   End Date: ${report.weekProgress.endDate}`);
        console.log(`   Days Elapsed: ${report.weekProgress.daysElapsed}/7`);
        console.log(`   Days Remaining: ${report.weekProgress.daysRemaining}`);
        console.log(`   Week Progress: ${report.weekProgress.percentComplete.toFixed(1)}%`);
        
        console.log('\\n💰 FINANCIAL PERFORMANCE:');
        console.log(`   Starting Balance: $${report.performance.startingBalance.toFixed(2)}`);
        console.log(`   Current Balance: $${report.performance.currentBalance.toFixed(2)}`);
        console.log(`   Total Gain/Loss: ${report.performance.totalGainLoss >= 0 ? '+' : ''}$${report.performance.totalGainLoss.toFixed(2)}`);
        console.log(`   Total Return: ${report.performance.totalReturn >= 0 ? '+' : ''}${report.performance.totalReturn.toFixed(2)}%`);
        console.log(`   Avg Daily Return: ${report.performance.averageDailyReturn.toFixed(2)}%`);
        
        console.log('\\n🎯 MILESTONE PROGRESS:');
        console.log(`   Achieved: ${report.milestones.achieved}/${report.milestones.total}`);
        if (report.milestones.nextMilestone) {
            const needed = report.milestones.nextMilestone.amount - report.performance.currentBalance;
            console.log(`   Next Milestone: $${report.milestones.nextMilestone.amount} (need $${needed.toFixed(2)} more)`);
        } else {
            console.log('   🏆 ALL MILESTONES ACHIEVED!');
        }
        
        if (report.weekProgress.daysElapsed > 0) {
            console.log('\\n📈 PROJECTION:');
            console.log(`   Projected Week-End Balance: $${report.projectedWeekEnd.toFixed(2)}`);
            console.log(`   Projected Week-End Return: ${((report.projectedWeekEnd - 500) / 500 * 100).toFixed(2)}%`);
        }
        
        console.log('\\n🏆 ACHIEVED MILESTONES:');
        if (this.achievedMilestones.length > 0) {
            this.achievedMilestones.forEach(milestone => {
                console.log(`   Day ${milestone.dayNumber}: ${milestone.message} ($${milestone.balance.toFixed(2)})`);
            });
        } else {
            console.log('   No milestones achieved yet');
        }
        
        console.log('\\n📊 DAILY SNAPSHOTS:');
        if (report.dailyProgress.length > 0) {
            report.dailyProgress.forEach(day => {
                const dailyReturn = ((day.balance - 500) / 500) * 100;
                console.log(`   Day ${day.dayNumber}: $${day.balance.toFixed(2)} (${dailyReturn >= 0 ? '+' : ''}${dailyReturn.toFixed(2)}%) | ${day.totalTrades} trades | ${day.winRate.toFixed(1)}% win rate`);
            });
        } else {
            console.log('   No daily data recorded yet');
        }
        
        console.log('\\n' + '='.repeat(60));
    }
    
    async generateHTMLReport() {
        const report = this.generateWeeklyReport();
        
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weekly Trading Challenge - $500 to ? in 7 Days</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            color: #ffffff;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255,255,255,0.05);
            border-radius: 20px;
            padding: 40px;
            backdrop-filter: blur(10px);
        }
        
        h1 {
            text-align: center;
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(45deg, #00ff00, #ffaa00);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 40px;
            font-size: 1.2rem;
        }
        
        .progress-bar {
            width: 100%;
            height: 20px;
            background: #333;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 30px;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00ff00, #ffaa00);
            width: ${report.weekProgress.percentComplete}%;
            transition: width 0.3s ease;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: ${report.performance.totalReturn >= 0 ? '#00ff00' : '#ff4444'};
            margin-bottom: 5px;
        }
        
        .stat-label {
            color: #888;
            font-size: 0.9rem;
        }
        
        .milestones {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 30px;
        }
        
        .milestone-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 10px;
        }
        
        .milestone-achieved {
            background: rgba(0, 255, 0, 0.1);
            border-left: 4px solid #00ff00;
        }
        
        .milestone-pending {
            background: rgba(255, 255, 255, 0.05);
            border-left: 4px solid #666;
        }
        
        .daily-chart {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 30px;
        }
        
        .chart-container {
            height: 300px;
            display: flex;
            align-items: end;
            justify-content: space-around;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
        }
        
        .chart-bar {
            width: 40px;
            background: linear-gradient(to top, #00ff00, #ffaa00);
            border-radius: 4px 4px 0 0;
            margin: 0 5px;
            position: relative;
        }
        
        .chart-label {
            position: absolute;
            bottom: -25px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.8rem;
            color: #888;
        }
        
        .projection {
            background: rgba(255, 170, 0, 0.1);
            border-radius: 15px;
            padding: 25px;
            text-align: center;
        }
        
        .projection-value {
            font-size: 3rem;
            font-weight: bold;
            color: #ffaa00;
            margin: 20px 0;
        }
        
        .update-time {
            text-align: center;
            color: #666;
            font-size: 0.9rem;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📈 Weekly Trading Challenge</h1>
        <p class="subtitle">$500 Starting Balance • AI Autonomous Trading • 7 Day Challenge</p>
        
        <div class="progress-bar">
            <div class="progress-fill"></div>
        </div>
        <p style="text-align: center; margin-bottom: 30px;">
            Day ${report.weekProgress.daysElapsed}/7 • ${report.weekProgress.daysRemaining} days remaining
        </p>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">$${report.performance.currentBalance.toFixed(2)}</div>
                <div class="stat-label">Current Balance</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.performance.totalReturn >= 0 ? '+' : ''}${report.performance.totalReturn.toFixed(2)}%</div>
                <div class="stat-label">Total Return</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.performance.totalGainLoss >= 0 ? '+' : ''}$${report.performance.totalGainLoss.toFixed(2)}</div>
                <div class="stat-label">Total Gain/Loss</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${report.performance.averageDailyReturn.toFixed(2)}%</div>
                <div class="stat-label">Avg Daily Return</div>
            </div>
        </div>
        
        <div class="milestones">
            <h2>🎯 Milestones (${report.milestones.achieved}/${report.milestones.total} achieved)</h2>
            ${this.milestones.map(milestone => {
                const achieved = this.achievedMilestones.find(m => m.amount === milestone.amount);
                return `
                    <div class="milestone-item ${achieved ? 'milestone-achieved' : 'milestone-pending'}">
                        <span>${milestone.message}</span>
                        <span>${achieved ? '✅ Day ' + achieved.dayNumber : '$' + milestone.amount}</span>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="daily-chart">
            <h2>📊 Daily Progress</h2>
            <div class="chart-container">
                ${report.dailyProgress.map((day, index) => {
                    const height = Math.max(20, (day.balance / Math.max(...report.dailyProgress.map(d => d.balance)) * 250));
                    return `
                        <div class="chart-bar" style="height: ${height}px;">
                            <div class="chart-label">Day ${day.dayNumber}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
        
        ${report.weekProgress.daysElapsed > 0 ? `
            <div class="projection">
                <h2>🔮 Week-End Projection</h2>
                <div class="projection-value">$${report.projectedWeekEnd.toFixed(2)}</div>
                <p>Projected final balance based on current performance</p>
                <p>Projected return: ${((report.projectedWeekEnd - 500) / 500 * 100).toFixed(2)}%</p>
            </div>
        ` : ''}
        
        <div class="update-time">
            Last updated: ${new Date().toLocaleString()}
        </div>
    </div>
    
    <script>
        // Auto-refresh every 60 seconds
        setTimeout(() => {
            location.reload();
        }, 60000);
    </script>
</body>
</html>
        `;
        
        const reportPath = path.join(__dirname, 'public', 'weekly_report.html');
        await fs.writeFile(reportPath, html);
        
        return reportPath;
    }
}

module.exports = WeeklyTradingTracker;