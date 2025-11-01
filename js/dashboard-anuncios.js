// js/dashboard-anuncios.js

// Importando as funções necessárias do Cloud Firestore
import { firestore } from './firebase-config.js';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES DO DOM ---
const bannerForm = document.getElementById('banner-form');
const bannerFormTitle = document.getElementById('banner-form-title');
const bannerIdInput = document.getElementById('banner-id');
const mediaUrlInput = document.getElementById('banner-media-url');
const linkUrlInput = document.getElementById('banner-link-url');
const mediaTypeSelect = document.getElementById('banner-media-type');
const clearFormBtn = document.getElementById('clear-banner-form-btn');
const bannerListContainer = document.getElementById('banner-list');

/**
 * Obtém as dimensões de uma mídia (imagem ou vídeo) a partir de uma URL.
 * @param {string} url - A URL da mídia.
 * @param {string} type - O tipo de mídia ('image' or 'video').
 * @returns {Promise<string>} Uma Promise que resolve com as dimensões formatadas.
 */
const getMediaDimensions = (url, type) => {
    return new Promise((resolve, reject) => {
        if (type === 'image') {
            const img = new Image();
            img.onload = () => resolve(`${img.naturalWidth} x ${img.naturalHeight}px`);
            img.onerror = () => reject(`Falha ao carregar imagem: ${url}`);
            img.src = url;
        } else if (type === 'video') {
            const video = document.createElement('video');
            video.onloadedmetadata = () => resolve(`${video.videoWidth} x ${video.videoHeight}px`);
            video.onerror = () => reject(`Falha ao carregar vídeo: ${url}`);
            video.src = url;
        } else {
            reject('Tipo de mídia desconhecido.');
        }
    });
};

/**
 * Renderiza a lista de banners na tela a partir de um array de objetos.
 * @param {Array} banners - O array de banners a ser renderizado.
 */
const renderBannerList = (banners) => {
    bannerListContainer.innerHTML = '';
    if (!banners || banners.length === 0) {
        bannerListContainer.innerHTML = '<p>Nenhum anúncio cadastrado ainda.</p>';
        return;
    }

    banners.forEach(banner => {
        const bannerCard = document.createElement('div');
        bannerCard.className = 'banner-card-admin';
        // Armazena os campos relevantes no dataset usando keys consistentes (camelCase)
        // Evita gravar objetos complexos (ex: Timestamp) diretamente no dataset.
        bannerCard.dataset.id = banner.id || '';
        bannerCard.dataset.mediaUrl = banner.mediaUrl || '';
        bannerCard.dataset.linkUrl = banner.linkUrl || '';
        bannerCard.dataset.mediaType = banner.mediaType || 'image';

        const mediaPreview = banner.mediaType === 'video'
            ? `<video src="${banner.mediaUrl}" muted playsinline></video>`
            : `<img src="${banner.mediaUrl}" alt="Preview do Anúncio">`;

        bannerCard.innerHTML = `
            <div class="banner-preview">${mediaPreview}</div>
            <div class="banner-info">
                <div><strong>Tipo:</strong> ${banner.mediaType.charAt(0).toUpperCase() + banner.mediaType.slice(1)}</div>
                <div><strong>Link:</strong> ${banner.linkUrl ? `<a href="${banner.linkUrl}" target="_blank">Acessar</a>` : 'Nenhum'}</div>
                <div><strong>Dimensões:</strong> <span class="banner-dimensions">Carregando...</span></div>
            </div>
            <div class="banner-actions">
                <button class="btn-icon edit-btn" title="Editar"><i class="material-icons">edit</i></button>
                <button class="btn-icon delete-btn" title="Excluir"><i class="material-icons">delete</i></button>
            </div>
        `;
        bannerListContainer.appendChild(bannerCard);

        // Busca as dimensões de forma assíncrona após renderizar o card
        const dimensionsSpan = bannerCard.querySelector('.banner-dimensions');
        getMediaDimensions(banner.mediaUrl, banner.mediaType)
            .then(dimensions => {
                dimensionsSpan.textContent = dimensions;
            })
            .catch(error => {
                console.warn(error);
                dimensionsSpan.textContent = 'Indisponível';
                dimensionsSpan.classList.add('error');
            });
    });
};

/**
 * Busca todos os banners do Firebase Firestore.
 */
const fetchBanners = async () => {
    try {
        // Busca os documentos da coleção 'banners' no Firestore
        const querySnapshot = await getDocs(collection(firestore, 'banners'));
        const banners = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderBannerList(banners);
    } catch (error) {
        console.error("Erro ao buscar banners no Firestore:", error);
        bannerListContainer.innerHTML = '<p class="error-message">Falha ao carregar anúncios.</p>';
    }
};

/**
 * Limpa os campos do formulário e redefine seu estado inicial.
 */
const resetForm = () => {
    bannerForm.reset();
    bannerIdInput.value = '';
    bannerFormTitle.textContent = 'Adicionar Anúncio';
};

/**
 * Função de inicialização do módulo.
 */
export function init() {
    // Event listener para o formulário de Adicionar/Editar Anúncio
    bannerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Cria objeto padronizado: mediaUrl, mediaType, linkUrl, durationDays, startAt, endAt, status
        const mediaUrl = mediaUrlInput.value;
        const mediaType = mediaTypeSelect.value || 'image';
        const linkUrl = linkUrlInput.value || '';
        const durationDays = 30; // padrão para banners do sistema
        const startAt = Timestamp.fromDate(new Date());
        const endAt = Timestamp.fromDate(new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000));

        const bannerData = {
            mediaUrl,
            mediaType,
            linkUrl,
            durationDays,
            startAt,
            endAt,
            status: 'aprovado',
            createdAt: Timestamp.fromDate(new Date())
        };

        try {
            const id = bannerIdInput.value;
            if (id) { // Se existe um ID, estamos editando
                await updateDoc(doc(firestore, 'banners', id), bannerData);
                alert('Anúncio atualizado com sucesso!');
            } else { // Caso contrário, estamos criando um novo
                await addDoc(collection(firestore, 'banners'), bannerData);
                alert('Anúncio criado com sucesso!');
            }
            resetForm();
            await fetchBanners(); // Recarrega a lista para mostrar as mudanças
        } catch (error) {
            console.error("Erro ao salvar anúncio no Firestore:", error);
            alert('Erro ao salvar o anúncio.');
        }
    });

    // Delegação de eventos para os botões de Editar e Excluir
    bannerListContainer.addEventListener('click', async (e) => {
        const bannerCard = e.target.closest('.banner-card-admin');
        if (!bannerCard) return;

        // Lê os dados a partir do dataset usando as chaves camelCase que definimos acima
        const id = bannerCard.dataset.id;
        const mediaurl = bannerCard.dataset.mediaUrl;
        const linkurl = bannerCard.dataset.linkUrl;
        const mediatype = bannerCard.dataset.mediaType;

        // Ação de Editar
        if (e.target.closest('.edit-btn')) {
            bannerIdInput.value = id;
            mediaUrlInput.value = mediaurl;
            linkUrlInput.value = linkurl || '';
            mediaTypeSelect.value = mediatype;
            bannerFormTitle.textContent = 'Editar Anúncio';
            window.scrollTo(0, 0); // Rola a página para o topo
        }

        // Ação de Excluir
        if (e.target.closest('.delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este anúncio?')) {
                try {
                    await deleteDoc(doc(firestore, 'banners', id));
                    alert('Anúncio excluído com sucesso!');
                    await fetchBanners(); // Recarrega a lista
                } catch (error) {
                    console.error("Erro ao excluir anúncio do Firestore:", error);
                    alert('Erro ao excluir o anúncio.');
                }
            }
        }
    });

    // Botão para limpar o formulário
    clearFormBtn.addEventListener('click', resetForm);
    
    // Carga inicial dos anúncios
    fetchBanners();
}