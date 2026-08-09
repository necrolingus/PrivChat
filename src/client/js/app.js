/**
 * PrivChat Main Application Logic
 * Feature Updates:
 * 1. Server-Side User Profile & Friendly Name Persistence
 * 2. Standardized UI Terminology (12-Word Identity Phrase, 6-Word Channel Key, One-Time Invite PIN)
 * 3. Auto-Generated Initial Invite PIN on Channel Creation
 * 4. Global Notification Center (visible on ALL screens, not just channel dashboard)
 * 5. Fixed Height Chat Screen Area
 * 6. Hardened One-Time Invite PIN Non-Reuse Enforcement
 * 7. Custom Confirm/Prompt Modals (replaces ALL native browser confirm/alert/prompt popups)
 * 8. Friendly Names in Members List (not just device IDs)
 * 9. Auto-Join on Approval (joiner auto-navigated into channel when owner approves)
 * 10. Toast Notification System (non-blocking visual feedback)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  const state = {
    identityPhrase: '',
    deviceId: '',
    friendlyName: '',
    signingKeyPair: null,
    persistenceMode: 'persistent', // 'persistent' or 'session'
    generated6Words: '',
    autoInvitePin: '',
    channelPhrase: '',
    channelId: '',
    channelKey: null,
    isOwner: false,
    socket: null,
    notifications: [],
    unreadNotificationsCount: 0,
    selectedPhotoBuffer: null,
    selectedPhotoMime: null,
    selectedPhotoName: '',
    isPrivateServer: false,
  };

  // DOM Screens
  const screens = {
    identity: document.getElementById('screen-identity'),
    channel: document.getElementById('screen-channel'),
    chat: document.getElementById('screen-chat'),
  };

  // Identity Screen Elements
  const btnTabNew = document.getElementById('btn-tab-new');
  const btnTabReturning = document.getElementById('btn-tab-returning');
  const formNewUser = document.getElementById('form-new-user');
  const formReturningUser = document.getElementById('form-returning-user');
  const seedWordsGrid = document.getElementById('seed-words-grid');
  const btnCopySeed = document.getElementById('btn-copy-seed');
  const btnRegenSeed = document.getElementById('btn-regen-seed');
  const newFriendlyName = document.getElementById('new-friendly-name');
  const sessionPersistenceNew = document.getElementById('session-persistence-new');
  const btnConfirmNew = document.getElementById('btn-confirm-new');
  const input12Words = document.getElementById('input-12-words');
  const returningFriendlyName = document.getElementById('returning-friendly-name');
  const sessionPersistenceReturning = document.getElementById('session-persistence-returning');
  const btnLoginReturning = document.getElementById('btn-login-returning');
  const containerServerTokenNew = document.getElementById('container-server-token-new');
  const inputServerTokenNew = document.getElementById('input-server-token-new');
  const containerServerTokenReturning = document.getElementById('container-server-token-returning');
  const inputServerTokenReturning = document.getElementById('input-server-token-returning');

  // Global Notification Center Elements (fixed position, always visible)
  const globalNotificationCenter = document.getElementById('global-notification-center');
  const btnNotificationBell = document.getElementById('btn-notification-bell');
  const notificationUnreadBadge = document.getElementById('notification-unread-badge');
  const notificationPopover = document.getElementById('notification-popover');
  const notificationList = document.getElementById('notification-list');
  const btnClearNotifications = document.getElementById('btn-clear-notifications');
  const toastContainer = document.getElementById('toast-container');

  // Channel Screen Header
  const userDisplayName = document.getElementById('user-display-name');
  const userDeviceShort = document.getElementById('user-device-short');
  const btnChangeIdentity = document.getElementById('btn-change-identity');

  // Sub-Tabs & Creation/Join Panels
  const btnTabCreateChannel = document.getElementById('btn-tab-create-channel');
  const btnTabJoinChannel = document.getElementById('btn-tab-join-channel');
  const panelCreateChannel = document.getElementById('panel-create-channel');
  const panelJoinChannel = document.getElementById('panel-join-channel');
  const channelWordsGrid = document.getElementById('channel-words-grid');
  const btnCopy6Words = document.getElementById('btn-copy-6-words');
  const btnGen6Words = document.getElementById('btn-gen-6-words');
  const inputCreatePin = document.getElementById('input-create-pin');
  const btnSubmitCreateChannel = document.getElementById('btn-submit-create-channel');
  const input6Words = document.getElementById('input-6-words');
  const inputInviteCode = document.getElementById('input-invite-code');
  const btnSubmitJoinChannel = document.getElementById('btn-submit-join-channel');
  const channelErrorMsg = document.getElementById('channel-error-msg');
  const channelPendingMsg = document.getElementById('channel-pending-msg');
  const myChannelsList = document.getElementById('my-channels-list');

  // Chat Screen Elements
  const chatChannelTitle = document.getElementById('chat-channel-title');
  const ownerBadge = document.getElementById('owner-badge');
  const chatPhraseMask = document.getElementById('chat-phrase-mask');
  const btnTogglePhrase = document.getElementById('btn-toggle-phrase');
  const btnCopyChannelPhrase = document.getElementById('btn-copy-channel-phrase');
  const btnBackDashboard = document.getElementById('btn-back-dashboard');
  const btnViewMembers = document.getElementById('btn-view-members');
  const membersCount = document.getElementById('members-count');
  const btnLeaveChannel = document.getElementById('btn-leave-channel');
  const chatMessagesContainer = document.getElementById('chat-messages-container');
  const formSendMessage = document.getElementById('form-send-message');
  const inputChatText = document.getElementById('input-chat-text');
  const inputPhotoFile = document.getElementById('input-photo-file');
  const btnTriggerPhoto = document.getElementById('btn-trigger-photo');
  const photoPreviewBar = document.getElementById('photo-preview-bar');
  const photoPreviewName = document.getElementById('photo-preview-name');
  const btnCancelPhoto = document.getElementById('btn-cancel-photo');

  // Modal Elements
  const modalMembers = document.getElementById('modal-members');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const ownerInviteControls = document.getElementById('owner-invite-controls');
  const inputModalCustomPin = document.getElementById('input-modal-custom-pin');
  const btnCreateInvite = document.getElementById('btn-create-invite');
  const generatedInviteBox = document.getElementById('generated-invite-box');
  const newInviteCodeText = document.getElementById('new-invite-code-text');
  const btnCopyInviteCode = document.getElementById('btn-copy-invite-code');
  const ownerPendingSection = document.getElementById('owner-pending-section');
  const pendingRequestsList = document.getElementById('pending-requests-list');
  const membersList = document.getElementById('members-list');

  // Custom Confirm Modal Elements
  const modalConfirm = document.getElementById('modal-confirm');
  const confirmModalTitle = document.getElementById('confirm-modal-title');
  const confirmModalMessage = document.getElementById('confirm-modal-message');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
  const btnConfirmOk = document.getElementById('btn-confirm-ok');

  // Custom Prompt Modal Elements
  const modalPrompt = document.getElementById('modal-prompt');
  const promptModalTitle = document.getElementById('prompt-modal-title');
  const promptModalMessage = document.getElementById('prompt-modal-message');
  const promptModalInput = document.getElementById('prompt-modal-input');
  const btnPromptCancel = document.getElementById('btn-prompt-cancel');
  const btnPromptOk = document.getElementById('btn-prompt-ok');

  let isPhraseVisible = false;

  // Initialize Application
  init();

  async function init() {
    setupEventListeners();
    await checkSavedIdentity();
  }

  function showScreen(screenName) {
    Object.keys(screens).forEach((name) => {
      if (name === screenName) {
        screens[name].classList.add('active');
      } else {
        screens[name].classList.remove('active');
      }
    });

    // Show notification bell on channel & chat screens, hide on identity screen
    if (screenName === 'identity') {
      globalNotificationCenter.classList.add('hidden');
    } else {
      globalNotificationCenter.classList.remove('hidden');
    }

    if (screenName === 'channel') {
      generateNewChannelPhrase(); // async, fire-and-forget
      renderMyActiveChannels();
    }
  }

  // ==================== CUSTOM CONFIRM MODAL (replaces browser confirm()) ====================
  function showConfirmModal(title, message) {
    return new Promise((resolve) => {
      confirmModalTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${title}`;
      confirmModalMessage.textContent = message;
      modalConfirm.classList.remove('hidden');

      function cleanup() {
        btnConfirmOk.removeEventListener('click', onOk);
        btnConfirmCancel.removeEventListener('click', onCancel);
        modalConfirm.classList.add('hidden');
      }

      function onOk() {
        cleanup();
        resolve(true);
      }

      function onCancel() {
        cleanup();
        resolve(false);
      }

      btnConfirmOk.addEventListener('click', onOk);
      btnConfirmCancel.addEventListener('click', onCancel);
    });
  }

  // ==================== CUSTOM PROMPT MODAL (replaces browser prompt()) ====================
  function showPromptModal(title, message, placeholder) {
    return new Promise((resolve) => {
      promptModalTitle.innerHTML = `<i class="fa-solid fa-keyboard"></i> ${title}`;
      promptModalMessage.textContent = message || '';
      promptModalInput.value = '';
      promptModalInput.placeholder = placeholder || '';
      modalPrompt.classList.remove('hidden');
      promptModalInput.focus();

      function cleanup() {
        btnPromptOk.removeEventListener('click', onOk);
        btnPromptCancel.removeEventListener('click', onCancel);
        promptModalInput.removeEventListener('keydown', onKeydown);
        modalPrompt.classList.add('hidden');
      }

      function onOk() {
        const val = promptModalInput.value.trim();
        cleanup();
        resolve(val || null);
      }

      function onCancel() {
        cleanup();
        resolve(null);
      }

      function onKeydown(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOk();
        }
      }

      btnPromptOk.addEventListener('click', onOk);
      btnPromptCancel.addEventListener('click', onCancel);
      promptModalInput.addEventListener('keydown', onKeydown);
    });
  }

  // ==================== TOAST SYSTEM (non-blocking visual feedback) ====================
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

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
  }

  /**
   * Check local/session storage and fetch server-persisted user profile
   */
  async function checkSavedIdentity() {
    try {
      const configRes = await fetch('/api/admin/config');
      const configData = await configRes.json();
      state.isPrivateServer = configData.isPrivateServer;
      if (configData.isPrivateServer) {
        if (containerServerTokenNew) containerServerTokenNew.classList.remove('hidden');
        if (containerServerTokenReturning) containerServerTokenReturning.classList.remove('hidden');
      }
    } catch (e) {
      console.error('Error checking server mode:', e);
    }

    let savedSeed = sessionStorage.getItem('privchat_identity_seed');
    let mode = 'session';

    if (!savedSeed) {
      savedSeed = localStorage.getItem('privchat_identity_seed');
      mode = 'persistent';
    }

    if (savedSeed) {
      const devId = await window.PrivateCrypto.deriveDeviceId(savedSeed);
      const profile = await fetchServerProfile(devId);

      const success = await setIdentity(savedSeed, profile.friendlyName || 'Anonymous', mode);
      if (success) {
        showScreen('channel');
      } else {
        showScreen('identity');
      }
    } else {
      await generateNewIdentitySeed();
      showScreen('identity');
    }
  }

  async function fetchServerProfile(deviceId) {
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(deviceId)}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error('Fetch server profile error:', e);
    }
    return { friendlyName: 'Anonymous' };
  }

  async function saveServerProfile(deviceId, name, token = '') {
    try {
      const serverToken = token || (inputServerTokenNew ? inputServerTokenNew.value.trim() : '') || (inputServerTokenReturning ? inputServerTokenReturning.value.trim() : '');
      const res = await fetch('/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, friendlyName: name, serverToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Private Server authorization failed.', 'alert');
        return false;
      }
      return true;
    } catch (e) {
      console.error('Save server profile error:', e);
      showToast('Network error: Unable to save profile on server.', 'alert');
      return false;
    }
  }

  function getActiveStorage() {
    return state.persistenceMode === 'persistent' ? localStorage : sessionStorage;
  }

  async function generateNewIdentitySeed() {
    const serverToken = inputServerTokenNew ? inputServerTokenNew.value.trim() : '';

    if (state.isPrivateServer && !serverToken) {
      state.identityPhrase = '';
      if (seedWordsGrid) {
        seedWordsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; color: #f59e0b; padding: 1.25rem; font-size: 0.88rem; background: rgba(245, 158, 11, 0.08); border: 1px dashed rgba(245, 158, 11, 0.3); border-radius: var(--radius-md);">
            <i class="fa-solid fa-key" style="font-size: 1.2rem; margin-bottom: 0.4rem; display: block;"></i>
            This server is in <strong>Private Mode</strong>.<br>Enter your <strong>Server Invite Token</strong> above and click <strong>Verify & Generate</strong> to create your 12-word identity key.
          </div>
        `;
      }
      return;
    }

    try {
      const res = await fetch('/api/generate/identity-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverToken }),
      });
      const data = await res.json();
      if (res.ok && data.phrase) {
        state.identityPhrase = data.phrase;
        renderSeedChips(data.phrase, seedWordsGrid);
        showToast('12-Word Identity Key generated & verified successfully!', 'success');
        return;
      }

      state.identityPhrase = '';
      if (seedWordsGrid) {
        seedWordsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; color: #f43f5e; padding: 1rem; font-size: 0.88rem; background: rgba(244, 63, 94, 0.08); border: 1px dashed rgba(244, 63, 94, 0.3); border-radius: var(--radius-md);">
            <i class="fa-solid fa-circle-exclamation"></i> ${data.error || 'Failed to generate unique identity phrase from server.'}
          </div>
        `;
      }
      showToast(data.error || 'Failed to generate unique identity phrase from server.', 'alert');
    } catch (e) {
      console.error('Server-side identity phrase generation failed:', e);
      state.identityPhrase = '';
      showToast('Network error: Unable to generate unique identity phrase from server.', 'alert');
    }
  }

  async function generateNewChannelPhrase() {
    try {
      const res = await fetch('/api/generate/channel-phrase', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.phrase) {
        state.generated6Words = data.phrase;
        renderSeedChips(data.phrase, channelWordsGrid);
        // Auto-generate initial single-use Invite PIN
        const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
        state.autoInvitePin = `INV-${randomHex}`;
        inputCreatePin.value = state.autoInvitePin;
        return;
      }
      addNotification(data.error || 'Failed to generate unique channel key from server.', 'alert');
    } catch (e) {
      console.error('Server-side channel phrase generation failed:', e);
      addNotification('Network error: Unable to generate unique channel key from server.', 'alert');
    }
  }

  function renderSeedChips(phrase, targetGridElement) {
    if (!targetGridElement) return;
    const words = phrase.split(' ');
    targetGridElement.innerHTML = '';
    words.forEach((w, index) => {
      const chip = document.createElement('div');
      chip.className = 'seed-chip';
      chip.innerHTML = `<span>${index + 1}.</span> ${w}`;
      targetGridElement.appendChild(chip);
    });
  }

  async function setIdentity(phrase, name, persistenceMode = 'persistent') {
    const cleanPhrase = (phrase || '').trim().toLowerCase();
    if (!cleanPhrase || cleanPhrase.split(/\s+/).length !== 12) {
      showToast('Please generate or enter a valid 12-word identity phrase.', 'alert');
      return false;
    }

    const devId = await window.PrivateCrypto.deriveDeviceId(cleanPhrase);

    const isSaved = await saveServerProfile(devId, name.trim());
    if (!isSaved) {
      return false; // Stop! Access denied on Private Server or profile save failed
    }

    state.identityPhrase = cleanPhrase;
    state.deviceId = devId;
    state.signingKeyPair = await window.PrivateCrypto.deriveSigningKeyPair(cleanPhrase);
    state.friendlyName = name.trim() || 'Anonymous';
    state.persistenceMode = persistenceMode;

    localStorage.removeItem('privchat_identity_seed');
    localStorage.removeItem('privchat_friendly_name');
    sessionStorage.removeItem('privchat_identity_seed');
    sessionStorage.removeItem('privchat_friendly_name');

    const storage = getActiveStorage();
    storage.setItem('privchat_identity_seed', state.identityPhrase);
    storage.setItem('privchat_friendly_name', state.friendlyName);
    storage.setItem('privchat_persistence_mode', state.persistenceMode);

    userDisplayName.textContent = state.friendlyName;
    userDeviceShort.textContent = `ID: ${state.deviceId.substring(0, 8)}...`;
    return true;
  }

  function saveChannelToVault(channelId, channelPhrase) {
    const storage = getActiveStorage();
    const vaultRaw = storage.getItem('privchat_channel_vault') || '{}';
    try {
      const vault = JSON.parse(vaultRaw);
      vault[channelId] = channelPhrase;
      storage.setItem('privchat_channel_vault', JSON.stringify(vault));
    } catch (e) {
      console.error('Error writing channel vault:', e);
    }
  }

  function removeChannelFromVault(channelId) {
    const storage = getActiveStorage();
    const vaultRaw = storage.getItem('privchat_channel_vault') || '{}';
    try {
      const vault = JSON.parse(vaultRaw);
      delete vault[channelId];
      storage.setItem('privchat_channel_vault', JSON.stringify(vault));
    } catch (e) {
      console.error('Error removing channel from vault:', e);
    }
  }

  function getChannelVault() {
    const storage = getActiveStorage();
    const vaultRaw = storage.getItem('privchat_channel_vault') || '{}';
    try {
      return JSON.parse(vaultRaw);
    } catch (e) {
      return {};
    }
  }

  async function handleVerifyAndGenerateToken() {
    const val = inputServerTokenNew ? inputServerTokenNew.value.trim() : '';

    if (state.isPrivateServer) {
      if (!val) {
        showToast('Please enter your Server Invite Token first.', 'alert');
        return;
      }

      // Explicit verification against dedicated rate-limited token verification endpoint
      try {
        const verifyRes = await fetch('/api/generate/verify-server-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverToken: val }),
        });
        const verifyData = await verifyRes.json();

        if (!verifyRes.ok) {
          state.identityPhrase = '';
          if (seedWordsGrid) {
            seedWordsGrid.innerHTML = `
              <div style="grid-column: 1 / -1; text-align: center; color: #f43f5e; padding: 1rem; font-size: 0.88rem; background: rgba(244, 63, 94, 0.08); border: 1px dashed rgba(244, 63, 94, 0.3); border-radius: var(--radius-md);">
                <i class="fa-solid fa-circle-exclamation"></i> ${verifyData.error || 'Server invite token verification failed.'}
              </div>
            `;
          }
          showToast(verifyData.error || 'Server invite token verification failed.', 'alert');
          return;
        }
      } catch (err) {
        console.error('Token verification error:', err);
        showToast('Network error while verifying server token.', 'alert');
        return;
      }
    }

    await generateNewIdentitySeed();
  }

  function setupEventListeners() {
    // Identity Tabs
    btnTabNew.addEventListener('click', () => {
      btnTabNew.classList.add('active');
      btnTabReturning.classList.remove('active');
      formNewUser.classList.remove('hidden');
      formReturningUser.classList.add('hidden');
    });

    btnTabReturning.addEventListener('click', () => {
      btnTabReturning.classList.add('active');
      btnTabNew.classList.remove('active');
      formReturningUser.classList.remove('hidden');
      formNewUser.classList.add('hidden');
    });

    btnRegenSeed.addEventListener('click', async () => await generateNewIdentitySeed());
    btnCopySeed.addEventListener('click', () => {
      if (!state.identityPhrase) {
        showToast('No 12-word identity phrase generated yet. Enter your Server Invite Token above and click Verify & Generate.', 'alert');
        return;
      }
      navigator.clipboard.writeText(state.identityPhrase);
      showToast('12-Word Identity Phrase copied to clipboard!', 'success');
    });

    const btnVerifyServerToken = document.getElementById('btn-verify-server-token');
    if (btnVerifyServerToken) {
      btnVerifyServerToken.addEventListener('click', async () => {
        await handleVerifyAndGenerateToken();
      });
    }

    if (inputServerTokenNew) {
      inputServerTokenNew.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await handleVerifyAndGenerateToken();
        }
      });
    }

    btnConfirmNew.addEventListener('click', async () => {
      if (!state.identityPhrase) {
        showToast('Please enter a valid Server Invite Token and click Verify & Generate to create your identity phrase.', 'alert');
        return;
      }
      const success = await setIdentity(state.identityPhrase, newFriendlyName.value, sessionPersistenceNew.value);
      if (success) {
        showScreen('channel');
      }
    });

    // Auto-fetch profile name on returning identity phrase input blur
    input12Words.addEventListener('blur', async () => {
      const phrase = input12Words.value.trim().toLowerCase();
      if (phrase.split(/\s+/).length === 12) {
        const derivedDevId = await window.PrivateCrypto.deriveDeviceId(phrase);
        const profile = await fetchServerProfile(derivedDevId);
        if (profile) {
          if (profile.friendlyName) {
            returningFriendlyName.value = profile.friendlyName;
          }
          if (state.isPrivateServer && containerServerTokenReturning) {
            if (profile.authorizedOnServer) {
              containerServerTokenReturning.classList.add('hidden');
            } else {
              containerServerTokenReturning.classList.remove('hidden');
            }
          }
        }
      }
    });

    btnLoginReturning.addEventListener('click', async () => {
      const phrase = input12Words.value.trim().toLowerCase();
      const words = phrase.split(/\s+/);
      if (words.length !== 12) {
        showToast('Please enter a valid 12-word identity phrase.', 'alert');
        return;
      }
      const success = await setIdentity(phrase, returningFriendlyName.value, sessionPersistenceReturning.value);
      if (success) {
        showScreen('channel');
      }
    });

    // LOG OUT: uses custom confirm modal instead of browser confirm()
    btnChangeIdentity.addEventListener('click', async () => {
      const confirmed = await showConfirmModal(
        'Log Out',
        'Are you sure you want to log out of this identity? Make sure you saved your 12-word phrase!'
      );
      if (confirmed) {
        localStorage.clear();
        sessionStorage.clear();
        await generateNewIdentitySeed();
        showScreen('identity');
      }
    });

    // Notification Center Popover Toggle & Clear
    btnNotificationBell.addEventListener('click', () => {
      notificationPopover.classList.toggle('hidden');
      if (!notificationPopover.classList.contains('hidden')) {
        markNotificationsAsRead();
      }
    });

    // Close notification popover when clicking outside
    document.addEventListener('click', (e) => {
      if (!globalNotificationCenter.contains(e.target)) {
        notificationPopover.classList.add('hidden');
      }
    });

    btnClearNotifications.addEventListener('click', () => {
      state.notifications = [];
      updateNotificationUI();
    });

    // Sub-Tab Switching for Channel Screen
    btnTabCreateChannel.addEventListener('click', () => {
      btnTabCreateChannel.classList.add('active');
      btnTabJoinChannel.classList.remove('active');
      panelCreateChannel.classList.remove('hidden');
      panelJoinChannel.classList.add('hidden');
    });

    btnTabJoinChannel.addEventListener('click', () => {
      btnTabJoinChannel.classList.add('active');
      btnTabCreateChannel.classList.remove('active');
      panelJoinChannel.classList.remove('hidden');
      panelCreateChannel.classList.add('hidden');
    });

    btnGen6Words.addEventListener('click', async () => await generateNewChannelPhrase());
    btnCopy6Words.addEventListener('click', () => {
      navigator.clipboard.writeText(state.generated6Words);
      showToast('6-Word Channel Key copied to clipboard!', 'success');
    });

    const btnCopyInitialPin = document.getElementById('btn-copy-initial-pin');
    if (btnCopyInitialPin) {
      btnCopyInitialPin.addEventListener('click', () => {
        const pin = inputCreatePin ? (inputCreatePin.value.trim() || state.autoInvitePin) : '';
        if (!pin) {
          showToast('No initial invite PIN available.', 'alert');
          return;
        }
        navigator.clipboard.writeText(pin);
        showToast('Initial One-Time Invite PIN copied to clipboard!', 'success');
      });
    }

    const btnCopyCreateBackupBundle = document.getElementById('btn-copy-create-backup-bundle');
    if (btnCopyCreateBackupBundle) {
      btnCopyCreateBackupBundle.addEventListener('click', async () => {
        const pin = inputCreatePin ? (inputCreatePin.value.trim() || state.autoInvitePin) : '';
        const channelId = await window.PrivateCrypto.sha256Hex(state.generated6Words);
        const backupText = `==================================================\nPRIVCHAT SECURE CHANNEL BACKUP BUNDLE\n==================================================\nChannel ID: ${channelId}\n6-Word Channel Key: ${state.generated6Words}\nInitial Invite PIN: ${pin || 'N/A'}\n==================================================\nCRITICAL WARNING: PrivChat is 100% Zero-Knowledge. Save this backup! You will need this 6-word key to unlock Channel ID ${channelId.substring(0, 16)}... on Incognito or new devices.`;
        navigator.clipboard.writeText(backupText);
        showToast('Full Channel Backup Bundle copied to clipboard!', 'success');
      });
    }

    const btnCopyChatBackupBundle = document.getElementById('btn-copy-chat-backup-bundle');
    if (btnCopyChatBackupBundle) {
      btnCopyChatBackupBundle.addEventListener('click', () => {
        const backupText = `==================================================\nPRIVCHAT SECURE CHANNEL BACKUP\n==================================================\nChannel ID: ${state.channelId}\n6-Word Channel Key: ${state.channelPhrase}\nRole: ${state.isOwner ? 'Owner' : 'Member'}\n==================================================\nCRITICAL WARNING: Save this backup! You will need this 6-word key to unlock Channel ID ${state.channelId.substring(0, 16)}... on Incognito or new devices.`;
        navigator.clipboard.writeText(backupText);
        showToast('Channel Backup Info copied to clipboard!', 'success');
      });
    }

    const btnExportVaultBackup = document.getElementById('btn-export-vault-backup');
    if (btnExportVaultBackup) {
      btnExportVaultBackup.addEventListener('click', () => {
        const vault = getChannelVault();
        const keys = Object.keys(vault);
        if (keys.length === 0) {
          showToast('No unlocked channels currently saved in your Local Vault.', 'alert');
          return;
        }
        let backupText = `==================================================\nPRIVCHAT KEY VAULT BACKUP FILE\nExported: ${new Date().toLocaleString()}\n==================================================\n\n`;
        keys.forEach((cId, idx) => {
          backupText += `[${idx + 1}] Channel ID: ${cId}\n    6-Word Key: ${vault[cId]}\n\n`;
        });
        backupText += `==================================================\nKEEP THIS BACKUP SECURE! Match the Channel ID to find the 6-word key for Incognito logins.`;
        navigator.clipboard.writeText(backupText);
        showToast(`Exported ${keys.length} unlocked channel key(s) to clipboard!`, 'success');
      });
    }

    // Submit Create Channel
    btnSubmitCreateChannel.addEventListener('click', () => {
      const initialPin = inputCreatePin.value.trim() || state.autoInvitePin;
      joinChannel(state.generated6Words, null, initialPin);
    });

    // Submit Join Channel
    btnSubmitJoinChannel.addEventListener('click', () => {
      const phrase = input6Words.value.trim();
      const inviteCode = inputInviteCode.value.trim();
      joinChannel(phrase, inviteCode);
    });

    btnBackDashboard.addEventListener('click', () => returnToDashboard());
    btnTogglePhrase.addEventListener('click', () => {
      isPhraseVisible = !isPhraseVisible;
      if (isPhraseVisible) {
        chatPhraseMask.textContent = state.channelPhrase;
        btnTogglePhrase.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
      } else {
        chatPhraseMask.textContent = '•••••• •••••• •••••• ••••••';
        btnTogglePhrase.innerHTML = '<i class="fa-solid fa-eye"></i>';
      }
    });

    btnCopyChannelPhrase.addEventListener('click', () => {
      navigator.clipboard.writeText(state.channelPhrase);
      showToast('6-Word Channel Key copied to clipboard!', 'success');
    });

    btnLeaveChannel.addEventListener('click', () => leaveChannel());
    btnViewMembers.addEventListener('click', () => openMembersModal());
    btnCloseModal.addEventListener('click', () => modalMembers.classList.add('hidden'));

    btnCreateInvite.addEventListener('click', () => createSingleUseInvite());
    btnCopyInviteCode.addEventListener('click', () => {
      navigator.clipboard.writeText(newInviteCodeText.textContent);
      showToast('One-Time Invite PIN copied to clipboard!', 'success');
    });

    btnTriggerPhoto.addEventListener('click', () => inputPhotoFile.click());
    inputPhotoFile.addEventListener('change', handleFileSelect);
    btnCancelPhoto.addEventListener('click', clearPhotoSelection);

    formSendMessage.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  /**
   * Notification Center State Management
   */
  function addNotification(body, type = 'info', actionData = null) {
    const id = 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const item = { id, body, type, actionData, read: false, time: new Date() };
    state.notifications.unshift(item);
    state.unreadNotificationsCount++;
    updateNotificationUI();

    // Also show a non-blocking toast for immediate feedback
    showToast(body, type === 'request' ? 'info' : type);
  }

  function markNotificationsAsRead() {
    state.notifications.forEach((n) => (n.read = true));
    state.unreadNotificationsCount = 0;
    updateNotificationUI();
  }

  function updateNotificationUI() {
    if (state.unreadNotificationsCount > 0) {
      notificationUnreadBadge.textContent = state.unreadNotificationsCount;
      notificationUnreadBadge.classList.remove('hidden');
    } else {
      notificationUnreadBadge.classList.add('hidden');
    }

    if (state.notifications.length === 0) {
      notificationList.innerHTML = `<p class="empty-notifications">No new notifications</p>`;
      return;
    }

    notificationList.innerHTML = '';
    state.notifications.forEach((n) => {
      const el = document.createElement('div');
      el.className = 'notification-item';

      const timeStr = n.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      let icon = '<i class="fa-solid fa-info-circle" style="color: #60a5fa;"></i>';
      if (n.type === 'request') icon = '<i class="fa-solid fa-user-clock" style="color: #f59e0b;"></i>';
      if (n.type === 'alert') icon = '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>';

      el.innerHTML = `
        <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
          ${icon}
          <div style="flex: 1;">
            <span>${n.body}</span>
            <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 0.2rem;">${timeStr}</div>
          </div>
        </div>
      `;

      if (n.type === 'request' && n.actionData) {
        const actionRow = document.createElement('div');
        actionRow.className = 'notification-item-actions';

        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn btn-primary btn-sm';
        approveBtn.style.padding = '0.25rem 0.5rem';
        approveBtn.style.fontSize = '0.75rem';
        approveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Approve';
        approveBtn.addEventListener('click', async () => {
          await approveMember(n.actionData.targetDeviceId);
          el.remove();
        });

        const denyBtn = document.createElement('button');
        denyBtn.className = 'btn btn-danger btn-sm';
        denyBtn.style.padding = '0.25rem 0.5rem';
        denyBtn.style.fontSize = '0.75rem';
        denyBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Deny';
        denyBtn.addEventListener('click', async () => {
          await denyMember(n.actionData.targetDeviceId);
          el.remove();
        });

        actionRow.appendChild(approveBtn);
        actionRow.appendChild(denyBtn);
        el.appendChild(actionRow);
      }

      notificationList.appendChild(el);
    });
  }

  async function renderMyActiveChannels() {
    if (!state.deviceId) return;

    try {
      const res = await fetch(`/api/channels/my-channels?deviceId=${encodeURIComponent(state.deviceId)}`);
      const data = await res.json();

      if (!res.ok) {
        myChannelsList.innerHTML = `<p class="empty-channels">Failed to load channels.</p>`;
        return;
      }

      if (!data.channels || data.channels.length === 0) {
        myChannelsList.innerHTML = `<p class="empty-channels">No active channels yet. Join or create one above!</p>`;
        return;
      }

      const vault = getChannelVault();
      myChannelsList.innerHTML = '';

      data.channels.forEach((ch) => {
        const storedPhrase = vault[ch.channelId];
        const card = document.createElement('div');
        card.className = 'channel-item-card';

        const info = document.createElement('div');
        info.className = 'channel-item-info';

        const phraseDisplay = storedPhrase ? storedPhrase : `Channel ID: ${ch.channelId.substring(0, 12)}...`;
        
        info.innerHTML = `
          <div class="channel-item-phrase">${phraseDisplay}</div>
          <div>
            ${ch.isOwner 
              ? '<span class="badge owner-badge"><i class="fa-solid fa-crown"></i> Owner</span>' 
              : '<span class="badge member-badge"><i class="fa-solid fa-user-group"></i> Member</span>'}
          </div>
        `;

        const actionsContainer = document.createElement('div');
        actionsContainer.style.display = 'flex';
        actionsContainer.style.gap = '0.4rem';

        const openBtn = document.createElement('button');
        openBtn.className = 'btn btn-secondary btn-sm';
        openBtn.innerHTML = '<i class="fa-solid fa-door-open"></i> Open';
        openBtn.addEventListener('click', async () => {
          if (storedPhrase) {
            joinChannel(storedPhrase);
          } else {
            // Explicit Zero-Knowledge Unlock Prompt with exact Channel ID
            const userEntered = await showPromptModal(
              'Unlock Encrypted Channel',
              `Enter the 6-word channel key to unlock Channel ID:\n${ch.channelId}\n\n(Tip: Match Channel ID ${ch.channelId.substring(0, 12)}... in your saved backups to find your 6-word key.)`,
              'e.g. lumber once gossip flame torch brief'
            );
            if (userEntered) {
              const enteredPhrase = userEntered.trim().toLowerCase();
              const derivedId = await window.PrivateCrypto.sha256Hex(enteredPhrase);
              if (derivedId !== ch.channelId) {
                showChannelError('Incorrect 6-word channel key! The entered phrase does not match this Channel ID.');
                return;
              }
              joinChannel(enteredPhrase);
            }
          }
        });

        const leaveBtn = document.createElement('button');
        leaveBtn.className = 'btn btn-danger btn-sm';
        leaveBtn.innerHTML = ch.isOwner 
          ? '<i class="fa-solid fa-trash-can"></i> Close' 
          : '<i class="fa-solid fa-door-open"></i> Leave';
        
        leaveBtn.addEventListener('click', async () => {
          const confirmMsg = ch.isOwner
            ? 'As owner, closing this channel will permanently DELETE it for all members. All chat history will be wiped. Continue?'
            : 'Are you sure you want to leave this channel permanently?';
          
          const confirmed = await showConfirmModal(
            ch.isOwner ? 'Close Channel' : 'Leave Channel',
            confirmMsg
          );
          if (!confirmed) return;

          try {
            const leaveRes = await fetch('/api/channels/leave', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                channelId: ch.channelId,
                deviceId: state.deviceId,
              }),
            });

            const leaveData = await leaveRes.json();
            removeChannelFromVault(ch.channelId);

            if (leaveData.isOwnerLeave) {
              addNotification('Channel permanently closed and deleted.', 'info');
            }

            renderMyActiveChannels();
          } catch (e) {
            console.error('Error leaving channel:', e);
            removeChannelFromVault(ch.channelId);
            renderMyActiveChannels();
          }
        });

        actionsContainer.appendChild(openBtn);
        actionsContainer.appendChild(leaveBtn);

        card.appendChild(info);
        card.appendChild(actionsContainer);
        myChannelsList.appendChild(card);
      });
    } catch (err) {
      console.error('Render my active channels error:', err);
      myChannelsList.innerHTML = `<p class="empty-channels">Error loading active channels.</p>`;
    }
  }

  /**
   * Join or Create Channel Handler
   */
  async function joinChannel(rawPhrase, inviteCodeParam = null, initialOwnerPin = null) {
    channelErrorMsg.classList.add('hidden');
    channelPendingMsg.classList.add('hidden');

    const phrase = rawPhrase.trim().toLowerCase();
    const words = phrase.split(/\s+/);

    if (words.length !== 6) {
      showChannelError('Please enter a valid 6-word channel key.');
      return;
    }

    try {
      state.channelPhrase = phrase;
      state.channelId = await window.PrivateCrypto.sha256Hex(phrase);
      state.channelKey = await window.PrivateCrypto.deriveChannelKey(phrase);

      const res = await fetch('/api/channels/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: state.channelId,
          deviceId: state.deviceId,
          publicSigningKey: state.signingKeyPair ? state.signingKeyPair.publicJwkString : null,
          inviteCode: inviteCodeParam || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showChannelError(data.error || 'Failed to join channel.');
        return;
      }

      state.isOwner = data.isOwner;

      // If owner created channel with an initial invite PIN, register the invite code
      if (state.isOwner && initialOwnerPin) {
        await fetch('/api/channels/create-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: state.channelId,
            ownerDeviceId: state.deviceId,
            customPin: initialOwnerPin,
          }),
        });
      }

      if (data.status === 'pending') {
        channelPendingMsg.classList.remove('hidden');
        initPendingSocketConnection();
        return;
      }

      saveChannelToVault(state.channelId, state.channelPhrase);
      inputInviteCode.value = '';

      chatChannelTitle.textContent = `Channel: ${words.slice(0, 2).join(' ')}...`;
      if (state.isOwner) {
        ownerBadge.classList.remove('hidden');
      } else {
        ownerBadge.classList.add('hidden');
      }

      initSocketConnection();
      await fetchChatHistory();
      showScreen('chat');
    } catch (err) {
      console.error('Join channel error:', err);
      showChannelError('An unexpected error occurred while joining channel.');
    }
  }

  function showChannelError(msg) {
    channelErrorMsg.textContent = msg;
    channelErrorMsg.classList.remove('hidden');
  }

  function initPendingSocketConnection() {
    if (state.socket) state.socket.disconnect();
    state.socket = io();

    state.socket.emit('request_join', {
      channelId: state.channelId,
      deviceId: state.deviceId,
    });

    state.socket.on('you_were_approved', () => {
      channelPendingMsg.classList.add('hidden');
      addNotification('Your join request was approved! Entering channel...', 'info');
      // Auto-join: automatically navigate into the channel
      joinChannel(state.channelPhrase);
    });

    state.socket.on('you_were_denied', () => {
      channelPendingMsg.classList.add('hidden');
      showChannelError('Your request to join this channel was denied by the channel owner.');
    });
  }

  async function fetchChatHistory() {
    try {
      const res = await fetch(`/api/channels/${state.channelId}/messages?deviceId=${encodeURIComponent(state.deviceId)}`);
      const data = await res.json();

      if (!res.ok) {
        console.error('Failed to fetch history:', data.error);
        return;
      }

      chatMessagesContainer.innerHTML = `
        <div class="encryption-notice">
          <i class="fa-solid fa-shield-halved"></i>
          <p>Messages and photos in this channel are end-to-end encrypted with AES-256-GCM. Not even the server can read them.</p>
        </div>
      `;

      for (const msg of data.messages) {
        await renderMessageItem(msg);
      }

      scrollToBottom();
    } catch (err) {
      console.error('Fetch chat history error:', err);
    }
  }

  function initSocketConnection() {
    if (state.socket) {
      state.socket.disconnect();
    }

    state.socket = io();

    state.socket.on('connect', () => {
      state.socket.emit('join_channel', {
        channelId: state.channelId,
        deviceId: state.deviceId,
      });
    });

    state.socket.on('new_message', async (msgPayload) => {
      await renderMessageItem(msgPayload);
      scrollToBottom();
    });

    state.socket.on('channel_closed', () => {
      addNotification('Channel closed and permanently deleted by owner.', 'alert');
      removeChannelFromVault(state.channelId);
      exitToChannelScreen();
    });

    state.socket.on('pending_join_request', async ({ deviceId }) => {
      if (state.isOwner) {
        // Fetch the requester's friendly name from the server
        const profile = await fetchServerProfile(deviceId);
        const displayName = profile.friendlyName || deviceId.substring(0, 8) + '...';

        addNotification(
          `New Join Request: ${displayName} wants to join your channel.`,
          'request',
          { targetDeviceId: deviceId }
        );
      }
    });

    state.socket.on('user_kicked', ({ targetDeviceId }) => {
      if (targetDeviceId === state.deviceId) {
        removeChannelFromVault(state.channelId);
        addNotification('You have been kicked from this channel by the owner.', 'alert');
        exitToChannelScreen();
      } else {
        updateMembersCount();
      }
    });

    state.socket.on('user_left', () => {
      updateMembersCount();
    });

    state.socket.on('you_were_kicked', () => {
      removeChannelFromVault(state.channelId);
      addNotification('You have been kicked from this channel by the owner.', 'alert');
      exitToChannelScreen();
    });

    state.socket.on('member_status_changed', () => {
      updateMembersCount();
    });
  }

  async function renderMessageItem(msg) {
    const isSentByMe = msg.senderDeviceId === state.deviceId;
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${isSentByMe ? 'sent' : 'received'}`;

    const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const senderTag = isSentByMe ? 'You' : (msg.senderName || 'Anonymous');

    const header = document.createElement('div');
    header.className = 'msg-header';
    header.innerHTML = `<span>${senderTag}</span> • <span>${timeStr}</span>`;
    wrapper.appendChild(header);

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    try {
      if (msg.mimeType && msg.mimeType.startsWith('image/')) {
        const blobUrl = await window.PrivateCrypto.decryptBinaryToBlobUrl(
          msg.encryptedContent,
          msg.iv,
          state.channelKey,
          msg.mimeType
        );
        const img = document.createElement('img');
        img.src = blobUrl;
        img.className = 'msg-photo';
        img.alt = 'Encrypted Photo';
        img.onload = () => scrollToBottom();
        bubble.appendChild(img);
      } else {
        const decryptedText = await window.PrivateCrypto.decryptText(
          msg.encryptedContent,
          msg.iv,
          state.channelKey
        );
        bubble.textContent = decryptedText;
      }
    } catch (decryptErr) {
      console.error('Decryption failed:', decryptErr);
      bubble.textContent = '⚠️ [Unable to decrypt message]';
      bubble.style.color = '#ef4444';
    }

    wrapper.appendChild(bubble);
    chatMessagesContainer.appendChild(wrapper);
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.type)) {
      addNotification('Invalid file format. Only PNG, JPEG, GIF, WEBP are allowed.', 'alert');
      clearPhotoSelection();
      return;
    }

    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer.slice(0, 4));
    let isValidMagicBytes = false;

    if (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4e && uint8[3] === 0x47) isValidMagicBytes = true;
    if (uint8[0] === 0xff && uint8[1] === 0xd8 && uint8[2] === 0xff) isValidMagicBytes = true;
    if (uint8[0] === 0x47 && uint8[1] === 0x49 && uint8[2] === 0x46) isValidMagicBytes = true;
    if (uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46) isValidMagicBytes = true;

    if (!isValidMagicBytes) {
      addNotification('Security error: File binary header does not match valid image payload.', 'alert');
      clearPhotoSelection();
      return;
    }

    state.selectedPhotoBuffer = buffer;
    state.selectedPhotoMime = file.type;
    state.selectedPhotoName = file.name;

    photoPreviewName.textContent = file.name;
    photoPreviewBar.classList.remove('hidden');
  }

  function clearPhotoSelection() {
    state.selectedPhotoBuffer = null;
    state.selectedPhotoMime = null;
    state.selectedPhotoName = '';
    inputPhotoFile.value = '';
    photoPreviewBar.classList.add('hidden');
  }

  async function sendMessage() {
    const text = inputChatText.value.trim();

    if (!text && !state.selectedPhotoBuffer) return;

    try {
      let ciphertext = '';
      let iv = '';
      let mimeType = 'text/plain';

      if (state.selectedPhotoBuffer) {
        const encrypted = await window.PrivateCrypto.encryptBinary(
          state.selectedPhotoBuffer,
          state.channelKey
        );
        ciphertext = encrypted.ciphertext;
        iv = encrypted.iv;
        mimeType = state.selectedPhotoMime;
        clearPhotoSelection();
      } else {
        const encrypted = await window.PrivateCrypto.encryptText(
          text,
          state.channelKey
        );
        ciphertext = encrypted.ciphertext;
        iv = encrypted.iv;
        inputChatText.value = '';
      }

      const signaturePayload = `${state.channelId}:${ciphertext}:${iv}:${state.deviceId}`;
      const signature = await window.PrivateCrypto.signMessage(
        signaturePayload,
        state.signingKeyPair.privateKey
      );

      state.socket.emit('send_message', {
        channelId: state.channelId,
        senderDeviceId: state.deviceId,
        senderName: state.friendlyName,
        encryptedContent: ciphertext,
        iv: iv,
        mimeType: mimeType,
        signature: signature,
      });
    } catch (err) {
      console.error('Send message error:', err);
      addNotification('Failed to encrypt and send message.', 'alert');
    }
  }

  async function updateMembersCount() {
    try {
      const res = await fetch(`/api/channels/${state.channelId}/members?deviceId=${encodeURIComponent(state.deviceId)}`);
      if (!res.ok) return;
      const data = await res.json();
      membersCount.textContent = data.members.length;
    } catch (err) {
      console.error('Update members error:', err);
    }
  }

  async function openMembersModal() {
    try {
      if (state.isOwner) {
        ownerInviteControls.classList.remove('hidden');
        generatedInviteBox.classList.add('hidden');

        const pendingRes = await fetch(`/api/channels/${state.channelId}/pending-members?ownerDeviceId=${encodeURIComponent(state.deviceId)}`);
        const pendingData = await pendingRes.json();

        if (pendingRes.ok && pendingData.pendingMembers && pendingData.pendingMembers.length > 0) {
          pendingRequestsList.innerHTML = '';

          // Fetch profiles for pending members to show friendly names
          for (const pm of pendingData.pendingMembers) {
            const profile = await fetchServerProfile(pm.deviceId);
            const displayName = profile.friendlyName || pm.deviceId.substring(0, 8) + '...';

            const li = document.createElement('li');
            li.className = 'member-item';
            li.innerHTML = `
              <div class="member-info">
                <i class="fa-solid fa-clock"></i>
                <span>${displayName}</span>
              </div>
              <div class="actions">
                <button class="btn btn-primary btn-sm btn-approve"><i class="fa-solid fa-check"></i> Approve</button>
                <button class="btn btn-danger btn-sm btn-deny"><i class="fa-solid fa-xmark"></i> Deny</button>
              </div>
            `;

            li.querySelector('.btn-approve').addEventListener('click', () => approveMember(pm.deviceId));
            li.querySelector('.btn-deny').addEventListener('click', () => denyMember(pm.deviceId));
            pendingRequestsList.appendChild(li);
          }
          ownerPendingSection.classList.remove('hidden');
        } else {
          ownerPendingSection.classList.add('hidden');
        }
      } else {
        ownerInviteControls.classList.add('hidden');
        ownerPendingSection.classList.add('hidden');
      }

      const res = await fetch(`/api/channels/${state.channelId}/members?deviceId=${encodeURIComponent(state.deviceId)}`);
      const data = await res.json();

      if (!res.ok) {
        addNotification(data.error || 'Failed to fetch member list.', 'alert');
        return;
      }

      membersList.innerHTML = '';

      data.members.forEach((m) => {
        const isMe = m.deviceId === state.deviceId;
        const isOwner = m.deviceId === data.ownerDeviceId;

        const li = document.createElement('li');
        li.className = 'member-item';

        const info = document.createElement('div');
        info.className = 'member-info';

        // Show friendly name instead of Device ID
        const memberDisplayName = isMe
          ? `You (${state.friendlyName})`
          : (m.friendlyName || 'Anonymous');

        info.innerHTML = `
          <i class="fa-solid fa-user"></i>
          <span>${memberDisplayName}</span>
          ${isOwner ? '<span class="badge owner-badge"><i class="fa-solid fa-crown"></i> Owner</span>' : ''}
        `;

        li.appendChild(info);

        if (state.isOwner && !isMe && !isOwner) {
          const kickBtn = document.createElement('button');
          kickBtn.className = 'btn btn-danger btn-sm';
          kickBtn.innerHTML = '<i class="fa-solid fa-user-xmark"></i> Kick';
          kickBtn.addEventListener('click', () => kickUser(m.deviceId, m.friendlyName || 'Anonymous'));
          li.appendChild(kickBtn);
        }

        membersList.appendChild(li);
      });

      modalMembers.classList.remove('hidden');
    } catch (err) {
      console.error('Open members modal error:', err);
    }
  }

  async function createSingleUseInvite() {
    try {
      const customPin = inputModalCustomPin ? inputModalCustomPin.value.trim() : '';

      const res = await fetch('/api/channels/create-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: state.channelId,
          ownerDeviceId: state.deviceId,
          customPin: customPin || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        addNotification(data.error || 'Failed to create single-use invite PIN.', 'alert');
        return;
      }

      newInviteCodeText.textContent = data.inviteCode;
      generatedInviteBox.classList.remove('hidden');
      if (inputModalCustomPin) inputModalCustomPin.value = '';
    } catch (err) {
      console.error('Create invite error:', err);
    }
  }

  async function approveMember(targetDeviceId) {
    try {
      const res = await fetch('/api/channels/approve-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: state.channelId,
          ownerDeviceId: state.deviceId,
          targetDeviceId,
        }),
      });

      if (res.ok) {
        state.socket.emit('approve_user', {
          channelId: state.channelId,
          ownerDeviceId: state.deviceId,
          targetDeviceId,
        });

        // Fetch the approved member's friendly name
        const profile = await fetchServerProfile(targetDeviceId);
        const displayName = profile.friendlyName || targetDeviceId.substring(0, 8) + '...';
        addNotification(`${displayName} was approved and joined the channel.`, 'info');
        openMembersModal();
      }
    } catch (err) {
      console.error('Approve member error:', err);
    }
  }

  async function denyMember(targetDeviceId) {
    try {
      const res = await fetch('/api/channels/deny-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: state.channelId,
          ownerDeviceId: state.deviceId,
          targetDeviceId,
        }),
      });

      if (res.ok) {
        state.socket.emit('deny_user', {
          channelId: state.channelId,
          ownerDeviceId: state.deviceId,
          targetDeviceId,
        });

        const profile = await fetchServerProfile(targetDeviceId);
        const displayName = profile.friendlyName || targetDeviceId.substring(0, 8) + '...';
        addNotification(`${displayName} was denied access.`, 'info');
        openMembersModal();
      }
    } catch (err) {
      console.error('Deny member error:', err);
    }
  }

  async function kickUser(targetDeviceId, displayName) {
    // Custom confirm modal instead of browser confirm()
    const confirmed = await showConfirmModal(
      'Kick Member',
      `Are you sure you want to permanently kick "${displayName}" from this channel? They will not be able to rejoin.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/channels/kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: state.channelId,
          ownerDeviceId: state.deviceId,
          targetDeviceId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        addNotification(data.error || 'Failed to kick user.', 'alert');
        return;
      }

      state.socket.emit('kick_user', {
        channelId: state.channelId,
        ownerDeviceId: state.deviceId,
        targetDeviceId,
      });

      addNotification(`${displayName} was kicked from the channel.`, 'info');
      openMembersModal();
    } catch (err) {
      console.error('Kick user error:', err);
    }
  }

  function returnToDashboard() {
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
    state.channelId = '';
    state.channelPhrase = '';
    state.channelKey = null;
    state.isOwner = false;
    modalMembers.classList.add('hidden');
    showScreen('channel');
  }

  async function leaveChannel() {
    const confirmMsg = state.isOwner 
      ? 'As the channel owner, leaving will permanently CLOSE and DELETE this channel and wipe all chat history for all members. Continue?'
      : 'Are you sure you want to leave this channel? You will not be able to return or see chat history again.';

    // Custom confirm modal instead of browser confirm()
    const confirmed = await showConfirmModal(
      state.isOwner ? 'Close & Delete Channel' : 'Leave Channel',
      confirmMsg
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/channels/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: state.channelId,
          deviceId: state.deviceId,
        }),
      });

      const data = await res.json();

      if (state.socket) {
        state.socket.emit('leave_channel', {
          channelId: state.channelId,
          deviceId: state.deviceId,
        });
      }

      removeChannelFromVault(state.channelId);

      if (data.isOwnerLeave) {
        addNotification('Channel closed and permanently deleted.', 'info');
      }

      exitToChannelScreen();
    } catch (err) {
      console.error('Leave channel error:', err);
      removeChannelFromVault(state.channelId);
      exitToChannelScreen();
    }
  }

  function exitToChannelScreen() {
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
    state.channelId = '';
    state.channelPhrase = '';
    state.channelKey = null;
    state.isOwner = false;
    modalMembers.classList.add('hidden');
    showScreen('channel');
  }

  function scrollToBottom() {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
});
