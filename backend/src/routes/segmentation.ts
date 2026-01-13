/**
 * API routes for Chinese text segmentation and analysis
 */

import express, { Request, Response } from 'express';
import { segmentationService } from '../services/segmentation.service';
import { AnalyzeTextRequest, AnalyzeTextResponse } from '../types/segmentation.types';

const router = express.Router();

/**
 * POST /api/segmentation/analyze
 * Analyze Chinese text: segment and enrich with dictionary data
 *
 * Request body:
 * {
 *   "text": "你好，欢迎来到中文学习应用"
 * }
 *
 * Response:
 * {
 *   "segments": [
 *     {
 *       "text": "你好",
 *       "pinyin": "nǐ hǎo",
 *       "english": "hello; hi",
 *       "hskLevel": 1
 *     },
 *     ...
 *   ]
 * }
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { text } = req.body as AnalyzeTextRequest;

    if (!text || typeof text !== 'string') {
      res.status(400).json({
        error: 'Missing or invalid "text" field in request body',
      });
      return;
    }

    if (text.length > 10000) {
      res.status(413).json({
        error: 'Text too long. Maximum length is 10,000 characters',
      });
      return;
    }

    if (!segmentationService.isReady()) {
      res.status(503).json({
        error: 'Segmentation service not ready',
      });
      return;
    }

    const segments = await segmentationService.analyzeText(text);

    const response: AnalyzeTextResponse = {
      segments,
    };

    res.json(response);
  } catch (error) {
    console.error('Error analyzing text:', error);
    res.status(500).json({
      error: 'Internal server error during text analysis',
    });
  }
});

export default router;
