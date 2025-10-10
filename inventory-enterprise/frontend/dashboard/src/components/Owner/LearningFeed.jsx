/**
 * Learning Feed Component - AI Tuning Recommendations
 * Displays autonomous learning proposals with approval workflow
 *
 * @version 3.0.0
 * @author NeuroInnovate AI Team
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  CircularProgress,
  Alert,
  LinearProgress,
  IconButton,
  Collapse,
  Grid,
  Tooltip
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  ExpandMore as ExpandIcon,
  TrendingUp as ImpactIcon,
  Psychology as AIIcon,
  Settings as ConfigIcon
} from '@mui/icons-material';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8083';

const LearningFeed = () => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  // Fetch recommendations on mount
  useEffect(() => {
    fetchRecommendations();

    // Poll every 30 seconds for new recommendations
    const interval = setInterval(fetchRecommendations, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRecommendations = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE}/api/owner/ai/learning/recommendations`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { status: 'pending', limit: 20 }
      });

      setRecommendations(response.data.recommendations || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
      setError(err.response?.data?.error || 'Failed to load recommendations');
      setLoading(false);
    }
  };

  const handleApprove = async (proposalId) => {
    setProcessingId(proposalId);

    try {
      const token = localStorage.getItem('authToken');
      await axios.post(
        `${API_BASE}/api/owner/ai/learning/approve`,
        { proposalId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Remove from pending list
      setRecommendations(prev => prev.filter(r => r.id !== proposalId));

      // Show success message
      setError(null);
    } catch (err) {
      console.error('Failed to approve proposal:', err);
      setError(err.response?.data?.error || 'Failed to approve proposal');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'warning',
      approved: 'info',
      applied: 'success',
      rejected: 'error'
    };
    return colors[status] || 'default';
  };

  const getCategoryIcon = (category) => {
    const icons = {
      cache: <ConfigIcon />,
      forecast: <AIIcon />,
      database: <ConfigIcon />,
      security: <ConfigIcon />
    };
    return icons[category] || <ConfigIcon />;
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.85) return 'success';
    if (confidence >= 0.70) return 'warning';
    return 'error';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" component="h2">
          <AIIcon style={{ verticalAlign: 'middle', marginRight: 8 }} />
          AI Learning Feed
        </Typography>
        <Chip
          label={`${recommendations.length} Pending`}
          color="primary"
          variant="outlined"
        />
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Recommendations List */}
      {recommendations.length === 0 ? (
        <Alert severity="info">
          No pending recommendations. The AI is analyzing system performance and will generate proposals soon.
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {recommendations.map((rec) => (
            <Grid item xs={12} key={rec.id}>
              <Card
                elevation={expandedId === rec.id ? 4 : 1}
                sx={{
                  transition: 'all 0.3s',
                  border: rec.confidence >= 0.85 ? '2px solid #4caf50' : 'none'
                }}
              >
                <CardContent>
                  {/* Header Row */}
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box display="flex" alignItems="center" gap={1} flex={1}>
                      {getCategoryIcon(rec.category)}
                      <Box flex={1}>
                        <Typography variant="h6" component="h3">
                          {rec.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {rec.description}
                        </Typography>
                      </Box>
                    </Box>

                    <Box display="flex" gap={1} alignItems="center">
                      <Chip
                        label={rec.status}
                        color={getStatusColor(rec.status)}
                        size="small"
                      />
                      <IconButton
                        size="small"
                        onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                      >
                        <ExpandIcon
                          sx={{
                            transform: expandedId === rec.id ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.3s'
                          }}
                        />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Metrics Row */}
                  <Box display="flex" gap={2} mt={2} flexWrap="wrap">
                    <Tooltip title="Confidence Score">
                      <Chip
                        icon={<AIIcon />}
                        label={`${(rec.confidence * 100).toFixed(0)}% Confidence`}
                        color={getConfidenceColor(rec.confidence)}
                        size="small"
                        variant="outlined"
                      />
                    </Tooltip>

                    <Tooltip title="Expected Impact">
                      <Chip
                        icon={<ImpactIcon />}
                        label={`${rec.expectedImpact > 0 ? '+' : ''}${rec.expectedImpact.toFixed(1)}% Impact`}
                        color="primary"
                        size="small"
                        variant="outlined"
                      />
                    </Tooltip>
                  </Box>

                  {/* Expanded Details */}
                  <Collapse in={expandedId === rec.id}>
                    <Box mt={3}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2" color="text.secondary">
                            Current Value
                          </Typography>
                          <Typography variant="body1" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                            {rec.currentValue || 'N/A'}
                          </Typography>
                        </Grid>

                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2" color="text.secondary">
                            Proposed Value
                          </Typography>
                          <Typography
                            variant="body1"
                            sx={{ fontFamily: 'monospace', mt: 0.5, color: 'success.main' }}
                          >
                            {rec.proposedValue || 'N/A'}
                          </Typography>
                        </Grid>
                      </Grid>

                      <Box mt={2}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Proposal ID
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                          {rec.proposalId}
                        </Typography>
                      </Box>

                      <Box mt={2}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Created At
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {new Date(rec.createdAt).toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  </Collapse>

                  {/* Action Buttons */}
                  {rec.status === 'pending' && (
                    <Box display="flex" gap={1} mt={2}>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        startIcon={<ApproveIcon />}
                        onClick={() => handleApprove(rec.id)}
                        disabled={processingId === rec.id}
                      >
                        {processingId === rec.id ? 'Approving...' : 'Approve'}
                      </Button>

                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<RejectIcon />}
                        disabled={processingId === rec.id}
                      >
                        Reject
                      </Button>
                    </Box>
                  )}

                  {/* Auto-Apply Indicator */}
                  {rec.confidence >= 0.85 && (
                    <Box mt={2}>
                      <Alert severity="success" icon={<AIIcon />}>
                        <strong>High Confidence:</strong> This proposal will be auto-applied during the next scheduled optimization window.
                      </Alert>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default LearningFeed;
