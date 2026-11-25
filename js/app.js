/**
 * 匠技車研 CraftTech Garage（示例品牌）前端互動腳本
 * 規範：
 * 1. 所有動態商品/評價/FAQ/明細文字皆使用 textContent（避免 innerHTML 注入風險）
 * 2. 純原生 JavaScript、無外部 API、預購資料使用 localStorage
 * 3. 全按鈕、彈窗與 FAQ 支援鍵盤操作
 */

(() => {
  "use strict";

  const STORAGE_KEY_CART = "crafttech_preorder_cart_v1";
  const STORAGE_KEY_PROMO = "crafttech_applied_promo_v1";

  const state = {
    selectedCategory: "全部",
    searchQuery: "",
    cart: [], // [{ id: string, qty: number }]
    appliedPromoCode: "",
    promoActive: true,
    activeModalProductId: null,
    lastFocusedElement: null
  };

  // DOM 參照
  const el = {
    promoTitle: document.getElementById("promo-title"),
    promoDesc: document.getElementById("promo-desc"),
    promoCodeText: document.getElementById("promo-code-text"),
    promoCountdown: document.getElementById("promo-countdown"),
    promoEndedMsg: document.getElementById("promo-ended-msg"),
    promoCodeGroup: document.getElementById("promo-code-group"),
    promoBadge: document.getElementById("promo-badge"),
    cdDays: document.getElementById("cd-days"),
    cdHours: document.getElementById("cd-hours"),
    cdMinutes: document.getElementById("cd-minutes"),
    cdSeconds: document.getElementById("cd-seconds"),
    copyPromoBtn: document.getElementById("copy-promo-btn"),
    promoFeedback: document.getElementById("promo-feedback"),

    menuToggle: document.getElementById("menu-toggle"),
    siteNav: document.getElementById("site-nav"),
    navCartCount: document.getElementById("nav-cart-count"),

    searchInput: document.getElementById("search-input"),
    clearSearchBtn: document.getElementById("clear-search-btn"),
    categoryFilters: document.getElementById("category-filters"),
    catalogStatus: document.getElementById("catalog-status"),
    productGrid: document.getElementById("product-grid"),
    emptyState: document.getElementById("empty-state"),
    resetFiltersBtn: document.getElementById("reset-filters-btn"),

    cartEmptyMsg: document.getElementById("cart-empty-msg"),
    cartList: document.getElementById("cart-list"),
    clearCartBtn: document.getElementById("clear-cart-btn"),
    subtotalAmount: document.getElementById("subtotal-amount"),
    discountLabel: document.getElementById("discount-label"),
    discountAmount: document.getElementById("discount-amount"),
    finalAmount: document.getElementById("final-amount"),
    cartPromoInput: document.getElementById("cart-promo-input"),
    applyPromoBtn: document.getElementById("apply-promo-btn"),
    cartPromoStatus: document.getElementById("cart-promo-status"),

    customerNickname: document.getElementById("customer-nickname"),
    customerNote: document.getElementById("customer-note"),
    preorderAlert: document.getElementById("preorder-alert"),
    summaryPreview: document.getElementById("summary-preview"),
    copySummaryBtn: document.getElementById("copy-summary-btn"),
    downloadTxtBtn: document.getElementById("download-txt-btn"),
    exportFeedback: document.getElementById("export-feedback"),

    reviewsGrid: document.getElementById("reviews-grid"),
    faqList: document.getElementById("faq-list"),
    contactList: document.getElementById("contact-list"),

    modal: document.getElementById("product-modal"),
    modalBackdrop: document.getElementById("modal-backdrop"),
    modalDialog: document.getElementById("modal-dialog"),
    modalCloseBtn: document.getElementById("modal-close-btn"),
    modalCloseSecondaryBtn: document.getElementById("modal-close-secondary-btn"),
    modalImage: document.getElementById("modal-image"),
    modalCategory: document.getElementById("modal-category"),
    modalTitle: document.getElementById("modal-title"),
    modalPrice: document.getElementById("modal-price"),
    modalShortDesc: document.getElementById("modal-short-desc"),
    modalFullDesc: document.getElementById("modal-full-desc"),
    modalAddBtn: document.getElementById("modal-add-btn")
  };

  function formatTWD(amount) {
    return `NT$ ${Number(amount).toLocaleString("zh-TW")}`;
  }

  function pad2(num) {
    return String(num).padStart(2, "0");
  }

  function findProductById(id) {
    return PRODUCTS.find((item) => item.id === id) || null;
  }

  /* ========================================================================
     1. 導覽選單（手機展開與關閉）
     ======================================================================== */
  function setMobileMenuOpen(isOpen) {
    el.siteNav.classList.toggle("is-open", isOpen);
    el.menuToggle.setAttribute("aria-expanded", String(isOpen));
    el.menuToggle.setAttribute("aria-label", isOpen ? "關閉導覽選單" : "開啟導覽選單");
  }

  function initNavigation() {
    el.menuToggle.addEventListener("click", () => {
      const isExpanded = el.menuToggle.getAttribute("aria-expanded") === "true";
      setMobileMenuOpen(!isExpanded);
    });

    el.siteNav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        setMobileMenuOpen(false);
      }
    });
  }

  /* ========================================================================
     2. 限時活動倒數計時器與優惠碼複製
     支援 ?promoTest=ended 參數快速驗收「已過期」狀態
     ======================================================================== */
  function getPromoEndTimestamp() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("promoTest") === "ended") {
      return Date.now() - 1000;
    }
    return Date.parse(PROMO_CONFIG.endTimeISO);
  }

  function updatePromoCountdown() {
    const endTimeMs = getPromoEndTimestamp();
    const diffMs = endTimeMs - Date.now();

    if (Number.isNaN(endTimeMs) || diffMs <= 0) {
      state.promoActive = false;
      el.promoBadge.textContent = "活動已結束";
      el.promoCountdown.hidden = true;
      el.promoCodeGroup.hidden = true;
      el.promoEndedMsg.textContent = PROMO_CONFIG.endedMessage;
      el.promoEndedMsg.hidden = false;
      if (state.appliedPromoCode) {
        state.appliedPromoCode = "";
        saveAppliedPromo();
        renderCart();
      }
      return false;
    }

    state.promoActive = true;
    el.promoBadge.textContent = "限時活動";
    el.promoCountdown.hidden = false;
    el.promoCodeGroup.hidden = false;
    el.promoEndedMsg.hidden = true;

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    el.cdDays.textContent = pad2(days);
    el.cdHours.textContent = pad2(hours);
    el.cdMinutes.textContent = pad2(minutes);
    el.cdSeconds.textContent = pad2(seconds);
    return true;
  }

  async function copyTextWithFallback(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        // 繼續嘗試傳統複製備援
      }
    }
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {
      ok = false;
    }
    document.body.removeChild(helper);
    return ok;
  }

  function initPromoBanner() {
    el.promoTitle.textContent = PROMO_CONFIG.title;
    el.promoDesc.textContent = PROMO_CONFIG.description;
    el.promoCodeText.textContent = PROMO_CONFIG.code;

    const isActive = updatePromoCountdown();
    if (isActive) {
      setInterval(updatePromoCountdown, 1000);
    }

    el.copyPromoBtn.addEventListener("click", async () => {
      if (!state.promoActive) {
        return;
      }
      const copied = await copyTextWithFallback(PROMO_CONFIG.code);
      if (copied) {
        el.promoFeedback.textContent = `已複製優惠碼 ${PROMO_CONFIG.code}，並自動幫您帶入預約清單！`;
        el.cartPromoInput.value = PROMO_CONFIG.code;
        applyPromoCode(PROMO_CONFIG.code);
      } else {
        el.promoFeedback.textContent = `請手動選取優惠碼：${PROMO_CONFIG.code}`;
      }
      setTimeout(() => {
        el.promoFeedback.textContent = "";
      }, 4000);
    });
  }

  /* ========================================================================
     3. 分類篩選、即時搜尋與商品卡片渲染（全程使用 textContent）
     ======================================================================== */
  function getCategories() {
    const set = new Set(PRODUCTS.map((item) => item.category));
    return ["全部", ...Array.from(set)];
  }

  function renderCategoryFilters() {
    el.categoryFilters.replaceChildren();
    const categories = getCategories();

    categories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn";
      btn.textContent = cat;
      const isSelected = state.selectedCategory === cat;
      btn.classList.toggle("is-active", isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));

      btn.addEventListener("click", () => {
        state.selectedCategory = cat;
        renderCategoryFilters();
        renderProducts();
      });
      el.categoryFilters.appendChild(btn);
    });
  }

  function getFilteredProducts() {
    const query = state.searchQuery.trim().toLowerCase();
    return PRODUCTS.filter((item) => {
      const matchCat =
        state.selectedCategory === "全部" || item.category === state.selectedCategory;
      if (!matchCat) return false;
      if (!query) return true;
      const haystack = `${item.name} ${item.category} ${item.shortDesc} ${item.fullDesc}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function createProductCard(item) {
    const card = document.createElement("article");
    card.className = "product-card";

    const imgWrap = document.createElement("div");
    imgWrap.className = "product-card__img-wrap";

    const img = document.createElement("img");
    img.className = "product-card__img";
    img.src = item.image;
    img.alt = `${item.name}（示例商品圖）`;
    img.loading = "lazy";
    img.width = 640;
    img.height = 480;
    imgWrap.appendChild(img);

    const body = document.createElement("div");
    body.className = "product-card__body";

    const catTag = document.createElement("span");
    catTag.className = "product-card__category";
    catTag.textContent = item.category;

    const title = document.createElement("h3");
    title.className = "product-card__title";
    title.textContent = item.name;

    const price = document.createElement("p");
    price.className = "product-card__price";
    price.textContent = formatTWD(item.price);

    const desc = document.createElement("p");
    desc.className = "product-card__desc";
    desc.textContent = item.shortDesc;

    const actions = document.createElement("div");
    actions.className = "product-card__actions";

    const detailBtn = document.createElement("button");
    detailBtn.type = "button";
    detailBtn.className = "btn btn--outline-dark btn--small";
    detailBtn.textContent = "查看詳情";
    detailBtn.addEventListener("click", () => openProductModal(item.id, detailBtn));

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn--primary btn--small";
    addBtn.textContent = "加入預購";
    addBtn.addEventListener("click", () => {
      addToCart(item.id);
      addBtn.textContent = "已加入清單";
      setTimeout(() => {
        addBtn.textContent = "加入預購";
      }, 1200);
    });

    actions.appendChild(detailBtn);
    actions.appendChild(addBtn);

    body.appendChild(catTag);
    body.appendChild(title);
    body.appendChild(price);
    body.appendChild(desc);
    body.appendChild(actions);

    card.appendChild(imgWrap);
    card.appendChild(body);
    return card;
  }

  function renderProducts() {
    const filtered = getFilteredProducts();
    el.productGrid.replaceChildren();

    el.clearSearchBtn.hidden = state.searchQuery.trim().length === 0;

    if (filtered.length === 0) {
      el.emptyState.hidden = false;
      el.catalogStatus.textContent = `在「${state.selectedCategory}」分類中，找不到符合「${state.searchQuery.trim()}」的商品。`;
      return;
    }

    el.emptyState.hidden = true;
    const keywordLabel = state.searchQuery.trim()
      ? `・關鍵字「${state.searchQuery.trim()}」`
      : "";
    el.catalogStatus.textContent = `目前顯示 ${filtered.length} / ${PRODUCTS.length} 項商品（分類：${state.selectedCategory}${keywordLabel}）`;

    const fragment = document.createDocumentFragment();
    filtered.forEach((item) => {
      fragment.appendChild(createProductCard(item));
    });
    el.productGrid.appendChild(fragment);
  }

  function initCatalog() {
    renderCategoryFilters();
    renderProducts();

    el.searchInput.addEventListener("input", () => {
      state.searchQuery = el.searchInput.value;
      renderProducts();
    });

    el.clearSearchBtn.addEventListener("click", () => {
      state.searchQuery = "";
      el.searchInput.value = "";
      renderProducts();
      el.searchInput.focus();
    });

    el.resetFiltersBtn.addEventListener("click", () => {
      state.selectedCategory = "全部";
      state.searchQuery = "";
      el.searchInput.value = "";
      renderCategoryFilters();
      renderProducts();
      el.searchInput.focus();
    });
  }

  /* ========================================================================
     4. 商品詳情彈窗（支援 Esc 與點背景關閉，並還原焦點）
     ======================================================================== */
  function openProductModal(productId, triggerElement) {
    const item = findProductById(productId);
    if (!item) return;

    state.activeModalProductId = item.id;
    state.lastFocusedElement = triggerElement || document.activeElement;

    el.modalImage.src = item.image;
    el.modalImage.alt = `${item.name}（示例商品大圖）`;
    el.modalCategory.textContent = item.category;
    el.modalTitle.textContent = item.name;
    el.modalPrice.textContent = formatTWD(item.price);
    el.modalShortDesc.textContent = item.shortDesc;
    el.modalFullDesc.textContent = item.fullDesc;

    el.modal.hidden = false;
    document.body.style.overflow = "hidden";
    el.modalCloseBtn.focus();
  }

  function closeProductModal() {
    if (el.modal.hidden) return;
    el.modal.hidden = true;
    document.body.style.overflow = "";
    state.activeModalProductId = null;
    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === "function") {
      state.lastFocusedElement.focus();
    }
  }

  function initModal() {
    el.modalCloseBtn.addEventListener("click", closeProductModal);
    el.modalCloseSecondaryBtn.addEventListener("click", closeProductModal);
    el.modalBackdrop.addEventListener("click", closeProductModal);

    el.modalAddBtn.addEventListener("click", () => {
      if (!state.activeModalProductId) return;
      addToCart(state.activeModalProductId);
      el.modalAddBtn.textContent = "已加入預購清單 ✓";
      setTimeout(() => {
        el.modalAddBtn.textContent = "加入預購清單";
      }, 1200);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!el.modal.hidden) {
          closeProductModal();
        } else if (el.siteNav.classList.contains("is-open")) {
          setMobileMenuOpen(false);
          el.menuToggle.focus();
        }
      }
    });
  }

  /* ========================================================================
     5. 預購清單、localStorage 儲存與明細輸出
     ======================================================================== */
  function loadCartFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CART);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          state.cart = parsed.filter(
            (entry) =>
              entry &&
              typeof entry.id === "string" &&
              Number.isInteger(entry.qty) &&
              entry.qty > 0 &&
              findProductById(entry.id)
          );
        }
      }
      const savedPromo = localStorage.getItem(STORAGE_KEY_PROMO);
      if (savedPromo && state.promoActive) {
        state.appliedPromoCode = savedPromo;
        el.cartPromoInput.value = savedPromo;
      }
    } catch (_) {
      state.cart = [];
    }
  }

  function saveCartToStorage() {
    try {
      const compact = state.cart.map((entry) => ({ id: entry.id, qty: entry.qty }));
      localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(compact));
    } catch (_) {
      // 略過儲存例外（例如無痕模式配額限制）
    }
  }

  function saveAppliedPromo() {
    try {
      if (state.appliedPromoCode) {
        localStorage.setItem(STORAGE_KEY_PROMO, state.appliedPromoCode);
      } else {
        localStorage.removeItem(STORAGE_KEY_PROMO);
      }
    } catch (_) {
      // 略過
    }
  }

  function addToCart(productId) {
    const existing = state.cart.find((entry) => entry.id === productId);
    if (existing) {
      existing.qty += 1;
    } else {
      state.cart.push({ id: productId, qty: 1 });
    }
    saveCartToStorage();
    renderCart();
  }

  function updateCartQty(productId, delta) {
    const idx = state.cart.findIndex((entry) => entry.id === productId);
    if (idx === -1) return;
    state.cart[idx].qty += delta;
    if (state.cart[idx].qty <= 0) {
      state.cart.splice(idx, 1);
    }
    saveCartToStorage();
    renderCart();
  }

  function removeCartItem(productId) {
    state.cart = state.cart.filter((entry) => entry.id !== productId);
    saveCartToStorage();
    renderCart();
  }

  function clearCart() {
    state.cart = [];
    saveCartToStorage();
    renderCart();
  }

  function applyPromoCode(rawCode) {
    const normalized = (rawCode || "").trim().toUpperCase();
    if (!normalized) {
      state.appliedPromoCode = "";
      saveAppliedPromo();
      el.cartPromoStatus.textContent = "已清除優惠碼。";
      renderCart();
      return;
    }

    if (!state.promoActive) {
      state.appliedPromoCode = "";
      saveAppliedPromo();
      el.cartPromoStatus.textContent = "目前限時活動已結束，無法套用此優惠碼。";
      renderCart();
      return;
    }

    if (normalized === PROMO_CONFIG.code) {
      state.appliedPromoCode = normalized;
      saveAppliedPromo();
      el.cartPromoStatus.textContent = `已套用優惠碼 ${normalized}（享 9 折優惠）。`;
    } else {
      state.appliedPromoCode = "";
      saveAppliedPromo();
      el.cartPromoStatus.textContent = `無效的優惠碼「${normalized}」，請輸入 ${PROMO_CONFIG.code}。`;
    }
    renderCart();
  }

  function calculateTotals() {
    let subtotal = 0;
    let totalQty = 0;
    const detailedItems = [];

    state.cart.forEach((entry) => {
      const prod = findProductById(entry.id);
      if (!prod) return;
      const lineTotal = prod.price * entry.qty;
      subtotal += lineTotal;
      totalQty += entry.qty;
      detailedItems.push({ prod, qty: entry.qty, lineTotal });
    });

    const isDiscounted =
      state.promoActive &&
      state.appliedPromoCode === PROMO_CONFIG.code &&
      subtotal > 0;
    const discount = isDiscounted ? Math.round(subtotal * PROMO_CONFIG.discountRate) : 0;
    const finalTotal = Math.max(0, subtotal - discount);

    return { detailedItems, totalQty, subtotal, discount, finalTotal, isDiscounted };
  }

  function buildSummaryText() {
    const nickname = el.customerNickname.value.trim() || "（尚未填寫暱稱）";
    const note = el.customerNote.value.trim() || "無特別備註";
    const { detailedItems, subtotal, discount, finalTotal, isDiscounted } = calculateTotals();

    const lines = [
      `【${BRAND_INFO.name} 預約／預購明細（示例）】`,
      `聯絡人暱稱：${nickname}`,
      `備註（車款／狀況）：${note}`,
      "----------------------------------------"
    ];

    if (detailedItems.length === 0) {
      lines.push("（尚未加入任何商品或檢修項目）");
    } else {
      detailedItems.forEach(({ prod, qty, lineTotal }, idx) => {
        lines.push(
          `${idx + 1}. ${prod.name}（${prod.id}）x ${qty} ｜ 單價 ${formatTWD(prod.price)} ｜ 小計 ${formatTWD(lineTotal)}`
        );
      });
    }

    lines.push("----------------------------------------");
    lines.push(`小計金額：${formatTWD(subtotal)}`);
    lines.push(
      `使用優惠碼：${isDiscounted ? `${state.appliedPromoCode}（折抵 ${formatTWD(discount)}）` : "未使用"}`
    );
    lines.push(`優惠後金額：${formatTWD(finalTotal)}`);
    lines.push("----------------------------------------");
    lines.push(`請將此明細貼至 LINE（${BRAND_INFO.contact.lineId}）或 IG（${BRAND_INFO.contact.igHandle}）確認時段。`);

    return lines.join("\n");
  }

  function renderCart() {
    const { detailedItems, totalQty, subtotal, discount, finalTotal, isDiscounted } = calculateTotals();

    el.navCartCount.textContent = String(totalQty);
    el.cartEmptyMsg.hidden = detailedItems.length > 0;
    el.clearCartBtn.hidden = detailedItems.length === 0;

    el.cartList.replaceChildren();
    detailedItems.forEach(({ prod, qty, lineTotal }) => {
      const li = document.createElement("li");
      li.className = "cart-item";

      const info = document.createElement("div");
      const title = document.createElement("p");
      title.className = "cart-item__title";
      title.textContent = prod.name;

      const meta = document.createElement("div");
      meta.className = "cart-item__meta";
      meta.textContent = `${formatTWD(prod.price)} / 項 · 小計 ${formatTWD(lineTotal)}`;

      info.appendChild(title);
      info.appendChild(meta);

      const controls = document.createElement("div");
      controls.className = "cart-item__controls";

      const stepper = document.createElement("div");
      stepper.className = "qty-stepper";

      const decBtn = document.createElement("button");
      decBtn.type = "button";
      decBtn.className = "qty-stepper__btn";
      decBtn.textContent = "−";
      decBtn.setAttribute("aria-label", `減少 ${prod.name} 數量`);
      decBtn.addEventListener("click", () => updateCartQty(prod.id, -1));

      const qtyVal = document.createElement("span");
      qtyVal.className = "qty-stepper__val";
      qtyVal.textContent = String(qty);

      const incBtn = document.createElement("button");
      incBtn.type = "button";
      incBtn.className = "qty-stepper__btn";
      incBtn.textContent = "+";
      incBtn.setAttribute("aria-label", `增加 ${prod.name} 數量`);
      incBtn.addEventListener("click", () => updateCartQty(prod.id, 1));

      stepper.appendChild(decBtn);
      stepper.appendChild(qtyVal);
      stepper.appendChild(incBtn);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn--ghost btn--small";
      removeBtn.textContent = "移除";
      removeBtn.setAttribute("aria-label", `移除 ${prod.name}`);
      removeBtn.addEventListener("click", () => removeCartItem(prod.id));

      controls.appendChild(stepper);
      controls.appendChild(removeBtn);

      li.appendChild(info);
      li.appendChild(controls);
      el.cartList.appendChild(li);
    });

    el.subtotalAmount.textContent = formatTWD(subtotal);
    el.discountLabel.textContent = isDiscounted
      ? `活動折扣（已套用 ${state.appliedPromoCode}）`
      : "活動折扣（未套用）";
    el.discountAmount.textContent = `- ${formatTWD(discount)}`;
    el.finalAmount.textContent = formatTWD(finalTotal);

    el.summaryPreview.textContent = buildSummaryText();
    if (state.cart.length > 0 && el.customerNickname.value.trim()) {
      el.preorderAlert.hidden = true;
    }
  }

  function validatePreorderBeforeExport() {
    if (state.cart.length === 0) {
      el.preorderAlert.textContent = "您的預購清單目前是空的，請先從上方型錄加入至少一項商品或檢修項目。";
      el.preorderAlert.hidden = false;
      return false;
    }
    if (!el.customerNickname.value.trim()) {
      el.preorderAlert.textContent = "請先填寫「聯絡人暱稱」，方便技師在 LINE 或 IG 上辨識您的預約明細。";
      el.preorderAlert.hidden = false;
      el.customerNickname.focus();
      return false;
    }
    el.preorderAlert.hidden = true;
    return true;
  }

  function initPreorder() {
    loadCartFromStorage();
    renderCart();

    el.clearCartBtn.addEventListener("click", clearCart);

    el.applyPromoBtn.addEventListener("click", () => {
      applyPromoCode(el.cartPromoInput.value);
    });

    el.customerNickname.addEventListener("input", () => {
      el.summaryPreview.textContent = buildSummaryText();
      if (el.customerNickname.value.trim() && state.cart.length > 0) {
        el.preorderAlert.hidden = true;
      }
    });

    el.customerNote.addEventListener("input", () => {
      el.summaryPreview.textContent = buildSummaryText();
    });

    el.copySummaryBtn.addEventListener("click", async () => {
      if (!validatePreorderBeforeExport()) return;
      const text = buildSummaryText();
      const ok = await copyTextWithFallback(text);
      el.exportFeedback.textContent = ok
        ? "已複製完整預約明細！歡迎貼到品牌 LINE 或 IG。"
        : "無法自動存取剪貼簿，請直接從上方預覽框全選複製。";
      setTimeout(() => {
        el.exportFeedback.textContent = "";
      }, 4500);
    });

    el.downloadTxtBtn.addEventListener("click", () => {
      if (!validatePreorderBeforeExport()) return;
      const text = buildSummaryText();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "crafttech-preorder-summary.txt";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      el.exportFeedback.textContent = "已下載預約明細檔（crafttech-preorder-summary.txt）。";
      setTimeout(() => {
        el.exportFeedback.textContent = "";
      }, 4500);
    });
  }

  /* ========================================================================
     6. 顧客評價、FAQ 手風琴（支援鍵盤操作）與頁尾聯絡資訊
     ======================================================================== */
  function renderReviews() {
    el.reviewsGrid.replaceChildren();
    REVIEWS.forEach((rev) => {
      const card = document.createElement("article");
      card.className = "review-card";

      const stars = document.createElement("div");
      stars.className = "review-card__stars";
      stars.setAttribute("aria-label", `${rev.rating} 顆星評價`);
      stars.textContent = "★".repeat(rev.rating);

      const service = document.createElement("span");
      service.className = "review-card__service";
      service.textContent = `項目：${rev.service}`;

      const comment = document.createElement("p");
      comment.className = "review-card__comment";
      comment.textContent = `「${rev.comment}」`;

      const author = document.createElement("p");
      author.className = "review-card__author";
      author.textContent = rev.author;

      card.appendChild(stars);
      card.appendChild(service);
      card.appendChild(comment);
      card.appendChild(author);
      el.reviewsGrid.appendChild(card);
    });
  }

  function renderFaqs() {
    el.faqList.replaceChildren();
    FAQS.forEach((faq, idx) => {
      const item = document.createElement("div");
      item.className = "faq-item";

      const panelId = `faq-panel-${faq.id}`;
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "faq-item__trigger";
      trigger.setAttribute("aria-expanded", String(idx === 0));
      trigger.setAttribute("aria-controls", panelId);

      const qText = document.createElement("span");
      qText.textContent = faq.question;

      const icon = document.createElement("span");
      icon.className = "faq-item__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = idx === 0 ? "−" : "+";

      trigger.appendChild(qText);
      trigger.appendChild(icon);

      const panel = document.createElement("div");
      panel.id = panelId;
      panel.className = "faq-item__panel";
      panel.hidden = idx !== 0;

      const answer = document.createElement("p");
      answer.textContent = faq.answer;
      panel.appendChild(answer);

      trigger.addEventListener("click", () => {
        const expanded = trigger.getAttribute("aria-expanded") === "true";
        const nextState = !expanded;
        trigger.setAttribute("aria-expanded", String(nextState));
        panel.hidden = !nextState;
        icon.textContent = nextState ? "−" : "+";
      });

      item.appendChild(trigger);
      item.appendChild(panel);
      el.faqList.appendChild(item);
    });
  }

  function renderContactInfo() {
    el.contactList.replaceChildren();
    const rows = [
      `電話：${BRAND_INFO.contact.phone}`,
      `地址：${BRAND_INFO.contact.address}`,
      `營業時間：${BRAND_INFO.contact.hours}`,
      `官方 LINE：${BRAND_INFO.contact.lineId}`,
      `Instagram：${BRAND_INFO.contact.igHandle}`
    ];
    rows.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      el.contactList.appendChild(li);
    });
  }

  /* ========================================================================
     啟動應用程式
     ======================================================================== */
  function init() {
    initNavigation();
    initPromoBanner();
    initCatalog();
    initModal();
    initPreorder();
    renderReviews();
    renderFaqs();
    renderContactInfo();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
