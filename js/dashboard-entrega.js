// js/dashboard-entrega.js

import { database } from './firebase-config.js';
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- SELETORES DO DOM ---
const deliverySettingsForm = document.getElementById('delivery-settings-form');
const pizzeriaAddressForm = document.getElementById('pizzeria-address-form');
const geocodeStatus = document.getElementById('geocode-status');

/**
 * Converte um endereço físico em coordenadas geográficas (latitude e longitude)
 * usando a API gratuita do OpenStreetMap (Nominatim).
 * @param {string} rua - O nome da rua.
 * @param {string} numero - O número do estabelecimento.
 * @param {string} cep - O CEP do endereço.
 * @returns {Promise<{lat: number, lon: number}>} As coordenadas do endereço.
 */
const geocodeAddress = async (rua, numero, cep) => {
    // Monta a consulta de busca para a API
    const query = `${numero} ${rua}, ${cep}, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Falha na resposta da rede de geolocalização');
        
        const data = await response.json();
        // Verifica se a API retornou algum resultado
        if (data && data.length > 0) {
            // Retorna a latitude e longitude do primeiro resultado encontrado
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        } else {
            throw new Error('Endereço não encontrado ou inválido.');
        }
    } catch (error) {
        console.error('Erro de geocodificação:', error);
        throw error; // Propaga o erro para ser tratado na chamada da função
    }
};

/**
 * Carrega as configurações de entrega já salvas no Firebase e preenche os campos do formulário.
 */
const loadSettings = async () => {
    const configRef = ref(database, 'configuracoes/entrega');
    try {
        const snapshot = await get(configRef);
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Preenche os campos de configurações
            document.getElementById('delivery-fee').value = data.taxa || '';
            document.getElementById('free-delivery-distance').value = data.distanciaLimiteMetros || '';
            
            // Preenche os campos de endereço
            document.getElementById('pizzeria-cep').value = data.endereco?.cep || '';
            document.getElementById('pizzeria-rua').value = data.endereco?.rua || '';
            document.getElementById('pizzeria-numero').value = data.endereco?.numero || '';
            
            // Exibe um status se as coordenadas já estiverem salvas
            if (data.coordenadas) {
                 geocodeStatus.textContent = 'Endereço geolocalizado com sucesso.';
                 geocodeStatus.className = 'geocode-status-message success';
            }
        }
    } catch (error) {
        console.error("Erro ao carregar configurações:", error);
    }
};

/**
 * Função de inicialização do módulo, exportada para ser chamada pelo dashboard.js.
 */
export function init() {
    // Event listener para salvar as configurações de taxa e distância
    deliverySettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button');
        button.textContent = 'Salvando...';
        
        const settingsData = {
            taxa: parseFloat(document.getElementById('delivery-fee').value),
            distanciaLimiteMetros: parseInt(document.getElementById('free-delivery-distance').value)
        };
        
        try {
            // Usa 'update' para não apagar outros dados existentes em 'entrega'
            await update(ref(database, 'configuracoes/entrega'), settingsData);
            alert('Configurações salvas com sucesso!');
        } catch (error) {
            alert('Erro ao salvar configurações.');
            console.error(error);
        } finally {
            button.textContent = 'Salvar Configurações';
        }
    });

    // Event listener para salvar o endereço da pizzaria e buscar as coordenadas
    pizzeriaAddressForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button');
        button.textContent = 'Salvando...';
        geocodeStatus.textContent = 'Buscando coordenadas...';
        geocodeStatus.className = 'geocode-status-message loading';

        const cep = document.getElementById('pizzeria-cep').value;
        const rua = document.getElementById('pizzeria-rua').value;
        const numero = document.getElementById('pizzeria-numero').value;
        
        try {
            // Chama a função de geocodificação
            const coordinates = await geocodeAddress(rua, numero, cep);
            
            const addressData = {
                endereco: { cep, rua, numero },
                coordenadas: coordinates
            };
            
            // Salva tanto o endereço quanto as coordenadas no Firebase
            await update(ref(database, 'configuracoes/entrega'), addressData);
            geocodeStatus.textContent = 'Endereço e coordenadas salvos!';
            geocodeStatus.className = 'geocode-status-message success';
            alert('Endereço da pizzaria salvo com sucesso!');
        } catch (error) {
            // Exibe o erro para o administrador
            geocodeStatus.textContent = `Erro: ${error.message}`;
            geocodeStatus.className = 'geocode-status-message error';
            alert('Não foi possível encontrar as coordenadas para este endereço. Verifique os dados e tente novamente.');
        } finally {
            button.textContent = 'Salvar Endereço';
        }
    });

    // Carrega os dados existentes assim que a seção é aberta
    loadSettings();
}