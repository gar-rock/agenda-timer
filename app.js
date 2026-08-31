const STORAGE_KEYS = {
  agendaText: "agenda_timer_agenda_text",
  runtime: "agenda_timer_runtime_state"
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
  finished: false
};

const el = {
  agendaInput: document.getElementById("agendaInput"),
  loadAgendaBtn: document.getElementById("loadAgendaBtn"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  resetBtn: document.getElementById("resetBtn"),
  inputMessage: document.getElementById("inputMessage"),
  timerPanel: document.getElementById("timerPanel"),
  phaseBadge: document.getElementById("phaseBadge"),
  progressText: document.getElementById("progressText"),
  progressFill: document.getElementById("progressFill"),
  currentTopic: document.getElementById("currentTopic"),
  currentPath: document.getElementById("currentPath"),
  timeRemaining: document.getElementById("timeRemaining"),
  nextUp: document.getElementById("nextUp"),
  jsonHelp: document.getElementById("jsonHelp")
};

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
  el.inputMessage.style.color = isError ? "#9d2719" : "#54645a";
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
  state.rawAgenda = null;
  state.segments = [];
  state.index = 0;
  state.sectionEndEpochMs = null;
  state.running = false;
  state.paused = false;
  state.pausedRemainingMs = null;
  state.finished = false;
  localStorage.removeItem(STORAGE_KEYS.runtime);
  render();
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
  if (usedRatio < 0.75) {
    return { cls: "good", label: "On Track" };
  }
  if (usedRatio < 0.95) {
    return { cls: "warn", label: "Watch Time" };
  }
  return { cls: "late", label: "Wrap Up" };
}

function render() {
  const hasAgenda = state.segments.length > 0;
  const seg = currentSegment();

  el.startBtn.disabled = !hasAgenda || state.running;
  el.pauseBtn.disabled = !(state.running && !state.paused);
  el.resumeBtn.disabled = !(state.running && state.paused);
  el.resetBtn.disabled = !hasAgenda && !state.running && !state.finished;

  if (!hasAgenda) {
    el.currentTopic.textContent = "No agenda loaded";
    el.currentPath.textContent = "Load an agenda to begin.";
    el.timeRemaining.textContent = "00:00";
    el.progressText.textContent = "0%";
    el.progressFill.style.width = "0%";
    el.progressFill.parentElement.setAttribute("aria-valuenow", "0");
    el.nextUp.textContent = "";
    setPanelPhase(null, "Idle");
    return;
  }

  if (state.finished) {
    el.currentTopic.textContent = "Agenda complete";
    el.currentPath.textContent = "All topics finished.";
    el.timeRemaining.textContent = "00:00";
    el.progressText.textContent = "100%";
    el.progressFill.style.width = "100%";
    el.progressFill.parentElement.setAttribute("aria-valuenow", "100");
    el.nextUp.textContent = "";
    setPanelPhase("good", "Done");
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
  const phase = computePhase(seg, remainingMs);

  el.currentTopic.textContent = seg.title;
  el.currentPath.textContent = seg.path;
  el.timeRemaining.textContent = formatMs(remainingMs);
  el.progressText.textContent = `${progress}%`;
  el.progressFill.style.width = `${progress}%`;
  el.progressFill.parentElement.setAttribute("aria-valuenow", String(progress));

  const next = state.segments[state.index + 1];
  el.nextUp.textContent = next ? `Next: ${next.path}` : "Next: End of agenda";

  if (state.paused) {
    setPanelPhase(phase.cls, "Paused");
  } else {
    setPanelPhase(phase.cls, phase.label);
  }
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
    persistAgendaText();
    persistRuntimeState();
    render();
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
  startTicker();
  persistRuntimeState();
  render();
  setMessage("Timer started.");
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
  el.agendaInput.value = localStorage.getItem(STORAGE_KEYS.agendaText) || JSON.stringify(SAMPLE_AGENDA, null, 2);
  el.jsonHelp.textContent = JSON.stringify(SAMPLE_AGENDA, null, 2);

  const runtimeRaw = localStorage.getItem(STORAGE_KEYS.runtime);
  if (!runtimeRaw) {
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

    if (state.running && !state.paused && state.sectionEndEpochMs) {
      startTicker();
      tick();
    }

    render();
    setMessage("Restored saved timer state.");
  } catch {
    localStorage.removeItem(STORAGE_KEYS.runtime);
    render();
  }
}

el.loadAgendaBtn.addEventListener("click", loadAgendaFromInput);
el.startBtn.addEventListener("click", startTimer);
el.pauseBtn.addEventListener("click", pauseTimer);
el.resumeBtn.addEventListener("click", resumeTimer);
el.resetBtn.addEventListener("click", () => {
  resetRuntimeState();
  setMessage("Timer state reset.");
});
el.agendaInput.addEventListener("input", persistAgendaText);

restoreFromStorage();
