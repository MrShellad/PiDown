export interface ExternalDownloadRequest {
  url: string;
  filename?: string;
  userAgent?: string;
  referer?: string;
  cookies?: string[];
  totalSize?: number | null;
}
