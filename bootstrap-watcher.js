const http = require('http');

function checkReady() {
  const req = http.get('http://localhost:3002/health/ready', (res) => {
    if (res.statusCode === 200) {
      console.log('Identity service is ready. Bootstrapping admin...');
      bootstrapAdmin();
    } else {
      setTimeout(checkReady, 2000);
    }
  });
  req.on('error', () => setTimeout(checkReady, 2000));
}

function bootstrapAdmin() {
  const req = http.request('http://localhost:3002/auth/bootstrap-admin', {
    method: 'POST',
    headers: { 'X-Bootstrap-Secret': 'bootstrap-secret' }
  }, (res) => {
    console.log('Bootstrap status:', res.statusCode);
  });
  req.on('error', (e) => console.error(e));
  req.end();
}

console.log('Waiting for identity service to start...');
checkReady();
