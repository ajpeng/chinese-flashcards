import React, { useState } from 'react';
import AudioUpload from '../components/AudioUpload';
import BrowserSTT from '../components/BrowserSTT';

interface STTResponse {
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
  emotions?: string[];
  events?: string[];
}

export default function SpeechPractice(): React.ReactElement {
  const [transcriptionResult, setTranscriptionResult] = useState<string>('');
  const [practiceText, setPracticeText] = useState<string>('你好，欢迎来到中文学习平台！今天我们要练习说中文。请大声朗读这些句子，然后检查你的发音是否准确。');
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string>('');
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [tempText, setTempText] = useState<string>('');

  const handleTranscription = (result: STTResponse, audioUrl?: string) => {
    setTranscriptionResult(result.text);
    if (audioUrl) {
      setRecordedAudioUrl(audioUrl);
    }
    console.log('STT Result:', result);
    
    // If we have emotions/events, show them
    if (result.emotions?.length || result.events?.length) {
      console.log('Detected emotions:', result.emotions);
      console.log('Detected events:', result.events);
    }
  };

  const handleSTTError = (error: string) => {
    console.error('STT Error:', error);
    alert(`Speech recognition error: ${error}`);
  };

  // Simple pronunciation scoring based on text similarity
  const calculatePronunciationScore = (original: string, transcription: string): number => {
    if (!original || !transcription) return 0;
    
    // Remove punctuation and normalize
    const normalize = (text: string) => text.replace(/[。！？；，、：""''《》（）【】]/g, '').trim();
    const normalizedOriginal = normalize(original);
    const normalizedTranscription = normalize(transcription);
    
    if (normalizedOriginal === normalizedTranscription) {
      return 100; // Perfect match
    }
    
    // Calculate character-level similarity
    let matches = 0;
    const maxLength = Math.max(normalizedOriginal.length, normalizedTranscription.length);
    
    for (let i = 0; i < Math.min(normalizedOriginal.length, normalizedTranscription.length); i++) {
      if (normalizedOriginal[i] === normalizedTranscription[i]) {
        matches++;
      }
    }
    
    return Math.round((matches / maxLength) * 100);
  };

  const checkPronunciation = () => {
    if (!transcriptionResult) {
      alert('Please record your pronunciation first');
      return;
    }
    
    const score = calculatePronunciationScore(practiceText, transcriptionResult);
    
    // Provide feedback
    let feedback = '';
    if (score >= 90) {
      feedback = '🎉 Excellent pronunciation!';
    } else if (score >= 70) {
      feedback = '👍 Good pronunciation, keep practicing!';
    } else if (score >= 50) {
      feedback = '📖 Fair pronunciation, try again!';
    } else {
      feedback = '💪 Keep practicing, you can do it!';
    }
    
    alert(`Pronunciation Score: ${score}%\n${feedback}\n\nExpected: "${practiceText}"\nYou said: "${transcriptionResult}"`);  };

  const handleTextEdit = () => {
    if (isEditingText) {
      // Save the edited text
      setPracticeText(tempText);
      setIsEditingText(false);
      // Clear previous results when text changes
      setTranscriptionResult('');
      setRecordedAudioUrl('');
    } else {
      // Start editing
      setTempText(practiceText);
      setIsEditingText(true);
    }
  };

  const cancelTextEdit = () => {
    setTempText('');
    setIsEditingText(false);
  };

  const clearSession = () => {
    setTranscriptionResult('');
    setRecordedAudioUrl('');
  };

  const replayAudio = () => {
    if (recordedAudioUrl) {
      const audio = new Audio(recordedAudioUrl);
      audio.play().catch(console.error);
    }
  };

  const exampleTexts = [
    '你好，欢迎来到中文学习平台！',
    '今天天气很好，我们去公园散步吧。',
    '我喜欢学习中文，因为中文很有趣。',
    '请问，最近的地铁站在哪里？',
    '谢谢你的帮助，我很感激。',
  ];

  const selectExampleText = (text: string) => {
    setPracticeText(text);
    setTranscriptionResult('');
    setRecordedAudioUrl('');
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <h2>🎤 Speech Practice</h2>
      <p style={{ color: 'var(--muted-color)', marginBottom: 24 }}>
        Practice your Chinese pronunciation with our speech recognition tools. 
        Record yourself speaking Chinese and get instant feedback on your pronunciation accuracy.
      </p>

      {/* Practice Text Section */}
      <div style={{
        marginBottom: 24,
        padding: 20,
        border: '2px solid rgba(34, 197, 94, 0.3)',
        borderRadius: 12,
        backgroundColor: 'rgba(34, 197, 94, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'rgb(34, 197, 94)' }}>📝 Practice Text</h3>
          <button
            onClick={handleTextEdit}
            style={{
              padding: '6px 12px',
              backgroundColor: isEditingText ? 'rgba(220, 38, 38, 0.1)' : 'rgba(99, 102, 241, 0.1)',
              border: `1px solid ${isEditingText ? 'rgb(220, 38, 38)' : 'rgb(99, 102, 241)'}`,
              borderRadius: 4,
              color: isEditingText ? 'rgb(220, 38, 38)' : 'rgb(99, 102, 241)',
              cursor: 'pointer',
              fontSize: '0.9em',
              fontWeight: 'bold'
            }}
          >
            {isEditingText ? '✅ Save' : '✏️ Edit'}
          </button>
        </div>
        
        {isEditingText ? (
          <div style={{ marginBottom: 16 }}>
            <textarea
              value={tempText}
              onChange={(e) => setTempText(e.target.value)}
              placeholder="Enter Chinese text to practice..."
              style={{
                width: '100%',
                minHeight: 100,
                fontSize: '1.2em',
                lineHeight: 1.8,
                padding: 16,
                backgroundColor: 'var(--card-background, rgba(255, 255, 255, 0.05))',
                border: '2px solid rgb(99, 102, 241)',
                borderRadius: 8,
                color: 'inherit',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                onClick={cancelTextEdit}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'rgba(107, 114, 128, 0.1)',
                  border: '1px solid rgb(107, 114, 128)',
                  borderRadius: 4,
                  color: 'rgb(107, 114, 128)',
                  cursor: 'pointer',
                  fontSize: '0.9em'
                }}
              >
                ❌ Cancel
              </button>
            </div>
            
            {/* Example Texts */}
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9em', color: 'var(--muted-color)' }}>
                📚 Quick Examples:
              </h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {exampleTexts.map((text, index) => (
                  <button
                    key={index}
                    onClick={() => setTempText(text)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      borderRadius: 4,
                      color: 'rgb(34, 197, 94)',
                      cursor: 'pointer',
                      fontSize: '0.8em',
                      maxWidth: '200px',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap'
                    }}
                    title={text}
                  >
                    {text.length > 20 ? text.substring(0, 20) + '...' : text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: '1.2em',
            lineHeight: 1.8,
            padding: 16,
            backgroundColor: 'var(--card-background, rgba(255, 255, 255, 0.05))',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            marginBottom: 16,
            minHeight: 60
          }}>
            {practiceText}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={checkPronunciation}
            disabled={!transcriptionResult}
            style={{
              padding: '10px 20px',
              backgroundColor: transcriptionResult ? 'rgba(59, 130, 246, 0.1)' : 'rgba(128, 128, 128, 0.1)',
              border: `1px solid ${transcriptionResult ? 'rgb(59, 130, 246)' : 'rgb(128, 128, 128)'}`,
              borderRadius: 6,
              color: transcriptionResult ? 'rgb(59, 130, 246)' : 'rgb(128, 128, 128)',
              cursor: transcriptionResult ? 'pointer' : 'not-allowed',
              fontSize: '1em',
              fontWeight: 'bold'
            }}
          >
            📊 Check My Pronunciation
          </button>
          
          <button
            onClick={clearSession}
            style={{
              padding: '10px 20px',
              backgroundColor: 'rgba(107, 114, 128, 0.1)',
              border: '1px solid rgb(107, 114, 128)',
              borderRadius: 6,
              color: 'rgb(107, 114, 128)',
              cursor: 'pointer',
              fontSize: '1em'
            }}
          >
            🔄 Clear Session
          </button>
          
          {recordedAudioUrl && (
            <button
              onClick={replayAudio}
              style={{
                padding: '10px 20px',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgb(168, 85, 247)',
                borderRadius: 6,
                color: 'rgb(168, 85, 247)',
                cursor: 'pointer',
                fontSize: '1em',
                fontWeight: 'bold'
              }}
            >
              🔊 Replay My Voice
            </button>
          )}
        </div>
      </div>

      {/* Speech Recognition Tools */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 16 }}>🎙️ Recording Tools</h3>
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {/* Browser Speech Recognition - Instant, no upload needed */}
          <BrowserSTT 
            onTranscription={(result, audioUrl) => handleTranscription(result, audioUrl)}
            onError={handleSTTError}
            language="zh-CN"
          />
          
          {/* File Upload for Azure STT - Better accuracy */}
          <AudioUpload 
            onTranscription={(result) => handleTranscription(result)}
            onError={handleSTTError}
            provider="azure"
          />
        </div>
      </div>

      {/* Transcription Result */}
      {transcriptionResult && (
        <div style={{ 
          marginBottom: 32,
          padding: 20,
          backgroundColor: 'rgba(59, 130, 246, 0.1)', 
          border: '2px solid rgba(59, 130, 246, 0.3)', 
          borderRadius: 12
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1em', color: 'rgb(59, 130, 246)' }}>📝 Your Recording:</h3>
          <div style={{ 
            fontSize: '1.2em', 
            fontWeight: 'bold', 
            marginBottom: 16,
            padding: 16,
            backgroundColor: 'var(--card-background, rgba(255, 255, 255, 0.05))',
            borderRadius: 8,
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            "{transcriptionResult}"
          </div>
          
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => navigator.clipboard?.writeText(transcriptionResult)}
              style={{
                padding: '6px 12px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgb(59, 130, 246)',
                borderRadius: 4,
                fontSize: '0.9em',
                cursor: 'pointer',
                color: 'rgb(59, 130, 246)'
              }}
            >
              📋 Copy Text
            </button>
            
            <button
              onClick={checkPronunciation}
              style={{
                padding: '6px 12px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgb(34, 197, 94)',
                borderRadius: 4,
                fontSize: '0.9em',
                cursor: 'pointer',
                color: 'rgb(34, 197, 94)'
              }}
            >
              📊 Check Accuracy
            </button>
            
            {recordedAudioUrl && (
              <button
                onClick={replayAudio}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(168, 85, 247, 0.1)',
                  border: '1px solid rgb(168, 85, 247)',
                  borderRadius: 4,
                  fontSize: '0.9em',
                  cursor: 'pointer',
                  color: 'rgb(168, 85, 247)'
                }}
              >
                🔊 Replay Audio
              </button>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ 
        padding: 20,
        backgroundColor: 'rgba(99, 102, 241, 0.05)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 8,
        marginBottom: 24
      }}>
        <h3 style={{ margin: '0 0 12px 0', color: 'rgb(99, 102, 241)' }}>💡 How to Use</h3>
        <div style={{ fontSize: '0.95em', lineHeight: 1.6 }}>
          <strong>1. Choose your recording method:</strong>
          <ul style={{ margin: '8px 0 16px 20px', padding: 0 }}>
            <li><strong>Browser Recognition:</strong> Click "Listen" for instant voice recognition</li>
            <li><strong>File Upload:</strong> Record audio and upload for higher accuracy with Azure STT</li>
          </ul>
          
          <strong>2. Practice:</strong>
          <ul style={{ margin: '8px 0 16px 20px', padding: 0 }}>
            <li>Read the practice text aloud clearly</li>
            <li>Speak at a natural pace</li>
            <li>Try to pronounce each character clearly</li>
          </ul>
          
          <strong>3. Get feedback:</strong>
          <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
            <li>Review your transcribed text</li>
            <li>Click "Check My Pronunciation" for accuracy scoring</li>
            <li>Practice again to improve your score!</li>
          </ul>
        </div>
      </div>

      {/* Additional Features */}
      <div style={{ 
        display: 'grid', 
        gap: 16, 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        marginTop: 32
      }}>
        <div style={{
          padding: 16,
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          backgroundColor: 'var(--card-background, rgba(255, 255, 255, 0.02))'
        }}>
          <h4 style={{ margin: '0 0 8px 0' }}>🎯 Pronunciation Tips</h4>
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '0.9em' }}>
            <li>Speak clearly and at a moderate pace</li>
            <li>Practice tone pronunciation carefully</li>
            <li>Record in a quiet environment</li>
            <li>Use headphones to avoid feedback</li>
          </ul>
        </div>

        <div style={{
          padding: 16,
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          backgroundColor: 'var(--card-background, rgba(255, 255, 255, 0.02))'
        }}>
          <h4 style={{ margin: '0 0 8px 0' }}>🔧 Technical Notes</h4>
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '0.9em' }}>
            <li>Browser recognition works instantly</li>
            <li>File upload provides higher accuracy</li>
            <li>Supports WAV, MP3, M4A, MP4, FLAC formats</li>
            <li>Maximum file size: 10MB</li>
          </ul>
        </div>
      </div>
    </div>
  );
}