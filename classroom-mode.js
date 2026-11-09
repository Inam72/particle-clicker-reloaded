(function() {
  var parameters = new URLSearchParams(window.location.search);
  var fragment = new URLSearchParams(window.location.hash.slice(1));
  var stopToken = fragment.get('stop');

  window.__CLASSROOM_LOCAL__ = parameters.get('classroom') === 'local';
  window.__CLASSROOM_TEACHER__ =
      window.__CLASSROOM_LOCAL__ && parameters.get('teacher') === '1';
  window.__CLASSROOM_HOST_URL__ =
      window.location.origin + window.location.pathname + '?classroom=local';
  window.__CLASSROOM_ROOM__ =
      window.__CLASSROOM_LOCAL__ ? (fragment.get('room') || '') : '';
  window.__CLASSROOM_STOP_TOKEN__ = '';

  if (window.__CLASSROOM_TEACHER__) {
    try {
      if (stopToken) {
        sessionStorage.setItem('pc-classroom-stop', stopToken);
      }
      window.__CLASSROOM_STOP_TOKEN__ =
          stopToken || sessionStorage.getItem('pc-classroom-stop') || '';
    } catch (error) {
      window.__CLASSROOM_STOP_TOKEN__ = stopToken || '';
    }
  }

  if (stopToken && window.__CLASSROOM_TEACHER__) {
    window.history.replaceState(
        null, document.title, window.location.pathname + window.location.search);
  }
})();
