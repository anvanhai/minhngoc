/**
 * MODULE ĐẾM THỜI GIAN HỌC THỰC TẾ DÙNG CHUNG (HEARTBEAT 15s)
 * - Chỉ gửi nhịp tim (heartbeat) tới RPC log_study_time khi:
 *   1) Đang ở màn hình học thật (không bật trên dashboard/bảng xếp hạng/mục lục)
 *   2) document.visibilityState === 'visible'
 *   3) Có thao tác (pointerdown/mousedown/keydown/touchstart/scroll/mousemove) trong 60 giây gần nhất
 * - Khi tab ẩn hoặc không thao tác >= 60s -> tạm dừng, quay lại -> cấp session_id mới (không nối khoảng trống).
 * - Lỗi mạng im lặng hoàn toàn, không alert, không chặn giao diện.
 */
window.StudyTimer = (function () {
  'use strict';

  const HEARTBEAT_INTERVAL_MS = 15000;
  const IDLE_THRESHOLD_MS = 60000;
  const EVENT_THROTTLE_MS = 400;

  let isRunning = false;
  let currentActivity = null;
  let activityStack = [];
  let sessionId = null;
  let lastInteractionAt = 0;
  let lastEventHandledAt = 0;
  let pausedFlag = false;
  let intervalId = null;
  let listenersBound = false;
  let onUpdateCallbacks = [];

  function generateUuid() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
      }
    } catch (_) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  function isVisible() {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  function isIdle(now = Date.now()) {
    return (now - lastInteractionAt) >= IDLE_THRESHOLD_MS;
  }

  function isEligibleNow(now = Date.now()) {
    return isRunning && Boolean(currentActivity) && Boolean(sessionId) && !pausedFlag && isVisible() && !isIdle(now);
  }

  function notifyUpdated(res) {
    if (!onUpdateCallbacks.length) return;
    onUpdateCallbacks.forEach(fn => {
      try { fn(res); } catch (_) {}
    });
  }

  async function sendPing() {
    if (!isRunning || !currentActivity || !sessionId) return null;
    if (!window.Student || typeof window.Student.logStudyTime !== 'function') return null;

    const sid = sessionId;
    const act = currentActivity;
    try {
      const res = await window.Student.logStudyTime(sid, act);
      return res || null;
    } catch (_) {
      // Mạng lỗi / mất kết nối -> bỏ qua im lặng theo yêu cầu
      return null;
    }
  }

  function ensureInterval() {
    if (intervalId !== null) return;
    intervalId = setInterval(() => {
      if (!isRunning || !currentActivity) return;
      const now = Date.now();
      if (!isVisible() || isIdle(now)) {
        pausedFlag = true;
        return;
      }
      if (pausedFlag) {
        return;
      }
      void sendPing();
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function handleUserInteraction() {
    if (!isRunning || !currentActivity) return;
    const now = Date.now();

    if (pausedFlag) {
      lastInteractionAt = now;
      lastEventHandledAt = now;
      if (isVisible()) {
        pausedFlag = false;
        sessionId = generateUuid();
        void sendPing();
      }
      return;
    }

    if (now - lastEventHandledAt < EVENT_THROTTLE_MS) return;
    lastEventHandledAt = now;
    lastInteractionAt = now;
  }

  function handleVisibilityChange() {
    if (!isRunning || !currentActivity) return;
    if (!isVisible()) {
      pausedFlag = true;
      return;
    }
    if (pausedFlag) {
      pausedFlag = false;
      sessionId = generateUuid();
      lastInteractionAt = Date.now();
      lastEventHandledAt = lastInteractionAt;
      void sendPing();
    }
  }

  function handlePageHide() {
    if (!isRunning) return;
    pausedFlag = true;
    stopInterval();
  }

  function bindListeners() {
    if (listenersBound || typeof document === 'undefined') return;
    listenersBound = true;

    const passiveOpts = { passive: true };
    ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(evt => {
      document.addEventListener(evt, handleUserInteraction, passiveOpts);
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', handleUserInteraction, passiveOpts);
      window.addEventListener('pagehide', handlePageHide);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  function markActive() {
    if (!isRunning) return;
    const now = Date.now();
    lastInteractionAt = now;
    lastEventHandledAt = now;
    if (pausedFlag && isVisible()) {
      pausedFlag = false;
      sessionId = generateUuid();
      void sendPing();
    }
  }

  function onUpdate(fn) {
    if (typeof fn === 'function' && !onUpdateCallbacks.includes(fn)) {
      onUpdateCallbacks.push(fn);
    }
  }

  function start(activity, opts = {}) {
    if (!activity) return;
    if (opts && typeof opts.onUpdate === 'function') {
      onUpdate(opts.onUpdate);
    }
    bindListeners();

    const now = Date.now();
    if (isRunning && currentActivity === activity) {
      lastInteractionAt = now;
      if (pausedFlag && isVisible()) {
        pausedFlag = false;
        sessionId = generateUuid();
        void sendPing();
      }
      ensureInterval();
      return;
    }

    if (isRunning && currentActivity && currentActivity !== activity) {
      const wasEligible = isEligibleNow(now);
      const prevPingPromise = wasEligible ? sendPing() : Promise.resolve(null);
      currentActivity = activity;
      lastInteractionAt = now;
      if (!isVisible()) {
        pausedFlag = true;
      } else {
        pausedFlag = false;
        if (!sessionId) sessionId = generateUuid();
        void prevPingPromise.then(() => sendPing());
      }
      ensureInterval();
      return;
    }

    isRunning = true;
    currentActivity = activity;
    sessionId = generateUuid();
    lastInteractionAt = now;
    lastEventHandledAt = now;
    pausedFlag = !isVisible();
    ensureInterval();

    if (!pausedFlag) {
      void sendPing();
    }
  }

  function setActivity(activity) {
    if (!activity) {
      return stop({ flush: true });
    }
    start(activity);
    return Promise.resolve();
  }

  function pushActivity(activity, opts = {}) {
    if (!activity) return;
    if (opts && typeof opts.onUpdate === 'function') {
      onUpdate(opts.onUpdate);
    }
    activityStack.push(isRunning ? currentActivity : null);
    start(activity);
  }

  async function popActivity({ expectedActivity = null, flush = true } = {}) {
    if (expectedActivity && currentActivity && currentActivity !== expectedActivity) {
      // Tránh bấm đóng 2 lần làm bật ra khỏi hoạt động bên ngoài
      return;
    }
    if (activityStack.length === 0) {
      if (!expectedActivity || currentActivity === expectedActivity) {
        await stop({ flush });
      }
      return;
    }

    const prevActivity = activityStack.pop();
    let lastRes = null;
    if (flush && isEligibleNow()) {
      lastRes = await sendPing();
    }

    if (prevActivity) {
      currentActivity = prevActivity;
      lastInteractionAt = Date.now();
      pausedFlag = !isVisible();
      ensureInterval();
      if (!pausedFlag) {
        if (!sessionId) sessionId = generateUuid();
      }
    } else {
      isRunning = false;
      currentActivity = null;
      sessionId = null;
      pausedFlag = false;
      stopInterval();
    }

    notifyUpdated(lastRes);
  }

  async function stop({ flush = true } = {}) {
    let lastRes = null;
    if (flush && isEligibleNow()) {
      lastRes = await sendPing();
    }
    isRunning = false;
    currentActivity = null;
    activityStack = [];
    sessionId = null;
    pausedFlag = false;
    stopInterval();
    notifyUpdated(lastRes);
    return lastRes;
  }

  function getState() {
    return {
      isRunning,
      currentActivity,
      sessionId,
      pausedFlag,
      stackDepth: activityStack.length,
      lastInteractionAt
    };
  }

  return {
    start,
    setActivity,
    pushActivity,
    popActivity,
    stop,
    markActive,
    onUpdate,
    getState,
    HEARTBEAT_INTERVAL_MS,
    IDLE_THRESHOLD_MS
  };
})();
