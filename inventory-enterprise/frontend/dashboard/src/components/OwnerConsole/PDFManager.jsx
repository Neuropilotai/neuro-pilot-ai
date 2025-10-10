import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8083';

export default function PDFManager() {
  const { token } = useAuthStore();
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [selectedPDF, setSelectedPDF] = useState(null);

  useEffect(() => {
    loadPDFs();
  }, []);

  const loadPDFs = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/owner/console/pdfs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPdfs(response.data.documents || []);
    } catch (error) {
      toast.error('Failed to load PDFs');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      await axios.post(`${API_BASE_URL}/api/owner/console/pdfs/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      toast.success('PDF uploaded successfully');
      loadPDFs();
    } catch (error) {
      toast.error('Failed to upload PDF');
      console.error(error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (documentId) => {
    if (!confirm('Are you sure you want to delete this PDF?')) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/owner/console/pdfs/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('PDF deleted successfully');
      setPdfs(pdfs.filter(pdf => pdf.id !== documentId));
      if (selectedPDF?.id === documentId) {
        setSelectedPDF(null);
      }
    } catch (error) {
      toast.error('Failed to delete PDF');
      console.error(error);
    }
  };

  const handlePreview = (pdf) => {
    setSelectedPDF(pdf);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">PDF Management</h2>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
            id="pdf-upload"
          />
          <label
            htmlFor="pdf-upload"
            className={`
              inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white
              ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
            `}
          >
            {uploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload PDF
              </>
            )}
          </label>
        </div>
      </div>

      {/* PDF List and Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PDF List */}
        <div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">
            All PDFs ({pdfs.length})
          </h3>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : pdfs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="mt-4">No PDFs uploaded yet</p>
              <p className="text-sm mt-2">Upload your first PDF to get started</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {pdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  className={`
                    p-4 rounded-lg border-2 cursor-pointer transition-all
                    ${selectedPDF?.id === pdf.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                    }
                  `}
                  onClick={() => handlePreview(pdf)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h6v4H7V5zm6 6H7v2h6v-2z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium text-slate-900 dark:text-white truncate">
                          {pdf.filename}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
                        <span>{formatFileSize(pdf.sizeBytes)}</span>
                        <span>{formatDate(pdf.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(pdf.id);
                      }}
                      className="ml-4 text-red-600 hover:text-red-800 dark:hover:text-red-400"
                      title="Delete PDF"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PDF Preview */}
        <div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Preview</h3>
          {selectedPDF ? (
            <div className="border-2 border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-800 p-3 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                  {selectedPDF.filename}
                </span>
                <a
                  href={`${API_BASE_URL}/api/owner/console/pdfs/${selectedPDF.id}/preview?token=${token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                >
                  Open in New Tab
                </a>
              </div>
              <iframe
                src={`${API_BASE_URL}/api/owner/console/pdfs/${selectedPDF.id}/preview?token=${token}`}
                className="w-full h-96"
                title={selectedPDF.filename}
              />
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg h-96 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <p className="mt-4">Select a PDF to preview</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
