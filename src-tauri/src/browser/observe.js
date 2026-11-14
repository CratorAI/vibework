// Track directly registered click handlers from document start. DOM APIs do not
// otherwise expose addEventListener registrations to a later page snapshot.
(() => {
  const targets = new WeakSet();
  const original = EventTarget.prototype.addEventListener;
  Object.defineProperty(window, '__vibeworkClickTargets', { value: targets });
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (listener && ['click', 'mousedown', 'pointerdown'].includes(type) && this instanceof Element) targets.add(this);
    return Reflect.apply(original, this, [type, listener, options]);
  };
})();
