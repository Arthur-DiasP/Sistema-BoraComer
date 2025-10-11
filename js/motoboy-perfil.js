// js/motoboy-perfil.js
import { firestore } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const loggedInMotoboy = JSON.parse(sessionStorage.getItem('loggedInMotoboy'));
    if (!loggedInMotoboy) {
        window.location.href = '/html/motoboy-login.html';
        return;
    }

    // --- Seletores do DOM ---
    const motoboyNameEl = document.getElementById('motoboy-name');
    const logoutBtn = document.getElementById('logout-btn');
    const form = document.getElementById('profile-form');
    const nomeInput = document.getElementById('profile-nome');
    const emailInput = document.getElementById('profile-email');
    const telefoneInput = document.getElementById('profile-telefone');
    const passwordFields = document.getElementById('password-fields');
    const newPasswordInput = document.getElementById('profile-new-password');
    const confirmPasswordInput = document.getElementById('profile-confirm-password');
    const editBtn = document.getElementById('edit-profile-btn');
    const saveBtn = document.getElementById('save-profile-btn');
    const feedbackEl = document.getElementById('profile-feedback');

    motoboyNameEl.textContent = loggedInMotoboy.nome;

    /**
     * Carrega os dados do perfil do motoboy do Firestore.
     */
    async function loadProfileData() {
        try {
            const userRef = doc(firestore, "motoboys", loggedInMotoboy.id);
            const docSnap = await getDoc(userRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                nomeInput.value = data.nome || '';
                emailInput.value = data.email || '';
                telefoneInput.value = data.telefone || '';
            } else {
                showFeedback('Erro: Dados do perfil não encontrados.', 'error');
            }
        } catch (error) {
            console.error("Erro ao carregar perfil:", error);
            showFeedback('Falha ao carregar dados. Tente recarregar a página.', 'error');
        }
    }

    /**
     * Habilita o modo de edição do formulário.
     */
    function enableEditMode() {
        nomeInput.readOnly = false;
        telefoneInput.readOnly = false;
        passwordFields.style.display = 'block';
        editBtn.style.display = 'none';
        saveBtn.style.display = 'block';
        nomeInput.focus();
    }

    /**
     * Salva as alterações do perfil no Firestore.
     */
    async function handleSaveProfile(e) {
        e.preventDefault();
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword && newPassword !== confirmPassword) {
            showFeedback('As novas senhas não coincidem.', 'error');
            resetSaveButton();
            return;
        }
        if (newPassword && !/^\d{6}$/.test(newPassword)) {
            showFeedback('A senha deve conter exatamente 6 dígitos numéricos.', 'error');
            resetSaveButton();
            return;
        }

        const updateData = {
            nome: nomeInput.value.trim(),
            telefone: telefoneInput.value.trim(),
        };

        if (newPassword) {
            updateData.senha = newPassword;
        }

        try {
            const userRef = doc(firestore, "motoboys", loggedInMotoboy.id);
            await updateDoc(userRef, updateData);

            // Atualiza os dados na sessão
            loggedInMotoboy.nome = updateData.nome;
            sessionStorage.setItem('loggedInMotoboy', JSON.stringify(loggedInMotoboy));
            motoboyNameEl.textContent = updateData.nome;

            showFeedback('Perfil atualizado com sucesso!', 'success');
            disableEditMode();
        } catch (error) {
            console.error("Erro ao salvar perfil:", error);
            showFeedback('Ocorreu um erro ao salvar. Tente novamente.', 'error');
        } finally {
            resetSaveButton();
        }
    }

    function disableEditMode() {
        nomeInput.readOnly = true;
        telefoneInput.readOnly = true;
        passwordFields.style.display = 'none';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        editBtn.style.display = 'block';
        saveBtn.style.display = 'none';
    }

    function resetSaveButton() {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Alterações';
    }

    function showFeedback(message, type = 'success') {
        feedbackEl.textContent = message;
        feedbackEl.className = `feedback-message ${type}`;
        feedbackEl.style.display = 'block';
        setTimeout(() => { feedbackEl.style.display = 'none'; }, 4000);
    }

    // --- Inicialização e Event Listeners ---
    loadProfileData();
    editBtn.addEventListener('click', enableEditMode);
    form.addEventListener('submit', handleSaveProfile);
    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('loggedInMotoboy');
        window.location.href = '/html/motoboy-login.html';
    });
});