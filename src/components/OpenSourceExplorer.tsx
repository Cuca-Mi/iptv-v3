import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Globe,
  Plus,
  Play,
  Check,
  RefreshCw,
  Link2,
  Upload,
  Sparkles,
  Wifi,
  AlertCircle,
} from 'lucide-react';
import { Channel, OPEN_SOURCE_DIRECTORY_SOURCES } from '../data/channels';

interface DiscoveredChannel {
  id: string;
  name: string;
  url: string;
  logo: string;
  category: string;
  country: string;
  language: string;
  resolution?: string;
}

interface OpenSourceExplorerProps {
  existingChannels: Channel[];
  onAddChannel: (channel: Channel) => void;
  onAddMultipleChannels: (channels: Channel[]) => void;
  onPlayImmediately: (channel: Channel) => void;
}

const ACCENT_PALETTE = [
  '#E11D48',
  '#0284C7',
  '#D97706',
  '#0D9488',
  '#7C3AED',
  '#2563EB',
  '#10B981',
  '#DC2626',
];

export const OpenSourceExplorer: React.FC<OpenSourceExplorerProps> = ({
  existingChannels,
  onAddChannel,
  onAddMultipleChannels,
  onPlayImmediately,
}) => {
  const [activeSource, setActiveSource] = useState<string>('br');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [discovered, setDiscovered] = useState<DiscoveredChannel[]>([]);
  const [totalFound, setTotalFound] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Stream health check state
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<
    Record<string, { online: boolean; latencyMs: number }>
  >({});

  // Custom M3U / Direct Stream Form State
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'm3u' | 'direct'>('directory');
  const [m3uUrlInput, setM3uUrlInput] = useState<string>('');
  const [m3uRawInput, setM3uRawInput] = useState<string>('');
  const [m3uCategoryInput, setM3uCategoryInput] = useState<string>('Lista M3U');
  const [m3uImporting, setM3uImporting] = useState<boolean>(false);
  const [m3uImportMessage, setM3uImportMessage] = useState<string | null>(null);

  // Direct single channel form
  const [directName, setDirectName] = useState<string>('');
  const [directUrl, setDirectUrl] = useState<string>('');
  const [directCategory, setDirectCategory] = useState<string>('Canais Abertos');
  const [directCountry, setDirectCountry] = useState<string>('Brasil');

  const fetchOpenSourceDirectory = useCallback(async (source: string, query: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        source,
        q: query,
      });
      const response = await fetch(`/api/opensource/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao buscar diretório open-source');
      }
      setDiscovered(data.channels || []);
      setTotalFound(data.totalFound || 0);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao consultar repositório IPTV open-source';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchOpenSourceDirectory(activeSource, searchQuery);
    }, 220);
    return () => clearTimeout(timer);
  }, [activeSource, searchQuery, fetchOpenSourceDirectory]);

  const convertToChannel = (item: DiscoveredChannel, indexOffset = 0): Channel => {
    const nextNum = String(existingChannels.length + 301 + indexOffset);
    const color = ACCENT_PALETTE[(existingChannels.length + indexOffset) % ACCENT_PALETTE.length];
    return {
      id: `os-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${indexOffset}`,
      number: nextNum,
      name: item.name,
      url: item.url,
      category: item.category || 'Open-Source',
      country: item.country || 'Global',
      language: item.language || 'Multilíngue',
      resolution: item.resolution || 'HD',
      logo: item.logo,
      accentColor: color,
      isOpenSource: true,
      epg: [
        {
          title: `Transmissão Ao Vivo · ${item.name}`,
          timeRange: 'AGORA · Sinal Aberto HLS',
          description: `Stream público verificado via diretório Open-Source (${item.category}) com suporte ao Proxy Anti-Travamento.`,
          isLive: true,
        },
      ],
    };
  };

  const isAlreadyAdded = (url: string) => {
    return existingChannels.some((c) => c.url === url);
  };

  const handleCheckStream = async (item: DiscoveredChannel) => {
    setCheckingId(item.id);
    try {
      const res = await fetch(`/api/check-stream?url=${encodeURIComponent(item.url)}`);
      const data = await res.json();
      setHealthStatus((prev) => ({
        ...prev,
        [item.id]: { online: Boolean(data.online), latencyMs: data.latencyMs || 0 },
      }));
    } catch {
      setHealthStatus((prev) => ({
        ...prev,
        [item.id]: { online: false, latencyMs: 0 },
      }));
    } finally {
      setCheckingId(null);
    }
  };

  const handleImportM3U = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!m3uUrlInput.trim() && !m3uRawInput.trim()) return;

    setM3uImporting(true);
    setM3uImportMessage(null);
    try {
      const res = await fetch('/api/parse-m3u', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: m3uUrlInput.trim() || undefined,
          content: m3uRawInput.trim() || undefined,
          categoryName: m3uCategoryInput.trim() || 'Lista M3U',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar lista M3U');
      }

      const importedList: DiscoveredChannel[] = data.channels || [];
      if (importedList.length === 0) {
        setM3uImportMessage('Nenhum canal HLS válido encontrado nessa lista M3U.');
      } else {
        const converted = importedList
          .slice(0, 60)
          .map((item, idx) => convertToChannel(item, idx));
        onAddMultipleChannels(converted);
        setM3uImportMessage(
          `Sucesso! ${converted.length} canais foram adicionados à sua grade com Proxy Anti-Travamento ativado.`
        );
        setM3uUrlInput('');
        setM3uRawInput('');
      }
    } catch (err: unknown) {
      setM3uImportMessage(err instanceof Error ? err.message : 'Erro na importação M3U');
    } finally {
      setM3uImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setM3uRawInput(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleAddDirectStream = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directName.trim() || !directUrl.trim()) return;
    const newChan = convertToChannel({
      id: `custom-${Date.now()}`,
      name: directName.trim(),
      url: directUrl.trim(),
      logo: '',
      category: directCategory.trim() || 'Personalizado',
      country: directCountry.trim() || 'Brasil',
      language: 'Português',
      resolution: '1080p',
    });
    onAddChannel(newChan);
    onPlayImmediately(newChan);
    setDirectName('');
    setDirectUrl('');
  };

  return (
    <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-5 sm:p-6">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 mb-5 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Explorador Global de Canais Open-Source & Listas M3U
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Busque em tempo real nos repositórios públicos de TV aberta da internet ou importe qualquer link M3U/M3U8 com suporte ao Proxy HLS Anti-Travamento.
          </p>
        </div>

        {/* Interactive Segmented Sub-Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg self-start">
          <button
            onClick={() => setActiveSubTab('directory')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeSubTab === 'directory'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Buscar na Internet (Open-Source)</span>
          </button>
          <button
            onClick={() => setActiveSubTab('m3u')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeSubTab === 'm3u'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importar Lista M3U</span>
          </button>
          <button
            onClick={() => setActiveSubTab('direct')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeSubTab === 'direct'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Link Direto .M3U8</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Live Open-Source Internet Directory */}
      {activeSubTab === 'directory' && (
        <div>
          {/* Category / Country Repository Selector */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {OPEN_SOURCE_DIRECTORY_SOURCES.map((src) => {
              const active = activeSource === src.id;
              return (
                <button
                  key={src.id}
                  onClick={() => setActiveSource(src.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-900/90 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span>{src.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Bar & Batch Import Action */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar canal open-source por nome, país ou tema (ex: Cultura, News, Sport, NASA, Música)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchOpenSourceDirectory(activeSource, searchQuery)}
                className="px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar Busca</span>
              </button>

              {discovered.length > 0 && (
                <button
                  onClick={() => {
                    const batch = discovered
                      .filter((d) => !isAlreadyAdded(d.url))
                      .slice(0, 25)
                      .map((d, idx) => convertToChannel(d, idx));
                    if (batch.length > 0) {
                      onAddMultipleChannels(batch);
                    }
                  }}
                  className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Adicionar Top 25 à Grade</span>
                </button>
              )}
            </div>
          </div>

          {/* Status Summary */}
          <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
            <span>
              Repositório conectado ·{' '}
              <strong className="font-mono tabular-nums text-slate-200">{totalFound}</strong> canais
              abertos encontrados na internet
            </span>
            <span>Exibindo até 120 resultados rápidos</span>
          </div>

          {/* Results Table / High-Density List */}
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-12 bg-slate-900/70 border border-slate-800/60 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="p-6 bg-slate-950 border border-rose-500/30 rounded-lg text-center">
              <AlertCircle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
              <p className="text-sm text-slate-200 mb-3">{error}</p>
              <button
                onClick={() => fetchOpenSourceDirectory(activeSource, searchQuery)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-white"
              >
                Tentar Novamente
              </button>
            </div>
          ) : discovered.length === 0 ? (
            <div className="p-8 bg-slate-950 border border-slate-800 rounded-lg text-center">
              <p className="text-sm text-slate-400">
                Nenhum canal encontrado para &ldquo;{searchQuery}&rdquo; nesta categoria. Tente outro termo ou mude o diretório acima.
              </p>
            </div>
          ) : (
            <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/60 max-h-[460px] overflow-y-auto divide-y divide-slate-800/70">
              {discovered.map((item) => {
                const added = isAlreadyAdded(item.url);
                const health = healthStatus[item.id];
                const isChecking = checkingId === item.id;

                return (
                  <div
                    key={item.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100 truncate">
                          {item.name}
                        </span>
                      </div>
                      {/* Zero-pill metadata discipline: unboxed text with · separators */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <span>{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.country}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-amber-400/90">
                          {item.resolution || 'HD'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] text-slate-500 truncate max-w-[260px]">
                          {item.url}
                        </span>
                        {health && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`font-mono tabular-nums ${
                                health.online ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {health.online
                                ? `Online (${health.latencyMs}ms)`
                                : 'Sem resposta direta (Usar Proxy)'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCheckStream(item)}
                        disabled={isChecking}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        title="Testar disponibilidade e latência do stream"
                      >
                        <Wifi className={`w-3.5 h-3.5 ${isChecking ? 'animate-pulse text-amber-400' : ''}`} />
                        <span>{isChecking ? 'Testando...' : 'Testar Sinal'}</span>
                      </button>

                      <button
                        onClick={() => {
                          const chan = convertToChannel(item);
                          if (!added) {
                            onAddChannel(chan);
                          }
                          onPlayImmediately(chan);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-100 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Assistir Agora</span>
                      </button>

                      <button
                        onClick={() => {
                          if (!added) {
                            onAddChannel(convertToChannel(item));
                          }
                        }}
                        disabled={added}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                          added
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-default'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        }`}
                      >
                        {added ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Na Grade</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Import M3U URL or File */}
      {activeSubTab === 'm3u' && (
        <form onSubmit={handleImportM3U} className="space-y-4 max-w-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                URL da Lista M3U / M3U8 na Internet
              </label>
              <input
                type="url"
                value={m3uUrlInput}
                onChange={(e) => setM3uUrlInput(e.target.value)}
                placeholder="https://iptv-org.github.io/iptv/countries/br.m3u"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Categoria Padrão
              </label>
              <input
                type="text"
                value={m3uCategoryInput}
                onChange={(e) => setM3uCategoryInput(e.target.value)}
                placeholder="Ex: Canais Brasil"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Preset Quick URLs */}
          <div>
            <span className="block text-xs text-slate-400 mb-1.5">
              Atalhos de Listas M3U Open-Source Oficiais (Clique para preencher):
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                {
                  label: 'Brasil M3U',
                  url: 'https://iptv-org.github.io/iptv/countries/br.m3u',
                  cat: 'Brasil',
                },
                {
                  label: 'Portugal M3U',
                  url: 'https://iptv-org.github.io/iptv/countries/pt.m3u',
                  cat: 'Portugal',
                },
                {
                  label: 'Esportes Globais M3U',
                  url: 'https://iptv-org.github.io/iptv/categories/sports.m3u',
                  cat: 'Esportes',
                },
                {
                  label: 'Filmes & Séries M3U',
                  url: 'https://iptv-org.github.io/iptv/categories/movies.m3u',
                  cat: 'Filmes',
                },
              ].map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => {
                    setM3uUrlInput(preset.url);
                    setM3uCategoryInput(preset.cat);
                  }}
                  className="px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-amber-300 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Ou envie um arquivo .M3U / .M3U8 do seu dispositivo
              </label>
              <input
                type="file"
                accept=".m3u,.m3u8,.txt"
                onChange={handleFileUpload}
                className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Ou cole o conteúdo #EXTM3U diretamente
              </label>
              <textarea
                rows={3}
                value={m3uRawInput}
                onChange={(e) => setM3uRawInput(e.target.value)}
                placeholder="#EXTM3U&#10;#EXTINF:-1,Meu Canal HD&#10;https://exemplo.com/live/stream.m3u8"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {m3uImportMessage && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-amber-300">
              {m3uImportMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={m3uImporting}
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>{m3uImporting ? 'Processando Lista M3U...' : 'Processar e Importar Canais'}</span>
          </button>
        </form>
      )}

      {/* TAB 3: Direct Single Stream (.m3u8) */}
      {activeSubTab === 'direct' && (
        <form onSubmit={handleAddDirectStream} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nome da Emissora / Canal
              </label>
              <input
                type="text"
                required
                value={directName}
                onChange={(e) => setDirectName(e.target.value)}
                placeholder="Ex: TV Câmara HD / NASA TV"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Categoria
              </label>
              <input
                type="text"
                value={directCategory}
                onChange={(e) => setDirectCategory(e.target.value)}
                placeholder="Ex: Notícias, Esportes, Filmes"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              URL do Stream HLS (.m3u8)
            </label>
            <input
              type="url"
              required
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              placeholder="https://servidor.com/live/master.m3u8"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">País / Região</label>
            <input
              type="text"
              value={directCountry}
              onChange={(e) => setDirectCountry(e.target.value)}
              placeholder="Brasil"
              className="w-full sm:w-64 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>Adicionar e Reproduzir via Proxy HLS</span>
          </button>
        </form>
      )}
    </div>
  );
};
