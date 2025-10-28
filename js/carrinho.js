// js/carrinho.js
import { firestore, database } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { updateCartBadge } from './main.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Seletores do DOM ---
    const cartItemsContainer = document.getElementById('cart-items');
    const subtotalEl = document.getElementById('subtotal');
    const deliveryFeeEl = document.getElementById('delivery-fee');
    const serviceFeeEl = document.getElementById('service-fee');
    const grandTotalEl = document.getElementById('grand-total');
    const checkoutButton = document.getElementById('checkout-button');
    const cepInput = document.getElementById('cep-input');
    const ruaInput = document.getElementById('rua-input');
    const numeroInput = document.getElementById('numero-input');
    const bairroInput = document.getElementById('bairro-input');
    const complementoInput = document.getElementById('complemento-input');
    const saveAddressCheckbox = document.getElementById('save-address-checkbox');
    const deliveryInfoBox = document.getElementById('delivery-info');
    const couponInput = document.getElementById('coupon-code-input');
    const applyCouponBtn = document.getElementById('apply-coupon-btn');
    const couponFeedbackEl = document.getElementById('coupon-feedback');
    const appliedCouponRow = document.getElementById('applied-coupon-row');
    const couponCodeDisplay = document.getElementById('coupon-code-display');
    const discountAmountEl = document.getElementById('discount-amount');
    const removeCouponBtn = document.getElementById('remove-coupon-btn');
    // NOVO: Seletores para o desconto de indicação
    const referralDiscountRow = document.getElementById('referral-discount-row');
    const referralDiscountAmountEl = document.getElementById('referral-discount-amount');

    // --- Estado do Módulo ---
    let cart = JSON.parse(localStorage.getItem('pizzariaCart')) || {};
    let pizzeriaLocation = null;
    let deliverySettings = {};
    let appliedCoupon = JSON.parse(sessionStorage.getItem('appliedCoupon')) || null;
    let loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser')) || null;

    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    async function init() {
        await fetchDeliverySettings();
        renderCartItems();
        setupEventListeners();
        if (loggedInUser && loggedInUser.id) {
            loadUserAddress();
        }
        if (appliedCoupon) {
            validateAndApplyCoupon(appliedCoupon.code, true);
        }
    }

    async function fetchDeliverySettings() {
        try {
            const settingsRef = ref(database, 'config/delivery');
            onValue(settingsRef, (snapshot) => {
                if (snapshot.exists()) {
                    deliverySettings = snapshot.val();
                    pizzeriaLocation = deliverySettings.pizzeriaLocation;
                    updateCartSummary();
                }
            });
        } catch (error) {
            console.error("Erro ao buscar configurações de entrega:", error);
        }
    }

    function renderCartItems() {
        cartItemsContainer.innerHTML = '';
        if (Object.keys(cart).length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="empty-cart-message-container">
                    <i class="material-icons">shopping_cart_off</i>
                    <p>Seu carrinho está vazio.</p>
                    <div class="empty-cart-actions">
                        <a href="cardapio.html" class="btn btn-primary">Ver Cardápio</a>
                    </div>
                </div>
            `;
            document.querySelector('.address-section').style.display = 'none';
            document.querySelector('.cart-summary').style.display = 'none';
            return;
        }

        for (const key in cart) {
            const item = cart[key];
            const itemCard = document.createElement('div');
            itemCard.className = 'cart-item-card';
            itemCard.innerHTML = `
                <img src="${item.img || '/img/LOGO-BORACOMER-(fdcheddar).png'}" alt="${item.nome}" class="cart-item-image">
                <div class="cart-item-details">
                    <h3>${item.nome}</h3>
                    <p class="cart-item-price">${formatCurrency(item.preco)}</p>
                    <div class="cart-item-quantity-controls">
                        <button class="quantity-btn decrease-btn" data-key="${key}" ${item.quantidade <= 1 ? 'disabled' : ''}>-</button>
                        <span>${item.quantidade}</span>
                        <button class="quantity-btn increase-btn" data-key="${key}">+</button>
                    </div>
                </div>
                <button class="remove-item-btn" data-key="${key}" title="Remover item">
                    <i class="material-icons">delete</i>
                </button>
            `;
            cartItemsContainer.appendChild(itemCard);
        }
        updateCartSummary();
    }

    function updateCartSummary() {
        let subtotal = 0;
        for (const key in cart) {
            subtotal += cart[key].preco * cart[key].quantidade;
        }

        // 1. Define taxas e valores iniciais
        const serviceFee = 1.00;
        let deliveryFee = parseFloat(deliveryFeeEl.textContent.replace('R$', '').replace(',', '.')) || 0;

        // 2. Aplica descontos
        let couponDiscount = 0;
        if (appliedCoupon) {
            if (appliedCoupon.type === 'free_shipping') {
                deliveryFee = 0; // Zera a taxa de entrega
            } else { // 'percentage'
                couponDiscount = subtotal * (appliedCoupon.discount / 100);
            }
        }

        let referralDiscount = 0;
        if (loggedInUser && loggedInUser.referralCredit > 0) {
            // O desconto não pode ser maior que o valor restante após o cupom
            const valueAfterCoupon = Math.max(0, subtotal - couponDiscount);
            referralDiscount = Math.min(valueAfterCoupon, loggedInUser.referralCredit); // Aplica sobre o subtotal restante
        }

        // 3. Calcula o total final
        const grandTotal = (subtotal + serviceFee + deliveryFee) - couponDiscount - referralDiscount;

        // 4. Atualiza a interface do usuário (UI)
        subtotalEl.textContent = formatCurrency(subtotal);
        serviceFeeEl.textContent = formatCurrency(serviceFee);
        deliveryFeeEl.textContent = formatCurrency(deliveryFee); // Atualiza a taxa de entrega na UI
        if (referralDiscount > 0) {
            referralDiscountRow.style.display = 'flex';
            referralDiscountAmountEl.textContent = `- ${formatCurrency(referralDiscount)}`;
        } else {
            referralDiscountRow.style.display = 'none';
        }
        grandTotalEl.textContent = formatCurrency(grandTotal > 0 ? grandTotal : 0);

        // Salva o desconto de indicação aplicado para usar na página de pagamento
        sessionStorage.setItem('referralDiscountApplied', referralDiscount);

        updateCheckoutButtonState();
    }

    function updateCheckoutButtonState() {
        const isAddressValid = cepInput.value && ruaInput.value && numeroInput.value && bairroInput.value;
        const hasItems = Object.keys(cart).length > 0;
        checkoutButton.disabled = !isAddressValid || !hasItems;
        checkoutButton.title = checkoutButton.disabled ? "Preencha o endereço e adicione itens para continuar." : "Prosseguir para o pagamento";
    }

    function handleQuantityChange(key, change) {
        if (cart[key]) {
            cart[key].quantidade += change;
            if (cart[key].quantidade <= 0) {
                delete cart[key];
            }
            saveCartAndRender();
        }
    }

    function removeItem(key) {
        if (cart[key]) {
            delete cart[key];
            saveCartAndRender();
        }
    }

    function saveCartAndRender() {
        localStorage.setItem('pizzariaCart', JSON.stringify(cart));
        updateCartBadge();
        renderCartItems();
    }

    async function handleCepInput() {
        const cep = cepInput.value.replace(/\D/g, '');
        if (cep.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    ruaInput.value = data.logradouro;
                    bairroInput.value = data.bairro;
                    numeroInput.focus();
                    calculateDeliveryFee(data.cep);
                } else {
                    alert("CEP não encontrado.");
                }
            } catch (error) {
                console.error("Erro ao buscar CEP:", error);
            }
        }
        updateCheckoutButtonState();
    }

    async function calculateDeliveryFee(cep) {
        if (!pizzeriaLocation) {
            console.warn("Localização da pizzaria não definida.");
            return;
        }
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${cep}&format=json&limit=1`);
            const data = await response.json();
            if (data.length > 0) {
                const clientLocation = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
                const distance = getDistance(pizzeriaLocation, clientLocation);
                
                let fee = deliverySettings.standardFee || 0;
                if (distance <= (deliverySettings.freeDistanceMeters || 0)) {
                    fee = 0;
                }

                deliveryFeeEl.textContent = formatCurrency(fee);
                deliveryInfoBox.innerHTML = `Distância: <strong>${(distance / 1000).toFixed(1)} km</strong>. Taxa de entrega: <strong>${formatCurrency(fee)}</strong>`;
                deliveryInfoBox.style.display = 'block';
            } else {
                deliveryInfoBox.textContent = 'Não foi possível calcular a distância para este CEP.';
                deliveryInfoBox.style.display = 'block';
            }
        } catch (error) {
            console.error("Erro ao calcular distância:", error);
        }
        updateCartSummary();
    }

    function getDistance(loc1, loc2) {
        const R = 6371e3;
        const φ1 = loc1.lat * Math.PI / 180;
        const φ2 = loc2.lat * Math.PI / 180;
        const Δφ = (loc2.lat - loc1.lat) * Math.PI / 180;
        const Δλ = (loc2.lon - loc1.lon) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async function loadUserAddress() {
        try {
            const userRef = doc(firestore, "users", loggedInUser.id);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists() && userSnap.data().address) {
                const addr = userSnap.data().address;
                cepInput.value = addr.cep;
                ruaInput.value = addr.rua;
                numeroInput.value = addr.numero;
                bairroInput.value = addr.bairro;
                complementoInput.value = addr.complemento || '';
                await calculateDeliveryFee(addr.cep);
            }
        } catch (error) {
            console.error("Erro ao carregar endereço do usuário:", error);
        }
    }

    async function saveAddressIfChecked() {
        if (saveAddressCheckbox.checked && loggedInUser && loggedInUser.id) {
            const addressData = {
                cep: cepInput.value,
                rua: ruaInput.value,
                numero: numeroInput.value,
                bairro: bairroInput.value,
                complemento: complementoInput.value,
            };
            try {
                const userRef = doc(firestore, "users", loggedInUser.id);
                await updateDoc(userRef, { address: addressData });
            } catch (error) {
                console.error("Erro ao salvar endereço:", error);
            }
        }
    }

    async function validateAndApplyCoupon(code, isFromSession = false) {
        if (!code) return;
        try {
            const couponRef = doc(firestore, "cuponsPromocionais", code.toUpperCase());
            const couponSnap = await getDoc(couponRef);

            if (couponSnap.exists()) {
                const coupon = couponSnap.data();
                const now = new Date();
                const expirationDate = coupon.expiration.toDate();
                const usageLimit = coupon.limiteUsos || 0;
                const timesUsed = coupon.vezesUsado || 0;

                if (coupon.active && now <= expirationDate) {
                    if (usageLimit > 0 && timesUsed >= usageLimit) {
                        showCouponFeedback('Este cupom atingiu o limite de usos.', 'error');
                        return;
                    }

                    appliedCoupon = { 
                        code: couponSnap.id, 
                        discount: coupon.desconto || 0,
                        type: coupon.type || 'percentage'
                    };
                    sessionStorage.setItem('appliedCoupon', JSON.stringify(appliedCoupon));
                    showCouponUI(true);
                    if (!isFromSession) showCouponFeedback('Cupom aplicado com sucesso!', 'success');
                } else {
                    showCouponFeedback('Este cupom está expirado ou inativo.', 'error');
                }
            } else {
                showCouponFeedback('Cupom inválido.', 'error');
            }
        } catch (error) {
            console.error("Erro ao validar cupom:", error);
            showCouponFeedback('Erro ao consultar o cupom.', 'error');
        }
        updateCartSummary();
    }

    function showCouponUI(isApplied) {
        if (isApplied) {
            couponInput.disabled = true;
            applyCouponBtn.style.display = 'none';
            appliedCouponRow.style.display = 'flex';
            couponCodeDisplay.textContent = appliedCoupon.code;
            
            if (appliedCoupon.type === 'free_shipping') {
                discountAmountEl.textContent = 'Frete Grátis';
            } else {
                let subtotal = 0;
                for (const key in cart) { subtotal += cart[key].preco * cart[key].quantidade; }
                const discountValue = subtotal * (appliedCoupon.discount / 100);
                discountAmountEl.textContent = `- ${formatCurrency(discountValue)}`;
            }
        } else {
            couponInput.disabled = false;
            couponInput.value = '';
            applyCouponBtn.style.display = 'block';
            appliedCouponRow.style.display = 'none';
            sessionStorage.removeItem('appliedCoupon');
            appliedCoupon = null;
        }
    }

    function showCouponFeedback(message, type) {
        couponFeedbackEl.textContent = message;
        couponFeedbackEl.className = `coupon-feedback-message ${type}`;
        couponFeedbackEl.style.display = 'flex';
        setTimeout(() => { couponFeedbackEl.style.display = 'none'; }, 3000);
    }

    function setupEventListeners() {
        cartItemsContainer.addEventListener('click', (e) => {
            const key = e.target.dataset.key;
            if (e.target.classList.contains('increase-btn')) {
                handleQuantityChange(key, 1);
            } else if (e.target.classList.contains('decrease-btn')) {
                handleQuantityChange(key, -1);
            } else if (e.target.closest('.remove-item-btn')) {
                removeItem(e.target.closest('.remove-item-btn').dataset.key);
            }
        });

        cepInput.addEventListener('input', () => {
            let value = cepInput.value.replace(/\D/g, '');
            value = value.replace(/^(\d{5})(\d)/, '$1-$2');
            cepInput.value = value;
        });
        cepInput.addEventListener('blur', handleCepInput);
        [ruaInput, numeroInput, bairroInput].forEach(input => input.addEventListener('input', updateCheckoutButtonState));

        checkoutButton.addEventListener('click', async () => {
            await saveAddressIfChecked();
            const addressData = {
                cep: cepInput.value,
                rua: ruaInput.value,
                numero: numeroInput.value,
                bairro: bairroInput.value,
                complemento: complementoInput.value,
            };
            sessionStorage.setItem('pizzariaOrderAddress', JSON.stringify(addressData));
            sessionStorage.setItem('pizzariaOrderTotal', grandTotalEl.textContent.replace('R$', '').replace(',', '.'));
            window.location.href = 'pagamentos.html';
        });

        applyCouponBtn.addEventListener('click', () => validateAndApplyCoupon(couponInput.value));
        removeCouponBtn.addEventListener('click', () => {
            showCouponUI(false);
            updateCartSummary();
        });
    }

    init();
});