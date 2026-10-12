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
  console.error('Unable to initialize the 3D scene:', error);
  showError('Unable to load the 3D scene. Verify that your browser supports WebGL2 and that hardware acceleration is enabled, then try again.');
}
