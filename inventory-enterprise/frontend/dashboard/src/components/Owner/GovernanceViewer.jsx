/**
 * Governance Viewer Component
 * Displays weekly governance reports with KPIs and system improvements
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
  CircularProgress,
  Alert,
  Button,
  Grid,
  Chip,
  Divider,
  Paper
} from '@mui/material';
import {
  Assessment as ReportIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Security as SecurityIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8083';

const GovernanceViewer = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchLatestReport();
  }, []);

  const fetchLatestReport = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE}/api/owner/ai/governance/report/latest`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setReport(response.data.report);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch governance report:', err);
      setError(err.response?.data?.error || 'Failed to load governance report');
    } finally {
      setLoading(false);
    }
  };

  const generateNewReport = async () => {
    setGenerating(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_BASE}/api/owner/ai/governance/report/generate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Fetch the newly generated report
      await fetchLatestReport();

      setError(null);
    } catch (err) {
      console.error('Failed to generate report:', err);
      setError(err.response?.data?.error || 'Failed to generate governance report');
    } finally {
      setGenerating(false);
    }
  };

  const downloadReport = () => {
    if (!report?.content) return;

    const blob = new Blob([report.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `governance_report_${report.weekEnd}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Typography variant="h5" component="h2">
          <ReportIcon style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Governance Reports
        </Typography>

        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchLatestReport}
            disabled={loading}
          >
            Refresh
          </Button>

          <Button
            variant="contained"
            color="primary"
            startIcon={<ReportIcon />}
            onClick={generateNewReport}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate Report'}
          </Button>

          {report?.content && (
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadReport}
            >
              Download
            </Button>
          )}
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* No Report Available */}
      {!report && !error && (
        <Alert severity="info">
          No governance report available. Click "Generate Report" to create one.
        </Alert>
      )}

      {/* Report Content */}
      {report && (
        <>
          {/* Report Metadata */}
          <Card elevation={2} sx={{ mb: 3 }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Report Period
                  </Typography>
                  <Typography variant="h6">
                    {report.weekStart} to {report.weekEnd}
                  </Typography>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Box display="flex" gap={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                    {report.kpis?.proposals && (
                      <Chip
                        icon={<CheckIcon />}
                        label={`${report.kpis.proposals.applied} Proposals Applied`}
                        color="success"
                        size="small"
                      />
                    )}
                    {report.kpis?.security && (
                      <Chip
                        icon={<SecurityIcon />}
                        label={`${report.kpis.security.total} Security Findings`}
                        color={report.kpis.security.critical > 0 ? 'error' : 'default'}
                        size="small"
                      />
                    )}
                    {report.kpis?.forecastMAPE !== undefined && (
                      <Chip
                        icon={<TrendingUpIcon />}
                        label={`${(report.kpis.forecastMAPE * 100).toFixed(1)}% MAPE`}
                        color={report.kpis.forecastMAPE < 0.15 ? 'success' : 'warning'}
                        size="small"
                      />
                    )}
                  </Box>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* KPI Summary Grid */}
              {report.kpis && (
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                      <Typography variant="h4" color="primary">
                        {report.kpis.proposals?.total || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        AI Proposals
                      </Typography>
                    </Paper>
                  </Grid>

                  <Grid item xs={6} sm={3}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                      <Typography variant="h4" color="success.main">
                        {report.kpis.proposals?.applied || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Applied
                      </Typography>
                    </Paper>
                  </Grid>

                  <Grid item xs={6} sm={3}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                      <Typography variant="h4" color={report.kpis.security?.critical > 0 ? 'error.main' : 'text.primary'}>
                        {report.kpis.security?.critical || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Critical Findings
                      </Typography>
                    </Paper>
                  </Grid>

                  <Grid item xs={6} sm={3}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                      <Typography variant="h4" color="info.main">
                        {report.kpis.feedback?.avg_rating?.toFixed(1) || 'N/A'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Avg Rating
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>

          {/* Report Content (Markdown) */}
          {report.content && (
            <Card elevation={1}>
              <CardContent>
                <Box
                  sx={{
                    '& h1': { fontSize: '2rem', fontWeight: 600, mb: 2, mt: 3 },
                    '& h2': { fontSize: '1.5rem', fontWeight: 600, mb: 2, mt: 3, borderBottom: '2px solid #e0e0e0', pb: 1 },
                    '& h3': { fontSize: '1.25rem', fontWeight: 600, mb: 1, mt: 2 },
                    '& p': { mb: 2, lineHeight: 1.7 },
                    '& ul': { mb: 2, pl: 3 },
                    '& li': { mb: 0.5 },
                    '& table': { width: '100%', borderCollapse: 'collapse', mb: 2 },
                    '& th': { textAlign: 'left', p: 1, borderBottom: '2px solid #e0e0e0', fontWeight: 600 },
                    '& td': { p: 1, borderBottom: '1px solid #f0f0f0' },
                    '& code': { bgcolor: 'background.default', p: 0.5, borderRadius: 1, fontFamily: 'monospace' },
                    '& pre': { bgcolor: 'background.default', p: 2, borderRadius: 1, overflow: 'auto' },
                    '& hr': { my: 3, border: 'none', borderTop: '1px solid #e0e0e0' }
                  }}
                >
                  <ReactMarkdown>{report.content}</ReactMarkdown>
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
};

export default GovernanceViewer;
