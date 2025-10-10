import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  IconButton
} from '@mui/material';
import { Close, Download } from '@mui/icons-material';

const PreviewModal = ({ open, document, onClose }) => {
  if (!document) return null;

  const previewUrl = `http://localhost:8083${document.previewUrl}?token=${localStorage.getItem('accessToken')}`;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = document.filename;
    link.click();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '90vh' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6">{document.filename}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            {document.isProcessed && <Chip label="Processed" color="success" size="small" />}
            {document.invoiceNumber && (
              <Chip label={`Invoice: ${document.invoiceNumber}`} size="small" variant="outlined" />
            )}
            {document.sizeMB && (
              <Chip label={`${document.sizeMB} MB`} size="small" variant="outlined" />
            )}
          </Box>
        </Box>
        <IconButton onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box
          component="iframe"
          src={previewUrl}
          sx={{
            width: '100%',
            height: '100%',
            border: 'none'
          }}
          title={document.filename}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={handleDownload} startIcon={<Download />}>
          Download
        </Button>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PreviewModal;
