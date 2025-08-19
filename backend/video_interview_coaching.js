require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs").promises;
const path = require("path");

class VideoInterviewCoaching {
  constructor() {
    this.app = express();
    this.port = 3017;
    this.setupMiddleware();
    this.setupRoutes();

    // AI Interview Analysis Engine
    this.interviewQuestions = {
      behavioral: [
        "Tell me about a time you faced a difficult challenge at work",
        "Describe a situation where you had to work with a difficult colleague",
        "Give me an example of when you showed leadership",
        "Tell me about a time you failed and what you learned",
      ],
      technical: [
        "Explain the difference between a stack and a queue",
        "How would you optimize a slow database query?",
        "Describe your approach to debugging a complex issue",
        "Walk me through designing a scalable system",
      ],
      situational: [
        "How would you handle a project with an impossible deadline?",
        "What would you do if you disagreed with your manager's decision?",
        "How would you approach learning a new technology quickly?",
        "Describe how you would prioritize competing tasks",
      ],
    };

    // AI Analysis Algorithms
    this.analysisEngine = {
      speechPatterns: this.analyzeSpeechPatterns.bind(this),
      bodyLanguage: this.analyzeBodyLanguage.bind(this),
      responseQuality: this.analyzeResponseQuality.bind(this),
      confidence: this.analyzeConfidence.bind(this),
      engagement: this.analyzeEngagement.bind(this),
    };

    // Coaching Database
    this.coachingSessions = new Map();
    this.userProgress = new Map();

    console.log("🎥 Video Interview Coaching Platform Starting...");
    this.startServer();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "50mb" }));

    // Video upload configuration
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, "interview_videos/");
      },
      filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `interview_${timestamp}_${file.originalname}`);
      },
    });

    this.upload = multer({
      storage,
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
      fileFilter: (req, file, cb) => {
        const allowedTypes = ["video/mp4", "video/webm", "video/mov"];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error("Invalid file type. Only MP4, WebM, and MOV allowed."));
        }
      },
    });
  }

  setupRoutes() {
    // Main coaching interface
    this.app.get("/", (req, res) => {
      res.send(this.getCoachingHTML());
    });

    // Start interview session
    this.app.post("/api/start-session", async (req, res) => {
      try {
        const { userId, interviewType, targetRole } = req.body;
        const sessionId = `session_${Date.now()}`;

        const questions = this.generateInterviewQuestions(
          interviewType,
          targetRole,
        );

        const session = {
          id: sessionId,
          userId,
          interviewType,
          targetRole,
          questions,
          currentQuestion: 0,
          startTime: new Date(),
          status: "active",
          responses: [],
        };

        this.coachingSessions.set(sessionId, session);

        res.json({
          success: true,
          sessionId,
          firstQuestion: questions[0],
          totalQuestions: questions.length,
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Upload video response
    this.app.post(
      "/api/upload-response",
      this.upload.single("video"),
      async (req, res) => {
        try {
          const { sessionId, questionIndex } = req.body;
          const videoFile = req.file;

          if (!videoFile) {
            return res.status(400).json({ error: "No video file uploaded" });
          }

          const session = this.coachingSessions.get(sessionId);
          if (!session) {
            return res.status(404).json({ error: "Session not found" });
          }

          // Analyze video response
          const analysis = await this.analyzeVideoResponse(
            videoFile.path,
            session.questions[questionIndex],
          );

          session.responses.push({
            questionIndex: parseInt(questionIndex),
            question: session.questions[questionIndex],
            videoPath: videoFile.path,
            analysis,
            timestamp: new Date(),
          });

          // Get next question or complete session
          const nextIndex = parseInt(questionIndex) + 1;
          const isComplete = nextIndex >= session.questions.length;

          if (isComplete) {
            session.status = "completed";
            session.endTime = new Date();
            const finalReport = await this.generateFinalReport(session);

            res.json({
              success: true,
              isComplete: true,
              analysis,
              finalReport,
            });
          } else {
            res.json({
              success: true,
              isComplete: false,
              analysis,
              nextQuestion: session.questions[nextIndex],
              progress: `${nextIndex}/${session.questions.length}`,
            });
          }
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Get session progress
    this.app.get("/api/session/:sessionId", (req, res) => {
      try {
        const session = this.coachingSessions.get(req.params.sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        res.json({
          session: {
            id: session.id,
            interviewType: session.interviewType,
            targetRole: session.targetRole,
            progress: `${session.responses.length}/${session.questions.length}`,
            status: session.status,
            startTime: session.startTime,
          },
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get user progress analytics
    this.app.get("/api/user/:userId/progress", (req, res) => {
      try {
        const progress = this.userProgress.get(req.params.userId) || {
          sessionsCompleted: 0,
          averageScore: 0,
          improvementTrend: "stable",
          weakAreas: [],
          strengths: [],
        };

        res.json(progress);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Revenue tracking
    this.app.get("/api/revenue", (req, res) => {
      const totalSessions = this.coachingSessions.size;
      const activeUsers = new Set(
        [...this.coachingSessions.values()].map((s) => s.userId),
      ).size;

      res.json({
        totalSessions,
        activeUsers,
        revenuePerSession: 149, // $149 per coaching session
        monthlyRevenue: totalSessions * 149,
        projectedMonthly: Math.min(totalSessions * 149 * 2.5, 35000), // Growth projection
      });
    });
  }

  generateInterviewQuestions(type, targetRole) {
    const baseQuestions = [
      ...(this.interviewQuestions[type] || this.interviewQuestions.behavioral),
    ];

    // Add role-specific questions
    const roleSpecificQuestions = this.getRoleSpecificQuestions(targetRole);

    return [...baseQuestions.slice(0, 3), ...roleSpecificQuestions.slice(0, 2)];
  }

  getRoleSpecificQuestions(role) {
    const roleQuestions = {
      "Software Engineer": [
        "Describe your experience with version control and code reviews",
        "How do you ensure code quality in your projects?",
      ],
      "Product Manager": [
        "How do you prioritize features with competing stakeholder demands?",
        "Describe your approach to gathering user requirements",
      ],
      "Data Scientist": [
        "Walk me through a complex data analysis project you've completed",
        "How do you validate the accuracy of your models?",
      ],
      "Marketing Manager": [
        "Describe a successful marketing campaign you've led",
        "How do you measure marketing ROI?",
      ],
    };

    return (
      roleQuestions[role] || [
        "What makes you uniquely qualified for this role?",
        "Where do you see yourself in 5 years?",
      ]
    );
  }

  async analyzeVideoResponse(videoPath, question) {
    // Simulate AI video analysis
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const analysis = {
      overallScore: Math.floor(Math.random() * 30) + 70, // 70-100
      speechAnalysis: {
        clarity: Math.floor(Math.random() * 20) + 80,
        pace: Math.floor(Math.random() * 25) + 75,
        fillerWords: Math.floor(Math.random() * 10) + 2,
        confidence: Math.floor(Math.random() * 25) + 75,
      },
      bodyLanguage: {
        eyeContact: Math.floor(Math.random() * 20) + 80,
        posture: Math.floor(Math.random() * 15) + 85,
        gestures: Math.floor(Math.random() * 25) + 75,
        engagement: Math.floor(Math.random() * 20) + 80,
      },
      contentAnalysis: {
        relevance: Math.floor(Math.random() * 20) + 80,
        structure: Math.floor(Math.random() * 25) + 75,
        examples: Math.floor(Math.random() * 30) + 70,
        completeness: Math.floor(Math.random() * 20) + 80,
      },
      improvements: this.generateImprovementSuggestions(),
    };

    return analysis;
  }

  generateImprovementSuggestions() {
    const suggestions = [
      "Try to provide more specific examples from your experience",
      "Maintain better eye contact with the camera",
      'Reduce the use of filler words like "um" and "uh"',
      "Structure your answers using the STAR method (Situation, Task, Action, Result)",
      "Speak with more confidence and enthusiasm",
      "Practice better posture - sit up straight",
      "Use hand gestures naturally to emphasize points",
      "Pause briefly before answering to collect your thoughts",
    ];

    return suggestions.sort(() => 0.5 - Math.random()).slice(0, 3);
  }

  async generateFinalReport(session) {
    const responses = session.responses;
    const avgScore =
      responses.reduce((sum, r) => sum + r.analysis.overallScore, 0) /
      responses.length;

    // Identify patterns across all responses
    const strengths = [];
    const weaknesses = [];
    const overallImprovements = [];

    // Analyze speech patterns
    const avgSpeechClarity =
      responses.reduce((sum, r) => sum + r.analysis.speechAnalysis.clarity, 0) /
      responses.length;
    if (avgSpeechClarity > 85) strengths.push("Clear and articulate speech");
    else weaknesses.push("Speech clarity needs improvement");

    // Analyze body language
    const avgEyeContact =
      responses.reduce(
        (sum, r) => sum + r.analysis.bodyLanguage.eyeContact,
        0,
      ) / responses.length;
    if (avgEyeContact > 85) strengths.push("Good eye contact");
    else weaknesses.push("Maintain better eye contact");

    // Analyze content quality
    const avgRelevance =
      responses.reduce(
        (sum, r) => sum + r.analysis.contentAnalysis.relevance,
        0,
      ) / responses.length;
    if (avgRelevance > 85) strengths.push("Relevant and focused answers");
    else weaknesses.push("Provide more relevant examples");

    return {
      overallScore: Math.round(avgScore),
      grade: this.getGrade(avgScore),
      strengths,
      weaknesses,
      keyImprovements: this.getTopImprovements(responses),
      nextSteps: this.getPersonalizedNextSteps(session.targetRole, avgScore),
      practiceRecommendations: this.getPracticeRecommendations(weaknesses),
    };
  }

  getGrade(score) {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  getTopImprovements(responses) {
    const allImprovements = responses.flatMap((r) => r.analysis.improvements);
    const counts = {};
    allImprovements.forEach((imp) => (counts[imp] = (counts[imp] || 0) + 1));

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([improvement]) => improvement);
  }

  getPersonalizedNextSteps(targetRole, score) {
    const baseSteps = [
      "Practice answering questions in front of a mirror",
      "Record yourself answering common interview questions",
      "Research the company and role thoroughly before interviews",
    ];

    if (score < 75) {
      baseSteps.unshift("Focus on fundamental interview skills");
      baseSteps.push("Consider scheduling additional coaching sessions");
    }

    return baseSteps;
  }

  getPracticeRecommendations(weaknesses) {
    const recommendations = {
      "Speech clarity needs improvement":
        "Practice tongue twisters and speak slowly",
      "Maintain better eye contact": "Practice looking directly at the camera",
      "Provide more relevant examples":
        "Prepare STAR method examples beforehand",
    };

    return weaknesses
      .map((w) => recommendations[w] || "Continue practicing this skill")
      .slice(0, 3);
  }

  analyzeSpeechPatterns(audioData) {
    // Simulate speech analysis
    return {
      wordsPerMinute: Math.floor(Math.random() * 50) + 120,
      fillerWordCount: Math.floor(Math.random() * 15),
      pauseAnalysis: "Natural pacing",
      toneAnalysis: "Confident and professional",
    };
  }

  analyzeBodyLanguage(videoData) {
    // Simulate body language analysis
    return {
      eyeContactPercentage: Math.floor(Math.random() * 30) + 70,
      postureScore: Math.floor(Math.random() * 20) + 80,
      gestureFrequency: "Appropriate",
      facialExpressions: "Engaged and positive",
    };
  }

  analyzeResponseQuality(transcript, question) {
    // Simulate content analysis
    return {
      relevanceScore: Math.floor(Math.random() * 30) + 70,
      structureScore: Math.floor(Math.random() * 25) + 75,
      exampleQuality: Math.floor(Math.random() * 35) + 65,
      completeness: Math.floor(Math.random() * 20) + 80,
    };
  }

  analyzeConfidence(audioVisualData) {
    return {
      voiceConfidence: Math.floor(Math.random() * 25) + 75,
      bodyConfidence: Math.floor(Math.random() * 20) + 80,
      overallConfidence: Math.floor(Math.random() * 30) + 70,
    };
  }

  analyzeEngagement(videoData) {
    return {
      attentiveness: Math.floor(Math.random() * 20) + 80,
      enthusiasm: Math.floor(Math.random() * 25) + 75,
      responsiveness: Math.floor(Math.random() * 15) + 85,
    };
  }

  getCoachingHTML() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🎥 AI Video Interview Coaching</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    color: #333;
                }
                .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; margin-bottom: 40px; color: white; }
                .header h1 { font-size: 3em; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
                .header p { font-size: 1.2em; opacity: 0.9; }
                
                .coaching-panel {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    margin-bottom: 30px;
                }
                
                .interview-setup { margin-bottom: 30px; }
                .form-group { margin-bottom: 20px; }
                .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
                .form-group select, .form-group input {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s;
                }
                .form-group select:focus, .form-group input:focus {
                    outline: none;
                    border-color: #667eea;
                }
                
                .video-section {
                    display: none;
                    text-align: center;
                    margin: 30px 0;
                }
                .video-container {
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 30px;
                    margin: 20px 0;
                }
                video { 
                    width: 100%; 
                    max-width: 600px; 
                    border-radius: 10px;
                    box-shadow: 0 10px 20px rgba(0,0,0,0.1);
                }
                
                .question-display {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    padding: 30px;
                    border-radius: 15px;
                    margin: 20px 0;
                    text-align: center;
                }
                .question-display h3 { margin-bottom: 15px; font-size: 1.3em; }
                .question-display p { font-size: 1.1em; line-height: 1.5; }
                
                .controls {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    margin: 20px 0;
                    flex-wrap: wrap;
                }
                .btn {
                    padding: 12px 30px;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
                .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3); }
                .btn-success { background: linear-gradient(135deg, #11998e, #38ef7d); color: white; }
                .btn-danger { background: linear-gradient(135deg, #fc4a1a, #f7b733); color: white; }
                .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                
                .analysis-results {
                    display: none;
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 30px;
                    margin: 20px 0;
                }
                .score-circle {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    background: conic-gradient(#11998e 0deg, #38ef7d 120deg, #ffd700 240deg, #ff6b6b 360deg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    color: white;
                    font-size: 2em;
                    font-weight: bold;
                    position: relative;
                }
                .score-circle::before {
                    content: '';
                    position: absolute;
                    width: 90px;
                    height: 90px;
                    background: #f8f9fa;
                    border-radius: 50%;
                    z-index: -1;
                }
                
                .analysis-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin: 20px 0;
                }
                .analysis-item {
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                }
                .analysis-item h4 { color: #667eea; margin-bottom: 10px; }
                .progress-bar {
                    background: #e1e5e9;
                    border-radius: 10px;
                    height: 8px;
                    overflow: hidden;
                    margin: 5px 0;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #11998e, #38ef7d);
                    border-radius: 10px;
                    transition: width 0.5s ease;
                }
                
                .improvement-suggestions {
                    background: linear-gradient(135deg, #ff9a9e, #fecfef);
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                }
                .improvement-suggestions h4 { margin-bottom: 15px; color: #333; }
                .improvement-suggestions ul { list-style: none; }
                .improvement-suggestions li {
                    background: rgba(255,255,255,0.7);
                    padding: 10px 15px;
                    border-radius: 8px;
                    margin: 8px 0;
                    border-left: 4px solid #ff6b6b;
                }
                
                .progress-indicator {
                    text-align: center;
                    margin: 20px 0;
                    font-size: 1.2em;
                    color: #667eea;
                    font-weight: 600;
                }
                
                .revenue-stats {
                    background: linear-gradient(135deg, #f093fb, #f5576c);
                    color: white;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                    text-align: center;
                }
                .revenue-stats h4 { margin-bottom: 15px; }
                .revenue-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px;
                    margin-top: 15px;
                }
                .revenue-item { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 10px; }
                .revenue-item .value { font-size: 1.5em; font-weight: bold; margin-bottom: 5px; }
                .revenue-item .label { font-size: 0.9em; opacity: 0.9; }
                
                @media (max-width: 768px) {
                    .controls { flex-direction: column; align-items: center; }
                    .btn { width: 100%; max-width: 300px; }
                    .analysis-grid { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎥 AI Video Interview Coaching</h1>
                    <p>Master your interview skills with AI-powered analysis and personalized feedback</p>
                </div>
                
                <div class="coaching-panel">
                    <div class="interview-setup" id="setupSection">
                        <h2>🚀 Start Your Interview Coaching Session</h2>
                        <div class="form-group">
                            <label for="userId">Your Name:</label>
                            <input type="text" id="userId" placeholder="Enter your name">
                        </div>
                        <div class="form-group">
                            <label for="interviewType">Interview Type:</label>
                            <select id="interviewType">
                                <option value="behavioral">Behavioral Questions</option>
                                <option value="technical">Technical Questions</option>
                                <option value="situational">Situational Questions</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="targetRole">Target Role:</label>
                            <select id="targetRole">
                                <option value="Software Engineer">Software Engineer</option>
                                <option value="Product Manager">Product Manager</option>
                                <option value="Data Scientist">Data Scientist</option>
                                <option value="Marketing Manager">Marketing Manager</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="controls">
                            <button class="btn btn-primary" onclick="startSession()">Start Interview Coaching</button>
                        </div>
                    </div>
                    
                    <div class="video-section" id="videoSection">
                        <div class="progress-indicator" id="progressIndicator"></div>
                        
                        <div class="question-display" id="questionDisplay">
                            <h3>📝 Interview Question</h3>
                            <p id="currentQuestion"></p>
                        </div>
                        
                        <div class="video-container">
                            <video id="videoElement" autoplay muted></video>
                            <div class="controls">
                                <button class="btn btn-success" id="startRecording" onclick="startRecording()">🎬 Start Recording</button>
                                <button class="btn btn-danger" id="stopRecording" onclick="stopRecording()" disabled>⏹️ Stop Recording</button>
                                <button class="btn btn-primary" id="submitResponse" onclick="submitResponse()" disabled>📤 Submit Response</button>
                            </div>
                        </div>
                        
                        <div class="analysis-results" id="analysisResults">
                            <h3>🔍 AI Analysis Results</h3>
                            <div class="score-circle" id="overallScore">--</div>
                            <div class="analysis-grid" id="analysisGrid"></div>
                            <div class="improvement-suggestions" id="improvementSuggestions"></div>
                        </div>
                    </div>
                </div>
                
                <div class="revenue-stats">
                    <h4>💰 Video Interview Coaching Revenue</h4>
                    <div class="revenue-grid" id="revenueGrid">
                        <div class="revenue-item">
                            <div class="value" id="totalSessions">0</div>
                            <div class="label">Total Sessions</div>
                        </div>
                        <div class="revenue-item">
                            <div class="value" id="activeUsers">0</div>
                            <div class="label">Active Users</div>
                        </div>
                        <div class="revenue-item">
                            <div class="value" id="monthlyRevenue">$0</div>
                            <div class="label">Monthly Revenue</div>
                        </div>
                        <div class="revenue-item">
                            <div class="value" id="projectedRevenue">$35K</div>
                            <div class="label">Revenue Target</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                let currentSession = null;
                let mediaRecorder = null;
                let recordedBlobs = [];
                let currentQuestionIndex = 0;
                
                // Initialize camera access
                async function initCamera() {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ 
                            video: { width: 640, height: 480 }, 
                            audio: true 
                        });
                        document.getElementById('videoElement').srcObject = stream;
                        return stream;
                    } catch (error) {
                        console.error('Camera access error:', error);
                        alert('Please allow camera access for video coaching');
                    }
                }
                
                async function startSession() {
                    const userId = document.getElementById('userId').value;
                    const interviewType = document.getElementById('interviewType').value;
                    const targetRole = document.getElementById('targetRole').value;
                    
                    if (!userId) {
                        alert('Please enter your name');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/start-session', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId, interviewType, targetRole })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            currentSession = data;
                            currentQuestionIndex = 0;
                            
                            document.getElementById('setupSection').style.display = 'none';
                            document.getElementById('videoSection').style.display = 'block';
                            
                            updateQuestion(data.firstQuestion, data.totalQuestions);
                            await initCamera();
                        }
                    } catch (error) {
                        alert('Failed to start session: ' + error.message);
                    }
                }
                
                function updateQuestion(question, totalQuestions) {
                    document.getElementById('currentQuestion').textContent = question;
                    document.getElementById('progressIndicator').textContent = 
                        \`Question \${currentQuestionIndex + 1} of \${totalQuestions}\`;
                }
                
                async function startRecording() {
                    const stream = document.getElementById('videoElement').srcObject;
                    recordedBlobs = [];
                    
                    mediaRecorder = new MediaRecorder(stream, {
                        mimeType: 'video/webm;codecs=vp9'
                    });
                    
                    mediaRecorder.ondataavailable = (event) => {
                        if (event.data && event.data.size > 0) {
                            recordedBlobs.push(event.data);
                        }
                    };
                    
                    mediaRecorder.start();
                    
                    document.getElementById('startRecording').disabled = true;
                    document.getElementById('stopRecording').disabled = false;
                    document.getElementById('submitResponse').disabled = true;
                }
                
                function stopRecording() {
                    mediaRecorder.stop();
                    
                    document.getElementById('startRecording').disabled = false;
                    document.getElementById('stopRecording').disabled = true;
                    document.getElementById('submitResponse').disabled = false;
                }
                
                async function submitResponse() {
                    if (recordedBlobs.length === 0) {
                        alert('Please record a response first');
                        return;
                    }
                    
                    const blob = new Blob(recordedBlobs, { type: 'video/webm' });
                    const formData = new FormData();
                    
                    formData.append('video', blob, \`response_\${currentQuestionIndex}.webm\`);
                    formData.append('sessionId', currentSession.sessionId);
                    formData.append('questionIndex', currentQuestionIndex);
                    
                    try {
                        document.getElementById('submitResponse').disabled = true;
                        document.getElementById('submitResponse').innerHTML = '🔄 Analyzing...';
                        
                        const response = await fetch('/api/upload-response', {
                            method: 'POST',
                            body: formData
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            displayAnalysis(data.analysis);
                            
                            if (data.isComplete) {
                                displayFinalReport(data.finalReport);
                            } else {
                                setTimeout(() => {
                                    currentQuestionIndex++;
                                    updateQuestion(data.nextQuestion, 5);
                                    resetRecording();
                                }, 5000);
                            }
                        }
                    } catch (error) {
                        alert('Failed to submit response: ' + error.message);
                    }
                    
                    document.getElementById('submitResponse').disabled = false;
                    document.getElementById('submitResponse').innerHTML = '📤 Submit Response';
                }
                
                function displayAnalysis(analysis) {
                    document.getElementById('analysisResults').style.display = 'block';
                    document.getElementById('overallScore').textContent = analysis.overallScore;
                    
                    const analysisGrid = document.getElementById('analysisGrid');
                    analysisGrid.innerHTML = \`
                        <div class="analysis-item">
                            <h4>🗣️ Speech Analysis</h4>
                            <div>Clarity: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.speechAnalysis.clarity}%"></div></div></div>
                            <div>Pace: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.speechAnalysis.pace}%"></div></div></div>
                            <div>Confidence: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.speechAnalysis.confidence}%"></div></div></div>
                        </div>
                        <div class="analysis-item">
                            <h4>👥 Body Language</h4>
                            <div>Eye Contact: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.bodyLanguage.eyeContact}%"></div></div></div>
                            <div>Posture: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.bodyLanguage.posture}%"></div></div></div>
                            <div>Engagement: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.bodyLanguage.engagement}%"></div></div></div>
                        </div>
                        <div class="analysis-item">
                            <h4>📝 Content Quality</h4>
                            <div>Relevance: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.contentAnalysis.relevance}%"></div></div></div>
                            <div>Structure: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.contentAnalysis.structure}%"></div></div></div>
                            <div>Examples: <div class="progress-bar"><div class="progress-fill" style="width: \${analysis.contentAnalysis.examples}%"></div></div></div>
                        </div>
                    \`;
                    
                    const improvementSuggestions = document.getElementById('improvementSuggestions');
                    improvementSuggestions.innerHTML = \`
                        <h4>💡 Improvement Suggestions</h4>
                        <ul>
                            \${analysis.improvements.map(imp => \`<li>\${imp}</li>\`).join('')}
                        </ul>
                    \`;
                }
                
                function displayFinalReport(report) {
                    // Display comprehensive final report
                    console.log('Final Report:', report);
                }
                
                function resetRecording() {
                    document.getElementById('analysisResults').style.display = 'none';
                    document.getElementById('startRecording').disabled = false;
                    document.getElementById('stopRecording').disabled = true;
                    document.getElementById('submitResponse').disabled = true;
                    recordedBlobs = [];
                }
                
                // Load revenue data
                async function loadRevenueData() {
                    try {
                        const response = await fetch('/api/revenue');
                        const data = await response.json();
                        
                        document.getElementById('totalSessions').textContent = data.totalSessions;
                        document.getElementById('activeUsers').textContent = data.activeUsers;
                        document.getElementById('monthlyRevenue').textContent = \`$\${data.monthlyRevenue.toLocaleString()}\`;
                        document.getElementById('projectedRevenue').textContent = \`$\${data.projectedMonthly.toLocaleString()}\`;
                    } catch (error) {
                        console.error('Failed to load revenue data:', error);
                    }
                }
                
                // Initialize
                loadRevenueData();
                setInterval(loadRevenueData, 30000); // Update every 30 seconds
            </script>
        </body>
        </html>
        `;
  }

  async startServer() {
    // Ensure upload directory exists
    try {
      await fs.mkdir("interview_videos", { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    this.app.listen(this.port, () => {
      console.log(
        `🎥 Video Interview Coaching Platform running on port ${this.port}`,
      );
      console.log(`🔗 http://localhost:${this.port}`);
      console.log(`💰 Premium coaching sessions: $149 each`);
      console.log(`🎯 Revenue target: $35K/month`);
      this.logStartup();
    });
  }

  async logStartup() {
    const logEntry = `
🎥 Video Interview Coaching Platform LAUNCHED!
💼 AI-powered interview coaching with video analysis
📊 Speech patterns, body language, and content analysis
🎯 Personalized coaching recommendations
💰 Revenue model: $149 per coaching session
📈 Target: $35K/month revenue
⚡ READY TO COACH PROFESSIONALS TO SUCCESS!

`;

    try {
      await fs.appendFile("video_coaching.log", logEntry);
    } catch (error) {
      console.log("Logging note:", error.message);
    }
  }
}

// Start the Video Interview Coaching Platform
const videoCoaching = new VideoInterviewCoaching();

module.exports = VideoInterviewCoaching;
