import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// In-memory LRU-style cache for HLS segments and manifests to prevent freezing ("proxy anti-travamento")
interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  timestamp: number;
}

const segmentCache = new Map<string, CacheEntry>();
const MAX_SEGMENT_CACHE_ITEMS = 80;
const SEGMENT_TTL_MS = 60_000; // 60 seconds for segments
const MANIFEST_TTL_MS = 2_500; // 2.5 seconds for live manifests to avoid hammering origin

function setCache(key: string, buffer: Buffer, contentType: string) {
  if (segmentCache.size >= MAX_SEGMENT_CACHE_ITEMS) {
    const oldestKey = segmentCache.keys().next().value;
    if (oldestKey) segmentCache.delete(oldestKey);
  }
  segmentCache.set(key, { buffer, contentType, timestamp: Date.now() });
}

function getCache(key: string, isManifest: boolean): CacheEntry | null {
  const entry = segmentCache.get(key);
  if (!entry) return null;
  const ttl = isManifest ? MANIFEST_TTL_MS : SEGMENT_TTL_MS;
  if (Date.now() - entry.timestamp > ttl) {
    segmentCache.delete(key);
    return null;
  }
  return entry;
}

// Helper: Fetch with automatic anti-freeze retry and timeout
async function fetchWithRetry(
  targetUrl: string,
  retries = 2,
  timeoutMs = 9000
): Promise<Response> {
  let lastError: unknown;
  const parsedUrl = new URL(targetUrl);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: '*/*',
          Origin: parsedUrl.origin,
          Referer: parsedUrl.origin + '/',
        },
      });
      clearTimeout(timer);
      if (response.ok || response.status < 500) {
        return response;
      }
      lastError = new Error(`Upstream HTTP ${response.status}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// Rewrite relative/absolute URLs inside an HLS .m3u8 manifest so everything routes through /api/proxy
function rewriteM3u8Manifest(manifestText: string, baseUrl: string): string {
  const lines = manifestText.split(/\r?\n/);
  const rewrittenLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Rewrite URI="..." inside tags like #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA
    if (trimmed.startsWith('#')) {
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uriValue) => {
          try {
            const absUrl = new URL(uriValue, baseUrl).toString();
            return `URI="/api/proxy?url=${encodeURIComponent(absUrl)}"`;
          } catch {
            return _match;
          }
        });
      }
      return line;
    }

    // Non-comment line is a segment or variant playlist URL
    try {
      const absoluteUrl = new URL(trimmed, baseUrl).toString();
      return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
    } catch {
      return line;
    }
  });

  return rewrittenLines.join('\n');
}

// 1. Anti-Freeze HLS Proxy Endpoint
app.get('/api/proxy', async (req, res) => {
  const rawUrl = req.query.url as string | undefined;
  if (!rawUrl) {
    res.status(400).json({ error: 'Parâmetro url é obrigatório.' });
    return;
  }

  let targetUrl: string;
  try {
    targetUrl = new URL(rawUrl).toString();
  } catch {
    res.status(400).json({ error: 'URL inválida fornecida ao proxy HLS.' });
    return;
  }

  const lowerUrl = targetUrl.toLowerCase();
  const isLikelyManifest =
    lowerUrl.includes('.m3u8') ||
    lowerUrl.includes('.m3u') ||
    lowerUrl.includes('playlist') ||
    lowerUrl.includes('manifest');

  // Check in-memory anti-freeze cache
  const cached = getCache(targetUrl, isLikelyManifest);
  if (cached) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('X-Proxy-Cache', 'HIT');
    res.send(cached.buffer);
    return;
  }

  try {
    const upstream = await fetchWithRetry(targetUrl, 2, 10000);
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `Servidor de origem retornou status ${upstream.status}`,
      });
      return;
    }

    const contentType =
      upstream.headers.get('content-type') ||
      (isLikelyManifest ? 'application/vnd.apple.mpegurl' : 'video/mp2t');

    const finalResponseUrl = upstream.url || targetUrl;
    const arrayBuffer = await upstream.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    // Check if content is an HLS manifest
    const firstBytes = rawBuffer.subarray(0, 64).toString('utf-8').trim();
    const isM3U8 =
      isLikelyManifest ||
      contentType.includes('mpegurl') ||
      contentType.includes('m3u') ||
      firstBytes.startsWith('#EXTM3U');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('X-Proxy-Cache', 'MISS');

    if (isM3U8) {
      const text = rawBuffer.toString('utf-8');
      const rewritten = rewriteM3u8Manifest(text, finalResponseUrl);
      const outBuffer = Buffer.from(rewritten, 'utf-8');
      const manifestMime = 'application/vnd.apple.mpegurl; charset=utf-8';
      setCache(targetUrl, outBuffer, manifestMime);
      res.setHeader('Content-Type', manifestMime);
      res.setHeader('Cache-Control', 'no-cache');
      res.send(outBuffer);
    } else {
      setCache(targetUrl, rawBuffer, contentType);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.send(rawBuffer);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Falha na conexão com o stream';
    res.status(502).json({ error: `Erro no Proxy Anti-Travamento: ${msg}` });
  }
});

// Helper: Parse M3U content into structured channels
export interface ParsedM3UChannel {
  id: string;
  name: string;
  url: string;
  logo: string;
  category: string;
  country: string;
  language: string;
  resolution?: string;
}

function parseM3UText(content: string, defaultCategory = 'Open-Source'): ParsedM3UChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: ParsedM3UChannel[] = [];
  let currentMeta: Partial<ParsedM3UChannel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const countryMatch = line.match(/tvg-country="([^"]*)"/i);
      const langMatch = line.match(/tvg-language="([^"]*)"/i);
      const resMatch = line.match(/(\d{3,4}p|4K|UHD|HD|FHD)/i);

      const commaIndex = line.lastIndexOf(',');
      const rawName = commaIndex !== -1 ? line.slice(commaIndex + 1).trim() : 'Canal Ao Vivo';
      const cleanName = rawName.replace(/\[.*?\]|\(.*?\)/g, '').trim() || rawName;

      currentMeta = {
        name: cleanName,
        logo: logoMatch ? logoMatch[1] : '',
        category: groupMatch && groupMatch[1] ? groupMatch[1].split(';')[0] : defaultCategory,
        country: countryMatch && countryMatch[1] ? countryMatch[1] : 'Global',
        language: langMatch && langMatch[1] ? langMatch[1] : 'Multilíngue',
        resolution: resMatch ? resMatch[1].toUpperCase() : 'HD',
      };
    } else if (!line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://'))) {
      if (currentMeta && currentMeta.name) {
        channels.push({
          id: `m3u-${channels.length}-${Buffer.from(line).toString('base64').slice(0, 10)}`,
          name: currentMeta.name,
          url: line,
          logo: currentMeta.logo || '',
          category: currentMeta.category || defaultCategory,
          country: currentMeta.country || 'Global',
          language: currentMeta.language || 'Multilíngue',
          resolution: currentMeta.resolution || 'HD',
        });
      }
      currentMeta = null;
    }
  }

  return channels;
}

// 2. Parse Remote M3U Playlist or Raw M3U Content
app.post('/api/parse-m3u', async (req, res) => {
  const { url, content, categoryName } = req.body as {
    url?: string;
    content?: string;
    categoryName?: string;
  };

  try {
    let rawM3U = content || '';
    if (url && !rawM3U) {
      const response = await fetchWithRetry(url, 2, 12000);
      if (!response.ok) {
        res.status(400).json({ error: `Não foi possível baixar a lista M3U (HTTP ${response.status})` });
        return;
      }
      rawM3U = await response.text();
    }

    if (!rawM3U.trim()) {
      res.status(400).json({ error: 'Conteúdo M3U vazio.' });
      return;
    }

    const parsed = parseM3UText(rawM3U, categoryName || 'Lista Importada');
    res.json({
      total: parsed.length,
      channels: parsed.slice(0, 350), // Return up to 350 channels for fast UI rendering
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar lista M3U';
    res.status(500).json({ error: msg });
  }
});

// 3. Open-Source Internet Channel Search (iptv-org live M3U repositories + curated open streams)
const OPENSOURCE_REPOS: Record<string, { label: string; url: string; category: string }> = {
  br: {
    label: 'Brasil (Canais Abertos & Regionais)',
    url: 'https://iptv-org.github.io/iptv/countries/br.m3u',
    category: 'Brasil',
  },
  pt: {
    label: 'Portugal (Canais Públicos & Notícias)',
    url: 'https://iptv-org.github.io/iptv/countries/pt.m3u',
    category: 'Portugal',
  },
  news: {
    label: 'Jornalismo & Notícias Globais 24h',
    url: 'https://iptv-org.github.io/iptv/categories/news.m3u',
    category: 'Notícias',
  },
  movies: {
    label: 'Cinema, Filmes Clássicos & Séries',
    url: 'https://iptv-org.github.io/iptv/categories/movies.m3u',
    category: 'Filmes',
  },
  music: {
    label: 'Música, Videoclipes & Shows Ao Vivo',
    url: 'https://iptv-org.github.io/iptv/categories/music.m3u',
    category: 'Música',
  },
  sports: {
    label: 'Esportes, Aventura & Automobilismo',
    url: 'https://iptv-org.github.io/iptv/categories/sports.m3u',
    category: 'Esportes',
  },
  science: {
    label: 'Ciência, Espaço & Tecnologia',
    url: 'https://iptv-org.github.io/iptv/categories/science.m3u',
    category: 'Ciência & Doc',
  },
  animation: {
    label: 'Animação, Desenhos & Cultura Pop',
    url: 'https://iptv-org.github.io/iptv/categories/animation.m3u',
    category: 'Animação',
  },
  documentary: {
    label: 'Documentários, Natureza & História',
    url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u',
    category: 'Ciência & Doc',
  },
};

const directoryCache = new Map<string, { channels: ParsedM3UChannel[]; timestamp: number }>();

app.get('/api/opensource/search', async (req, res) => {
  const sourceKey = (req.query.source as string) || 'br';
  const query = ((req.query.q as string) || '').toLowerCase().trim();

  const repo = OPENSOURCE_REPOS[sourceKey] || OPENSOURCE_REPOS.br;

  try {
    let channels: ParsedM3UChannel[] = [];
    const cached = directoryCache.get(sourceKey);

    if (cached && Date.now() - cached.timestamp < 10 * 60_000) {
      channels = cached.channels;
    } else {
      const response = await fetchWithRetry(repo.url, 2, 12000);
      if (response.ok) {
        const text = await response.text();
        channels = parseM3UText(text, repo.category).filter(
          (c) => c.url.includes('.m3u8') || c.url.startsWith('https://')
        );
        directoryCache.set(sourceKey, { channels, timestamp: Date.now() });
      }
    }

    const filtered = query
      ? channels.filter(
          (c) =>
            c.name.toLowerCase().includes(query) ||
            c.category.toLowerCase().includes(query) ||
            c.country.toLowerCase().includes(query)
        )
      : channels;

    res.json({
      source: sourceKey,
      label: repo.label,
      totalFound: filtered.length,
      channels: filtered.slice(0, 120),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao consultar repositório open-source';
    res.status(502).json({ error: msg, channels: [] });
  }
});

// 4. Stream Health & Latency Checker
app.get('/api/check-stream', async (req, res) => {
  const targetUrl = req.query.url as string | undefined;
  if (!targetUrl) {
    res.status(400).json({ online: false, error: 'URL ausente' });
    return;
  }

  const start = Date.now();
  try {
    const response = await fetchWithRetry(targetUrl, 1, 5000);
    const latencyMs = Date.now() - start;
    res.json({
      online: response.ok,
      status: response.status,
      latencyMs,
    });
  } catch {
    res.json({
      online: false,
      status: 0,
      latencyMs: Date.now() - start,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VeloStream IPTV Server & Anti-Freeze HLS Proxy running on http://localhost:${PORT}`);
  });
}

startServer();
