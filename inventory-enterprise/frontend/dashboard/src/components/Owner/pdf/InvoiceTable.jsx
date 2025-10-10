import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  IconButton,
  Chip,
  Tooltip,
  Typography
} from '@mui/material';
import { Visibility, CheckCircle, PendingActions } from '@mui/icons-material';

const InvoiceTable = ({ documents, selectedIds, onToggleSelection, onPreview }) => {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Tooltip title="Select for bulk processing">
                <span>Select</span>
              </Tooltip>
            </TableCell>
            <TableCell><strong>Invoice #</strong></TableCell>
            <TableCell><strong>File Name</strong></TableCell>
            <TableCell><strong>Created At</strong></TableCell>
            <TableCell><strong>Size</strong></TableCell>
            <TableCell><strong>Status</strong></TableCell>
            <TableCell><strong>Linked Count</strong></TableCell>
            <TableCell><strong>SHA256</strong></TableCell>
            <TableCell align="center"><strong>Actions</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {documents.map((doc) => (
            <TableRow
              key={doc.id}
              hover
              sx={{
                backgroundColor: doc.isProcessed ? 'rgba(76, 175, 80, 0.08)' : 'inherit',
                '&:hover': {
                  backgroundColor: doc.isProcessed ? 'rgba(76, 175, 80, 0.15)' : 'rgba(0, 0, 0, 0.04)'
                }
              }}
            >
              <TableCell padding="checkbox">
                {!doc.isProcessed && (
                  <Checkbox
                    checked={selectedIds.has(doc.id)}
                    onChange={() => onToggleSelection(doc.id)}
                    color="primary"
                  />
                )}
              </TableCell>

              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {doc.invoiceNumber || 'N/A'}
                </Typography>
                {doc.invoiceDate && (
                  <Typography variant="caption" color="text.secondary">
                    {new Date(doc.invoiceDate).toLocaleDateString()}
                  </Typography>
                )}
              </TableCell>

              <TableCell>
                <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                  {doc.filename}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography variant="body2">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(doc.createdAt).toLocaleTimeString()}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography variant="body2">
                  {doc.sizeMB ? `${doc.sizeMB} MB` : 'N/A'}
                </Typography>
              </TableCell>

              <TableCell>
                {doc.isProcessed ? (
                  <Chip
                    icon={<CheckCircle />}
                    label="Processed"
                    color="success"
                    size="small"
                  />
                ) : (
                  <Chip
                    icon={<PendingActions />}
                    label="Unprocessed"
                    color="warning"
                    size="small"
                  />
                )}
              </TableCell>

              <TableCell>
                {doc.linkedCountId ? (
                  <Chip label={`Count ${doc.linkedCountId}`} size="small" color="primary" variant="outlined" />
                ) : (
                  <Typography variant="body2" color="text.secondary">-</Typography>
                )}
              </TableCell>

              <TableCell>
                <Tooltip title={doc.sha256 || 'No hash'}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: 'text.secondary'
                    }}
                  >
                    {doc.sha256Truncated || 'N/A'}
                  </Typography>
                </Tooltip>
              </TableCell>

              <TableCell align="center">
                <Tooltip title="Preview PDF">
                  <IconButton
                    color="primary"
                    size="small"
                    onClick={() => onPreview(doc)}
                  >
                    <Visibility />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {documents.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
          No invoices to display
        </Typography>
      )}
    </TableContainer>
  );
};

export default InvoiceTable;
