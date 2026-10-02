import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Maximize,
  PictureInPicture2,
  Settings,
  ShieldCheck,
  RefreshCw,
  Tv,
  ChevronRight,
  SkipBack,
  SkipForward,
  Heart,
  Sliders,
} from 'lucide-react';
import { Channel, BufferProfile, BUFFER_PROFILES } from '../data/channels';

interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

interface HlsVideoPlayerProps {
  channel: Channel;
  channels: Channel[];
  onSelectChannel: (channel: Channel) => void;
  isBrowserExpanded: boolean;
  onToggleBrowserExpanded: () => void;
  isTheaterMode: boolean;
  onToggleTheaterMode: () => void;
  useProxy: boolean;
  onToggleProxy: () => void;
  bufferProfile: BufferProfile;
  onChangeBufferProfile: (profile: BufferProfile) => void;
  isFavorite: boolean;
  onToggleFavorite: (channelId: string) => void;
  onNextChannel: () => void;
  onPrevChannel: () => void;
}

export const HlsVideoPlayer: React.FC<HlsVideoPlayerProps> = ({
  channel,
  channels,
  onSelectChannel,
  isBrowserExpanded,
  onToggleBrowserExpanded,
  isTheaterMode,
  onToggleTheaterMode,
  useProxy,
  onToggleProxy,
  bufferProfile,
  onChangeBufferProfile,
  isFavorite,
  onToggleFavorite,
  onNextChannel,
  onPrevChannel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState<boolean>(false);
  const [showExpandedChannelDrawer, setShowExpandedChannelDrawer] = useState<boolean>(false);

  // YouTube-style quality & anti-freeze metrics
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1); // -1 = Auto ABR
  const [activeResolution, setActiveResolution] = useState<string>(channel.resolution || 'HD');
  const [bufferSeconds, setBufferSeconds] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [autoRecoveries, setAutoRecoveries] = useState<number>(0);
  const [effectiveProxyState, setEffectiveProxyState] = useState<boolean>(useProxy);

  // Sync user proxy toggle
  useEffect(() => {
    setEffectiveProxyState(useProxy);
  }, [useProxy, channel.id]);

  // Build final stream URL (either through our backend Anti-Freeze HLS Proxy or direct)
  const getStreamUrl = useCallback(
    (rawUrl: string, proxyEnabled: boolean) => {
      if (!proxyEnabled) return rawUrl;
      return `/api/proxy?url=${encodeURIComponent(rawUrl)}`;
    },
    []
  );

  // Initialize HLS.js with YouTube-style Anti-Freeze Engine
  const initPlayer = useCallback(
    (forceProxyOverride?: boolean) => {
      const video = videoRef.current;
      if (!video) return;

      setErrorMsg(null);
      setIsBuffering(true);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const proxyActive =
        forceProxyOverride !== undefined ? forceProxyOverride : effectiveProxyState;
      const streamUrl = getStreamUrl(channel.url, proxyActive);
      const profileConfig = BUFFER_PROFILES[bufferProfile];

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: bufferProfile === 'low-latency',
          backBufferLength: profileConfig.backBufferLength,
          maxBufferLength: profileConfig.maxBufferLength,
          maxMaxBufferLength: profileConfig.maxMaxBufferLength,
          liveSyncDurationCount: profileConfig.liveSyncDurationCount,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.15,
          nudgeMaxRetry: 12,
          manifestLoadingTimeOut: 12000,
          manifestLoadingMaxRetry: 5,
          manifestLoadingRetryDelay: 600,
          levelLoadingTimeOut: 12000,
          levelLoadingMaxRetry: 5,
          fragLoadingTimeOut: 15000,
          fragLoadingMaxRetry: 8,
          fragLoadingRetryDelay: 500,
          startLevel: -1, // Auto ABR start like YouTube
          abrEwmaDefaultEstimate: bufferProfile === 'data-saver' ? 800_000 : 3_500_000,
          capLevelToPlayerSize: false,
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          setIsBuffering(false);
          const levels: QualityLevel[] = data.levels
            .map((lvl, idx) => ({
              index: idx,
              height: lvl.height || 0,
              bitrate: lvl.bitrate || 0,
              label: lvl.height
                ? `${lvl.height}p`
                : `${Math.round((lvl.bitrate || 1500000) / 1000)} kbps`,
            }))
            .sort((a, b) => b.height - a.height);

          // Deduplicate heights for clean YouTube-style menu
          const uniqueLevels: QualityLevel[] = [];
          const seen = new Set<string>();
          for (const l of levels) {
            if (!seen.has(l.label)) {
              seen.add(l.label);
              uniqueLevels.push(l);
            }
          }
          setQualityLevels(uniqueLevels);
          setSelectedQuality(-1);

          if (bufferProfile === 'data-saver' && uniqueLevels.length > 1) {
            // Pick a moderate level if data saver is enabled
            const midLevel = uniqueLevels[Math.floor(uniqueLevels.length / 2)];
            if (midLevel) hls.autoLevelCapping = midLevel.index;
          }

          video
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {
              // Autoplay fallback: mute and play
              video.muted = true;
              setIsMuted(true);
              video.play().then(() => setIsPlaying(true)).catch(() => {});
            });
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          const level = hls.levels[data.level];
          if (level && level.height) {
            setActiveResolution(`${level.height}p`);
          }
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          setIsBuffering(false);
        });

        // Background Anti-Freeze Watchdog & Error Recovery
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) {
            if (
              data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
              data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL
            ) {
              setAutoRecoveries((prev) => prev + 1);
            }
            return;
          }

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setAutoRecoveries((prev) => prev + 1);
              // If direct stream failed due to CORS/network, seamlessly switch to our Anti-Freeze Proxy!
              if (!proxyActive) {
                setEffectiveProxyState(true);
                initPlayer(true);
                return;
              }
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setAutoRecoveries((prev) => prev + 1);
              hls.recoverMediaError();
              break;
            default:
              if (!proxyActive) {
                setEffectiveProxyState(true);
                initPlayer(true);
              } else {
                setErrorMsg(
                  'Este canal está temporariamente indisponível na origem. Tente reconectar ou escolha outro canal ao vivo.'
                );
                setIsBuffering(false);
              }
              break;
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari HLS support
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          setIsBuffering(false);
          video.play().catch(() => {});
        });
      }
    },
    [channel.url, effectiveProxyState, bufferProfile, getStreamUrl]
  );

  useEffect(() => {
    initPlayer();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [initPlayer]);

  // Monitor buffer health in background every 800ms
  useEffect(() => {
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const buffered = video.buffered;
      if (buffered && buffered.length > 0) {
        const currentTime = video.currentTime;
        for (let i = 0; i < buffered.length; i++) {
          if (buffered.start(i) <= currentTime + 0.5 && buffered.end(i) >= currentTime) {
            const ahead = Math.max(0, buffered.end(i) - currentTime);
            setBufferSeconds(Math.round(ahead * 10) / 10);
            break;
          }
        }
      } else {
        setBufferSeconds(0);
      }
    }, 800);

    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts (Escape to exit browser expanded view, F for browser expand, M for mute, Space for play/pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }
      if (e.key === 'Escape' && isBrowserExpanded) {
        onToggleBrowserExpanded();
        setShowExpandedChannelDrawer(false);
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onToggleBrowserExpanded();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBrowserExpanded, onToggleBrowserExpanded]);

  // Auto-hide controls on mouse inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying && !showSettingsMenu && !showExpandedChannelDrawer) {
        setShowControls(false);
      }
    }, 3200);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleSelectQuality = (levelIndex: number) => {
    setSelectedQuality(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setShowSettingsMenu(false);
  };

  const handleSelectPlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const syncToLiveEdge = () => {
    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current && hlsRef.current.liveSyncPosition) {
      video.currentTime = hlsRef.current.liveSyncPosition;
    } else if (video.buffered.length > 0) {
      video.currentTime = Math.max(0, video.buffered.end(video.buffered.length - 1) - 1.5);
    }
    video.play().catch(() => {});
    setIsPlaying(true);
  };

  const toggleNativeFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback to Browser Full-Window Expansion if iframe blocks native OS fullscreen
      onToggleBrowserExpanded();
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {
      // Ignore if PiP is not supported by browser
    }
  };

  // Buffer health bar percentage (target 45s = 100%)
  const bufferProgressPercent = Math.min(100, Math.round((bufferSeconds / 45) * 100));

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (isPlaying && !showSettingsMenu && !showExpandedChannelDrawer) {
          setShowControls(false);
        }
      }}
      className={`relative bg-black select-none overflow-hidden transition-all duration-200 ${
        isBrowserExpanded
          ? 'fixed inset-0 z-50 w-screen h-screen rounded-none border-0'
          : isTheaterMode
          ? 'w-full aspect-video max-h-[76vh] rounded-xl border border-slate-800/80'
          : 'w-full aspect-video rounded-xl border border-slate-800/80'
      }`}
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        onClick={togglePlay}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        playsInline
        className="w-full h-full object-contain bg-black cursor-pointer"
      />

      {/* Top Overlay Scrim: Channel Info & Quick "Expandir Toda a Tela no Navegador" CTA */}
      <div
        className={`absolute top-0 inset-x-0 p-4 sm:p-5 bg-gradient-to-b from-black/85 via-black/45 to-transparent flex items-start justify-between gap-4 transition-opacity duration-200 pointer-events-none ${
          showControls || !isPlaying || isBuffering ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-3 pointer-events-auto">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-semibold text-sm text-white shrink-0 border border-white/15"
            style={{ backgroundColor: channel.accentColor || '#E11D48' }}
          >
            {channel.number}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                {channel.name}
              </h2>
              <button
                onClick={() => onToggleFavorite(channel.id)}
                title={isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                className={`p-1.5 rounded-md transition-colors ${
                  isFavorite
                    ? 'text-rose-500 hover:text-rose-400'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Heart className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span>{channel.category}</span>
              <span aria-hidden="true">·</span>
              <span>{channel.country}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-amber-400">{activeResolution}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                {effectiveProxyState ? 'Proxy HLS Anti-Travamento Ativo' : 'Conexão Direta HLS'}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Right Prominent Action: Botão de Expandir Toda a Tela no Navegador */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {isBrowserExpanded && (
            <button
              onClick={() => setShowExpandedChannelDrawer((prev) => !prev)}
              className="px-3.5 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700/80 text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Tv className="w-4 h-4 text-amber-400" />
              <span>Canais Ao Vivo ({channels.length})</span>
            </button>
          )}

          <button
            onClick={onToggleBrowserExpanded}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shadow-sm ${
              isBrowserExpanded
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-slate-900/90 hover:bg-amber-500 hover:text-slate-950 text-white border border-slate-700/80'
            }`}
            title="Expandir player para ocupar 100% da janela do navegador (Tecla F)"
          >
            {isBrowserExpanded ? (
              <>
                <Minimize2 className="w-4 h-4" />
                <span>Sair da Tela Expandida (ESC)</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4" />
                <span>Expandir Tela no Navegador</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Center Buffering / Anti-Freeze Recovery Indicator */}
      {isBuffering && !errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
          <div className="w-12 h-12 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin mb-3" />
          <p className="text-xs font-medium text-slate-200 tracking-wide">
            Sincronizando Buffer Anti-Travamento HLS...
          </p>
        </div>
      )}

      {/* Error Recovery Overlay */}
      {errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center">
          <p className="text-sm text-slate-200 max-w-md mb-4">{errorMsg}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => initPlayer(true)}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reconectar via Proxy Anti-Travamento</span>
            </button>
            <button
              onClick={onNextChannel}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors"
            >
              <span>Próximo Canal</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Expanded Browser Mode: Floating Channel Switcher Drawer */}
      {isBrowserExpanded && showExpandedChannelDrawer && (
        <div className="absolute top-16 right-4 bottom-20 w-80 bg-slate-950/95 border border-slate-800 rounded-xl p-4 flex flex-col z-30">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">Troca Rápida de Canal</h3>
            <button
              onClick={() => setShowExpandedChannelDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fechar
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {channels.map((item) => {
              const active = item.id === channel.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectChannel(item);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                    active
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono tabular-nums text-xs text-slate-400 shrink-0">
                      {item.number}
                    </span>
                    <span className="text-xs font-medium truncate">{item.name}</span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    {item.resolution}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* YouTube-Style Settings Popover (Quality, Anti-Freeze Buffer Mode, Speed, Proxy) */}
      {showSettingsMenu && (
        <div className="absolute bottom-16 right-4 w-80 bg-slate-950/95 border border-slate-800 rounded-xl p-4 z-30 shadow-2xl">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Motor Anti-Travamento & Qualidade</span>
            </div>
            <button
              onClick={() => setShowSettingsMenu(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fechar
            </button>
          </div>

          {/* 1. Resolução HLS (Estilo YouTube) */}
          <div className="mb-3.5">
            <label className="block text-[11px] text-slate-400 mb-1.5">
              Qualidade de Vídeo (HLS Adaptive Bitrate)
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleSelectQuality(-1)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  selectedQuality === -1
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Auto ({activeResolution})
              </button>
              {qualityLevels.map((lvl) => (
                <button
                  key={lvl.index}
                  onClick={() => handleSelectQuality(lvl.index)}
                  className={`px-2.5 py-1 rounded text-xs font-mono tabular-nums transition-colors ${
                    selectedQuality === lvl.index
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Perfil de Buffer Anti-Travamento */}
          <div className="mb-3.5">
            <label className="block text-[11px] text-slate-400 mb-1.5">
              Modo de Estabilidade em Segundo Plano
            </label>
            <div className="space-y-1.5">
              {(Object.keys(BUFFER_PROFILES) as BufferProfile[]).map((profKey) => {
                const prof = BUFFER_PROFILES[profKey];
                const isSelected = bufferProfile === profKey;
                return (
                  <button
                    key={profKey}
                    onClick={() => onChangeBufferProfile(profKey)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                        : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <div className="font-semibold">{prof.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {prof.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Proxy HLS Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div>
              <div className="text-xs font-medium text-slate-200">Proxy HLS Anti-Bloqueio</div>
              <div className="text-[11px] text-slate-400">
                Roteia segmentos pelo túnel local com cache
              </div>
            </div>
            <button
              onClick={onToggleProxy}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                effectiveProxyState
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {effectiveProxyState ? 'Ativado' : 'Direto'}
            </button>
          </div>

          {/* 4. Velocidade de Reprodução */}
          <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-800">
            <span className="text-xs text-slate-400">Velocidade</span>
            <div className="flex items-center gap-1">
              {[0.75, 1, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleSelectPlaybackRate(rate)}
                  className={`px-2 py-0.5 rounded text-xs font-mono tabular-nums ${
                    playbackRate === rate
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Control Bar (YouTube-Style Scrim & Buffer Preload Bar) */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-8 pb-3 px-4 transition-opacity duration-200 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* YouTube-Style Buffer Health Track */}
        <div className="w-full h-1.5 bg-slate-800/90 rounded-full overflow-hidden mb-3 flex items-center relative">
          {/* Pre-buffered gray/emerald bar */}
          <div
            className="h-full bg-slate-500/60 transition-all duration-300"
            style={{ width: `${ Math.min(100, bufferProgressPercent + 15) }%` }}
          />
          {/* Active live playback bar */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-amber-500 transition-all duration-300"
            style={{ width: `${Math.max(8, bufferProgressPercent)}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* Left Controls: Play/Pause, Prev/Next Channel, Volume, Live Sync */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onPrevChannel}
              title="Canal Anterior"
              className="p-1.5 text-slate-300 hover:text-white transition-colors"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              onClick={onNextChannel}
              title="Próximo Canal"
              className="p-1.5 text-slate-300 hover:text-white transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 group">
              <button
                onClick={toggleMute}
                title="Mudo (M)"
                className="p-1.5 text-slate-300 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume"
                className="w-16 sm:w-20 accent-amber-500 cursor-pointer h-1 bg-slate-700 rounded-lg"
              />
            </div>

            {/* Live Indicator & Sync Button */}
            <button
              onClick={syncToLiveEdge}
              title="Clique para sincronizar com o ponto ao vivo"
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-slate-200 hover:text-white transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="whitespace-nowrap">AO VIVO</span>
            </button>

            {/* Quiet Unboxed Buffer Status */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
              <span>·</span>
              <span>Buffer: {bufferSeconds.toFixed(1)}s</span>
              {autoRecoveries > 0 && (
                <>
                  <span>·</span>
                  <span className="text-emerald-400">
                    {autoRecoveries} {autoRecoveries === 1 ? 'ajuste' : 'ajustes'} anti-travamento
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right Controls: Quality/Anti-Freeze Settings, PiP, Theater, Expand Browser, OS Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Settings Button (YouTube Gear) */}
            <button
              onClick={() => setShowSettingsMenu((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                showSettingsMenu
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-white/10 hover:bg-white/15 text-slate-200'
              }`}
              title="Qualidade e Buffer Anti-Travamento"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums">
                {selectedQuality === -1 ? `Auto (${activeResolution})` : activeResolution}
              </span>
            </button>

            {/* Picture-in-Picture */}
            <button
              onClick={togglePiP}
              title="Miniplayer Flutuante (Picture-in-Picture)"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 transition-colors hidden sm:flex"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Modo Teatro */}
            {!isBrowserExpanded && (
              <button
                onClick={onToggleTheaterMode}
                title="Alternar Modo Teatro"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium hidden lg:flex items-center gap-1.5 transition-colors ${
                  isTheaterMode
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-white/10 hover:bg-white/15 text-slate-200'
                }`}
              >
                <span>Modo Teatro</span>
              </button>
            )}

            {/* Botão Principal: Expandir Toda a Tela no Navegador */}
            <button
              onClick={onToggleBrowserExpanded}
              title="Expandir toda a tela no navegador (Tecla F)"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isBrowserExpanded
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              {isBrowserExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Reduzir Tela</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Expandir no Navegador</span>
                </>
              )}
            </button>

            {/* Tela Cheia Nativa do Monitor */}
            <button
              onClick={toggleNativeFullscreen}
              title="Tela Cheia do Monitor"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 transition-colors"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
