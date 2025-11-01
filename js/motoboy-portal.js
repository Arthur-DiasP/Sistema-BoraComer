// js/motoboy-portal.js
import { firestore } from './firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, orderBy, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { listenCombinedAds, renderCarousel } from './ads.js';

document.addEventListener('DOMContentLoaded', () => {
    const loggedInMotoboy = JSON.parse(sessionStorage.getItem('loggedInMotoboy'));
    if (!loggedInMotoboy) {
        window.location.href = '/html/motoboy-login.html';
        return;
    }

    // --- Seletores do DOM ---
    const motoboyNameEl = document.getElementById('motoboy-name');
    const deliveriesListEl = document.getElementById('deliveries-list');
    const logoutBtn = document.getElementById('logout-btn');
    const finalizeModal = document.getElementById('finalize-delivery-modal');
    const closeFinalizeBtn = document.getElementById('close-finalize-modal-btn');
    const modalTotalValue = document.getElementById('modal-total-value');
    const confirmFinalPaymentBtn = document.getElementById('confirm-final-payment-btn');
    const mapsModal = document.getElementById('maps-modal-overlay');
    const closeMapsBtn = document.getElementById('close-maps-modal-btn');
    const mapsAddressEl = document.getElementById('maps-modal-address');
    const googleMapsLink = document.getElementById('google-maps-link');
    const wazeLink = document.getElementById('waze-link');
    const deliveriesTodayEl = document.getElementById('deliveries-today');
    const deliveriesPendingEl = document.getElementById('deliveries-pending');
    const deliveriesCompletedTodayEl = document.getElementById('deliveries-completed-today');
    const mapContainer = document.getElementById('delivery-map-container');
    const routeMapModal = document.getElementById('route-map-modal');
    const closeRouteMapBtn = document.getElementById('close-route-map-btn');
    
    // Seletores do Histórico
    const historyAccordion = document.querySelector('.history-accordion');
    const historyHeader = document.querySelector('.history-header');
    const monthFilter = document.getElementById('month-filter');
    const historyTotalDeliveriesEl = document.getElementById('history-total-deliveries');
    const historyTotalEarningsEl = document.getElementById('history-total-earnings');
    
    // Seletores da Parceria
    const partnershipSection = document.getElementById('partnership-section');
    const partnershipLink = document.getElementById('partnership-link');
    const partnershipBanner = document.getElementById('partnership-banner');

    // Seletores do Banner de Anúncios
    const bannerContainer = document.getElementById('banner-slider-container');
    const bannerSlides = bannerContainer.querySelector('.banner-slides');
    const bannerDots = bannerContainer.querySelector('.banner-dots');
    const bannerProgressBar = bannerContainer.querySelector('.banner-progress-bar');

    // --- Estado do Módulo ---
    let currentOrderToFinalize = null;
    let allDeliveries = [];
    let map;
    let routeMap;
    let motoboyMarker;
    let routeControl = null;
    let deliveryMarkers = L.layerGroup();
    let motoboyLocation = null;
    let logisticsConfig = {}; // Armazena as configurações de logística
    let dailyChartInstance = null;
    const DELIVERY_FEE_EARNING = 5.00; // Custo fixo por entrega para o motoboy
    const PROXIMITY_THRESHOLD_METERS = 300; // 300 metros para habilitar finalização
    
    // Estado do Banner
    let bannerTimer;
    let currentBannerIndex = 0;
    const BANNER_INTERVAL = 5000; // 5 segundos

    motoboyNameEl.textContent = loggedInMotoboy.nome;

    // --- LÓGICA DE GEOLOCALIZAÇÃO E MAPA ---

    /**
     * Carrega as configurações de logística e parceria do Firestore.
     */
    async function loadLogisticsConfig() {
        try {
            const docRef = doc(firestore, "config", "logistica");
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                logisticsConfig = docSnap.data();
                
                // Exibe o banner da parceria se estiver ativo
                if (logisticsConfig.insuranceStatus === 'active' && logisticsConfig.insuranceBannerUrl) {
                    partnershipBanner.src = logisticsConfig.insuranceBannerUrl;
                    partnershipLink.href = logisticsConfig.insuranceLink || '#';
                    partnershipSection.style.display = 'block';
                }
            }
        } catch (error) {
            console.error("Erro ao carregar configurações de logística:", error);
        }
    }

    function initMap(mapId, container) {
        container.innerHTML = `<div id="${mapId}" style="height:100%; width:100%;"></div>`;
        const newMap = L.map(mapId).setView([-23.5505, -46.6333], 13); // Padrão: São Paulo
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(newMap);
        return newMap;
    }
    
    function initGeolocation() {
        if (!navigator.geolocation) {
            alert("Geolocalização não é suportada.");
            return;
        }
        navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                motoboyLocation = { lat: latitude, lon: longitude };
                
                if (!motoboyMarker) {
                    const motoboyIcon = L.divIcon({ className: 'motoboy-marker-icon', html: '<i class="material-icons">navigation</i>' });
                    motoboyMarker = L.marker([latitude, longitude], { icon: motoboyIcon }).addTo(map);
                    map.setView([latitude, longitude], 15);
                } else {
                    motoboyMarker.setLatLng([latitude, longitude]);
                }
                
                renderPendingDeliveries(); // Reordena a lista por proximidade
            },
            (error) => console.warn(`ERRO de Geolocalização: ${error.message}`),
            { enableHighAccuracy: true }
        );
        }

    // Calcula distância entre duas coordenadas (metros)
    function getDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
        const R = 6371e3; // Raio da Terra em metros
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distância em metros
    }

    function updateMapMarkers(pendingDeliveries) {
        deliveryMarkers.clearLayers();
        pendingDeliveries.forEach(order => {
            const lat = order.endereco.coordenadas?.lat || -23.5505 + (Math.random() - 0.5) * 0.1;
            const lon = order.endereco.coordenadas?.lon || -46.6333 + (Math.random() - 0.5) * 0.1;
            const marker = L.marker([lat, lon]).addTo(deliveryMarkers);
            marker.bindPopup(`<b>${order.cliente.nome}</b><br>${order.endereco.rua}, ${order.endereco.numero}`);
        });
    }

    function showRouteOnMap(order) {
        if (!motoboyLocation) {
            alert("Sua localização ainda não foi encontrada. Aguarde um momento e tente novamente.");
            return;
        }
        
        routeMapModal.classList.add('visible');
        if (!routeMap) {
            routeMap = initMap('route-map', document.getElementById('route-map'));
        }
        
        if (routeControl) {
            routeMap.removeControl(routeControl);
        }
        
        const customerCoords = [
            order.endereco.coordenadas?.lat || -23.5505,
            order.endereco.coordenadas?.lon || -46.6333
        ];

        routeControl = L.Routing.control({
            waypoints: [
                L.latLng(motoboyLocation.lat, motoboyLocation.lon),
                L.latLng(customerCoords[0], customerCoords[1])
            ],
            routeWhileDragging: false,
            show: false, // Oculta o painel de instruções
            lineOptions: {
                styles: [{ color: '#2980b9', opacity: 0.8, weight: 6 }]
            },
            createMarker: () => null // Oculta marcadores padrão
        }).addTo(routeMap);

        setTimeout(() => routeMap.invalidateSize(), 100);
    }
    
    // --- LÓGICA DE DADOS E RENDERIZAÇÃO ---

    function listenToAllDeliveries() {
        const q = query(
            collection(firestore, "pedidos"),
            where("motoboy.id", "==", loggedInMotoboy.id),
            orderBy("data", "desc")
        );
        onSnapshot(q, (snapshot) => {
            allDeliveries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateDashboardStats();
            renderPendingDeliveries();
            if (historyAccordion.classList.contains('open')) {
                updateHistoryView();
            }
        });
    }

    function updateDashboardStats() {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const deliveriesToday = allDeliveries.filter(d => d.data.toDate() >= startOfToday);
        const pendingDeliveries = allDeliveries.filter(d => d.statusEntrega === 'a_caminho');
        const completedToday = allDeliveries.filter(d => d.statusEntrega === 'entregue' && d.data.toDate() >= startOfToday);
        deliveriesTodayEl.textContent = deliveriesToday.length;
        deliveriesPendingEl.textContent = pendingDeliveries.length;
        deliveriesCompletedTodayEl.textContent = completedToday.length;
    }

    function renderPendingDeliveries() {
        let pendingDeliveries = allDeliveries.filter(d => d.statusEntrega === 'a_caminho');

        if (motoboyLocation) {
            pendingDeliveries.forEach(order => {
                const orderLat = order.endereco.coordenadas?.lat;
                const orderLon = order.endereco.coordenadas?.lon;
                order.distance = getDistance(motoboyLocation.lat, motoboyLocation.lon, orderLat, orderLon);
            });
            pendingDeliveries.sort((a, b) => a.distance - b.distance);
        }
        
        updateMapMarkers(pendingDeliveries);
        
        if (pendingDeliveries.length === 0) {
            deliveriesListEl.innerHTML = '<div class="card empty-state"><i class="material-icons">task_alt</i><p>Nenhuma entrega pendente.</p></div>';
            return;
        }

        deliveriesListEl.innerHTML = '';
        pendingDeliveries.forEach(order => {
            const card = document.createElement('div');
            card.className = 'delivery-card';
            card.dataset.orderId = order.id;

            let paymentInfo = `<span class="payment-info paid">PAGO ONLINE</span>`;
            if (['Dinheiro', 'Débito', 'Crédito'].includes(order.formaPagamento)) {
                paymentInfo = `<span class="payment-info to-collect">COBRAR R$ ${order.total.toFixed(2).replace('.', ',')}</span>`;
            }

            let changeInfo = order.troco?.valorPago ? `<div class="change-info"><i class="material-icons">request_quote</i>Levar troco para ${order.troco.valorPago}</div>` : '';
            
            let distanceInfo = '';
            if (order.distance !== undefined && order.distance !== Infinity) {
                 const distanceText = order.distance > 1000 ? `${(order.distance/1000).toFixed(1)} km` : `${Math.round(order.distance)} m`;
                 distanceInfo = `<span class="delivery-distance">~ ${distanceText} de você</span>`;
            }
            
            const isNearby = order.distance < PROXIMITY_THRESHOLD_METERS;
            let footerHtml = `
                <button class="btn btn-secondary route-btn">Ver Rota</button>
                ${isNearby 
                    ? `<button class="btn btn-primary finalize-btn">Finalizar Entrega</button>`
                    : `<div class="distance-indicator"><i class="material-icons">social_distance</i>Aproxime-se para finalizar</div>`
                }
            `;

            card.innerHTML = `
                <div class="card-header"><h4>${order.cliente.nome}</h4>${paymentInfo}</div>
                <div class="card-body">
                    <p class="address" data-address='${JSON.stringify(order.endereco)}'><i class="material-icons">place</i><span>${order.endereco.rua}, ${order.endereco.numero}</span></p>
                    ${distanceInfo}
                    ${changeInfo}
                    <div class="item-summary"><strong>Itens:</strong> ${Object.values(order.itens).map(item => `${item.quantidade}x ${item.nome}`).join(', ')}</div>
                </div>
                <div class="card-footer">${footerHtml}</div>`;
            deliveriesListEl.appendChild(card);
        });
    }
    
    // --- LÓGICA DO HISTÓRICO APRIMORADO ---
    
    function setupMonthFilter() {
        const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const now = new Date();
        monthFilter.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const month = date.getMonth();
            const year = date.getFullYear();
            const option = document.createElement('option');
            option.value = `${year}-${month}`;
            option.textContent = `${months[month]} de ${year}`;
            monthFilter.appendChild(option);
        }
        monthFilter.addEventListener('change', updateHistoryView);
    }

    function updateHistoryView() {
        const [year, month] = monthFilter.value.split('-').map(Number);
        const completedInMonth = allDeliveries.filter(d => {
            if (d.statusEntrega !== 'entregue') return false;
            const deliveryDate = d.data.toDate();
            return deliveryDate.getFullYear() === year && deliveryDate.getMonth() === month;
        });
        
        const totalDeliveries = completedInMonth.length;
        const totalEarnings = totalDeliveries * DELIVERY_FEE_EARNING;

        historyTotalDeliveriesEl.textContent = totalDeliveries;
        historyTotalEarningsEl.textContent = totalEarnings.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        renderDailyChart(completedInMonth, year, month);
    }
    
    function renderDailyChart(deliveries, year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyData = Array(daysInMonth).fill(0);
        
        deliveries.forEach(d => {
            const day = d.data.toDate().getDate();
            dailyData[day - 1]++;
        });

        const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        const ctx = document.getElementById('daily-performance-chart').getContext('2d');
        if (dailyChartInstance) {
            dailyChartInstance.destroy();
        }
        dailyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Entregas por Dia',
                    data: dailyData,
                    backgroundColor: 'rgba(255, 184, 0, 0.6)',
                    borderColor: 'rgba(255, 184, 0, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
        });
    }

    // --- FUNÇÕES DE AÇÃO E MODAIS ---
    
    function openFinalizeModal(orderId) {
        getDoc(doc(firestore, "pedidos", orderId)).then(docSnap => {
            if (docSnap.exists()) {
                const order = docSnap.data();
                currentOrderToFinalize = { id: orderId, ...order };
                modalTotalValue.textContent = `R$ ${order.total.toFixed(2).replace('.', ',')}`;
                document.querySelectorAll('input[name="final-payment-method"]').forEach(r => r.checked = false);
                confirmFinalPaymentBtn.disabled = true;
                const paymentOptions = document.getElementById('final-payment-options');
                if (order.status === 'Concluído' && !['Dinheiro', 'Débito', 'Crédito'].includes(order.formaPagamento)) {
                     paymentOptions.style.display = 'none';
                     confirmFinalPaymentBtn.disabled = false;
                     confirmFinalPaymentBtn.textContent = 'Confirmar Entrega';
                } else {
                    paymentOptions.style.display = 'grid';
                    confirmFinalPaymentBtn.textContent = 'Confirmar Recebimento';
                }
                finalizeModal.classList.add('visible');
            }
        });
    }

    /**
     * Calcula os bônus para uma entrega com base nas regras de logística.
     * @param {object} order - O objeto do pedido.
     * @returns {object} Um objeto com os valores dos bônus calculados.
     */
    function calculateBonuses(order) {
        const bonuses = { peak: 0, fast: 0 };
        const now = new Date();

        // 1. Cálculo do Bônus de Horário de Pico
        if (logisticsConfig.peakBonus > 0 && logisticsConfig.peakStart && logisticsConfig.peakEnd && logisticsConfig.peakDays?.length > 0) {
            const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
            const currentDay = dayNames[now.getDay()];
            const currentTime = now.toTimeString().slice(0, 5); // Formato "HH:mm"

            if (logisticsConfig.peakDays.includes(currentDay) && currentTime >= logisticsConfig.peakStart && currentTime <= logisticsConfig.peakEnd) {
                bonuses.peak = logisticsConfig.peakBonus;
            }
        }

        // 2. Cálculo do Bônus de Entrega Rápida
        if (logisticsConfig.fastDeliveryBonus > 0 && logisticsConfig.fastDeliveryThreshold > 0 && order.dispatchTimestamp) {
            const dispatchTime = order.dispatchTimestamp.toDate();
            const deliveryDurationMinutes = (now.getTime() - dispatchTime.getTime()) / (1000 * 60);

            if (deliveryDurationMinutes <= logisticsConfig.fastDeliveryThreshold) {
                bonuses.fast = logisticsConfig.fastDeliveryBonus;
            }
        }

        return bonuses;
    }

    async function handleFinalizeDelivery() {
        if (!currentOrderToFinalize) return;
        const selectedPaymentMethod = document.querySelector('input[name="final-payment-method"]:checked');
        const finalPaymentMethod = selectedPaymentMethod ? selectedPaymentMethod.value : currentOrderToFinalize.formaPagamento;
        confirmFinalPaymentBtn.disabled = true;
        confirmFinalPaymentBtn.textContent = 'Salvando...';

        try {
            // Calcula os bônus antes de salvar
            const calculatedBonuses = calculateBonuses(currentOrderToFinalize);
            
            // Prepara os dados para atualização no Firestore
            const updateData = {
                statusEntrega: 'entregue',
                formaPagamentoFinal: finalPaymentMethod,
                finalizationTimestamp: Timestamp.now(), // Salva o horário da finalização
                earnings: {
                    base: logisticsConfig.baseRate || 0,
                    peakBonus: calculatedBonuses.peak,
                    fastBonus: calculatedBonuses.fast,
                    // Adicionar outros ganhos aqui no futuro (ex: km, gorjeta)
                }
            };

            await updateDoc(doc(firestore, "pedidos", currentOrderToFinalize.id), {
                ...updateData
            });

            finalizeModal.classList.remove('visible');
        } catch (error) {
            console.error("Erro ao finalizar entrega:", error);
            alert("Erro ao salvar.");
        } finally {
            confirmFinalPaymentBtn.disabled = false;
            // O texto do botão é redefinido na abertura do modal
        }
    }

    function openMaps(address) {
        const addressString = `${address.rua}, ${address.numero} - ${address.bairro}, ${address.cep}`;
        const encodedAddress = encodeURIComponent(addressString);
        mapsAddressEl.textContent = addressString;
        googleMapsLink.href = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
        wazeLink.href = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
        mapsModal.classList.add('visible');
    }

    // --- LÓGICA DE NOTÍCIAS E AVISOS ---

    /**
     * Busca e renderiza os avisos para os motoboys.
     */
    function listenToNotices() {
        const noticesSection = document.getElementById('notices-section');
        const noticesList = document.getElementById('notices-list');
        
        const q = query(collection(firestore, 'avisosMotoboys'), orderBy('createdAt', 'desc'), limit(5)); // Pega os 5 mais recentes

        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                noticesSection.style.display = 'none';
                return;
            }

            noticesList.innerHTML = '';
            snapshot.forEach(doc => {
                const aviso = doc.data();
                const date = aviso.createdAt?.toDate().toLocaleDateString('pt-BR') || '';

                const card = document.createElement('div');
                card.className = 'notice-card';
                card.innerHTML = `
                    <div class="notice-header">
                        <h4>${aviso.title}</h4>
                        <time>${date}</time>
                    </div>
                    <p>${aviso.content}</p>
                `;
                noticesList.appendChild(card);
            });

            noticesSection.style.display = 'block';
        });
    }

    // --- LÓGICA DO CARROSSEL DE ANÚNCIOS ---
    // Funções de suporte ao carrossel: combinamos banners do sistema + anúncios aprovados de usuários
    function fetchBanners() {
        listenCombinedAds((ads) => {
            if (ads && ads.length > 0) {
                renderCarousel(bannerSlides, bannerDots, bannerProgressBar, ads, BANNER_INTERVAL);
                bannerContainer.style.display = 'block';
            } else {
                bannerContainer.style.display = 'none';
            }
        });
    }

    // --- INICIALIZAÇÃO E EVENT LISTENERS ---
    map = initMap('delivery-map', mapContainer);
    deliveryMarkers.addTo(map);
    initGeolocation();
    setupMonthFilter();
    loadLogisticsConfig(); // Carrega as configurações de logística
    listenToAllDeliveries(); // Inicia a escuta por entregas
    fetchBanners(); // Busca e renderiza os banners de anúncio
    listenToNotices(); // Busca e renderiza os avisos

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('loggedInMotoboy');
        window.location.href = '/html/motoboy-login.html';
    });

    historyHeader.addEventListener('click', () => {
        historyAccordion.classList.toggle('open');
        if (historyAccordion.classList.contains('open')) {
            updateHistoryView();
        }
    });

    deliveriesListEl.addEventListener('click', (e) => {
        const card = e.target.closest('.delivery-card');
        if (!card) return;
        const orderId = card.dataset.orderId;
        const order = allDeliveries.find(o => o.id === orderId);

        if (e.target.closest('.finalize-btn')) { openFinalizeModal(orderId); }
        if (e.target.closest('.address')) { openMaps(order.endereco); }
        if (e.target.closest('.route-btn')) { showRouteOnMap(order); }
    });

    closeFinalizeBtn.addEventListener('click', () => finalizeModal.classList.remove('visible'));
    closeMapsBtn.addEventListener('click', () => mapsModal.classList.remove('visible'));
    closeRouteMapBtn.addEventListener('click', () => routeMapModal.classList.remove('visible'));
    
    document.getElementById('final-payment-options').addEventListener('change', () => { confirmFinalPaymentBtn.disabled = false; });
    confirmFinalPaymentBtn.addEventListener('click', handleFinalizeDelivery);
});