export interface EpgProgram {
  title: string;
  timeRange: string;
  description: string;
  isLive?: boolean;
}

export interface Channel {
  id: string;
  number: string;
  name: string;
  url: string;
  category: string;
  country: string;
  language: string;
  resolution: string;
  logo?: string;
  accentColor: string;
  isOpenSource: boolean;
  epg: EpgProgram[];
}

export type BufferProfile = 'anti-freeze' | 'low-latency' | 'data-saver';

export const BUFFER_PROFILES: Record<
  BufferProfile,
  {
    label: string;
    shortLabel: string;
    description: string;
    maxBufferLength: number;
    maxMaxBufferLength: number;
    liveSyncDurationCount: number;
    backBufferLength: number;
  }
> = {
  'anti-freeze': {
    label: 'Estável Anti-Travamento (Estilo YouTube)',
    shortLabel: 'Anti-Travamento',
    description:
      'Pré-carrega até 90s de vídeo em segundo plano e ajusta o bitrate preventivamente para zero engasgos.',
    maxBufferLength: 45,
    maxMaxBufferLength: 90,
    liveSyncDurationCount: 4,
    backBufferLength: 60,
  },
  'low-latency': {
    label: 'Tempo Real (Baixa Latência)',
    shortLabel: 'Baixa Latência',
    description:
      'Prioriza proximidade máxima com a transmissão ao vivo (ideal para esportes e notícias urgentes).',
    maxBufferLength: 15,
    maxMaxBufferLength: 30,
    liveSyncDurationCount: 2,
    backBufferLength: 20,
  },
  'data-saver': {
    label: 'Economia de Banda (Conexão Lenta)',
    shortLabel: 'Economia',
    description:
      'Limita picos de resolução automaticamente para manter reprodução contínua em redes móveis ou instáveis.',
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    liveSyncDurationCount: 5,
    backBufferLength: 30,
  },
};

export const INITIAL_CHANNELS: Channel[] = [
  {
    id: 'redbull-tv',
    number: '101',
    name: 'Red Bull TV Global',
    url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    category: 'Esportes',
    country: 'Global',
    language: 'Inglês',
    resolution: '1080p',
    accentColor: '#E11D48',
    isOpenSource: true,
    epg: [
      {
        title: 'World Rally Championship: Bastidores & Ação Ao Vivo',
        timeRange: 'AGORA · 14:00 - 16:00',
        description: 'Transmissão oficial em alta definição de esportes radicais, automobilismo e expedições globais.',
        isLive: true,
      },
      {
        title: 'Red Bull Rampage: Especial Deserto de Utah',
        timeRange: 'A SEGUIR · 16:00 - 17:30',
        description: 'As descidas mais técnicas do freeride mountain bike mundial com telemetria de câmera onboard.',
      },
    ],
  },
  {
    id: 'dw-english',
    number: '102',
    name: 'DW News Internacional',
    url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8',
    category: 'Notícias',
    country: 'Alemanha',
    language: 'Inglês',
    resolution: '1080p',
    accentColor: '#0284C7',
    isOpenSource: true,
    epg: [
      {
        title: 'DW Jornal Global — Edição Contínua',
        timeRange: 'AGORA · 14:00 - 15:00',
        description: 'Cobertura internacional ao vivo de geopolítica, economia europeia, ciência e mercados.',
        isLive: true,
      },
      {
        title: 'Shift: Tecnologia & Futuro Digital',
        timeRange: 'A SEGUIR · 15:00 - 15:30',
        description: 'Análise sobre código aberto, inteligência artificial e infraestrutura de telecomunicações.',
      },
    ],
  },
  {
    id: 'nhk-world',
    number: '103',
    name: 'NHK World Japan HD',
    url: 'https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index.m3u8',
    category: 'Ciência & Doc',
    country: 'Japão',
    language: 'Inglês',
    resolution: '1080p',
    accentColor: '#DC2626',
    isOpenSource: true,
    epg: [
      {
        title: 'Science View: Engenharia de Precisão em Tóquio',
        timeRange: 'AGORA · 14:00 - 14:55',
        description: 'Documentário sobre inovações ferroviárias de levitação magnética e arquitetura antissísmica.',
        isLive: true,
      },
      {
        title: 'NHK Newsline: Ásia-Pacífico',
        timeRange: 'A SEGUIR · 15:00 - 15:30',
        description: 'Boletim direto de Tóquio com correspondentes na Ásia e América Latina.',
      },
    ],
  },
  {
    id: 'france24-en',
    number: '104',
    name: 'France 24 Live',
    url: 'https://live.france24.com/hls/live/2037179-b/F24_EN_HI_HLS/master_5000.m3u8',
    category: 'Notícias',
    country: 'França',
    language: 'Inglês',
    resolution: '1080p',
    accentColor: '#2563EB',
    isOpenSource: true,
    epg: [
      {
        title: 'Live From Paris: Giro Internacional',
        timeRange: 'AGORA · 14:00 - 15:00',
        description: 'Noticiário direto de Paris com debates ao vivo, cultura e cobertura diplomática.',
        isLive: true,
      },
      {
        title: 'Tech 24: Ecossistema Europeu',
        timeRange: 'A SEGUIR · 15:00 - 15:45',
        description: 'Entrevistas e reportagens especiais sobre inovação aberta.',
      },
    ],
  },
  {
    id: 'aljazeera-en',
    number: '105',
    name: 'Al Jazeera English HD',
    url: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8',
    category: 'Notícias',
    country: 'Global',
    language: 'Inglês',
    resolution: '1080p',
    accentColor: '#D97706',
    isOpenSource: true,
    epg: [
      {
        title: 'Newshour — Cobertura Global Ao Vivo',
        timeRange: 'AGORA · 14:00 - 15:00',
        description: 'Reportagens investigativas e plantão ao vivo em múltiplos continentes.',
        isLive: true,
      },
      {
        title: 'Earthrise: Soluções Climáticas',
        timeRange: 'A SEGUIR · 15:00 - 15:30',
        description: 'Documentário sobre projetos de energia limpa e restauração ecológica.',
      },
    ],
  },
  {
    id: 'cgtn-doc',
    number: '106',
    name: 'CGTN Documentary HD',
    url: 'https://news.cgtn.com/resource/live/document/cgtn-doc.m3u8',
    category: 'Ciência & Doc',
    country: 'Global',
    language: 'Inglês',
    resolution: '1080p',
    accentColor: '#0D9488',
    isOpenSource: true,
    epg: [
      {
        title: 'Expedição Rota da Seda & Montanhas',
        timeRange: 'AGORA · 14:00 - 15:15',
        description: 'Cinematografia 4K/HD explorando paisagens naturais, biodiversidade e patrimônio histórico.',
        isLive: true,
      },
      {
        title: 'Arquitetura Milenar',
        timeRange: 'A SEGUIR · 15:15 - 16:00',
        description: 'Como estruturas históricas resistem a séculos sem uso de pregos metálicos.',
      },
    ],
  },
  {
    id: 'blender-tears-of-steel',
    number: '201',
    name: 'Open Cinema: Tears of Steel (Sci-Fi)',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    category: 'Filmes',
    country: 'Holanda',
    language: 'Inglês',
    resolution: '1080p',
    accentColor: '#7C3AED',
    isOpenSource: true,
    epg: [
      {
        title: 'Tears of Steel — Ficção Científica Open Movie',
        timeRange: 'AGORA · Sessão Contínua HD',
        description: 'Produção oficial Blender Institute em Amsterdã com efeitos visuais abertos e streaming adaptativo multi-bitrate.',
        isLive: true,
      },
      {
        title: 'Making Of: VFX Open Source Pipeline',
        timeRange: 'A SEGUIR · Especial Cinema',
        description: 'Bastidores de composição digital e captura de movimento.',
      },
    ],
  },
  {
    id: 'apple-bipbop-fmp4',
    number: '202',
    name: 'Cine Open: Sintel & Animação',
    url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
    category: 'Animação',
    country: 'Global',
    language: 'Inglês',
    resolution: '1080p',
    accentColor: '#F59E0B',
    isOpenSource: true,
    epg: [
      {
        title: 'Sintel — Aventura Épica em Alta Definição',
        timeRange: 'AGORA · Sessão Master 1080p',
        description: 'Curta-metragem open-source premiado com múltiplas faixas de bitrate para teste de estabilidade HLS.',
        isLive: true,
      },
      {
        title: 'Festival de Animação Independente',
        timeRange: 'A SEGUIR · Sessão Contínua',
        description: 'Mostra de cinema livre com codificação HLS de alta eficiência.',
      },
    ],
  },
  {
    id: 'mux-sport-adventure',
    number: '203',
    name: 'Big Buck Bunny Open TV',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    category: 'Animação',
    country: 'Global',
    language: 'Multilíngue',
    resolution: '1080p',
    accentColor: '#10B981',
    isOpenSource: true,
    epg: [
      {
        title: 'Big Buck Bunny — Clássico Open-Source',
        timeRange: 'AGORA · Reprodução Contínua',
        description: 'Transmissão de referência em código aberto ideal para calibração de buffer anti-travamento.',
        isLive: true,
      },
      {
        title: 'Cosmos Laundromat',
        timeRange: 'A SEGUIR · Sessão Aberta',
        description: 'Animação surrealista produzida com ferramentas 100% livres.',
      },
    ],
  },
  {
    id: 'akamaized-parkour',
    number: '204',
    name: 'Action & Freerun HD',
    url: 'https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8',
    category: 'Esportes',
    country: 'Global',
    language: 'Multilíngue',
    resolution: '1080p',
    accentColor: '#06B6D4',
    isOpenSource: true,
    epg: [
      {
        title: 'Urbano & Parkour: Especial Acrobacias Europeias',
        timeRange: 'AGORA · 14:00 - 15:30',
        description: 'Cobertura em 60fps de atletas urbanos, escalada livre e esportes de ação.',
        isLive: true,
      },
      {
        title: 'Circuito Alpino de Inverno',
        timeRange: 'A SEGUIR · 15:30 - 16:30',
        description: 'Snowboard e esqui freestyle nas montanhas da Áustria.',
      },
    ],
  },
];

export const OPEN_SOURCE_DIRECTORY_SOURCES = [
  { id: 'br', label: 'Brasil (Canais Abertos)', category: 'Brasil', countHint: '140+ canais' },
  { id: 'pt', label: 'Portugal (TV Aberta)', category: 'Portugal', countHint: '50+ canais' },
  { id: 'news', label: 'Notícias Globais 24h', category: 'Notícias', countHint: '300+ canais' },
  { id: 'movies', label: 'Filmes & Cinema Aberto', category: 'Filmes', countHint: '180+ canais' },
  { id: 'sports', label: 'Esportes & Aventura', category: 'Esportes', countHint: '150+ canais' },
  { id: 'music', label: 'Música & Shows Ao Vivo', category: 'Música', countHint: '200+ canais' },
  { id: 'science', label: 'Ciência & Tecnologia', category: 'Ciência & Doc', countHint: '60+ canais' },
  { id: 'documentary', label: 'Documentários & Natureza', category: 'Ciência & Doc', countHint: '90+ canais' },
  { id: 'animation', label: 'Animação & Cultura Pop', category: 'Animação', countHint: '70+ canais' },
];
