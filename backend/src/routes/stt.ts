import { Router, Request, Response } from 'express';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import fs from 'fs';
import logger from '../utils/logger';

const router = Router();

// Azure Speech configuration
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

if (!AZURE_SPEECH_KEY) {
  logger.error('AZURE_SPEECH_KEY environment variable is required for STT');
}

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow audio file types that work well with Azure
    const allowedMimes = [
      'audio/wav',
      'audio/mpeg',
      'audio/m4a',
      'audio/mp4',
      'audio/flac'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please use WAV, MP3, M4A, MP4, or FLAC format.'));
    }
  }
});

interface STTResponse {
  text: string;
  confidence?: number;
  language?: string;
}

// POST /api/stt/file - Transcribe uploaded audio file using Azure
router.post(
  '/file',
  upload.single('audio'),
  async (req: Request, res: Response) => {
    try {
      if (!AZURE_SPEECH_KEY) {
        res.status(500).json({ error: 'Azure Speech service not configured' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided' });
        return;
      }

      logger.info({ filename: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size }, 'Processing audio file');

      // Create speech config
      const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
      speechConfig.speechRecognitionLanguage = 'zh-CN';
      
      let audioConfig: sdk.AudioConfig;
      let recognizer: sdk.SpeechRecognizer;

      try {
        // For WAV files, try direct file input first
        if (req.file.mimetype === 'audio/wav') {
          try {
            audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(req.file.path));
            recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
          } catch (wavError) {
            logger.warn({ err: wavError }, 'WAV file input failed, trying push stream');
            throw wavError; // Will be caught by outer try-catch
          }
        } else {
          // For other formats, use push stream
          const audioBuffer = fs.readFileSync(req.file.path);
          const pushStream = sdk.AudioInputStream.createPushStream();
          
          // Convert Node.js Buffer to ArrayBuffer for Azure SDK
          const arrayBuffer = audioBuffer.buffer.slice(
            audioBuffer.byteOffset,
            audioBuffer.byteOffset + audioBuffer.byteLength
          );
          
          pushStream.write(arrayBuffer);
          pushStream.close();
          
          audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
          recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        }

        logger.info('Starting Azure Speech recognition');
        
        // Perform recognition
        const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
          recognizer.recognizeOnceAsync(
            (result) => resolve(result),
            (error) => reject(new Error(`Recognition failed: ${error}`))
          );
        });

        // Clean up recognizer
        recognizer.close();

        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          logger.info({ text: result.text }, 'Recognition successful');
          
          const response: STTResponse = {
            text: result.text.trim(),
            confidence: result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) ? 
              JSON.parse(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)).NBest?.[0]?.Confidence : undefined,
            language: 'zh-CN'
          };

          res.json(response);
        } else if (result.reason === sdk.ResultReason.NoMatch) {
          logger.info('No speech detected in audio file');
          res.status(400).json({ error: 'No speech could be recognized from the audio. Please ensure the audio contains clear speech.' });
        } else if (result.reason === sdk.ResultReason.Canceled) {
          const cancellation = sdk.CancellationDetails.fromResult(result);
          logger.error({ reason: cancellation.reason, errorDetails: cancellation.errorDetails }, 'Recognition cancelled');
          res.status(500).json({ 
            error: 'Recognition was cancelled', 
            details: cancellation.errorDetails || 'Unknown cancellation reason'
          });
        } else {
          logger.error({ reason: result.reason }, 'Recognition failed');
          res.status(500).json({ error: 'Speech recognition failed with unexpected result' });
        }
      } catch (processingError) {
        logger.error({ err: processingError }, 'Audio processing error');
        res.status(500).json({ 
          error: 'Failed to process audio file. The audio format may not be compatible or the file may be corrupted.',
          details: processingError instanceof Error ? processingError.message : 'Unknown processing error',
          suggestion: 'Try recording in WAV format or use the browser speech recognition instead.'
        });
      } finally {
        // Clean up uploaded file
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          logger.error({ err: cleanupError }, 'Failed to cleanup uploaded file');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'STT endpoint error');
      res.status(500).json({ error: error instanceof Error ? error.message : 'STT processing failed' });
    }
  }
);

// GET /api/stt/test - Test endpoint to verify configuration
router.get('/test', (req: Request, res: Response) => {
  res.json({
    azureConfigured: !!AZURE_SPEECH_KEY,
    azureRegion: AZURE_SPEECH_REGION,
    supportedFormats: ['audio/wav', 'audio/mpeg', 'audio/m4a', 'audio/mp4', 'audio/flac'],
    maxFileSize: '10MB',
    language: 'zh-CN',
    endpoint: 'POST /api/stt/file'
  });
});

export default router;