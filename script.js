        // ============================================================
        // IMPORTS
        // ============================================================
        import { initializeApp } from "firebase/app";
        import {
            getAuth,
            signInWithEmailAndPassword,
            createUserWithEmailAndPassword,
            onAuthStateChanged,
            signOut,
            updatePassword,
            EmailAuthProvider,
            reauthenticateWithCredential,
            GoogleAuthProvider,
            signInWithPopup,
            sendPasswordResetEmail
        } from "firebase/auth";
        import {
            getFirestore,
            doc,
            onSnapshot,
            updateDoc,
            setDoc,
            arrayUnion,
            deleteField,
            getDoc,
            runTransaction
        } from "firebase/firestore";

        // ============================================================
        // CONFIG
        // ============================================================
        const firebaseConfig = {
            apiKey: "AIzaSyC75_Oqo4wc7Jx58wfkkoQML9YxgP24QR4",
            authDomain: "bronzx.firebaseapp.com",
            projectId: "bronzx",
            storageBucket: "bronzx.firebasestorage.app",
            messagingSenderId: "155159545642",
            appId: "1:155159545642:web:1d615183d1cdee3bdac053"
        };

        const workerUrl = "https://srt-telegram-bot.samratsubedi163.workers.dev";
        const ESEWA_DISPLAY_NUMBER = "9827260865";

        // ============================================================
        // APP INIT
        // ============================================================
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const googleProvider = new GoogleAuthProvider();

        // ============================================================
        // STATE
        // ============================================================
        let currentUID = null;
        let currentUserEmail = null;
        let realtimeListener = null;
        let purchaseData = null;
        let currentBalance = 0;
        let selectedPaymentMethod = 'esewa'; // 'esewa' | 'balance'
        const PAYMENT_STORAGE_KEY = 'srtx_payment_state';

        // ============================================================
        // GLOBALS for inline handlers
        // ============================================================
        window.currentUID = currentUID;
        window.purchaseData = purchaseData;
        window.selectedPaymentMethod = selectedPaymentMethod;

        // ============================================================
        // HELPERS
        // ============================================================
        function getDate() {
            return new Date().toLocaleString('en-US', {
                timeZone: 'Asia/Kathmandu',
                hour12: true,
                hour: '2-digit',
                minute: '2-digit',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }

        function showToast(message, type = "info") {
            const existing = document.getElementById('srt-toast');
            if (existing) existing.remove();
            const toast = document.createElement('div');
            toast.id = 'srt-toast';
            const color = type === 'success' ? '#2dd4a8' : type === 'error' ? '#f15b6c' : '#a5b4fc';
            toast.style.cssText = `
                position:fixed;bottom:32px;left:50%;
                transform:translateX(-50%) translateY(20px);
                background:#181c25;color:${color};
                border:1px solid ${color}33;border-radius:10px;
                padding:13px 22px;font-family:'Inter',sans-serif;
                font-size:13.5px;font-weight:500;letter-spacing:0.2px;
                z-index:99999;box-shadow:0 12px 28px rgba(0,0,0,0.4);
                max-width:320px;text-align:center;opacity:0;
                transition:all 0.25s cubic-bezier(0.4,0,0.2,1);pointer-events:none;
            `;
            toast.innerText = message;
            document.body.appendChild(toast);
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(-50%) translateY(0)';
            });
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(10px)';
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }

        // ============================================================
        // VIEW MODE
        // ============================================================
        function detectDevice() {
            return window.innerWidth >= 1024 ? 'desktop' : 'mobile';
        }

        window.setViewMode = function(mode) {
            document.body.classList.toggle('desktop-mode', mode === 'desktop');
            document.getElementById('vtDesktop').classList.toggle('active', mode === 'desktop');
            document.getElementById('vtMobile').classList.toggle('active', mode === 'mobile');
            localStorage.setItem('srtx_view_mode', mode);
            if (mode === 'mobile') {
                document.getElementById('sideDrawer').classList.remove('active');
                document.getElementById('menuBtn').classList.remove('active');
                document.getElementById('menuOverlay').style.display = 'none';
            }
        };

        (function() {
            const saved = localStorage.getItem('srtx_view_mode');
            const mode = saved || detectDevice();
            window.setViewMode(mode);
        })();

        window.addEventListener('resize', () => {
            const saved = localStorage.getItem('srtx_view_mode');
            if (!saved) window.setViewMode(detectDevice());
        });

        // ============================================================
        // SEARCH & FILTER
        // ============================================================
        let activeFilter = 'all';
        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClear');
        const noResults = document.getElementById('noResults');
        const noResultsMsg = document.getElementById('noResultsMsg');
        const productCount = document.getElementById('productCount');

        function applyFilters() {
            const query = searchInput.value.trim().toLowerCase();
            let visible = 0;
            document.querySelectorAll('.product-row').forEach(row => {
                const name = (row.dataset.name || '').toLowerCase();
                const tags = (row.dataset.tags || '').toLowerCase();
                const matchesSearch = !query || name.includes(query);
                const tagList = tags.split(/[\s,]+/);
                const matchesFilter = activeFilter === 'all' || tagList.includes(activeFilter);
                if (matchesSearch && matchesFilter) { row.style.display = ''; visible++; } else row.style
                    .display = 'none';
            });
            productCount.textContent = visible + ' PRODUCT' + (visible !== 1 ? 'S' : '');
            if (visible === 0) {
                noResults.classList.add('show');
                noResultsMsg.textContent = query ? `No results for "${query}"` : `No ${activeFilter.toUpperCase()} products`;
            } else { noResults.classList.remove('show'); }
        }

        searchInput.addEventListener('input', () => {
            searchClear.classList.toggle('hidden', !searchInput.value);
            applyFilters();
        });

        window.clearSearch = () => {
            searchInput.value = '';
            searchClear.classList.add('hidden');
            applyFilters();
            searchInput.focus();
        };

        window.filterChip = (el, tag) => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active-chip'));
            el.classList.add('active-chip');
            activeFilter = tag;
            applyFilters();
            if (navigator.vibrate) navigator.vibrate(8);
        };

        document.addEventListener('DOMContentLoaded', () => {
            const total = document.querySelectorAll('.product-row').length;
            document.getElementById('productCount').textContent = total + ' PRODUCTS';
            applyFilters();
        });

        // ============================================================
        // CLOUDFLARE GATE
        // ============================================================
        let cfGatePassed = false;
        let cfGateWidgetId = null;

        window.onGateVerified = function(token) {
            cfGatePassed = true;
            const s = document.getElementById('cfGateStatus');
            if (s) { s.className = 'cf-status verified';
                s.innerHTML = '<i class="fas fa-check-circle"></i> Verified — tap NEXT to continue'; }
            const btn = document.getElementById('cfNextBtn');
            if (btn) { btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.style.boxShadow = '0 4px 20px rgba(0,232,122,0.35)'; }
        };
        window.onGateExpired = function() {
            cfGatePassed = false;
            const s = document.getElementById('cfGateStatus');
            if (s) { s.className = 'cf-status pending';
                s.innerHTML = '<i class="fas fa-shield-alt"></i> Verification expired — please redo'; }
            const btn = document.getElementById('cfNextBtn');
            if (btn) { btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
                btn.style.boxShadow = ''; }
        };
        window.onGateError = function() {
            cfGatePassed = false;
            const s = document.getElementById('cfGateStatus');
            if (s) { s.className = 'cf-status failed';
                s.innerHTML = '<i class="fas fa-times-circle"></i> Verification failed — try again'; }
            const btn = document.getElementById('cfNextBtn');
            if (btn) { btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
                btn.style.boxShadow = ''; }
        };

        window.proceedToLogin = function() {
            if (!cfGatePassed) return;
            document.getElementById('cfVerifyPage').classList.add('hidden');
            document.getElementById('authSection').classList.remove('hidden');
            history.replaceState(null, '', '#login');
        };

        function initGateWidget() {
            if (!window.turnstile) { setTimeout(initGateWidget, 300); return; }
            const el = document.getElementById('cfGateWidget');
            if (!el || cfGateWidgetId !== null) return;
            document.getElementById('cfVerifyLoading').style.display = 'none';
            document.getElementById('cfVerifyReady').style.display = 'block';
            cfGateWidgetId = window.turnstile.render(el, {
                sitekey: '0x4AAAAAADgSv0fKYVjwT1Q_',
                theme: 'dark',
                callback: window.onGateVerified,
                'expired-callback': window.onGateExpired,
                'error-callback': window.onGateError,
            });
        }

        document.addEventListener('DOMContentLoaded', initGateWidget);
        initGateWidget();

        // ============================================================
        // GOOGLE SIGN-IN
        // ============================================================
        window.handleGoogleSignIn = async () => {
            try {
                const result = await signInWithPopup(auth, googleProvider);
                const user = result.user;
                const userRef = doc(db, "users", user.uid);
                const snap = await getDoc(userRef);
                if (!snap.exists()) {
                    await setDoc(userRef, {
                        email: user.email || "",
                        name: user.displayName || "",
                        profileName: user.displayName || "",
                        profilePhone: "",
                        history: [],
                        adminMessage: "Welcome! Pay via eSewa or Balance to get your key 🔑",
                        requestStatus: "Active",
                        balance: 0,
                        balanceHistory: []
                    }, { merge: true });
                } else if (!snap.data().email && user.email) {
                    // Backfill email for accounts created before this fix
                    await updateDoc(userRef, { email: user.email });
                }
                showToast("Signed in with Google!", "success");
            } catch (err) {
                if (err.code !== 'auth/popup-closed-by-user') {
                    showToast("Google Sign-In failed: " + err.message, "error");
                }
            }
        };

        // ============================================================
        // FORGOT PASSWORD
        // ============================================================
        window.handleForgotPassword = async () => {
            const email = document.getElementById('loginEmail').value.trim() ||
                document.getElementById('regEmail').value.trim();
            if (!email) {
                return showToast("Enter your email above first, then tap Forgot Password", "error");
            }
            try {
                await sendPasswordResetEmail(auth, email);
                showToast("Password reset email sent! Check your inbox.", "success");
            } catch (err) {
                if (err.code === 'auth/user-not-found') {
                    showToast("No account found with that email.", "error");
                } else {
                    showToast("Failed: " + err.message, "error");
                }
            }
        };

        // ============================================================
        // AUTH STATE
        // ============================================================
        onAuthStateChanged(auth, (user) => {
            if (user) {
                if (!cfGatePassed) {
                    signOut(auth);
                    return;
                }
                currentUID = user.uid;
                currentUserEmail = user.email;
                document.getElementById('displayEmail').innerText = user.email || "User";
                showMainUI('storeUI');
                document.getElementById('cfVerifyPage').classList.add('hidden');
                document.getElementById('authSection').classList.add('hidden');
                startSync(user.uid);
                startTime();
                history.replaceState(null, '', '#store');
                // Check for unfinished payment
                const state = loadPaymentState();
                if (state && state.purchaseData && state.step >= 2) {
                    setTimeout(() => {
                        const banner = document.createElement('div');
                        banner.id = 'restoreBanner';
                        banner.style.cssText = `
                            position:fixed;bottom:0;left:0;right:0;
                            background:#181c25;border-top:1px solid rgba(240,162,58,0.4);
                            padding:14px 18px;z-index:9998;
                            display:flex;align-items:center;justify-content:space-between;gap:10px;
                            font-family:'Inter',sans-serif;
                        `;
                        banner.innerHTML = `
                            <div style="color:#f0a23a;font-size:13px;font-weight:500;">
                                <i class="fas fa-exclamation-triangle"></i>
                                Unfinished payment: <b>${state.purchaseData.name}</b> — Step ${state.step}/3
                            </div>
                            <div style="display:flex;gap:8px;flex-shrink:0;">
                                <button onclick="document.getElementById('restoreBanner').remove();clearPaymentState();"
                                    style="padding:7px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.5);font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;">
                                    DISCARD
                                </button>
                                <button onclick="document.getElementById('restoreBanner').remove();restorePaymentState(loadPaymentState(),loadPaymentState().step);"
                                    style="padding:7px 14px;border-radius:8px;border:none;background:#f0a23a;color:#000;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.2px;">
                                    RESUME PAYMENT
                                </button>
                            </div>
                        `;
                        document.body.appendChild(banner);
                    }, 800);
                }
            } else {
                if (realtimeListener) realtimeListener();
                currentUID = null;
                currentUserEmail = null;
                purchaseData = null;
                currentBalance = 0;
                if (cfGatePassed) {
                    showMainUI('authSection');
                    document.getElementById('cfVerifyPage').classList.add('hidden');
                }
                history.replaceState(null, '', cfGatePassed ? '#login' : '#verify');
            }
        });

        // ============================================================
        // AUTH ACTIONS
        // ============================================================
        document.getElementById('loginBtn').onclick = async () => {
            const email = document.getElementById('loginEmail').value.trim();
            const pass = document.getElementById('loginPass').value;
            if (!email || !pass) return showToast("Please enter email and password", "error");
            try {
                await signInWithEmailAndPassword(auth, email, pass);
            } catch (err) {
                showToast("Login Failed: " + err.message, "error");
            }
        };

        document.getElementById('signupBtn').onclick = async () => {
            const email = document.getElementById('regEmail').value.trim();
            const pass = document.getElementById('regPass').value;
            if (!email || !pass) return showToast("Please fill all fields", "error");
            if (pass.length < 6) return showToast("Password must be at least 6 characters", "error");
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                await setDoc(doc(db, "users", cred.user.uid), {
                    email: email,
                    name: "",
                    profileName: "",
                    profilePhone: "",
                    history: [],
                    adminMessage: "Welcome! Pay via eSewa or Balance to get your key 🔑",
                    requestStatus: "Active",
                    balance: 0,
                    balanceHistory: []
                }, { merge: true });
                showToast("Account created successfully!", "success");
            } catch (err) {
                showToast("Signup Failed: " + err.message, "error");
            }
        };

        window.handleLogout = () => {
            clearPaymentState();
            cfGatePassed = false;
            signOut(auth);
            document.getElementById('cfVerifyPage').classList.remove('hidden');
            document.getElementById('authSection').classList.add('hidden');
            document.getElementById('storeUI').classList.add('hidden');
            history.replaceState(null, '', '#verify');
            if (cfGateWidgetId !== null && window.turnstile) {
                try { window.turnstile.reset(cfGateWidgetId); } catch (e) {}
            }
            cfGatePassed = false;
            const btn = document.getElementById('cfNextBtn');
            if (btn) { btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
                btn.style.boxShadow = ''; }
            const s = document.getElementById('cfGateStatus');
            if (s) { s.className = 'cf-status pending';
                s.innerHTML = '<i class="fas fa-shield-alt"></i> Complete the verification above'; }
        };

        // ============================================================
        // SIDE MENU
        // ============================================================
        const menuBtn = document.getElementById('menuBtn');
        const sideDrawer = document.getElementById('sideDrawer');
        const menuOverlay = document.getElementById('menuOverlay');

        const toggleMenu = () => {
            if (document.body.classList.contains('desktop-mode')) return;
            const isOpen = sideDrawer.classList.toggle('active');
            menuBtn.classList.toggle('active');
            menuOverlay.style.display = isOpen ? 'block' : 'none';
        };
        menuBtn.onclick = toggleMenu;
        menuOverlay.onclick = toggleMenu;

        function closeMenu() {
            sideDrawer.classList.remove('active');
            menuBtn.classList.remove('active');
            menuOverlay.style.display = 'none';
        }

        // ============================================================
        // PROFILE
        // ============================================================
        window.saveProfile = async () => {
            const name = document.getElementById('profileName').value.trim();
            const phone = document.getElementById('profilePhone').value.trim();
            if (!name || !phone) return showToast("Please fill both fields", "error");
            if (!currentUID) return showToast("Not logged in", "error");
            try {
                await updateDoc(doc(db, "users", currentUID), {
                    profileName: name,
                    profilePhone: phone,
                    name: name,
                    whatsapp: phone,
                    email: currentUserEmail || ""
                });
                showToast("Profile saved!", "success");
                closeModals();
            } catch (e) {
                showToast("Failed: " + e.message, "error");
            }
        };

        function loadProfileToModal(data) {
            if (data.profileName) document.getElementById('profileName').value = data.profileName;
            if (data.profilePhone) document.getElementById('profilePhone').value = data.profilePhone;
            const uidEl = document.getElementById('profileUid');
            if (uidEl) uidEl.value = currentUID || '';
            const emailEl = document.getElementById('profileEmail');
            if (emailEl) emailEl.value = data.email || currentUserEmail || '';
        }

        // ============================================================
        // GENERIC COPY (used by profile UID/email copy buttons)
        // ============================================================
        window.copyText = (text) => {
            if (!text) return;
            navigator.clipboard.writeText(text)
                .then(() => showToast("Copied!", "success"))
                .catch(() => {
                    const el = document.createElement('textarea');
                    el.value = text;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                    showToast("Copied!", "success");
                });
        };

        // ============================================================
        // REAL-TIME SYNC (includes balance)
        // ============================================================
        function startSync(uid) {
            const userRef = doc(db, "users", uid);
            realtimeListener = onSnapshot(userRef, (snap) => {
                if (!snap.exists()) {
                    setDoc(userRef, {
                        email: currentUserEmail || "",
                        history: [],
                        adminMessage: "Welcome! Pay via eSewa or Balance to get your key 🔑",
                        requestStatus: "Active",
                        balance: 0,
                        balanceHistory: []
                    }, { merge: true });
                    return;
                }
                const data = snap.data();

                // Self-heal: backfill missing email for accounts created before this fix
                if (!data.email && currentUserEmail) {
                    updateDoc(userRef, { email: currentUserEmail }).catch(() => {});
                }

                // Status
                const statusEl = document.getElementById('userStatus');
                const statusDot = document.querySelector('.status-dot');
                statusEl.innerText = data.requestStatus || "Active";
                const status = (data.requestStatus || "Active").toLowerCase();
                if (status.includes("approved") || status === "active") statusDot.style.background = "#2dd4a8";
                else if (status.includes("pending")) statusDot.style.background = "#f0a23a";
                else if (status.includes("reject") || status.includes("ban")) statusDot.style.background = "#f15b6c";
                else statusDot.style.background = "#2dd4a8";

                // Admin message
                document.getElementById('adminMsg').innerText = data.adminMessage || "No messages.";

                // History
                renderHistory(data.history || []);

                // Profile
                loadProfileToModal(data);

                // ---- BALANCE ----
                currentBalance = data.balance || 0;
                document.getElementById('drawerBalance').innerText = currentBalance;
                updateBalanceUI();

                // Check for new key
                checkForNewKey(data.history || []);
            });
        }

        let lastKeyCount = 0;

        function checkForNewKey(history) {
            const keysDelivered = history.filter(h => h.key && h.status === 'SUCCESS');
            if (keysDelivered.length > lastKeyCount && lastKeyCount !== 0) {
                const newest = keysDelivered[keysDelivered.length - 1];
                showKeyDelivered(newest.key, newest.item || 'Your product');
            }
            lastKeyCount = keysDelivered.length;
        }

        function updateBalanceUI() {
            const bal = currentBalance || 0;
            const price = purchaseData ? purchaseData.price : 0;
            const insufMsg = document.getElementById('insufficientBalanceMsg');
            if (selectedPaymentMethod === 'balance' && price > 0 && bal < price) {
                insufMsg.classList.add('show');
            } else {
                insufMsg.classList.remove('show');
            }
            // Update the balance display in drawer (already updated via onSnapshot)
        }

        // ============================================================
        // HISTORY
        // ============================================================
        function renderHistory(history) {
            const container = document.getElementById('historyList');
            if (!history || history.length === 0) {
                container.innerHTML = `<p class="empty-msg">No orders yet.</p>`;
                return;
            }
            container.innerHTML = history.slice().reverse().map(item => `
                <div class="history-item">
                    <small>${item.date || ''}</small>
                    <p>${item.msg || item}</p>
                    ${item.status === 'PENDING_APPROVAL'
                        ? `<div class="pending-badge"><i class="fas fa-clock"></i> Waiting for admin approval</div>`
                        : ''}
                    ${item.status === 'SUCCESS' && item.key ? `
                    <div class="key-display">
                        <i class="fas fa-key"></i>
                        <span class="key-text">${item.key}</span>
                        <button class="key-copy-inline" onclick="copyKey('${item.key}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>` : ''}
                    ${item.paymentMethod === 'balance' ? `
                    <div style="font-size:10px;color:var(--gold);margin-top:4px;">
                        <i class="fas fa-coins"></i> Paid with Balance
                    </div>` : ''}
                </div>
            `).join('');
        }

        window.confirmDeleteHistory = () => document.getElementById('deleteWarning').classList.remove('hidden');
        window.hideDeleteWarning = () => document.getElementById('deleteWarning').classList.add('hidden');

        window.processHistoryDelete = async () => {
            if (!currentUID) return;
            try {
                await updateDoc(doc(db, "users", currentUID), { history: deleteField() });
                hideDeleteWarning();
                closeModals();
                showToast("History cleared!", "success");
            } catch (e) {
                showToast("Failed to clear history", "error");
            }
        };

        // ============================================================
        // PASSWORD UPDATE
        // ============================================================
        window.processPassUpdate = async () => {
            const oldP = document.getElementById('oldPass').value.trim();
            const newP = document.getElementById('newPass').value.trim();
            const user = auth.currentUser;
            if (!oldP || !newP) return showToast("Please fill both fields", "error");
            if (newP.length < 6) return showToast("Min 6 characters", "error");
            try {
                const credential = EmailAuthProvider.credential(user.email, oldP);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newP);
                showToast("Password updated!", "success");
                closeModals();
                document.getElementById('oldPass').value = '';
                document.getElementById('newPass').value = '';
            } catch (error) {
                showToast(error.code === 'auth/wrong-password' ? "Wrong current password!" : "Failed: " + error.message,
                "error");
            }
        };

        // ============================================================
        // PRODUCT SELECTION
        // ============================================================
        window.togglePrices = (id) => {
            const section = document.getElementById(id);
            if (!section) return;
            section.classList.toggle('hidden');
            if (navigator.vibrate) navigator.vibrate(10);
        };

        window.selectItem = (el, name, price) => {
            document.querySelectorAll('.price-item').forEach(c => c.classList.remove('active'));
            el.classList.add('active');
            purchaseData = { name, price, selectedAt: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' }) };
            const buyBtn = el.closest('.price-list').querySelector('.buy-btn');
            if (buyBtn) buyBtn.classList.remove('hidden');
            if (navigator.vibrate) navigator.vibrate(15);
            // Update balance UI in case payment method is balance
            updateBalanceUI();
        };

        // ============================================================
        // PAYMENT METHOD TOGGLE
        // ============================================================
        window.setPaymentMethod = (method) => {
            selectedPaymentMethod = method;
            document.querySelectorAll('.pm-option').forEach(el => {
                el.classList.toggle('active', el.dataset.pm === method);
            });
            const nextBtn = document.getElementById('checkoutNextBtn');
            const payBalanceBtn = document.getElementById('checkoutPayBalanceBtn');
            const nextLabel = document.getElementById('checkoutNextLabel');

            if (method === 'esewa') {
                nextBtn.classList.remove('hidden');
                payBalanceBtn.classList.add('hidden');
                nextLabel.innerText = 'NEXT';
                document.getElementById('insufficientBalanceMsg').classList.remove('show');
            } else {
                nextBtn.classList.add('hidden');
                payBalanceBtn.classList.remove('hidden');
                // Check balance
                const bal = currentBalance || 0;
                const price = purchaseData ? purchaseData.price : 0;
                if (bal < price) {
                    document.getElementById('insufficientBalanceMsg').classList.add('show');
                    payBalanceBtn.disabled = true;
                    payBalanceBtn.style.opacity = '0.4';
                    payBalanceBtn.style.pointerEvents = 'none';
                } else {
                    document.getElementById('insufficientBalanceMsg').classList.remove('show');
                    payBalanceBtn.disabled = false;
                    payBalanceBtn.style.opacity = '1';
                    payBalanceBtn.style.pointerEvents = 'auto';
                }
            }
            updateBalanceUI();
        };

        // ============================================================
        // CHECKOUT — STEP 1
        // ============================================================
        window.startCheckout = () => {
            if (!purchaseData) return showToast("Please select a product first!", "error");
            openModal('checkoutModal');

            document.getElementById('orderSummaryBox').innerHTML = `
                <span class="item-name">${purchaseData.name}</span>
                <span class="item-price">Rs ${purchaseData.price}</span>
            `;

            // Reset payment method to eSewa by default
            selectedPaymentMethod = 'esewa';
            document.querySelectorAll('.pm-option').forEach(el => {
                el.classList.toggle('active', el.dataset.pm === 'esewa');
            });
            document.getElementById('checkoutNextBtn').classList.remove('hidden');
            document.getElementById('checkoutPayBalanceBtn').classList.add('hidden');
            document.getElementById('insufficientBalanceMsg').classList.remove('show');

            // Auto-fill profile
            if (currentUID) {
                getDoc(doc(db, "users", currentUID)).then(snap => {
                    if (!snap.exists()) return;
                    const data = snap.data();
                    if (data.profileName) document.getElementById('payName').value = data.profileName;
                    if (data.profilePhone) document.getElementById('payWA').value = data.profilePhone;
                    const note = document.getElementById('autofillNote');
                    if (data.profileName || data.profilePhone) {
                        note.innerHTML = '<i class="fas fa-check-circle"></i> Auto-filled from profile';
                    } else {
                        note.innerHTML = '<i class="fas fa-info-circle" style="color:var(--text3)"></i> <span style="color:var(--text3)">Set profile to auto-fill next time</span>';
                    }
                });
            }

            showStep(1);
            savePaymentState(1);
            updateBalanceUI();
        };

        // ============================================================
        // HANDLE CHECKOUT NEXT (eSewa flow)
        // ============================================================
        window.handleCheckoutNext = () => {
            if (selectedPaymentMethod === 'balance') {
                // This should not happen because the balance button is shown separately
                return;
            }
            const name = document.getElementById('payName').value.trim();
            const wa = document.getElementById('payWA').value.trim();
            if (!name || !wa) return showToast("Please enter your Name and WhatsApp!", "error");
            showQR();
        };

        // ============================================================
        // CHECKOUT — STEP 2 (eSewa QR)
        // ============================================================
        window.showQR = () => {
            const name = document.getElementById('payName').value.trim();
            const wa = document.getElementById('payWA').value.trim();
            if (!name || !wa) return showToast("Please enter your Name and WhatsApp!", "error");

            document.getElementById('esewaAmount').textContent = `Rs ${purchaseData.price}`;
            document.getElementById('esewaMerchant').textContent = ESEWA_DISPLAY_NUMBER;

            showStep(2);
            savePaymentState(2);

            let sec = 15;
            const btn = document.getElementById('finalPayBtn');
            btn.disabled = true;
            btn.classList.add('disabled');
            document.getElementById('timerSec').innerText = sec;

            const clock = setInterval(() => {
                sec--;
                document.getElementById('timerSec').innerText = sec;
                if (sec <= 0) {
                    clearInterval(clock);
                    btn.disabled = false;
                    btn.classList.remove('disabled');
                }
            }, 1000);
        };

        // ============================================================
        // CHECKOUT — STEP 3 (eSewa TX)
        // ============================================================
        window.showVerifyStep = () => {
            document.getElementById('esewaTransCode').value = '';
            document.getElementById('esewaUserId').value = '';
            const waVal = document.getElementById('payWA').value.trim();
            if (waVal) document.getElementById('esewaUserId').value = waVal;
            showStep(3);
            savePaymentState(3);
            const txInput = document.getElementById('esewaTransCode');
            const idInput = document.getElementById('esewaUserId');
            const autoSaveFields = () => savePaymentState(3);
            txInput.addEventListener('input', autoSaveFields);
            idInput.addEventListener('input', autoSaveFields);
        };

        function showStep(n) {
            ['checkoutStep1', 'checkoutStep2', 'checkoutStep3'].forEach((id, i) => {
                document.getElementById(id).classList.toggle('hidden', i + 1 !== n);
            });
        }

        // ============================================================
        // SUBMIT ESEWA ORDER
        // ============================================================
        window.submitEsewaOrder = async () => {
            if (!currentUID) return showToast("Please login again.", "error");
            if (!purchaseData) return showToast("No item selected!", "error");

            const esewaId = document.getElementById('esewaUserId').value.trim();
            const txCode = document.getElementById('esewaTransCode').value.trim().toUpperCase();

            if (!txCode) return showToast("Enter your eSewa transaction ID!", "error");
            if (!esewaId) return showToast("Enter your eSewa ID (phone/email)!", "error");

            const submitBtn = document.getElementById('verifyPayBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>SUBMITTING...</span>';

            // Check duplicate TX
            try {
                const userSnap = await getDoc(doc(db, "users", currentUID));
                if (userSnap.exists()) {
                    const existing = (userSnap.data().history || []);
                    const duplicate = existing.some(h => h.txCode && h.txCode.toUpperCase() === txCode);
                    if (duplicate) {
                        showToast("This transaction ID was already submitted!", "error");
                        resetSubmitBtn(submitBtn);
                        return;
                    }
                }
            } catch (e) { /* continue */ }

            const name = document.getElementById('payName').value.trim();
            const waNum = document.getElementById('payWA').value.trim();
            const date = getDate();

            try {
                await updateDoc(doc(db, "users", currentUID), {
                    requestStatus: "Key Pending",
                    history: arrayUnion({
                        date,
                        uid: currentUID,
                        email: currentUserEmail,
                        msg: `PENDING: ${purchaseData.name} — Rs ${purchaseData.price} — TX: ${txCode}`,
                        item: purchaseData.name,
                        price: purchaseData.price,
                        txCode,
                        esewaId,
                        name,
                        waNum,
                        status: 'PENDING_APPROVAL',
                        cfVerified: true,
                        paymentMethod: 'esewa'
                    })
                });
            } catch (e) {
                showToast("Failed to save order: " + e.message, "error");
                resetSubmitBtn(submitBtn);
                return;
            }

            // Telegram notification
            const tgMessage =
                `🔔 *NEW ESEWA PAYMENT*\n✅ *CF Turnstile: VERIFIED*\n\n🛍 *Product:* ${purchaseData.name}\n💰 *Amount:* Rs ${purchaseData.price}\n📋 *TX Code:* \`${txCode}\`\n📱 *eSewa ID:* ${esewaId}\n\n👤 *Customer:*\n  Name: ${name}\n  WhatsApp: ${waNum}\n  Email: ${currentUserEmail}\n  UID: \`${currentUID}\`\n\n📅 ${date}\n\n🔗 [Open Admin Panel](https://srtxcheat.github.io/Ad/)
                  ➡️ Admin: Verify & deliver key.`;

            try {
                await fetch(workerUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: tgMessage })
                });
            } catch (e) { console.warn("Telegram notify failed:", e.message); }

            clearPaymentState();
            closeModals();
            history.replaceState(null, '', '#store');
            showOrderSubmitted(txCode, 'esewa');
            resetAfterPurchase();
        };

        // ============================================================
        // BALANCE PAYMENT
        // ============================================================
        window.processBalancePayment = async () => {
            if (!currentUID) return showToast("Please login again.", "error");
            if (!purchaseData) return showToast("No item selected!", "error");

            const price = purchaseData.price;
            const bal = currentBalance || 0;

            if (bal < price) {
                showToast("Insufficient balance! Please top up or use eSewa.", "error");
                return;
            }

            const name = document.getElementById('payName').value.trim();
            const waNum = document.getElementById('payWA').value.trim();
            if (!name || !waNum) return showToast("Please enter your Name and WhatsApp!", "error");

            const payBtn = document.getElementById('checkoutPayBalanceBtn');
            payBtn.disabled = true;
            payBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>PROCESSING...</span>';

            const date = getDate();
            const txCode = 'BAL-' + Date.now().toString(36).toUpperCase();

            try {
                const userRef = doc(db, "users", currentUID);

                // Use transaction to atomically deduct balance and add order
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(userRef);
                    if (!snap.exists()) throw new Error("User not found");

                    const data = snap.data();
                    const currentBal = data.balance || 0;
                    if (currentBal < price) throw new Error("Insufficient balance");

                    const newBal = currentBal - price;
                    const historyEntry = {
                        amount: -price,
                        date: date,
                        note: `Purchase: ${purchaseData.name}`,
                        type: 'purchase',
                        orderId: txCode
                    };

                    transaction.update(userRef, {
                        balance: newBal,
                        balanceHistory: arrayUnion(historyEntry),
                        requestStatus: "Key Pending",
                        history: arrayUnion({
                            date,
                            uid: currentUID,
                            email: currentUserEmail,
                            msg: `PENDING: ${purchaseData.name} — Rs ${purchaseData.price} — TX: ${txCode} (Balance)`,
                            item: purchaseData.name,
                            price: purchaseData.price,
                            txCode,
                            name,
                            waNum,
                            status: 'PENDING_APPROVAL',
                            cfVerified: true,
                            paymentMethod: 'balance',
                            balanceDeducted: price
                        })
                    });
                });

                // Update local balance
                currentBalance = currentBalance - price;
                document.getElementById('drawerBalance').innerText = currentBalance;

                // Telegram notification for balance payment
                const tgMsg =
                    `🔔 *NEW BALANCE PAYMENT*\n✅ *CF Turnstile: VERIFIED*\n\n🛍 *Product:* ${purchaseData.name}\n💰 *Amount:* Rs ${purchaseData.price}\n📋 *TX Code:* \`${txCode}\`\n💳 *Payment Method:* BALANCE\n\n👤 *Customer:*\n  Name: ${name}\n  WhatsApp: ${waNum}\n  Email: ${currentUserEmail}\n  UID: \`${currentUID}\`\n\n📅 ${date}\n\n📌 Balance after: Rs ${currentBalance}\n 🔗 [Open Admin Panel](https://srtxcheat.github.io/Ad/)
                    ➡️ Admin: Verify & deliver key.`;

                try {
                    await fetch(workerUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: tgMsg })
                    });
                } catch (e) { console.warn("Telegram notify failed:", e.message); }

                clearPaymentState();
                closeModals();
                history.replaceState(null, '', '#store');
                showOrderSubmitted(txCode, 'balance');
                resetAfterPurchase();
                showToast(`Paid Rs ${price} from balance. Order submitted.`, "success");

            } catch (e) {
                showToast("Balance payment failed: " + e.message, "error");
                payBtn.disabled = false;
                payBtn.innerHTML = '<i class="fas fa-coins"></i> <span>PAY WITH BALANCE</span>';
                // Refresh balance
                const snap = await getDoc(doc(db, "users", currentUID));
                if (snap.exists()) {
                    currentBalance = snap.data().balance || 0;
                    document.getElementById('drawerBalance').innerText = currentBalance;
                    updateBalanceUI();
                }
            }
        };

        // ============================================================
        // TOP-UP BALANCE (eSewa) — quick amounts, step nav, submit
        // ============================================================
        window.updateTopupDisplay = () => {
            const amt = parseInt(document.getElementById('topupAmount').value) || 0;
            document.getElementById('topupEsewaAmount').textContent = `Rs ${amt}`;
            document.querySelectorAll('.quick-amt').forEach(b => {
                b.classList.toggle('active', parseInt(b.textContent.replace(/\D/g, '')) === amt);
            });
        };

        window.setTopupAmount = (amount, btn) => {
            document.getElementById('topupAmount').value = amount;
            updateTopupDisplay();
            if (navigator.vibrate) navigator.vibrate(10);
        };

        window.showTopupStep2 = () => {
            const amount = parseInt(document.getElementById('topupAmount').value);
            if (!amount || amount < 50) return showToast("Enter a valid amount (min Rs 50)", "error");

            document.getElementById('topupSummaryAmount').textContent = `Rs ${amount}`;
            document.getElementById('topupStep1').classList.add('hidden');
            document.getElementById('topupStep2').classList.remove('hidden');

            // Prefill eSewa ID with saved WhatsApp number, if any
            const waVal = document.getElementById('profilePhone').value.trim();
            const idInput = document.getElementById('topupEsewaUserId');
            if (waVal && !idInput.value) idInput.value = waVal;
        };

        window.submitTopup = async () => {
            if (!currentUID) return showToast("Please login again.", "error");

            const amount = parseInt(document.getElementById('topupAmount').value);
            const esewaId = document.getElementById('topupEsewaUserId').value.trim();
            const txCode = document.getElementById('topupTransCode').value.trim().toUpperCase();

            if (!amount || amount < 50) return showToast("Enter a valid amount!", "error");
            if (!esewaId) return showToast("Enter your eSewa ID (phone/email)!", "error");
            if (!txCode) return showToast("Enter your eSewa transaction ID!", "error");

            const submitBtn = document.getElementById('topupSubmitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>SUBMITTING...</span>';

            // Prevent duplicate transaction ID submissions
            try {
                const userSnap = await getDoc(doc(db, "users", currentUID));
                if (userSnap.exists()) {
                    const existing = userSnap.data().topupRequests || [];
                    const duplicate = existing.some(t => t.txCode && t.txCode.toUpperCase() === txCode);
                    if (duplicate) {
                        showToast("This transaction ID was already submitted!", "error");
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i><span>SUBMIT TOP-UP</span>';
                        return;
                    }
                }
            } catch (e) { /* continue */ }

            const date = getDate();
            const name = document.getElementById('profileName').value.trim() || currentUserEmail || 'N/A';
            const wa = document.getElementById('profilePhone').value.trim() || esewaId;

            const topupEntry = {
                date,
                amount,
                esewaId,
                txCode,
                status: 'PENDING',
                uid: currentUID,
                email: currentUserEmail || ''
            };

            try {
                await updateDoc(doc(db, "users", currentUID), {
                    topupRequests: arrayUnion(topupEntry)
                });
            } catch (e) {
                showToast("Failed to save top-up: " + e.message, "error");
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i><span>SUBMIT TOP-UP</span>';
                return;
            }

            // Notify admin via Telegram bot (Cloudflare worker)
            const tgMessage =
                `💰 *NEW TOP-UP REQUEST*\n\n💵 *Amount:* Rs ${amount}\n📋 *TX Code:* \`${txCode}\`\n📱 *eSewa ID:* ${esewaId}\n\n👤 *Customer:*\n  Name: ${name}\n  WhatsApp: ${wa}\n  Email: ${currentUserEmail || 'N/A'}\n  UID: \`${currentUID}\`\n\n📅 ${date}\n\n🔗 [Open Admin Panel](https://srtxcheat.github.io/Ad/)\n➡️ Admin: Go to Balance Management → search this UID → Add Balance.`;

            try {
                await fetch(workerUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: tgMessage })
                });
            } catch (e) { console.warn("Telegram notify failed:", e.message); }

            closeModals();
            document.getElementById('topupStep1').classList.remove('hidden');
            document.getElementById('topupStep2').classList.add('hidden');
            document.getElementById('topupEsewaUserId').value = '';
            document.getElementById('topupTransCode').value = '';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i><span>SUBMIT TOP-UP</span>';
            showToast("Top-up request submitted! Balance will be credited shortly.", "success");
        };

        // ============================================================
        // ORDER SUBMITTED POPUP
        // ============================================================
        function showOrderSubmitted(txCode, method) {
            const popup = document.getElementById('autoPopup');
            const msgArea = document.getElementById('popupMsg');
            if (!popup || !msgArea) return;

            const methodLabel = method === 'balance' ? 'BALANCE' : 'ESEWA';
            const methodIcon = method === 'balance' ? 'fa-coins' : 'fa-mobile-alt';
            const methodColor = method === 'balance' ? 'var(--gold)' : 'var(--green)';

            msgArea.innerHTML = `
                <div class="popup-status status-pending">ORDER SUBMITTED</div>
                <p style="font-size:13px;margin:10px 0;color:var(--text2)">Your payment is being verified by admin.</p>
                <div style="background:var(--bg2);border:1px solid rgba(232,162,58,0.25);border-radius:8px;padding:10px;margin:10px 0;">
                    <p style="font-size:11px;color:var(--text3);margin:0 0 4px 0;">TRANSACTION ID</p>
                    <p style="font-size:14px;color:var(--orange);font-weight:700;margin:0;">${txCode}</p>
                </div>
                <div style="background:var(--bg2);border:1px solid rgba(45,212,168,0.2);border-radius:8px;padding:8px 10px;margin:6px 0;display:flex;align-items:center;gap:8px;justify-content:center;">
                    <i class="fas ${methodIcon}" style="color:${methodColor};font-size:14px;"></i>
                    <span style="font-size:11px;color:${methodColor};font-weight:600;">${methodLabel} PAYMENT</span>
                    <span style="font-size:9px;color:var(--text3);">•</span>
                    <i class="fab fa-cloudflare" style="color:#f97316;font-size:14px;"></i>
                    <span style="font-size:11px;color:var(--green);font-weight:600;">CF verified</span>
                </div>
                <p style="font-size:11px;color:var(--text3);margin-top:8px;">
                    You'll receive your key in Order History once approved.<br>
                    Usually within a few minutes during service hours (8AM–10PM).
                </p>
            `;
            popup.classList.remove('hidden');
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }

        // ============================================================
        // KEY DELIVERED POPUP
        // ============================================================
        function showKeyDelivered(key, productName) {
            const popup = document.getElementById('autoPopup');
            const msgArea = document.getElementById('popupMsg');
            if (!popup || !msgArea) return;
            const safeKey = key.replace(/'/g, "\\'");
            msgArea.innerHTML = `
                <div class="popup-status status-approved">KEY DELIVERED</div>
                <p style="font-size:12px;margin-bottom:12px;color:var(--text2)">${productName}</p>
                <div class="key-display-popup">
                    <i class="fas fa-key"></i>
                    <span>${key}</span>
                </div>
                <button onclick="copyKey('${safeKey}')" class="copy-key-btn">
                    <i class="fas fa-copy"></i> COPY KEY
                </button>
                <p style="font-size:11px;color:var(--text3);margin-top:12px;">
                    Also saved in Order History
                </p>
            `;
            popup.classList.remove('hidden');
            if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
        }

        // ============================================================
        // COPY KEY
        // ============================================================
        window.copyKey = (key) => {
            navigator.clipboard.writeText(key)
                .then(() => showToast("Key copied!", "success"))
                .catch(() => {
                    const el = document.createElement('textarea');
                    el.value = key;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                    showToast("Key copied!", "success");
                });
            if (navigator.vibrate) navigator.vibrate(30);
        };

        // ============================================================
        // PAYMENT STATE PERSISTENCE
        // ============================================================
        function savePaymentState(step, extraData = {}) {
            const state = {
                step,
                purchaseData,
                payName: document.getElementById('payName')?.value || '',
                payWA: document.getElementById('payWA')?.value || '',
                esewaUserId: document.getElementById('esewaUserId')?.value || '',
                esewaTransCode: document.getElementById('esewaTransCode')?.value || '',
                savedAt: Date.now(),
                ...extraData
            };
            localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(state));
            if (step >= 1 && step <= 3) {
                history.replaceState(null, '', '#payment/' + step);
            }
        }

        function loadPaymentState() {
            try {
                const raw = localStorage.getItem(PAYMENT_STORAGE_KEY);
                if (!raw) return null;
                const state = JSON.parse(raw);
                if (Date.now() - state.savedAt > 2 * 60 * 60 * 1000) {
                    clearPaymentState();
                    return null;
                }
                return state;
            } catch (e) { return null; }
        }

        function clearPaymentState() {
            localStorage.removeItem(PAYMENT_STORAGE_KEY);
        }

        function restorePaymentState(state, targetStep) {
            if (!state || !state.purchaseData) return;
            purchaseData = state.purchaseData;
            document.getElementById('modalOverlay').classList.remove('hidden');
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            document.getElementById('checkoutModal').classList.remove('hidden');
            if (state.payName) document.getElementById('payName').value = state.payName;
            if (state.payWA) document.getElementById('payWA').value = state.payWA;
            document.getElementById('orderSummaryBox').innerHTML = `
                <span class="item-name">${purchaseData.name}</span>
                <span class="item-price">Rs ${purchaseData.price}</span>
            `;
            if (targetStep === 1) { showStep(1); } else if (targetStep === 2) {
                document.getElementById('esewaAmount').textContent = `Rs ${purchaseData.price}`;
                document.getElementById('esewaMerchant').textContent = ESEWA_DISPLAY_NUMBER;
                showStep(2);
                const btn = document.getElementById('finalPayBtn');
                btn.disabled = false;
                btn.classList.remove('disabled');
                document.getElementById('timerSec').innerText = '0';
                showToast("Restored: Payment QR step", "info");
            } else if (targetStep === 3) {
                if (state.esewaUserId) document.getElementById('esewaUserId').value = state.esewaUserId;
                if (state.esewaTransCode) document.getElementById('esewaTransCode').value = state.esewaTransCode;
                showStep(3);
                showToast("Restored: Submit order step", "success");
            }
        }

        // Expose for banner
        window.loadPaymentState = loadPaymentState;
        window.clearPaymentState = clearPaymentState;
        window.restorePaymentState = restorePaymentState;

        // ============================================================
        // RESET AFTER PURCHASE
        // ============================================================
        function resetAfterPurchase() {
            purchaseData = null;
            document.querySelectorAll('.price-item').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.buy-btn').forEach(b => b.classList.add('hidden'));
            document.getElementById('payName').value = '';
            document.getElementById('payWA').value = '';
            document.getElementById('checkoutPayBalanceBtn').innerHTML =
                '<i class="fas fa-coins"></i> <span>PAY WITH BALANCE</span>';
            document.getElementById('checkoutPayBalanceBtn').disabled = false;
            document.getElementById('checkoutPayBalanceBtn').style.opacity = '1';
            document.getElementById('checkoutPayBalanceBtn').style.pointerEvents = 'auto';
        }

        function resetSubmitBtn(btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>SUBMIT ORDER</span>';
        }

        // ============================================================
        // UI HELPERS
        // ============================================================
        window.toggleAuth = (mode) => {
            document.getElementById('loginBox').classList.toggle('hidden', mode === 'signup');
            document.getElementById('signupBox').classList.toggle('hidden', mode === 'login');
            history.replaceState(null, '', '#' + mode);
        };

        function showMainUI(id) {
            document.getElementById('authSection').classList.add('hidden');
            document.getElementById('storeUI').classList.add('hidden');
            document.getElementById(id).classList.remove('hidden');
        }

        window.openModal = (id) => {
            document.getElementById('modalOverlay').classList.remove('hidden');
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const modal = document.getElementById(id);
            if (modal) modal.classList.remove('hidden');
            closeMenu();
            if (id === 'profileModal' && currentUID) {
                const uidEl = document.getElementById('profileUid');
                if (uidEl) uidEl.value = currentUID;
                const emailEl = document.getElementById('profileEmail');
                if (emailEl) emailEl.value = currentUserEmail || '';
                getDoc(doc(db, "users", currentUID)).then(snap => {
                    if (snap.exists()) loadProfileToModal(snap.data());
                });
            }
            if (id === 'topupModal') {
                document.getElementById('topupStep1').classList.remove('hidden');
                document.getElementById('topupStep2').classList.add('hidden');
                document.getElementById('topupAmount').value = 100;
                updateTopupDisplay();
            }
        };

        window.closeModals = () => {
            document.getElementById('modalOverlay').classList.add('hidden');
            if (window.location.hash.startsWith('#payment/')) {
                history.replaceState(null, '', '#store');
            }
        };

        // ============================================================
        // LIVE CLOCK
        // ============================================================
        function startTime() {
            const tick = () => {
                const timeEl = document.getElementById('currentTime');
                if (timeEl) timeEl.innerText = new Date().toLocaleTimeString('en-IN');
            };
            tick();
            setInterval(tick, 1000);
        }

        // ============================================================
        // INITIAL SETUP
        // ============================================================
        // Make sure the balance payment button shows correct state
        document.addEventListener('DOMContentLoaded', () => {
            // Ensure payment method is set to eSewa by default
            setPaymentMethod('esewa');
        });

        console.log("✅ SRT X CHEATS store loaded with Balance + eSewa payment methods.");
        console.log("📌 Admin panel URL: admin.html");
        console.log("📌 Manage user balances in admin panel → Balance Management.");
