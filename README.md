# 🏎️ TikTok Live 2D Yarış: İzleyiciler (Türkiye) vs Yapay Zeka Botu (1080x1920)

TikTok canlı yayınlarındaki **beğeniler ve hediyelerle** kontrol edilen, **OBS Studio** ve **TikTok Live Studio** için özel olarak tasarlanmış dikey (`9:16` - `1080x1920`) 2D interaktif yarış oyunu.

---

## 🎯 Yeni Oyun Mantığı ve Kurallar

### 1. Sıfır Sürtünme (Seçim Zorunluluğu Yok)
- İzleyicilerin sohbete `"1"` veya `"2"` yazmasına gerek yoktur.
- Gelen **TÜM standart hediyeler** (Gül, Asa, Kalp, Aslan vb.) ve ekrana tıklanan **TÜM beğeniler** varsayılan olarak doğrudan **Türkiye** aracına hız kazandırır.
- **Trol Kapısı:** Sadece **Dondurma (Ice Cream)** atılırsa Bot aracına hız puanı eklenir.

### 2. Kalıcı Hız Artışı (Damping / Hız Düşüşü Yok)
- Hediyelerle veya beğenilerle kazanılan hız zamanla geriye düşmez; tur bitene kadar aracın taban hızına eklenerek kalıcı olur.
- **Beğeniler (Likes):** Her 15 beğeni Türkiye aracına kalıcı **+5 Hız** ekler.
- **Küçük Hediye (Gül - 1 Jeton):** Türkiye aracına kalıcı **+50 Hız** ekler.
- **Büyük Hediye (Asa vb.):** Türkiye aracına devasa **+500 Ultra Hız** ekler ve ekranda hediye atanın profil fotoğrafıyla **👑 MİLLİ KAHRAMAN / MVP** kartı patlar.
- **Trol Hediyesi (Dondurma):** Bot aracına kalıcı **+100 Hız** ekler.

### 3. Akıllı ve Tehditkâr Bot Algoritması (Gerilim Motoru)
- Sağ şeritteki Bot araç sabit durmaz; her saniye otomatik olarak ivmelenir.
- **Dinamik Gerilim:** Bot'un hızı Türkiye'nin hızına endekslidir. Türkiye arayı çok açtığında Bot hızlanıp arayı kapatır; hediye akışı duraksadığında ise Türkiye'nin önüne geçer.

### 4. Adrenalin & Panik Uyarı HUD'ı
- **Bot Öne Geçtiğinde:** Ekranın üstünde kırmızı neon yanıp sönen devasa panik uyarısı ve alarm çalar:
  > `⚠️ DÜŞMAN ÖNE GEÇTİ! YETİŞMEK İÇİN ACİL GÜL BASIN! ⚠️`
- **Türkiye Öne Geçtiğinde:** Yeşil liderlik bannerı görünür:
  > `🇹🇷 TÜRKİYE LİDERLİĞİ ALDI!`

### 5. 10.000 Metre Bitiş Çizgisi ve Sıfırlama
- **10.000 metre (10.000M)** mesafeyi ilk tamamlayan araç turu kazanır.
- Türkiye kazanırsa zafer ekranı, Türk bayrağı ve tura en çok hız kazandıran ilk 3 izleyicinin (Milli Kahramanlar) listesi açılır.
- 5 saniye sonra hızlar başlangıç değerlerine (120 KM/S) sıfırlanıp yeni tur otomatik başlar.

---

## ⌨️ Klavye ve Test Kısayolları

Tarayıcıda (`http://localhost:3000`) klavyenizle doğrudan test edebilirsiniz:

| Kısayol | Etki |
| :---: | :--- |
| **`1` veya `A`** | Türkiye **Gül 🌹** (+50 Kalıcı Hız) |
| **`2` veya `Z`** | Türkiye **Büyülü Asa 🪄** (+500 Ultra Hız & 👑 Milli Kahraman) |
| **`Q`** | **15 Beğeni ❤️** (+5 Kalıcı Hız) |
| **`C`** | **Chat Tezahürat 💬** (+2 Hız) |
| **`S` veya `X`** | Bot **Dondurma 🍦** (+100 Bot Hızı - Trol Kapısı) |
| **`H`** | Alt Test Panelini Gizle / Aç |
| **`M`** | Sentetizör Sesini Aç / Kapat (Web Audio) |

---

## 🎥 OBS Studio & TikTok Live Studio Ayarları

1. Tuval (Canvas) Çözünürlüğünü: **`1080x1920`** (Dikey 9:16) ve **`60 FPS`** olarak ayarlayın.
2. **Kaynaklar -> Tarayıcı (Browser Source)** ekleyin:
   - **URL:** `http://localhost:3000?obs=true`
   - **Genişlik (Width):** `1080`
   - **Yükseklik (Height):** `1920`
   - **Özel Kare Hızı:** `60 FPS`
