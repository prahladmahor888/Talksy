const enterBtn = document.getElementById('enterBtn');
const nameInput = document.getElementById('nameInput');
const cityInput = document.getElementById('cityInput');
const countryInput = document.getElementById('countryInput');
const interestsInput = document.getElementById('interestsInput');

// Check Login Status
document.addEventListener('DOMContentLoaded', () => {
    const userStr = localStorage.getItem('talksy_user');
    const navActions = document.querySelector('.nav-actions');

    if (userStr) {
        const user = JSON.parse(userStr);
        // Show Profile Button
        if (navActions) navActions.innerHTML = `<a href="profile.html" class="btn-secondary" style="text-decoration:none;">My Profile</a>`;

        // Auto-fill Entry Form
        if (user.profile) {
            if (user.profile.name) nameInput.value = user.profile.name;
            if (user.profile.city) cityInput.value = user.profile.city;
            if (user.profile.country) countryInput.value = user.profile.country;
            // Select Gender/Interest if saved
            if (user.profile.gender) {
                document.querySelectorAll('.gender-btn').forEach(btn => {
                    if (btn.dataset.value === user.profile.gender) btn.click();
                });
            }
            if (user.profile.lookingFor) {
                document.querySelectorAll('.interest-btn').forEach(btn => {
                    if (btn.dataset.value === user.profile.lookingFor) btn.click();
                });
            }
        }
    } else {
        if (navActions) navActions.innerHTML = `<a href="login.html" class="btn-secondary" style="text-decoration:none;">Login</a>`;
    }
});

let selectedGender = 'male';
// ... existing gender logic ...
let selectedInterest = 'any';

// Gender Selection Logic
document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedGender = btn.dataset.value;
    });
});

document.querySelectorAll('.interest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.interest-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedInterest = btn.dataset.value;
    });
});

// Enter Button Logic
enterBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Stranger';
    const city = cityInput.value.trim() || 'Unknown';
    const country = countryInput.value.trim() || 'Unknown';

    // Save to Session Storage
    sessionStorage.setItem('talksy_profile', JSON.stringify({ name, city, country }));
    sessionStorage.setItem('talksy_gender', selectedGender);
    sessionStorage.setItem('talksy_interest', selectedInterest);

    // Request Camera Access early (optional, but good for UX) or just redirect
    // Redirect to Connect Page
    window.location.href = '/connect.html';
});
