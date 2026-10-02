/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Heart,
  Maximize2,
  ShieldCheck,
  Plus,
  Download,
  Trash2,
  Clock,
  Radio,
  Sliders,
  Globe,
} from 'lucide-react';
import {
  Channel,
  INITIAL_CHANNELS,
  BufferProfile,
  BUFFER_PROFILES,
} from './data/channels';
import { HlsVideoPlayer } from './components/HlsVideoPlayer';
import { OpenSourceExplorer } from './components/OpenSourceExplorer';
import { MultiViewMosaic } from './components/MultiViewMosaic';

type ActiveSection = 'live' | 'opensource' | 'mosaic' | 'guide';

const STORAGE_KEY_CHANNELS = 'velostream_channels_v1';
const STORAGE_KEY_FAVORITES = 'velostream_favorites_v1';
const STORAGE_KEY_HISTORY = 'velostream_history_v1';

export default function App() {
  // Load channels from localStorage or fall back to curated open-source channels
  const [channels, setChannels] = useState<Channel[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHANNELS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to initial
    }
    return INITIAL_CHANNELS;
  });

  const [activeChannel, setActiveChannel] = useState<Channel>(() => channels[0] || INITIAL_CHANNELS[0]);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FAVORITES);
      return saved ? JSON.parse(saved) : ['redbull-tv', 'dw-english'];
    } catch {
      return ['redbull-tv', 'dw-english'];
    }
  });

  const [historyIds, setHistoryIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
      return saved ? JSON.parse(saved) : ['redbull-tv'];
    } catch {
      return ['redbull-tv'];
    }
  });

  // Navigation & View Modes
  const [activeSection, setActiveSection] = useState<ActiveSection>('live');
  const [isBrowserExpanded, setIsBrowserExpanded] = useState<boolean>(false);
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);

  // Anti-Freeze Engine & Proxy State
  const [useProxy, setUseProxy] = useState<boolean>(true);
  const [bufferProfile, setBufferProfile] = useState<BufferProfile>('anti-freeze');

  // Channel Sidebar Filtering
  const [sidebarSearch, setSidebarSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');

  // Persist channels, favorites, and history
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CHANNELS, JSON.stringify(channels));
    } catch {
      // Ignore quota errors
    }
  }, [channels]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
    } catch {
      // Ignore
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historyIds));
    } catch {
      // Ignore
    }
  }, [historyIds]);

  const handleSelectChannel = (chan: Channel) => {
    setActiveChannel(chan);
    setHistoryIds((prev) => {
      const filtered = prev.filter((id) => id !== chan.id);
      return [chan.id, ...filtered].slice(0, 25);
    });
  };

  const handleToggleFavorite = (channelId: string) => {
    setFavorites((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  };

  const handleAddChannel = (newChan: Channel) => {
    setChannels((prev) => {
      if (prev.some((c) => c.url === newChan.url)) return prev;
      return [...prev, newChan];
    });
  };

  const handleAddMultipleChannels = (newChans: Channel[]) => {
    setChannels((prev) => {
      const existingUrls = new Set(prev.map((c) => c.url));
      const uniqueNew = newChans.filter((c) => !existingUrls.has(c.url));
      return [...prev, ...uniqueNew];
    });
  };

  const handleRemoveChannel = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (channels.length <= 1) return;
    setChannels((prev) => {
      const next = prev.filter((c) => c.id !== channelId);
      if (activeChannel.id === channelId && next.length > 0) {
        setActiveChannel(next[0]);
      }
      return next;
    });
  };

  const handleNextChannel = () => {
    const idx = channels.findIndex((c) => c.id === activeChannel.id);
    const nextIdx = (idx + 1) % channels.length;
    handleSelectChannel(channels[nextIdx]);
  };

  const handlePrevChannel = () => {
    const idx = channels.findIndex((c) => c.id === activeChannel.id);
    const prevIdx = (idx - 1 + channels.length) % channels.length;
    handleSelectChannel(channels[prevIdx]);
  };

  // Export User's Current Lineup as a Standard .M3U File
  const handleExportM3U = () => {
    const lines = ['#EXTM3U'];
    for (const ch of channels) {
      lines.push(
        `#EXTINF:-1 tvg-id="${ch.id}" group-title="${ch.category}" tvg-country="${ch.country}",${ch.name}`
      );
      lines.push(ch.url);
    }
    const blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'velostream-canais-opensource.m3u';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Compute unique categories for filter bar
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const c of channels) {
      if (c.category) cats.add(c.category);
    }
    return ['Todos', 'Favoritos', 'Recentes', ...Array.from(cats)];
  }, [channels]);

  // Filtered channels for sidebar / grid
  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      if (selectedCategory === 'Favoritos' && !favorites.includes(c.id)) return false;
      if (selectedCategory === 'Recentes' && !historyIds.includes(c.id)) return false;
      if (
        selectedCategory !== 'Todos' &&
        selectedCategory !== 'Favoritos' &&
        selectedCategory !== 'Recentes' &&
        c.category !== selectedCategory
      ) {
        return false;
      }
      if (sidebarSearch.trim()) {
        const q = sidebarSearch.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q) ||
          c.number.includes(q)
        );
      }
      return true;
    });
  }, [channels, selectedCategory, favorites, historyIds, sidebarSearch]);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800/90 bg-[#0B0F17]/95 sticky top-0 z-30 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#live"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('live');
          }}
          className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-white whitespace-nowrap"
        >
          VeloStream
        </a>

        {/* Zone 2: 4 clean navigation links with subtle hover underlines */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <a
            href="#live"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('live');
            }}
            className={`transition-colors whitespace-nowrap py-1 ${
              activeSection === 'live'
                ? 'text-white underline underline-offset-8 decoration-amber-500 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            TV Ao Vivo
          </a>
          <a
            href="#opensource"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('opensource');
            }}
            className={`transition-colors whitespace-nowrap py-1 ${
              activeSection === 'opensource'
                ? 'text-white underline underline-offset-8 decoration-amber-500 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Explorar Open-Source
          </a>
          <a
            href="#mosaic"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('mosaic');
            }}
            className={`transition-colors whitespace-nowrap py-1 ${
              activeSection === 'mosaic'
                ? 'text-white underline underline-offset-8 decoration-amber-500 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Mosaico 4 Telas
          </a>
          <a
            href="#guide"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('guide');
            }}
            className={`transition-colors whitespace-nowrap py-1 ${
              activeSection === 'guide'
                ? 'text-white underline underline-offset-8 decoration-amber-500 decoration-2'
                : 'hover:text-white hover:underline hover:underline-offset-8'
            }`}
          >
            Motor Anti-Travamento
          </a>
        </nav>

        {/* Zone 3: 2 Primary Actions (Buscar Canais Open-Source & Expandir Toda a Tela no Navegador) */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() =>
              setActiveSection((prev) => (prev === 'opensource' ? 'live' : 'opensource'))
            }
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Adicionar Canais</span>
          </button>

          <button
            onClick={() => {
              setActiveSection('live');
              setIsBrowserExpanded((prev) => !prev);
            }}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap flex items-center gap-1.5 shadow-sm"
            title="Expandir player de vídeo em 100% da janela do navegador (Tecla F)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Expandir Tela no Navegador</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-1 px-4 py-2 bg-[#111726] border-b border-slate-800 overflow-x-auto">
        {[
          { id: 'live', label: 'TV Ao Vivo' },
          { id: 'opensource', label: 'Buscar Open-Source' },
          { id: 'mosaic', label: 'Mosaico 4 Telas' },
          { id: 'guide', label: 'Anti-Travamento' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as ActiveSection)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
              activeSection === tab.id
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* MAIN WORKSPACE CANVAS */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 space-y-6">
        {/* SECTION: MOSAIC 2x2 VIEW */}
        {activeSection === 'mosaic' && (
          <MultiViewMosaic channels={channels} useProxy={useProxy} />
        )}

        {/* SECTION: OPEN-SOURCE EXPLORER & M3U IMPORTER */}
        {activeSection === 'opensource' && (
          <OpenSourceExplorer
            existingChannels={channels}
            onAddChannel={handleAddChannel}
            onAddMultipleChannels={handleAddMultipleChannels}
            onPlayImmediately={(chan) => {
              handleSelectChannel(chan);
              setActiveSection('live');
            }}
          />
        )}

        {/* SECTION: LIVE PLAYER + SIDEBAR CHANNEL GUIDE */}
        <div
          className={`grid grid-cols-1 gap-6 ${
            isTheaterMode ? 'lg:grid-cols-1' : 'lg:grid-cols-12'
          }`}
        >
          {/* Left Column: Video Player + EPG & Anti-Freeze Controls */}
          <div className={isTheaterMode ? 'w-full space-y-5' : 'lg:col-span-8 space-y-5'}>
            <HlsVideoPlayer
              channel={activeChannel}
              channels={channels}
              onSelectChannel={handleSelectChannel}
              isBrowserExpanded={isBrowserExpanded}
              onToggleBrowserExpanded={() => setIsBrowserExpanded((prev) => !prev)}
              isTheaterMode={isTheaterMode}
              onToggleTheaterMode={() => setIsTheaterMode((prev) => !prev)}
              useProxy={useProxy}
              onToggleProxy={() => setUseProxy((prev) => !prev)}
              bufferProfile={bufferProfile}
              onChangeBufferProfile={setBufferProfile}
              isFavorite={favorites.includes(activeChannel.id)}
              onToggleFavorite={handleToggleFavorite}
              onNextChannel={handleNextChannel}
              onPrevChannel={handlePrevChannel}
            />

            {/* Quick Action Bar Below Player */}
            <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <span className="font-mono tabular-nums text-amber-400 font-semibold">
                    CANAL {activeChannel.number}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeChannel.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeChannel.country}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeChannel.language}</span>
                </div>
                <h1 className="text-lg sm:text-xl font-bold text-white truncate">
                  {activeChannel.epg[0]?.title || activeChannel.name}
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 line-clamp-2">
                  {activeChannel.epg[0]?.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={() => setIsBrowserExpanded(true)}
                  className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Expandir Toda a Tela no Navegador</span>
                </button>

                <button
                  onClick={() => setActiveSection('opensource')}
                  className="px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium text-xs flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Globe className="w-4 h-4 text-amber-400" />
                  <span>Buscar + Canais na Web</span>
                </button>
              </div>
            </div>

            {/* EPG Schedule + Under-the-Hood Anti-Freeze Engine Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* EPG Program Guide */}
              <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-5">
                <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Guia de Programação (EPG)
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    Sinal Aberto Verificado
                  </span>
                </div>

                <div className="space-y-3">
                  {activeChannel.epg.map((prog, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        prog.isLive
                          ? 'bg-slate-900/90 border-amber-500/30'
                          : 'bg-slate-950/50 border-slate-800/70'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums mb-1">
                        <span className={prog.isLive ? 'text-amber-400 font-semibold' : ''}>
                          {prog.timeRange}
                        </span>
                        {prog.isLive && <span className="text-emerald-400">EM EXIBIÇÃO</span>}
                      </div>
                      <div className="text-sm font-semibold text-slate-100">{prog.title}</div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {prog.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Anti-Freeze HLS Proxy & YouTube Buffer Engine Control */}
              <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-5">
                <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Motor HLS Anti-Travamento (Por Baixo dos Panos)
                    </h3>
                  </div>
                  <button
                    onClick={() => setUseProxy((prev) => !prev)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                      useProxy
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {useProxy ? 'Proxy HLS Ativo' : 'Modo Direto'}
                  </button>
                </div>

                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  O túnel proxy local reescreve manifestos <code className="font-mono text-slate-300">.m3u8</code>, faz cache de segmentos <code className="font-mono text-slate-300">.ts</code> em memória RAM e alterna o bitrate preventivamente estilo YouTube.
                </p>

                <div className="space-y-2">
                  {(Object.keys(BUFFER_PROFILES) as BufferProfile[]).map((key) => {
                    const prof = BUFFER_PROFILES[key];
                    const active = bufferProfile === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setBufferProfile(key)}
                        className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                          active
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                            : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold">{prof.label}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Buffer alvo: {prof.maxBufferLength}s · Máx: {prof.maxMaxBufferLength}s
                          </div>
                        </div>
                        <ShieldCheck
                          className={`w-4 h-4 shrink-0 ${
                            active ? 'text-amber-400' : 'text-slate-600'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Channel Directory & Playlist Sidebar */}
          <aside
            className={`${
              isTheaterMode ? 'w-full' : 'lg:col-span-4'
            } bg-[#111726] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col h-[720px]`}
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-bold text-white tracking-tight">
                  Grade de Canais ({filteredChannels.length})
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExportM3U}
                  title="Exportar sua grade atual como arquivo .M3U"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar M3U</span>
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Filtrar por nome, número ou país..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Interactive Category Filter Controls */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-2 border-b border-slate-800/80 shrink-0">
              {categories.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                      active
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800/80'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* High-Density Channel List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredChannels.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <p className="text-xs text-slate-400 mb-3">
                    Nenhum canal encontrado neste filtro.
                  </p>
                  <button
                    onClick={() => setActiveSection('opensource')}
                    className="px-3.5 py-2 rounded-lg bg-amber-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Buscar Novos Canais Open-Source</span>
                  </button>
                </div>
              ) : (
                filteredChannels.map((item) => {
                  const isCurrent = item.id === activeChannel.id;
                  const isFav = favorites.includes(item.id);
                  const isCustom = item.id.startsWith('os-') || item.id.startsWith('custom-') || item.id.startsWith('m3u-');

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectChannel(item)}
                      className={`group px-3 py-2.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2.5 ${
                        isCurrent
                          ? 'bg-amber-500/15 border-amber-500/40'
                          : 'bg-slate-950/60 border-slate-800/70 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center font-mono tabular-nums text-xs font-semibold text-white shrink-0"
                          style={{ backgroundColor: item.accentColor || '#334155' }}
                        >
                          {item.number}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-xs sm:text-sm font-semibold truncate ${
                                isCurrent ? 'text-amber-300' : 'text-slate-100'
                              }`}
                            >
                              {item.name}
                            </span>
                          </div>
                          {/* Unboxed metadata with · separators */}
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                            <span>{item.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>{item.country}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-slate-300">
                              {item.resolution}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(item.id);
                          }}
                          title={isFav ? 'Remover favorito' : 'Favoritar canal'}
                          className={`p-1.5 rounded transition-colors ${
                            isFav
                              ? 'text-rose-500 hover:text-rose-400'
                              : 'text-slate-500 hover:text-slate-200'
                          }`}
                        >
                          <Heart className="w-3.5 h-3.5" fill={isFav ? 'currentColor' : 'none'} />
                        </button>

                        {isCustom && (
                          <button
                            type="button"
                            onClick={(e) => handleRemoveChannel(item.id, e)}
                            title="Remover canal da lista"
                            className="p-1.5 rounded text-slate-500 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Action: Discover More Open-Source Channels */}
            <div className="pt-3 mt-3 border-t border-slate-800">
              <button
                onClick={() => setActiveSection('opensource')}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-amber-300 flex items-center justify-center gap-2 transition-colors"
              >
                <Globe className="w-4 h-4" />
                <span>Explorar Diretório Open-Source na Internet</span>
              </button>
            </div>
          </aside>
        </div>
      </main>

      {/* Clean Quiet Footer */}
      <footer className="mt-auto border-t border-slate-800/80 px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>VeloStream IPTV · Reprodutor HLS Adaptativo & Diretório de Canais Abertos</span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsBrowserExpanded(true)}
            className="hover:text-slate-300 transition-colors"
          >
            Expandir Tela (Tecla F)
          </button>
          <span>·</span>
          <button
            onClick={handleExportM3U}
            className="hover:text-slate-300 transition-colors"
          >
            Baixar Lista M3U
          </button>
        </div>
      </footer>
    </div>
  );
}
