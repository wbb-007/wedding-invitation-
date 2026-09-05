const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8088);
const API_TARGET_PORT = Number(process.env.API_PORT || 5051);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' }, data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function proxyRsvp(req, res) {
  readBody(req)
    .then((body) => {
      const proxyReq = http.request(
        {
          host: '127.0.0.1',
          port: API_TARGET_PORT,
          method: 'POST',
          path: '/api/rsvp',
          headers: {
            'Content-Type': req.headers['content-type'] || 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (proxyRes) => {
          const chunks = [];
          proxyRes.on('data', (chunk) => chunks.push(chunk));
          proxyRes.on('end', () => {
            const payload = Buffer.concat(chunks);
            send(
              res,
              proxyRes.statusCode || 502,
              {
                'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
              },
              payload,
            );
          });
        },
      );

      proxyReq.on('error', (error) => {
        send(
          res,
          502,
          { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
          JSON.stringify({ ok: false, error: error.message }),
        );
      });

      proxyReq.write(body);
      proxyReq.end();
    })
    .catch((error) => {
      send(
        res,
        500,
        { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
        JSON.stringify({ ok: false, error: error.message }),
      );
    });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'POST' && url.pathname === '/api/rsvp') {
    proxyRsvp(req, res);
    return;
  }

  let filePath = path.join(ROOT, url.pathname === '/' ? '/index.html' : url.pathname);
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    serveFile(res, filePath);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`preview server listening on http://127.0.0.1:${PORT}`);
});
