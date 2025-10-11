// js/redefinir-senha.js

import { firestore } from './firebase-config.js';
import { collection, getDocs, query, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const mainTitle = document.getElementById('main-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const requestIdentifierForm = document.getElementById('requestIdentifierForm');
    const verifyDetailsForm = document.getElementById('verifyDetailsForm');
    const updatePasswordForm = document.getElementById('updatePasswordForm');
    const finalSuccessMessage = document.getElementById('final-success-message');
    
    const emailInputContainer = document.getElementById('email-input-container');
    const cpfInputContainer = document.getElementById('cpf-input-container');
    const emailInput = document.getElementById('email');
    const cpfInput = document.getElementById('cpf');
    const recoveryMethodRadios = document.querySelectorAll('input[name="recoveryMethod"]');

    let resetState = {
        userId: null,
        userData: null
    };

    const showError = (formId, message) => {
        const errorElement = document.getElementById(`${formId}-error-message`);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    };

    recoveryMethodRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'email') {
                emailInputContainer.style.display = 'block';
                cpfInputContainer.style.display = 'none';
            } else { // Se o valor for 'cpf'
                emailInputContainer.style.display = 'none';
                cpfInputContainer.style.display = 'block';
            }
        });
    });

    // Adiciona máscara de CPF
    cpfInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        value = value.slice(0, 11);
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
        value = value.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        e.target.value = value;
    });

    requestIdentifierForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = requestIdentifierForm.querySelector('button[type="submit"]');
        document.getElementById('request-error-message').style.display = 'none';

        const selectedMethod = document.querySelector('input[name="recoveryMethod"]:checked').value;
        let identifier;
        
        // =========================================================================
        //  INÍCIO DA CORREÇÃO: Usar o CPF com a máscara na busca
        // =========================================================================
        if (selectedMethod === 'email') {
            identifier = emailInput.value.trim();
        } else { // Se for CPF
            // Pega o valor diretamente do campo, COM A MÁSCARA, para que a busca
            // corresponda ao formato salvo no banco de dados.
            identifier = cpfInput.value; // <-- CORREÇÃO APLICADA AQUI
        }
        // =========================================================================
        //  FIM DA CORREÇÃO
        // =========================================================================

        if (!identifier) {
            showError('request', 'Por favor, preencha o campo.');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Verificando...';

        try {
            const usersRef = collection(firestore, 'users');
            let q;

            if (selectedMethod === 'email') {
                q = query(usersRef, where("email", "==", identifier));
            } else { // Busca por CPF
                q = query(usersRef, where("cpf", "==", identifier));
            }

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                showError('request', 'Nenhuma conta encontrada com este identificador.');
                return;
            }

            const userDoc = querySnapshot.docs[0];
            resetState = {
                userId: userDoc.id,
                userData: userDoc.data()
            };

            requestIdentifierForm.style.display = 'none';
            formSubtitle.textContent = 'Para sua segurança, confirme seus dados.';
            verifyDetailsForm.style.display = 'block';

        } catch (error) {
            console.error("Erro na Etapa 1:", error);
            showError('request', 'Ocorreu um erro no servidor. Tente novamente.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Verificar';
        }
    });

    verifyDetailsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fullNameInput = document.getElementById('fullName');
        const birthDateInput = document.getElementById('birthDate');
        document.getElementById('verify-error-message').style.display = 'none';

        const enteredName = fullNameInput.value.trim().toLowerCase();
        const enteredDob = birthDateInput.value;

        const storedName = resetState.userData.nome.trim().toLowerCase();
        const storedDob = resetState.userData.dataNascimento;

        if (enteredName === storedName && enteredDob === storedDob) {
            verifyDetailsForm.style.display = 'none';
            formSubtitle.textContent = 'Agora, crie sua nova senha.';
            updatePasswordForm.style.display = 'block';
        } else {
            showError('verify', 'Os dados não conferem com nosso registro. Tente novamente.');
        }
    });

    updatePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPasswordInput = document.getElementById('new-password');
        const confirmPasswordInput = document.getElementById('confirm-password');
        const submitButton = updatePasswordForm.querySelector('button[type="submit"]');
        document.getElementById('update-error-message').style.display = 'none';

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!/^\d{6}$/.test(newPassword)) {
            showError('update', 'A nova senha deve ter exatamente 6 dígitos numéricos.');
            return;
        }
        if (newPassword !== confirmPassword) {
            showError('update', 'As senhas não coincidem.');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Atualizando...';

        try {
            const userRef = doc(firestore, 'users', resetState.userId);
            await updateDoc(userRef, {
                senha: newPassword
            });

            mainTitle.textContent = "Sucesso!";
            formSubtitle.style.display = 'none';
            updatePasswordForm.style.display = 'none';
            finalSuccessMessage.textContent = 'Sua senha foi redefinida com sucesso! Você já pode fazer login com a nova senha.';
            finalSuccessMessage.style.display = 'block';

        } catch (error) {
            console.error("Erro ao atualizar senha:", error);
            showError('update', 'Não foi possível atualizar sua senha. Tente novamente.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Redefinir Senha';
        }
    });
});