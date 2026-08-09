/**
 * PrivChat Admin Control Center Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const state = {
    adminToken: sessionStorage.getItem('privchat_admin_token') || '',
    isPrivateServer: false,
  };

  // DOM Elements
  const serverModeBadge = document.getElementById('server-mode-badge');
  const btnAdminLogout = document.getElementById('btn-admin-logout');

  const cardAdminLogin = document.getElementById('card-admin-login');
  const cardAdminDashboard = document.getElementById('card-admin-dashboard');

  const inputAdminKey = document.getElementById('input-admin-key');
  const btnToggleAdminKey = document.getElementById('btn-toggle-admin-key');
  const btnAdminLogin = document.getElementById('btn-admin-login');
  const adminLoginError = document.getElementById('admin-login-error');

  const metricTotal = document.getElementById('metric-total');
  const metricActive = document.getElementById('metric-active');
  const metricRevoked = document.getElementById('metric-revoked');
  const metricForever = document.getElementById('metric-forever');

  const selectTokenType = document.getElementById('select-token-type');
  const inputCustomToken = document.getElementById('input-custom-token');
  const btnCreateToken = document.getElementById('btn-create-token');
  const btnRefreshTokens = document.getElementById('btn-refresh-tokens');

  const tokenTableBody = document.getElementById('token-table-body');
  const toastContainer = document.getElementById('toast-container');

  // Custom Modal Elements
  const modalAdminConfirm = document.getElementById('modal-admin-confirm');
  const adminConfirmTitle = document.getElementById('admin-confirm-title');
  const adminConfirmMessage = document.getElementById('admin-confirm-message');
  const btnAdminConfirmCancel = document.getElementById('btn-admin-confirm-cancel');
  const btnAdminConfirmOk = document.getElementById('btn-admin-confirm-ok');

  let isKeyVisible = false;

  init();

  async function init() {
    setupEventListeners();
    await checkServerConfig();

    if (state.adminToken) {
      const success = await loadTokens();
      if (success) {
        showDashboard();
      } else {
        showLogin();
      }
    } else {
      showLogin();
    }
  }

  async function checkServerConfig() {
    try {
      const res = await fetch('/api/admin/config');
      const data = await res.json();
      state.isPrivateServer = data.isPrivateServer;

      if (data.isPrivateServer) {
        serverModeBadge.className = 'badge owner-badge';
        serverModeBadge.innerHTML = '<i class="fa-solid fa-user-lock"></i> PRIVATE SERVER';
      } else {
        serverModeBadge.className = 'badge member-badge';
        serverModeBadge.innerHTML = '<i class="fa-solid fa-globe"></i> PUBLIC SERVER';
      }
    } catch (err) {
      console.error('Error fetching server config:', err);
      serverModeBadge.className = 'badge badge-revoked';
      serverModeBadge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> SERVER OFFLINE';
    }
  }

  function showLogin() {
    cardAdminLogin.classList.remove('hidden');
    cardAdminDashboard.classList.add('hidden');
    btnAdminLogout.classList.add('hidden');
  }

  function showDashboard() {
    cardAdminLogin.classList.add('hidden');
    cardAdminDashboard.classList.remove('hidden');
    btnAdminLogout.classList.remove('hidden');
  }

  function showToast(message, type = 'info') {
    const iconMap = {
      info: 'fa-solid fa-info-circle',
      alert: 'fa-solid fa-circle-exclamation',
      success: 'fa-solid fa-circle-check',
    };

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `
      <i class="${iconMap[type] || iconMap.info} toast-icon"></i>
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
  }

  function showConfirmModal(title, message) {
    return new Promise((resolve) => {
      adminConfirmTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${title}`;
      adminConfirmMessage.textContent = message;
      modalAdminConfirm.classList.remove('hidden');

      function cleanup() {
        btnAdminConfirmOk.removeEventListener('click', onOk);
        btnAdminConfirmCancel.removeEventListener('click', onCancel);
        modalAdminConfirm.classList.add('hidden');
      }

      function onOk() {
        cleanup();
        resolve(true);
      }

      function onCancel() {
        cleanup();
        resolve(false);
      }

      btnAdminConfirmOk.addEventListener('click', onOk);
      btnAdminConfirmCancel.addEventListener('click', onCancel);
    });
  }

  function setupEventListeners() {
    btnToggleAdminKey.addEventListener('click', () => {
      isKeyVisible = !isKeyVisible;
      inputAdminKey.type = isKeyVisible ? 'text' : 'password';
      btnToggleAdminKey.innerHTML = isKeyVisible ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });

    btnAdminLogin.addEventListener('click', () => handleLogin());
    inputAdminKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    btnAdminLogout.addEventListener('click', () => {
      state.adminToken = '';
      sessionStorage.removeItem('privchat_admin_token');
      showToast('Logged out of admin panel.', 'info');
      showLogin();
    });

    btnCreateToken.addEventListener('click', () => handleCreateToken());
    btnRefreshTokens.addEventListener('click', () => {
      loadTokens();
      showToast('Refreshed token list.', 'info');
    });
  }

  async function handleLogin() {
    adminLoginError.classList.add('hidden');
    const key = inputAdminKey.value.trim();

    if (!key) {
      showLoginError('Please enter your 32+ character PRIVATE_SERVER_KEY.');
      return;
    }

    if (key.length < 32) {
      showLoginError('Key must be at least 32 characters long.');
      return;
    }

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: key }),
      });

      const data = await res.json();

      if (!res.ok) {
        showLoginError(data.error || 'Authentication failed.');
        return;
      }

      state.adminToken = data.token || key;
      sessionStorage.setItem('privchat_admin_token', state.adminToken);

      showToast('Admin authentication successful!', 'success');
      await loadTokens();
      showDashboard();
    } catch (err) {
      console.error('Login error:', err);
      showLoginError('Unable to connect to admin server.');
    }
  }

  function showLoginError(msg) {
    adminLoginError.textContent = msg;
    adminLoginError.classList.remove('hidden');
  }

  async function loadTokens() {
    try {
      const res = await fetch('/api/admin/tokens', {
        headers: {
          Authorization: `Bearer ${state.adminToken}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to fetch tokens.', 'alert');
        return false;
      }

      renderTokenTable(data.tokens || []);
      return true;
    } catch (err) {
      console.error('Error loading tokens:', err);
      showToast('Failed to load server tokens.', 'alert');
      return false;
    }
  }

  function renderTokenTable(tokens) {
    let activeCount = 0;
    let revokedCount = 0;
    let foreverCount = 0;

    if (tokens.length === 0) {
      tokenTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="color: var(--text-muted); padding: 2rem;">
            No server tokens generated yet. Click "Generate Server Token" above to create your first invite token!
          </td>
        </tr>
      `;
    } else {
      tokenTableBody.innerHTML = '';

      tokens.forEach((t) => {
        if (t.type === 'forever') foreverCount++;
        if (t.isRevoked) {
          revokedCount++;
        } else if (t.type === 'one_time' && t.usedCount >= 1) {
          // Consumed
        } else {
          activeCount++;
        }

        const tr = document.createElement('tr');

        const dateStr = new Date(t.createdAt).toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        // Type Badge
        const typeBadge = t.type === 'forever'
          ? `<span class="badge badge-forever"><i class="fa-solid fa-infinity"></i> Forever</span>`
          : `<span class="badge badge-one-time"><i class="fa-solid fa-1"></i> 1-Time</span>`;

        // Status Badge
        let statusBadge = '';
        if (t.isRevoked) {
          statusBadge = `<span class="badge badge-revoked"><i class="fa-solid fa-ban"></i> Revoked</span>`;
        } else if (t.type === 'one_time' && t.usedCount >= 1) {
          statusBadge = `<span class="badge badge-consumed"><i class="fa-solid fa-check"></i> Consumed</span>`;
        } else {
          statusBadge = `<span class="badge badge-active"><i class="fa-solid fa-circle-check"></i> Active</span>`;
        }

        // Used By formatting
        let usedByDisplay = '—';
        if (t.lastUsedBy) {
          const friendly = t.lastUsedByFriendlyName || 'Anonymous';
          usedByDisplay = `<strong>${friendly}</strong> <br><span style="font-size: 0.75rem; color: #94a3b8;">${t.lastUsedBy.substring(0, 8)}...</span>`;
        }

        const canRevoke = !t.isRevoked;

        tr.innerHTML = `
          <td style="font-family: monospace; font-weight: 600; color: var(--accent-cyan); font-size: 0.95rem;">${t.token}</td>
          <td>${typeBadge}</td>
          <td>${statusBadge}</td>
          <td>${usedByDisplay}</td>
          <td>${t.usedCount}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${dateStr}</td>
          <td>
            ${canRevoke 
              ? `<button class="btn btn-danger btn-sm btn-revoke-token" data-id="${t.id}" data-token="${t.token}"><i class="fa-solid fa-ban"></i> Revoke</button>`
              : `<span style="color: var(--text-muted); font-size: 0.8rem;">None</span>`}
          </td>
        `;

        const btnRevoke = tr.querySelector('.btn-revoke-token');
        if (btnRevoke) {
          btnRevoke.addEventListener('click', () => handleRevokeToken(t.id, t.token));
        }

        tokenTableBody.appendChild(tr);
      });
    }

    metricTotal.textContent = tokens.length;
    metricActive.textContent = activeCount;
    metricRevoked.textContent = revokedCount;
    metricForever.textContent = foreverCount;
  }

  async function handleCreateToken() {
    const type = selectTokenType.value;
    const customCode = inputCustomToken.value.trim();

    try {
      const res = await fetch('/api/admin/tokens/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.adminToken}`,
        },
        body: JSON.stringify({
          type,
          customToken: customCode || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to generate server token.', 'alert');
        return;
      }

      showToast(`Server token "${data.token.token}" generated successfully!`, 'success');
      inputCustomToken.value = '';
      await loadTokens();
    } catch (err) {
      console.error('Error creating token:', err);
      showToast('Error connecting to admin server.', 'alert');
    }
  }

  async function handleRevokeToken(tokenId, tokenCode) {
    const confirmed = await showConfirmModal(
      'Revoke Server Token',
      `Are you sure you want to permanently invalidate/revoke token "${tokenCode}"? Users will no longer be able to use this token.`
    );

    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/tokens/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.adminToken}`,
        },
        body: JSON.stringify({ tokenId, tokenCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to revoke token.', 'alert');
        return;
      }

      showToast(`Token "${tokenCode}" has been revoked!`, 'info');
      await loadTokens();
    } catch (err) {
      console.error('Error revoking token:', err);
      showToast('Error revoking token.', 'alert');
    }
  }
});
