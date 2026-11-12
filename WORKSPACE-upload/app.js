const STORAGE_KEY = "personal-workspace-v1";

const defaultState = { tasks: [], trainings: [], memos: [], trainingPlanInitialized: false, trainingPlanDate: "" };
const state = loadState();
let activeFilter = "all";
let draggedTaskId = null;
let historyMode = null;
let showAllHistory = false;
let taskCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const $ = (selector) => document.querySelector(selector);
const entryDialog = $("#entryDialog");
const historyDialog = $("#historyDialog");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return structuredClone(defaultState);
    return {
      tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
      trainings: Array.isArray(saved.trainings) ? saved.trainings : [],
      memos: Array.isArray(saved.memos) ? saved.memos : [],
      trainingPlanInitialized: saved.trainingPlanInitialized === true,
      trainingPlanDate: typeof saved.trainingPlanDate === "string" ? saved.trainingPlanDate : "",
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(date);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateOnly(value) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function render() {
  $("#todayDate").textContent = formatDate();
  renderTasks();
  renderTrainings();
  renderMemos();
  updateSummary();
}

function renderTasks() {
  const list = $("#taskList");
  const orderedTasks = state.tasks.filter((task) => isToday(task.createdAt)).sort((a, b) => Number(a.done) - Number(b.done));
  const filtered = orderedTasks.filter((task) => activeFilter === "all" || (activeFilter === "done" ? task.done : !task.done));
  if (!filtered.length) {
    list.className = "list-stack empty-state";
    list.textContent = activeFilter === "all" ? "还没有事项，先写下今天最重要的一件事。" : "这个筛选下还没有记录。";
    return;
  }
  list.className = "list-stack";
  list.innerHTML = filtered.map((task) => `
    <article class="list-item task-item" draggable="true" data-task-id="${task.id}">
      <input class="task-check" type="checkbox" data-task-id="${task.id}" ${task.done ? "checked" : ""} aria-label="完成事项" />
      <div class="task-copy ${task.done ? "is-done" : ""}">${escapeHtml(task.text)}<span class="item-time">${formatTime(task.createdAt)}</span></div>
      <div class="task-actions"><button class="delete-button" type="button" data-delete-task="${task.id}" aria-label="删除事项">×</button></div>
    </article>`).join("");
}

function renderTrainings() {
  const list = $("#trainingList");
  const todayTrainings = state.trainings.filter((training) => isToday(training.createdAt));
  if (!todayTrainings.length) {
    list.className = "list-stack empty-state";
    list.textContent = "今天还没有薄肌训练，点击右上角添加。";
    return;
  }
  list.className = "list-stack";
  list.innerHTML = todayTrainings.slice().reverse().map((training) => `
    <article class="list-item training-item" data-training-id="${training.id}">
      <div class="training-title"><strong>${escapeHtml(training.exercise)}</strong></div>
      <div class="training-detail">${training.sets} 组 × ${training.reps} 次${training.weight && training.weight !== "自重" ? ` · ${escapeHtml(training.weight)}` : ""}${training.note ? ` · ${escapeHtml(training.note)}` : ""}</div>
      <button class="delete-button" type="button" data-delete-training="${training.id}" aria-label="删除薄肌训练">×</button>
    </article>`).join("");
}

function renderMemos() {
  const list = $("#memoList");
  if (!state.memos.length) {
    list.className = "list-stack empty-state";
    list.textContent = "这里可以放暂时不想忘记的东西。";
    return;
  }
  list.className = "list-stack";
  list.innerHTML = state.memos.slice().reverse().slice(0, 4).map((memo) => `
    <article class="list-item memo-item" data-memo-id="${memo.id}"><p>${escapeHtml(memo.text)}</p><span class="item-time">${formatDateOnly(memo.createdAt)}</span><button class="delete-button" type="button" data-delete-memo="${memo.id}" aria-label="删除备忘">×</button></article>`).join("");
}

function updateSummary() {
  const todayTasks = state.tasks.filter((task) => isToday(task.createdAt));
  const done = todayTasks.filter((task) => task.done).length;
  $("#todoCount").textContent = `${done} / ${todayTasks.length}`;
  const sets = state.trainings.filter((training) => isToday(training.createdAt)).reduce((sum, item) => sum + Number(item.sets), 0);
  $("#trainingCount").textContent = `${sets} sets`;
  $("#dailyMessage").textContent = todayTasks.length && done === todayTasks.length ? "今天的事项已全部完成。" : "把今天要做的事写下来，逐件完成。";
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function openEntry(mode) {
  const titles = { task: "添加每日事项", training: "调整今日薄肌训练", memo: "写一条备忘" };
  entryDialog.dataset.mode = mode;
  entryDialog.dataset.editId = "";
  $("#dialogTitle").textContent = titles[mode] || "添加记录";
  if (mode === "task") $("#taskForm").reset();
  if (mode === "training") $("#trainingForm").reset();
  if (mode === "memo") { $("#memoForm").reset(); $("#memoCounter").textContent = "0 / 600"; }
  entryDialog.showModal();
  const firstInput = entryDialog.querySelector(`[data-entry-focus="${mode}"]`) || entryDialog.querySelector(`#${mode === "task" ? "taskInput" : mode === "training" ? "exerciseInput" : "memoInput"}`);
  if (firstInput) firstInput.focus();
}

function openEdit(mode, id) {
  const source = mode === "task" ? state.tasks : mode === "training" ? state.trainings : state.memos;
  const item = source.find((entry) => entry.id === id);
  if (!item) return;
  entryDialog.dataset.mode = mode;
  entryDialog.dataset.editId = id;
  $("#dialogTitle").textContent = mode === "task" ? "编辑事项" : mode === "training" ? "编辑薄肌训练" : "编辑备忘";
  if (mode === "task") $("#taskInput").value = item.text;
  if (mode === "training") {
    $("#exerciseInput").value = item.exercise;
    $("#setsInput").value = item.sets;
    $("#repsInput").value = item.reps;
    $("#weightInput").value = item.weight || "";
    $("#trainingNoteInput").value = item.note || "";
  }
  if (mode === "memo") { $("#memoInput").value = item.text; $("#memoCounter").textContent = `${item.text.length} / 600`; }
  entryDialog.showModal();
  const focusId = mode === "task" ? "taskInput" : mode === "training" ? "exerciseInput" : "memoInput";
  $("#" + focusId).focus();
}

function isToday(value) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function ensureTodayTrainingPlan() {
  const today = localDateKey(new Date());
  if (state.trainingPlanDate === today) return;
  if (!state.trainings.some((training) => isToday(training.createdAt))) {
    const createdAt = new Date().toISOString();
    state.trainings.push(
      { id: uid(), exercise: "深蹲", sets: 2, reps: 10, weight: "", note: "", createdAt },
      { id: uid(), exercise: "卷腹", sets: 2, reps: 20, weight: "", note: "", createdAt },
      { id: uid(), exercise: "俯卧撑", sets: 2, reps: 10, weight: "", note: "", createdAt },
      { id: uid(), exercise: "哑铃", sets: 2, reps: 20, weight: "3 kg", note: "", createdAt },
    );
  }
  state.trainingPlanInitialized = true;
  state.trainingPlanDate = today;
  saveState();
}

function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderTaskArchive() {
  const year = taskCalendarMonth.getFullYear();
  const month = taskCalendarMonth.getMonth();
  const monthLabel = `${year}年${month + 1}月`;
  const monthTasks = state.tasks.filter((task) => {
    const date = new Date(task.createdAt);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  const taskMap = new Map();
  monthTasks.forEach((task) => {
    const key = localDateKey(task.createdAt);
    if (!taskMap.has(key)) taskMap.set(key, []);
    taskMap.get(key).push(task);
  });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - firstDay + 1;
    const date = new Date(year, month, dayNumber);
    const currentMonth = date.getMonth() === month;
    const key = localDateKey(date);
    const tasks = taskMap.get(key) || [];
    const taskMarkup = tasks.slice(0, 3).map((task) => `<span class="calendar-task ${task.done ? "is-done" : ""}"><i></i>${escapeHtml(task.text)}</span>`).join("");
    const more = tasks.length > 3 ? `<span class="calendar-more">+${tasks.length - 3} 项</span>` : "";
    cells.push(`<button class="calendar-day ${currentMonth ? "" : "is-outside"}" type="button" data-task-history-day="${key}"><span class="calendar-day-number">${date.getDate()}</span><span class="calendar-tasks">${taskMarkup}${more}</span></button>`);
  }
  const doneCount = monthTasks.filter((task) => task.done).length;
  $("#historyTitle").textContent = "事项记录";
  $("#historyContent").innerHTML = `<div class="calendar-toolbar"><button class="calendar-nav" type="button" data-task-month="-1" aria-label="上个月">‹</button><strong>${monthLabel}</strong><button class="calendar-nav" type="button" data-task-month="1" aria-label="下个月">›</button><span class="calendar-count">${monthTasks.length} 项 · 已完成 ${doneCount}</span></div><div class="calendar-weekdays"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="calendar-grid">${cells.join("")}</div>`;
}

function renderTaskDayDetails(date) {
  const items = state.tasks.filter((task) => localDateKey(task.createdAt) === date);
  const dateLabel = formatDate(new Date(`${date}T00:00:00`));
  $("#historyTitle").textContent = "事项记录";
  const rows = items.map((item) => `<div class="history-row"><strong class="${item.done ? "history-done" : ""}">${escapeHtml(item.text)}</strong><span>${item.done ? "已完成" : "未完成"}</span></div>`).join("");
  $("#historyContent").innerHTML = `<div class="history-detail-heading"><button class="history-back-button" type="button" data-task-history-back>← 返回</button><span>${dateLabel}</span></div>${rows || `<div class="history-empty">这一天还没有事项。</div>`}`;
}

function renderMemoArchive() {
  $("#historyTitle").textContent = "全部备忘";
  if (!state.memos.length) {
    $("#historyContent").innerHTML = `<div class="history-empty">还没有备忘。</div>`;
    return;
  }
  const rows = state.memos.slice().reverse().map((item) => `<div class="history-row"><strong>${escapeHtml(item.text)}</strong><span>${formatDateOnly(item.createdAt)}</span></div>`).join("");
  $("#historyContent").innerHTML = rows;
}

function renderHistory(mode, all = false) {
  if (mode === "task") {
    renderTaskArchive();
    return;
  }
  if (mode === "memo") {
    renderMemoArchive();
    return;
  }
  const config = {
    task: { title: "事项", items: state.tasks, render: (item) => `<strong>${escapeHtml(item.text)}</strong><span>${item.done ? "已完成" : "未完成"} · ${formatTime(item.createdAt)}</span>` },
    training: { title: "薄肌训练", items: state.trainings, render: (item) => `<strong>${escapeHtml(item.exercise)}</strong><span>${item.sets} 组 × ${item.reps} 次${item.weight && item.weight !== "自重" ? ` · ${escapeHtml(item.weight)}` : ""} · ${formatTime(item.createdAt)}</span>` },
    memo: { title: "备忘", items: state.memos, render: (item) => `<strong>${escapeHtml(item.text)}</strong><span>${formatTime(item.createdAt)}</span>` },
  }[mode];
  if (!config) return;
  const items = all ? config.items : config.items.filter((item) => isToday(item.createdAt));
  $("#historyTitle").textContent = all ? `全部${config.title}` : `今日${config.title}`;
  const toolbar = `<div class="history-toolbar"><p class="history-date">${all ? `${items.length} 条历史记录` : `${formatDate()} / ${items.length} 条记录`}</p><button class="history-all-button" type="button" id="showAllHistory">${all ? "只看今天" : "全部记录"}</button></div>`;
  if (!items.length) {
    $("#historyContent").innerHTML = `${toolbar}<div class="history-empty">${all ? "还没有历史记录。" : "今天还没有记录。"}</div>`;
    return;
  }
  if (!all) {
    $("#historyContent").innerHTML = `${toolbar}${items.slice().reverse().map((item) => `<div class="history-row">${config.render(item)}</div>`).join("")}`;
  } else {
    const groups = new Map();
    items.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach((item) => {
      const key = formatDate(new Date(item.createdAt));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const grouped = Array.from(groups, ([date, groupItems]) => `<section class="history-group"><p class="history-group-title">${date} / ${groupItems.length} 条</p>${groupItems.map((item) => `<div class="history-row">${config.render(item)}</div>`).join("")}</section>`).join("");
    $("#historyContent").innerHTML = `${toolbar}${grouped}`;
  }
  $("#showAllHistory").addEventListener("click", () => { showAllHistory = !showAllHistory; renderHistory(historyMode, showAllHistory); });
}

function openHistory(mode) {
  historyMode = mode;
  showAllHistory = false;
  renderHistory(mode, false);
  historyDialog.showModal();
}

document.querySelectorAll("[data-open-entry]").forEach((button) => {
  button.addEventListener("click", () => openEntry(button.dataset.openEntry));
});

document.querySelectorAll("[data-open-history]").forEach((button) => {
  button.addEventListener("click", () => openHistory(button.dataset.openHistory));
});

$("#closeDialog").addEventListener("click", () => entryDialog.close());
entryDialog.addEventListener("click", (event) => { if (event.target === entryDialog) entryDialog.close(); });
$("#closeHistory").addEventListener("click", () => historyDialog.close());
historyDialog.addEventListener("click", (event) => { if (event.target === historyDialog) historyDialog.close(); });
$("#historyContent").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const day = target.closest("[data-task-history-day]");
  if (day) { renderTaskDayDetails(day.dataset.taskHistoryDay); return; }
  const monthButton = target.closest("[data-task-month]");
  if (monthButton) { taskCalendarMonth.setMonth(taskCalendarMonth.getMonth() + Number(monthButton.dataset.taskMonth)); renderTaskArchive(); return; }
  if (target.closest("[data-task-history-back]")) renderTaskArchive();
});

$("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#taskInput");
  const text = input.value.trim();
  if (!text) return;
  const editId = entryDialog.dataset.editId;
  if (editId) {
    const task = state.tasks.find((item) => item.id === editId);
    if (task) task.text = text;
  } else {
    state.tasks.unshift({ id: uid(), text, done: false, createdAt: new Date().toISOString() });
  }
  input.value = "";
  saveState(); render(); entryDialog.close(); showToast(editId ? "事项已更新" : "事项已记录");
});

$("#trainingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const exercise = $("#exerciseInput").value.trim();
  if (!exercise) return;
  const editId = entryDialog.dataset.editId;
  const details = { exercise, sets: Number($("#setsInput").value), reps: Number($("#repsInput").value), weight: $("#weightInput").value.trim(), note: $("#trainingNoteInput").value.trim() };
  if (editId) {
    const training = state.trainings.find((item) => item.id === editId);
    if (training) Object.assign(training, details);
  } else {
    state.trainings.push({ id: uid(), ...details, createdAt: new Date().toISOString() });
  }
  event.currentTarget.reset(); saveState(); render(); entryDialog.close(); showToast(editId ? "薄肌训练已更新" : "今日薄肌训练已更新");
});

$("#memoForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#memoInput");
  const text = input.value.trim();
  if (!text) return;
  const editId = entryDialog.dataset.editId;
  if (editId) {
    const memo = state.memos.find((item) => item.id === editId);
    if (memo) memo.text = text;
  } else {
    state.memos.push({ id: uid(), text, createdAt: new Date().toISOString() });
  }
  input.value = ""; $("#memoCounter").textContent = "0 / 600";
  saveState(); render(); entryDialog.close(); showToast(editId ? "备忘已更新" : "备忘已保存");
});

$("#memoInput").addEventListener("input", (event) => { $("#memoCounter").textContent = `${event.target.value.length} / 600`; });

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const card = target.closest("article.list-item");
  if (card && !target.closest("button, input, textarea, select")) {
    if (card.dataset.taskId) openEdit("task", card.dataset.taskId);
    else if (card.dataset.trainingId) openEdit("training", card.dataset.trainingId);
    else if (card.dataset.memoId) openEdit("memo", card.dataset.memoId);
  }
  const filter = target.closest("[data-filter]");
  if (filter) {
    activeFilter = filter.dataset.filter || "all";
    document.querySelectorAll(".filter-button").forEach((button) => button.classList.toggle("is-active", button === filter));
    renderTasks();
  }
  const taskId = target.dataset.deleteTask;
  if (taskId) { state.tasks = state.tasks.filter((task) => task.id !== taskId); saveState(); render(); showToast("事项已删除"); }
  const trainingId = target.dataset.deleteTraining;
  if (trainingId) { state.trainings = state.trainings.filter((training) => training.id !== trainingId); saveState(); render(); showToast("薄肌训练已删除"); }
  const memoId = target.dataset.deleteMemo;
  if (memoId) { state.memos = state.memos.filter((memo) => memo.id !== memoId); saveState(); render(); showToast("备忘已删除"); }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const taskId = target.dataset.taskId;
  if (!taskId) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (task) { task.done = target.checked; saveState(); render(); }
});

document.addEventListener("dragstart", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const item = target.closest("article[data-task-id]");
  if (!item) return;
  draggedTaskId = item.dataset.taskId || null;
  item.classList.add("is-dragging");
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
});

document.addEventListener("dragover", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.closest("article[data-task-id]")) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
});

document.addEventListener("drop", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !draggedTaskId) return;
  const destination = target.closest("article[data-task-id]");
  if (!destination) return;
  event.preventDefault();
  const destinationId = destination.dataset.taskId;
  const fromIndex = state.tasks.findIndex((task) => task.id === draggedTaskId);
  const toIndex = state.tasks.findIndex((task) => task.id === destinationId);
  if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
    const [moved] = state.tasks.splice(fromIndex, 1);
    state.tasks.splice(toIndex, 0, moved);
    saveState(); render(); showToast("事项顺序已更新");
  }
  draggedTaskId = null;
});

document.addEventListener("dragend", () => {
  document.querySelectorAll(".is-dragging").forEach((item) => item.classList.remove("is-dragging"));
  draggedTaskId = null;
});

$("#clearDataButton").addEventListener("click", () => {
  if (!window.confirm("确定清空所有本地事项、训练和备忘吗？")) return;
  state.tasks = []; state.trainings = []; state.memos = []; state.trainingPlanInitialized = true;
  saveState(); render(); showToast("本地数据已清空");
});

ensureTodayTrainingPlan();
render();
