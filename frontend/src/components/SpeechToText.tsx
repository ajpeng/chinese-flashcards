import React, { useState, useRef, useCallback } from 'react';

interface STTResponse {
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
  emotions?: string[];
  events?: string[];
}

interface SpeechToTextProps {
  onTranscription: (result: STTResponse) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  language?: string;
  provider?: 'azure';
}

export const SpeechToText: React.FC<SpeechToTextProps> = ({
  onTranscription,
  onError,
  disabled = false,
  provider = 'azure'
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  
  const API_URL = import.meta.env.VITE_API_URL || '';

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });

      // Try different audio formats based on browser support
      // Prefer formats that work well with Azure Speech Services
      const supportedFormats = [
        'audio/wav',
        'audio/webm;codecs=pcm', // PCM in WebM container
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ];
      
      let mimeType = 'audio/webm;codecs=opus'; // Default fallback
      for (const format of supportedFormats) {
        if (MediaRecorder.isTypeSupported(format)) {
          mimeType = format;
          break;
        }
      }

      console.log('Using audio format:', mimeType);
      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingTime(0);

      // Start recording timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      onError?.('Failed to access microphone. Please check permissions.');
    }
  }, [onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  const transcribeAudio = useCallback(async () => {
    if (!audioBlob) {
      onError?.('No audio recorded');
      return;
    }

    setIsProcessing(true);

    try {
      const formData = new FormData();
      // Create file with appropriate extension based on blob type
      const extension = audioBlob.type.includes('wav') ? 'wav' : 
                       audioBlob.type.includes('webm') ? 'webm' : 
                       audioBlob.type.includes('mp4') ? 'mp4' : 
                       audioBlob.type.includes('ogg') ? 'ogg' : 'wav';
      const audioFile = new File([audioBlob], `recording.${extension}`, { type: audioBlob.type });
      formData.append('audio', audioFile);

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
      
      // Clear audio blob after successful transcription
      setAudioBlob(null);
      setRecordingTime(0);

    } catch (error) {
      console.error('Transcription error:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to transcribe audio');
    } finally {
      setIsProcessing(false);
    }
  }, [audioBlob, onTranscription, onError, provider, API_URL]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
        <h4 style={{ margin: 0, fontSize: '1em' }}>Speech to Text</h4>
        <span style={{ fontSize: '0.8em', color: 'var(--muted-color)' }}>
          Azure STT
        </span>
      </div>

      {/* Recording Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || isProcessing}
          style={{
            padding: '8px 16px',
            backgroundColor: isRecording ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${isRecording ? 'rgb(220, 38, 38)' : 'rgb(34, 197, 94)'}`,
            borderRadius: 4,
            color: isRecording ? 'rgb(220, 38, 38)' : 'rgb(34, 197, 94)',
            cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
            opacity: disabled || isProcessing ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {isRecording ? '⏹️ Stop' : '🎤 Record'}
          {isRecording && (
            <span style={{ 
              width: 8, 
              height: 8, 
              backgroundColor: 'rgb(220, 38, 38)', 
              borderRadius: '50%',
              animation: 'pulse 1s infinite'
            }} />
          )}
        </button>

        {isRecording && (
          <span style={{ fontSize: '0.9em', color: 'var(--muted-color)', fontFamily: 'monospace' }}>
            {formatTime(recordingTime)}
          </span>
        )}

        {audioBlob && !isRecording && (
          <button
            onClick={transcribeAudio}
            disabled={isProcessing}
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgb(59, 130, 246)',
              borderRadius: 4,
              color: 'rgb(59, 130, 246)',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.6 : 1
            }}
          >
            {isProcessing ? '⏳ Processing...' : '📝 Transcribe'}
          </button>
        )}
      </div>

      {/* Audio Preview */}
      {audioBlob && (
        <div style={{ marginTop: 8 }}>
          <audio 
            controls 
            src={URL.createObjectURL(audioBlob)}
            style={{ width: '100%', height: 32 }}
          />
          <p style={{ fontSize: '0.8em', color: 'var(--muted-color)', margin: '4px 0 0 0' }}>
            Recorded {formatTime(recordingTime)} of audio
          </p>
        </div>
      )}

      {/* Instructions */}
      <div style={{ fontSize: '0.8em', color: 'var(--muted-color)' }}>
        {isRecording ? (
          <span style={{ color: 'rgb(220, 38, 38)' }}>🔴 Recording... Speak clearly in Chinese</span>
        ) : audioBlob ? (
          'Click "Transcribe" to convert speech to text'
        ) : (
          'Click "Record" to start capturing audio for transcription'
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default SpeechToText;