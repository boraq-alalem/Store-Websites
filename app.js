// app.js (ES Module)
// - Initializes Firebase + Firestore
// - Handles Add Website form (Firestone write)
// - Renders websites from Firestore with thum.io snapshots and localStorage caching
// - Provides category filtering and clickable cards

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const PLACEHOLDER_IMG = "https://via.placeholder.com/600x400?text=No+Preview";

// Firebase config (provided)
const firebaseConfig = {
    apiKey: "AIzaSyDQYrRdQRNvAbejfzBoMJFYsY83G-eRknU",
    authDomain: "sites-store.firebaseapp.com",
    projectId: "sites-store",
    storageBucket: "sites-store.firebasestorage.app",
    messagingSenderId: "332692423988",
    appId: "1:332692423988:web:e327b83740174bcd975161",
    measurementId: "G-4EGBK2GTLH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
analyticsIsSupported().then((ok) => { if (ok) { try { getAnalytics(app); } catch { } } });
const db = getFirestore(app);

// In Firestore mode, we no longer store sites in localStorage.

/**
 * Normalize and validate a URL. Adds https:// if missing.
 * Returns null if the URL is invalid.
 * @param {string} input
 * @returns {string|null}
 */
function normalizeUrl(input) {
    if (!input) return null;
    let url = input.trim();
    if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
    }
    try {
        // Validate
        const u = new URL(url);
        return u.toString();
    } catch {
        return null;
    }
}

/**
 * Show a temporary message in the Add form.
 * @param {string} text
 * @param {"success"|"error"} variant
 */
function showFormMessage(text, variant) {
    const box = document.getElementById("formMessage");
    if (!box) return;
    box.textContent = text;
    box.classList.remove("hidden", "success", "error");
    box.classList.add(variant);
    // Auto-hide after a delay for success only
    if (variant === "success") {
        setTimeout(() => {
            box.classList.add("hidden");
            box.textContent = "";
        }, 2200);
    }
}

/**
 * Firestore: add a website document
 * @param {{name:string,url:string,category:string,description:string}} site
 */
async function addWebsite(site) {
    const name = String(site?.name || "").trim();
    const url = normalizeUrl(site?.url || "");
    const category = String(site?.category || "").trim();
    const description = String(site?.description || "").trim();
    const mainCategory = String(site?.mainCategory || "").trim();
    const subCategory = String(site?.subCategory || "").trim();

    if (!name) throw new Error("Name is required");
    if (!url) throw new Error("Valid URL is required");
    if (!category) throw new Error("Category is required");
    if (!mainCategory) throw new Error("Main category is required");
    if (!subCategory) throw new Error("Sub-category is required");

    await upsertCategory(mainCategory, subCategory);
    const docRef = await addDoc(collection(db, "websites"), {
        name, url, category, description, mainCategory, subCategory, createdAt: serverTimestamp()
    });
    return docRef.id;
}

/** Get all websites once from Firestore */
async function getWebsites() {
    const snap = await getDocs(collection(db, "websites"));
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    return items;
}

/** Realtime subscribe to websites */
function subscribeWebsites(callback) {
    return onSnapshot(collection(db, "websites"), (snap) => {
        const items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        callback(items);
    }, (err) => {
        console.error("onSnapshot error:", err);
    });
}

/** Update website by id */
async function updateWebsite(id, data) {
    const ref = doc(db, "websites", id);
    if (data.mainCategory && data.subCategory) {
        await upsertCategory(String(data.mainCategory), String(data.subCategory));
    }
    await updateDoc(ref, data);
}

/** Delete website by id */
async function deleteWebsite(id) {
    const ref = doc(db, "websites", id);
    await deleteDoc(ref);
}

// -------- Categories map (meta/categories) --------
const CATEGORIES_DOC = { col: "meta", id: "categories" };

/** Load categories map from Firestore: { main: [subs...] } */
async function loadCategories() {
    try {
        const ref = doc(db, CATEGORIES_DOC.col, CATEGORIES_DOC.id);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        return data || {};
    } catch (e) {
        console.error("loadCategories error", e);
        return {};
    }
}

/** Subscribe to categories map */
function subscribeCategories(callback) {
    return onSnapshot(doc(db, CATEGORIES_DOC.col, CATEGORIES_DOC.id), (snap) => {
        callback(snap.exists() ? (snap.data() || {}) : {});
    }, (err) => console.error("subscribeCategories error", err));
}

/** Upsert a main/sub category into the map */
async function upsertCategory(main, sub) {
    const ref = doc(db, CATEGORIES_DOC.col, CATEGORIES_DOC.id);
    const current = await loadCategories();
    const map = { ...current };
    const key = main.trim();
    if (!key) return;
    const list = Array.isArray(map[key]) ? map[key].slice() : [];
    if (sub && !list.includes(sub)) list.push(sub);
    map[key] = list;
    try {
        await setDoc(ref, map, { merge: false });
    } catch (e) {
        console.error("upsertCategory error", e);
    }
}

/** Populate main category select */
function populateMainCategories(selectEl, map, selectValue) {
    if (!selectEl) return;
    const opts = ['<option value="" disabled selected>Select main category</option>'];
    Object.keys(map).forEach((k) => {
        const sel = selectValue && selectValue === k ? " selected" : "";
        opts.push(`<option value="${k}"${sel}>${k}</option>`);
    });
    selectEl.innerHTML = opts.join("");
}

/** Sync subcategories options based on selected main */
function syncSubcategories(mainSelect, subSelect, map, selectValue) {
    if (!mainSelect || !subSelect) return;
    const main = mainSelect.value;
    const subs = Array.isArray(map[main]) ? map[main] : [];
    const opts = ['<option value="" disabled selected>Select sub-category</option>'];
    subs.forEach((s) => {
        const sel = selectValue && selectValue === s ? " selected" : "";
        opts.push(`<option value="${s}"${sel}>${s}</option>`);
    });
    subSelect.innerHTML = opts.join("");
}

/** Render category tree in sidebar and wire filtering */
function renderCategoryTree(map) {
    const tree = document.getElementById("categoryTree");
    if (!tree) return;
    tree.innerHTML = "";
    // Build counts for main and sub categories from current sites
    const allSites = Array.isArray(window.__ALL_SITES__) ? window.__ALL_SITES__ : [];
    /** @type {Record<string, number>} */
    const mainCounts = {};
    /** @type {Record<string, number>} */
    const subCounts = {};
    for (const s of allSites) {
        const m = (s.mainCategory || "").trim();
        if (m) mainCounts[m] = (mainCounts[m] || 0) + 1;
        const sub = (s.subCategory || s.category || "").trim();
        if (sub) subCounts[sub] = (subCounts[sub] || 0) + 1;
    }
    // Update counts
    try {
        const mainCount = Object.keys(map || {}).length;
        let subCount = 0;
        Object.values(map || {}).forEach((v) => {
            if (Array.isArray(v)) subCount += v.length;
        });
        const mainEl = document.getElementById("mainCatsCount");
        const subEl = document.getElementById("subCatsCount");
        if (mainEl) mainEl.textContent = `${mainCount} main`;
        if (subEl) subEl.textContent = `${subCount} sub`;
    } catch { }
    const clearActive = () => {
        tree.querySelectorAll('.tree-button.active').forEach((el) => el.classList.remove('active'));
    };
    const setActiveText = (text) => {
        clearActive();
        const target = String(text || "").trim();
        const btns = tree.querySelectorAll('.tree-button');
        for (const b of btns) {
            const label = (b.querySelector('span')?.textContent || b.textContent || "").trim();
            if (label === target) {
                b.classList.add('active');
                break;
            }
        }
    };
    // Add "Show All" control at the top
    const allLi = document.createElement("li");
    allLi.className = "tree-item";
    const allBtn = document.createElement("button");
    allBtn.className = "tree-button";
    const totalCount = Array.isArray(allSites) ? allSites.length : 0;
    allBtn.innerHTML = `<span>عرض الكل</span><span class="count-badge">${totalCount}</span>`;
    allBtn.addEventListener("click", () => {
        renderSites(window.__ALL_SITES__ || [], "");
        clearActive();
        allBtn.classList.add("active");
    });
    allLi.appendChild(allBtn);
    tree.appendChild(allLi);
    const createNode = (main, subs) => {
        const li = document.createElement("li");
        li.className = "tree-item";
        const hasSubs = Array.isArray(subs) && subs.length > 0;
        const btn = document.createElement("button");
        btn.className = "tree-button";
        const mCount = mainCounts[main] || 0;
        btn.innerHTML = `<span>${main}</span><span class="btn-right"><span class="count-badge">${mCount}</span>${hasSubs ? '<span class="chev">▸</span>' : ''}</span>`;
        let expanded = false;
        btn.addEventListener("click", () => {
            if (!hasSubs) {
                renderSites(window.__ALL_SITES__ || [], main);
                setActiveText(main);
                return;
            }
            expanded = !expanded;
            childWrap.style.display = expanded ? "block" : "none";
        });
        li.appendChild(btn);
        const childWrap = document.createElement("ul");
        childWrap.className = "tree-children";
        childWrap.style.display = "none";
        if (hasSubs) {
            subs.forEach((sub) => {
                const subLi = document.createElement("li");
                const subBtn = document.createElement("button");
                subBtn.className = "tree-button";
                const sCount = subCounts[sub] || 0;
                subBtn.innerHTML = `<span>${sub}</span><span class="count-badge">${sCount}</span>`;
                subBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    renderSites((window.__ALL_SITES__ || []).filter(s => s.subCategory === sub || s.category === sub), sub);
                    setActiveText(sub);
                });
                subLi.appendChild(subBtn);
                childWrap.appendChild(subLi);
            });
        }
        li.appendChild(childWrap);
        return li;
    };

    const frag = document.createDocumentFragment();
    Object.keys(map).forEach((main) => {
        frag.appendChild(createNode(main, map[main] || []));
    });
    tree.appendChild(frag);
}

/** Setup for index.html (Add Website page). */
function setupAddPage() {
    const form = document.getElementById("addWebsiteForm");
    if (!form) return;
    const mainSelect = /** @type {HTMLSelectElement} */(document.getElementById("siteMainCategory"));
    const subSelect = /** @type {HTMLSelectElement} */(document.getElementById("siteSubCategory"));
    const addMainBtn = document.getElementById("addMainCategoryBtn");
    const addSubBtn = document.getElementById("addSubCategoryBtn");

    // Load categories and populate selects
    loadCategories().then((map) => {
        populateMainCategories(mainSelect, map);
        syncSubcategories(mainSelect, subSelect, map);
    });
    mainSelect?.addEventListener("change", async () => {
        const map = await loadCategories();
        syncSubcategories(mainSelect, subSelect, map);
    });

    // Modal toggles
    const toggleModal = (el, show) => {
        if (!el) return;
        if (show) {
            el.classList.remove("hidden");
            el.setAttribute("aria-hidden", "false");
        } else {
            el.classList.add("hidden");
            el.setAttribute("aria-hidden", "true");
        }
    };

    const addMainModal = document.getElementById("addMainModal");
    const addSubModal = document.getElementById("addSubModal");
    const infoModal = document.getElementById("infoModal");
    const infoBody = document.getElementById("infoModalBody");

    addMainBtn?.addEventListener("click", () => {
        toggleModal(addMainModal, true);
    });
    addSubBtn?.addEventListener("click", () => {
        if (!mainSelect?.value) {
            if (infoBody) infoBody.textContent = "Select a main category first.";
            toggleModal(infoModal, true);
            return;
        }
        toggleModal(addSubModal, true);
    });

    // Wire modal closes
    document.getElementById("addMainCloseBtn")?.addEventListener("click", () => toggleModal(addMainModal, false));
    document.getElementById("addMainCancelBtn")?.addEventListener("click", () => toggleModal(addMainModal, false));
    addMainModal?.querySelector(".modal-overlay")?.addEventListener("click", () => toggleModal(addMainModal, false));

    document.getElementById("addSubCloseBtn")?.addEventListener("click", () => toggleModal(addSubModal, false));
    document.getElementById("addSubCancelBtn")?.addEventListener("click", () => toggleModal(addSubModal, false));
    addSubModal?.querySelector(".modal-overlay")?.addEventListener("click", () => toggleModal(addSubModal, false));

    // Info modal controls
    const closeInfo = () => toggleModal(infoModal, false);
    document.getElementById("infoCloseBtn")?.addEventListener("click", closeInfo);
    document.getElementById("infoCancelBtn")?.addEventListener("click", closeInfo);
    infoModal?.querySelector(".modal-overlay")?.addEventListener("click", closeInfo);
    document.getElementById("goSelectMainBtn")?.addEventListener("click", () => {
        closeInfo();
        mainSelect?.focus();
    });

    // Handle main form submit
    document.getElementById("addMainForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("newMainName")?.value.trim();
        if (!name) return;
        await upsertCategory(name, "");
        const map = await loadCategories();
        populateMainCategories(mainSelect, map, name);
        syncSubcategories(mainSelect, subSelect, map);
        toggleModal(addMainModal, false);
        document.getElementById("newMainName").value = "";
    });

    // Handle sub form submit
    document.getElementById("addSubForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const main = mainSelect?.value || "";
        const name = document.getElementById("newSubName")?.value.trim();
        if (!name) return;
        await upsertCategory(main, name);
        const map = await loadCategories();
        syncSubcategories(mainSelect, subSelect, map, name);
        toggleModal(addSubModal, false);
        document.getElementById("newSubName").value = "";
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = /** @type {HTMLInputElement} */(document.getElementById("siteName")).value.trim();
        const urlInput = /** @type {HTMLInputElement} */(document.getElementById("siteUrl")).value;
        const mainCategory = /** @type {HTMLSelectElement} */(document.getElementById("siteMainCategory")).value;
        const subCategory = /** @type {HTMLSelectElement} */(document.getElementById("siteSubCategory")).value;
        const category = subCategory || mainCategory;
        const description = /** @type {HTMLTextAreaElement} */(document.getElementById("siteDescription")).value.trim();

        if (!name) {
            showFormMessage("Please enter a website name.", "error");
            return;
        }

        const normalizedUrl = normalizeUrl(urlInput);
        if (!normalizedUrl) {
            showFormMessage("Please enter a valid URL.", "error");
            return;
        }

        if (!category) {
            showFormMessage("Please select a category.", "error");
            return;
        }

        try {
            await addWebsite({ name, url: normalizedUrl, category, description, mainCategory, subCategory });
            form.reset();
            if (mainSelect) mainSelect.selectedIndex = 0;
            if (subSelect) subSelect.selectedIndex = 0;
            showFormMessage("Website saved to Firestore!", "success");
        } catch (err) {
            console.error("Failed to save site:", err);
            showFormMessage("Failed to save. Check console.", "error");
        }
    });
}

/**
 * Build a thum.io snapshot URL with simple localStorage caching.
 * Cache key: thum_<encoded_url>
 */
function resolveThumSnapshot(rawUrl) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return PLACEHOLDER_IMG;
    const cacheKey = "thum_" + encodeURIComponent(normalized);
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const c = JSON.parse(cached);
            if (c && typeof c.url === "string" && c.url.length > 0) return c.url;
        }
    } catch { }
    const url = `https://image.thum.io/get/${normalized}`;
    try { localStorage.setItem(cacheKey, JSON.stringify({ url })); } catch { }
    return url;
}

/**
 * Render the list of sites into the grid on view.html
 * @param {Array<any>} allSites
 * @param {string|{type:'main'|'sub'|'category',value:string}} filterSpec
 */
function renderSites(allSites, filterSpec) {
    const grid = document.getElementById("cardsGrid");
    if (!grid) return;

    /** @type {Array<any>} */
    let filtered = allSites;
    if (filterSpec && typeof filterSpec === "object") {
        const t = filterSpec.type;
        const v = String(filterSpec.value || "");
        if (t === "main") filtered = allSites.filter(s => String(s.mainCategory || "") === v);
        else if (t === "sub") filtered = allSites.filter(s => String(s.subCategory || s.category || "") === v);
        else if (t === "category") filtered = allSites.filter(s => String(s.category || "") === v);
    } else if (typeof filterSpec === "string" && filterSpec && filterSpec !== "All") {
        filtered = allSites.filter(s => s.category === filterSpec);
    }

    grid.innerHTML = "";

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty">No websites found. Add some on the Add Website page.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    const isArabic = (txt) => /[\u0600-\u06FF]/.test(String(txt || ""));

    for (const site of filtered) {
        const card = document.createElement("article");
        card.className = "card glass";
        card.setAttribute("role", "link");
        card.tabIndex = 0;

        const media = document.createElement("div");
        media.className = "card-media";
        const thumb = document.createElement("img");
        thumb.className = "card-thumb";
        thumb.loading = "lazy";
        thumb.alt = site.name + " preview";
        // Use cached thum.io URL or compute once
        thumb.src = resolveThumSnapshot(site.url);
        // Fallback placeholder if snapshot fails to load
        thumb.addEventListener("error", () => {
            if (thumb.dataset.fallbackApplied === "1") return;
            thumb.dataset.fallbackApplied = "1";
            thumb.src = PLACEHOLDER_IMG;
        });
        media.appendChild(thumb);

        const body = document.createElement("div");
        body.className = "card-body";

        const titleLink = document.createElement("a");
        titleLink.className = "card-title";
        titleLink.textContent = site.name;
        titleLink.href = site.url;
        titleLink.target = "_blank";
        titleLink.rel = "noopener noreferrer";
        titleLink.addEventListener("click", (ev) => ev.stopPropagation());
        if (isArabic(site.name)) titleLink.dir = "rtl"; else titleLink.dir = "ltr";

        const desc = document.createElement("p");
        desc.className = "card-desc clamp-3";
        desc.textContent = site.description || "";
        if (isArabic(site.description)) desc.dir = "rtl"; else desc.dir = "ltr";

        const sepTop = document.createElement("div");
        sepTop.className = "sep";

        const categoryRow = document.createElement("div");
        categoryRow.className = "category-row";
        const mainBadge = document.createElement("button");
        mainBadge.type = "button";
        mainBadge.className = "badge category-badge";
        mainBadge.textContent = site.mainCategory || site.category || "";
        mainBadge.addEventListener("click", (ev) => {
            ev.stopPropagation();
            renderSites(window.__ALL_SITES__ || [], { type: 'main', value: site.mainCategory || site.category || '' });
        });
        categoryRow.appendChild(mainBadge);

        const subValue = site.subCategory || "";
        if (subValue) {
            const subBadge = document.createElement("button");
            subBadge.type = "button";
            subBadge.className = "badge category-badge";
            subBadge.textContent = subValue;
            subBadge.addEventListener("click", (ev) => {
                ev.stopPropagation();
                renderSites(window.__ALL_SITES__ || [], { type: 'sub', value: subValue });
            });
            categoryRow.appendChild(subBadge);
        }

        const sepBottom = document.createElement("div");
        sepBottom.className = "sep";

        const actions = document.createElement("div");
        actions.className = "card-actions";
        const editBtn = document.createElement("button");
        editBtn.className = "icon-btn primary";
        editBtn.type = "button";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            openEditModal(site);
        });
        const delBtn = document.createElement("button");
        delBtn.className = "icon-btn danger";
        delBtn.type = "button";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            openDeleteModal(site);
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        body.appendChild(titleLink);
        body.appendChild(desc);
        body.appendChild(sepTop);
        body.appendChild(categoryRow);
        body.appendChild(sepBottom);
        body.appendChild(actions);

        card.appendChild(media);
        card.appendChild(body);

        fragment.appendChild(card);

        // Make whole card clickable, but respect clicks on existing links and buttons
        const normalizedUrl = normalizeUrl(site.url);
        if (normalizedUrl) {
            const openSite = () => window.open(normalizedUrl, "_blank", "noopener");
            card.addEventListener("click", (ev) => {
                const target = /** @type {HTMLElement} */(ev.target);
                if (target.closest && target.closest("a, button, .icon-btn, select, input, textarea")) return;
                openSite();
            });
            card.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    openSite();
                }
            });
        }
    }
    grid.appendChild(fragment);
}

/** Modal helpers */
function toggleModal(el, show) {
    if (!el) return;
    if (show) {
        el.classList.remove("hidden");
        el.setAttribute("aria-hidden", "false");
    } else {
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
    }
}

function openEditModal(site) {
    const modal = document.getElementById("editModal");
    /** @type {HTMLInputElement} */(document.getElementById("editId")).value = site.id || "";
    /** @type {HTMLInputElement} */(document.getElementById("editName")).value = site.name || "";
    /** @type {HTMLInputElement} */(document.getElementById("editUrl")).value = site.url || "";
    /** @type {HTMLSelectElement} */(document.getElementById("editCategory")).value = site.category || "";
    // Populate main/sub for modal
    const mainEl = /** @type {HTMLSelectElement} */(document.getElementById("editMainCategory"));
    const subEl = /** @type {HTMLSelectElement} */(document.getElementById("editSubCategory"));
    loadCategories().then((map) => {
        populateMainCategories(mainEl, map, site.mainCategory || "");
        if (mainEl) {
            mainEl.addEventListener("change", () => syncSubcategories(mainEl, subEl, map));
        }
        if (mainEl && subEl) syncSubcategories(mainEl, subEl, map, site.subCategory || "");
    });
    /** @type {HTMLTextAreaElement} */(document.getElementById("editDescription")).value = site.description || "";
    toggleModal(modal, true);
}

function openDeleteModal(site) {
    const modal = document.getElementById("deleteModal");
    modal.dataset.id = site.id || "";
    const el = document.getElementById("deleteSiteName");
    if (el) el.textContent = site.name || site.url || "This website";
    toggleModal(modal, true);
}

/** Setup for view.html (View Websites page). */
function setupViewPage() {
    const grid = document.getElementById("cardsGrid");
    if (!grid) return;
    // Parallax-like subtle mouse-aware movement for the grid background
    const bg = document.getElementById("bgGrid");
    if (bg) {
        window.addEventListener("mousemove", (e) => {
            const x = e.clientX - window.innerWidth / 2;
            const y = e.clientY - window.innerHeight / 2;
            bg.style.transform = `translate(${x / 30}px, ${y / 30}px)`;
        });
    }

    const filter = /** @type {HTMLSelectElement} */(document.getElementById("categoryFilter"));
    if (filter) {
        filter.addEventListener("change", () => {
            const val = filter.value;
            renderSites(window.__ALL_SITES__ || [], val === 'All' ? '' : val);
        });
    }

    // Realtime updates for websites and categories
    subscribeWebsites((sites) => {
        window.__ALL_SITES__ = Array.isArray(sites) ? sites : [];
        renderSites(window.__ALL_SITES__, filter ? filter.value : "All");
    });
    subscribeCategories((map) => {
        window.__CATEGORIES_MAP__ = map;
        renderCategoryTree(map);
    });

    // Wire modal controls
    const editModal = document.getElementById("editModal");
    const deleteModal = document.getElementById("deleteModal");
    const closeEdit = () => toggleModal(editModal, false);
    const closeDelete = () => toggleModal(deleteModal, false);

    document.getElementById("editCloseBtn")?.addEventListener("click", closeEdit);
    document.getElementById("editCancelBtn")?.addEventListener("click", closeEdit);
    document.getElementById("deleteCloseBtn")?.addEventListener("click", closeDelete);
    document.getElementById("deleteCancelBtn")?.addEventListener("click", closeDelete);
    editModal?.querySelector(".modal-overlay")?.addEventListener("click", closeEdit);
    deleteModal?.querySelector(".modal-overlay")?.addEventListener("click", closeDelete);

    // Mobile offcanvas filter toggle
    const filterBtn = document.getElementById("toggleFilterBtn");
    const filterSidebar = document.getElementById("filterSidebar");
    const offcanvasOverlay = document.getElementById("offcanvasOverlay");
    const openOffcanvas = () => {
        document.body.classList.add("offcanvas-open");
        filterSidebar?.setAttribute("aria-hidden", "false");
        filterBtn?.setAttribute("aria-expanded", "true");
        offcanvasOverlay?.classList.remove("hidden");
    };
    const closeOffcanvas = () => {
        document.body.classList.remove("offcanvas-open");
        filterSidebar?.setAttribute("aria-hidden", "true");
        filterBtn?.setAttribute("aria-expanded", "false");
        offcanvasOverlay?.classList.add("hidden");
    };
    filterBtn?.addEventListener("click", () => {
        if (document.body.classList.contains("offcanvas-open")) closeOffcanvas(); else openOffcanvas();
    });
    offcanvasOverlay?.addEventListener("click", closeOffcanvas);
    document.getElementById("filterCloseBtn")?.addEventListener("click", closeOffcanvas);

    // Edit form submit
    const editForm = document.getElementById("editForm");
    if (editForm) {
        editForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = /** @type {HTMLInputElement} */(document.getElementById("editId")).value;
            const name = /** @type {HTMLInputElement} */(document.getElementById("editName")).value.trim();
            const url = normalizeUrl(/** @type {HTMLInputElement} */(document.getElementById("editUrl")).value);
            const category = /** @type {HTMLSelectElement} */(document.getElementById("editCategory")).value;
            const mainCategory = /** @type {HTMLSelectElement} */(document.getElementById("editMainCategory")).value;
            const subCategory = /** @type {HTMLSelectElement} */(document.getElementById("editSubCategory")).value;
            const description = /** @type {HTMLTextAreaElement} */(document.getElementById("editDescription")).value.trim();
            if (!id || !name || !url || !category) return;
            try {
                await updateWebsite(id, { name, url, category, description, mainCategory, subCategory });
                toggleModal(editModal, false);
            } catch (err) {
                console.error("Failed to update website:", err);
            }
        });
    }

    // Delete confirm
    const deleteConfirmBtn = document.getElementById("deleteConfirmBtn");
    if (deleteConfirmBtn) {
        deleteConfirmBtn.addEventListener("click", async () => {
            const id = deleteModal?.dataset.id;
            if (!id) return;
            try {
                await deleteWebsite(id);
                toggleModal(deleteModal, false);
            } catch (err) {
                console.error("Failed to delete website:", err);
            }
        });
    }
}

// Router: init per page based on body[data-page]
document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.getAttribute("data-page");
    // Page-wide parallax for moving grid background
    const pageBg = document.getElementById("pageBgGrid");
    if (pageBg) {
        window.addEventListener("mousemove", (e) => {
            const x = e.clientX - window.innerWidth / 2;
            const y = e.clientY - window.innerHeight / 2;
            pageBg.style.transform = `translate(${x / 40}px, ${y / 40}px)`;
        });
    }
    if (page === "add") {
        setupAddPage();
    } else if (page === "view") {
        setupViewPage();
    }
});


