import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Maximize2, Minimize2, Tv } from 'lucide-react';
import { Channel } from '../data/channels';

interface MosaicCellProps {
  channel: Channel;
  channels: Channel[];
  isAudioActive: boolean;
  onActivateAudio: () => void;
  onChangeCellChannel: (newChan: Channel) => void;
  useProxy: boolean;
}

const MosaicCell: React.FC<MosaicCellProps> = ({
  channel,
  channels,
  isAudioActive,
  onActivateAudio,
  onChangeCellChannel,
  useProxy,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const streamUrl = useProxy
      ? `/api/proxy?url=${encodeURIComponent(channel.url)}`
      : channel.url;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: 0, // Lower bitrate in 4-up mosaic for zero freezing
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.muted = !isAudioActive;
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal && hls) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.muted = !isAudioActive;
      video.play().catch(() => {});
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [channel.url, useProxy]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isAudioActive;
    }
  }, [isAudioActive]);

  return (
    <div
      onClick={onActivateAudio}
      className={`relative bg-black rounded-lg overflow-hidden border transition-colors cursor-pointer aspect-video ${
        isAudioActive ? 'border-amber-500' : 'border-slate-800'
      }`}
    >
      <video ref={videoRef} playsInline className="w-full h-full object-contain bg-black" />

      {/* Top Overlay: Channel Picker & Audio Status */}
      <div className="absolute top-0 inset-x-0 p-2.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono tabular-nums text-xs font-semibold text-amber-400">
            {channel.number}
          </span>
          <select
            value={channel.id}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const found = channels.find((c) => c.id === e.target.value);
              if (found) onChangeCellChannel(found);
            }}
            className="bg-slate-950/90 border border-slate-700/80 rounded px-2 py-1 text-xs text-white font-medium truncate max-w-[200px] focus:outline-none focus:border-amber-500"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number} · {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onActivateAudio();
          }}
          className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
            isAudioActive
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'bg-slate-900/80 text-slate-300 hover:text-white'
          }`}
        >
          {isAudioActive ? (
            <>
              <Volume2 className="w-3.5 h-3.5" />
              <span>Áudio Ativo</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5" />
              <span>Mudo</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

interface MultiViewMosaicProps {
  channels: Channel[];
  useProxy: boolean;
}

export const MultiViewMosaic: React.FC<MultiViewMosaicProps> = ({ channels, useProxy }) => {
  const [slotChannels, setSlotChannels] = useState<Channel[]>(() =>
    channels.slice(0, 4)
  );
  const [activeAudioSlot, setActiveAudioSlot] = useState<number>(0);
  const [isMosaicExpanded, setIsMosaicExpanded] = useState<boolean>(false);

  const handleSlotChange = (slotIdx: number, newChan: Channel) => {
    setSlotChannels((prev) => {
      const next = [...prev];
      next[slotIdx] = newChan;
      return next;
    });
  };

  return (
    <div
      className={`${
        isMosaicExpanded
          ? 'fixed inset-0 z-50 bg-[#0B0F17] p-4 flex flex-col'
          : 'bg-[#111726] border border-slate-800/90 rounded-xl p-5'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <Tv className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Mosaico Multi-Tela 2x2 (4 Canais Simultâneos)
            </h2>
            <p className="text-xs text-slate-400">
              Clique em qualquer tela para alternar o foco de áudio em tempo real.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsMosaicExpanded((prev) => !prev)}
          className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-2 self-start sm:self-auto whitespace-nowrap"
        >
          {isMosaicExpanded ? (
            <>
              <Minimize2 className="w-4 h-4" />
              <span>Recolher Mosaico</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-4 h-4" />
              <span>Expandir Mosaico no Navegador</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
        {slotChannels.map((chan, idx) => (
          <MosaicCell
            key={`${idx}-${chan.id}`}
            channel={chan}
            channels={channels}
            isAudioActive={activeAudioSlot === idx}
            onActivateAudio={() => setActiveAudioSlot(idx)}
            onChangeCellChannel={(newChan) => handleSlotChange(idx, newChan)}
            useProxy={useProxy}
          />
        ))}
      </div>
    </div>
  );
};
