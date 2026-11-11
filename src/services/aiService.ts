// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSentimentClassifier } = require('../ai/sentiment.js') as {
  createSentimentClassifier: (modelData: unknown) => (text: string) => {
    label: string | null;
    status: 'predicted' | 'empty_input' | 'unknown_vocabulary';
    scores: number[] | null;
    scoreType: string;
    experimental: boolean;
  };
};
const model = require('../ai/model-edom.json');

export type SentimentLabel = 'positif' | 'netral' | 'negatif';

export type SentimentAnalysisStatus =
  | 'predicted'
  | 'empty_input'
  | 'unknown_vocabulary'
  | 'failed';

export type SentimentAnalysisResult = {
  label: SentimentLabel | null;
  status: SentimentAnalysisStatus;
  provider: 'local-edom';
  experimental: true;
  analyzedAt: string;
  confidence?: number | null;
};

/** Kontrak antarmuka AI sesuai panduan Sprint 2 Bagian 3 & 6. */
export type AiClassification = {
  label: SentimentLabel | null;
  confidence: number | null;
  status: 'SUCCEEDED' | 'FAILED';
  raw: SentimentAnalysisResult;
};

const classifier = createSentimentClassifier(model);

function computeConfidence(scores: number[] | null): number | null {
  if (!scores || scores.length === 0) return null;
  const maxScore = Math.max(...scores);
  const expScores = scores.map((s) => Math.exp(s - maxScore));
  const sumExp = expScores.reduce((acc, val) => acc + val, 0);
  if (!Number.isFinite(sumExp) || sumExp <= 0) return null;
  const prob = Math.max(...expScores) / sumExp;
  return Math.round(Math.min(1, Math.max(0, prob)) * 100) / 100;
}

export async function analyzeSentiment(
  text: string,
): Promise<SentimentAnalysisResult> {
  const cleanedText = text.trim();

  if (!cleanedText) {
    return {
      label: null,
      status: 'empty_input',
      provider: 'local-edom',
      experimental: true,
      analyzedAt: new Date().toISOString(),
      confidence: null,
    };
  }

  try {
    const result = classifier(cleanedText);

    const allowedLabels: SentimentLabel[] = ['positif', 'netral', 'negatif'];

    const label = allowedLabels.includes(result.label as SentimentLabel)
      ? (result.label as SentimentLabel)
      : null;

    return {
      label,
      status: result.status,
      provider: 'local-edom',
      experimental: true,
      analyzedAt: new Date().toISOString(),
      confidence: label ? computeConfidence(result.scores) : null,
    };
  } catch (error) {
    console.error('Sentiment analysis failed:', error);

    return {
      label: null,
      status: 'failed',
      provider: 'local-edom',
      experimental: true,
      analyzedAt: new Date().toISOString(),
      confidence: null,
    };
  }
}

/**
 * Adapter kontrak Sprint 2 (`classifyPermissionReason(reason, signal?)`) yang
 * membungkus `analyzeSentiment` lokal agar sesuai dengan dokumen panduan Sprint 2
 * sekaligus instruksi PM.
 */
export async function classifyPermissionReason(
  reason: string,
  signal?: AbortSignal,
): Promise<AiClassification> {
  if (signal?.aborted) {
    const abortedRaw: SentimentAnalysisResult = {
      label: null,
      status: 'failed',
      provider: 'local-edom',
      experimental: true,
      analyzedAt: new Date().toISOString(),
      confidence: null,
    };
    return {
      label: null,
      confidence: null,
      status: 'FAILED',
      raw: abortedRaw,
    };
  }

  const raw = await analyzeSentiment(reason);
  const succeeded = raw.status === 'predicted' && raw.label !== null;

  return {
    label: raw.label,
    confidence: succeeded ? (raw.confidence ?? null) : null,
    status: succeeded ? 'SUCCEEDED' : 'FAILED',
    raw,
  };
}

