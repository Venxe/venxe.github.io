const errorPanel = document.querySelector('#error');

function showError(message) {
  document.querySelector('#loading').hidden = true;
  document.querySelector('#scene').setAttribute('aria-busy', 'false');
  document.querySelector('#error-message').textContent = message;
  errorPanel.hidden = false;
  document.querySelector('#hint').hidden = true;
}

document.querySelector('#reload').addEventListener('click', () => location.reload());

try {
  const { start } = await import('./main.js');
  start(showError);
} catch (error) {
  console.error('Sahne başlatılamadı:', error);
  showError('3D sahne yüklenemedi. WebGL2 desteğini ve tarayıcınızın donanım hızlandırma ayarını kontrol edip yeniden deneyin.');
}
