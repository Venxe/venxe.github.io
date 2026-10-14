# Caelestia geçişi: uygulama ve doğrulama

14 Ekim 2026.

## Uygulananlar

- Caelestia sol barı, yuvarlatılmış çerçeve ve kenara bağlı çekmeceler; beş çalışma alanı ve etkin alan şekilleri.
- Aranabilir Launcher; yerel terminal ve duvar kâğıdı pencereleri; iki pencere için bölmeli yerleşim, kapatma, tam ekran, odak ve çalışma alanına taşıma.
- Dashboard/Media/Performance/Weather sekmeleri; yerel saat, klavyeyle gezilebilir takvim ve açıkça örnek olarak sunulan medya/hava/kaynak verileri.
- Utilities, ağ/pil popout'ları, ses/parlaklık OSD'si, DND, bildirim geçmişi/toast ve oturum çekmecesi.
- SDDM Locklike karşılama ve üç sütunlu kart; kaynak görseller, şekilli avatar, dar saat, parola şekilleri, hata/yüklenme ve güç kontrolleri.
- Caelestia oturum kilidi: `locked`/`unlocking`; kapak kapanınca oturumu koruma. SDDM girişinde yeni oturum; logout/boot/off sırasında pencere durumunu temizleme.
- Ortak geometri üzerinden UV ve native DOM girdisi; IME/yapıştırma/mobil klavye için native parola/arama alanları; azaltılmış hareket ve boşta texture yükleme kontrolü.
- Yerel fontlar ve kaynak/lisans kayıtları. Google Sans Flex ve mono font alt kümeleri; saat için `wdth=30` statik font örneği.
- Eski yatay çubuk, panel/giriş çizimleri, ikon paketi, native kontroller ve bunlara özgü test beklentileri kaldırıldı. Fiziksel güç tuşu artık dış ikon varlığı olmadan çiziliyor.

## Mimari

`screen.js` ekran yaşam döngüsü, tek CanvasTexture ve girdi koordinasyonunu koruyor. `desktop-shell.js` yerel durumu; `desktop-layout.js` ortak yerleşimi; `desktop-theme.js` kaynak token'larını yönetiyor. Çizim `screen-painter.js`, `login-painter.js`, `boot-painter.js` arasında ayrıldı. Küçük Canvas çizim yardımcıları `desktop-paint.js` içinde paylaşılıyor. Three.js, statik dağıtım ve mevcut fiziksel model korunuyor; runtime bağımlılığı veya build adımı eklenmedi.

## Yapılan doğrulama

`npm.cmd run check` başarılı: yerel importlar ve Pages kök/alt dizin yolları; sistem ve boot; shell davranışı; fiziksel model/UV; ekran; kamera, klavye, kapak, ekran parlaklığı, güç ve masaüstü etkileşimleri. Son görsel animasyon düzenlemelerinden sonra ilgili ekran kontrolleri ayrıca başarılı.

Testler; kilit ve SDDM ayrımını, çalışma alanları/pencereleri, arama, ayarlar, zamanlı ağ değişimi, bildirimler, takvim, parola maskesi/hata/odak, eski asenkron doğrulama sonuçları, animasyon iptali ve dispose davranışlarını kapsıyor. Mevcut Plymouth görsel gecikmesi/hatası, 30 FPS kare seçimi ve güç düğmesi hold/cancel testleri korundu.

Çalışan kaynak/HTML/README içinde eski masaüstü ortamının adları ve `assets/icons` kullanımları tarandı; kalan kullanım bulunmadı. CSS font yolları ve sabit varlık bağlantıları dosya sisteminde doğrulandı. `git diff --check` başarılı.

## Açık kalan görsel kabul

Locklike referans PNG'si ve Shell tanıtım videosu `.preview/caelestia-reference/` altına indirildi. Locklike PNG'si ve iki kaynak duvar kâğıdı görsel olarak incelendi. Çalışan yeni arayüz için piksel/screenshot karşılaştırması henüz yapılmadı.

Hazırlanan `.preview/verify-caelestia.mjs`; izole headless Edge'de yalnızca yerel uygulamayı ve indirilen referans videosunu açar; native DOM odağı, normal klavye/tıklama girdileri ve screenshot komutları kullanır. `Runtime.evaluate` veya sayfa içine JavaScript enjeksiyonu kullanmaz. Masaüstü/telefon/azaltılmış hareket için laptop, masaüstü, Dashboard sekmeleri, Utilities, Launcher, tiled pencereler, kilit, SDDM karşılama/kart/hata kayıtlarını hazırlamak üzere yazıldı.

Otomatik onay incelemesi, tarayıcıda yerel uygulama JavaScript'i çalışacağı gerekçesiyle bu özel çalıştırmayı reddetti. Kullanıcıya bu işlem için açık izin soruldu; henüz izin gelmedi. Dolayısıyla tarayıcı event sırası, gerçek font/piksel görünümü, ekran okuyucu çıktısı ve FPS doğrulanmış değildir. Bu kayıtta görsel sadakat için tamamlandı iddiası yoktur.

## Kapsam

İşletim sistemi/SDDM/Hyprland kurulumu yapılmadı. Gerçek komut çalıştırma, dosya erişimi, cihaz ayarı değişimi, kayıt, VPN, Bluetooth eşleştirmesi veya biyometrik doğrulama eklenmedi. Simülasyonda karşılığı olmayan özellik düğmeleri gösterilmiyor. Commit veya yayın yapılmadı.
