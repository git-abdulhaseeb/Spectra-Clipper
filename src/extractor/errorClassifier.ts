export enum ExtractorErrorCode {
  BOT_DETECTED = 'BOT_DETECTED',
  VIDEO_RESTRICTED = 'VIDEO_RESTRICTED',
  FORMAT_UNAVAILABLE = 'FORMAT_UNAVAILABLE',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  UNKNOWN = 'UNKNOWN'
}

export class ExtractorError extends Error {
  constructor(
    public readonly code: ExtractorErrorCode,
    public readonly userMessage: string,
    public readonly rawStderr: string
  ) {
    super(userMessage);
    this.name = 'ExtractorError';
  }
}

export function classifyExtractorError(rawStderr: string): ExtractorError {
  const text = (rawStderr || '').toLowerCase();

  if (
    text.includes('sign in to confirm you') ||
    text.includes('bot') ||
    text.includes('http error 429') ||
    text.includes('too many requests')
  ) {
    return new ExtractorError(
      ExtractorErrorCode.BOT_DETECTED,
      'YouTube is temporarily rate-limiting requests. Please try again in a few minutes.',
      rawStderr
    );
  }

  if (
    text.includes('private video') ||
    text.includes('age-restricted') ||
    text.includes('sign in if you') ||
    text.includes('members-only') ||
    text.includes('not available in your country')
  ) {
    return new ExtractorError(
      ExtractorErrorCode.VIDEO_RESTRICTED,
      'This video is private, age-restricted, or geo-blocked and cannot be clipped.',
      rawStderr
    );
  }

  if (text.includes('requested format is not available') || text.includes('unable to extract')) {
    return new ExtractorError(
      ExtractorErrorCode.FORMAT_UNAVAILABLE,
      'Video format is temporarily unavailable. YouTube player formats may have updated.',
      rawStderr
    );
  }

  if (text.includes('timed out') || text.includes('connection reset') || text.includes('temporary failure in name resolution')) {
    return new ExtractorError(
      ExtractorErrorCode.NETWORK_TIMEOUT,
      'Network interruption communicating with YouTube servers. Please retry.',
      rawStderr
    );
  }

  return new ExtractorError(
    ExtractorErrorCode.UNKNOWN,
    'Failed to process video segment from YouTube.',
    rawStderr
  );
}
