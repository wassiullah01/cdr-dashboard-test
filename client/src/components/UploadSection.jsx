import React, { useState, useRef } from 'react';
import axios from 'axios';
import '../styles/filters.css';
import '../styles/dashboard.css';

function UploadSection({ onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['csv', 'xls', 'xlsx'].includes(ext);
    });

    if (validFiles.length !== selectedFiles.length) {
      setError('Some files were skipped. Only CSV, XLS, and XLSX files are allowed.');
    } else {
      setError(null);
    }

    if (validFiles.length > 0) {
      // Append new files to existing ones, avoiding duplicates
      setFiles(prevFiles => {
        const existingNames = new Set(prevFiles.map(f => f.name));
        const newFiles = validFiles.filter(file => !existingNames.has(file.name));
        return [...prevFiles, ...newFiles];
      });
    }

    // Note: We don't reset the input here to allow the native input to show selected files
    // The input will be reset when all files are removed or after successful upload
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress('Uploading files...');

    try {
      // Step 1: Upload files
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const uploadResponse = await axios.post('/api/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setUploadProgress('Processing files...');

      // Step 2: Ingest files
      const ingestResponse = await axios.post('/api/ingest', {
        files: uploadResponse.data.files
      });

      setUploadProgress(null);
      
      // Reset files and input after successful upload
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Pass full response data including uploadSessionId
      onUploadComplete(ingestResponse.data);

    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed');
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = (index) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    
    // Reset the file input when all files are removed
    if (newFiles.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container section">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Upload CDR Files</h2>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <label style={{
            display: 'block',
            marginBottom: 'var(--spacing-sm)',
            fontWeight: 500,
            color: 'var(--text-secondary)'
          }}>
            Select Files (CSV, XLS, XLSX)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.xls,.xlsx"
            onChange={handleFileChange}
            disabled={uploading}
            style={{
              width: '100%',
              padding: 'var(--spacing-md)',
              border: '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'border-color 0.2s'
            }}
          />
        </div>

        {files.length > 0 && (
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <h3 style={{ 
              fontSize: '1rem', 
              marginBottom: 'var(--spacing-md)',
              color: 'var(--text-secondary)'
            }}>
              Selected Files ({files.length})
            </h3>
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 'var(--spacing-sm)' 
            }}>
              {files.map((file, index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)'
                }}>
                  <span style={{ fontSize: '0.875rem' }}>{file.name}</span>
                  <button
                    onClick={() => handleRemoveFile(index)}
                    disabled={uploading}
                    style={{
                      background: 'var(--error-color)',
                      color: 'white',
                      padding: 'var(--spacing-xs) var(--spacing-sm)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      border: 'none'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploadProgress && (
          <div style={{
            padding: 'var(--spacing-md)',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--spacing-md)',
            textAlign: 'center',
            color: 'var(--text-secondary)'
          }}>
            {uploadProgress}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || files.length === 0}
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          {uploading ? 'Processing...' : 'Upload and Process Files'}
        </button>
      </div>
    </div>
  );
}

export default UploadSection;
