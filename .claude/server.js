const http = require('http');
const fs = require('fs');
const path = require('path');
const mime = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ico':'image/x-icon' };
const server = http.createServer((req, res) => {
  let filePath = '.' + decodeURIComponent(req.url.split('?')[0]);
  if (filePath === './') filePath = './index.html';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
});
server.listen(3000, () => console.log('Azul server on http://localhost:3000'));
