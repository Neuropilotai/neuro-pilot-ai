/**
 * System Health Forecast Component
 * Displays AI-predicted system health risk with driver analysis
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
  LinearProgress,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  Warning as WarningIcon,
  CheckCircle as HealthyIcon,
  Error as CriticalIcon,
  Speed as LatencyIcon,
  Storage as CacheIcon,
  Memory as DbIcon,
  ShowChart as ForecastIcon
} from '@mui/icons-material';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8083';

const SystemHealthForecast = () => {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    fetchForecast();

    // Poll every 60 seconds
    const interval = setInterval(fetchForecast, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchForecast = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE}/api/owner/ai/predict/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setForecast(response.data.forecast);
      setLastUpdate(new Date());
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch health forecast:', err);
      setError(err.response?.data?.error || 'Failed to load health forecast');
      setLoading(false);
    }
  };

  const getRiskColor = (riskPct) => {
    if (riskPct < 30) return 'success';
    if (riskPct < 60) return 'warning';
    return 'error';
  };

  const getRiskLevel = (riskPct) => {
    if (riskPct < 30) return 'Low';
    if (riskPct < 60) return 'Medium';
    return 'High';
  };

  const getRiskIcon = (riskPct) => {
    if (riskPct < 30) return <HealthyIcon sx={{ fontSize: 48, color: 'success.main' }} />;
    if (riskPct < 60) return <WarningIcon sx={{ fontSize: 48, color: 'warning.main' }} />;
    return <CriticalIcon sx={{ fontSize: 48, color: 'error.main' }} />;
  };

  const getTrendIcon = (trend) => {
    if (trend === 'improving') return <TrendingDown sx={{ color: 'success.main' }} />;
    if (trend === 'degrading') return <TrendingUp sx={{ color: 'error.main' }} />;
    return <TrendingFlat sx={{ color: 'text.secondary' }} />;
  };

  const getDriverIcon = (driver) => {
    const icons = {
      latency_spike: <LatencyIcon />,
      error_rate: <CriticalIcon />,
      cache_degradation: <CacheIcon />,
      db_errors: <DbIcon />,
      forecast_accuracy: <ForecastIcon />
    };
    return icons[driver] || <WarningIcon />;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!forecast) {
    return <Alert severity="info">No health forecast available</Alert>;
  }

  const { riskPct, riskLevel, drivers, recommendations, confidence } = forecast;

  return (
    <Box>
      {/* Header */}
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" component="h2">
          System Health Forecast
        </Typography>
        {lastUpdate && (
          <Typography variant="caption" color="text.secondary">
            Updated {lastUpdate.toLocaleTimeString()}
          </Typography>
        )}
      </Box>

      {/* Risk Overview Card */}
      <Card elevation={3} sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4} textAlign="center">
              {getRiskIcon(riskPct)}
              <Typography variant="h3" component="div" sx={{ mt: 1 }}>
                {riskPct}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Risk Level: {riskLevel}
              </Typography>
            </Grid>

            <Grid item xs={12} md={8}>
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2">Health Risk (Next 24h)</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {riskPct}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={riskPct}
                  color={getRiskColor(riskPct)}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>

              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2">Prediction Confidence</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {(confidence * 100).toFixed(0)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={confidence * 100}
                  color="primary"
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>

              <Box display="flex" gap={1} mt={2}>
                <Chip
                  label={`${getRiskLevel(riskPct)} Risk`}
                  color={getRiskColor(riskPct)}
                  size="small"
                />
                <Chip
                  label={`${drivers.length} Risk Drivers`}
                  color="default"
                  size="small"
                  variant="outlined"
                />
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Risk Drivers */}
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" component="h3" gutterBottom>
            Risk Drivers
          </Typography>
          <List>
            {drivers.map((driver, index) => (
              <ListItem key={index} divider={index < drivers.length - 1}>
                <ListItemIcon>
                  {getDriverIcon(driver.driver)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="body1">
                        {driver.driver.replace(/_/g, ' ').toUpperCase()}
                      </Typography>
                      <Box display="flex" gap={1} alignItems="center">
                        {getTrendIcon(driver.trend)}
                        <Chip
                          label={`Weight: ${(driver.weight * 100).toFixed(0)}%`}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    </Box>
                  }
                  secondary={
                    <Box mt={1}>
                      <Typography variant="body2" color="text.secondary">
                        {driver.description}
                      </Typography>
                      <Box mt={0.5}>
                        <LinearProgress
                          variant="determinate"
                          value={driver.weight * 100}
                          sx={{ height: 4, borderRadius: 2 }}
                        />
                      </Box>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card elevation={2}>
        <CardContent>
          <Typography variant="h6" component="h3" gutterBottom>
            AI Recommendations
          </Typography>
          <List>
            {recommendations.map((rec, index) => (
              <ListItem key={index}>
                <ListItemIcon>
                  <CheckCircle sx={{ color: 'primary.main' }} />
                </ListItemIcon>
                <ListItemText primary={rec} />
              </ListItem>
            ))}
          </List>

          {riskPct >= 60 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <strong>High Risk Detected:</strong> Consider reviewing the recommendations above and taking immediate action to prevent system degradation.
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SystemHealthForecast;
