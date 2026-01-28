// Check if logged in
const userStr = localStorage.getItem('talksy_user');
if (!userStr) {
    window.location.href = 'login.html';
}

const user = JSON.parse(userStr);
const messageBox = document.getElementById('profileMessage');

// Load initial data
document.getElementById('profEmail').value = user.email;
if (user.profile) {
    document.getElementById('profName').value = user.profile.name || '';
    document.getElementById('profCity').value = user.profile.city || '';
    document.getElementById('profCountry').value = user.profile.country || '';
    document.getElementById('profGender').value = user.profile.gender || 'male';
    document.getElementById('profLooking').value = user.profile.lookingFor || 'any';
}

const token = localStorage.getItem('talksy_token');

// Save Profile
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const updates = {
        name: document.getElementById('profName').value,
        city: document.getElementById('profCity').value,
        country: document.getElementById('profCountry').value,
        gender: document.getElementById('profGender').value,
        lookingFor: document.getElementById('profLooking').value
    };

    try {
        const res = await fetch('/api/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(updates)
        });
        const data = await res.json();

        if (res.ok) {
            messageBox.style.display = 'block';
            messageBox.innerText = 'Profile Updated Successfully';

            // Update local storage
            user.profile = data.profile;
            localStorage.setItem('talksy_user', JSON.stringify(user));

            // Update session storage for immediate use
            const sessionProfile = {
                name: updates.name,
                city: updates.city,
                country: updates.country,
                gender: updates.gender,
                lookingFor: updates.lookingFor
            };
            sessionStorage.setItem('talksy_profile', JSON.stringify(sessionProfile));

            setTimeout(() => { messageBox.style.display = 'none'; }, 3000);
        } else {
            alert('Error updating profile');
        }
    } catch (err) {
        console.error(err);
        alert('Server connection failed');
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('talksy_user');
    localStorage.removeItem('talksy_token');
    window.location.href = 'index.html';
});
