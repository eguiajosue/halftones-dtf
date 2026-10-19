function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

module.exports = { debounce, clamp };
