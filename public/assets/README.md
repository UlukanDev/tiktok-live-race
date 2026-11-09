# Oyun İçi Görsel Varlıklar (`public/assets/`)

Oyun motoru (`public/game.js`), kutudan çıktığı anda **harici hiçbir görsele ihtiyaç duymadan** Canvas üzerinde 2 adet detaylı 2D F1 yarış aracını (Sol şerit: Kırmızı / Ay-Yıldız, Sağ şerit: Mavi / Rakip) otomatik olarak çizer.

## Özel Araç Görseli Ekleme (İsteğe Bağlı)
Kendi özel araç tasarımlarınızı kullanmak isterseniz bu klasöre (`public/assets/`) aşağıdaki dosya isimleriyle yüklemeniz yeterlidir:
- `car1.png` -> Sol Şerit (Takım 1) aracı (Önerilen boyut: `260x420` px, şeffaf arka planlı PNG, yukarı bakan araç)
- `car2.png` -> Sağ Şerit (Takım 2) aracı (Önerilen boyut: `260x420` px, şeffaf arka planlı PNG, yukarı bakan araç)

Sayfayı yenilediğinizde `game.js` bu dosyaları otomatik algılar ve yerleşik çizim yerine doğrudan PNG dosyalarınızı ekranda kullanır.

