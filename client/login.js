const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function toggleAuth() {
    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

// Login Logic
document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorMsg = document.getElementById('loginError');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            // Save user and redirect
            localStorage.setItem('talksy_token', data.token); // Store Token
            localStorage.setItem('talksy_user', JSON.stringify(data.user));
            // Pre-fill session storage for home page
            const sessionProfile = JSON.parse(sessionStorage.getItem('talksy_profile') || '{}');
            sessionProfile.name = data.user.username;
            sessionStorage.setItem('talksy_profile', JSON.stringify(sessionProfile));

            window.location.href = 'index.html';
        } else {
            errorMsg.innerText = data.error;
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        console.error(err);
    }
});

// Register Logic
document.getElementById('registerBtn').addEventListener('click', async () => {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const errorMsg = document.getElementById('registerError');

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();

        if (res.ok) {
            alert('Account created! Logging in...');
            localStorage.setItem('talksy_token', data.token); // Store Token
            // You might want to auto-login here or just redirect to login form
            // For now, let's just toggle back to login or auto-login if the API returned user data too (it didn't in my server code, just token).
            // Actually, server returns { token, message }. 
            // Better flow: Just ask them to login or Auto-fetch profile.
            // Let's stick to simple:
            toggleAuth();
        } else {
            errorMsg.innerText = data.error;
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        console.error(err);
    }
});
