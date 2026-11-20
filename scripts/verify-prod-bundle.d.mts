export interface BundleFileMetric {
  file: string;
  rawBytes: number;
  gzBytes: number;
}

export interface VerifyProdBundleResult {
  ok: boolean;
  errors: string[];
  entryShellGzBytes: number;
  entryFiles: BundleFileMetric[];
  districtChunks: BundleFileMetric[];
}

export interface VerifyProdBundleOptions {
  rootDir?: string;
}

export interface WebpDimensions {
  valid: boolean;
  width: number;
  height: number;
}

export const FORBIDDEN_PROD_PATTERNS: readonly string[];
export const MAX_ENTRY_SHELL_GZ_BYTES: number;
export const MAX_DISTRICT_CHUNK_GZ_BYTES: number;

export function parseWebpDimensions(buf: Buffer | Uint8Array): WebpDimensions;
export function verifyProdBundle(
  distDir?: string,
  opts?: VerifyProdBundleOptions
): VerifyProdBundleResult;
