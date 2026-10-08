const message = document.getElementById('boot-message');
if (location.protocol === 'file:') {
  message.textContent = 'Abre el juego con INICIAR-JUEGO.cmd o un servidor local. Los navegadores necesitan HTTP para cargar los módulos.';
} else {
  try {
    await import('./main.js');
    document.getElementById('boot-hint').classList.add('hide');
  } catch (error) {
    console.error('No se pudo iniciar Mapache Cinema:', error);
    message.textContent = 'No se pudo cargar el juego. Revisa tu conexión y pulsa Reintentar.';
    const retry = document.createElement('button');
    retry.className = 'back';
    retry.textContent = 'REINTENTAR';
    retry.addEventListener('click', () => location.reload());
    document.getElementById('boot-hint').append(retry);
  }
}
