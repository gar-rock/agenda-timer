const STORAGE_KEYS = {
  agendaText: "agenda_timer_agenda_text",
  runtime: "agenda_timer_runtime_state",
  phaseThresholds: "agenda_timer_phase_thresholds"
};

const DEFAULT_PHASE_THRESHOLDS = {
  greenEndPct: 75,
  yellowEndPct: 95
};

const SAMPLE_AGENDA = {
  title: "Weekly Product Sync",
  items: [
    {
      topic: "Introductions",
      durationMinutes: 3
    },
    {
      topic: "Project Updates",
      durationMinutes: 12,
      subtopics: [
        { topic: "Frontend", durationMinutes: 5 },
        { topic: "Backend", durationMinutes: 4 },
        { topic: "QA", durationMinutes: 3 }
      ]
    },
    {
      topic: "Risks and Decisions",
      durationMinutes: 8,
      subtopics: [
        { topic: "Blocking Issues", durationMinutes: 5 },
        { topic: "Approvals Needed", durationMinutes: 3 }
      ]
    },
    {
      topic: "Action Items",
      durationMinutes: 4
    }
  ]
};

const state = {
  rawAgenda: null,
  segments: [],
  index: 0,
  sectionEndEpochMs: null,
  running: false,
  paused: false,
  pausedRemainingMs: null,
  intervalId: null,
  finished: false,
  segmentListSignature: "",
  focusMode: false,
  agendaEditorSignature: "",
  phaseThresholds: { ...DEFAULT_PHASE_THRESHOLDS },
  view: "welcome"
};

const STEP_ORDER = ["build", "colors", "review"];

const $ = (id) => document.getElementById(id);

const el = {
  stepper: $("stepper"),
  views: {
    welcome: $("welcomeView"),
    build: $("buildView"),
    colors: $("colorsView"),
    review: $("reviewView")
  },
  letsBeginBtn: $("letsBeginBtn"),
  sampleAgendaBtn: $("sampleAgendaBtn"),
  sessionBanner: $("sessionBanner"),
  sessionBannerText: $("sessionBannerText"),
  bannerOpenTimerBtn: $("bannerOpenTimerBtn"),
  bannerPauseBtn: $("bannerPauseBtn"),
  bannerResumeBtn: $("bannerResumeBtn"),
  bannerEndBtn: $("bannerEndBtn"),
  agendaTitleInput: $("agendaTitleInput"),
  tabVisualBtn: $("tabVisualBtn"),
  tabJsonBtn: $("tabJsonBtn"),
  visualPane: $("visualPane"),
  jsonPane: $("jsonPane"),
  agendaCards: $("agendaCards"),
  addTopicBtn: $("addTopicBtn"),
  agendaTotal: $("agendaTotal"),
  agendaInput: $("agendaInput"),
  importJsonBtn: $("importJsonBtn"),
  jsonHelp: $("jsonHelp"),
  buildBackBtn: $("buildBackBtn"),
  buildNextBtn: $("buildNextBtn"),
  greenUntilInput: $("greenUntilInput"),
  yellowUntilInput: $("yellowUntilInput"),
  colorPreviewGreen: $("colorPreviewGreen"),
  colorPreviewYellow: $("colorPreviewYellow"),
  colorPreviewRed: $("colorPreviewRed"),
  colorSummary: $("colorSummary"),
  colorsBackBtn: $("colorsBackBtn"),
  colorsNextBtn: $("colorsNextBtn"),
  reviewTitle: $("reviewTitle"),
  reviewTotal: $("reviewTotal"),
  reviewCount: $("reviewCount"),
  reviewEnd: $("reviewEnd"),
  reviewList: $("reviewList"),
  reviewBackBtn: $("reviewBackBtn"),
  reviewStartBtn: $("reviewStartBtn"),
  toast: $("toast"),
  focusModal: $("focusModal"),
  focusTitle: $("focusTitle"),
  closeFocusBtn: $("closeFocusBtn"),
  focusStartBtn: $("focusStartBtn"),
  focusPauseBtn: $("focusPauseBtn"),
  focusResumeBtn: $("focusResumeBtn"),
  focusRestartBtn: $("focusRestartBtn"),
  focusEditBtn: $("focusEditBtn"),
  focusEndBtn: $("focusEndBtn"),
  progressTrack: $("progressTrack"),
  timerPanel: $("timerPanel"),
  phaseBadge: $("phaseBadge"),
  progressText: $("progressText"),
  progressFill: $("progressFill"),
  segmentList: $("segmentList"),
  currentTopic: $("currentTopic"),
  currentPath: $("currentPath"),
  timeRemaining: $("timeRemaining"),
  nextUp: $("nextUp"),
  cornerTimer: $("cornerTimer"),
  cornerTime: $("cornerTime"),
  cornerTopic: $("cornerTopic"),
  cornerOpenFocusBtn: $("cornerOpenFocusBtn")
};

function toggleVisible(node, visible) {
  node.classList.toggle("hidden", !visible);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizePhaseThresholds(greenEndPct, yellowEndPct) {
  const green = Number(greenEndPct);
  const yellow = Number(yellowEndPct);

  if (!Number.isFinite(green) || !Number.isFinite(yellow)) {
    throw new Error("Thresholds must be valid numbers.");
  }
  if (green <= 0 || green >= 100 || yellow <= 0 || yellow >= 100) {
    throw new Error("Thresholds must be between 1 and 99.");
  }
  if (green >= yellow) {
    throw new Error("Green threshold must be less than yellow threshold.");
  }

  return {
    greenEndPct: Math.round(green),
    yellowEndPct: Math.round(yellow)
  };
}

function syncPhaseInputs() {
  el.greenUntilInput.value = String(state.phaseThresholds.greenEndPct);
  el.yellowUntilInput.value = String(state.phaseThresholds.yellowEndPct);
}

function persistPhaseThresholds() {
  localStorage.setItem(STORAGE_KEYS.phaseThresholds, JSON.stringify(state.phaseThresholds));
}

function loadPhaseThresholds() {
  const raw = localStorage.getItem(STORAGE_KEYS.phaseThresholds);
  if (!raw) {
    state.phaseThresholds = { ...DEFAULT_PHASE_THRESHOLDS };
    syncPhaseInputs();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.phaseThresholds = normalizePhaseThresholds(parsed.greenEndPct, parsed.yellowEndPct);
  } catch {
    state.phaseThresholds = { ...DEFAULT_PHASE_THRESHOLDS };
  }
  syncPhaseInputs();
}

function renderColorPreview() {
  const green = Number(el.greenUntilInput.value);
  const yellow = Number(el.yellowUntilInput.value);
  const valid = Number.isFinite(green) && Number.isFinite(yellow) && green > 0 && yellow < 100 && green < yellow;

  el.colorSummary.classList.toggle("error-text", !valid);
  if (!valid) {
    el.colorSummary.textContent = "Yellow must start before red, and both must be between 1 and 99.";
    return;
  }

  el.colorPreviewGreen.style.flex = `0 0 ${green}%`;
  el.colorPreviewYellow.style.flex = `0 0 ${yellow - green}%`;
  el.colorPreviewRed.style.flex = `0 0 ${100 - yellow}%`;

  const exampleMs = 10 * 60000;
  el.colorSummary.textContent =
    `Example: in a 10 minute section, the timer turns yellow after ${formatDurationLabel(exampleMs * green / 100)} ` +
    `and red after ${formatDurationLabel(exampleMs * yellow / 100)}.`;
}

function commitPhaseThresholds() {
  try {
    state.phaseThresholds = normalizePhaseThresholds(el.greenUntilInput.value, el.yellowUntilInput.value);
    persistPhaseThresholds();
    return true;
  } catch (error) {
    setMessage(error.message, true);
    return false;
  }
}

function blankTopic() {
  return { topic: "New Topic", durationMinutes: 5, subtopics: [] };
}

function blankSubtopic() {
  return { topic: "New Subtopic", durationMinutes: 3 };
}

function ensureRawAgenda() {
  if (!state.rawAgenda || !Array.isArray(state.rawAgenda.items)) {
    state.rawAgenda = { title: "", items: [] };
  }
}

function renderAgendaEditor() {
  ensureRawAgenda();

  const signature = JSON.stringify(state.rawAgenda.items);
  if (signature === state.agendaEditorSignature) {
    return;
  }

  if (!state.rawAgenda.items.length) {
    el.agendaCards.innerHTML = `<div class="empty-state">
      <p class="empty-title">No topics yet</p>
      <p class="step-copy">Add your first topic, or load a sample agenda to see how it works.</p>
      <div class="actions">
        <button type="button" data-action="add-first-topic">+ Add first topic</button>
        <button type="button" class="ghost-btn" data-action="use-sample">Use sample agenda</button>
      </div>
    </div>`;
    state.agendaEditorSignature = signature;
    updateAgendaTotals();
    return;
  }

  const cards = state.rawAgenda.items.map((item, topicIdx) => {
    const subtopics = Array.isArray(item.subtopics) ? item.subtopics : [];
    const hasSubtopics = subtopics.length > 0;
    const subRows = subtopics.map((sub, subIdx) => {
      return `<div class="subtopic-row" data-subtopic-index="${subIdx}">
        <div class="field-group">
          <label>Subtopic name</label>
          <input data-field="subtopic-topic" type="text" placeholder="e.g. Frontend update" value="${escapeHtml(sub.topic || "")}">
        </div>
        <div class="field-group">
          <label>Minutes</label>
          <input data-field="subtopic-duration" type="number" min="0.1" step="0.5" value="${Number(sub.durationMinutes || 0)}">
        </div>
        <button class="tiny-btn danger-btn" data-action="remove-subtopic" type="button">Remove</button>
      </div>`;
    }).join("");

    const topicMinutes = hasSubtopics
      ? subtopics.reduce((acc, sub) => acc + (Number(sub.durationMinutes) || 0), 0)
      : Number(item.durationMinutes || 0);

    return `<article class="agenda-card" data-topic-index="${topicIdx}">
      <div class="agenda-card-head">
        <p class="agenda-card-title">Topic ${topicIdx + 1}</p>
        <button class="tiny-btn danger-btn" data-action="remove-topic" type="button">Remove topic</button>
      </div>
      <div class="field-grid">
        <div class="field-group">
          <label>Topic name</label>
          <input data-field="topic-name" type="text" placeholder="e.g. Project updates" value="${escapeHtml(item.topic || "")}">
        </div>
        <div class="field-group">
          <label>${hasSubtopics ? "Minutes (from subtopics)" : "Minutes"}</label>
          <input data-field="topic-duration" type="number" min="0.1" step="0.5" value="${topicMinutes}"${hasSubtopics ? " readonly" : ""}>
        </div>
      </div>
      <div class="subtopic-wrap">
        <div class="agenda-card-head">
          <p class="agenda-card-title">Subtopics (optional)</p>
          <button class="tiny-btn" data-action="add-subtopic" type="button">+ Add subtopic</button>
        </div>
        ${subRows || '<p class="timeline-subtitle">No subtopics. This topic runs as one timed section.</p>'}
      </div>
    </article>`;
  }).join("");

  el.agendaCards.innerHTML = cards;
  state.agendaEditorSignature = signature;
  updateAgendaTotals();
}

function updateAgendaTotals() {
  let totalMinutes = 0;
  el.agendaCards.querySelectorAll(".agenda-card").forEach((card) => {
    const topicInput = card.querySelector('[data-field="topic-duration"]');
    const subInputs = Array.from(card.querySelectorAll('[data-field="subtopic-duration"]'));
    if (subInputs.length) {
      const sum = subInputs.reduce((acc, input) => acc + (Number(input.value) || 0), 0);
      topicInput.value = String(Math.round(sum * 100) / 100);
      totalMinutes += sum;
    } else {
      totalMinutes += Number(topicInput.value) || 0;
    }
  });
  el.agendaTotal.textContent = formatDurationLabel(totalMinutes * 60000);
}

function rebuildAgendaFromCards() {
  const topicCards = Array.from(el.agendaCards.querySelectorAll(".agenda-card"));
  if (!topicCards.length) {
    throw new Error("Add at least one topic to continue.");
  }

  const items = topicCards.map((card, topicIdx) => {
    const topicName = card.querySelector('[data-field="topic-name"]').value.trim();
    const topicDuration = Number(card.querySelector('[data-field="topic-duration"]').value);
    const subtopicRows = Array.from(card.querySelectorAll(".subtopic-row"));
    const topicLabel = topicName ? `"${topicName}"` : `Topic ${topicIdx + 1}`;

    if (!topicName) {
      throw new Error(`Topic ${topicIdx + 1} needs a name.`);
    }

    if (!subtopicRows.length) {
      if (!(topicDuration > 0)) {
        throw new Error(`${topicLabel} needs a time greater than 0 minutes.`);
      }
      return { topic: topicName, durationMinutes: topicDuration };
    }

    const subtopics = subtopicRows.map((row, subIdx) => {
      const subName = row.querySelector('[data-field="subtopic-topic"]').value.trim();
      const subDuration = Number(row.querySelector('[data-field="subtopic-duration"]').value);
      if (!subName) {
        throw new Error(`Subtopic ${subIdx + 1} in ${topicLabel} needs a name.`);
      }
      if (!(subDuration > 0)) {
        throw new Error(`"${subName}" in ${topicLabel} needs a time greater than 0 minutes.`);
      }
      return { topic: subName, durationMinutes: subDuration };
    });

    return {
      topic: topicName,
      durationMinutes: subtopics.reduce((acc, sub) => acc + sub.durationMinutes, 0),
      subtopics
    };
  });

  return {
    title: el.agendaTitleInput.value.trim() || "Untitled meeting",
    items
  };
}

function resetRunState() {
  state.index = 0;
  state.sectionEndEpochMs = null;
  state.running = false;
  state.paused = false;
  state.pausedRemainingMs = null;
  state.finished = false;
  state.segmentListSignature = "";
}

function commitAgendaFromCards() {
  try {
    const rebuilt = rebuildAgendaFromCards();
    const segments = buildSegments(rebuilt);

    clearTimer();
    state.rawAgenda = rebuilt;
    state.segments = segments;
    resetRunState();
    state.agendaEditorSignature = "";
    renderAgendaEditor();

    el.agendaInput.value = JSON.stringify(rebuilt, null, 2);
    persistAgendaText();
    persistRuntimeState();
    render();
    return true;
  } catch (error) {
    setMessage(error.message, true);
    return false;
  }
}

function loadAgendaIntoEditor(agenda) {
  state.rawAgenda = JSON.parse(JSON.stringify(agenda));
  ensureRawAgenda();
  el.agendaTitleInput.value = state.rawAgenda.title || "";
  state.agendaEditorSignature = "";
  renderAgendaEditor();
}

function syncRawAgendaFromCardsForStructureChange() {
  const items = Array.from(el.agendaCards.querySelectorAll(".agenda-card")).map((card) => {
    const item = {
      topic: card.querySelector('[data-field="topic-name"]').value,
      durationMinutes: Number(card.querySelector('[data-field="topic-duration"]').value) || 0
    };
    const subtopics = Array.from(card.querySelectorAll(".subtopic-row")).map((row) => ({
      topic: row.querySelector('[data-field="subtopic-topic"]').value,
      durationMinutes: Number(row.querySelector('[data-field="subtopic-duration"]').value) || 0
    }));
    if (subtopics.length) {
      item.subtopics = subtopics;
    }
    return item;
  });

  state.rawAgenda = { title: el.agendaTitleInput.value, items };
  state.agendaEditorSignature = "";
}

function setFocusMode(open) {
  state.focusMode = open;
  el.focusModal.classList.toggle("open", open);
  el.focusModal.setAttribute("aria-hidden", open ? "false" : "true");
}

function setCornerTimer(visible, timeText = "00:00", topicText = "No section active") {
  el.cornerTimer.classList.toggle("visible", visible);
  el.cornerTimer.setAttribute("aria-hidden", visible ? "false" : "true");
  el.cornerTime.textContent = timeText;
  el.cornerTopic.textContent = topicText;
}

function setOrbTempo(usedRatio) {
  const ratio = Math.min(1, Math.max(0, usedRatio));
  const speedA = (52 - ratio * 26).toFixed(2);
  const speedB = (64 - ratio * 30).toFixed(2);
  document.documentElement.style.setProperty("--orb-speed", `${speedA}s`);
  document.documentElement.style.setProperty("--orb-speed-b", `${speedB}s`);

  const scaleA = (0.58 + ratio * 0.62).toFixed(3);
  const scaleB = (0.52 + ratio * 0.68).toFixed(3);
  document.documentElement.style.setProperty("--orb-scale-a", scaleA);
  document.documentElement.style.setProperty("--orb-scale-b", scaleB);
}

function setPagePhase(phaseClass, usedRatio = 0) {
  document.body.classList.remove("phase-good", "phase-warn", "phase-late");
  if (phaseClass === "good") {
    document.body.classList.add("phase-good");
  } else if (phaseClass === "warn") {
    document.body.classList.add("phase-warn");
  } else if (phaseClass === "late") {
    document.body.classList.add("phase-late");
  }
  setOrbTempo(usedRatio);
}

function formatDurationLabel(durationMs) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

function renderSegmentList() {
  const signature = `${state.segments.length}|${state.index}|${state.finished ? 1 : 0}`;
  if (signature === state.segmentListSignature) {
    return;
  }

  if (!state.segments.length) {
    el.segmentList.innerHTML = '<li class="segment-item empty">Load an agenda to preview section flow.</li>';
    state.segmentListSignature = signature;
    return;
  }

  const itemsHtml = state.segments.map((segment, idx) => {
    let stateClass = "upcoming";
    if (state.finished || idx < state.index) {
      stateClass = "passed";
    } else if (idx === state.index) {
      stateClass = "current";
    }

    const safeTitle = segment.path
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    return `<li class="segment-item ${stateClass}" data-index="${idx}" title="Click to start from this section"><span class="segment-title">${safeTitle}</span><span class="segment-time">${formatDurationLabel(segment.durationMs)}</span></li>`;
  }).join("");

  el.segmentList.innerHTML = itemsHtml;
  state.segmentListSignature = signature;
}

function buildSegments(agenda) {
  if (!agenda || !Array.isArray(agenda.items) || agenda.items.length === 0) {
    throw new Error("Agenda must include a non-empty items array.");
  }

  const segments = [];

  for (const item of agenda.items) {
    const hasSubtopics = Array.isArray(item.subtopics) && item.subtopics.length > 0;
    validateItem(item, "agenda item", !hasSubtopics);

    if (hasSubtopics) {
      for (const sub of item.subtopics) {
        validateItem(sub, `subtopic under ${item.topic}`);
        segments.push({
          title: sub.topic,
          path: `${item.topic} > ${sub.topic}`,
          durationMs: Math.round(sub.durationMinutes * 60 * 1000)
        });
      }
    } else {
      segments.push({
        title: item.topic,
        path: item.topic,
        durationMs: Math.round(item.durationMinutes * 60 * 1000)
      });
    }
  }

  if (segments.length === 0) {
    throw new Error("No runnable segments found in agenda.");
  }

  return segments;
}

function validateItem(item, label, requireDuration = true) {
  if (!item || typeof item.topic !== "string" || item.topic.trim() === "") {
    throw new Error(`Invalid ${label}: topic is required.`);
  }
  if (requireDuration && (typeof item.durationMinutes !== "number" || item.durationMinutes <= 0)) {
    throw new Error(`Invalid ${label}: durationMinutes must be a number > 0.`);
  }
}

function parseAgenda(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Agenda JSON is not valid.");
  }
  const segments = buildSegments(parsed);
  return { rawAgenda: parsed, segments };
}

function formatMs(ms) {
  const clamped = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clearTimer() {
  if (state.intervalId) {
    window.clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function startTicker() {
  clearTimer();
  state.intervalId = window.setInterval(tick, 250);
}

let toastTimeoutId = null;

function setMessage(text, isError = false) {
  el.toast.textContent = text;
  el.toast.classList.toggle("error", isError);
  el.toast.classList.add("show");
  window.clearTimeout(toastTimeoutId);
  toastTimeoutId = window.setTimeout(() => el.toast.classList.remove("show"), isError ? 5000 : 3000);
}

function showView(name) {
  state.view = name;
  Object.entries(el.views).forEach(([key, node]) => toggleVisible(node, key === name));

  const stepIdx = STEP_ORDER.indexOf(name);
  toggleVisible(el.stepper, stepIdx !== -1);
  el.stepper.querySelectorAll("li").forEach((li, idx) => {
    li.classList.toggle("active", idx === stepIdx);
    li.classList.toggle("done", idx < stepIdx);
  });

  if (name === "review") {
    renderReview();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderReview() {
  const totalMs = state.segments.reduce((acc, seg) => acc + seg.durationMs, 0);
  el.reviewTitle.textContent = (state.rawAgenda && state.rawAgenda.title) || "Untitled meeting";
  el.reviewTotal.textContent = formatDurationLabel(totalMs);
  el.reviewCount.textContent = String(state.segments.length);
  el.reviewEnd.textContent = new Date(Date.now() + totalMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  el.reviewList.innerHTML = state.segments.map((seg, idx) => {
    return `<li><span class="review-index">${idx + 1}</span><span class="review-path">${escapeHtml(seg.path)}</span><span class="review-time">${formatDurationLabel(seg.durationMs)}</span></li>`;
  }).join("");
}

function setActiveTab(tab) {
  const isVisual = tab === "visual";
  toggleVisible(el.visualPane, isVisual);
  toggleVisible(el.jsonPane, !isVisual);
  el.tabVisualBtn.classList.toggle("active", isVisual);
  el.tabJsonBtn.classList.toggle("active", !isVisual);
  el.tabVisualBtn.setAttribute("aria-selected", String(isVisual));
  el.tabJsonBtn.setAttribute("aria-selected", String(!isVisual));
}

function renderSessionBanner() {
  const active = state.running;
  toggleVisible(el.sessionBanner, active);
  el.letsBeginBtn.textContent = active ? "Set up a new agenda" : "Let's begin \u2192";
  if (!active) {
    return;
  }
  const seg = currentSegment();
  el.sessionBannerText.textContent = `${state.paused ? "Paused on" : "Now on"}: ${seg ? seg.path : ""}`;
  toggleVisible(el.bannerPauseBtn, !state.paused);
  toggleVisible(el.bannerResumeBtn, state.paused);
}

function setPanelPhase(phaseClass, label) {
  el.timerPanel.classList.remove("good", "warn", "late");
  el.phaseBadge.classList.remove("idle", "good", "warn", "late");
  el.progressFill.classList.remove("good", "warn", "late");

  if (phaseClass) {
    el.timerPanel.classList.add(phaseClass);
    el.phaseBadge.classList.add(phaseClass);
    el.progressFill.classList.add(phaseClass);
  } else {
    el.phaseBadge.classList.add("idle");
  }

  el.phaseBadge.textContent = label;
}

function persistAgendaText() {
  localStorage.setItem(STORAGE_KEYS.agendaText, el.agendaInput.value);
}

function persistRuntimeState() {
  const data = {
    rawAgenda: state.rawAgenda,
    segments: state.segments,
    index: state.index,
    sectionEndEpochMs: state.sectionEndEpochMs,
    running: state.running,
    paused: state.paused,
    pausedRemainingMs: state.pausedRemainingMs,
    finished: state.finished
  };
  localStorage.setItem(STORAGE_KEYS.runtime, JSON.stringify(data));
}

function endSession(askConfirm = true) {
  if (askConfirm && !window.confirm("End this session? The timer will stop and progress will be lost.")) {
    return false;
  }
  clearTimer();
  resetRunState();
  setFocusMode(false);
  persistRuntimeState();
  render();
  return true;
}

function currentSegment() {
  return state.segments[state.index] || null;
}

function advanceSegment() {
  state.index += 1;
  const next = currentSegment();

  if (!next) {
    state.running = false;
    state.finished = true;
    state.sectionEndEpochMs = null;
    clearTimer();
    persistRuntimeState();
    render();
    return;
  }

  state.sectionEndEpochMs = Date.now() + next.durationMs;
  persistRuntimeState();
  render();
}

function tick() {
  if (!state.running || state.paused) {
    return;
  }

  const seg = currentSegment();
  if (!seg) {
    return;
  }

  const remaining = state.sectionEndEpochMs - Date.now();
  if (remaining <= 0) {
    advanceSegment();
    return;
  }

  render();
  persistRuntimeState();
}

function computePhase(seg, remainingMs) {
  const usedRatio = 1 - remainingMs / seg.durationMs;
  const greenCutoff = state.phaseThresholds.greenEndPct / 100;
  const yellowCutoff = state.phaseThresholds.yellowEndPct / 100;

  if (usedRatio < greenCutoff) {
    return { cls: "good", label: "On Track" };
  }
  if (usedRatio < yellowCutoff) {
    return { cls: "warn", label: "Watch Time" };
  }
  return { cls: "late", label: "Wrap Up" };
}

function render() {
  const hasAgenda = state.segments.length > 0;
  const seg = currentSegment();

  toggleVisible(el.focusStartBtn, hasAgenda && !state.running && !state.finished);
  toggleVisible(el.focusPauseBtn, state.running && !state.paused);
  toggleVisible(el.focusResumeBtn, state.running && state.paused);
  toggleVisible(el.focusEndBtn, state.running);
  toggleVisible(el.focusRestartBtn, state.finished);
  toggleVisible(el.focusEditBtn, state.finished);
  el.focusTitle.textContent = (state.rawAgenda && state.rawAgenda.title) || "Agenda Timer";
  renderSessionBanner();

  if (!hasAgenda) {
    el.currentTopic.textContent = "No agenda loaded";
    el.currentPath.textContent = "Build an agenda to begin.";
    el.timeRemaining.textContent = "00:00";
    el.progressText.textContent = "0%";
    el.progressFill.style.width = "0%";
    el.progressFill.parentElement.setAttribute("aria-valuenow", "0");
    el.nextUp.textContent = "";
    setPanelPhase(null, "Idle");
    setPagePhase(null, 0);
    setCornerTimer(false);
    renderSegmentList();
    return;
  }

  if (state.finished) {
    el.currentTopic.textContent = "Agenda complete";
    el.currentPath.textContent = "All topics finished. Nice work!";
    el.timeRemaining.textContent = "00:00";
    el.progressText.textContent = "100%";
    el.progressFill.style.width = "100%";
    el.progressFill.parentElement.setAttribute("aria-valuenow", "100");
    el.nextUp.textContent = "Nothing \u2014 you're done.";
    setPanelPhase("good", "Done");
    setPagePhase(state.focusMode ? "good" : null, 0);
    setCornerTimer(false);
    renderSegmentList();
    return;
  }

  if (!seg) {
    return;
  }

  let remainingMs;
  if (state.paused) {
    remainingMs = state.pausedRemainingMs || seg.durationMs;
  } else if (state.running) {
    remainingMs = Math.max(0, state.sectionEndEpochMs - Date.now());
  } else {
    remainingMs = seg.durationMs;
  }

  const progress = Math.min(100, Math.max(0, Math.round((1 - remainingMs / seg.durationMs) * 100)));
  const usedRatio = 1 - remainingMs / seg.durationMs;
  const phase = computePhase(seg, remainingMs);

  el.currentTopic.textContent = seg.title;
  el.currentPath.textContent = seg.path;
  el.timeRemaining.textContent = formatMs(remainingMs);
  el.progressText.textContent = `${progress}%`;
  el.progressFill.style.width = `${progress}%`;
  el.progressFill.parentElement.setAttribute("aria-valuenow", String(progress));

  const next = state.segments[state.index + 1];
  el.nextUp.textContent = next ? next.path : "End of agenda";

  if (!state.running) {
    setPanelPhase(null, "Ready");
    setPagePhase(null, 0);
    setCornerTimer(false);
    renderSegmentList();
    return;
  }

  setPanelPhase(phase.cls, state.paused ? "Paused" : phase.label);
  setPagePhase(phase.cls, usedRatio);
  setCornerTimer(!state.focusMode, formatMs(remainingMs), seg.path);

  renderSegmentList();
}

function importJsonAgenda() {
  const jsonText = el.agendaInput.value.trim();
  if (!jsonText) {
    setMessage("Paste your agenda JSON first.", true);
    return false;
  }

  try {
    const parsed = parseAgenda(jsonText);
    loadAgendaIntoEditor(parsed.rawAgenda);
    persistAgendaText();
    setActiveTab("visual");
    setMessage(`Imported ${parsed.rawAgenda.items.length} topic(s). Review them below.`);
    return true;
  } catch (error) {
    setMessage(error.message, true);
    return false;
  }
}

function startTimer() {
  if (!state.segments.length) {
    setMessage("Load an agenda first.", true);
    return;
  }

  state.index = 0;
  state.sectionEndEpochMs = Date.now() + state.segments[0].durationMs;
  state.running = true;
  state.paused = false;
  state.pausedRemainingMs = null;
  state.finished = false;
  state.segmentListSignature = "";
  setFocusMode(true);
  startTicker();
  persistRuntimeState();
  render();
  setMessage("Timer started.");
}

function startFromSection(sectionIndex) {
  if (!state.segments.length) {
    setMessage("Load an agenda first.", true);
    return;
  }

  if (sectionIndex < 0 || sectionIndex >= state.segments.length) {
    setMessage("Invalid section selection.", true);
    return;
  }

  state.index = sectionIndex;
  state.sectionEndEpochMs = Date.now() + state.segments[sectionIndex].durationMs;
  state.running = true;
  state.paused = false;
  state.pausedRemainingMs = null;
  state.finished = false;
  state.segmentListSignature = "";
  setFocusMode(true);
  startTicker();
  persistRuntimeState();
  render();
  setMessage(`Started from section ${sectionIndex + 1}.`);
}

function pauseTimer() {
  if (!state.running || state.paused) {
    return;
  }

  const seg = currentSegment();
  if (!seg) {
    return;
  }

  state.pausedRemainingMs = Math.max(0, state.sectionEndEpochMs - Date.now());
  state.paused = true;
  persistRuntimeState();
  render();
  setMessage("Timer paused.");
}

function resumeTimer() {
  if (!state.running || !state.paused) {
    return;
  }

  const seg = currentSegment();
  if (!seg) {
    return;
  }

  state.sectionEndEpochMs = Date.now() + (state.pausedRemainingMs || seg.durationMs);
  state.paused = false;
  state.pausedRemainingMs = null;
  startTicker();
  persistRuntimeState();
  render();
  setMessage("Timer resumed.");
}

function restoreFromStorage() {
  loadPhaseThresholds();
  renderColorPreview();
  el.jsonHelp.textContent = JSON.stringify(SAMPLE_AGENDA, null, 2);
  el.agendaInput.value = localStorage.getItem(STORAGE_KEYS.agendaText) || "";

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.runtime) || "null");
  } catch {
    localStorage.removeItem(STORAGE_KEYS.runtime);
  }

  if (saved && Array.isArray(saved.segments) && saved.segments.length) {
    state.rawAgenda = saved.rawAgenda || null;
    state.segments = saved.segments;
    state.index = typeof saved.index === "number" ? saved.index : 0;
    state.sectionEndEpochMs = typeof saved.sectionEndEpochMs === "number" ? saved.sectionEndEpochMs : null;
    state.running = Boolean(saved.running);
    state.paused = Boolean(saved.paused);
    state.pausedRemainingMs = typeof saved.pausedRemainingMs === "number" ? saved.pausedRemainingMs : null;
    state.finished = Boolean(saved.finished);
  } else {
    try {
      state.rawAgenda = JSON.parse(el.agendaInput.value);
    } catch {
      state.rawAgenda = null;
    }
  }

  loadAgendaIntoEditor(state.rawAgenda || { title: "", items: [] });
  setFocusMode(state.running);
  showView("welcome");

  if (state.running && !state.paused && state.sectionEndEpochMs) {
    startTicker();
    tick();
  }
  render();
}

function closeFocusMode() {
  setFocusMode(false);
  if (state.running) {
    showView("welcome");
  } else if (state.finished) {
    showView("review");
  }
  render();
}

function openFocusMode() {
  setFocusMode(true);
  render();
}

function beginSetup() {
  if (state.running && !endSession()) {
    return;
  }
  showView("build");
}

function useSampleAgenda() {
  if (state.running && !endSession()) {
    return;
  }
  loadAgendaIntoEditor(SAMPLE_AGENDA);
  setActiveTab("visual");
  showView("build");
  setMessage("Sample agenda loaded. Edit anything you like.");
}

function addTopicAndFocus() {
  syncRawAgendaFromCardsForStructureChange();
  ensureRawAgenda();
  state.rawAgenda.items.push(blankTopic());
  state.agendaEditorSignature = "";
  renderAgendaEditor();
  const inputs = el.agendaCards.querySelectorAll('[data-field="topic-name"]');
  const last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    last.select();
  }
}

el.letsBeginBtn.addEventListener("click", beginSetup);
el.sampleAgendaBtn.addEventListener("click", useSampleAgenda);
el.bannerOpenTimerBtn.addEventListener("click", openFocusMode);
el.bannerPauseBtn.addEventListener("click", pauseTimer);
el.bannerResumeBtn.addEventListener("click", resumeTimer);
el.bannerEndBtn.addEventListener("click", () => endSession());

el.tabVisualBtn.addEventListener("click", () => setActiveTab("visual"));
el.tabJsonBtn.addEventListener("click", () => {
  try {
    el.agendaInput.value = JSON.stringify(rebuildAgendaFromCards(), null, 2);
  } catch {
    // Cards are incomplete; leave whatever JSON is already there.
  }
  setActiveTab("json");
});
el.importJsonBtn.addEventListener("click", importJsonAgenda);

el.buildBackBtn.addEventListener("click", () => showView("welcome"));
el.buildNextBtn.addEventListener("click", () => {
  if (!el.jsonPane.classList.contains("hidden") && !importJsonAgenda()) {
    return;
  }
  if (commitAgendaFromCards()) {
    showView("colors");
  }
});
el.colorsBackBtn.addEventListener("click", () => showView("build"));
el.colorsNextBtn.addEventListener("click", () => {
  if (commitPhaseThresholds()) {
    showView("review");
  }
});
el.reviewBackBtn.addEventListener("click", () => showView("colors"));
el.reviewStartBtn.addEventListener("click", startTimer);

el.greenUntilInput.addEventListener("input", renderColorPreview);
el.yellowUntilInput.addEventListener("input", renderColorPreview);

el.focusStartBtn.addEventListener("click", startTimer);
el.focusPauseBtn.addEventListener("click", pauseTimer);
el.focusResumeBtn.addEventListener("click", resumeTimer);
el.focusRestartBtn.addEventListener("click", startTimer);
el.focusEditBtn.addEventListener("click", () => {
  endSession(false);
  showView("build");
});
el.focusEndBtn.addEventListener("click", () => {
  if (endSession()) {
    showView("review");
  }
});

function canScrubProgress() {
  return state.segments.length > 0 && !state.finished && (state.running || state.paused);
}

function scrubCurrentSectionTo(percent) {
  if (!canScrubProgress()) {
    return;
  }

  const seg = currentSegment();
  if (!seg) {
    return;
  }

  const clamped = Math.max(0, Math.min(100, percent));
  const remainingMs = Math.max(0, Math.round(seg.durationMs * (1 - clamped / 100)));

  if (state.paused) {
    state.pausedRemainingMs = remainingMs;
  } else {
    state.sectionEndEpochMs = Date.now() + remainingMs;
  }

  persistRuntimeState();
  render();
}

function scrubFromPointer(clientX) {
  const rect = el.progressTrack.getBoundingClientRect();
  if (!rect.width) {
    return;
  }
  const pct = ((clientX - rect.left) / rect.width) * 100;
  scrubCurrentSectionTo(pct);
}

el.progressTrack.addEventListener("pointerdown", (event) => {
  if (!canScrubProgress()) {
    return;
  }
  el.progressTrack.setPointerCapture(event.pointerId);
  scrubFromPointer(event.clientX);
});

el.progressTrack.addEventListener("pointermove", (event) => {
  if (!canScrubProgress()) {
    return;
  }
  if ((event.buttons & 1) === 1 || el.progressTrack.hasPointerCapture(event.pointerId)) {
    scrubFromPointer(event.clientX);
  }
});

el.progressTrack.addEventListener("pointerup", (event) => {
  if (el.progressTrack.hasPointerCapture(event.pointerId)) {
    el.progressTrack.releasePointerCapture(event.pointerId);
  }
});
el.addTopicBtn.addEventListener("click", addTopicAndFocus);
el.agendaCards.addEventListener("input", updateAgendaTotals);
el.agendaCards.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.getAttribute("data-action");
  if (!action) {
    return;
  }

  if (action === "add-first-topic") {
    addTopicAndFocus();
    return;
  }

  if (action === "use-sample") {
    useSampleAgenda();
    return;
  }

  syncRawAgendaFromCardsForStructureChange();
  ensureRawAgenda();
  const topicCard = target.closest(".agenda-card");
  if (!topicCard) {
    return;
  }

  const topicIdx = Number(topicCard.getAttribute("data-topic-index"));
  if (Number.isNaN(topicIdx) || !state.rawAgenda.items[topicIdx]) {
    return;
  }

  if (action === "remove-topic") {
    state.rawAgenda.items.splice(topicIdx, 1);
    state.agendaEditorSignature = "";
    renderAgendaEditor();
    return;
  }

  if (action === "add-subtopic") {
    if (!Array.isArray(state.rawAgenda.items[topicIdx].subtopics)) {
      state.rawAgenda.items[topicIdx].subtopics = [];
    }
    state.rawAgenda.items[topicIdx].subtopics.push(blankSubtopic());
    state.agendaEditorSignature = "";
    renderAgendaEditor();
    return;
  }

  if (action === "remove-subtopic") {
    const row = target.closest(".subtopic-row");
    const subIdx = row ? Number(row.getAttribute("data-subtopic-index")) : -1;
    if (Number.isNaN(subIdx) || subIdx < 0) {
      return;
    }
    const subtopics = state.rawAgenda.items[topicIdx].subtopics;
    if (!Array.isArray(subtopics) || !subtopics[subIdx]) {
      return;
    }
    subtopics.splice(subIdx, 1);
    state.agendaEditorSignature = "";
    renderAgendaEditor();
  }
});
el.segmentList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const item = target.closest(".segment-item");
  if (!item || item.classList.contains("empty")) {
    return;
  }

  const idx = Number(item.getAttribute("data-index"));
  if (Number.isNaN(idx)) {
    return;
  }

  const path = state.segments[idx] ? state.segments[idx].path : `section ${idx + 1}`;
  const confirmed = window.confirm(`Restart from ${path}?`);
  if (!confirmed) {
    setMessage("Section restart canceled.");
    return;
  }

  startFromSection(idx);
});
el.cornerOpenFocusBtn.addEventListener("click", openFocusMode);
el.closeFocusBtn.addEventListener("click", closeFocusMode);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.focusMode) {
    closeFocusMode();
  }
});
el.agendaInput.addEventListener("input", persistAgendaText);

restoreFromStorage();
