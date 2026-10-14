# Hyprland + Caelestia Shell + SDDM Locklike geçiş planı

Tarih: 14 Ekim 2026. Durum: uygulama ve otomatik kontroller tamamlandı; gerçek tarayıcıda görsel kabul, özel çalıştırma onayı bekliyor. Ayrıntılar: [uygulama ve doğrulama kaydı](caelestia-implementation.md).

## 1. Hedef ve kapsam

Laptop ekranındaki mevcut GNOME tasarımı tamamen kaldırılacak. Yerine Hyprland çalışma alanlarını ve pencere davranışlarını simüle eden Caelestia Shell; oturum açılışına ise caelestia-sddm deposunun **Locklike** teması gelecek. Eski tasarım için tema seçici, geriye uyumluluk katmanı veya ikinci çizim yolu bırakılmayacak.

Bu depo tarayıcıda çalışan, GitHub Pages üzerinde yayımlanan statik bir Three.js portfolyosudur. Geçiş; işletim sistemi kurulumu değil, gerçek projelerin görünümünü ve etkileşimlerini mevcut ekran dokusunda yeniden üretme çalışmasıdır. QML, Quickshell, SDDM, PAM ve Hyprland süreçleri tarayıcıda çalıştırılmayacak.

Başlangıçta açık masaüstü davranışı korunacak. Soğuk açılış, yeniden başlatma ve çıkış yapma SDDM'ye; kapak kapatma veya kilitleme ise Caelestia oturum kilidine götürecek. Mevcut Limine/CachyOS/Plymouth zinciri yeni giriş ekranına bağlanacak.

## 2. İnceleme dayanağı ve doğrulama sınırları

Hareketli `main` dalları yerine aşağıdaki revizyonlar tasarım kaynağı olarak sabitlendi:

| Kaynak | İncelenen revizyon | Başlıca dosyalar |
| --- | --- | --- |
| [Caelestia Shell](https://github.com/caelestia-dots/shell/tree/a3a8fe59aba2c0048ab02dc817748678f96076ff) | `a3a8fe59aba2c0048ab02dc817748678f96076ff` | `shell.qml`, `modules/bar`, `modules/drawers`, `modules/dashboard`, `modules/launcher`, `modules/session`, `modules/lock`, `modules/utilities`, `modules/osd`, `modules/Shortcuts.qml`, `services/ShellState.qml`, `plugin/src/Caelestia/Config` |
| [Caelestia SDDM](https://github.com/ItsABigIgloo/caelestia-sddm/tree/dd69abbb7eb122546cbabe84e116ba03e67a4ccc) | `dd69abbb7eb122546cbabe84e116ba03e67a4ccc` | `themes/locklike/Main.qml`, `theme.conf`, Greeting, MainClock, Avatar, PasswordInput, SessionPicker, RandomQuote, CaelestiaFetch, SystemButtons, WelcomeText ve lisans |
| Yerel uygulama | `4cd2716` | `src/screen.js`, `src/screen-painter.js`, `src/system.js`, `src/main.js`, sahne/laptop bağlantıları, HTML, testler ve ikon kaynakları |

İki referansın dosya ağaçları ve 40'tan fazla kaynak/yapılandırma dosyası incelendi. Yerel bağımlılık grafiği kod üzerinden doğrulandı. `.preview` altındaki mevcut masaüstü/giriş ekranı görüntüleri incelendi; bunlar önceki çalışmalardan kalan görüntülerdir, bu turda alınmış tarayıcı kayıtları değildir.

Plan hazırlanırken referans README'lerindeki Locklike görseli ve Shell videosu ağ üzerinden alınamadı. Uygulama turunda ikisi de indirildi; Locklike görseli ve iki duvar kâğıdı incelendi. Kaynak geometrisi ve davranış kararları QML/C++ dosyalarına dayanır. Çalışan uygulama ve Shell videosunun tarayıcı kayıtları, otomatik onay incelemesinin istediği özel çalıştırma izni nedeniyle bekliyor; piksel eşleşmesi henüz doğrulanmış sayılmaz.

Mevcut `npm.cmd run check` komutu başarılı oldu. PowerShell, `npm.ps1` çalışmasını engellediği için aynı kontrol `npm.cmd` ile yürütüldü. Testlerin kendi çıktısında da belirtildiği gibi bu sonuç GPU piksellerini, gerçek tarayıcı girişini, ekran okuyucuyu veya FPS'yi doğrulamıyor.

## 3. Mevcut mimari ve değişiklik yüzeyi

Çağrı zinciri: `boot.js → main.js → scene.js → laptop.js → screen.js → screen-painter.js`.

`system.js`, sahnenin sahip olduğu güç ve oturum durumunu yönetir; aynı nesne ekran tarafından kullanılır. `screen.js` tek bir `CanvasTexture`, masaüstü ayarları, yerleşim, UV hit-test, native DOM kontrolleri ve giriş animasyonu arasında koordinasyon sağlar. `screen-painter.js` çizimi yapar. `main.js`, ekran girdisini kamera/zoom ve fiziksel güç düğmesinden önce uygun yere yönlendirir.

| Mevcut parça | Bulgu | Geçiş kararı |
| --- | --- | --- |
| `src/screen.js` | 36 px üst çubuk; `calendar/system/power` panelleri; `loginRevealed` ve 480 ms saat kaydırma akışı | Yerleşim ve eski giriş davranışı değiştirilecek; dış ekran arayüzü korunacak |
| `src/screen-painter.js` | Mavi şerit duvar kâğıdı, üst bar, eski avatar/giriş formu; boot çizimi de aynı dosyada | Eski masaüstü ve giriş çizimi silinecek; boot çizimi ayrılarak korunacak |
| `src/system.js` | `login` hem yeni oturum açmayı hem kapak kilidini temsil ediyor | SDDM girişi ile mevcut oturuma dönüş ayrılacak |
| `index.html` | Ekran için gizli native butonlar, parola alanı, takvim ve hızlı ayar panelleri | Yeni kabuğun erişilebilir kontrol ağacıyla değiştirilecek |
| `assets/icons` | GNOME Adwaita ikonları ve kaynak/lisans metinleri | Kullanımları değiştirildikten sonra eski ikon paketi tamamen kaldırılacak |
| `src/config.js` | Tek kaynakta `1200 × 675`, 16:9 ekran ve laptop ölçüleri | Ekran boyutu ve fiziksel geometri korunacak |
| `src/main.js` | Escape, panel kapatma, klavye, UV girişi ve kamera arasında öncelik kuralları | Yeni metin girdileri ve kilit durumlarına uyarlanacak |
| `styles.css` | Büyük ölçüde sayfa/sahne ve erişilebilirlik stilleri | Gerekli font tanımları eklenecek; Canvas tasarımı CSS'ye taşınmayacak |
| `scripts/*` | Yerleşim sabitleri ve eski kontrol adlarına bağlı testler bulunuyor | Eski beklentiler yenilenecek; güç, boot, fiziksel model ve girdi regresyonları korunacak |

## 4. Referanslardan çıkarılan tasarım sözleşmesi

### 4.1 Caelestia Shell

[Bar.qml](https://github.com/caelestia-dots/shell/blob/a3a8fe59aba2c0048ab02dc817748678f96076ff/modules/bar/Bar.qml) yatay üst çubuk değil, dikey `ColumnLayout` kullanıyor. [Panels.qml](https://github.com/caelestia-dots/shell/blob/a3a8fe59aba2c0048ab02dc817748678f96076ff/modules/drawers/Panels.qml) çekmeceleri ekran kenarlarına bağlıyor. Hedef düzen:

- Solda sürekli dikey bar: logo, çalışma alanları, boşluk, etkin pencere, boşluk, doluysa tray, saat, durum ikonları ve güç.
- Varsayılan beş çalışma alanı; şekil tabanlı göstergeler ve etkin alan vurgusu.
- Üst ortadan açılan Dashboard; alt ortadan açılan Launcher.
- Sağda bildirim kenar paneli ve oturum/güç çekmecesi; sağ altta Utilities; sağ ortada ses/parlaklık OSD'si.
- Bar öğesinin hizasında açılan ağ, pil ve diğer desteklenen durum popout'ları.
- Duvar kâğıdını çevreleyen yuvarlatılmış kabuk çerçevesi; panel açılırken çerçeveyle birleşen yüzeyler.

[Kaynak token'ları](https://github.com/caelestia-dots/shell/blob/a3a8fe59aba2c0048ab02dc817748678f96076ff/plugin/src/Caelestia/Config/tokens.hpp) ve [border ayarları](https://github.com/caelestia-dots/shell/blob/a3a8fe59aba2c0048ab02dc817748678f96076ff/plugin/src/Caelestia/Config/borderconfig.hpp) başlangıç ölçülerini belirliyor: bar iç genişliği 40, çerçeve 10, çerçeve yuvarlatması 25. BarWrapper hesabıyla varsayılan toplam bar genişliği 60 mantıksal piksel olur. Boşluk/kenar payları 4, 8, 12, 16 ve daha büyük token değerlerinden seçilecek; rastgele ölçüler çoğaltılmayacak.

[Tipografi](https://github.com/caelestia-dots/shell/blob/a3a8fe59aba2c0048ab02dc817748678f96076ff/plugin/src/Caelestia/Config/appearanceconfig.hpp): ana metin Google Sans Flex; saat/çalışma alanlarında Rubik; sistem bilgilerinde CaskaydiaCove NF; ikonlarda Material Symbols Rounded. Varsayılan opak kabuk yüzeyleri korunacak; her panelin cam gibi şeffaflaştırılması referans varsayılanıyla örtüşmez.

Dashboard, yalnızca eski takvimin yeni rengi olmayacak. Kullanıcı, tarih/saat, takvim, kaynak kullanımı, hava ve medya kartları ile Dashboard/Media/Performance/Weather sekmelerinin düzeni yeniden üretilecek. Linux servislerinden gelen değerler tarayıcı içinde açıkça tanımlı yerel simülasyon verilerinden beslenecek.

### 4.2 SDDM Locklike

[Locklike Main.qml](https://github.com/ItsABigIgloo/caelestia-sddm/blob/dd69abbb7eb122546cbabe84e116ba03e67a4ccc/themes/locklike/Main.qml) başlangıçta `1920 × 1080` tasarım alanı ve merkezde `1350 × 750` ana kart kullanıyor. Mevcut `1200 × 675` ekranda aynı oran `0.625` ölçekle korunacak: kart `843.75 × 468.75`, başlangıç konumu yaklaşık `(178.125, 103.125)`.

- İlk yüzey: duvar kâğıdı üzerinde büyük, günün saatine göre değişen karşılama ve vurgulu `venxe` yazısı. Eski tam ekran saat görünümü kaldırılacak.
- İlk uygun tuş/tıklama/dokunma karşılama yüzeyini kapatıp kartı açacak; bu tuş parolaya eklenmeyecek. Tab native odağı koruyacak.
- Kart açılırken arka plan kararacak ve bulanıklaşacak; kart 0.5 ölçek/0 opaklıktan açılacak. Kart hareketi yaklaşık 300 ms; blur 400 ms; karşılama geçişleri kaynaktaki 400–600 ms aralığını izleyecek.
- Sol sütun: selamlama kartı, `caelestiafetch.sh` görünümünde WM/USER/OS/HOST ve renk örnekleri, kapat/yeniden başlat düğmeleri.
- Orta sütun: dar genişlik eksenine sahip büyük saat, büyük harfli tarih, şekilli avatar ve kapsül parola alanı. Saat/dakika farklı tonlarda; kaynakta 24 saat düzeninde ikisi de 224 px taban boyutunda.
- Sağ sütun: alıntı kartı ve dino görselli bildirim yer tutucusu. SDDM yüzeyinde özel oturum bildirimleri gösterilmeyecek.
- Parola göstergesi: şekilden daireye dönüşen maskeli karakterler; boşken kilit düğmesi, girişte ok, doğrulamada yüklenme ve hatada kısa sallanma.

[theme.conf](https://github.com/ItsABigIgloo/caelestia-sddm/blob/dd69abbb7eb122546cbabe84e116ba03e67a4ccc/themes/locklike/theme.conf) başlangıç paleti: zemin `#0d0e12`, alt yüzey `#17191f`, metin `#e3e5f0`, primary `#68779b`, secondary `#bfc6dc`, hata `#fa746f`. Varsayılan `AvatarShape=hexagon`, `ap=false`, `sessionPicker=false`. Kaynak avatar basit bir geometrik altıgen değil; Material şekilleri arasında dönüşüyor. Bu siluet korunacak. Tek kullanıcı/tek Hyprland oturumu için gereksiz kullanıcı ve oturum seçicileri eklenmeyecek.

Kaynak projedeki görünmez Caps Lock uyarısı ve özel klavye tamponu olduğu gibi kopyalanmayacak. Native `input[type=password]` gerçek girdiyi yönetecek; Canvas yalnızca maskeli görseli çizecek. Böylece yapıştırma, IME, mobil klavye ve yardımcı teknoloji davranışları korunacak.

### 4.3 SDDM ile Caelestia kilidi arasındaki ayrım

[Caelestia Lock](https://github.com/caelestia-dots/shell/blob/a3a8fe59aba2c0048ab02dc817748678f96076ff/modules/lock/Content.qml) de üç sütunlu bir düzen kullanıyor; ancak sol tarafta hava/sistem/kaynak bilgileri, ortada saat/avatar/parola, sağda medya ve bildirimler var. Oturum kilidi bu kaynaktan; yeni oturum girişi Locklike kaynağından üretilecek. Ortak renk, tipografi ve küçük çizim yardımcıları paylaşılabilir; iki farklı ürün yüzeyi tek bir sahte SDDM ekranına indirgenmeyecek.

## 5. Özellik kapsamı

| Alan | Uygulanacak davranış | Tamamlanma ölçütü |
| --- | --- | --- |
| Kabuk ve bar | Sol bar, çerçeve, kaynak sırası, çalışma alanı göstergeleri ve durum popout'ları | Eski üst bar görünmez ve kodda bulunmaz |
| Hyprland | Beş alan, etkin pencere, odak, kapatma, basit bölmeli yerleşim ve tam ekran | Alan değiştirmek o alandaki pencereleri/odağı geri getirir |
| Launcher | Arama, uygulama/eylem listesi, klavye seçimi, duvar kâğıdı seçimi | Seçim gerçek bir yerel simülasyon eylemi üretir |
| Yerel demo pencereleri | Sistem bilgisini gösteren terminal ve paketli duvar kâğıtlarını gösteren dosya görünümü | Launcher ve tiling yalnızca dekorasyon olarak kalmaz; komut çalıştırılmaz |
| Dashboard | Dört sekme, tarih/takvim, kullanıcı, medya, kaynak ve hava kartları | Sekme/kart yerleşimi çalışır; örnek değerler deterministiktir |
| Utilities / OSD | Mevcut Wi-Fi, ses, güç modu; ekran parlaklığı, DND ve kilitleme | Değerler bar, panel ve OSD'de tutarlıdır |
| Bildirimler | Simüle ağ/oturum olayları, toast, geçmiş, kapatma, DND | Silme/temizleme görünümü ve sayacı birlikte günceller |
| Oturum çekmecesi | Kilit, çıkış, yeniden başlatma, kapatma | Her eylem doğru sistem geçişini başlatır |
| SDDM | Locklike karşılama, kart, parola, hata/yüklenme ve güç eylemleri | Boot/çıkış sonrası buraya gelinir |
| Oturum kilidi | Caelestia kilit düzeni, parolayla mevcut oturuma dönüş | Çalışma alanları ve pencereler korunur |

Tam bir Linux servis emülasyonu kurulmayacak. Gerçek Bluetooth eşleştirme, VPN, kayıt alma, parmak izi/yüz tanıma, paket yönetimi, Nexus'un tüm işletim sistemi ayarları ve gerçek askıya alma/hibernation bu kapsamda değil. Karşılığı olmayan etkileşimli düğmeler, boş tray öğeleri veya çalışıyormuş gibi görünen kontroller gösterilmeyecek. Tema bu özellikler kapalıymış gibi davranacak. Medya/hava/kaynak kartları örnek içerik kullanacak; gerçek kullanıcı cihazından telemetri alınmayacak.

## 6. Hedef modül düzeni

Mevcut ES module, CanvasTexture ve native DOM yaklaşımı korunacak. Yeni framework, paket yöneticisi bağımlılığı veya zorunlu build adımı eklenmeyecek.

| Dosya | Sorumluluk |
| --- | --- |
| `src/system.js` | Güç, boot, giriş, kilit ve asenkron parola doğrulaması |
| `src/screen.js` | Ekran yaşam döngüsü, tek texture, girdi yönlendirme, native kontroller ve yeniden çizim kararı |
| `src/desktop-theme.js` — yeni | Paylaşılan renkler, font adları, boyutlar, süreler ve varlık yolları |
| `src/desktop-shell.js` — yeni | Caelestia çekmece durumu, ayarlar, bildirimler, launcher ve simüle çalışma alanı/pencere davranışları |
| `src/desktop-layout.js` — yeni | Kabuk ve giriş yüzeylerinin yerleşimi; çizim ve hit-test'in kullandığı aynı öğe/alan listeleri |
| `src/screen-painter.js` | Frame verisini çizme; kabuk, pencereler ve paneller; sistem durumunu değiştirmez |
| `src/login-painter.js` — yeni | Locklike ve Caelestia kilit yüzeylerinin ayrı çizim düzenleri |
| `src/boot-painter.js` — yeni | Mevcut boot çiziminin davranışı korunarak taşınması |
| `index.html` | Native erişilebilir kontrol ağacı ve güncel kullanım açıklamaları |
| `assets/desktop/` — yeni | Yerel fontlar, Material ikonları, duvar kâğıtları, avatar, şekil/görsel varlıkları ve kaynak/lisans bilgileri |

`createScreen()` dış arayüzü aynı kalacak: `texture`, `update`, `hitTest`, `handleInput`, `handleKey`, `closePanel`, `bindControls`, `dispose`. Çağıran laptop/sahne modüllerine kabuk iç ayrıntıları sızdırılmayacak. `closePanel()` en öndeki kapatılabilir yüzeyi kapatıp boolean döndürme sözleşmesini koruyacak.

Yerleşim modülü hem görsel sınırları hem etkileşim sınırlarını tek yerde hesaplayacak. Çizim dosyalarında ikinci bir hit-test geometrisi, DOM tarafında ayrı kontrol durumu tutulmayacak. Genel amaçlı widget motoru, eklenti sistemi veya alternatif shell adapter'ları tasarlanmayacak.

## 7. Uygulama sırası

### Adım 1 — Görsel dayanakları ve varlık envanterini sabitle

1. Sabit revizyonlardaki Shell tanıtımı ve Locklike önizlemesine eriş; kaynakla birlikte karşılaştırılabilir kareler al. Referanslar indirilemiyorsa erişim eksikliğini açık bırak, tahmini ayrıntılara doğrulanmış etiketi verme.
2. Masaüstü, Dashboard, Launcher, Utilities, bildirimler, oturum çekmecesi, kilit, SDDM karşılama ve kart durumları için referans listesi oluştur.
3. Paketlenecek varlıkların kaynak yolu, revizyonu ve lisansını kaydet. Her iki depo GPL-3.0 metni taşıyor; doğrudan alınan kod/görsel ile fontların kendi lisans yükümlülüklerini varlık bazında koru.
4. Aynı duvar kâğıdını ve uyumlu sabit paleti masaüstü/girişte kullan; eski mavi şeritleri kaldır. Kaynakta bulunan görseli kullanmak varken yeni, ilgisiz tasarım üretme.

**Çıktı:** Görsel kontrol listesi ve lisanslı yerel varlık envanteri. Bu aşama tamamlanmadan yüksek görsel sadakat iddiası yok.

### Adım 2 — Tasarım token'larını ve varlık yüklemeyi ekle

1. `desktop-theme.js` içine kaynak ölçülerinin yalnızca kullanılan alt kümesini aktar. Shell ölçüleri 1200 × 675 mantıksal alanda; Locklike ölçüleri kaynak tasarım alanından tek dönüşümle hesaplanacak.
2. Google Sans Flex, Rubik, kullanılan mono font ve Material ikonlarını yerel paketle. Google Sans Flex'in dar `wdth` eksenini özellikle saat için doğrula; destek farkında aynı fontun hazırlanmış uygun örneğini kullan.
3. Fontlar hazır olduğunda Canvas'ı yeniden çiz. Font/görsel yükleme hatasında okunur geri dönüş sağla; başarılı yükleme sonrasında görünümü geri getir.
4. Duvar kâğıdı ve sabit blur katmanlarını önbellekle. Büyük video varlığını varsayılan bağımlılık yapma; kaynak varsayılanı video desteklese de mevcut paketli görsel ve statik dağıtım için resim yolunu kullan.

**Kabul:** Dış ağ isteği olmadan font ve ikonlar yüklenir; sabit ekran her karede yeniden yüklenmez/çizilmez.

### Adım 3 — Oturum ve kilit durumlarını ayır

1. Önce `check-system.mjs` içinde mevcut oturumun korunması, yeni giriş ve gecikmiş doğrulama sonuçları için davranış testlerini yaz.
2. `locked` ve `unlocking` durumlarını ekle. `login` ve `signing-in` yeni oturum için kullanılmaya devam etsin. `send('login', password)` hem giriş hem kilit doğrulamasında mevcut dış çağrı biçimini korusun.
3. `desktop → locked → unlocking → desktop`; `desktop → signing-out → login → signing-in → desktop` geçişlerini tanımla. Kapak hareketi masaüstündeyken kilitlesin; greeter/boot/off durumunda hayali bir oturum oluşturmasın.
4. Kilit açmada çalışma alanı/pencere durumunu koru; çıkış ve yeni boot'ta temizle. Ses/ağ/güç tercihlerinin sayfa içi yeniden başlatmalarda korunması mevcut sözleşmeyle sürsün.
5. SHA-256 doğrulaması, 128 karakter sınırı, eski asenkron sonuçların iptali, parola temizliği, güç tuşu hold/cancel ve dispose davranışlarını koru. Yeni kilit durumundan shutdown/restart desteğini açıkça ekle.

**Kabul:** Boot SDDM'ye; kapak açılması Caelestia kilidine döner. Başarısız veya eski doğrulama sonucu yanlış bir oturumu açamaz.

### Adım 4 — Eski yerleşimi değiştir; Caelestia bar ve çerçeveyi kur

1. `desktop-layout.js` ve `desktop-shell.js` için basit veri akışını kur; çizim, UV ve DOM aynı öğe kimliklerini kullansın.
2. Eski `barHeight=36`, merkez saat tetikleyicisi ve toplu sağ durum düğmesini kaldır. Sol barı kaynak sırası ve token'larla oluştur.
3. Çerçeve köşelerini, çalışma alanı şekillerini, saat/durum ikonlarını ve bar popout'larını ekle. Boş etkin pencere/tray durumunu referansa uygun ele al.
4. Hover popout'larına tıklama/dokunma ve native klavye karşılığı ekle. Kullanıcı hover alanından içeri geçerken popout kapanmasın.

**Kabul:** Hiçbir sistem durumunda eski üst bar çizilmez; barın ve popout'ların çizimi ile tıklanabilir alanları örtüşür.

### Adım 5 — Hyprland çalışma alanları, pencereler ve Launcher

1. Beş çalışma alanının etkin alan, pencere listesi ve odağını `desktop-shell.js` içinde yönet. Boş masaüstü açılışını koru.
2. Paketli içerik kullanan iki küçük demo görünümünü aç/kapat/odakla; iki pencere için belirli bir bölmeli yerleşim, tam ekran ve alana taşıma ekle. Genel pencere yöneticisi veya terminal yorumlayıcısı yazma.
3. Launcher'ı alt ortadan aç; listeyi arama alanının üstünde tut. Yukarı/aşağı, Enter, Escape ve native metin girdisini destekle.
4. Logo, kenar etkileşimi ve erişilebilir düğmelerle Launcher'a ulaşılabilsin. İşletim sistemi/tarayıcı tarafından yakalanan Super kısayollarına bağımlı olma.
5. Duvar kâğıdı eylemi yalnızca paketli seçeneklerden seçim yapsın; seçim masaüstü, giriş ve kilit arka planına yansısın.

**Kabul:** Launcher seçimleri görünür sonuç üretir; çalışma alanları ve odak göstergeleri gerçek simülasyon durumunu yansıtır.

### Adım 6 — Dashboard, Utilities, OSD ve bildirim çekmeceleri

1. Takvimdeki tarih hesabını ve native klavye gezinmesini yeni Dashboard'a taşı; eski bağımsız takvim panelini kaldır.
2. Dört Dashboard sekmesinin kart düzenini 1200 × 675'e sığdır. Örnek medya/hava/kaynak verilerini tek kaynaktan ver; zamanlamayı testlerde denetlenebilir tut.
3. Eski hızlı ayar penceresini kaldır. Wi-Fi, ses ve güç davranışlarını yeni Utilities/popout/OSD yerleşimlerine bağla; parlaklığı mevcut sistem ve kapak parlaklığıyla çarpılan ayrı bir kullanıcı ayarı olarak uygula.
4. Ağ bağlantısı gibi mevcut olaylardan bildirim üret; toast, geçmiş, DND ve temizleme davranışlarını ekle. Simülasyon dışı bildirim erişimi isteme.
5. Oturum çekmecesini sağ kenarda kaynak görsel hiyerarşisiyle kur; mevcut dört destekli güç/oturum eylemini bağla. Hibernation gibi modellenmeyen düğmeleri çıkar.
6. Çekmecelerin açılma/kapanmasını kaynakta olduğu gibi kenara bağlı yüzeylerle çiz. Statik yuvarlak kutulara indirgemeden, gerekli birleşim ve şekil geçişlerini Canvas path'leriyle üret.

**Kabul:** Aynı ayarın farklı yüzeylerde farklı değer göstermesi mümkün değildir; paneller ekran dışına taşmaz ve kaydırma kamerayı hareket ettirmez.

### Adım 7 — SDDM Locklike ve Caelestia kilit ekranını uygula

1. `login-painter.js` içine Locklike karşılama ve üç sütunlu kartı kaynak geometrisiyle aktar. `OS=CachyOS`, `WM=Hyprland`, `USER=venxe`; HOST için tek bir simülasyon değeri kullan.
2. Karşılama, blur, kart ölçeği, avatar şekli, parola kapsülü ve loading/error animasyonlarını tamamla. Sağ sütunda kaynak dino ve alıntı düzenini koru; alıntı geçişlerinde dış API çağırma.
3. Native parola alanını görsel maskeyle senkronize et. Maskelenen şekillerin testleri deterministik olsun; rastgele şekil seçimi doğrulamayı etkilemesin. Panoya kopyalama veya düz metin gösterme ekleme.
4. Escape önce alt yüzeyi/menüyü kapatsın, ardından Locklike kartını karşılamaya döndürüp parolayı temizlesin; sonraki Escape mevcut kamera geri adımını kullansın. Kilit ekranında Escape oturumu açmasın.
5. Caelestia kilidinde kaynak üç sütun düzenini ve mevcut oturum verilerini kullan; kilit açıldıktan sonra pencere/çalışma alanı kaldığı yerden devam etsin.
6. `prefers-reduced-motion` durumunda son geometriyi doğrudan göster; sallanma, morph ve sürekli animasyonları durdur. Giriş doğrulamasının işlevini animasyonun bitmesine bağlama.

**Kabul:** Eski saat-yukarı-kaydırma ve Adwaita avatarı yoktur; SDDM karşılama/kartı ve Caelestia kilidi ayrı akışlar olarak çalışır.

### Adım 8 — DOM erişilebilirliği ve sahne girdisini tamamla

1. `index.html` içindeki eski panel ağacını yeni Launcher, Dashboard, Utilities, bildirim, oturum ve giriş kontrolleriyle değiştir. Etiketler, expanded/pressed/selected durumları ve odak çizimi ortak modelden beslensin.
2. `main.js` metin girdisi korumasını yalnızca parola için değil Launcher araması gibi alanlar için de uygula. Yazılan `+`, `-`, Space ve oklar kamera komutu veya sahne kısayolu olmasın; IME composition kesilmesin.
3. Girdi önceliği: aktif native metin girdisi/panel → kabuk → kamera. Escape için yukarıdaki yüzey kapatma sırası korunsun. Fiziksel güç hold önceliği değişmesin.
4. Kapak kapalı/hareketli, sayfa gizli, geçiş sürüyor veya WebGL context kayıpsa ekran kontrolleri etkin kalmasın. Yeniden açılışta gizli kontrole odak dönmesin.
5. Küçük referans düğmelerinin hit alanını mümkün olduğunda en az 44 × 44 mantıksal piksele çıkar; komşu kontrollerin alanlarını çakıştırma. Telefon görünümünde ayrıca gerçek dokunma/klavye kontrolü yap; mantıksal boyutun fiziksel dokunma boyutunu garanti etmediğini hesaba kat.

**Kabul:** Fare, klavye, dokunma ve yardımcı kontroller aynı eylemi üretir; parolada/aramada yazmak kamerayı veya simüle pencereleri hareket ettirmez.

### Adım 9 — Eski kodu ve kullanılmayan varlıkları kaldır

1. Eski wallpaper çizimi, yatay üst bar çizimi, bağımsız GNOME takvim/hızlı ayar/güç menüsü yerleşimleri, eski giriş koordinatları ve reveal animasyonunu sil.
2. Yeni yüzeylerde yeniden kullanılan takvim hesabı, ayarlar, boot ve parola doğrulamasını sakla; eski görünümün ikinci bir implementasyonunu saklama.
3. Yeni Material ikonları devreye girdikten sonra `assets/icons/*.svg`, eski `ICON_NAMES`, Adwaita README/lisans paketini kaldır. Başka bir kullanım varsa önce o kullanımı değiştir; kullanılan varlığın lisansını silme.
4. Eski DOM kimlikleri, kontrol dinleyicileri, test fixture'ları, koordinat beklentileri, ölü yardımcılar ve yalnızca onlara ait CSS'yi temizle. Mevcut CSS'nin çoğunun sahneye ait olduğunu dikkate al.
5. README, erişilebilir yardım metinleri ve test açıklamalarını yeni davranışla güncelle. Uygulama kaynakları, HTML, varlık metaverisi ve kullanım dokümanlarında GNOME/Adwaita/GDM izlerini tara; ayrıca adı geçmeyen eski tasarım yollarını import/kullanım üzerinden denetle.
6. Yeni varlık dizinini kalan tüm kullanımlarla karşılaştır; kullanılmayan font, ikon, görsel ve desteklenmeyen özellik düğmelerini kaldır. Tarihî plan/kaynak incelemesi metni çalışan tasarımın parçası sayılmayacak.

**Kabul:** Kullanıcıya sunulan tek masaüstü ve giriş yolu yeni tasarımdır; eski tasarıma ait kod, erişilebilir kontrol ve varlık paketi yoktur.

### Adım 10 — Son doğrulama ve teslim

1. Her davranış değişikliğinde ilgili dar kontrolü çalıştır; sonunda `npm.cmd run check` ile tüm zinciri doğrula. Yeni modülleri mevcut yerel import/Pages kök-alt dizin kontrollerine dahil et.
2. Yeni shell davranışlarını mevcut Node test altyapısında doğrula; gerekiyorsa `check-shell.mjs` ekle. Testler çizim implementasyonunun satırlarını değil, dışarıdan gözlenen eylem ve durumları denetlesin.
3. Önceki ekran testlerinin güç/boot/UV/erişilebilirlik kapsamını koruyarak yeni kontrol ve yerleşim beklentilerini yaz. Kaynak token'larının her birini testle aynalamak yerine kritik çakışma, taşma ve girdi davranışlarını ölç.
4. Gerçek tarayıcıda 1440 × 900 ve 390 × 844; laptop ve ekran odakları; normal ve azaltılmış hareket kombinasyonlarında görsel kayıt al. Ekranın tamamı ve sol bar her oranda görünür kalsın.
5. Karşılama, SDDM kartı, hata/loading, kilit, boş masaüstü, iki tiled pencere, Dashboard sekmeleri, Launcher, Utilities, bildirimler, OSD ve session drawer durumlarını referans kareleriyle karşılaştır.
6. Konsol/ağ hatalarını, font yüklenmesini, gerçek native parola/arama davranışını, odak sırasını ve dokunma etkileşimlerini kontrol et. Desteklenmeyen doğrulama alanlarını açıkça raporla.

**Teslim:** Odaklı değişiklikler, yeni görsel kayıtlar, güncel README, varlık kaynak/lisansları ve çalıştırılan kontrol sonuçları. Bu planın hazırlanması yayımlama veya işletim sistemi kurulum adımı içermez.

## 8. Regresyon ve kabul matrisi

| Senaryo | Beklenen sonuç | Doğrulama |
| --- | --- | --- |
| İlk sayfa açılışı | Açık Caelestia masaüstü; tek texture | Shell/screen kontrolü + tarayıcı |
| Kapat → fiziksel güç | Mevcut boot aşamaları → SDDM karşılama | System/boot/hardware + tarayıcı |
| Restart | Ayarlar korunur; pencereler sıfırlanır; boot → SDDM | System/shell/interactions |
| Çıkış yap | Oturum temizlenir; boot göstermeden SDDM | System/shell/screen |
| Kapağı kapat/aç | Mevcut oturum korunarak Caelestia kilidi | System/hardware/interactions |
| Kilit aç | Aynı çalışma alanı, pencereler ve odak geri gelir | System/shell + tarayıcı |
| Hatalı parola / crypto hatası | Giriş yok; okunur hata; güvenli yeniden deneme | System/screen |
| Doğrulamada shutdown/kapak/dispose | Eski asenkron sonuç durum değiştirmez | System/screen |
| Arama/parolada yazma ve yapıştırma | Native girdi çalışır; kamera komutu oluşmaz | Interactions + gerçek tarayıcı |
| Panel üstünde wheel/drag/pinch | Panel ve sahne öncelikleri korunur | Interactions + telefon |
| Beş alan / pencere odağı | Her alanın pencere ve seçim durumu tutarlı | Shell/screen |
| Wi-Fi/ses/parlaklık/DND | Bar, panel, OSD ve bildirimler aynı veriyi kullanır | Shell/screen |
| Font/görsel geç veya başarısız | İşlev sürer; yükleme sonrası görünüm yenilenir | Screen + tarayıcı |
| Boşta / gizli sekme | Gereksiz texture upload yok; dönüşte zaman güncel | Screen/view |
| Normal / azaltılmış hareket | İşlev aynı; azaltılmış harekette morph/sallanma yok | System/screen + tarayıcı |
| WebGL kaybı ve dispose | Kontroller kapanır; listener/texture kaynakları temizlenir | Interactions/model |
| Statik dağıtım | Import ve varlıklar hem `/` hem alt dizinde çözülür | `check.mjs` |

Tamamlanma; yalnızca eski adların silinmesi veya testlerin geçmesi değildir. Kaynak geometri/tipografi/hareketleriyle görsel eşleşme, gerçek tarayıcı girdisi ve eski tasarımın tamamen kaldırılması birlikte sağlanmalıdır.
