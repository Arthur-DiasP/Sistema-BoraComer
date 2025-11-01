// js/ads.js
// Módulo compartilhado para carregar, normalizar e renderizar anúncios/banners
import { firestore } from './firebase-config.js';
import { collection, onSnapshot, getDocs, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let _bannerInterval = null;
// Enable detailed debug logging by setting localStorage.setItem('adsDebug', '1') in the browser console
const ADS_DEBUG = !!localStorage.getItem('adsDebug');

function _normalizeBannerDoc(doc) {
    const data = doc.data ? doc.data() : doc;
    const id = doc.id || data.id;
    // Detecta campo de mídia comum entre módulos
    const mediaUrl = data.mediaUrl || data.imagemUrl || data.imageUrl || data.videoUrl || '';
    let mediaType = data.mediaType || (data.videoUrl ? 'video' : 'image');
    // Fallback simples: se url contém youtube/ mp4 -> video
    if (!mediaType && typeof mediaUrl === 'string') {
        if (/youtube|youtu\.be|\.mp4|\.webm/i.test(mediaUrl)) mediaType = 'video';
        else mediaType = 'image';
    }
    return {
        id,
        nome: data.nome || data.title || '',
        descricao: data.descricao || data.description || '',
        mediaUrl,
        mediaType,
        linkUrl: data.linkUrl || data.url || '',
        type: data.type || (data.userId ? 'user' : 'system'),
        status: (data.status || (data._source === 'banners' ? 'aprovado' : 'pendente')),
        // duração: prefer explicit startAt/endAt; se não houver, usa createdAt + durationDays
        startAt: data.startAt || data.createdAt || null,
        endAt: data.endAt || null,
        durationDays: data.durationDays || data.duration || null,
        raw: data
    };
}

/**
 * Cria listeners em tempo real para banners do sistema e anúncios de usuários aprovados.
 * onUpdate(adsArray) será chamado sempre que houver mudança.
 */
export function listenCombinedAds(onUpdate) {
    if (typeof onUpdate !== 'function') return;

    // Listener para banners do sistema
    onSnapshot(collection(firestore, 'banners'), (bannersSnapshot) => {
        const systemBanners = bannersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'banners' }));

        // Listener para anúncios de usuários (aprovados ou em outros status — filtragem posterior)
        onSnapshot(collection(firestore, 'anunciosUsuarios'), (userAdsSnapshot) => {
            const userAds = userAdsSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data(), _source: 'anunciosUsuarios' }));

            const merged = [...systemBanners, ...userAds].map(d => _normalizeBannerDoc(d));
            if (ADS_DEBUG) console.debug('ads.js: merged ads (raw):', merged);

            // Filtra apenas anúncios válidos no tempo e com status apropriado
            const now = Date.now();
            const active = merged.filter(ad => {
                let include = true;
                const reasons = [];

                // Para anúncios de usuário, permitir se estiver 'aprovado' OU se já tiver pagamento confirmado (asaasPaymentId)
                if (ad.type === 'user') {
                    const s = (ad.status || '').toLowerCase();
                    const paid = ad.raw && (ad.raw.asaasPaymentId || ad.raw.paymentId);
                    const approvedStatuses = ['aprovado', 'ativo'];
                    if (!approvedStatuses.includes(s) && !paid) { include = false; reasons.push('not approved/active and not paid'); }
                    else reasons.push('approved/active or paid');
                } else {
                    reasons.push('system banner');
                }

                // calcula intervalo temporal
                let startMs = null;
                let endMs = null;
                if (ad.startAt && typeof ad.startAt.toMillis === 'function') startMs = ad.startAt.toMillis();
                else if (ad.startAt && ad.startAt.seconds) startMs = ad.startAt.seconds * 1000;
                else if (ad.raw && ad.raw.createdAt && ad.raw.createdAt.seconds) startMs = ad.raw.createdAt.seconds * 1000;

                if (ad.endAt && typeof ad.endAt.toMillis === 'function') endMs = ad.endAt.toMillis();
                else if (ad.endAt && ad.endAt.seconds) endMs = ad.endAt.seconds * 1000;
                else if (ad.durationDays) {
                    const base = startMs || Date.now();
                    endMs = base + (ad.durationDays * 24 * 60 * 60 * 1000);
                }

                if (startMs) reasons.push(`startAt=${new Date(startMs).toISOString()}`);
                if (endMs) reasons.push(`endAt=${new Date(endMs).toISOString()}`);

                // se houver start definido e agora for antes -> não ativo
                if (startMs && now < startMs) { include = false; reasons.push('not started yet'); }
                // se houver end definido e agora for depois -> não ativo
                if (endMs && now > endMs) { include = false; reasons.push('expired'); }

                if (ADS_DEBUG) console.debug(`ads.js: eval ad ${ad.id} (${ad.nome || ''})`, { type: ad.type, status: ad.status, paid: !!(ad.raw && (ad.raw.asaasPaymentId || ad.raw.paymentId)), startMs, endMs, durationDays: ad.durationDays, include, reasons });

                return include;
            });

            if (ADS_DEBUG) console.debug('ads.js: active ads after filter:', active.map(a => ({ id: a.id, nome: a.nome, type: a.type })));

            // Embaralha para exibição aleatória
            active.sort(() => Math.random() - 0.5);
            onUpdate(active);
        }, (err) => {
            console.error('Erro ao escutar anunciosUsuarios:', err);
            const all = systemBanners.map(d => _normalizeBannerDoc(d));
            onUpdate(all);
        });

    }, (error) => {
        console.error('Erro ao escutar banners:', error);
        // Se falhar, tenta somente os anúncios de usuários (sem realtime)
        getDocs(collection(firestore, 'anunciosUsuarios'))
            .then(snapshot => {
                const userAds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                onUpdate(userAds.map(d => _normalizeBannerDoc(d)));
            })
            .catch(err => console.error('Erro fallback anunciosUsuarios:', err));
    });
}

/**
 * Renderiza um carrossel de banners em containers já existentes.
 * slidesContainer: Elemento onde os slides devem ser inseridos
 * dotsContainer: Elemento para os botões de navegação
 * progressBar: Elemento da barra de progresso (opcional)
 */
export function renderCarousel(slidesContainer, dotsContainer, progressBar, banners = [], slideDuration = 5000) {
    if (!slidesContainer || !dotsContainer) return;

    // Limpa timers anteriores
    if (_bannerInterval) { clearInterval(_bannerInterval); _bannerInterval = null; }

    if (!banners || banners.length === 0) {
        slidesContainer.innerHTML = '';
        dotsContainer.innerHTML = '';
        if (progressBar) progressBar.style.animation = 'none';
        return;
    }

    slidesContainer.innerHTML = '';
    dotsContainer.innerHTML = '';

    banners.forEach((banner, index) => {
        const slide = document.createElement('div');
        slide.className = 'banner-slide';

        const mediaElement = banner.mediaType === 'video'
            ? `<video src="${banner.mediaUrl}" autoplay muted loop playsinline></video>`
            : `<img src="${banner.mediaUrl}" alt="Anúncio ${index + 1}">`;

        slide.innerHTML = banner.linkUrl ? `<a href="${banner.linkUrl}" target="_blank" rel="noopener noreferrer">${mediaElement}</a>` : mediaElement;
        slidesContainer.appendChild(slide);

        const dot = document.createElement('button');
        dot.className = 'banner-dot';
        dot.dataset.index = index;
        dotsContainer.appendChild(dot);
    });

    // Função para exibir slide
    let currentIndex = 0;
    const slides = slidesContainer.querySelectorAll('.banner-slide');
    const dots = dotsContainer.querySelectorAll('.banner-dot');

    function showSlide(i) {
        if (!slidesContainer) return;
        currentIndex = i % slides.length;
        slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
        dots.forEach(d => d.classList.remove('active'));
        if (dots[currentIndex]) dots[currentIndex].classList.add('active');
        if (progressBar) {
            progressBar.style.animation = 'none';
            void progressBar.offsetWidth;
            progressBar.style.animation = `progressBarAnimation ${slideDuration/1000}s linear forwards`;
        }
    }

    function next() { showSlide((currentIndex + 1) % slides.length); }

    // Dots click
    dots.forEach(dot => dot.addEventListener('click', () => {
        const i = parseInt(dot.dataset.index, 10);
        showSlide(i);
        if (_bannerInterval) clearInterval(_bannerInterval);
        _bannerInterval = setInterval(next, slideDuration);
    }));

    showSlide(0);
    if (banners.length > 1) {
        _bannerInterval = setInterval(next, slideDuration);
    }
}

/**
 * Renderiza banners de anunciantes (tiles) em um container.
 */
export function renderAdvertiserTiles(container, ads = []) {
    if (!container) return;
    container.innerHTML = '';
    if (!ads || ads.length === 0) return;

    ads.forEach(ad => {
        const slide = document.createElement('div');
        slide.className = 'advertiser-slide';
        const isUrl = ad.linkUrl && ad.linkUrl.startsWith('http');
        const linkOpen = isUrl ? `<a href="${ad.linkUrl}" target="_blank" rel="noopener">` : '';
        const linkClose = isUrl ? `</a>` : '';
        slide.innerHTML = `
            ${linkOpen}
                <img src="${ad.mediaUrl}" alt="${ad.nome}">
                <div class="advertiser-info-overlay">
                    <h3>${ad.nome}</h3>
                    <p>${ad.descricao || (isUrl ? 'Clique para saber mais' : '')}</p>
                </div>
            ${linkClose}
        `;
        container.appendChild(slide);
    });
}

/**
 * Função utilitária para buscar banners uma vez (getDocs) — opcional.
 */
export async function fetchBannersOnce() {
    const querySnapshot = await getDocs(collection(firestore, 'banners'));
    return querySnapshot.docs.map(doc => _normalizeBannerDoc({ id: doc.id, ...doc.data() }));
}

export default { listenCombinedAds, renderCarousel, renderAdvertiserTiles, fetchBannersOnce };
