import React, { useState, useRef, useCallback } from 'react';

interface STTResponse {
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
  emotions?: string[];
  events?: string[];
}

interface AudioUploadProps {
  onTranscription: (result: STTResponse) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  provider?: 'azure' | 'siliconflow';
  maxSizeMB?: number;
}

export const AudioUpload: React.FC<AudioUploadProps> = ({
  onTranscription,
  onError,
  disabled = false,
  provider = 'azure',
  maxSizeMB = 10
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const API_URL = import.meta.env.VITE_API_URL || '';

  // Supported audio formats - optimized for Azure Speech Services
  const supportedFormats = [
    'audio/wav',       // wav - best for Azure
    'audio/mpeg',      // mp3
    'audio/m4a',       // m4a
    'audio/mp4',       // mp4
    'audio/flac'       // flac
  ];

  const supportedExtensions = ['wav', 'mp3', 'm4a', 'mp4', 'flac'];

  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File size must be less than ${maxSizeMB}MB`;
    }

    // Check file type
    if (!supportedFormats.includes(file.type)) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !supportedExtensions.includes(extension)) {
        return `Unsupported file format. Supported formats: ${supportedExtensions.join(', ')}`;
      }
    }

    return null;
  }, [maxSizeMB]);

  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      onError?.(error);
      return;
    }

    setUploadedFile(file);
  }, [validateFile, onError]);

  const transcribeFile = useCallback(async () => {
    if (!uploadedFile) {
      onError?.('No file selected');
      return;
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('audio', uploadedFile);

      const endpoint = '/api/stt/file'; // Only Azure endpoint
      
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result: STTResponse = await response.json();
      onTranscription(result);
      
      // Clear file after successful transcription
      setUploadedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Transcription error:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to transcribe audio');
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedFile, onTranscription, onError, provider, API_URL]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 12, 
      padding: 16, 
      border: '1px solid var(--border-color)', 
      borderRadius: 8,
      backgroundColor: 'var(--card-background, rgba(255, 255, 255, 0.05))'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0, fontSize: '1em' }}>Audio File Upload</h4>
        <span style={{ fontSize: '0.8em', color: 'var(--muted-color)' }}>
          Max {maxSizeMB}MB • Azure STT
        </span>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'rgb(59, 130, 246)' : 'var(--border-color)'}`,
          borderRadius: 8,
          padding: 24,
          textAlign: 'center',
          backgroundColor: dragOver ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.2s ease'
        }}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={supportedFormats.join(',')}
          onChange={handleFileInputChange}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        
        {uploadedFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: '2em' }}>🎵</div>
            <div style={{ fontSize: '0.9em', fontWeight: 'bold' }}>{uploadedFile.name}</div>
            <div style={{ fontSize: '0.8em', color: 'var(--muted-color)' }}>
              {formatFileSize(uploadedFile.size)}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: '2em' }}>📎</div>
            <div style={{ fontSize: '0.9em' }}>
              Drag & drop an audio file here, or click to browse
            </div>
            <div style={{ fontSize: '0.8em', color: 'var(--muted-color)' }}>
              Supported formats: {supportedExtensions.join(', ')}
            </div>
          </div>
        )}
      </div>

      {/* Audio Preview and Controls */}
      {uploadedFile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <audio 
            controls 
            src={URL.createObjectURL(uploadedFile)}
            style={{ width: '100%', height: 32 }}
          />
          
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setUploadedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              disabled={isProcessing}
              style={{
                padding: '6px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgb(239, 68, 68)',
                borderRadius: 4,
                color: 'rgb(239, 68, 68)',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.6 : 1,
                fontSize: '0.8em'
              }}
            >
              ❌ Remove
            </button>
            
            <button
              onClick={transcribeFile}
              disabled={isProcessing}
              style={{
                padding: '6px 12px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgb(59, 130, 246)',
                borderRadius: 4,
                color: 'rgb(59, 130, 246)',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.6 : 1,
                fontSize: '0.8em'
              }}
            >
              {isProcessing ? '⏳ Transcribing...' : '📝 Transcribe'}
            </button>
          </div>
        </div>
      )}

      {/* Azure STT Information */}
      <div style={{ 
        fontSize: '0.8em', 
        color: 'var(--muted-color)', 
        padding: 8,
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderRadius: 4,
        border: '1px solid rgba(59, 130, 246, 0.2)'
      }}>
        <strong>Azure Speech Services:</strong>
        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
          <li>High accuracy Chinese speech recognition</li>
          <li>Support for multiple audio formats</li>
          <li>Confidence scoring</li>
        </ul>
      </div>
    </div>
  );
};

export default AudioUpload;