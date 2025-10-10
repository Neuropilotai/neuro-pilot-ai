import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Paper,
  Grid,
  Alert,
  Snackbar,
  CircularProgress
} from '@mui/material';
import {  PictureAsPdf, FilterList, Refresh } from '@mui/icons-material';
import InvoiceTable from '../components/Owner/pdf/InvoiceTable';
import PreviewModal from '../components/Owner/pdf/PreviewModal';
import SelectionDrawer from '../components/Owner/pdf/SelectionDrawer';

const PDFInvoiceManager = () => {
  const [documents, setDocuments] = useState([]);
  const [filteredDocs, setFilteredDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [cutoffDate, setCutoffDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Preview
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Summary stats
  const [summary, setSummary] = useState({
    total: 0,
    processed: 0,
    unprocessed: 0
  });

  // Load PDFs
  const loadPDFs = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams({
        status: statusFilter
      });

      if (statusFilter === 'unprocessed' && cutoffDate) {
        params.append('cutoff', cutoffDate);
      }

      const response = await fetch(`http://localhost:8083/api/owner/pdfs?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        setDocuments(result.data);
        setFilteredDocs(result.data);
        setSummary(result.summary);
      } else {
        throw new Error(result.error || 'Failed to load PDFs');
      }
    } catch (err) {
      console.error('Error loading PDFs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Apply search filter
  useEffect(() => {
    if (!searchQuery) {
      setFilteredDocs(documents);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = documents.filter(doc =>
      doc.filename?.toLowerCase().includes(query) ||
      doc.invoiceNumber?.toLowerCase().includes(query) ||
      doc.sha256Truncated?.toLowerCase().includes(query)
    );

    setFilteredDocs(filtered);
  }, [searchQuery, documents]);

  // Load on mount and when filters change
  useEffect(() => {
    loadPDFs();
  }, [statusFilter, cutoffDate]);

  // Handle selection toggle
  const toggleSelection = (docId) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedIds(newSelected);

    // Open drawer if selections exist
    if (newSelected.size > 0) {
      setDrawerOpen(true);
    } else {
      setDrawerOpen(false);
    }
  };

  // Handle bulk mark as processed
  const handleMarkProcessed = async (countId) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('http://localhost:8083/api/owner/pdfs/mark-processed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceIds: Array.from(selectedIds),
          countId,
          processedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        setSuccess(`Successfully processed ${result.data.processedInvoicesCreated} invoices and linked ${result.data.linkedCount} to count ${countId}`);
        setSelectedIds(new Set());
        setDrawerOpen(false);
        loadPDFs(); // Reload list
      } else {
        throw new Error(result.error || 'Failed to mark as processed');
      }
    } catch (err) {
      console.error('Error marking as processed:', err);
      setError(err.message);
    }
  };

  // Handle preview
  const handlePreview = (doc) => {
    setPreviewDoc(doc);
    setPreviewOpen(true);
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PictureAsPdf fontSize="large" />
          PDF Invoice Manager
        </Typography>
        <Typography variant="body1" color="text.secondary">
          View, filter, and manage PDF invoices for inventory counts
        </Typography>
      </Box>

      {/* Statistics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="primary">{summary.total}</Typography>
            <Typography variant="body2" color="text.secondary">Total PDFs</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="warning.main">{summary.unprocessed}</Typography>
            <Typography variant="body2" color="text.secondary">Unprocessed</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h3" color="success.main">{summary.processed}</Typography>
            <Typography variant="body2" color="text.secondary">Processed</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="unprocessed">Unprocessed</MenuItem>
                <MenuItem value="processed">Processed</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              type="date"
              label="Cutoff Date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={statusFilter !== 'unprocessed'}
              helperText={statusFilter === 'unprocessed' ? 'Show unprocessed up to this date' : ''}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Search"
              placeholder="Search by filename, invoice #, or SHA256..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={2}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Refresh />}
              onClick={loadPDFs}
              disabled={loading}
            >
              Refresh
            </Button>
          </Grid>
        </Grid>

        {statusFilter === 'unprocessed' && cutoffDate && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>Cutoff Mode:</strong> Showing unprocessed invoices up to {cutoffDate}.
            Invoices after this date will remain pending for the next count.
          </Alert>
        )}
      </Paper>

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Error Alert */}
      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>

      {/* Success Alert */}
      <Snackbar open={!!success} autoHideDuration={6000} onClose={() => setSuccess(null)}>
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      </Snackbar>

      {/* Invoice Table */}
      {!loading && filteredDocs.length > 0 && (
        <InvoiceTable
          documents={filteredDocs}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          onPreview={handlePreview}
        />
      )}

      {/* Empty State */}
      {!loading && filteredDocs.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No PDFs found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Try adjusting your filters or check if PDFs have been uploaded
          </Typography>
        </Paper>
      )}

      {/* Selection Drawer */}
      <SelectionDrawer
        open={drawerOpen}
        selectedCount={selectedIds.size}
        onClose={() => setDrawerOpen(false)}
        onMarkProcessed={handleMarkProcessed}
      />

      {/* Preview Modal */}
      <PreviewModal
        open={previewOpen}
        document={previewDoc}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewDoc(null);
        }}
      />
    </Container>
  );
};

export default PDFInvoiceManager;
