// js/motoboy-auth.js
import { firestore } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginForm = document.getElementById('motoboyLoginForm');
const errorElement = document.getElementById('login-error-message');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorElement.style.display = 'none';
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;

    try {
        const motoboysRef = collection(firestore, 'motoboys');
        const q = query(motoboysRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            errorElement.textContent = 'E-mail não encontrado.';
            errorElement.style.display = 'block';
            return;
        }

        let userFound = false;
        querySnapshot.forEach((doc) => {
            const motoboyData = doc.data();
            if (motoboyData.senha === senha) {
                userFound = true;
                const loggedInMotoboy = {
                    id: doc.id,
                    nome: motoboyData.nome,
                    email: motoboyData.email
                };
                sessionStorage.setItem('loggedInMotoboy', JSON.stringify(loggedInMotoboy));
                window.location.href = 'motoboy-portal.html';
            }
        });

        if (!userFound) {
            errorElement.textContent = 'Senha incorreta.';
            errorElement.style.display = 'block';
        }

    } catch (error) {
        console.error("Erro ao fazer login:", error);
        errorElement.textContent = 'Erro no servidor. Tente mais tarde.';
        errorElement.style.display = 'block';
    }
});