// Runs before the unchanged upstream CLI. No second, unprotected listener.
import http from 'node:http';
export function permitted(headers, port) {
  const host = headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
  if (headers.origin !== undefined && headers.origin !== `http://${host}`) return false;
  return headers['sec-fetch-site'] === undefined || ['same-origin', 'none'].includes(headers['sec-fetch-site']);
}
export function installGuard(onListening = () => {}) {
  const listen = http.Server.prototype.listen;
  const emit = http.Server.prototype.emit;
  http.Server.prototype.listen = function(...args) {
    // The OS chooses the port; upstream's suggested port is not used.
    const callback = args.find(x => typeof x === 'function');
    this.once('listening', () => {
      const address = this.address();
      if (!address || address.address !== '127.0.0.1') throw Error('Studio must bind only to loopback');
      onListening(address.port);
    });
    return listen.call(this, 0, '127.0.0.1', callback);
  };
  http.Server.prototype.emit = function(event, ...args) {
    if (event === 'request' || event === 'upgrade') {
      const [req, res] = args;
      const port = this.address()?.port;
      if (!permitted(req.headers, port)) {
        if (event === 'upgrade') res.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        else { res.writeHead(403, {'Content-Type':'text/plain'}); res.end('Forbidden'); }
        return true;
      }
      if (event === 'request') {
        const set = res.setHeader;
        res.setHeader = function(name, value) {
          if (name.toLowerCase().startsWith('access-control-allow-')) return this;
          return set.call(this, name, value);
        };
        const write = res.writeHead;
        res.writeHead = function(...values) {
          for (let i = 1; i < values.length; i++) {
            const headers = values[i];
            if (Array.isArray(headers)) values[i] = headers.flatMap((value, j) => j % 2 === 0 && !String(value).toLowerCase().startsWith('access-control-allow-') ? [value, headers[j + 1]] : []);
            else if (headers && typeof headers === 'object')
              values[i] = Object.fromEntries(Object.entries(headers).filter(([key]) => !key.toLowerCase().startsWith('access-control-allow-')));
          }
          return write.apply(this, values);
        };
      }
    }
    return emit.call(this, event, ...args);
  };
}
