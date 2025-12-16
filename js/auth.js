// js/auth.js
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://gahqkeccvlakxbahxjad.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert("Login inválido: " + error.message);
    window.location.href = "escolas.html";
  });
}

// Cadastro
const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return alert("Erro no cadastro: " + error.message);
    alert("Cadastro realizado! Verifique seu e-mail se necessário.");
    window.location.href = "index.html";
  });
}
