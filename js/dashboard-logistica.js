// js/dashboard-logistica.js
import { firestore } from './firebase-config.js';
import { doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES DO DOM ---
const form = document.getElementById('logistica-config-form');
const ambassadorReportBody = document.getElementById('motoboy-embaixador-report-body');
const motoboySelect = document.getElementById('report-motoboy-select');
const individualReportContainer = document.getElementById('motoboy-individual-report');

let allMotoboys = [];

/**
 * Carrega as configurações de logística salvas no Firestore e preenche o formulário.
 */
async function loadSettings() {
    try {
        const docRef = doc(firestore, "config", "logistica");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const settings = docSnap.data();
            
            // Módulo 1: Remuneração
            document.getElementById('base-rate').value = settings.baseRate || '';
            document.getElementById('km-rate').value = settings.kmRate || '';
            document.getElementById('daily-rate').value = settings.dailyRate || '';
            document.getElementById('tip-forwarding').value = settings.tipForwarding || '100';

            // Módulo 2: Bônus de Performance
            document.getElementById('peak-start').value = settings.peakStart || '';
            document.getElementById('peak-end').value = settings.peakEnd || '';
            document.querySelectorAll('input[name="peak-day"]').forEach(checkbox => {
                checkbox.checked = settings.peakDays?.includes(checkbox.value);
            });
            document.getElementById('peak-bonus').value = settings.peakBonus || '';
            document.getElementById('fast-delivery-threshold').value = settings.fastDeliveryThreshold || '';
            document.getElementById('fast-delivery-bonus').value = settings.fastDeliveryBonus || '';

            // Módulo 3: Embaixador
            document.getElementById('ambassador-commission').value = settings.ambassadorCommission || '';

            // Módulo 4: Seguradora
            document.getElementById('insurance-status').value = settings.insuranceStatus || 'inactive';
            document.getElementById('insurance-banner-url').value = settings.insuranceBannerUrl || '';
            document.getElementById('insurance-text').value = settings.insuranceText || '';
            document.getElementById('insurance-link').value = settings.insuranceLink || '';
        }
    } catch (error) {
        console.error("Erro ao carregar configurações de logística:", error);
        alert("Não foi possível carregar as configurações.");
    }
}

/**
 * Salva todas as configurações do formulário no Firestore.
 */
async function saveSettings(e) {
    e.preventDefault();
    const saveButton = form.querySelector('button[type="submit"]');
    saveButton.textContent = 'Salvando...';
    saveButton.disabled = true;

    const peakDays = Array.from(document.querySelectorAll('input[name="peak-day"]:checked')).map(cb => cb.value);

    const settingsData = {
        // Módulo 1
        baseRate: parseFloat(document.getElementById('base-rate').value) || 0,
        kmRate: parseFloat(document.getElementById('km-rate').value) || 0,
        dailyRate: parseFloat(document.getElementById('daily-rate').value) || 0,
        tipForwarding: document.getElementById('tip-forwarding').value,
        // Módulo 2
        peakStart: document.getElementById('peak-start').value,
        peakEnd: document.getElementById('peak-end').value,
        peakDays: peakDays,
        peakBonus: parseFloat(document.getElementById('peak-bonus').value) || 0,
        fastDeliveryThreshold: parseInt(document.getElementById('fast-delivery-threshold').value) || 0,
        fastDeliveryBonus: parseFloat(document.getElementById('fast-delivery-bonus').value) || 0,
        // Módulo 3
        ambassadorCommission: parseFloat(document.getElementById('ambassador-commission').value) || 0,
        // Módulo 4
        insuranceStatus: document.getElementById('insurance-status').value,
        insuranceBannerUrl: document.getElementById('insurance-banner-url').value,
        insuranceText: document.getElementById('insurance-text').value,
        insuranceLink: document.getElementById('insurance-link').value,
    };

    try {
        const docRef = doc(firestore, "config", "logistica");
        await setDoc(docRef, settingsData, { merge: true });
        alert("Configurações de logística salvas com sucesso!");
    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        alert("Erro ao salvar. Verifique o console.");
    } finally {
        saveButton.textContent = 'Salvar Todas as Configurações';
        saveButton.disabled = false;
    }
}

/**
 * Busca os motoboys e preenche os seletores e relatórios.
 */
async function populateMotoboyData() {
    try {
        const querySnapshot = await getDocs(collection(firestore, "motoboys"));
        allMotoboys = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Preenche o seletor de relatório individual
        motoboySelect.innerHTML = '<option value="">Selecione para ver o relatório</option>';
        allMotoboys.forEach(m => {
            const option = new Option(m.nome, m.id);
            motoboySelect.add(option);
        });

        // Preenche o relatório de embaixadores (com dados de placeholder)
        generateAmbassadorReport();

    } catch (error) {
        console.error("Erro ao buscar motoboys:", error);
    }
}

/**
 * Gera o relatório de motoboys embaixadores.
 * NOTA: Em um sistema real, a contagem de "códigos usados" seria feita no backend.
 * Aqui, usaremos um valor de placeholder.
 */
function generateAmbassadorReport() {
    ambassadorReportBody.innerHTML = '';
    const commission = parseFloat(document.getElementById('ambassador-commission').value) || 0;

    if(allMotoboys.length === 0) {
        ambassadorReportBody.innerHTML = '<tr><td colspan="3">Nenhum entregador cadastrado.</td></tr>';
        return;
    }

    allMotoboys.forEach(motoboy => {
        // DADO SIMULADO: Em produção, este valor viria de um contador no Firestore.
        const usedCodes = motoboy.usedCodesCount || 0; 
        const totalBonus = usedCodes * commission;

        const row = `
            <tr>
                <td>${motoboy.nome}</td>
                <td>${usedCodes}</td>
                <td>${totalBonus.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            </tr>
        `;
        ambassadorReportBody.innerHTML += row;
    });
}

/**
 * Gera um relatório individual detalhado para um motoboy selecionado.
 * NOTA: Esta é uma simulação de cálculo baseada nos pedidos e configurações atuais.
 */
async function generateIndividualReport(motoboyId) {
    if (!motoboyId) {
        individualReportContainer.innerHTML = '<p>Selecione um entregador para ver seu histórico detalhado.</p>';
        return;
    }

    individualReportContainer.innerHTML = '<p>Gerando relatório...</p>';
    // Lógica para buscar os pedidos do motoboy e calcular os ganhos com base nas configurações
    // ... Esta parte é complexa e depende da estrutura exata dos seus pedidos.
    // ... Para este exemplo, mostraremos uma estrutura de tabela vazia.
    individualReportContainer.innerHTML = `
        <div class="table-wrapper">
            <table class="product-table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Pedido ID</th>
                        <th>Discriminação Ganhos</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colspan="4">Dados de exemplo: Lógica de cálculo a ser implementada.</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

export function init() {
    loadSettings();
    populateMotoboyData();

    form.addEventListener('submit', saveSettings);
    motoboySelect.addEventListener('change', (e) => generateIndividualReport(e.target.value));
}