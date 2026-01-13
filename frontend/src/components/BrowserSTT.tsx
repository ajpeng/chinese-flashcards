import React, { useState, useCallback, useRef, useEffect } from 'react';

interface STTResponse {
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
}

interface BrowserSTTProps {
  onTranscription: (result: STTResponse) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  language?: string;
}

// Extend Window interface for webkitSpeechRecognition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export const BrowserSTT: React.FC<BrowserSTTProps> = ({
  onTranscription,
  onError,
  disabled = false,
  language = 'zh-CN'
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('');
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentTranscript = finalTranscript || interimTranscript;
        setTranscript(currentTranscript);

        if (finalTranscript) {
          const result: STTResponse = {
            text: finalTranscript.trim(),
            confidence: event.results[0][0].confidence,
            language: language
          };
          onTranscription(result);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        let errorMessage = 'Speech recognition error';
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'No speech was detected';
            break;
          case 'audio-capture':
            errorMessage = 'Audio capture failed';
            break;
          case 'not-allowed':
            errorMessage = 'Microphone access denied';
            break;
          case 'network':
            errorMessage = 'Network error occurred';
            break;
          default:
            errorMessage = `Speech recognition error: ${event.error}`;
        }
        onError?.(errorMessage);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [language, onTranscription, onError]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  if (!isSupported) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 12, 
        padding: 16, 
        border: '1px solid var(--border-color)', 
        borderRadius: 8,
        backgroundColor: 'var(--card-background, rgba(255, 255, 255, 0.05))',
        opacity: 0.6
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0, fontSize: '1em' }}>Browser Speech Recognition</h4>
          <span style={{ fontSize: '0.8em', color: 'var(--muted-color)' }}>Not Supported</span>
        </div>
        <p style={{ fontSize: '0.9em', color: 'var(--muted-color)', margin: 0 }}>
          Speech recognition is not supported in this browser. Please use Chrome or Edge for the best experience.
        </p>
      </div>
    );
  }

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
        <h4 style={{ margin: 0, fontSize: '1em' }}>Browser Speech Recognition</h4>
        <span style={{ fontSize: '0.8em', color: 'var(--muted-color)' }}>Built-in</span>
      </div>

      {/* Listening Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={disabled}
          style={{
            padding: '8px 16px',
            backgroundColor: isListening ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${isListening ? 'rgb(220, 38, 38)' : 'rgb(34, 197, 94)'}`,
            borderRadius: 4,
            color: isListening ? 'rgb(220, 38, 38)' : 'rgb(34, 197, 94)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {isListening ? '⏹️ Stop' : '🎤 Listen'}
          {isListening && (
            <span style={{ 
              width: 8, 
              height: 8, 
              backgroundColor: 'rgb(220, 38, 38)', 
              borderRadius: '50%',
              animation: 'pulse 1s infinite'
            }} />
          )}
        </button>
      </div>

      {/* Live Transcript */}
      {(isListening || transcript) && (
        <div style={{ 
          marginTop: 8, 
          padding: 12, 
          backgroundColor: 'rgba(59, 130, 246, 0.1)', 
          border: '1px solid rgba(59, 130, 246, 0.3)', 
          borderRadius: 6,
          minHeight: 40
        }}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '0.8em', color: 'var(--muted-color)' }}>
            {isListening ? 'Listening...' : 'Last Result:'}
          </h5>
          <p style={{ margin: 0, fontSize: '1em', color: transcript ? 'inherit' : 'var(--muted-color)' }}>
            {transcript || (isListening ? 'Speak now...' : 'No speech detected')}
          </p>
        </div>
      )}

      {/* Instructions */}
      <div style={{ fontSize: '0.8em', color: 'var(--muted-color)' }}>
        {isListening ? (
          <span style={{ color: 'rgb(220, 38, 38)' }}>🔴 Listening... Speak clearly in Chinese</span>
        ) : (
          <>
            Click "Listen" to start voice recognition. 
            <br />
            <strong>Note:</strong> This uses your browser's built-in speech recognition.
          </>
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

export default BrowserSTT;