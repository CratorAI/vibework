// Evaluated as a function expression; arguments are serialized JSON, never source text.
(args => {
  try {
    const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
    const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
    const label = el => clean(el.getAttribute('aria-label') || (el.labels && [...el.labels].map(x => x.innerText).join(' ')) || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title')).slice(0, 200);
    const role = el => el.getAttribute('role') || ({A:'link',BUTTON:'button',INPUT:'textbox',TEXTAREA:'textbox',SELECT:'combobox'}[el.tagName]) || 'interactive';
    let state = window.__vibeworkBrowserRefs;
    const resolve = ref => {
      const entry = state && state.url === location.href && state.refs.get(ref);
      if (!entry || !entry.el.isConnected || !visible(entry.el) || entry.label !== label(entry.el)) throw Error('Stale ref: request a new snapshot before acting.');
      entry.el.scrollIntoView({block:'center',inline:'nearest'});
      return entry.el;
    };
    const root = () => {
      const el = args.selector ? document.querySelector(args.selector) : document.body;
      if (!el) throw Error('Selector did not match an element');
      return el;
    };
    const snapshot = () => {
      state = {url:location.href, refs:new Map()};
      window.__vibeworkBrowserRefs = state;
      const prefix = Math.random().toString(36).slice(2,10);
      let n = 0;
      const lines = [];
      const walk = el => {
        if (!visible(el) || ['SCRIPT','STYLE','NOSCRIPT','TEMPLATE'].includes(el.tagName)) return;
        if (el.matches('a[href],button,input,select,textarea,[role],[onclick],[tabindex],[contenteditable="true"]') || window.__vibeworkClickTargets?.has(el) || typeof el.onclick === 'function' || getComputedStyle(el).cursor === 'pointer') {
          const ref = `e${prefix}-${++n}`;
          state.refs.set(ref, {el,label:label(el)});
          lines.push(`[${ref}] ${role(el)} ${label(el)}${'value' in el ? ' value='+JSON.stringify(el.type === 'password' ? '[redacted]' : String(el.value).slice(0,500)) : ''}${el.disabled ? ' disabled' : ''}`);
        }
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) { const text = clean(node.textContent); if (text) lines.push(text); }
          else if (node.nodeType === Node.ELEMENT_NODE) walk(node);
        }
      };
      walk(root());
      const offset = args.offset || 0;
      const text = lines.join('\n');
      return {title:document.title,url:location.href,text:text.slice(offset,offset+16000),offset,nextOffset:offset+16000<text.length ? offset+16000 : null,truncated:offset+16000<text.length};
    };
    const fire = (el,type) => el.dispatchEvent(new Event(type,{bubbles:true}));
    const click = el => {
      if (el.disabled) throw Error('Element is disabled');
      el.focus();
      for (const type of ['pointerdown','mousedown','pointerup','mouseup']) el.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type,{bubbles:true}) : new MouseEvent(type,{bubbles:true}));
      if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    };
    switch (args.action) {
      case 'snapshot': return snapshot();
      case 'ready': return {ready:document.readyState === 'complete',url:location.href};
      case 'contains': return {found:(document.body?.innerText || '').includes(args.text)};
      case 'read': {
        const el = args.selector ? root() : document.querySelector('main,article,[role="main"]') || root();
        const text = el.innerText || '';
        return {title:document.title,url:location.href,text:text.slice(args.offset||0,(args.offset||0)+24000),truncated:text.length>(args.offset||0)+24000};
      }
      case 'click': click(resolve(args.ref)); break;
      case 'type': {
        const el = resolve(args.ref); el.focus();
        if (el.disabled || el.readOnly) throw Error('Field is disabled or read-only');
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        if (el.isContentEditable) el.textContent = args.text;
        else { const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set; if (!setter || !['INPUT','TEXTAREA'].includes(el.tagName)) throw Error('Ref is not a text field'); setter.call(el,args.text); }
        fire(el,'input'); fire(el,'change');
        if (args.submit && el.form) el.form.requestSubmit();
        break;
      }
      case 'select': {
        const el = resolve(args.ref);
        if (el.tagName !== 'SELECT' || ![...el.options].some(o => o.value === args.value)) throw Error('Select or option not found');
        el.value = args.value; fire(el,'input'); fire(el,'change'); break;
      }
      case 'press': {
        const el = document.activeElement || document.body;
        const allowed = el.dispatchEvent(new KeyboardEvent('keydown',{key:args.key,bubbles:true,cancelable:true}));
        if (allowed && args.key === 'Enter') { if (el.form) el.form.requestSubmit(); else if (el.matches('button,a[href]')) click(el); }
        else if (allowed && args.key === 'Tab') { const list = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(visible); list[(list.indexOf(el)+1)%list.length]?.focus(); }
        el.dispatchEvent(new KeyboardEvent('keyup',{key:args.key,bubbles:true})); break;
      }
      case 'scroll':
        if (args.ref) resolve(args.ref);
        else window.scrollBy({top:args.direction === 'up' ? -innerHeight*.8 : args.direction === 'down' ? innerHeight*.8 : 0,left:args.direction === 'left' ? -innerWidth*.8 : args.direction === 'right' ? innerWidth*.8 : 0,behavior:'auto'});
        break;
      default: throw Error('Unknown page action');
    }
    return {acted:true,url:location.href,title:document.title};
  } catch (e) { return {error:String(e.message || e)}; }
})
