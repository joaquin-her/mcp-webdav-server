import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AnnaService');

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_ANNAS_BASE_URL = 'annas-archive.gl';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface AnnaConfig {
  baseUrl?: string;
  secretKey?: string;
}

export interface Book {
  language: string;
  format: string;
  size: string;
  title: string;
  publisher: string;
  authors: string;
  url: string;
  hash: string;
}

export interface Paper {
  doi: string;
  title: string;
  authors: string;
  journal: string;
  size: string;
  hash: string;
  downloadUrl: string;
  pageUrl: string;
}

export interface DownloadResult {
  filename: string;
  contentBase64: string;
}

const SLOW_DOWNLOAD_MIRROR_COUNT = 5;
const SLOW_SECRET_KEY_VALUE = 'slow';

function normalizeBaseUrl(raw?: string): string {
  const value = (raw ?? '').trim().replace(/\/$/, '').replace(/^https?:\/\//, '');
  return value || DEFAULT_ANNAS_BASE_URL;
}

// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

function sanitizeFilename(name: string): string {
  let safe = name.replace(UNSAFE_FILENAME_CHARS, '_').replace(/\.\./g, '_');
  safe = safe.split(/[/\\]/).pop() || safe;
  if (safe.length > 200) safe = safe.slice(0, 200);
  return safe;
}

function extractMetaInformation(meta: string): { language: string; format: string; size: string } {
  const parts = meta.split(' · ');
  if (parts.length < 3) return { language: '', format: '', size: '' };

  let language = parts[0].trim();
  const idx = language.indexOf('[');
  if (idx > 0) {
    language = language.slice(0, idx).replace(/^✅/, '').trim();
  } else {
    language = '';
  }

  const formatRegex = /\b(EPUB|PDF|MOBI|AZW3|AZW|DJVU|CBZ|CBR|FB2|DOCX?|TXT)\b/i;
  const sizeRegex = /\d+\.?\d*\s*(MB|KB|GB|TB)/;

  let format = '';
  let size = '';
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!size && sizeRegex.test(part)) size = part;
    if (!format) {
      const m = part.match(formatRegex);
      if (m) format = m[1].toUpperCase();
    }
    if (format && size) break;
  }

  return { language, format, size };
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    logger.debug(`Fetching URL: ${url}`);
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export class AnnaService {
  private baseUrl: string;
  private secretKey?: string;

  constructor(config: AnnaConfig = {}) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.secretKey = config.secretKey;
    logger.info('Anna service initialized', { baseUrl: this.baseUrl, hasSecretKey: Boolean(this.secretKey) });
  }

  private parseResultList($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode>[] {
    const results: cheerio.Cheerio<AnyNode>[] = [];
    $("a[href^='/md5/']").each((_, el) => {
      const $el = $(el);
      if ($el.attr('class') === 'custom-a block mr-2 sm:mr-4 hover:opacity-80') {
        results.push($el);
      }
    });
    return results;
  }

  async findBook(query: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Book[]> {
    const url = `https://${this.baseUrl}/search?q=${encodeURIComponent(query)}&content=book_any`;
    const html = await fetchHtml(url, timeoutMs);
    const $ = cheerio.load(html);

    const books: Book[] = [];
    for (const $el of this.parseResultList($)) {
      const parent = $el.parent();
      const infoDiv = parent.find('div.max-w-full').first();
      if (infoDiv.length === 0) continue;

      const title = infoDiv.find("a[href^='/md5/']").first().text().trim();
      if (!title) continue;

      const authors = infoDiv
        .find("a[href^='/search'] span[class*='mdi--user-edit']")
        .parent()
        .first()
        .text()
        .trim();
      const publisher = infoDiv
        .find("a[href^='/search'] span[class*='mdi--company']")
        .parent()
        .first()
        .text()
        .trim();
      const meta = infoDiv.find('div.text-gray-800').first().text();
      const { language, format, size } = extractMetaInformation(meta);

      const link = $el.attr('href');
      if (!link) continue;
      const hash = link.replace(/^\/md5\//, '');
      if (!hash) continue;

      books.push({
        language,
        format,
        size,
        title,
        publisher,
        authors,
        url: new URL(link, `https://${this.baseUrl}/`).toString(),
        hash
      });
    }

    logger.info('Book search completed', { query, resultsCount: books.length });
    return books;
  }

  async findArticle(query: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Paper[]> {
    const url = `https://${this.baseUrl}/search?q=${encodeURIComponent(query)}&content=journal`;
    const html = await fetchHtml(url, timeoutMs);
    const $ = cheerio.load(html);

    const papers: Paper[] = [];
    for (const $el of this.parseResultList($)) {
      const parent = $el.parent();
      const infoDiv = parent.find('div.max-w-full').first();
      if (infoDiv.length === 0) continue;

      const title = infoDiv.find("a[href^='/md5/']").first().text().trim();
      if (!title) continue;

      const authors = infoDiv
        .find("a[href^='/search'] span[class*='mdi--user-edit']")
        .parent()
        .first()
        .text()
        .trim();
      const journal = infoDiv
        .find("a[href^='/search'] span[class*='mdi--company']")
        .parent()
        .first()
        .text()
        .trim();
      const meta = infoDiv.find('div.text-gray-800').first().text();
      const { size } = extractMetaInformation(meta);

      const link = $el.attr('href');
      if (!link) continue;
      const hash = link.replace(/^\/md5\//, '');
      if (!hash) continue;

      papers.push({
        doi: '',
        title,
        authors,
        journal,
        size,
        hash,
        downloadUrl: '',
        pageUrl: new URL(link, `https://${this.baseUrl}/`).toString()
      });
    }

    logger.info('Article search completed', { query, resultsCount: papers.length });
    return papers;
  }

  async lookupDOI(doi: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Paper> {
    const scidbUrl = `https://${this.baseUrl}/scidb/${doi}`;
    const searchHtml = await fetchHtml(scidbUrl, timeoutMs);
    const $search = cheerio.load(searchHtml);

    let hash = '';
    $search("a[href^='/md5/']").each((_, el) => {
      if (hash) return;
      const href = $search(el).attr('href') || '';
      const h = href.replace(/^\/md5\//, '');
      if (h) hash = h;
    });

    if (!hash) {
      throw new Error(`No paper found for DOI: ${doi}`);
    }

    const paper: Paper = {
      doi,
      title: '',
      authors: '',
      journal: '',
      size: '',
      hash,
      downloadUrl: `/scidb?doi=${encodeURIComponent(doi)}`,
      pageUrl: scidbUrl
    };

    try {
      const md5Url = `https://${this.baseUrl}/md5/${hash}`;
      const detailHtml = await fetchHtml(md5Url, timeoutMs);
      const $detail = cheerio.load(detailHtml);

      const titleText = $detail('title').first().text();
      const idx = titleText.indexOf(' - Anna');
      if (idx > 0) paper.title = titleText.slice(0, idx).trim();

      const desc = $detail('meta[name="description"]').attr('content') || '';
      const parts = desc.split('\n\n');
      if (parts.length >= 3) paper.journal = parts[2].trim();
      else if (parts.length >= 2) paper.journal = parts[1].trim();
      else if (desc) paper.journal = desc.trim();

      $detail("a[href^='/search']").each((_, el) => {
        if (paper.authors) return;
        const $el = $detail(el);
        if ($el.find("span[class*='mdi--user-edit']").length > 0) {
          paper.authors = $el.text().trim();
        }
      });

      $detail('div.text-gray-500').each((_, el) => {
        const text = $detail(el).text();
        if (!paper.size && (text.includes('MB') || text.includes('KB'))) {
          paper.size = text.trim();
        }
      });
    } catch (error) {
      logger.warn('Failed to fetch paper detail page', { doi, error: (error as Error).message });
    }

    return paper;
  }

  /**
   * True when ANNAS_SECRET_KEY=slow: no membership key is configured, so
   * downloads fall back to /slow_download/ links returned for the user to
   * open in a browser, instead of the server fetching the file itself.
   * /slow_download/ sits behind a DDoS-Guard JS challenge that a plain HTTP
   * request can't solve.
   */
  isSlowMode(): boolean {
    return this.secretKey === SLOW_SECRET_KEY_VALUE;
  }

  getSlowDownloadLinks(hash: string): string[] {
    return Array.from(
      { length: SLOW_DOWNLOAD_MIRROR_COUNT },
      (_, i) => `https://${this.baseUrl}/slow_download/${hash}/0/${i}`
    );
  }

  async downloadBook(hash: string, title: string, format: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<DownloadResult> {
    if (!this.secretKey || this.isSlowMode()) {
      throw new Error('ANNAS_SECRET_KEY is not configured; downloads are unavailable');
    }

    const apiUrl = `https://${this.baseUrl}/dyn/api/fast_download.json?md5=${encodeURIComponent(hash)}&key=${encodeURIComponent(this.secretKey)}`;
    logger.info('Fetching download URL', { hash });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let apiResp: { download_url?: string; error?: string };
    try {
      const resp = await fetch(apiUrl, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`API request failed with status ${resp.status}: ${resp.statusText} (body: ${body.slice(0, 512)})`);
      }
      apiResp = (await resp.json()) as { download_url?: string; error?: string };
    } finally {
      clearTimeout(timer);
    }

    if (!apiResp.download_url) {
      throw new Error(apiResp.error ? `API error: ${apiResp.error}` : 'API returned empty download URL');
    }

    const fileBuffer = await this.downloadBinary(apiResp.download_url, timeoutMs);

    const safeTitle = sanitizeFilename(title) || 'untitled';
    const ext = (format || 'bin').toLowerCase();
    const filename = `${safeTitle}.${ext}`;

    logger.info('Book download completed', { filename, bytes: fileBuffer.length });

    return { filename, contentBase64: fileBuffer.toString('base64') };
  }

  async downloadPaper(paper: Paper, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<DownloadResult> {
    if (!paper.downloadUrl) {
      throw new Error('No download URL available for this paper');
    }

    const downloadUrl = paper.downloadUrl.startsWith('http')
      ? paper.downloadUrl
      : `https://${this.baseUrl}${paper.downloadUrl}`;

    logger.info('Downloading paper via SciDB', { url: downloadUrl });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(downloadUrl, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
        signal: controller.signal
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Download failed with status ${response.status}: ${response.statusText} (body: ${body.slice(0, 512)})`);
      }
    } finally {
      clearTimeout(timer);
    }

    let ext = '.pdf';
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";]+)"?/i);
      if (match) {
        const fromHeader = match[1];
        const dotIdx = fromHeader.lastIndexOf('.');
        if (dotIdx >= 0) ext = fromHeader.slice(dotIdx);
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const name = paper.title || paper.doi || 'paper';
    const safeName = sanitizeFilename(name) || 'paper';
    const filename = `${safeName}${ext}`;

    logger.info('Paper download completed', { filename, bytes: buffer.length });

    return { filename, contentBase64: buffer.toString('base64') };
  }

  private async downloadBinary(url: string, timeoutMs: number): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      logger.info('Downloading file', { url });
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) {
        throw new Error(`Download failed with status ${resp.status}: ${resp.statusText}`);
      }
      const arrayBuffer = await resp.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function bookToText(book: Book): string {
  return `Title: ${book.title}\nAuthors: ${book.authors}\nPublisher: ${book.publisher}\nLanguage: ${book.language}\nFormat: ${book.format}\nSize: ${book.size}\nURL: ${book.url}\nHash: ${book.hash}`;
}

export function paperToText(paper: Paper): string {
  return `DOI: ${paper.doi}\nTitle: ${paper.title}\nAuthors: ${paper.authors}\nJournal: ${paper.journal}\nSize: ${paper.size}\nHash: ${paper.hash}\nDownload URL: ${paper.downloadUrl}\nPage: ${paper.pageUrl}`;
}
