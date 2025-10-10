import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  Button,
  Divider,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton
} from '@mui/material';
import { Close, CheckCircle } from '@mui/icons-material';

const SelectionDrawer = ({ open, selectedCount, onClose, onMarkProcessed }) => {
  const [countId, setCountId] = useState('');
  const [availableCounts, setAvailableCounts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load available counts
  useEffect(() => {
    if (open) {
      loadAvailableCounts();
    }
  }, [open]);

  const loadAvailableCounts = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('http://localhost:8083/api/owner/console/counts/recent', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setAvailableCounts(result.data.slice(0, 10)); // Last 10 counts
        }
      }
    } catch (error) {
      console.error('Error loading counts:', error);
    }
  };

  const handleSubmit = () => {
    if (!countId || !countId.trim()) {
      alert('Please enter or select a Count ID');
      return;
    }

    setLoading(true);
    onMarkProcessed(countId.trim());
    setLoading(false);
    setCountId('');
  };

  const handleClose = () => {
    setCountId('');
    onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 400 }, p: 3 }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Bulk Actions</Typography>
        <IconButton onClick={handleClose}>
          <Close />
        </IconButton>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Alert severity="info" sx={{ mb: 3 }}>
        <strong>{selectedCount}</strong> invoice{selectedCount !== 1 ? 's' : ''} selected
      </Alert>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Mark the selected invoices as processed and link them to an inventory count.
      </Typography>

      {/* Count Selection */}
      {availableCounts.length > 0 && (
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Select Recent Count</InputLabel>
          <Select
            value={countId}
            label="Select Recent Count"
            onChange={(e) => setCountId(e.target.value)}
          >
            <MenuItem value="">
              <em>None - Enter Custom ID</em>
            </MenuItem>
            {availableCounts.map((count) => (
              <MenuItem key={count.count_id} value={count.count_id}>
                Count {count.count_id} - {new Date(count.count_date).toLocaleDateString()}
                {count.count_type && ` (${count.count_type})`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Manual Count ID Entry */}
      <TextField
        fullWidth
        label="Or Enter Count ID"
        placeholder="e.g., COUNT_2025_001"
        value={countId}
        onChange={(e) => setCountId(e.target.value)}
        helperText="The inventory count session ID to link these invoices to"
        sx={{ mb: 3 }}
      />

      <Button
        fullWidth
        variant="contained"
        color="primary"
        size="large"
        startIcon={<CheckCircle />}
        onClick={handleSubmit}
        disabled={!countId || loading}
      >
        Mark as Processed & Link
      </Button>

      <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
        <Typography variant="caption" display="block" gutterBottom>
          <strong>What happens:</strong>
        </Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          • {selectedCount} invoice{selectedCount !== 1 ? 's' : ''} will be marked as "processed"
        </Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          • They will be linked to Count ID: {countId || '(not entered)'}
        </Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          • Invoices after your cutoff date will remain unprocessed
        </Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          • This action is audited and logged
        </Typography>
      </Box>
    </Drawer>
  );
};

export default SelectionDrawer;
