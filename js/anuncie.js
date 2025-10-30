// js/anuncie.js

// Importa as funções necessárias do Firebase
import { firestore } from './firebase-config.js';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Seletores do Formulário ---
    const form = document.getElementById('anuncio-form');
    const budgetSlider = document.getElementById('budget-slider');
    const budgetDisplay = document.getElementById('budget-display-value');
    const tierInfoContainer = document.getElementById('campaign-tier-info');
    const termsCheckbox = document.getElementById('terms-checkbox');
    const submitBtn = document.getElementById('submit-anuncio-btn');

    // --- Seletores da Pré-visualização ---
    const imageUrlInput = document.getElementById('anuncio-imagem-url');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');

    // --- Seletores do Modal de Termos ---
    const openTermsModalBtn = document.getElementById('open-terms-modal');
    const termsModalOverlay = document.getElementById('terms-modal-overlay');
    const closeTermsModalBtn = document.getElementById('close-terms-modal-btn');

    // --- Seletores do Modal de Pagamento PIX ---
    const pixPaymentModalOverlay = document.getElementById('pix-payment-modal-overlay');
    const closePixPaymentModalBtn = document.getElementById('close-pix-payment-modal-btn');
    const pixModalTotalValue = document.getElementById('pix-modal-total-value');
    const pixQrContainer = document.getElementById('pix-qr-code-container');
    const pixCopyPasteInput = document.getElementById('pix-copy-paste-code');

    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    // --- Lógica do Slider de Orçamento ---
    const updateTierInfo = (value) => {
        let tierName, tierDescription;
        if (value == 1000) {
            tierName = "Plano Premium";
            tierDescription = "Sua campanha terá <strong>destaque máximo</strong> e ficará no ar por <strong>até 45 dias</strong>.";
        } else if (value >= 500) {
            tierName = "Plano Destaque";
            tierDescription = "Sua campanha terá <strong>alta visibilidade</strong> e ficará no ar por <strong>até 30 dias</strong>.";
        } else if (value >= 200) {
            tierName = "Plano Padrão";
            tierDescription = "Sua campanha terá <strong>boa visibilidade</strong> e ficará no ar por <strong>até 15 dias</strong>.";
        } else {
            tierName = "Plano Básico";
            tierDescription = "Sua campanha ficará no ar por <strong>até 7 dias</strong>.";
        }

        tierInfoContainer.innerHTML = `
            <h3>${tierName}</h3>
            <p>${tierDescription}</p>
        `;
    };

    budgetSlider.addEventListener('input', () => {
        const value = budgetSlider.value;
        budgetDisplay.textContent = formatCurrency(value);
        updateTierInfo(value);
    });

    // Inicializa os valores
    budgetDisplay.textContent = formatCurrency(budgetSlider.value);
    updateTierInfo(budgetSlider.value);

    // --- Lógica da Pré-visualização da Imagem ---
    imageUrlInput.addEventListener('input', () => {
        const url = imageUrlInput.value.trim();

        if (url) {
            try {
                // Valida se a string tem formato de URL antes de tentar carregar
                new URL(url);
                imagePreview.src = url;
                imagePreviewContainer.style.display = 'block';

                // Se a imagem não carregar (URL quebrada, etc.), esconde a pré-visualização
                imagePreview.onerror = () => {
                    imagePreviewContainer.style.display = 'none';
                };
            } catch (_) {
                // Se a URL for malformada, esconde a pré-visualização
                imagePreviewContainer.style.display = 'none';
            }
        } else {
            // Se o campo estiver vazio, esconde a pré-visualização
            imagePreviewContainer.style.display = 'none';
        }
    });

    // --- Lógica de Validação e Submissão ---
    const validateForm = () => {
        const isFormValid = form.checkValidity();
        const areTermsAccepted = termsCheckbox.checked;
        submitBtn.disabled = !(isFormValid && areTermsAccepted);
    };

    form.addEventListener('input', validateForm);
    termsCheckbox.addEventListener('change', validateForm);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitBtn.disabled) return;

        const userId = sessionStorage.getItem('userId');
        if (!userId) {
            alert("Você precisa estar logado para criar um anúncio. Por favor, faça o login e tente novamente.");
            window.location.href = 'login.html';
            return;
        }

        // Pega os dados do usuário logado da sessionStorage
        const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
        if (!loggedInUser || !loggedInUser.cpf) {
            alert("Seus dados de usuário (especialmente o CPF) não foram encontrados. Por favor, faça login novamente.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processando...';

        try { // O bloco try/catch agora envolve todo o processo
            submitBtn.textContent = 'Salvando campanha...';

            // Coleta os dados do formulário
            const anuncioData = {
                nome: document.getElementById('anuncio-nome').value,
                tipo: document.querySelector('input[name="anuncio-tipo"]:checked').value,
                descricao: document.getElementById('anuncio-descricao').value,
                imagemUrl: document.getElementById('anuncio-imagem-url').value,
                videoUrl: document.getElementById('anuncio-video-url').value || '',
                budget: parseFloat(budgetSlider.value),
                status: 'pendente',
                createdAt: serverTimestamp(),
                userId: userId
            };

            // Salva os dados na coleção 'anunciosUsuarios' do Firestore
            const docRef = await addDoc(collection(firestore, 'anunciosUsuarios'), anuncioData);
            const adId = docRef.id;

            submitBtn.textContent = 'Gerando PIX...';

            // Chama a nova API do backend para criar o pagamento no Asaas
            const response = await fetch('/api/create-ad-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userData: loggedInUser, // Envia os dados do usuário
                    adId: adId,
                    budget: anuncioData.budget,
                })
            });

            const paymentResult = await response.json();

            if (!response.ok) {
                throw new Error(paymentResult.error || 'Falha ao gerar cobrança.');
            }

            // ATUALIZAÇÃO: Salva o ID do pagamento do Asaas de volta no documento do anúncio
            const adRef = doc(firestore, 'anunciosUsuarios', adId);
            await updateDoc(adRef, {
                asaasPaymentId: paymentResult.id,
                asaasCustomerId: paymentResult.customer
            });

            // Preenche e exibe o modal de pagamento PIX
            pixModalTotalValue.textContent = formatCurrency(anuncioData.budget);
            pixQrContainer.innerHTML = `<img src="data:image/png;base64,${paymentResult.pixQrCode.encodedImage}" alt="QR Code PIX">`;
            pixCopyPasteInput.value = paymentResult.pixQrCode.payload;
            pixPaymentModalOverlay.classList.add('visible');

        } catch (error) {
            console.error("Erro no processo de criação do anúncio:", error);
            alert("Ocorreu um erro ao enviar seu anúncio. Por favor, tente novamente.");
            submitBtn.disabled = false;
            submitBtn.textContent = 'Ir para Pagamento';
        }
    });

    // --- Lógica do Modal de Termos ---
    openTermsModalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        termsModalOverlay.classList.add('visible');
    });

    closeTermsModalBtn.addEventListener('click', () => {
        termsModalOverlay.classList.remove('visible');
    });

    termsModalOverlay.addEventListener('click', (e) => {
        if (e.target === termsModalOverlay) {
            termsModalOverlay.classList.remove('visible');
        }
    });

    // --- Lógica do Modal de Pagamento PIX ---
    closePixPaymentModalBtn.addEventListener('click', () => {
        pixPaymentModalOverlay.classList.remove('visible');
        // Reseta o botão principal após fechar o modal
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gerar Cobrança PIX';
    });

    document.getElementById('copy-pix-code-btn').addEventListener('click', () => {
        const copyBtn = document.getElementById('copy-pix-code-btn');
        navigator.clipboard.writeText(pixCopyPasteInput.value).then(() => {
            const originalContent = copyBtn.innerHTML;
            copyBtn.innerHTML = `<i class="material-icons">check</i> Copiado!`;
            copyBtn.classList.add('copied');

            setTimeout(() => {
                copyBtn.innerHTML = originalContent;
                copyBtn.classList.remove('copied');
            }, 2000);
        }).catch(err => console.error('Falha ao copiar código PIX:', err));
    });

});