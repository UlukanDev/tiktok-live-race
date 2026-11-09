/**
 * TikTok Canlı Yayın 2D Yarış Motoru (1080x1920)
 * İZLEYİCİLER (TÜRKİYE) vs YAPAY ZEKA BOTU (RAKİP)
 * Sıfır Sürtünme, Kalıcı Hız Artışı, Adrenalin / Panik Motoru ve 10.000M Bitiş Çizgisi
 */

(() => {
  const canvas = document.getElementById('raceCanvas');
  const ctx = canvas.getContext('2d');

  const WIDTH = 1080;
  const HEIGHT = 1920;

  // Hedef Yarış Mesafesi: 10.000 Metre
  const TARGET_DISTANCE = 10000;
  const BASE_SPEED = 120; // Başlangıç hızı (KM/S)
  const DISTANCE_SCALE = 2.8; // TikTok canlı yayın temposu için dinamik mesafe çarpanı (~60 sn tur)

  // Yol geometrisi
  const ROAD_LEFT = 150;
  const ROAD_RIGHT = 930;
  const ROAD_WIDTH = ROAD_RIGHT - ROAD_LEFT;
  const LANE_CENTER_1 = ROAD_LEFT + ROAD_WIDTH * 0.25; // Sol Şerit: TÜRKİYE
  const LANE_CENTER_2 = ROAD_LEFT + ROAD_WIDTH * 0.75; // Sağ Şerit: BOT RAKİP
  const MID_Y = 1380; // Varsayılan dikey merkez konumu

  // Harici görsel desteği (assets/car1.png ve assets/car2.png)
  const carSprites = {
    1: { img: new Image(), loaded: false },
    2: { img: new Image(), loaded: false }
  };

  function tryLoadExternalCarSprites() {
    ['1', '2'].forEach((id) => {
      const sprite = carSprites[id];
      sprite.img.onload = () => {
        if (sprite.img.naturalWidth > 0) sprite.loaded = true;
      };
      sprite.img.onerror = () => {
        sprite.loaded = false;
      };
      sprite.img.src = `assets/car${id}.png`;
    });
  }
  tryLoadExternalCarSprites();

  // Avatar önbelleği
  const avatarCache = new Map();
  function getAvatarImage(url) {
    if (!url) return null;
    if (avatarCache.has(url)) return avatarCache.get(url);

    const entry = { img: new Image(), loaded: false };
    entry.img.crossOrigin = 'anonymous';
    entry.img.onload = () => {
      entry.loaded = true;
    };
    entry.img.src = url;
    avatarCache.set(url, entry);
    return entry;
  }

  // ============================================================================
  // WEB AUDIO API SENTETİZÖRÜ (SIFIR HARİCİ DOSYA GEREKSİNİMİ)
  // ============================================================================
  let audioEnabled = true;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type = 'sine', gainVal = 0.15) {
    if (!audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function playNitroSound(isSuper = false) {
    if (!audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      const now = audioCtx.currentTime;
      const startFreq = isSuper ? 180 : 260;
      const endFreq = isSuper ? 920 : 640;
      const duration = isSuper ? 0.75 : 0.4;

      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
      gain.gain.setValueAtTime(isSuper ? 0.28 : 0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(now + duration);
    } catch (_) {}
  }

  function playTrollSound() {
    if (!audioEnabled) return;
    playTone(180, 0.45, 'triangle', 0.25);
  }

  let lastSirenTime = 0;
  function playPanicSiren() {
    const now = Date.now();
    if (now - lastSirenTime < 1800) return;
    lastSirenTime = now;
    playTone(520, 0.2, 'square', 0.1);
    setTimeout(() => playTone(380, 0.2, 'square', 0.1), 160);
  }

  function playVictoryFanfare() {
    if (!audioEnabled) return;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((f, idx) => {
      setTimeout(() => playTone(f, 0.35, 'triangle', 0.25), idx * 140);
    });
  }

  // ============================================================================
  // OYUN VE ARAÇ DURUMU (STATE)
  // ============================================================================
  let roundNumber = 1;
  let isRoundOver = false;
  let roadScrollOffset = 0;
  let roadsideScrollOffset = 0;

  // Liderlik durumu: 'tr' | 'bot'
  let currentLeader = 'tr';
  let timeSinceLastTrGift = 0;
  let botMode = 'stalk'; // 'cooldown' | 'stalk' | 'attack' | 'pacing'
  let botStateTimer = 0;

  // Bu turda en çok puan kazandıran izleyiciler (uniqueId -> { nickname, avatar, points })
  const roundContributors = new Map();

  // Parçacıklar ve bildirimler
  const exhaustParticles = [];
  const floatingAvatars = [];
  const confettiParticles = [];
  const shockwaves = [];
  let screenShakeAmount = 0;

  const carTr = {
    teamId: 1,
    name: 'TÜRKİYE',
    x: LANE_CENTER_1,
    baseX: LANE_CENTER_1,
    y: MID_Y,
    speed: BASE_SPEED, // Kalıcı hız (KM/S) - Asla sönümlenmez!
    distance: 0, // Metre cinsinden ilerleme (0..10.000m)
    wins: 0,
    nitroIntensity: 0,
    wobblePhase: 0
  };

  const carBot = {
    teamId: 2,
    name: 'BOT RAKİP',
    x: LANE_CENTER_2,
    baseX: LANE_CENTER_2,
    y: MID_Y,
    speed: BASE_SPEED, // Kalıcı hız (KM/S)
    distance: 0, // Metre cinsinden ilerleme
    wins: 0,
    nitroIntensity: 0,
    wobblePhase: Math.PI
  };

  // ============================================================================
  // DOM ELEMANLARI
  // ============================================================================
  const dom = {
    gameContainer: document.getElementById('game-container'),
    connectionBadge: document.getElementById('connection-badge'),
    connectionText: document.getElementById('connection-text'),
    roundNumber: document.getElementById('round-number'),
    audioToggleBtn: document.getElementById('audio-toggle-btn'),
    audioIcon: document.getElementById('audio-icon'),
    audioText: document.getElementById('audio-text'),
    panicBanner: document.getElementById('panic-banner'),
    panicBannerText: document.getElementById('panic-banner-text'),
    trWins: document.getElementById('tr-wins'),
    botWins: document.getElementById('bot-wins'),
    trProgressBar: document.getElementById('tr-progress-bar'),
    botProgressBar: document.getElementById('bot-progress-bar'),
    trDistanceText: document.getElementById('tr-distance-text'),
    botDistanceText: document.getElementById('bot-distance-text'),
    trSpeed: document.getElementById('tr-speed'),
    botSpeed: document.getElementById('bot-speed'),
    trBoostStatus: document.getElementById('tr-boost-status'),
    botTensionText: document.getElementById('bot-tension-text'),
    mvpBanner: document.getElementById('mvp-banner'),
    mvpAvatar: document.getElementById('mvp-avatar'),
    mvpUsername: document.getElementById('mvp-username'),
    mvpGiftInfo: document.getElementById('mvp-gift-info'),
    mvpTeamTag: document.getElementById('mvp-team-tag'),
    trollBanner: document.getElementById('troll-banner'),
    trollSender: document.getElementById('troll-sender'),
    winnerOverlay: document.getElementById('winner-overlay'),
    winnerCrown: document.getElementById('winner-crown'),
    winnerFlagBox: document.getElementById('winner-flag-box'),
    winnerTeamTitle: document.getElementById('winner-team-title'),
    winnerSubtitle: document.getElementById('winner-subtitle'),
    winnerLeaderboard: document.getElementById('winner-leaderboard'),
    countdownSeconds: document.getElementById('countdown-seconds'),
    testPanel: document.getElementById('test-panel'),
    toggleTestBtn: document.getElementById('toggle-test-btn'),
    tiktokUserInput: document.getElementById('tiktok-user-input'),
    tiktokConnectBtn: document.getElementById('tiktok-connect-btn')
  };

  // Ekran boyutuna göre 1080x1920 ölçekleme
  function fitStageToViewport() {
    const scaleX = window.innerWidth / WIDTH;
    const scaleY = window.innerHeight / HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    dom.gameContainer.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', fitStageToViewport);
  fitStageToViewport();

  // ?obs=true varsa test panelini gizle
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('obs') === 'true') {
    dom.testPanel.classList.add('obs-hidden');
  }

  // Ses Aç/Kapat Butonu
  dom.audioToggleBtn.addEventListener('click', () => {
    initAudio();
    audioEnabled = !audioEnabled;
    dom.audioIcon.textContent = audioEnabled ? '🔊' : '🔇';
    dom.audioText.textContent = audioEnabled ? 'SES AÇIK [M]' : 'SES KAPALI [M]';
  });

  // ============================================================================
  // HEDİYE / ETKİLEŞİM İŞLEYİCİSİ (KALICI HIZ ARTIŞI)
  // ============================================================================
  let mvpTimeout = null;
  let trollTimeout = null;

  function handleRaceEvent(event) {
    if (isRoundOver) return;

    const boost = Number(event.boost) || 10;
    const isTroll = event.isTroll || event.type === 'troll_gift';

    if (isTroll) {
      // 1) TROL KAPISI: Sadece Dondurma Bot'a kalıcı hız verir
      carBot.speed += boost; // Kalıcı +100 Hız
      carBot.nitroIntensity = Math.min(1.8, carBot.nitroIntensity + 0.8);
      screenShakeAmount = 14;
      spawnShockwave(carBot.x, carBot.y, '#00d9ff');
      spawnExhaustBurst(carBot, 20, '#00d9ff');
      showTrollBanner(event);
      playTrollSound();
      return;
    }

    // 2) DİĞER TÜM ETKİLEŞİMLER DOĞRUDAN TÜRKİYE'YE GİDER
    timeSinceLastTrGift = 0; // Hediye zaman sayacını sıfırla
    carTr.speed += boost; // KALICI HIZ ARTIŞI (Geriye düşme/damping yok!)

    if (event.type === 'big_gift') {
      // Büyük Hediye (+500 Ultra Hız & 👑 Milli Kahraman)
      carTr.nitroIntensity = 2.2;
      screenShakeAmount = 26;
      spawnShockwave(carTr.x, carTr.y, '#ff1e38');
      spawnExhaustBurst(carTr, 35, '#ffcc00', true);
      showMVPBanner(event);
      playNitroSound(true);
    } else if (event.type === 'small_gift') {
      // Gül (+50 Hız)
      carTr.nitroIntensity = Math.min(1.5, carTr.nitroIntensity + 0.65);
      screenShakeAmount = 8;
      spawnExhaustBurst(carTr, 16, '#ff1e38');
      playNitroSound(false);
    } else if (event.type === 'like') {
      // Beğeni (+5 Hız)
      carTr.nitroIntensity = Math.min(1.1, carTr.nitroIntensity + 0.3);
      spawnExhaustBurst(carTr, 8, '#ff6b7d');
      playTone(440, 0.12, 'sine', 0.08);
    } else {
      // Chat (+2 Hız)
      carTr.nitroIntensity = Math.min(0.8, carTr.nitroIntensity + 0.18);
    }

    // Katkı sağlayan kullanıcıyı liderlik tablosuna kaydet
    const uid = event.user?.uniqueId || 'isimsiz';
    const existing = roundContributors.get(uid) || {
      uniqueId: uid,
      nickname: event.user?.nickname || uid,
      avatar: event.user?.avatar,
      points: 0
    };
    existing.points += Math.round(boost);
    if (event.user?.avatar) existing.avatar = event.user.avatar;
    roundContributors.set(uid, existing);

    // Uçan hediye balonu oluştur
    spawnFloatingAvatar(carTr, event);
  }

  function showMVPBanner(event) {
    dom.mvpAvatar.src =
      event.user?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=MVP';
    dom.mvpUsername.textContent = `@${event.user?.nickname || event.user?.uniqueId || 'MilliKahraman'}`;
    dom.mvpGiftInfo.textContent = `🪄 ${event.giftCount || 1}x ${
      event.giftName || 'Büyük Hediye'
    } Gönderdi! (+${Math.round(event.boost)} KALICI HIZ)`;

    dom.mvpBanner.classList.remove('hidden');
    if (mvpTimeout) clearTimeout(mvpTimeout);
    mvpTimeout = setTimeout(() => {
      dom.mvpBanner.classList.add('hidden');
    }, 4500);
  }

  function showTrollBanner(event) {
    dom.trollSender.textContent = `@${
      event.user?.nickname || event.user?.uniqueId || 'Trol'
    } Dondurma Atarak Bot'a +${Math.round(event.boost)} Hız Kazandırdı!`;

    dom.trollBanner.classList.remove('hidden');
    if (trollTimeout) clearTimeout(trollTimeout);
    trollTimeout = setTimeout(() => {
      dom.trollBanner.classList.add('hidden');
    }, 3800);
  }

  function spawnFloatingAvatar(car, event) {
    getAvatarImage(event.user?.avatar);

    let badgeText = `+${Math.round(event.boost)} KM/S`;
    if (event.type === 'big_gift') badgeText = `👑 +${Math.round(event.boost)}`;
    else if (event.type === 'small_gift') badgeText = `🌹 +${Math.round(event.boost)}`;
    else if (event.type === 'like') badgeText = `❤️ +${Math.round(event.boost)}`;
    else if (event.type === 'chat') badgeText = `💬 +${Math.round(event.boost)}`;

    const offsetX = (Math.random() - 0.5) * 140;
    floatingAvatars.push({
      x: car.x + offsetX,
      y: car.y + 60,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 2.2 + Math.random() * 1.6,
      radius: event.type === 'big_gift' ? 46 : 34,
      avatarUrl: event.user?.avatar,
      nickname: (event.user?.nickname || 'Kahraman').slice(0, 12),
      badgeText,
      isMVP: Boolean(event.isMVP),
      alpha: 1,
      life: 0,
      maxLife: event.type === 'big_gift' ? 120 : 80
    });
  }

  function spawnShockwave(x, y, color) {
    shockwaves.push({
      x,
      y,
      radius: 20,
      maxRadius: 260,
      alpha: 0.95,
      color
    });
  }

  function spawnExhaustBurst(car, count, color, isMega = false) {
    for (let i = 0; i < count; i++) {
      exhaustParticles.push({
        x: car.x + (Math.random() - 0.5) * 44,
        y: car.y + 95,
        vx: (Math.random() - 0.5) * (isMega ? 6 : 3),
        vy: 6 + Math.random() * (isMega ? 15 : 8),
        size: (isMega ? 12 : 6) + Math.random() * 8,
        alpha: 1,
        color
      });
    }
  }

  // ============================================================================
  // AKILLI VE TEHDİTKÂR BOT MOTORU & FİZİK GÜNCELLEMESİ
  // ============================================================================
  function updatePhysics(dt) {
    if (!isRoundOver) {
      timeSinceLastTrGift += dt;

      // 1) BOT AKILLI VE TEHDİTKÂR ADRENALİN MOTORU
      // Bot her zaman önde kalmaz; bazen arayı yavaşça kapatır, bazen atak yapıp öne geçer
      botStateTimer += dt;
      const gap = carTr.distance - carBot.distance; // Pozitif: TR önde, Negatif: Bot önde

      if (timeSinceLastTrGift < 3.0) {
        // A) RAHATLAMA / ZAFER HİSSİ (İzleyici yeni hediye attı)
        // Bot TR'nin hızının biraz altında kalır, TR'nin 40-90m öne geçmesine izin verir
        botMode = 'cooldown';
        const relaxedSpeed = Math.max(BASE_SPEED, carTr.speed - 10);
        carBot.speed += (relaxedSpeed - carBot.speed) * 0.45 * dt;
        dom.botTensionText.textContent = '🟢 İZLEYİCİ BASKISI';
      } else if (gap > 10) {
        // B) SİNSİ TAKİP: ARAYI YAVAŞÇA KAPATMA
        // Hediye akışı durdu! Bot TR'den biraz daha hızlı giderek farkı sinsi sinsi kapatır
        botMode = 'stalk';
        const catchupSpeed = carTr.speed + 10 + Math.min(gap * 0.12, 22);
        carBot.speed += (catchupSpeed - carBot.speed) * 0.4 * dt;
        carBot.nitroIntensity = Math.min(1.2, carBot.nitroIntensity + 0.25 * dt);

        if (gap < 35) {
          dom.botTensionText.textContent = `⚠️ TAMPONDA! FARK: ${Math.round(gap)}M`;
        } else {
          dom.botTensionText.textContent = `⚡ FARKI KAPATIYOR: ${Math.round(gap)}M`;
        }
      } else if (gap <= 10 && gap >= -45) {
        // C) ANİ ATAK: ÖNE GEÇME (PANİK TETİKLEYİCİ)
        // Fark kapandı! Bot atağa kalkar, TR'nin 20-40 metre önüne geçerek izleyicide hediye panik duygusu yaratır
        botMode = 'attack';
        const overtakeSpeed = Math.max(carBot.speed, carTr.speed + 25);
        carBot.speed += (overtakeSpeed - carBot.speed) * 0.75 * dt;
        carBot.nitroIntensity = Math.min(1.7, carBot.nitroIntensity + 0.45 * dt);
        dom.botTensionText.textContent = '🔥 DÜŞMAN ATAKTA!';
      } else {
        // D) FARKI SABİTLEME (İzleyiciyi umutsuzluğa düşürmez)
        // Bot 45 metreden fazla açılmaz; TR'nin tek bir Gül (+50) veya beğeniyle geri geçebileceği mesafede kalır
        botMode = 'pacing';
        const pacingSpeed = carTr.speed + 4;
        carBot.speed += (pacingSpeed - carBot.speed) * 0.5 * dt;
        dom.botTensionText.textContent = '⚠️ ÖNDE (TEHLİKE)';
      }

      // 2) MESAFE İLERLEMESİ (10.000 Metre Hesabı)
      // car.speed (KM/S) -> M/S dönüşümü ve DISTANCE_SCALE ile entegrasyon
      const trMetersPerSec = (carTr.speed * 1000) / 3600;
      const botMetersPerSec = (carBot.speed * 1000) / 3600;

      carTr.distance += trMetersPerSec * dt * DISTANCE_SCALE;
      carBot.distance += botMetersPerSec * dt * DISTANCE_SCALE;

      // Sınırlandırma
      carTr.distance = Math.min(TARGET_DISTANCE, carTr.distance);
      carBot.distance = Math.min(TARGET_DISTANCE, carBot.distance);

      // 3) GÖRSEL DİKEY KONUM HESABI (Mesafeye Göre Dinamik Yükselme/Düşme)
      const leadDiff = carTr.distance - carBot.distance; // Türkiye farkı
      const targetTrY = Math.max(620, Math.min(1600, MID_Y - leadDiff * 1.5));
      const targetBotY = Math.max(620, Math.min(1600, MID_Y + leadDiff * 1.5));

      carTr.y += (targetTrY - carTr.y) * 0.12;
      carBot.y += (targetBotY - carBot.y) * 0.12;

      // Motor titremesi
      carTr.wobblePhase += 0.14;
      carBot.wobblePhase += 0.14;
      carTr.x = carTr.baseX + Math.sin(carTr.wobblePhase) * 2.8;
      carBot.x = carBot.baseX + Math.sin(carBot.wobblePhase) * 2.8;

      // Nitro alevi sönümlenmesi
      carTr.nitroIntensity = Math.max(0, carTr.nitroIntensity * 0.97 - 0.005);
      carBot.nitroIntensity = Math.max(0, carBot.nitroIntensity * 0.97 - 0.005);

      // Sürekli egzoz parçacıkları
      if (Math.random() < 0.6) {
        exhaustParticles.push({
          x: carTr.x + (Math.random() > 0.5 ? -18 : 18),
          y: carTr.y + 98,
          vx: (Math.random() - 0.5) * 1.2,
          vy: 6 + carTr.nitroIntensity * 8,
          size: 5 + carTr.nitroIntensity * 8,
          alpha: 0.85,
          color: carTr.nitroIntensity > 0.8 ? '#ffea00' : '#e30a17'
        });
      }
      if (Math.random() < 0.6) {
        exhaustParticles.push({
          x: carBot.x + (Math.random() > 0.5 ? -18 : 18),
          y: carBot.y + 98,
          vx: (Math.random() - 0.5) * 1.2,
          vy: 6 + carBot.nitroIntensity * 8,
          size: 5 + carBot.nitroIntensity * 8,
          alpha: 0.85,
          color: carBot.nitroIntensity > 0.8 ? '#00ffff' : '#0d5eaf'
        });
      }

      // 4) ADRENALİN & UYARI HUD'I (PANİK TETİKLEYİCİ)
      if (carBot.distance > carTr.distance) {
        // BOT ÖNE GEÇTİ -> DEVASA KIRMIZI ALARM!
        if (currentLeader !== 'bot') {
          currentLeader = 'bot';
          playPanicSiren();
        }
        dom.panicBanner.className = 'panic-banner banner-panic-danger';
        dom.panicBannerText.textContent = '⚠️ DÜŞMAN ÖNE GEÇTİ! YETİŞMEK İÇİN ACİL GÜL BASIN! ⚠️';
      } else {
        // TÜRKİYE LİDER
        currentLeader = 'tr';
        dom.panicBanner.className = 'panic-banner banner-leader-tr';
        const diffInt = Math.max(0, Math.round(leadDiff));
        dom.panicBannerText.textContent = `🇹🇷 TÜRKİYE LİDERLİĞİ ALDI! FARK: +${diffInt}M`;
      }

      // 5) 10.000 METRE BİTİŞ KONTROLÜ
      if (carTr.distance >= TARGET_DISTANCE || carBot.distance >= TARGET_DISTANCE) {
        const winningTeamId = carTr.distance >= TARGET_DISTANCE ? 1 : 2;
        triggerRoundWin(winningTeamId);
      }
    }

    // Parallax Yol Akışı
    const avgSpeed = (carTr.speed + carBot.speed) * 0.5;
    const roadSpeed = 12 + avgSpeed * 0.08;
    roadScrollOffset = (roadScrollOffset + roadSpeed) % 160;
    roadsideScrollOffset = (roadsideScrollOffset + roadSpeed * 1.2) % 240;

    // Parçacıkları güncelle
    for (let i = exhaustParticles.length - 1; i >= 0; i--) {
      const p = exhaustParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.size *= 0.95;
      p.alpha -= 0.04;
      if (p.alpha <= 0.02 || p.size <= 0.8) exhaustParticles.splice(i, 1);
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.radius += 12;
      sw.alpha -= 0.035;
      if (sw.alpha <= 0) shockwaves.splice(i, 1);
    }

    for (let i = floatingAvatars.length - 1; i >= 0; i--) {
      const b = floatingAvatars[i];
      b.life++;
      b.x += b.vx;
      b.y += b.vy;
      if (b.life > b.maxLife * 0.65) {
        b.alpha = Math.max(0, 1 - (b.life - b.maxLife * 0.65) / (b.maxLife * 0.35));
      }
      if (b.life >= b.maxLife) floatingAvatars.splice(i, 1);
    }

    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const c = confettiParticles[i];
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.18;
      c.rotation += c.vRot;
      if (c.y > HEIGHT + 40) confettiParticles.splice(i, 1);
    }

    updateHUD();
  }

  function updateHUD() {
    // 10.000m İlerleme Yüzdeleri
    const trPct = Math.min(100, (carTr.distance / TARGET_DISTANCE) * 100);
    const botPct = Math.min(100, (carBot.distance / TARGET_DISTANCE) * 100);

    dom.trProgressBar.style.width = `${trPct.toFixed(1)}%`;
    dom.botProgressBar.style.width = `${botPct.toFixed(1)}%`;

    dom.trDistanceText.textContent = `${Math.round(carTr.distance)} / 10.000M`;
    dom.botDistanceText.textContent = `${Math.round(carBot.distance)} / 10.000M`;

    dom.trSpeed.textContent = Math.round(carTr.speed);
    dom.botSpeed.textContent = Math.round(carBot.speed);
  }

  // ============================================================================
  // TUR SONU VE SIFIRLAMA (10.000M TAMAMLANDI)
  // ============================================================================
  function triggerRoundWin(winningTeamId) {
    isRoundOver = true;

    if (winningTeamId === 1) {
      // TÜRKİYE KAZANDI
      carTr.wins += 1;
      dom.trWins.textContent = carTr.wins;
      playVictoryFanfare();
      spawnCelebrationConfetti(1);

      dom.winnerCrown.textContent = '🏆 10.000M ZAFERİ! 🏆';
      dom.winnerTeamTitle.textContent = '🇹🇷 TÜRKİYE KAZANDI!';
      dom.winnerTeamTitle.style.color = '#ff3b4e';
      dom.winnerSubtitle.textContent = 'Bu Turun En Çok Hız Kazandıran İlk 3 Milli Kahramanı';

      dom.winnerFlagBox.innerHTML = `
        <svg viewBox="0 0 120 80" class="flag-svg">
          <rect width="120" height="80" fill="#E30A17"/>
          <circle cx="48" cy="40" r="20" fill="#ffffff"/>
          <circle cx="53" cy="40" r="16" fill="#E30A17"/>
          <polygon points="72,40 85,44 77,33 77,47 85,36" fill="#ffffff" transform="rotate(-15 78 40)"/>
        </svg>`;

      // En çok puan kazandıran ilk 3 Milli Kahraman
      const sortedContributors = Array.from(roundContributors.values())
        .sort((a, b) => b.points - a.points)
        .slice(0, 3);

      if (sortedContributors.length === 0) {
        dom.winnerLeaderboard.innerHTML = `
          <div class="leader-row">
            <div class="leader-left">
              <span class="leader-rank">#1</span>
              <span class="leader-name">Gül atarak adınızı Milli Kahramanlar tablosuna yazdırın!</span>
            </div>
            <span class="leader-points">👑 KAHRAMAN</span>
          </div>`;
      } else {
        dom.winnerLeaderboard.innerHTML = sortedContributors
          .map(
            (user, idx) => `
            <div class="leader-row">
              <div class="leader-left">
                <span class="leader-rank">#${idx + 1}</span>
                <img class="leader-avatar" src="${
                  user.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=MVP'
                }" alt="${user.nickname}" />
                <span class="leader-name">@${user.nickname}</span>
              </div>
              <span class="leader-points">+${user.points} HIZ</span>
            </div>`
          )
          .join('');
      }
    } else {
      // BOT KAZANDI
      carBot.wins += 1;
      dom.botWins.textContent = carBot.wins;
      playTone(180, 0.8, 'sawtooth', 0.2);

      dom.winnerCrown.textContent = '💀 TURU BOT KAZANDI! 💀';
      dom.winnerTeamTitle.textContent = '🤖 YAPAY ZEKA BOT KAZANDI!';
      dom.winnerTeamTitle.style.color = '#38a4ff';
      dom.winnerSubtitle.textContent = 'Düşman 10.000 metreye önce ulaştı! Yeni turda acil Gül basarak intikamı alalım!';

      dom.winnerFlagBox.innerHTML = `
        <svg viewBox="0 0 120 80" class="flag-svg">
          <rect width="120" height="80" fill="#0D5EAF"/>
          <rect y="9" width="120" height="9" fill="#ffffff"/>
          <rect y="27" width="120" height="9" fill="#ffffff"/>
          <rect y="45" width="120" height="9" fill="#ffffff"/>
          <rect y="63" width="120" height="9" fill="#ffffff"/>
          <rect width="45" height="45" fill="#0D5EAF"/>
          <rect x="18" width="9" height="45" fill="#ffffff"/>
          <rect y="18" width="45" height="9" fill="#ffffff"/>
        </svg>`;

      dom.winnerLeaderboard.innerHTML = `
        <div class="leader-row">
          <div class="leader-left">
            <span class="leader-rank">⚠️</span>
            <span class="leader-name">Yeni Turda Düşmanı Durdurmak İçin Birlikte Gül Basın!</span>
          </div>
          <span class="leader-points">HAYDİ TÜRKİYE!</span>
        </div>`;
    }

    dom.winnerOverlay.classList.remove('hidden');

    // 5 Saniye Geri Sayım ve Sıfırlama
    let remaining = 5;
    dom.countdownSeconds.textContent = remaining;

    const timer = setInterval(() => {
      remaining -= 1;
      dom.countdownSeconds.textContent = Math.max(0, remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        startNextRound();
      }
    }, 1000);
  }

  function startNextRound() {
    roundNumber += 1;
    dom.roundNumber.textContent = roundNumber;
    dom.winnerOverlay.classList.add('hidden');

    // Hızları ve mesafeleri başlangıç değerlerine sıfırla
    carTr.speed = BASE_SPEED;
    carTr.distance = 0;
    carTr.y = MID_Y;
    carTr.nitroIntensity = 0;

    carBot.speed = BASE_SPEED;
    carBot.distance = 0;
    carBot.y = MID_Y;
    carBot.nitroIntensity = 0;

    timeSinceLastTrGift = 0;
    roundContributors.clear();
    floatingAvatars.length = 0;
    isRoundOver = false;
  }

  function spawnCelebrationConfetti(teamId) {
    const palette = ['#e30a17', '#ffffff', '#ffcc00', '#ff6600'];
    for (let i = 0; i < 110; i++) {
      confettiParticles.push({
        x: WIDTH * 0.5 + (Math.random() - 0.5) * 700,
        y: 300 + (Math.random() - 0.5) * 200,
        vx: (Math.random() - 0.5) * 14,
        vy: -10 + Math.random() * 14,
        size: 10 + Math.random() * 12,
        color: palette[Math.floor(Math.random() * palette.length)],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.2
      });
    }
  }

  // ============================================================================
  // CANVAS ÇİZİM FONKSİYONLARI (PARALLAX YOL, ARAÇLAR, EFEKTLER)
  // ============================================================================
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    if (screenShakeAmount > 0.4) {
      const sx = (Math.random() - 0.5) * screenShakeAmount;
      const sy = (Math.random() - 0.5) * screenShakeAmount;
      ctx.translate(sx, sy);
      screenShakeAmount *= 0.88;
    }

    drawParallaxRoadside();
    drawRoadTrack();
    drawRoadMeterMarkings();
    drawFinishLine();
    drawTurboSpeedStreaks();
    drawShockwaves();
    drawExhaustParticles();

    // İki aracı çiz
    drawCar(carTr);
    drawCar(carBot);

    // Uçan hediye avatarlarını ve konfetileri çiz
    drawFloatingAvatars();
    drawConfetti();

    ctx.restore();
  }

  function drawTurboSpeedStreaks() {
    const intensity = Math.max(carTr.nitroIntensity, carBot.nitroIntensity);
    if (intensity < 0.35 && carTr.speed < 260) return;

    ctx.save();
    const streakCount = Math.floor(10 + intensity * 24);
    ctx.lineWidth = 2 + intensity * 2;
    for (let i = 0; i < streakCount; i++) {
      const rx = ROAD_LEFT + Math.random() * ROAD_WIDTH;
      const ry = Math.random() * HEIGHT;
      const rlen = 60 + Math.random() * 180 * intensity;
      ctx.strokeStyle = Math.random() > 0.4 ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 204, 0, 0.4)';
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx, ry + rlen);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParallaxRoadside() {
    const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, 0);
    bgGrad.addColorStop(0, '#160408');
    bgGrad.addColorStop(0.14, '#0c0f1a');
    bgGrad.addColorStop(0.86, '#0c0f1a');
    bgGrad.addColorStop(1, '#041022');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (let y = -240 + roadsideScrollOffset; y < HEIGHT + 240; y += 240) {
      // Sol tribün neon ışık (Türkiye Kırmızı)
      ctx.save();
      ctx.fillStyle = 'rgba(227, 10, 23, 0.16)';
      ctx.fillRect(25, y, 90, 120);
      ctx.fillStyle = '#ff2a4b';
      ctx.shadowColor = '#ff2a4b';
      ctx.shadowBlur = 18;
      ctx.fillRect(105, y + 20, 12, 80);
      ctx.restore();

      // Sağ tribün neon ışık (Bot Mavi)
      ctx.save();
      ctx.fillStyle = 'rgba(13, 94, 175, 0.16)';
      ctx.fillRect(ROAD_RIGHT + 35, y, 90, 120);
      ctx.fillStyle = '#00d9ff';
      ctx.shadowColor = '#00d9ff';
      ctx.shadowBlur = 18;
      ctx.fillRect(ROAD_RIGHT + 23, y + 20, 12, 80);
      ctx.restore();
    }
  }

  function drawRoadTrack() {
    const roadGrad = ctx.createLinearGradient(ROAD_LEFT, 0, ROAD_RIGHT, 0);
    roadGrad.addColorStop(0, '#151821');
    roadGrad.addColorStop(0.5, '#1e2330');
    roadGrad.addColorStop(1, '#151821');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, HEIGHT);

    // Kırmızı & Mavi zemin yansıması
    ctx.fillStyle = 'rgba(227, 10, 23, 0.04)';
    ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH * 0.5, HEIGHT);
    ctx.fillStyle = 'rgba(13, 94, 175, 0.04)';
    ctx.fillRect(ROAD_LEFT + ROAD_WIDTH * 0.5, 0, ROAD_WIDTH * 0.5, HEIGHT);

    // Bordür Taşları (Kerb)
    const kerbHeight = 80;
    for (let y = -160 + roadScrollOffset; y < HEIGHT + 160; y += kerbHeight) {
      const isAlt = Math.floor((y - roadScrollOffset) / kerbHeight) % 2 === 0;
      ctx.fillStyle = isAlt ? '#e30a17' : '#ffffff';
      ctx.fillRect(ROAD_LEFT - 22, y, 22, kerbHeight);

      ctx.fillStyle = isAlt ? '#0d5eaf' : '#ffffff';
      ctx.fillRect(ROAD_RIGHT, y, 22, kerbHeight);
    }

    // Orta Şerit Çizgisi
    const centerX = ROAD_LEFT + ROAD_WIDTH * 0.5;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    for (let y = -160 + roadScrollOffset; y < HEIGHT + 160; y += 160) {
      ctx.fillRect(centerX - 6, y, 12, 90);
    }
    ctx.restore();
  }

  /**
   * Yol Üzerindeki Metre Yazıları ve Kilometre Taşları
   * Arabalar 10.000 metre boyunca ilerledikçe yoldan aşağı doğru akar
   */
  function drawRoadMeterMarkings() {
    const PX_PER_METER = 2.4;
    const leaderDist = Math.max(carTr.distance, carBot.distance);
    const leaderY = Math.min(carTr.y, carBot.y);

    const minVisDist = Math.max(0, leaderDist - 250);
    const maxVisDist = Math.min(TARGET_DISTANCE, leaderDist + 650);

    const startStep = Math.floor(minVisDist / 100) * 100;
    const endStep = Math.ceil(maxVisDist / 100) * 100;

    for (let d = startStep; d <= endStep; d += 100) {
      if (d <= 0 || d >= TARGET_DISTANCE) continue;

      const screenY = leaderY - (d - leaderDist) * PX_PER_METER;
      if (screenY < -80 || screenY > HEIGHT + 80) continue;

      const isMajor = d % 500 === 0;
      const isQuarter = d % 250 === 0 && !isMajor;

      ctx.save();
      if (isMajor) {
        // 500M, 1000M, 2500M, 5000M gibi BÜYÜK KİLOMETRE TAŞLARI
        ctx.strokeStyle = 'rgba(255, 204, 0, 0.65)';
        ctx.lineWidth = 4;
        ctx.setLineDash([22, 14]);
        ctx.beginPath();
        ctx.moveTo(ROAD_LEFT + 12, screenY);
        ctx.lineTo(ROAD_RIGHT - 12, screenY);
        ctx.stroke();

        let label = `🏁 ${d.toLocaleString('tr-TR')} M`;
        if (d === 5000) label = `⚡ 5.000 M (YARI YOL) ⚡`;
        else if (d === 9000) label = `🔥 9.000 M (SON 1.000M) 🔥`;
        else if (d === 9500) label = `⚠️ 9.500 M (SON DÜZLÜK) ⚠️`;

        ctx.font = '900 24px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(label).width;

        // Yol üstü tabela arka planı
        ctx.fillStyle = 'rgba(6, 10, 20, 0.94)';
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(WIDTH * 0.5 - tw * 0.5 - 20, screenY - 22, tw + 40, 44, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffea00';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 14;
        ctx.fillText(label, WIDTH * 0.5, screenY);
      } else if (isQuarter) {
        // 250M, 750M, 1250M çeyrek kilometre çizgileri
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 3;
        ctx.setLineDash([16, 12]);
        ctx.beginPath();
        ctx.moveTo(ROAD_LEFT + 25, screenY);
        ctx.lineTo(ROAD_RIGHT - 25, screenY);
        ctx.stroke();

        ctx.font = '800 20px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText(`${d.toLocaleString('tr-TR')} M`, WIDTH * 0.5, screenY - 14);
      } else {
        // 100M ara çizgiler
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 12]);
        ctx.beginPath();
        ctx.moveTo(ROAD_LEFT + 40, screenY);
        ctx.lineTo(ROAD_RIGHT - 40, screenY);
        ctx.stroke();

        ctx.font = '700 16px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillText(`${d}M`, WIDTH * 0.5, screenY - 10);
      }
      ctx.restore();
    }
  }

  /**
   * Bitiş Çizgisi ve 10.000M Damalı Bayrak Kemeri
   */
  function drawFinishLine() {
    const leaderDist = Math.max(carTr.distance, carBot.distance);
    const remainingMeters = Math.max(0, TARGET_DISTANCE - Math.round(leaderDist));

    // 1) Ekranda sabit duran damalı üst bitiş çizgisi referansı (HUD'ın hemen altında Y = 440)
    const squareSize = 26;
    const rows = 2;
    const cols = Math.floor(ROAD_WIDTH / squareSize);
    const topFinishY = 440;

    ctx.save();
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 20;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
        ctx.fillRect(ROAD_LEFT + c * squareSize, topFinishY - r * squareSize, squareSize, squareSize);
      }
    }

    // Üst Bitiş Çizgisi Tabela Yazısı
    ctx.fillStyle = 'rgba(6, 10, 20, 0.9)';
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(WIDTH * 0.5 - 280, topFinishY - 76, 560, 42, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffcc00';
    ctx.font = '900 24px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🏁 10.000M BİTİŞ | KALAN: ${remainingMeters.toLocaleString('tr-TR')}M 🏁`, WIDTH * 0.5, topFinishY - 55);
    ctx.restore();

    // 2) 10.000 metreye yaklaşıldığında (9.200M+) aşağı doğru süzülen fiziksel bitiş çizgisi
    if (leaderDist >= 9200) {
      const PX_PER_METER = 2.4;
      const leaderY = Math.min(carTr.y, carBot.y);
      const worldFinishY = leaderY - (TARGET_DISTANCE - leaderDist) * PX_PER_METER;

      if (worldFinishY >= -60 && worldFinishY <= HEIGHT + 60) {
        ctx.save();
        ctx.shadowColor = '#00ff66';
        ctx.shadowBlur = 28;

        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#000000';
            ctx.fillRect(ROAD_LEFT + c * squareSize, worldFinishY - r * squareSize, squareSize, squareSize);
          }
        }

        ctx.fillStyle = '#ffea00';
        ctx.font = '900 34px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏆 10.000M BİTİŞ ÇİZGİSİ 🏆', WIDTH * 0.5, worldFinishY - 48);
        ctx.restore();
      }
    }
  }

  function drawCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);

    const isTr = car.teamId === 1;

    // Egzoz Nitro Alevi
    const flameLen = 35 + car.nitroIntensity * 90 + Math.random() * 18;
    [-20, 20].forEach((offsetX) => {
      const grad = ctx.createLinearGradient(offsetX, 85, offsetX, 85 + flameLen);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, isTr ? '#ffcc00' : '#00ffff');
      grad.addColorStop(0.7, isTr ? '#e30a17' : '#0d5eaf');
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(offsetX - 10, 88);
      ctx.lineTo(offsetX + 10, 88);
      ctx.lineTo(offsetX, 88 + flameLen);
      ctx.closePath();
      ctx.fill();
    });

    const sprite = carSprites[car.teamId];
    if (sprite && sprite.loaded) {
      ctx.drawImage(sprite.img, -65, -105, 130, 210);
    } else {
      drawBuiltInF1Car(ctx, car.teamId, car.nitroIntensity);
    }

    // Araç Üstü Hız Etiketi
    ctx.fillStyle = 'rgba(6, 10, 18, 0.88)';
    ctx.strokeStyle = isTr ? '#e30a17' : '#00d9ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-70, -148, 140, 36, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 20px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(car.speed)} KM/S`, 0, -124);

    ctx.restore();
  }

  function drawBuiltInF1Car(ctx, teamId, nitroIntensity) {
    const isTr = teamId === 1;
    const primaryColor = isTr ? '#e30a17' : '#0d5eaf';
    const secondaryColor = isTr ? '#ff4d63' : '#38a4ff';
    const glowColor = isTr ? 'rgba(227, 10, 23, 0.7)' : 'rgba(0, 217, 255, 0.7)';

    // Neon Underglow
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 30 + nitroIntensity * 25;
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 48, 92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4 Tekerlek
    ctx.fillStyle = '#10141d';
    ctx.strokeStyle = '#323a4b';
    ctx.lineWidth = 3;
    const wheels = [
      { x: -56, y: -62, w: 20, h: 38 },
      { x: 36, y: -62, w: 20, h: 38 },
      { x: -58, y: 34, w: 22, h: 44 },
      { x: 36, y: 34, w: 22, h: 44 }
    ];
    wheels.forEach((w) => {
      ctx.beginPath();
      ctx.roundRect(w.x, w.y, w.w, w.h, 6);
      ctx.fill();
      ctx.stroke();
    });

    // Ön Kanat
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(-54, -96);
    ctx.lineTo(54, -96);
    ctx.lineTo(44, -80);
    ctx.lineTo(-44, -80);
    ctx.closePath();
    ctx.fill();

    // Ana Gövde
    const bodyGrad = ctx.createLinearGradient(-40, -90, 40, 90);
    bodyGrad.addColorStop(0, secondaryColor);
    bodyGrad.addColorStop(0.5, primaryColor);
    bodyGrad.addColorStop(1, '#0e121a');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -102);
    ctx.lineTo(24, -60);
    ctx.lineTo(40, -20);
    ctx.lineTo(36, 65);
    ctx.lineTo(22, 88);
    ctx.lineTo(-22, 88);
    ctx.lineTo(-36, 65);
    ctx.lineTo(-40, -20);
    ctx.lineTo(-24, -60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Kokpit & Kask
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath();
    ctx.ellipse(0, -8, 16, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isTr ? '#ffffff' : '#00d9ff';
    ctx.beginPath();
    ctx.arc(0, -4, 9, 0, Math.PI * 2);
    ctx.fill();

    // Kaput Üstü Amblem
    if (isTr) {
      // Ay-Yıldız Motifi (Türkiye)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-3, 42, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.arc(1, 42, 9.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(10, 42, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Robotik / Mavi Haç Motifi (Bot Rakip)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-12, 38, 24, 6);
      ctx.fillRect(-3, 29, 6, 24);
    }

    // Arka Spoiler
    ctx.fillStyle = '#0d111a';
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-48, 76, 96, 18, 5);
    ctx.fill();
    ctx.stroke();
  }

  function drawShockwaves() {
    shockwaves.forEach((sw) => {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawExhaustParticles() {
    exhaustParticles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawFloatingAvatars() {
    floatingAvatars.forEach((b) => {
      ctx.save();
      ctx.globalAlpha = b.alpha;
      ctx.translate(b.x, b.y);

      const borderColor = b.isMVP ? '#ffcc00' : '#e30a17';

      ctx.fillStyle = '#101522';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = b.isMVP ? 5 : 3.5;
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = b.isMVP ? 22 : 10;

      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const avatarEntry = getAvatarImage(b.avatarUrl);
      if (avatarEntry && avatarEntry.loaded) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, b.radius - 3, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          avatarEntry.img,
          -(b.radius - 3),
          -(b.radius - 3),
          (b.radius - 3) * 2,
          (b.radius - 3) * 2
        );
        ctx.restore();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.round(b.radius * 0.8)}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.nickname.charAt(0).toUpperCase(), 0, 2);
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(6, 10, 20, 0.94)';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-60, b.radius - 8, 120, 26, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = b.isMVP ? '#ffea00' : '#ffffff';
      ctx.font = '800 15px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.badgeText, 0, b.radius + 10);

      ctx.restore();
    });
  }

  function drawConfetti() {
    confettiParticles.forEach((c) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size * 0.5, -c.size * 0.3, c.size, c.size * 0.6);
      ctx.restore();
    });
  }

  // ============================================================================
  // ANA OYUN DÖNGÜSÜ (60 FPS)
  // ============================================================================
  let lastTime = performance.now();
  function gameLoop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    updatePhysics(dt);
    render();

    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);

  // ============================================================================
  // SOCKET.IO BAĞLANTISI & TEST KONTROLLERİ
  // ============================================================================
  let socket = null;
  if (typeof io !== 'undefined') {
    try {
      socket = io();

      socket.on('tiktok_status', (state) => {
        if (state && state.connected) {
          dom.connectionBadge.classList.add('badge-live');
          dom.connectionText.textContent = `CANLI: @${state.username}`;
        } else {
          dom.connectionBadge.classList.remove('badge-live');
          dom.connectionText.textContent =
            state?.username && state.username !== 'ornek_kullanici_adi'
              ? `TEST MODU (@${state.username} Bekleniyor)`
              : 'TEST MODU AKTİF';
        }
      });

      socket.on('race_event', (eventData) => {
        handleRaceEvent(eventData);
      });
    } catch (e) {
      console.warn('Socket bağlantısı başlatılamadı, yerel test devrede:', e);
    }
  }

  function emitOrSimulate(action) {
    initAudio();
    if (socket && socket.connected) {
      socket.emit('simulate_event', { action });
    } else {
      const sampleNames = ['AyYildiz_Kral', 'KirmiziFirtina', 'TurboTR', 'MilliDestek'];
      const nickname = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(nickname)}`;

      let boost = 50;
      let giftName = 'Gül 🌹';
      let isMVP = false;
      let isTroll = false;

      if (action === 'small_gift') {
        boost = 50;
        giftName = 'Gül 🌹';
      } else if (action === 'big_gift') {
        boost = 500;
        giftName = 'Büyülü Asa 🪄';
        isMVP = true;
      } else if (action === 'like') {
        boost = 5;
      } else if (action === 'chat') {
        boost = 2;
      } else if (action === 'troll_gift') {
        boost = 100;
        giftName = 'Dondurma 🍦';
        isTroll = true;
      }

      handleRaceEvent({
        team: isTroll ? 2 : 1,
        type: action,
        boost,
        giftName,
        giftCount: 1,
        isMVP,
        isTroll,
        user: { uniqueId: nickname.toLowerCase(), nickname, avatar }
      });
    }
  }

  // Buton Tıklamaları
  document.querySelectorAll('.test-buttons button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      emitOrSimulate(action);
    });
  });

  // Test Panelini Gizle/Göster
  dom.toggleTestBtn.addEventListener('click', () => {
    dom.testPanel.classList.toggle('collapsed');
  });

  // Canlı Yayın Kullanıcı Adı Bağlama
  dom.tiktokConnectBtn.addEventListener('click', () => {
    const val = dom.tiktokUserInput.value.trim().replace(/^@/, '');
    if (val && socket) {
      socket.emit('change_tiktok_user', val);
      dom.connectionText.textContent = `BAĞLANILIYOR: @${val}...`;
    }
  });

  // Klavye Kısayolları
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    switch (key) {
      case '1':
      case 'a':
        emitOrSimulate('small_gift'); // Gül (+50 Hız - Türkiye)
        break;
      case '2':
      case 'z':
        emitOrSimulate('big_gift'); // Asa (+500 Hız - Türkiye & Milli Kahraman)
        break;
      case 'q':
        emitOrSimulate('like'); // 15 Beğeni (+5 Hız - Türkiye)
        break;
      case 'c':
        emitOrSimulate('chat'); // Tezahürat (+2 Hız - Türkiye)
        break;
      case 's':
      case 'x':
        emitOrSimulate('troll_gift'); // Dondurma (+100 Hız - Bot)
        break;
      case 'h':
        dom.testPanel.classList.toggle('collapsed');
        break;
      case 'm':
        dom.audioToggleBtn.click();
        break;
    }
  });
})();
