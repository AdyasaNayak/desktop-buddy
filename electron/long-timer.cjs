// setTimeout stores its delay in a signed 32-bit integer. A longer delay
// overflows and fires almost immediately (Node warns and uses 1 ms), so waits
// beyond that are re-armed in chunks until the target time is really reached.
const MAX_TIMER_DELAY = 2 ** 31 - 1;

/** Safe setTimeout delay for the time left until `dueAt`. */
function nextDelay(dueAt) {
  return Math.max(0, Math.min(dueAt - Date.now(), MAX_TIMER_DELAY));
}

/**
 * setTimeout for deadlines that can be months away. The callback runs once the
 * clock has passed `dueAt`; returns a handle for clearLongTimeout.
 */
function setLongTimeout(dueAt, callback) {
  const handle = { timer: undefined };
  const arm = () => {
    handle.timer = setTimeout(() => {
      // A chunk can end slightly early (or the machine can wake from sleep),
      // so only fire when the deadline has actually passed.
      if (Date.now() < dueAt) {
        arm();
        return;
      }
      handle.timer = undefined;
      callback();
    }, nextDelay(dueAt));
  };
  arm();
  return handle;
}

function clearLongTimeout(handle) {
  if (!handle || handle.timer === undefined) return;
  clearTimeout(handle.timer);
  handle.timer = undefined;
}

module.exports = { MAX_TIMER_DELAY, setLongTimeout, clearLongTimeout };
