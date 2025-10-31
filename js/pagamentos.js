// js/pagamentos.js

import { firestore } from './firebase-config.js';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { updateCartBadge } from './main.js';

// Variáveis de controle para o Polling
let pollingInterval = null; 
const POLLING_INTERVAL_MS = 5000; // Consulta a cada 5 segundos

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
    // ATUALIZADO: paymentMadeBtn agora apenas fecha, o polling monitora
    const paymentMadeBtn = document.getElementById('payment-made-btn'); 
    const closePixModalBtn = document.getElementById('close-pix-modal-btn');
    const moneyModalOverlay = document.getElementById('money-modal-overlay');
    const moneyAmountInput = document.getElementById('money-amount');
    const confirmMoneyBtn = document.getElementById('confirm-money-payment-btn');
    const closeMoneyModalBtn = document.getElementById('close-money-modal-btn');
    const confirmationOverlay = document.getElementById('confirmation-overlay');
    const closeConfirmationBtn = document.getElementById('close-confirmation-btn');
    const confirmationModalContent = document.getElementById('confirmation-overlay').querySelector('.confirmation-body');

    // --- Seletores e lógica da notificação de erro ---
    const errorToast = document.getElementById('payment-error-toast');
    const errorTitle = document.getElementById('payment-error-title');
    const errorMessage = document.getElementById('payment-error-message');
    const errorCloseBtn = document.getElementById('payment-error-close-btn');
    
    let errorTimeout; // Variável para controlar o auto-fechamento
    
    function showPaymentError(title, message) {
        clearTimeout(errorTimeout);

        errorTitle.textContent = title;
        errorMessage.textContent = message;
        errorToast.classList.add('show');

        errorTimeout = setTimeout(() => {
            errorToast.classList.remove('show');
        }, 6000);
    }

    errorCloseBtn.addEventListener('click', () => {
        clearTimeout(errorTimeout);
        errorToast.classList.remove('show');
    });
    // --- FIM da lógica da notificação de erro ---
    
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

        // AJUSTE: closePixModalBtn agora também limpa o polling
        closePixModalBtn.addEventListener('click', () => {
            if (pollingInterval) clearInterval(pollingInterval);
            pixModalOverlay.classList.remove('visible');
        });
        
        // AJUSTE: paymentMadeBtn agora APENAS fecha o modal e notifica que o sistema está monitorando
        paymentMadeBtn.addEventListener('click', () => {
            pixModalOverlay.classList.remove('visible');
            // ATUALIZAÇÃO: Mensagem mais amigável e informativa.
            showPaymentError(
                'Aguardando Confirmação', 
                'Estamos de olho! Assim que o pagamento for confirmado, seu pedido seguirá para a cozinha. Você pode acompanhar o status na tela de "Perfil".'
            );
            // Redireciona para o perfil para que o usuário possa acompanhar.
            setTimeout(() => {
                window.location.href = 'perfil.html';
            }, 3000);
        });
        
        copyPixBtn.addEventListener('click', copyPixCode);

        closeMoneyModalBtn.addEventListener('click', () => moneyModalOverlay.classList.remove('visible'));
        moneyAmountInput.addEventListener('input', calculateChange);
        confirmMoneyBtn.addEventListener('click', () => {
             const troco = parseFloat(moneyAmountInput.value) - orderTotal;
             finalizeOrder('Dinheiro', { troco: formatCurrency(troco), valorPago: formatCurrency(moneyAmountInput.value) });
        });

        closeConfirmationBtn.addEventListener('click', () => window.location.href = 'perfil.html');
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

        // Se for Pix ou Boleto, o botão será liberado após a tentativa de criação da cobrança
        // Se for Dinheiro, ele será liberado ao mostrar o modal
        if (method !== 'MONEY') {
            mainConfirmBtn.disabled = false;
            mainConfirmBtn.textContent = 'Confirmar Pedido';
        }
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
                showPaymentError('Falha no Pagamento', `${errorMsg || 'Erro desconhecido'}. Por favor, verifique os dados e tente novamente.`);
                return;
            }
    
            currentAsaasPayment = data;
    
            if (method === 'PIX') {
                if (data && data.pixQrCode && data.pixQrCode.encodedImage) {
                    pixTotalValue.textContent = formatCurrency(data.value);
                    pixQrContainer.innerHTML = `<img src="data:image/png;base64,${data.pixQrCode.encodedImage}" alt="QR Code PIX">`;
                    pixCopyPasteInput.value = data.pixQrCode.payload;
                    pixModalOverlay.classList.add('visible');

                    // NOVO: Inicia o monitoramento via WebSocket
                    startWebSocketMonitoring(data.id); 

                } else {
                    console.error("A resposta da API para o PIX não continha os dados do QR Code. Resposta recebida:", data);
                    showPaymentError('Falha na Geração do PIX', 'Não foi possível gerar o QR Code. Tente novamente em alguns instantes.');
                }
            } else if (method.includes('CARD')) {
                // Cartão: O pagamento é imediato (CONFIRMED ou RECEBIED) ou negado
                if (data.status === 'CONFIRMED' || data.status === 'RECEIVED') {
                    // ATUALIZAÇÃO: Passa o status correto para a finalização.
                    finalizeOrder('Cartão de Crédito', {}, 'Concluído');
                } else if (data.status === 'PENDING') {
                    // Pagamentos de cartão que caem em PENDING (ex: falha de comunicação)
                    showPaymentError('Pagamento Pendente', `O pagamento está sendo processado (Status: ${data.status}).`);
                    // ATUALIZAÇÃO: Passa o status correto para a finalização.
                    finalizeOrder('Cartão (Pendente)', {}, 'Pagamento Pendente');
                } else {
                     showPaymentError('Pagamento Negado', `O pagamento foi negado pela operadora. Status: ${data.status}.`);
                }
            }
        } catch (error) {
            console.error("Erro de comunicação com o servidor:", error);
            // showPaymentError('Erro de Conexão', 'Não foi possível conectar ao servidor de pagamentos. Verifique sua rede.');
        }
    }

    function startWebSocketMonitoring(paymentId) {
        const protocol = window.location.protocol === 'https' ? 'wss' : 'ws';
        const wsUrl = `${protocol}://${window.location.host}`;
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('WebSocket conectado. Registrando para o paymentId:', paymentId);
            socket.send(JSON.stringify({ type: 'register', paymentId: paymentId }));
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'payment_status' && data.paymentId === paymentId) {
                    console.log(`Status recebido via WebSocket: ${data.status}`);
                    const paymentStatus = data.status;

                    if (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED') {
                        pixModalOverlay.classList.remove('visible');
                        finalizeOrder('PIX', {}, 'Concluído');
                        socket.close(); // Fecha a conexão após o sucesso
                    } else if (paymentStatus === 'CANCELLED' || paymentStatus === 'OVERDUE') {
                        pixModalOverlay.classList.remove('visible');
                        showPaymentError('Pagamento Falhou', 'O prazo para o pagamento expirou ou ele foi cancelado. Por favor, refaça o pedido.');
                        socket.close(); // Fecha a conexão após a falha
                    } else {
                        // Opcional: pode-se adicionar uma notificação para status PENDING aqui
                        console.log(`Status de pagamento atual: ${paymentStatus}. Aguardando confirmação...`);
                    }
                }
            } catch (error) {
                console.error("Erro ao processar mensagem do WebSocket:", error);
            }
        };

        socket.onclose = () => {
            console.log('WebSocket desconectado.');
        };

        socket.onerror = (error) => {
            console.error('Erro no WebSocket:', error);
            // Como fallback, podemos reverter para o polling ou mostrar um erro
            showPaymentError('Erro de Conexão', 'Não foi possível conectar ao serviço de notificações em tempo real. A página pode não ser atualizada automaticamente.');
        };
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

    async function finalizeOrder(paymentMethod, details = {}, status = 'Em preparo') {
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
                status: status, // Usa o status recebido como parâmetro
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
            
            await handlePostPurchaseRewards();

            if (activeModal) activeModal.classList.remove('visible');

            // ATUALIZAÇÃO: Personaliza a mensagem de sucesso
            if (status === 'Concluído') {
                confirmationModalContent.innerHTML = `
                    <h2>Pedido Confirmado!</h2>
                    <p>Uhuul! Recebemos seu pagamento e seu pedido já foi para a cozinha. Agora é só aguardar essa delícia chegar!</p>
                    <button id="close-confirmation-btn" class="btn btn-primary btn-block">Acompanhar Pedido</button>
                `;
                // Reatribui o listener ao novo botão
                document.getElementById('close-confirmation-btn').addEventListener('click', () => window.location.href = 'perfil.html');
            }

            confirmationOverlay.classList.add('visible');

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

        const referralDiscountApplied = parseFloat(sessionStorage.getItem('referralDiscountApplied')) || 0;
        if (referralDiscountApplied > 0) {
            updates.referralCredit = increment(-referralDiscountApplied);
        }

        const couponApplied = JSON.parse(sessionStorage.getItem('appliedCoupon')) || null;
        if (couponApplied) {
            const couponRef = doc(firestore, "cuponsPromocionais", couponApplied.code);
            // NÃO atualizamos o cupom aqui. Isso deve ser feito em uma transação segura ou no backend se necessário.
            // Para simplicidade, vamos pular a atualização do contador do cupom no frontend.
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

        // Aplica todas as atualizações de uma só vez
        if (Object.keys(updates).length > 0) {
            await updateDoc(userRef, updates);
        }
    }

    init();
});