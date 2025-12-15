async function loadInstitutions() {
  const res = await fetch('/api/institutions.php');
  const data = await res.json();
  const select = document.getElementById('institution');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose institution';
  select.appendChild(placeholder);
  (data.institutions || []).forEach((i) => {
    const opt = document.createElement('option');
    opt.value = i.id;
    opt.textContent = i.name;
    select.appendChild(opt);
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const institutionId = document.getElementById('institution').value;
  const payload = { identifier: form.identifier.value, password: form.password.value, institution_id: institutionId };
  const res = await fetch('/api/auth_login.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  document.getElementById('status').textContent = data.error ? data.error : 'Logged in';
  if (!data.error) window.location = '/dashboard.html';
}

document.getElementById('loginForm').addEventListener('submit', handleLogin);

document.getElementById('institution').addEventListener('change', async (e) => {
  const id = e.target.value;
  const btn = document.getElementById('googleBtn');
  btn.disabled = !id;
  if (id) {
    const res = await fetch(`/api/auth_google_url.php?institution_id=${id}`);
    const data = await res.json();
    btn.onclick = () => window.location = data.url;
  }
});

loadInstitutions();
