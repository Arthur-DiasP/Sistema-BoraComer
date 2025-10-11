// js/pagamentos.js

import { firestore } from './firebase-config.js';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { updateCartBadge } from './main.js';

const BACKEND_URL = '';

document.addEventListener('DOMContentLoaded', () => {
    // --- Seletores do DOM ---
    const totalValueDisplay = document.getElementById('total-value-display');
    const paymentMethodRadios = document.querySelectorAll('input[name="payment-method"]');
    const cardFormContainer = document.getElementById('card-payment-form-container');
    const cardForm = document.getElementById('card-payment-form');
    const cardFormTitle = document.getElementById('card-form-title');
    const mainConfirmBtnContainer = document.getElementById('main-confirm-button-container');
    const mainConfirmBtn = document.getElementById('main-confirm-btn');
    const confirmCardPaymentBtn = document.getElementById('confirm-card-payment-btn');

    // --- Seletores dos Modais ---
    const pixModalOverlay = document.getElementById('pix-modal-overlay');
    const pixTotalValue = document.getElementById('pix-modal-total-value');
    const pixQrContainer = document.getElementById('pix-qr-code-container');
    const pixCopyPasteInput = document.getElementById('pix-copy-paste-code');
    const copyPixBtn = document.getElementById('copy-pix-code-btn');
    const paymentMadeBtn = document.getElementById('payment-made-btn');
    const closePixModalBtn = document.getElementById('close-pix-modal-btn');
    const moneyModalOverlay = document.getElementById('money-modal-overlay');
    const moneyAmountInput = document.getElementById('money-amount');
    const confirmMoneyBtn = document.getElementById('confirm-money-payment-btn');
    const closeMoneyModalBtn = document.getElementById('close-money-modal-btn');
    const confirmationOverlay = document.getElementById('confirmation-overlay');
    const closeConfirmationBtn = document.getElementById('close-confirmation-btn');
    // NOVO: Seletores para o modal de Ficha Grátis
    const freeTicketOverlay = document.getElementById('free-ticket-overlay');
    const playNowBtn = document.getElementById('play-now-btn');
    const playLaterBtn = document.getElementById('play-later-btn');

    // =========================================================================
    //  INÍCIO DA ATUALIZAÇÃO: Seletores e lógica da notificação de erro
    // =========================================================================
    const errorToast = document.getElementById('payment-error-toast');
    const errorTitle = document.getElementById('payment-error-title');
    const errorMessage = document.getElementById('payment-error-message');
    const errorCloseBtn = document.getElementById('payment-error-close-btn');
    
    let errorTimeout; // Variável para controlar o auto-fechamento
    
    function showPaymentError(title, message) {
        // Limpa qualquer timeout anterior para evitar que feche rápido demais
        clearTimeout(errorTimeout);

        errorTitle.textContent = title;
        errorMessage.textContent = message;
        errorToast.classList.add('show');

        // Define um novo timeout para esconder a notificação após 6 segundos
        errorTimeout = setTimeout(() => {
            errorToast.classList.remove('show');
        }, 6000);
    }

    errorCloseBtn.addEventListener('click', () => {
        clearTimeout(errorTimeout);
        errorToast.classList.remove('show');
    });
    // =========================================================================
    //  FIM DA ATUALIZAÇÃO
    // =========================================================================
    
    let orderTotal = 0;
    let orderAddress = {};
    let loggedInUser = {};
    let currentAsaasPayment = null;
    let userData = null; // Armazena dados completos do usuário do Firestore

    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    async function init() {
        const rawLoggedInUser = sessionStorage.getItem('loggedInUser');
        const rawOrderTotal = sessionStorage.getItem('pizzariaOrderTotal');
        const rawOrderAddress = sessionStorage.getItem('pizzariaOrderAddress');

        if (!rawLoggedInUser || !rawOrderTotal || !rawOrderAddress) {
            showPaymentError('Sessão Inválida', 'Por favor, refaça o pedido a partir do carrinho.');
            setTimeout(() => window.location.href = 'carrinho.html', 3000);
            return;
        }

        loggedInUser = JSON.parse(rawLoggedInUser);
        orderTotal = parseFloat(rawOrderTotal);
        orderAddress = JSON.parse(rawOrderAddress);
        
        // Carrega dados completos do usuário do Firestore
        const userRef = doc(firestore, "users", loggedInUser.id);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            userData = userSnap.data();
        }

        if (!loggedInUser.cpf || loggedInUser.cpf.replace(/\D/g, '').length !== 11) {
            showPaymentError('Perfil Incompleto', 'Seu CPF é inválido. Atualize seu perfil antes de continuar.');
            setTimeout(() => window.location.href = 'perfil.html', 3000);
            return;
        }

        totalValueDisplay.textContent = formatCurrency(orderTotal);
        setupEventListeners();
    }

    function setupEventListeners() {
        paymentMethodRadios.forEach(radio => radio.addEventListener('change', handlePaymentSelection));
        mainConfirmBtn.addEventListener('click', handleMainConfirm);
        
        cardForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const selectedMethodRadio = document.querySelector('input[name="payment-method"]:checked');
            handleCardPayment(selectedMethodRadio.value.toUpperCase());
        });

        closePixModalBtn.addEventListener('click', () => pixModalOverlay.classList.remove('visible'));
        paymentMadeBtn.addEventListener('click', () => finalizeOrder('PIX'));
        copyPixBtn.addEventListener('click', copyPixCode);

        closeMoneyModalBtn.addEventListener('click', () => moneyModalOverlay.classList.remove('visible'));
        moneyAmountInput.addEventListener('input', calculateChange);
        confirmMoneyBtn.addEventListener('click', () => {
             const troco = parseFloat(moneyAmountInput.value) - orderTotal;
             finalizeOrder('Dinheiro', { troco: formatCurrency(troco), valorPago: formatCurrency(moneyAmountInput.value) });
        });

        closeConfirmationBtn.addEventListener('click', () => window.location.href = 'perfil.html');

        playNowBtn.addEventListener('click', () => {
            window.location.href = 'jogo.html';
        });
    
        playLaterBtn.addEventListener('click', () => {
            freeTicketOverlay.classList.remove('visible');
            confirmationOverlay.classList.add('visible');
        });
    }

    function handlePaymentSelection(event) {
        const selectedValue = event.target.value;
        const isCard = selectedValue === 'credit_card' || selectedValue === 'debit_card';
        
        cardFormContainer.style.display = isCard ? 'block' : 'none';
        mainConfirmBtnContainer.style.display = !isCard ? 'block' : 'none';

        if (isCard) {
            cardFormTitle.textContent = selectedValue === 'credit_card' ? 'Pagamento com Cartão de Crédito' : 'Pagamento com Cartão de Débito';
        }
    }

    async function handleMainConfirm() {
        const selectedMethodRadio = document.querySelector('input[name="payment-method"]:checked');
        if (!selectedMethodRadio) {
            showPaymentError('Atenção', 'Selecione uma forma de pagamento para continuar.');
            return;
        }
        const method = selectedMethodRadio.value.toUpperCase();
        
        mainConfirmBtn.disabled = true;
        mainConfirmBtn.textContent = 'Processando...';

        if (method === 'PIX') {
            await createAsaasPayment('PIX');
        } else if (method === 'MONEY') {
            showMoneyModal(); 
        }

        mainConfirmBtn.disabled = false;
        mainConfirmBtn.textContent = 'Confirmar Pedido';
    }

    async function handleCardPayment(asaasMethod) {
        confirmCardPaymentBtn.disabled = true;
        confirmCardPaymentBtn.textContent = 'Processando...';

        const cardNumber = document.getElementById('card-number').value;
        const cardName = document.getElementById('card-name').value;
        const cardExpiry = document.getElementById('card-expiry').value;
        const cardCvv = document.getElementById('card-cvv').value;

        if (!cardNumber || !cardName || !cardExpiry || !cardCvv) {
            showPaymentError('Dados Incompletos', 'Por favor, preencha todos os dados do cartão.');
            confirmCardPaymentBtn.disabled = false;
            confirmCardPaymentBtn.textContent = 'Pagar com Cartão';
            return;
        }
        
        const [expiryMonth, expiryYearSuffix] = cardExpiry.split('/').map(s => s.trim());
        if (!expiryMonth || !expiryYearSuffix || expiryYearSuffix.length !== 2) {
             showPaymentError('Dados Inválidos', 'Formato de validade inválido. Use MM/AA.');
             confirmCardPaymentBtn.disabled = false;
             confirmCardPaymentBtn.textContent = 'Pagar com Cartão';
             return;
        }
        const expiryYear = `20${expiryYearSuffix}`;

        const cardData = { number: cardNumber, name: cardName, expiryMonth, expiryYear, cvv: cardCvv };
        
        await createAsaasPayment(asaasMethod, cardData);

        confirmCardPaymentBtn.disabled = false;
        confirmCardPaymentBtn.textContent = 'Pagar com Cartão';
    }

    async function createAsaasPayment(method, cardData = null) {
        const payload = {
            userData: loggedInUser,
            addressData: orderAddress,
            total: orderTotal,
            paymentMethod: method,
            cardData: cardData
        };
    
        try {
            const response = await fetch(`/api/create-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
    
            if (!response.ok) {
                console.error('Erro retornado pelo backend:', data);
                const errorMsg = data.details && data.details[0] ? data.details[0].description : data.error;
                // ATUALIZAÇÃO: Substitui alert pela nova notificação
                showPaymentError('Falha no Pagamento', `${errorMsg}. Por favor, verifique os dados e tente novamente.`);
                return;
            }
    
            currentAsaasPayment = data;
    
            if (method === 'PIX') {
                if (data && data.pixQrCode && data.pixQrCode.encodedImage) {
                    pixTotalValue.textContent = formatCurrency(data.value);
                    pixQrContainer.innerHTML = `<img src="data:image/png;base64,${data.pixQrCode.encodedImage}" alt="QR Code PIX">`;
                    pixCopyPasteInput.value = data.pixQrCode.payload;
                    pixModalOverlay.classList.add('visible');
                } else {
                    console.error("A resposta da API para o PIX não continha os dados do QR Code. Resposta recebida:", data);
                    // ATUALIZAÇÃO: Substitui alert pela nova notificação
                    showPaymentError('Falha na Geração do PIX', 'Não foi possível gerar o QR Code. Tente novamente em alguns instantes.');
                }
            } else if (method === 'CREDIT_CARD' || method === 'DEBIT_CARD') {
                if (data.status === 'CONFIRMED' || data.status === 'RECEIVED') {
                    finalizeOrder('Cartão de Crédito');
                } else {
                    showPaymentError('Pagamento Pendente', `O pagamento está sendo processado (Status: ${data.status}).`);
                    finalizeOrder('Cartão (Pendente)');
                }
            }
        } catch (error) {
            console.error("Erro de comunicação com o servidor:", error);
            // ATUALIZAÇÃO: Substitui alert pela nova notificação
            showPaymentError('Erro de Conexão', 'Não foi possível conectar ao servidor de pagamentos. Verifique sua rede.');
        }
    }
    
    function copyPixCode() {
        navigator.clipboard.writeText(pixCopyPasteInput.value).then(() => {
            copyPixBtn.innerHTML = '<i class="material-icons">check</i>';
            setTimeout(() => { copyPixBtn.innerHTML = '<i class="material-icons">content_copy</i>'; }, 2000);
        });
    }

    function showMoneyModal() {
        const moneyTotalValue = document.getElementById('money-modal-total-value');
        const changeDisplayBox = document.getElementById('change-display');
        moneyTotalValue.textContent = formatCurrency(orderTotal);
        moneyAmountInput.value = '';
        changeDisplayBox.style.display = 'none';
        confirmMoneyBtn.disabled = true;
        moneyModalOverlay.classList.add('visible');
    }

    function calculateChange() {
        const changeDisplayBox = document.getElementById('change-display');
        const changeValueEl = document.getElementById('change-value');
        const amountPaid = parseFloat(moneyAmountInput.value) || 0;
        if (amountPaid >= orderTotal) {
            const change = amountPaid - orderTotal;
            changeValueEl.textContent = formatCurrency(change);
            changeDisplayBox.style.display = 'flex';
            confirmMoneyBtn.disabled = false;
        } else {
            changeDisplayBox.style.display = 'none';
            confirmMoneyBtn.disabled = true;
        }
    }

    async function finalizeOrder(paymentMethod, details = {}) {
        const activeModal = document.querySelector('.payment-modal-overlay.visible');
        try {
            const cart = JSON.parse(localStorage.getItem('pizzariaCart')) || {};
            const referralDiscountApplied = parseFloat(sessionStorage.getItem('referralDiscountApplied')) || 0;
            const couponApplied = JSON.parse(sessionStorage.getItem('appliedCoupon')) || null;

            const newOrder = {
                userId: loggedInUser.id,
                cliente: { 
                    nome: loggedInUser.nome, 
                    email: loggedInUser.email, 
                    cpf: loggedInUser.cpf,
                    telefone: loggedInUser.telefone
                },
                itens: cart,
                total: orderTotal,
                endereco: orderAddress,
                formaPagamento: paymentMethod,
                status: (paymentMethod === 'Dinheiro') ? 'Em preparo' : 'Pagamento Pendente',
                data: serverTimestamp(),
                descontoIndicacao: referralDiscountApplied,
                cupomAplicado: couponApplied ? couponApplied.code : null,
                asaasPaymentId: currentAsaasPayment ? currentAsaasPayment.id : null,
                ...details
            };
            await addDoc(collection(firestore, 'pedidos'), newOrder);

            // Limpa o carrinho e a sessão do pedido
            localStorage.removeItem('pizzariaCart');
            sessionStorage.removeItem('pizzariaOrderTotal');
            sessionStorage.removeItem('pizzariaOrderAddress');
            sessionStorage.removeItem('referralDiscountApplied');
            sessionStorage.removeItem('appliedCoupon');
            updateCartBadge();
            
            // Lógica Pós-Venda (Indicação e Jogo)
            await handlePostPurchaseRewards();

            if (activeModal) activeModal.classList.remove('visible');

            // Verifica se o usuário ganhou uma ficha para decidir qual modal mostrar
            if (orderTotal > 50) {
                freeTicketOverlay.classList.add('visible');
            } else {
                confirmationOverlay.classList.add('visible');
            }

        } catch (error) {
            console.error("Erro ao finalizar o pedido:", error);
            showPaymentError('Erro Crítico', 'Não foi possível registrar seu pedido no sistema. Por favor, contate o suporte.');
        }
    }

    async function handlePostPurchaseRewards() {
        if (!userData) return;
        const userId = userData.id || loggedInUser.id;
        const userRef = doc(firestore, "users", userId);
        const updates = {};

        // 1. Deduz o crédito de indicação que foi usado
        const referralDiscountApplied = parseFloat(sessionStorage.getItem('referralDiscountApplied')) || 0;
        if (referralDiscountApplied > 0) {
            updates.referralCredit = increment(-referralDiscountApplied);
        }

        // NOVO: Incrementa o uso do cupom promocional
        const couponApplied = JSON.parse(sessionStorage.getItem('appliedCoupon')) || null;
        if (couponApplied) {
            const couponRef = doc(firestore, "cuponsPromocionais", couponApplied.code);
            updates.vezesUsado = increment(1);
        }

        // 1. Processa recompensa para o INDICADOR (se aplicável)
        if (userData.referredBy && !userData.firstPurchaseDiscountUsed) {
            const referrerRef = doc(firestore, "users", userData.referredBy);
            const referrerSnap = await getDoc(referrerRef);
            if (referrerSnap.exists()) {
                await updateDoc(referrerRef, {
                    referralCredit: increment(10.00),
                    successfulReferrals: arrayUnion({
                        name: userData.nome,
                        date: serverTimestamp()
                    })
                });
            }
            updates.firstPurchaseDiscountUsed = true;
        }

        // 2. Concede FICHA GRÁTIS para o Jogo da Velha
        if (orderTotal > 50) {
            updates.gameTickets = increment(1);
        }

        // Aplica todas as atualizações de uma só vez
        if (Object.keys(updates).length > 0) {
            await updateDoc(userRef, updates);
        }
    }

    init();
});