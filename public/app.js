// Fase 0: só confirma que o servidor responde.
fetch('/health')
  .then((res) => res.json())
  .then((data) => {
    document.getElementById('status').textContent = `Status do servidor: ${data.status}`;
  })
  .catch(() => {
    document.getElementById('status').textContent = 'Servidor não respondeu.';
  });
