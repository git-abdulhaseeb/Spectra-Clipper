export interface ExtractorMetadata {
  videoId: string;
  title: string;
  duration: number;
  availableResolutions: number[];
}

export interface DownloadSectionOptions {
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  maxHeight: number;
  outputFilePath: string;
  abortSignal?: AbortSignal;
}

export interface IExtractor {
  getMetadata(videoId: string): Promise<ExtractorMetadata>;
  downloadSection(options: DownloadSectionOptions): Promise<{ actualStartPts: number }>;
  healthCheck(): Promise<boolean>;
}
