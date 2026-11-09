require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// tiktok-live-connector desteği (v1 ve v2 uyumlu)
let TikTokLiveClass;
try {
  const tlc = require('tiktok-live-connector');
  TikTokLiveClass = tlc.TikTokLiveConnection || tlc.WebcastPushConnection || tlc;
} catch (err) {
  try {
    const tlc = require('@tobiasfranke/tiktok-live-connector');
    TikTokLiveClass = tlc.TikTokLiveConnection || tlc.WebcastPushConnection || tlc;
  } catch (innerErr) {
    console.warn('⚠️ Uyarı: tiktok-live-connector paketi henüz kurulmamış. "npm install" çalıştırın.');
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const PORT = process.env.PORT || 3000;
const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || '').trim().replace(/^@/, '');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Varsayılan avatarlar (Test modu ve profil resmi olmayanlar için)
const DEFAULT_AVATARS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=Pilot1',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Pilot2',
  'https://api.dicebear.com/7.x/bottts/svg?seed=TurboTR',
  'https://api.dicebear.com/7.x/bottts/svg?seed=MilliKahraman'
];

// Hediye Sınıflandırması
// 1) Trol Kapısı: Sadece Dondurma (Ice Cream) Bot aracına hız verir
const TROLL_GIFT_NAMES = ['ice cream', 'ice cream cone', 'dondurma', 'külah', 'cone'];
const TROLL_GIFT_IDS = [5827, 5828];

// 2) Büyük Hediyeler (+500 Ultra Hız & Milli Kahraman)
const BIG_GIFT_NAMES = [
  'wand', 'asa', 'magic wand', 'lion', 'aslan', 'universe', 'galaxy',
  'drama queen', 'sports car', 'spor araba', 'falcon', 'şahin', 'heart me', 'corgi',
  'dragon', 'castle', 'whale', 'balina', 'uçak', 'paraşüt'
];

// Beğeni sayacı: Her 15 beğeni Türkiye'ye kalıcı +5 hız kazandırır
let totalAccumulatedLikes = 0;

/**
 * Frontend'e yarış olayını fırlatır
 */
function broadcastRaceEvent(payload) {
  const eventData = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    team: payload.team || 1, // 1: Türkiye (İzleyiciler), 2: Yapay Zeka Botu (Rakip)
    type: payload.type || 'chat', // 'chat' | 'like' | 'small_gift' | 'big_gift' | 'troll_gift'
    boost: Number(payload.boost) || 10,
    user: {
      uniqueId: payload.user?.uniqueId || 'isimsiz_kahraman',
      nickname: payload.user?.nickname || payload.user?.uniqueId || 'İsimsiz Kahraman',
      avatar:
        payload.user?.avatar ||
        DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)]
    },
    giftName: payload.giftName || null,
    giftCount: payload.giftCount || 1,
    diamondCount: payload.diamondCount || 0,
    isMVP: Boolean(payload.isMVP),
    isTroll: Boolean(payload.isTroll),
    comment: payload.comment || null
  };

  io.emit('race_event', eventData);
  return eventData;
}

// ============================================================================
// TIKTOK CANLI YAYIN BAĞLANTISI (SIFIR SÜRTÜNME MANTIĞI)
// ============================================================================
let tiktokConnection = null;
let connectionState = {
  connected: false,
  username: TIKTOK_USERNAME || null,
  roomId: null,
  error: null
};

function initTikTokConnection(username) {
  if (!TikTokLiveClass) {
    console.log('ℹ️ TikTok kütüphanesi yüklü değil, yalnızca Test Modu aktif.');
    return;
  }

  if (!username || username === 'ornek_kullanici_adi') {
    console.log('ℹ️ .env içinde geçerli bir TIKTOK_USERNAME tanımlanmadı.');
    console.log('🎮 Oyun Test Modunda çalışıyor. Tarayıcıdan veya klavye kısayollarından test edebilirsiniz.');
    return;
  }

  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (_) {}
  }

  console.log(`🔄 @${username} TikTok canlı yayınına bağlanılıyor...`);
  tiktokConnection = new TikTokLiveClass(username, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000
  });

  tiktokConnection
    .connect()
    .then((state) => {
      connectionState = {
        connected: true,
        username,
        roomId: state.roomId,
        error: null
      };
      console.log(`✅ [connected] @${username} yayınına başarıyla bağlanıldı! (Room ID: ${state.roomId})`);
      io.emit('tiktok_status', connectionState);
    })
    .catch((err) => {
      connectionState = {
        connected: false,
        username,
        roomId: null,
        error: err.message || String(err)
      };
      console.error(`❌ [disconnected] TikTok bağlantı hatası (@${username}):`, err.message || err);
      console.log('💡 İpucu: Yayıncı şu an canlı yayında olmayabilir. Test tuşlarıyla oyunu kullanmaya devam edebilirsiniz.');
      io.emit('tiktok_status', connectionState);
    });

  tiktokConnection.on('disconnected', () => {
    connectionState.connected = false;
    console.warn(`⚠️ [disconnected] @${username} canlı yayın bağlantısı koptu.`);
    io.emit('tiktok_status', connectionState);
  });

  tiktokConnection.on('streamEnd', (actionId) => {
    connectionState.connected = false;
    console.log(`🛑 [streamEnd] @${username} canlı yayını sona erdi. (Kod: ${actionId})`);
    io.emit('tiktok_status', connectionState);
  });

  // 1) SOHBET: Seçim zorunluluğu yok, her chat mesajı Türkiye'ye ufak tezahürat ivmesi (+2 Hız) verir
  tiktokConnection.on('chat', (data) => {
    broadcastRaceEvent({
      team: 1, // Doğrudan Türkiye
      type: 'chat',
      boost: 2,
      comment: data.comment,
      user: {
        uniqueId: data.uniqueId,
        nickname: data.nickname || data.uniqueId,
        avatar: data.profilePictureUrl
      }
    });
  });

  // 2) BEĞENİ: Her 15 beğeni Türkiye aracına kalıcı +5 Hız ekler
  tiktokConnection.on('like', (data) => {
    const count = Number(data.likeCount) || 1;
    totalAccumulatedLikes += count;

    if (totalAccumulatedLikes >= 15) {
      const multiplier = Math.floor(totalAccumulatedLikes / 15);
      totalAccumulatedLikes %= 15;
      const boost = multiplier * 5; // Kalıcı +5 hız

      broadcastRaceEvent({
        team: 1, // Doğrudan Türkiye
        type: 'like',
        boost,
        user: {
          uniqueId: data.uniqueId,
          nickname: data.nickname || data.uniqueId,
          avatar: data.profilePictureUrl
        }
      });
      console.log(`❤️ [LIKE] +${boost} Hız (15 Beğeni Paketi) -> Türkiye`);
    }
  });

  // 3) HEDİYE: Sıfır Sürtünme ve Trol Kapısı
  tiktokConnection.on('gift', (data) => {
    // Seri hediyelerde (giftType === 1) her artış anında heyecan yaratması için
    const repeatCount = Math.max(Number(data.repeatCount) || 1, 1);
    const diamondCount = Number(data.diamondCount) || 1;
    const rawGiftName = (data.giftName || 'Hediye').toLowerCase();
    const giftId = Number(data.giftId) || 0;

    // A) Trol Kapısı: Sadece Dondurma (Ice Cream) Bot'a hız verir
    const isTrollGift =
      TROLL_GIFT_IDS.includes(giftId) ||
      TROLL_GIFT_NAMES.some((name) => rawGiftName.includes(name));

    if (isTrollGift) {
      const boost = 100 * repeatCount; // Dondurma: Bot'a kalıcı +100 Hız
      broadcastRaceEvent({
        team: 2, // Bot'a gider
        type: 'troll_gift',
        boost,
        giftName: 'Dondurma 🍦',
        giftCount: repeatCount,
        isTroll: true,
        isMVP: false,
        user: {
          uniqueId: data.uniqueId,
          nickname: data.nickname || data.uniqueId,
          avatar: data.profilePictureUrl
        }
      });
      console.log(`🍦 [TROL KAPISI] ${data.uniqueId} Bot'a Dondurma attı! (+${boost} Hız)`);
      return;
    }

    // B) Diğer TÜM Standart Hediyeler Türkiye'ye gider
    const isBigGift =
      diamondCount >= 10 ||
      BIG_GIFT_NAMES.some((name) => rawGiftName.includes(name));

    const unitBoost = isBigGift ? 500 : 50; // Gül: +50 Hız | Asa vb: +500 Hız
    const totalBoost = unitBoost * repeatCount;

    broadcastRaceEvent({
      team: 1, // Doğrudan Türkiye
      type: isBigGift ? 'big_gift' : 'small_gift',
      boost: totalBoost,
      giftName: data.giftName || (isBigGift ? 'Büyülü Asa 🪄' : 'Gül 🌹'),
      giftCount: repeatCount,
      diamondCount: diamondCount * repeatCount,
      isMVP: isBigGift,
      isTroll: false,
      user: {
        uniqueId: data.uniqueId,
        nickname: data.nickname || data.uniqueId,
        avatar: data.profilePictureUrl
      }
    });

    console.log(
      `🎁 [GIFT] ${data.uniqueId} -> Türkiye | ${repeatCount}x ${data.giftName} (+${totalBoost} Hız) ${
        isBigGift ? '👑 [MİLLİ KAHRAMAN]' : ''
      }`
    );
  });
}

// ============================================================================
// REST API & SOCKET.IO SİMÜLASYON / TEST MEKANİZMASI
// ============================================================================

app.all('/api/test-event', (req, res) => {
  const params = { ...req.query, ...req.body };
  const action = params.action || 'small_gift';
  const eventData = createSimulatedEvent(action, params.nickname);
  res.json({ ok: true, event: eventData });
});

function createSimulatedEvent(action, customNickname) {
  const sampleNames = ['AyYildiz_Kral', 'KirmiziFirtina', 'TurboTR', 'MilliDestek', 'AslanYurek'];
  const randomName = customNickname || sampleNames[Math.floor(Math.random() * sampleNames.length)];
  const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(randomName)}`;

  let payload = {
    user: {
      uniqueId: randomName.toLowerCase(),
      nickname: randomName,
      avatar
    }
  };

  switch (action) {
    case 'like':
      payload = {
        ...payload,
        team: 1,
        type: 'like',
        boost: 5 // 15 beğeni paketi = +5 Hız
      };
      break;
    case 'small_gift':
      payload = {
        ...payload,
        team: 1,
        type: 'small_gift',
        boost: 50,
        giftName: 'Gül 🌹',
        giftCount: 1,
        isMVP: false
      };
      break;
    case 'big_gift':
      payload = {
        ...payload,
        team: 1,
        type: 'big_gift',
        boost: 500,
        giftName: 'Büyülü Asa 🪄',
        giftCount: 1,
        diamondCount: 150,
        isMVP: true
      };
      break;
    case 'troll_gift':
      payload = {
        ...payload,
        team: 2, // Bot'a gider
        type: 'troll_gift',
        boost: 100,
        giftName: 'Dondurma 🍦',
        giftCount: 1,
        isTroll: true
      };
      break;
    case 'chat':
    default:
      payload = {
        ...payload,
        team: 1,
        type: 'chat',
        boost: 2,
        comment: 'Haydi Türkiye! 🇹🇷'
      };
      break;
  }

  return broadcastRaceEvent(payload);
}

io.on('connection', (socket) => {
  console.log(`🔌 Yeni istemci bağlandı: ${socket.id}`);
  socket.emit('tiktok_status', connectionState);

  // Tarayıcıdan klavye ve buton simülasyonları
  socket.on('simulate_event', (data) => {
    const action = data?.action || 'small_gift';
    createSimulatedEvent(action, data?.nickname);
  });

  // Dinamik TikTok kullanıcı adı değiştirme
  socket.on('change_tiktok_user', (newUsername) => {
    const cleaned = String(newUsername || '').trim().replace(/^@/, '');
    if (cleaned) {
      initTikTokConnection(cleaned);
    }
  });
});

// Terminal Klavye Kısayolları
function setupTerminalKeyboardListener() {
  if (!process.stdin.isTTY) return;

  const readline = require('readline');
  readline.emitKeypressEvents(process.stdin);
  try {
    process.stdin.setRawMode(true);
  } catch (_) {
    return;
  }

  console.log('\n⌨️  [TERMİNAL TEST KISAYOLLARI]');
  console.log('   [1 veya A] Türkiye Gül 🌹 (+50 Hız)');
  console.log('   [2 veya Z] Türkiye Asa 🪄 (+500 Ultra Hız & Milli Kahraman)');
  console.log('   [Q]        15 Beğeni ❤️ (+5 Hız)');
  console.log('   [C]        Chat Tezahürat 💬 (+2 Hız)');
  console.log('   [S veya X] Bot Dondurma 🍦 (+100 Hız - Trol Kapısı)');
  console.log('   [CTRL+C]   Çıkış\n');

  process.stdin.on('keypress', (str, key) => {
    if (key && key.ctrl && key.name === 'c') {
      process.exit();
    }
    if (!key || !key.name) return;

    switch (key.name.toLowerCase()) {
      case '1':
      case 'a':
        createSimulatedEvent('small_gift');
        break;
      case '2':
      case 'z':
        createSimulatedEvent('big_gift');
        break;
      case 'q':
        createSimulatedEvent('like');
        break;
      case 'c':
        createSimulatedEvent('chat');
        break;
      case 's':
      case 'x':
        createSimulatedEvent('troll_gift');
        break;
    }
  });
}

server.listen(PORT, () => {
  console.log('==========================================================');
  console.log(`🚀 TikTok Canlı Yayın 2D Yarış: İZLEYİCİLER vs BOT`);
  console.log(`🌐 OBS / Tarayıcı Adresi : http://localhost:${PORT}`);
  console.log(`🧪 OBS Şeffaf/HUD Modu   : http://localhost:${PORT}?obs=true`);
  console.log('==========================================================');

  initTikTokConnection(TIKTOK_USERNAME);
  setupTerminalKeyboardListener();
});
