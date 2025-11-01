// js/cardapio.js

import { firestore } from './firebase-config.js';
import { collection, onSnapshot, Timestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { listenCombinedAds, renderCarousel, renderAdvertiserTiles } from './ads.js';
import { updateCartBadge } from './main.js';

const formatCurrency = (value) => `R$ ${Number(value).toFixed(2).replace('.', ',')}`;

const stringToHash = str => {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash &= hash;
    }
    return Math.abs(hash);
};

// --- LÓGICA DO CARROSSEL DE ANÚNCIOS (BANNERS) ---
const bannerContainer = document.getElementById('banner-slider-container');
const slidesContainer = document.querySelector('.banner-slides');
const dotsContainer = document.querySelector('.banner-dots');
const progressBar = document.querySelector('.banner-progress-bar');
let bannerInterval;
const SLIDE_DURATION = 5000;

// Render de banners agora centralizado em js/ads.js
function renderBanners(banners) {
    if (!bannerContainer || !slidesContainer || !dotsContainer) return;
    if (!banners || banners.length === 0) {
        bannerContainer.style.display = 'none';
        return;
    }
    // Usa o renderizador do módulo ads.js
    renderCarousel(slidesContainer, dotsContainer, progressBar, banners, SLIDE_DURATION);
    bannerContainer.style.display = 'block';
}

function listenToBanners() {
    // Array para armazenar todos os anúncios
    // Use the shared listener to combine system banners and approved user ads
    listenCombinedAds((allAds) => {
        if (allAds && allAds.length > 0) {
            renderBanners(allAds);
        } else if (bannerContainer) {
            bannerContainer.style.display = 'none';
        }
    });
}

// --- LÓGICA DO CARROSSEL DE ANUNCIANTES ---
const advertiserSection = document.getElementById('advertiser-section');
const advertiserSlidesContainer = document.querySelector('.advertiser-slides');

function listenToAdvertisers() {
    if (!advertiserSection || !advertiserSlidesContainer) return;

    const now = Timestamp.now();
    // Aceita anúncios com status 'aprovado' ou 'ativo' (admin usa 'ativo' ao aprovar)
    const q = query(
        collection(firestore, "anunciosUsuarios"),
        where("status", "in", ["aprovado", "ativo"])
    );

    onSnapshot(q, (snapshot) => {
        const activeAds = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }));

        if (activeAds.length > 0) {
            // Normaliza e usa renderer compartilhado
            const normalized = activeAds.map(a => ({
                id: a.id,
                nome: a.nome || '',
                descricao: a.descricao || '',
                mediaUrl: a.imagemUrl || a.mediaUrl || '',
                mediaType: a.mediaType || 'image',
                linkUrl: a.linkUrl || ''
            }));
            renderAdvertiserTiles(advertiserSlidesContainer, normalized);
            advertiserSection.style.display = 'block';
        } else {
            advertiserSection.style.display = 'none';
        }
    }, (error) => {
        console.error("Erro ao buscar anunciantes:", error);
        advertiserSection.style.display = 'none';
    });
}

function renderAdvertiserBanners(ads) {
    advertiserSlidesContainer.innerHTML = '';
    ads.forEach(ad => {
        const slide = document.createElement('div');
        slide.className = 'advertiser-slide';
        // Envolve a imagem em um link se a oferta for um link clicável (futura expansão)
        const isUrl = ad.linkUrl && ad.linkUrl.startsWith('http');
        const linkTagOpen = isUrl ? `<a href="${ad.linkUrl}" target="_blank" rel="noopener">` : '';
        const linkTagClose = isUrl ? `</a>` : '';

        slide.innerHTML = `
            ${linkTagOpen}
                <img src="${ad.imagemUrl}" alt="${ad.nome}">
                <div class="advertiser-info-overlay">
                    <h3>${ad.nome}</h3>
                    <p>${ad.descricao || (isUrl ? 'Clique para saber mais' : '')}</p>
                </div>
            ${linkTagClose}
        `;
        advertiserSlidesContainer.appendChild(slide);
    });
}


// --- LÓGICA DA SEÇÃO DE OFERTAS ---
const ofertasSection = document.getElementById('ofertas-section');
let countdownInterval;

function listenToOfertas() {
    if (!ofertasSection) return;
    onSnapshot(collection(firestore, "ofertas"), (snapshot) => {
        const now = new Date();
        const activeOfertas = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(oferta => oferta.ativo === true && oferta.expiraEm && oferta.expiraEm.toDate() > now);

        if (activeOfertas.length > 0) {
            activeOfertas.sort((a, b) => b.expiraEm.toMillis() - a.expiraEm.toMillis());
            displayOferta(activeOfertas[0]);
        } else {
            ofertasSection.style.display = 'none';
            clearInterval(countdownInterval);
        }
    }, (error) => {
        console.error("Erro ao buscar ofertas:", error);
        ofertasSection.style.display = 'none';
    });
}

function displayOferta(oferta) {
    const precoOriginal = oferta.produtos.reduce((total, productId) => {
        const product = allProducts.find(p => p.id === productId);
        return total + (product ? product.preco : 0);
    }, 0);

    if (precoOriginal === 0) {
        ofertasSection.style.display = 'none';
        return;
    }

    document.getElementById('oferta-imagem').src = oferta.imagemUrl;
    document.getElementById('oferta-nome').textContent = oferta.nome;
    document.getElementById('oferta-descricao').textContent = oferta.descricao;
    document.getElementById('oferta-preco-original').textContent = `de ${formatCurrency(precoOriginal)}`;
    document.getElementById('oferta-preco-final').textContent = `por ${formatCurrency(oferta.precoOferta)}`;
    ofertasSection.style.display = 'block';
    startCountdown(oferta.expiraEm);
    document.getElementById('oferta-add-btn').onclick = () => addOfertaToCart(oferta);
}

function addOfertaToCart(oferta) {
    if (!confirm("Esta oferta substituirá todos os itens do seu carrinho. Deseja continuar?")) {
        return;
    }
    const newCart = {};
    oferta.produtos.forEach(productId => {
        const product = allProducts.find(p => p.id === productId);
        if (product) {
            const cartItemId = product.id; // Ofertas não têm personalização
            if (newCart[cartItemId]) {
                newCart[cartItemId].quantidade += 1;
            } else {
                newCart[cartItemId] = {
                    nome: product.nome,
                    preco: product.preco,
                    quantidade: 1,
                    img: product.imagemUrl
                };
            }
        }
    });
    localStorage.setItem('pizzariaCart', JSON.stringify(newCart));
    sessionStorage.setItem('activeOferta', JSON.stringify({
        id: oferta.id,
        nome: oferta.nome,
        precoFinal: oferta.precoOferta
    }));
    window.location.href = 'carrinho.html';
}

function startCountdown(expirationTimestamp) {
    clearInterval(countdownInterval);
    const countdownElement = document.getElementById('oferta-countdown');
    const expirationDate = expirationTimestamp.toDate();
    countdownInterval = setInterval(() => {
        const distance = expirationDate - new Date().getTime();
        if (distance < 0) {
            clearInterval(countdownInterval);
            ofertasSection.style.display = 'none';
            return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        countdownElement.innerHTML = `
            <span>Termina em:</span>
            <div class="timer-box">${days}<span>d</span></div>
            <div class="timer-box">${hours}<span>h</span></div>
            <div class="timer-box">${minutes}<span>m</span></div>
            <div class="timer-box">${seconds}<span>s</span></div>
        `;
    }, 1000);
}


// --- LÓGICA PRINCIPAL DO CARDÁPIO E PRODUTOS ---
let allProducts = [];

document.addEventListener('DOMContentLoaded', () => {
    // --- SELETORES DO DOM ---
    const productListContainer = document.getElementById('product-list');
    const searchInput = document.getElementById('search-input');
    const filterButtonsContainer = document.querySelector('.filter-buttons');
    const customizationOverlay = document.getElementById('customization-overlay');
    const modalAddToCartBtn = document.getElementById('modal-add-to-cart-btn');
    const closeCustomizationBtn = document.getElementById('close-customization-btn');
    const modalImg = document.getElementById('modal-product-img');
    const modalName = document.getElementById('modal-product-name');
    const modalIngredients = document.getElementById('modal-product-ingredients');
    const modalBasePrice = document.getElementById('modal-product-base-price');
    const modalAdditionalOptions = document.getElementById('modal-additional-options');
    const modalInstructions = document.getElementById('modal-special-instructions');
    const modalDecreaseQty = document.getElementById('modal-decrease-qty');
    const modalIncreaseQty = document.getElementById('modal-increase-qty');
    const modalQty = document.getElementById('modal-product-qty');
    const modalFinalPrice = document.getElementById('modal-final-price');
    const finalizeOrderContainer = document.getElementById('finalize-order-container');

    // --- ESTADO DO APP ---
    let cart = JSON.parse(localStorage.getItem('pizzariaCart')) || {};
    let isVip = false; // Flag para cliente VIP
    let currentProduct = null;
    let personalizationConfig = { lista: {}, aplicacoes: {} };

    function updateFinalizeButtonVisibility() {
        const hasItems = Object.keys(cart).length > 0;
        if (finalizeOrderContainer) {
            finalizeOrderContainer.classList.toggle('visible', hasItems);
        }
    }

    /**
     * Verifica se o usuário é VIP (tem mais de X pedidos) e exibe a categoria secreta.
     */
    async function checkVipStatus() {
        const userId = sessionStorage.getItem('userId');
        if (!userId) return;

        try {
            const q = query(collection(firestore, "pedidos"), where("userId", "==", userId));
            const querySnapshot = await getDocs(q);
            
            const VIP_ORDER_COUNT = 5; // Cliente se torna VIP após 5 pedidos
            if (querySnapshot.size >= VIP_ORDER_COUNT) {
                isVip = true;
                const secretFilterBtn = document.createElement('button');
                secretFilterBtn.className = 'filter-btn secret-filter';
                secretFilterBtn.dataset.category = 'secreto';
                secretFilterBtn.innerHTML = '<i class="material-icons">key</i> Secreto';
                filterButtonsContainer.appendChild(secretFilterBtn);
            }
        } catch (error) {
            console.error("Erro ao verificar status VIP:", error);
        }
    }
    
    function listenToProducts() {
        onSnapshot(collection(firestore, 'produtos'), (snapshot) => {
            allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Filtra produtos secretos se o usuário não for VIP
            renderProducts();
        });
    }

    function listenToPersonalizationConfig() {
        onSnapshot(collection(firestore, 'personalizacoes'), (snapshot) => {
            const newList = {};
            const newApplications = { todasPizzas: {}, todasEsfihas: {} };
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                newList[doc.id] = { nome: data.nome, preco: data.preco };
                if (data.aplicaPizza || data.aplicaTodos) newApplications.todasPizzas[doc.id] = true;
                if (data.aplicaEsfiha || data.aplicaTodos) newApplications.todasEsfihas[doc.id] = true;
            });
            personalizationConfig = { lista: newList, aplicacoes: newApplications };
        });
    }

    function renderProducts() {
        if (!productListContainer) return;
        const activeCategory = document.querySelector('.filter-btn.active')?.dataset.category || 'all';
        const searchTerm = searchInput.value.toLowerCase().trim();

        let productsToRender = allProducts.filter(p => {
            const matchesCategory = activeCategory === 'all' || p.categoria === activeCategory || (isVip && activeCategory === 'secreto' && p.isSecret);
            const matchesSearch = !searchTerm || p.nome?.toLowerCase().includes(searchTerm) || p.ingredientes?.toLowerCase().includes(searchTerm);
            const isVisible = !p.isSecret || (p.isSecret && isVip); // Só mostra secretos para VIPs
            
            return matchesCategory && matchesSearch && isVisible;
        });
        
        productListContainer.innerHTML = productsToRender.length === 0 ? '<p>Nenhum produto encontrado.</p>' : '';
        
        productsToRender.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            const buttonText = product.categoria === 'bebida' ? 'Adicionar' : 'Personalizar';
            card.innerHTML = `<img src="${product.imagemUrl || 'img/desenho-pizza.png'}" alt="${product.nome}"> <div class="product-info"> <h3>${product.nome}</h3> <h4>${product.ingredientes || ''}</h4> </div> <div class="product-price"> <h5>${formatCurrency(product.preco)}</h5> <button class="add-button" data-id="${product.id}">${buttonText}</button> </div>`;
            productListContainer.appendChild(card);
        });
    }

    function updateModalPrice() {
        if (!currentProduct) return;
        let finalPrice = parseFloat(currentProduct.preco);
        document.querySelectorAll('#modal-additional-options input:checked').forEach(input => {
            finalPrice += parseFloat(input.dataset.price);
        });
        modalFinalPrice.textContent = formatCurrency(finalPrice * parseInt(modalQty.textContent));
    }

    function openCustomizationModal(product) {
        currentProduct = product;
        modalImg.src = product.imagemUrl || 'img/desenho-pizza.png';
        modalName.textContent = product.nome;
        modalIngredients.textContent = product.ingredientes || '';
        modalBasePrice.textContent = formatCurrency(product.preco);
        modalInstructions.value = '';
        modalQty.textContent = '1';
        
        const { lista, aplicacoes } = personalizationConfig;
        let additionalHtml = '';
        
        const finalAdicionais = new Map();
        const addOptions = (ids) => { if(ids) Object.keys(ids).forEach(id => { if (lista[id]) finalAdicionais.set(id, lista[id]); }); };
        if (product.categoria === 'pizza') addOptions(aplicacoes.todasPizzas);
        if (product.categoria === 'esfiha') addOptions(aplicacoes.todasEsfihas);

        if (finalAdicionais.size > 0) {
            additionalHtml = '<h3>Adicionais</h3>';
            Array.from(finalAdicionais.values()).sort((a,b) => a.nome.localeCompare(b.nome)).forEach(item => {
                const priceText = item.preco > 0 ? `<span>+ ${formatCurrency(item.preco)}</span>` : `<span>Grátis</span>`;
                additionalHtml += `<label class="checkbox-label"><input type="checkbox" data-price="${item.preco}" value="${item.nome}"> ${item.nome} ${priceText}</label>`;
            });
        }
        modalAdditionalOptions.innerHTML = additionalHtml;
        
        updateModalPrice();
        customizationOverlay.classList.add('visible');
    }
    
    function closeCustomizationModal() {
        customizationOverlay.classList.remove('visible');
        currentProduct = null;
    }

    function addToCart(product, isPersonalized) {
        sessionStorage.removeItem('activeOferta');
        
        const quantidade = isPersonalized ? parseInt(modalQty.textContent) : 1;
        const customizations = isPersonalized ? {
            removidos: [], // Lógica de ingredientes removíveis foi simplificada/removida
            adicionados: Array.from(document.querySelectorAll('#modal-additional-options input:checked')).map(cb => ({ nome: cb.value, preco: parseFloat(cb.dataset.price) })),
            observacao: modalInstructions.value.trim()
        } : null;
        
        const hasCustomizations = customizations && (customizations.adicionados.length > 0 || customizations.observacao);
        const precoFinalUnitario = isPersonalized ? parseFloat(modalFinalPrice.textContent.replace(/[^\d,]/g, '').replace(',', '.')) / quantidade : product.preco;
        const cartItemId = hasCustomizations ? `${product.id}-${stringToHash(JSON.stringify(customizations))}` : product.id;

        const itemData = {
            nome: product.nome,
            preco: precoFinalUnitario,
            quantidade: 0,
            img: product.imagemUrl,
            personalizacoes: hasCustomizations ? customizations : null
        };

        if (cart[cartItemId]) {
            cart[cartItemId].quantidade += quantidade;
        } else {
            cart[cartItemId] = itemData;
            cart[cartItemId].quantidade = quantidade;
        }
        
        localStorage.setItem('pizzariaCart', JSON.stringify(cart));
        updateCartBadge();
        updateFinalizeButtonVisibility();
        alert(`${quantidade}x ${product.nome} adicionado(s) ao carrinho!`);
        
        if (isPersonalized) closeCustomizationModal();
    }

    // --- EVENT LISTENERS ---
    filterButtonsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.filter-btn')) {
            filterButtonsContainer.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.closest('.filter-btn').classList.add('active');
            renderProducts();
        }
    });

    searchInput.addEventListener('input', renderProducts);

    productListContainer.addEventListener('click', (e) => {
        const addButton = e.target.closest('.add-button');
        if (!addButton) return;
        const product = allProducts.find(p => p.id === addButton.dataset.id);
        if (!product) return;
        product.categoria !== 'bebida' ? openCustomizationModal(product) : addToCart(product, false);
    });

    modalAddToCartBtn.addEventListener('click', () => { if (currentProduct) addToCart(currentProduct, true); });
    closeCustomizationBtn.addEventListener('click', closeCustomizationModal);
    customizationOverlay.addEventListener('click', (e) => { if (e.target === customizationOverlay) closeCustomizationModal(); });
    modalDecreaseQty.addEventListener('click', () => { let qty = parseInt(modalQty.textContent); if (qty > 1) { modalQty.textContent = qty - 1; updateModalPrice(); } });
    modalIncreaseQty.addEventListener('click', () => { modalQty.textContent = parseInt(modalQty.textContent) + 1; updateModalPrice(); });
    modalAdditionalOptions.addEventListener('change', updateModalPrice);

    // --- INICIALIZAÇÃO ---
    listenToBanners();
    listenToAdvertisers(); // Escuta por anúncios de parceiros
    listenToPersonalizationConfig();
    listenToProducts();
    checkVipStatus(); // Verifica se o cliente é VIP para mostrar a categoria secreta
    listenToOfertas(); // Chamada agora é independente
    updateFinalizeButtonVisibility();
});