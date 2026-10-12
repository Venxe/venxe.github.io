# Venxe — Mesai sonrası

GitHub Pages için tamamen statik, Three.js tabanlı bir 3D çalışma alanı. Saten metal bir laptop, seramik kahve fincanı ve hafif buhar; modeller, ekran grafikleri ve ortam ışığı tarayıcıda üretilir.

## Yerel çalıştırma

Node.js **22.15 veya üzeri** ile:

```sh
npm run dev
```

`http://127.0.0.1:4173` adresini açın. Paket kurulumu ve build adımı gerekmez. Sunucuyu `Ctrl+C` ile kapatın. Windows PowerShell npm betiklerini engelliyorsa `npm.cmd run dev` veya `node scripts/serve.mjs` kullanılabilir.

Node yalnızca yerel geliştirme ve kontroller içindir. Yayındaki site HTML/CSS/JavaScript dosyalarından oluşur. ES modülleri nedeniyle sayfayı `file://` üzerinden değil HTTP sunucusuyla açın.

## Kontroller

| İşlem | Mouse / dokunmatik | Klavye |
| --- | --- | --- |
| Sahne etrafında dön | Sürükle / tek parmak | Canvas odaktayken ok tuşları |
| Yaklaş / uzaklaş | Tekerlek / iki parmak | Canvas odaktayken `+` / `-` |
| Laptop ekranını odakla | Ekrana tıkla veya yaklaş | Canvas üzerinde `Enter` / boşluk veya `+` |
| Ekran temasını değiştir | Laptop ekranındaki “Tema” öğesine tıkla | Odakta sol okla seç, `Enter` / boşlukla çalıştır |
| Önceki görünüme dön | Uzaklaş veya laptop ekranındaki “Geri” öğesine tıkla | `Escape`, `-` veya sağ okla seçip `Enter` |

6 CSS pikselden fazla sürükleme, çoklu dokunma ve iptal edilen işaretçi hareketleri ekran tıklaması sayılmaz. Ekranın arkasından veya önünü kapatan nesneler üzerinden tıklama yapılamaz. Sayfada laptop kontrol butonları bulunmaz; odakta ekranın boş alanına tıklamak işlem yapmaz.

Yaklaşırken kamera–hedef mesafesi başlangıç kadrajının %70'ine indiğinde ekran otomatik odaklanır. Odakta dönüş kapanır, yakınlaştırma açık kalır; ekran odak mesafesinin %115'ine uzaklaşıldığında önceki serbest kamera görünümü geri yüklenir. Eşikler ekran oranına göre hesaplanır. Pencere oranı değişmişse dönüş açısı korunur, mesafe güncel kamera sınırlarına uyarlanır. Boyutlandırma kendi başına odağı açmaz veya kapatmaz.

## Teknik yapı

- `src/boot.js`: başlangıç ve kullanıcıya görünen hata durumu.
- `src/main.js`: olaylar, odak durumu, kamera geçişleri ve tek animasyon döngüsü.
- `src/scene.js`: renderer, ışık, kamera, raycast ve GPU kaynaklarının temizliği.
- `src/laptop.js`, `src/coffee.js`: prosedürel modeller; laptopta durum değiştikçe güncellenen `CanvasTexture` ve UV koordinatlarıyla ekran öğesi seçimi.
- `src/steam.js`: 40 parçacıklı tek `Points` nesnesi; yumuşak kenarlı, zamanla yükselip kaybolan buhar shader’ı.
- `src/config.js`: piksel oranı, kamera sınırları, geçiş süresi ve sahne yerleşimi için ortak ayarlar.
- `vendor/three/`: lisansıyla birlikte sabitlenmiş **Three.js 0.180.0 / r180** ve üç resmi eklentisi.

React, animasyon kütüphanesi, CDN, backend, harici font, model veya görsel servisi kullanılmaz. Three.js dosyaları resmi npm paketinden değiştirilmeden kopyalanmıştır. Sürüm güncellerken çekirdek dosyalarıyla tüm eklentileri aynı sürümden alın; `vendor/three/README.md` ve bu dosyadaki sürüm bilgisini güncelleyin, ardından kontrolleri çalıştırın.

### Görüntü ve performans

WebGL2, ES modülleri ve import map destekleyen güncel tarayıcı gerekir. Sahnede ACES ton eşleme, sRGB renk yönetimi, tek gölge üreten ana ışık ve başlangıçta üretilen bir ortam haritası kullanılır. Tekrarlanan tuşlar `InstancedMesh` ile çizilir.

Canvas tüm ekranı kaplar ve şeffaftır; arkaplan rengini CSS belirler. Zemin yalnızca `ShadowMaterial` ile temas gölgelerini çizer. Ayrı renkli zemin veya sis kullanılmaz. Sayfanın görünür arayüzü küçük logo ve tek satırlık ipucundan oluşur.

Piksel oranı 1,5 ile sınırlıdır. Sabit modellerin gölgesi başlangıçta hesaplanır. Buharda kare başına parçacık nesnesi oluşturulmaz. Sekme görünmezken animasyon döngüsü durur. İşletim sisteminde azaltılmış hareket tercih edildiğinde buhar gizlenir, kamera geçişleri anında uygulanır ve sönümleme kapanır. Sayfadan çıkarken geometri, materyal, doku ve olay dinleyicileri temizlenir.

İlk model sayımı: **13.308 üçgen / 19 mesh**. Bu sayı zemin, buhar, gölge geçişleri ve ortam haritası üretimini kapsamaz; GPU draw-call veya FPS ölçümü değildir. Hedefler: normal karede 80 çizim çağrısının ve 100 bin üçgenin altında kalmak, temsilî masaüstünde 60 FPS ve mobilde en az 30 FPS.

## Doğrulama

```sh
npm run check
```

Kontroller:

- Uygulama ve vendored bağımlılıkların JavaScript sözdizimi ve tüm geçişli import yolları.
- HTML varlıkları, benzersiz element kimlikleri, eski yönlendirmenin kaldırılması ve `.nojekyll`.
- Gerçek Three.js geometrilerinde sonlu koordinatlar ve model bütçesi.
- Gerçek `Raycaster` ile ekranın önden seçilmesi, arka kapağın ve öndeki nesnenin tıklamayı engellemesi.
- Çizilen ekran öğelerinin UV üzerinden seçilmesi, boş alanların ve gizli öğelerin etkisiz kalması.
- Gerçek uygulama modülleri ve `OrbitControls` ile tekerlek, pinch, ekran tıklamaları, klavye, önceki kamera görünümüne dönüş, sürükleme/iptal, yeniden boyutlandırma, geçişler ve grafik bağlantısı kaybı.

Kontrollerde DOM olayları, 2D canvas çizimleri ve GPU renderer/ortam haritası üretimi taklit edilir. Uygulama modülleri, modeller, kamera, raycast ve `OrbitControls` gerçektir; piksel görünümü, shader derlemesi ve tarayıcıdaki olay sıralaması doğrulanmış sayılmaz.

### Tarayıcı kabul kontrolü

Bu geliştirme oturumunda tarayıcı ve Windows görüntüleme aracı erişilemedi. Görsel QA, shader derlemesi, gerçek mouse/dokunmatik akışı ve FPS ölçümü **henüz doğrulanmadı**. Yayına almadan önce:

1. 1440×900, 390×844 ve yatay mobil görünümde kompozisyonu, ekran okunurluğunu, arkaplanın bütünlüğünü ve taşmaları inceleyin.
2. Sürükleme, tekerlek, iki parmakla yakınlaşma, otomatik odak, uzaklaşarak dönüş, ekrandaki Tema/Geri öğeleri ve klavyeyi deneyin. Sürükleme laptopu açmamalı; kapak arkasından ekran seçilmemeli.
3. Odak görünümü ve kamera geçişi sırasında pencereyi yeniden boyutlandırın; geri dönüş konumunu ve tekrar yaklaşınca odağın açılmasını kontrol edin.
4. Buharı en az bir dakika izleyin: sert kenar, sıçrama veya fincan dışından doğma olmamalı.
5. Klavye odağını ve azaltılmış hareket tercihini kontrol edin. Sekmeyi gizleyip geri döndüğünüzde animasyon sıçramamalı.
6. Tarayıcı konsolunda hata, Network panelinde eksik dosya veya site dışı istek bulunmadığını doğrulayın. WebGL2 kapalıyken açıklayıcı hata görünmeli.
7. DevTools Performance ile FPS’yi ölçüp cihaz/tarayıcı bilgisiyle kaydedin. Yukarıdaki hedefler bu oturumda ölçülmüş sonuçlar değildir.

## GitHub Pages

1. Dosyaları GitHub deposunun `main` dalına gönderin.
2. **Settings → Pages → Build and deployment → Deploy from a branch** seçin.
3. Dalı **main**, klasörü **/(root)** olarak kaydedin.
4. GitHub Pages dağıtımı tamamlandıktan sonra `https://venxe.github.io/` adresini kontrol edin.

Kök dizindeki `.nojekyll` ile dosyalar doğrudan sunulur. Build workflow’u veya sunucu ortam değişkeni gerekmez. Göreli yollar sayesinde proje alt dizininde barındırma da desteklenir.

Önceki `sayimburak.com` yönlendirmesi kaldırılmıştır. Bu uygulama hazırlanırken commit, push veya gerçek Pages yayını yapılmamıştır.
