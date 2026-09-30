const STORAGE_KEY = "daily-sales-log-v1";
const SHIFT_STORAGE_KEY = "daily-sales-shifts-v1";
const ACTIVITY_STORAGE_KEY = "daily-sales-activity-v1";
const USERS_STORAGE_KEY = "daily-sales-users-v1";
const STAFF_SESSION_KEY = "daily-sales-auth-session-v1";
const PASSWORD_RESET_CODE = "121217";

const loginPage = document.getElementById("login-page");
const salesPage = document.getElementById("sales-page");
const loginForm = document.getElementById("login-form");
const ownerSetupForm = document.getElementById("owner-setup-form");
const loginError = document.getElementById("login-error");
const setupError = document.getElementById("setup-error");
const resetForm = document.getElementById("password-reset-form");
const resetError = document.getElementById("reset-error");
const resetToggle = document.getElementById("show-password-reset");
const setupSignInButton = document.getElementById("owner-password-exists");
const returnSetupButton = document.getElementById("return-owner-setup");
const form = document.getElementById("sale-form");
const salesList = document.getElementById("sales-list");
const emptyMessage = document.getElementById("empty-message");
const dateInput = document.getElementById("business-date");
const historicalDateNotice = document.getElementById("historical-date-notice");
const startingCashInput = document.getElementById("starting-cash");
const remittanceInput = document.getElementById("remittance-amount");
const remittanceRequiredNotice = document.getElementById("remittance-required-notice");
const shiftHistory = document.getElementById("shift-history");
const shiftDisclosure = document.getElementById("shift-records-disclosure");
const shiftDateFilter = document.getElementById("shift-date-filter");
const activityHistory = document.getElementById("activity-history");
const activityToggle = document.getElementById("toggle-activity-log");
const activityDateFilter = document.getElementById("activity-date-filter");
const ownerPanel = document.getElementById("owner-panel");
const staffForm = document.getElementById("staff-form");
const expenseForm = document.getElementById("expense-form");
const expenseList = document.getElementById("expense-list");
const emptyExpenses = document.getElementById("empty-expenses");
const editSaleDialog = document.getElementById("edit-sale-dialog");
const editSaleForm = document.getElementById("edit-sale-form");
let editingSaleIndex = null;

let sales = [];
let expenses = [];
let activeDate = getLocalDateString();
let currentUser = null;
let ownerSetupNeeded = false;

activityToggle.addEventListener("click", () => {
  const isExpanded = activityToggle.getAttribute("aria-expanded") === "true";
  activityToggle.setAttribute("aria-expanded", String(!isExpanded));
  activityToggle.textContent = isExpanded ? "Expand list" : "Collapse list";
  activityHistory.hidden = isExpanded;
});

shiftDisclosure.addEventListener("toggle", () => {
  shiftDisclosure.querySelector(".disclosure-label").textContent = shiftDisclosure.open ? "Collapse list" : "Expand list";
});
activityDateFilter.addEventListener("change", renderActivity);
shiftDateFilter.addEventListener("change", renderShiftHistory);

dateInput.value = activeDate;

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isHistoricalDate() {
  return activeDate < getLocalDateString();
}

function hasValidRemittanceEntry() {
  const raw = remittanceInput.value.trim();
  if (/^n\/a$/i.test(raw)) return true;
  return /^\d+(?:\.\d{1,2})?$/.test(raw) && Number.isFinite(Number(raw)) && Number(raw) > 0;
}

function updateHistoricalMode() {
  const readOnly = isHistoricalDate();
  historicalDateNotice.hidden = !readOnly;
  startingCashInput.disabled = readOnly;
  remittanceInput.disabled = readOnly;
  [form, expenseForm].forEach(recordForm => {
    recordForm.querySelectorAll("input, select, button").forEach(control => {
      control.disabled = readOnly;
    });
  });
  document.getElementById("end-shift").disabled = readOnly || !hasValidRemittanceEntry();
  remittanceRequiredNotice.hidden = readOnly || hasValidRemittanceEntry();
  document.getElementById("clear-log").hidden = currentUser?.role !== "owner" || readOnly;
}

function getNextDateString(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day);
  nextDate.setDate(nextDate.getDate() + 1);
  return getLocalDateString(nextDate);
}

function money(amount) {
  return `\u20B1${Number(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch (error) {
    console.error(`Could not read ${key} from local storage:`, error);
    return fallback;
  }
}

function getUsers() {
  return readStorage(USERS_STORAGE_KEY, []);
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function getCryptoUnavailableMessage() {
  if (!window.isSecureContext) {
    return "Password setup needs a secure page. Open the GitHub Pages address beginning with https://, not the http:// computer address.";
  }
  return "This browser or in-app webview does not provide Web Crypto. Open the HTTPS page directly in an updated Chrome, Edge, Firefox, or Safari browser.";
}

function getRandomBytes(length) {
  if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) {
    throw new Error(getCryptoUnavailableMessage());
  }
  return crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

async function hashPassword(password, saltValue) {
  if (!globalThis.crypto?.subtle) {
    throw new Error(getCryptoUnavailableMessage());
  }
  const salt = saltValue ? Uint8Array.from(atob(saltValue), character => character.charCodeAt(0)) : getRandomBytes(16);
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    material,
    256
  );
  return { salt: saltValue || bytesToBase64(salt), hash: bytesToBase64(new Uint8Array(result)) };
}

function recordActivity(action, details) {
  const activity = readStorage(ACTIVITY_STORAGE_KEY, []);
  activity.push({
    date: activeDate,
    time: new Date().toLocaleString(),
    staff: currentUser?.name || "System",
    action,
    details
  });
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activity));
  renderActivity();
}

function formatLogDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || "");
  if (!match) return dateString || "Unknown date";
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    .toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function populateDateFilter(select, entries) {
  const selectedDate = select.value;
  const dates = [...new Set(entries.map(entry => entry.date).filter(Boolean))].sort().reverse();
  select.replaceChildren(new Option("All dates", ""));
  dates.forEach(date => select.add(new Option(formatLogDate(date), date)));
  if (dates.includes(selectedDate)) select.value = selectedDate;
}

function renderActivity() {
  const activity = readStorage(ACTIVITY_STORAGE_KEY, []);
  populateDateFilter(activityDateFilter, activity);
  const selectedDate = activityDateFilter.value;
  const visibleActivity = selectedDate ? activity.filter(entry => entry.date === selectedDate) : activity;
  activityHistory.replaceChildren();
  if (!visibleActivity.length) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = activity.length ? `No activity recorded for ${formatLogDate(selectedDate)}.` : "No activity recorded yet.";
    activityHistory.appendChild(message);
    return;
  }

  [...visibleActivity].reverse().forEach(entry => {
    const row = document.createElement("div");
    row.className = "activity-entry";
    const time = document.createElement("time");
    time.textContent = `${entry.date} · ${entry.time}`;
    const staff = document.createElement("strong");
    staff.textContent = entry.staff || "Unknown staff";
    const description = document.createElement("span");
    description.textContent = `${entry.action}: ${entry.details}`;
    row.append(time, staff, description);
    activityHistory.appendChild(row);
  });
}

function showSalesPage(user) {
  currentUser = user;
  sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify({ name: user.name, role: user.role }));
  document.getElementById("current-staff").textContent = `${user.name} (${user.role})`;
  loginPage.hidden = true;
  salesPage.hidden = false;
  ownerPanel.hidden = user.role !== "owner";
  render();
  renderActivity();
  if (user.role === "owner") renderStaffList();
}

function loadDay(date) {
  const allDays = readStorage(STORAGE_KEY, {});
  const dayData = allDays[date] || { startingCash: 0, remittance: "", sales: [], expenses: [] };
  sales = Array.isArray(dayData.sales) ? dayData.sales : [];
  expenses = Array.isArray(dayData.expenses) ? dayData.expenses : [];
  startingCashInput.value = dayData.startingCash || 0;
  // Older versions defaulted remittance to zero even when nobody entered it.
  // Require staff to re-enter an amount or explicitly mark it N/A.
  const savedRemittance = dayData.remittance;
  const savedRemittanceNumber = Number(savedRemittance);
  const isLegacyEmptyRemittance = savedRemittance !== "" && savedRemittance !== null && savedRemittance !== undefined &&
    Number.isFinite(savedRemittanceNumber) && savedRemittanceNumber === 0;
  remittanceInput.value = isLegacyEmptyRemittance ? "" : savedRemittance ?? "";
  render();
}

function saveDay() {
  const allDays = readStorage(STORAGE_KEY, {});
  allDays[activeDate] = {
    startingCash: Number(startingCashInput.value) || 0,
    remittance: getRemittanceStoredValue(),
    sales,
    expenses
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allDays));
}

function getRemittanceStoredValue() {
  const raw = remittanceInput.value.trim();
  if (/^n\/a$/i.test(raw)) return "N/A";
  if (!raw) return "";
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : raw;
}

function getRemittanceAmount() {
  const raw = remittanceInput.value.trim();
  if (!raw || /^n\/a$/i.test(raw)) return 0;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function getTotals() {
  const totalSales = sales.reduce((sum, sale) => sum + sale.price * sale.quantity, 0);
  const onlinePayments = sales
    .filter(sale => sale.paymentMode === "online")
    .reduce((sum, sale) => sum + sale.price * sale.quantity, 0);
  const cashSales = totalSales - onlinePayments;
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const startingCash = Number(startingCashInput.value) || 0;
  return {
    totalSales,
    onlinePayments,
    cashSales,
    totalExpenses,
    startingCash,
    endingCash: startingCash + cashSales - totalExpenses,
    remittance: getRemittanceAmount()
  };
}

function render() {
  updateHistoricalMode();
  salesList.replaceChildren();
  for (const [index, sale] of sales.entries()) {
    const row = document.createElement("tr");
    [
      ["Time", sale.time],
      ["Item", sale.item],
      ["Variation", sale.variation || "\u2014"],
      ["Quantity", sale.quantity],
      ["Price", money(sale.price)]
    ].forEach(([label, value]) => {
      const cell = document.createElement("td");
      cell.dataset.label = label;
      cell.textContent = value;
      row.appendChild(cell);
    });

    const paymentCell = document.createElement("td");
    paymentCell.dataset.label = "Payment";
    const paymentTag = document.createElement("span");
    paymentTag.className = `payment-tag ${sale.paymentMode}`;
    paymentTag.textContent = sale.paymentMode;
    paymentCell.appendChild(paymentTag);
    row.appendChild(paymentCell);

    const amountCell = document.createElement("td");
    amountCell.className = "amount-cell";
    amountCell.dataset.label = "Amount";
    amountCell.textContent = money(sale.price * sale.quantity);
    row.appendChild(amountCell);

    const staffCell = document.createElement("td");
    staffCell.dataset.label = "Added by";
    staffCell.textContent = sale.addedBy || "Unknown";
    row.appendChild(staffCell);

    const actionCell = document.createElement("td");
    actionCell.dataset.label = "Actions";
    actionCell.className = "sales-actions-cell";
    if (currentUser && !isHistoricalDate()) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit-button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        if (!isHistoricalDate()) openSaleEditor(sale, index);
      });
      actionCell.appendChild(editButton);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "delete-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        if (isHistoricalDate()) return;
        if (!confirm(`Remove this sale: ${sale.item} × ${sale.quantity}?`)) return;
        recordActivity("Sale removed", `${sale.item} × ${sale.quantity} (added by ${sale.addedBy || "Unknown"})`);
        sales.splice(index, 1);
        saveDay();
        render();
      });
      actionCell.appendChild(removeButton);
    }
    row.appendChild(actionCell);
    salesList.appendChild(row);
  }

  const totals = getTotals();
  document.getElementById("total-sales").textContent = money(totals.totalSales);
  document.getElementById("online-payment").textContent = money(totals.onlinePayments);
  document.getElementById("total-expenses").textContent = money(totals.totalExpenses);
  document.getElementById("ending-cash").textContent = money(totals.endingCash);
  emptyMessage.hidden = sales.length > 0;
  renderExpenses();
  renderShiftHistory();
}

function openSaleEditor(sale, index) {
  if (isHistoricalDate()) return;
  editingSaleIndex = index;
  document.getElementById("edit-sale-item").value = sale.item || "";
  document.getElementById("edit-sale-variation").value = sale.variation || "";
  document.getElementById("edit-sale-quantity").value = sale.quantity || 1;
  document.getElementById("edit-sale-price").value = sale.price || "";
  document.getElementById("edit-sale-payment").value = sale.paymentMode === "online" ? "online" : "cash";
  editSaleDialog.showModal();
  document.getElementById("edit-sale-item").focus();
}

function renderExpenses() {
  expenseList.replaceChildren();
  expenses.forEach(expense => {
    const row = document.createElement("tr");
    [expense.time, expense.name, expense.notes || "—", money(expense.amount), expense.addedBy || "Unknown"].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    const actionCell = document.createElement("td");
    if (currentUser?.role === "owner" && !isHistoricalDate()) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "delete-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        if (isHistoricalDate()) return;
        recordActivity("Expense removed", `${expense.name} for ${money(expense.amount)} (added by ${expense.addedBy || "Unknown"})`);
        expenses = expenses.filter(item => item.id !== expense.id);
        saveDay();
        render();
      });
      actionCell.appendChild(removeButton);
    }
    row.appendChild(actionCell);
    expenseList.appendChild(row);
  });
  emptyExpenses.hidden = expenses.length > 0;
}

function renderShiftHistory() {
  const shifts = readStorage(SHIFT_STORAGE_KEY, []);
  populateDateFilter(shiftDateFilter, shifts);
  const selectedDate = shiftDateFilter.value;
  const visibleShifts = selectedDate ? shifts.filter(shift => shift.date === selectedDate) : shifts;
  shiftHistory.replaceChildren();
  if (!visibleShifts.length) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = shifts.length ? `No shifts saved for ${formatLogDate(selectedDate)}.` : "No shifts have been saved yet.";
    shiftHistory.appendChild(message);
    return;
  }

  [...visibleShifts].reverse().forEach(shift => {
    const card = document.createElement("article");
    card.className = "shift-record";
    const heading = document.createElement("h3");
    heading.textContent = `${shift.date} · Ended ${shift.endedAt} · Closed by ${shift.closedBy || "Unknown"}`;
    card.appendChild(heading);
    const summary = document.createElement("p");
    const shiftExpenses = Array.isArray(shift.expenses) ? shift.expenses : [];
    const cashAfterRemittance = Number.isFinite(shift.cashAfterRemittance)
      ? shift.cashAfterRemittance
      : shift.endingCash - shift.remittance;
    const remittanceDisplay = shift.remittanceEntry === "N/A" ? "N/A" : money(shift.remittance);
    summary.textContent = `Starting cash: ${money(shift.startingCash)} · Total sales: ${money(shift.totalSales)} · Online: ${money(shift.onlinePayments)} · Expenses: ${money(shift.totalExpenses || 0)} · Expected ending cash: ${money(shift.endingCash)} · Remitted: ${remittanceDisplay} · Cash left for next start: ${money(cashAfterRemittance)} · Difference: ${money(shift.remittance - shift.endingCash)}`;
    card.appendChild(summary);

    const details = document.createElement("details");
    const summaryLabel = document.createElement("summary");
    const shiftSales = Array.isArray(shift.sales) ? shift.sales : [];
    summaryLabel.textContent = `Review ${shiftSales.length} sale${shiftSales.length === 1 ? "" : "s"} and ${shiftExpenses.length} expense${shiftExpenses.length === 1 ? "" : "s"}`;
    details.appendChild(summaryLabel);
    if (shiftSales.length) {
      const tableWrap = document.createElement("div");
      tableWrap.className = "table-wrap shift-review-table-wrap";
      const table = document.createElement("table");
      table.className = "shift-review-table";
      const head = document.createElement("thead");
      const headerRow = document.createElement("tr");
      ["Time", "Item", "Variation", "Quantity", "Price", "Payment", "Amount", "Added by"].forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        headerRow.appendChild(th);
      });
      head.appendChild(headerRow);
      table.appendChild(head);
      const body = document.createElement("tbody");
      shiftSales.forEach(sale => {
        const row = document.createElement("tr");
        [["Time", sale.time], ["Item", sale.item], ["Variation", sale.variation || "\u2014"],
          ["Quantity", sale.quantity], ["Price", money(sale.price)], ["Payment", sale.paymentMode],
          ["Amount", money(sale.price * sale.quantity)], ["Added by", sale.addedBy || "Unknown"]].forEach(([label, value]) => {
          const cell = document.createElement("td");
          cell.dataset.label = label;
          cell.textContent = value;
          row.appendChild(cell);
        });
        body.appendChild(row);
      });
      table.appendChild(body);
      tableWrap.appendChild(table);
      details.appendChild(tableWrap);
    } else {
      const noSales = document.createElement("p");
      noSales.textContent = "No sales were recorded in this shift.";
      details.appendChild(noSales);
    }
    if (shiftExpenses.length) {
      const expenseTitle = document.createElement("h4");
      expenseTitle.textContent = "Expenses";
      details.appendChild(expenseTitle);
      const expenseTableWrap = document.createElement("div");
      expenseTableWrap.className = "table-wrap shift-review-table-wrap";
      const expenseTable = document.createElement("table");
      expenseTable.className = "shift-review-table";
      const expenseHead = document.createElement("thead");
      const expenseHeaderRow = document.createElement("tr");
      ["Time", "Expense", "Notes", "Amount", "Added by"].forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        expenseHeaderRow.appendChild(th);
      });
      expenseHead.appendChild(expenseHeaderRow);
      expenseTable.appendChild(expenseHead);
      const expenseBody = document.createElement("tbody");
      shiftExpenses.forEach(expense => {
        const row = document.createElement("tr");
        [["Time", expense.time], ["Expense", expense.name], ["Notes", expense.notes || "—"],
          ["Amount", money(expense.amount)], ["Added by", expense.addedBy || "Unknown"]].forEach(([label, value]) => {
          const cell = document.createElement("td");
          cell.dataset.label = label;
          cell.textContent = value;
          row.appendChild(cell);
        });
        expenseBody.appendChild(row);
      });
      expenseTable.appendChild(expenseBody);
      expenseTableWrap.appendChild(expenseTable);
      details.appendChild(expenseTableWrap);
    }
    card.appendChild(details);
    shiftHistory.appendChild(card);
  });
}

function renderStaffList() {
  const list = document.getElementById("staff-list");
  list.replaceChildren();
  getUsers().forEach(user => {
    const row = document.createElement("div");
    row.className = "staff-row";
    const label = document.createElement("span");
    label.textContent = `${user.name} · ${user.role}${user.active ? "" : " · Disabled"}`;
    row.appendChild(label);

    if (user.role === "staff") {
      const resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.className = "secondary-button";
      resetButton.textContent = "Reset password";
      resetButton.addEventListener("click", async () => {
        const password = prompt(`Enter a new password for ${user.name} (at least 8 characters):`);
        if (password === null) return;
        if (password.length < 8) {
          alert("Use a password with at least 8 characters.");
          return;
        }
        const credential = await hashPassword(password);
        const users = getUsers();
        const target = users.find(item => item.name.toLowerCase() === user.name.toLowerCase());
        target.salt = credential.salt;
        target.passwordHash = credential.hash;
        saveUsers(users);
        recordActivity("Staff password reset", user.name);
        alert(`Password reset for ${user.name}.`);
      });
      row.appendChild(resetButton);

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "secondary-button";
      toggleButton.textContent = user.active ? "Disable" : "Enable";
      toggleButton.addEventListener("click", () => {
        const users = getUsers();
        const target = users.find(item => item.name.toLowerCase() === user.name.toLowerCase());
        target.active = !target.active;
        saveUsers(users);
        recordActivity(target.active ? "Staff account enabled" : "Staff account disabled", user.name);
        renderStaffList();
      });
      row.appendChild(toggleButton);
    }
    list.appendChild(row);
  });
}

async function initializeOwner() {
  const credential = await hashPassword(document.getElementById("owner-password").value);
  saveUsers([{
    name: "Renzo",
    role: "owner",
    active: true,
    salt: credential.salt,
    passwordHash: credential.hash
  }]);
  ownerSetupForm.reset();
  ownerSetupForm.hidden = true;
  loginForm.hidden = false;
  resetToggle.hidden = false;
  returnSetupButton.hidden = true;
  ownerSetupNeeded = false;
  document.getElementById("login-description").textContent = "Owner account created. Sign in as Renzo.";
  document.getElementById("login-name").value = "Renzo";
  document.getElementById("login-password").focus();
}

setupSignInButton.addEventListener("click", () => {
  ownerSetupForm.hidden = true;
  loginForm.hidden = false;
  resetToggle.hidden = false;
  returnSetupButton.hidden = !ownerSetupNeeded;
  document.getElementById("login-description").textContent = "Sign in with an account already saved in this browser for this website address.";
  document.getElementById("login-name").focus();
});

returnSetupButton.addEventListener("click", () => {
  loginForm.hidden = true;
  resetForm.hidden = true;
  ownerSetupForm.hidden = false;
  resetToggle.hidden = true;
});

resetToggle.addEventListener("click", () => {
  loginForm.hidden = true;
  ownerSetupForm.hidden = true;
  resetForm.hidden = false;
  resetError.hidden = true;
});

document.getElementById("hide-password-reset").addEventListener("click", () => {
  resetForm.reset();
  resetForm.hidden = true;
  loginForm.hidden = false;
  resetError.hidden = true;
});

resetForm.addEventListener("submit", async event => {
  event.preventDefault();
  resetError.hidden = true;

  const name = document.getElementById("reset-name").value.trim();
  const code = document.getElementById("reset-code").value;
  const password = document.getElementById("reset-password").value;
  const confirmation = document.getElementById("reset-password-confirm").value;

  if (code !== PASSWORD_RESET_CODE) {
    resetError.textContent = "The password change code is incorrect.";
    resetError.hidden = false;
    return;
  }
  if (password.length < 8 || password !== confirmation) {
    resetError.textContent = password.length < 8 ? "Password must have at least 8 characters." : "Passwords do not match.";
    resetError.hidden = false;
    return;
  }

  const users = getUsers();
  const userIndex = users.findIndex(user => user.name.toLowerCase() === name.toLowerCase());
  if (userIndex < 0) {
    resetError.textContent = "That username was not found.";
    resetError.hidden = false;
    return;
  }

  try {
    const credential = await hashPassword(password);
    users[userIndex] = {
      ...users[userIndex],
      salt: credential.salt,
      passwordHash: credential.hash
    };
    saveUsers(users);
    const activity = readStorage(ACTIVITY_STORAGE_KEY, []);
    activity.push({
      date: getLocalDateString(),
      time: new Date().toLocaleString(),
      staff: name,
      action: "Password changed",
      details: "password was reset using the recovery code"
    });
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activity));

    resetForm.reset();
    resetForm.hidden = true;
    loginForm.hidden = false;
    document.getElementById("login-name").value = name;
    document.getElementById("login-password").focus();
    loginError.textContent = "Password changed. Sign in with your new password.";
    loginError.hidden = false;
  } catch (error) {
    resetError.textContent = error.message;
    resetError.hidden = false;
  }
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.hidden = true;
  const name = document.getElementById("login-name").value.trim();
  const password = document.getElementById("login-password").value;
  const user = getUsers().find(item => item.name.toLowerCase() === name.toLowerCase());
  if (!user || !user.active) {
    loginError.textContent = ownerSetupNeeded
      ? "No saved account was found at this website address. Return to owner setup to create one here."
      : "Account not found or disabled. Ask the owner for access.";
    loginError.hidden = false;
    return;
  }
  try {
    const credential = await hashPassword(password, user.salt);
    // Older accounts stored this field as `hash`; accept it during migration.
    if (credential.hash !== (user.passwordHash || user.hash)) {
      loginError.textContent = "Incorrect username or password.";
      loginError.hidden = false;
      return;
    }
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
    return;
  }
  showSalesPage(user);
  recordActivity("Signed in", "opened the sales tracker");
  document.getElementById("login-password").value = "";
});

ownerSetupForm.addEventListener("submit", async event => {
  event.preventDefault();
  setupError.hidden = true;
  const password = document.getElementById("owner-password").value;
  const confirmation = document.getElementById("owner-password-confirm").value;
  if (password.length < 8 || password !== confirmation) {
    setupError.textContent = password.length < 8 ? "Password must have at least 8 characters." : "Passwords do not match.";
    setupError.hidden = false;
    return;
  }
  try {
    await initializeOwner();
  } catch (error) {
    setupError.textContent = error.message;
    setupError.hidden = false;
  }
});

form.addEventListener("submit", event => {
  event.preventDefault();
  if (isHistoricalDate()) return;
  const item = document.getElementById("itemselect").value;
  const variation = document.getElementById("variation").value.trim();
  const quantity = Number(document.getElementById("quantity").value);
  const price = Number(document.getElementById("price").value);
  const paymentMode = document.getElementById("payment-mode").value;
  if (!item.trim() || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price <= 0) {
    alert("Select a product and enter a valid quantity and price.");
    return;
  }
  sales.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    item: item.trim(), variation, quantity, price, paymentMode, addedBy: currentUser.name
  });
  saveDay();
  recordActivity("Sale added", `${item} × ${quantity} for ${money(price * quantity)} (${paymentMode})`);
  render();
  form.reset();
  document.getElementById("quantity").value = 1;
  document.getElementById("itemselect").focus();
});

document.getElementById("cancel-edit-sale").addEventListener("click", () => editSaleDialog.close());

editSaleForm.addEventListener("submit", event => {
  event.preventDefault();
  if (isHistoricalDate()) {
    editSaleDialog.close();
    return;
  }
  const sale = sales[editingSaleIndex];
  if (!sale) {
    editSaleDialog.close();
    return;
  }

  const item = document.getElementById("edit-sale-item").value.trim();
  const variation = document.getElementById("edit-sale-variation").value.trim();
  const quantity = Number(document.getElementById("edit-sale-quantity").value);
  const price = Number(document.getElementById("edit-sale-price").value);
  const paymentMode = document.getElementById("edit-sale-payment").value;
  if (!item || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price <= 0) {
    alert("Enter an item, a valid quantity, and a price greater than zero.");
    return;
  }

  const oldDetails = `${sale.item} × ${sale.quantity} at ${money(sale.price)} each (${sale.paymentMode})`;
  Object.assign(sale, { item, variation, quantity, price, paymentMode });
  const newDetails = `${item} × ${quantity} at ${money(price)} each (${paymentMode})`;
  saveDay();
  recordActivity("Sale edited", `${oldDetails} → ${newDetails} (originally added by ${sale.addedBy || "Unknown"})`);
  editingSaleIndex = null;
  editSaleDialog.close();
  render();
});

expenseForm.addEventListener("submit", event => {
  event.preventDefault();
  if (isHistoricalDate()) return;
  const name = document.getElementById("expense-name").value.trim();
  const amount = Number(document.getElementById("expense-amount").value);
  const notes = document.getElementById("expense-notes").value.trim();
  if (!name || !Number.isFinite(amount) || amount <= 0) {
    alert("Enter an expense name and an amount greater than zero.");
    return;
  }
  expenses.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    name,
    amount,
    notes,
    addedBy: currentUser.name
  });
  saveDay();
  recordActivity("Expense added", `${name} for ${money(amount)}`);
  render();
  expenseForm.reset();
});

document.getElementById("sales-tab-button").addEventListener("click", () => {
  document.getElementById("sales-tab").hidden = false;
  document.getElementById("expenses-tab").hidden = true;
  document.getElementById("sales-tab-button").classList.add("active");
  document.getElementById("expenses-tab-button").classList.remove("active");
});

document.getElementById("expenses-tab-button").addEventListener("click", () => {
  document.getElementById("sales-tab").hidden = true;
  document.getElementById("expenses-tab").hidden = false;
  document.getElementById("expenses-tab-button").classList.add("active");
  document.getElementById("sales-tab-button").classList.remove("active");
});

[startingCashInput, remittanceInput].forEach(input => {
  let previousValue = null;
  input.addEventListener("focus", () => { previousValue = input.value; });
  input.addEventListener("input", () => {
    if (isHistoricalDate()) return;
    saveDay();
    render();
  });
  input.addEventListener("change", () => {
    if (isHistoricalDate()) return;
    const enteredValue = input.value.trim();
    const previousEntry = previousValue?.trim();
    if (previousValue !== null && enteredValue !== previousEntry) {
      const details = input === remittanceInput
        ? (/^n\/a$/i.test(enteredValue) ? "N/A (no cash remitted)" : enteredValue ? money(Number(enteredValue) || 0) : "blank")
        : money(Number(enteredValue) || 0);
      recordActivity(input === startingCashInput ? "Starting cash updated" : "Remittance updated", details);
    }
    previousValue = null;
  });
});

dateInput.addEventListener("change", () => {
  if (editSaleDialog.open) editSaleDialog.close();
  activeDate = dateInput.value || getLocalDateString();
  dateInput.value = activeDate;
  loadDay(activeDate);
});

document.getElementById("clear-log").addEventListener("click", () => {
  if (isHistoricalDate() || currentUser?.role !== "owner" || !confirm(`Clear all sales and expenses for ${activeDate}?`)) return;
  const clearedSalesCount = sales.length;
  const clearedExpensesCount = expenses.length;
  sales = [];
  expenses = [];
  saveDay();
  recordActivity("Daily log cleared", `${clearedSalesCount} sale(s) and ${clearedExpensesCount} expense(s) cleared`);
  render();
});

document.getElementById("end-shift").addEventListener("click", () => {
  if (isHistoricalDate()) return;
  const remittanceEntry = remittanceInput.value.trim();
  if (!remittanceEntry) {
    alert("Enter the remittance amount, or type N/A if there was no cash remittance today.");
    remittanceInput.focus();
    return;
  }
  const noRemittance = /^n\/a$/i.test(remittanceEntry);
  const enteredRemittance = Number(remittanceEntry);
  const validAmountFormat = /^\d+(?:\.\d{1,2})?$/.test(remittanceEntry);
  if (!noRemittance && (!validAmountFormat || !Number.isFinite(enteredRemittance) || enteredRemittance <= 0)) {
    alert("Enter a remittance amount greater than zero, or type N/A if there was no cash remittance today.");
    remittanceInput.focus();
    return;
  }
  const totals = getTotals();
  const cashAfterRemittance = totals.endingCash - totals.remittance;
  if (cashAfterRemittance < 0) {
    alert("Remittance cannot be greater than the expected ending cash. Check the amounts before ending the shift.");
    return;
  }
  const nextDate = getNextDateString(activeDate);
  const allDays = readStorage(STORAGE_KEY, {});
  const savedNextDay = allDays[nextDate];
  const nextDayHasData = savedNextDay && (
    Number(savedNextDay.startingCash) !== 0 ||
    Number(savedNextDay.remittance) !== 0 ||
    (Array.isArray(savedNextDay.sales) && savedNextDay.sales.length > 0) ||
    (Array.isArray(savedNextDay.expenses) && savedNextDay.expenses.length > 0)
  );
  const nextDayNotice = nextDayHasData
    ? ` Any existing tracker data for ${nextDate} will be cleared.`
    : " The next day will start with a fresh sales and expense log.";
  if (!confirm(`Save and end the shift for ${activeDate}? ${money(cashAfterRemittance)} will be carried forward as Starting Cash for ${nextDate}.${nextDayNotice}`)) return;

  const shifts = readStorage(SHIFT_STORAGE_KEY, []);
  shifts.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    date: activeDate,
    endedAt: new Date().toLocaleString(),
    ...totals,
    remittanceEntry: noRemittance ? "N/A" : totals.remittance,
    cashAfterRemittance,
    closedBy: currentUser.name,
    sales: sales.map(sale => ({ ...sale })),
    expenses: expenses.map(expense => ({ ...expense }))
  });
  localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(shifts));

  allDays[nextDate] = {
    startingCash: cashAfterRemittance,
    remittance: "",
    sales: [],
    expenses: []
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allDays));

  recordActivity("Shift ended", `remitted ${noRemittance ? "N/A" : money(totals.remittance)}; ${money(cashAfterRemittance)} carried forward as ${nextDate} starting cash`);
  activeDate = nextDate;
  dateInput.value = nextDate;
  loadDay(nextDate);
  alert(`Shift saved for review. The tracker is now ready for ${nextDate}.`);
});

document.getElementById("logout-button").addEventListener("click", () => {
  recordActivity("Signed out", "left the sales tracker");
  sessionStorage.removeItem(STAFF_SESSION_KEY);
  currentUser = null;
  salesPage.hidden = true;
  loginPage.hidden = false;
  loginForm.reset();
  document.getElementById("login-name").focus();
});

staffForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (currentUser?.role !== "owner") return;
  const name = document.getElementById("new-staff-name").value.trim();
  const password = document.getElementById("new-staff-password").value;
  if (name.toLowerCase() === "renzo") {
    alert("Renzo is reserved for the owner account.");
    return;
  }
  if (password.length < 8) {
    alert("Use a password with at least 8 characters.");
    return;
  }
  const users = getUsers();
  if (users.some(user => user.name.toLowerCase() === name.toLowerCase())) {
    alert("That username already exists.");
    return;
  }
  const credential = await hashPassword(password);
  users.push({
    name,
    role: "staff",
    active: true,
    salt: credential.salt,
    passwordHash: credential.hash
  });
  saveUsers(users);
  recordActivity("Staff account created", name);
  staffForm.reset();
  renderStaffList();
});

document.getElementById("export-data").addEventListener("click", () => {
  if (currentUser?.role !== "owner") return;
  recordActivity("Business data exported", "downloaded a JSON backup");
  const backup = {
    exportedAt: new Date().toISOString(),
    salesByDate: readStorage(STORAGE_KEY, {}),
    shifts: readStorage(SHIFT_STORAGE_KEY, []),
    activity: readStorage(ACTIVITY_STORAGE_KEY, [])
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `business-log-backup-${getLocalDateString()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

async function startApp() {
  loadDay(activeDate);
  const users = getUsers();
  if (!users.some(user => user.role === "owner")) {
    ownerSetupNeeded = true;
    loginForm.hidden = true;
    ownerSetupForm.hidden = false;
    resetToggle.hidden = true;
    document.getElementById("login-description").textContent = "Set up the owner account to get started.";
    return;
  }

  const session = readSession();
  if (session) {
    const user = users.find(item => item.name.toLowerCase() === session.name.toLowerCase() && item.active && item.role === session.role);
    if (user) {
      showSalesPage(user);
      return;
    }
  }
  loginPage.hidden = false;
  salesPage.hidden = true;
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STAFF_SESSION_KEY));
  } catch {
    return null;
  }
}

startApp();
