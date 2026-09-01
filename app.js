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
  phaseThresholds: { ...DEFAULT_PHASE_THRESHOLDS }
};

const el = {
  agendaInput: document.getElementById("agendaInput"),
  loadAgendaBtn: document.getElementById("loadAgendaBtn"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  openFocusBtn: document.getElementById("openFocusBtn"),
  resetBtn: document.getElementById("resetBtn"),
  greenUntilInput: document.getElementById("greenUntilInput"),
  yellowUntilInput: document.getElementById("yellowUntilInput"),
  applyPhaseSettingsBtn: document.getElementById("applyPhaseSettingsBtn"),
  focusModal: document.getElementById("focusModal"),
  closeFocusBtn: document.getElementById("closeFocusBtn"),
  inputMessage: document.getElementById("inputMessage"),
  agendaEditor: document.getElementById("agendaEditor"),
  agendaCards: document.getElementById("agendaCards"),
  addTopicBtn: document.getElementById("addTopicBtn"),
  applyCardEditsBtn: document.getElementById("applyCardEditsBtn"),
  focusStartBtn: document.getElementById("focusStartBtn"),
  focusStopBtn: document.getElementById("focusStopBtn"),
  focusResumeBtn: document.getElementById("focusResumeBtn"),
  progressTrack: document.getElementById("progressTrack"),
  timerPanel: document.getElementById("timerPanel"),
  phaseBadge: document.getElementById("phaseBadge"),
  progressText: document.getElementById("progressText"),
  progressFill: document.getElementById("progressFill"),
  segmentList: document.getElementById("segmentList"),
  currentTopic: document.getElementById("currentTopic"),
  currentPath: document.getElementById("currentPath"),
  timeRemaining: document.getElementById("timeRemaining"),
  nextUp: document.getElementById("nextUp"),
  jsonHelp: document.getElementById("jsonHelp"),
  cornerTimer: document.getElementById("cornerTimer"),
  cornerTime: document.getElementById("cornerTime"),
  cornerTopic: document.getElementById("cornerTopic"),
  cornerOpenFocusBtn: document.getElementById("cornerOpenFocusBtn")
};

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

function applyPhaseThresholdSettings() {
  try {
    const next = normalizePhaseThresholds(el.greenUntilInput.value, el.yellowUntilInput.value);
    state.phaseThresholds = next;
    persistPhaseThresholds();
    render();
    setMessage(
      `Color thresholds updated: green 0-${next.greenEndPct}%, yellow ${next.greenEndPct}-${next.yellowEndPct}%, red ${next.yellowEndPct}-100%.`
    );
  } catch (error) {
    setMessage(error.message, true);
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
    state.rawAgenda = { title: "Agenda Timer Session", items: [] };
  }
}

function renderAgendaEditor() {
  ensureRawAgenda();

  if (!state.rawAgenda.items.length && !state.segments.length) {
    el.agendaEditor.classList.add("hidden");
    el.agendaCards.innerHTML = "";
    state.agendaEditorSignature = "";
    return;
  }

  el.agendaEditor.classList.remove("hidden");
  const signature = JSON.stringify(state.rawAgenda.items);
  if (signature === state.agendaEditorSignature) {
    return;
  }

  const cards = state.rawAgenda.items.map((item, topicIdx) => {
    const subtopics = Array.isArray(item.subtopics) ? item.subtopics : [];
    const subRows = subtopics.map((sub, subIdx) => {
      return `<div class="subtopic-row" data-subtopic-index="${subIdx}">
        <div class="field-group">
          <label>Subtopic</label>
          <input data-field="subtopic-topic" type="text" value="${escapeHtml(sub.topic || "")}">
        </div>
        <div class="field-group">
          <label>Minutes</label>
          <input data-field="subtopic-duration" type="number" min="0.1" step="0.1" value="${Number(sub.durationMinutes || 0)}">
        </div>
        <button class="tiny-btn danger-btn" data-action="remove-subtopic" type="button">Remove</button>
      </div>`;
    }).join("");

    return `<article class="agenda-card" data-topic-index="${topicIdx}">
      <div class="agenda-card-head">
        <p class="agenda-card-title">Topic ${topicIdx + 1}</p>
        <button class="tiny-btn danger-btn" data-action="remove-topic" type="button">Remove Topic</button>
      </div>
      <div class="field-grid">
        <div class="field-group">
          <label>Topic Name</label>
          <input data-field="topic-name" type="text" value="${escapeHtml(item.topic || "")}">
        </div>
        <div class="field-group">
          <label>Minutes</label>
          <input data-field="topic-duration" type="number" min="0.1" step="0.1" value="${Number(item.durationMinutes || 0)}">
        </div>
      </div>
      <div class="subtopic-wrap">
        <div class="agenda-card-head">
          <p class="agenda-card-title">Subtopics</p>
          <button class="tiny-btn" data-action="add-subtopic" type="button">Add Subtopic</button>
        </div>
        ${subRows || '<p class="timeline-subtitle">No subtopics. This topic will run as one timed section.</p>'}
      </div>
    </article>`;
  }).join("");

  el.agendaCards.innerHTML = cards;
  state.agendaEditorSignature = signature;
}

function rebuildAgendaFromCards() {
  const topicCards = Array.from(el.agendaCards.querySelectorAll(".agenda-card"));
  if (!topicCards.length) {
    throw new Error("Add at least one topic in the visual editor.");
  }

  const items = topicCards.map((card) => {
    const topicName = card.querySelector('[data-field="topic-name"]').value.trim();
    const topicDurationRaw = Number(card.querySelector('[data-field="topic-duration"]').value);
    const subtopicRows = Array.from(card.querySelectorAll(".subtopic-row"));

    const item = {
      topic: topicName,
      durationMinutes: topicDurationRaw
    };

    if (subtopicRows.length) {
      item.subtopics = subtopicRows.map((row) => {
        const subName = row.querySelector('[data-field="subtopic-topic"]').value.trim();
        const subDurationRaw = Number(row.querySelector('[data-field="subtopic-duration"]').value);
        return {
          topic: subName,
          durationMinutes: subDurationRaw
        };
      });
    }

    return item;
  });

  return {
    title: (state.rawAgenda && state.rawAgenda.title) || "Agenda Timer Session",
    items
  };
}

function applyVisualEdits(showMessage = true) {
  try {
    const rebuilt = rebuildAgendaFromCards();
    const segments = buildSegments(rebuilt);

    clearTimer();
    state.rawAgenda = rebuilt;
    state.segments = segments;
    state.index = 0;
    state.sectionEndEpochMs = null;
    state.running = false;
    state.paused = false;
    state.pausedRemainingMs = null;
    state.finished = false;
    state.segmentListSignature = "";
    state.agendaEditorSignature = "";
    setFocusMode(false);

    el.agendaInput.value = JSON.stringify(rebuilt, null, 2);
    persistAgendaText();
    persistRuntimeState();
    render();
    renderAgendaEditor();

    if (showMessage) {
      setMessage(`Applied card edits. Agenda has ${segments.length} segment(s).`);
    }
  } catch (error) {
    setMessage(error.message, true);
  }
}

function syncRawAgendaFromCardsForStructureChange() {
  try {
    const rebuilt = rebuildAgendaFromCards();
    state.rawAgenda = rebuilt;
    state.agendaEditorSignature = "";
  } catch {
    ensureRawAgenda();
  }
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
    validateItem(item, "agenda item");

    if (Array.isArray(item.subtopics) && item.subtopics.length > 0) {
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

function validateItem(item, label) {
  if (!item || typeof item.topic !== "string" || item.topic.trim() === "") {
    throw new Error(`Invalid ${label}: topic is required.`);
  }
  if (typeof item.durationMinutes !== "number" || item.durationMinutes <= 0) {
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

function setMessage(text, isError = false) {
  el.inputMessage.textContent = text;
  el.inputMessage.style.color = isError ? "#ff9ea9" : "#b5c7e4";
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

function resetRuntimeState() {
  clearTimer();
  state.rawAgenda = { title: "Agenda Timer Session", items: [] };
  state.segments = [];
  state.index = 0;
  state.sectionEndEpochMs = null;
  state.running = false;
  state.paused = false;
  state.pausedRemainingMs = null;
  state.finished = false;
  state.segmentListSignature = "";
  state.agendaEditorSignature = "";
  setFocusMode(false);
  localStorage.removeItem(STORAGE_KEYS.runtime);
  render();
  renderAgendaEditor();
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
  const canReopenFocus = hasAgenda;

  el.startBtn.disabled = !hasAgenda || state.running;
  el.pauseBtn.disabled = !(state.running && !state.paused);
  el.resumeBtn.disabled = !(state.running && state.paused);
  el.openFocusBtn.disabled = !canReopenFocus;
  el.cornerOpenFocusBtn.disabled = !canReopenFocus;
  el.resetBtn.disabled = !hasAgenda && !state.running && !state.finished;
  el.focusStartBtn.disabled = !hasAgenda || state.running;
  el.focusStopBtn.disabled = !(state.running && !state.paused);
  el.focusResumeBtn.disabled = !(state.running && state.paused);

  if (!hasAgenda) {
    el.currentTopic.textContent = "No agenda loaded";
    el.currentPath.textContent = "Load an agenda to begin.";
    el.timeRemaining.textContent = "00:00";
    el.progressText.textContent = "0%";
    el.progressFill.style.width = "0%";
    el.progressFill.parentElement.setAttribute("aria-valuenow", "0");
    el.nextUp.textContent = "";
    setPanelPhase(null, "Idle");
    setPagePhase(null, 0);
    setCornerTimer(false);
    renderSegmentList();
    renderAgendaEditor();
    return;
  }

  if (state.finished) {
    el.currentTopic.textContent = "Agenda complete";
    el.currentPath.textContent = "All topics finished.";
    el.timeRemaining.textContent = "00:00";
    el.progressText.textContent = "100%";
    el.progressFill.style.width = "100%";
    el.progressFill.parentElement.setAttribute("aria-valuenow", "100");
    el.nextUp.textContent = "Agenda Complete";
    setPanelPhase("good", "Done");
    setPagePhase("good", 0);
    setCornerTimer(!state.focusMode, "00:00", "Agenda complete");
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

  if (state.paused) {
    setPanelPhase(phase.cls, "Paused");
  } else {
    setPanelPhase(phase.cls, phase.label);
  }
  setPagePhase(phase.cls, usedRatio);
  setCornerTimer(!state.focusMode, formatMs(remainingMs), seg.path);

  renderSegmentList();
}

function loadAgendaFromInput() {
  const jsonText = el.agendaInput.value.trim();
  if (!jsonText) {
    setMessage("Paste agenda JSON first.", true);
    return;
  }

  try {
    const parsed = parseAgenda(jsonText);
    state.rawAgenda = parsed.rawAgenda;
    state.segments = parsed.segments;
    state.index = 0;
    state.sectionEndEpochMs = null;
    state.running = false;
    state.paused = false;
    state.pausedRemainingMs = null;
    state.finished = false;
    state.segmentListSignature = "";
    state.agendaEditorSignature = "";
    persistAgendaText();
    persistRuntimeState();
    render();
    renderAgendaEditor();
    setMessage(`Agenda loaded with ${state.segments.length} segment(s).`);
  } catch (error) {
    setMessage(error.message, true);
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
  el.agendaInput.value = localStorage.getItem(STORAGE_KEYS.agendaText) || JSON.stringify(SAMPLE_AGENDA, null, 2);
  el.jsonHelp.textContent = JSON.stringify(SAMPLE_AGENDA, null, 2);

  const runtimeRaw = localStorage.getItem(STORAGE_KEYS.runtime);
  if (!runtimeRaw) {
    state.rawAgenda = SAMPLE_AGENDA;
    state.agendaEditorSignature = "";
    renderAgendaEditor();
    render();
    return;
  }

  try {
    const saved = JSON.parse(runtimeRaw);
    if (!saved || !Array.isArray(saved.segments)) {
      throw new Error("Invalid saved state.");
    }

    state.rawAgenda = saved.rawAgenda || null;
    state.segments = saved.segments;
    state.index = typeof saved.index === "number" ? saved.index : 0;
    state.sectionEndEpochMs = typeof saved.sectionEndEpochMs === "number" ? saved.sectionEndEpochMs : null;
    state.running = Boolean(saved.running);
    state.paused = Boolean(saved.paused);
    state.pausedRemainingMs = typeof saved.pausedRemainingMs === "number" ? saved.pausedRemainingMs : null;
    state.finished = Boolean(saved.finished);
    state.segmentListSignature = "";
    state.agendaEditorSignature = "";
    setFocusMode(Boolean(state.running || state.paused));

    if (state.running && !state.paused && state.sectionEndEpochMs) {
      startTicker();
      tick();
    }

    render();
    renderAgendaEditor();
    setMessage("Restored saved timer state.");
  } catch {
    localStorage.removeItem(STORAGE_KEYS.runtime);
    state.rawAgenda = SAMPLE_AGENDA;
    state.agendaEditorSignature = "";
    renderAgendaEditor();
    render();
  }
}

function closeFocusMode() {
  setFocusMode(false);
  render();
}

el.loadAgendaBtn.addEventListener("click", loadAgendaFromInput);
el.startBtn.addEventListener("click", startTimer);
el.pauseBtn.addEventListener("click", pauseTimer);
el.resumeBtn.addEventListener("click", resumeTimer);
el.focusStartBtn.addEventListener("click", startTimer);
el.focusStopBtn.addEventListener("click", pauseTimer);
el.focusResumeBtn.addEventListener("click", resumeTimer);

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
el.addTopicBtn.addEventListener("click", () => {
  syncRawAgendaFromCardsForStructureChange();
  ensureRawAgenda();
  state.rawAgenda.items.push(blankTopic());
  state.agendaEditorSignature = "";
  renderAgendaEditor();
  setMessage("Added a new topic card. Apply edits when ready.");
});
el.applyCardEditsBtn.addEventListener("click", () => applyVisualEdits(true));
el.agendaCards.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.getAttribute("data-action");
  if (!action) {
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
    if (!state.rawAgenda.items.length) {
      state.rawAgenda.items.push(blankTopic());
    }
    state.agendaEditorSignature = "";
    renderAgendaEditor();
    setMessage("Removed topic card. Apply edits when ready.");
    return;
  }

  if (action === "add-subtopic") {
    if (!Array.isArray(state.rawAgenda.items[topicIdx].subtopics)) {
      state.rawAgenda.items[topicIdx].subtopics = [];
    }
    state.rawAgenda.items[topicIdx].subtopics.push(blankSubtopic());
    state.agendaEditorSignature = "";
    renderAgendaEditor();
    setMessage("Added subtopic card. Apply edits when ready.");
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
    setMessage("Removed subtopic card. Apply edits when ready.");
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
el.openFocusBtn.addEventListener("click", () => {
  setFocusMode(true);
  render();
});
el.cornerOpenFocusBtn.addEventListener("click", () => {
  setFocusMode(true);
  render();
});
el.closeFocusBtn.addEventListener("click", closeFocusMode);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.focusMode) {
    closeFocusMode();
  }
});
el.resetBtn.addEventListener("click", () => {
  resetRuntimeState();
  setMessage("Timer state reset.");
});
el.agendaInput.addEventListener("input", persistAgendaText);
el.applyPhaseSettingsBtn.addEventListener("click", applyPhaseThresholdSettings);

restoreFromStorage();
renderAgendaEditor();
