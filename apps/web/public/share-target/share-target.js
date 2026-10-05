const key = 'visual-library-pending-share';
const readQueue = () => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const storePayload = (payload) => {
  const queue = Array.isArray(readQueue()) ? readQueue() : [];
  queue.push(payload);
  localStorage.setItem(key, JSON.stringify(queue));
};

const buildPayloadFromParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    title: params.get('title') || 'Shared item',
    text: params.get('text') || '',
    url: params.get('url') || '',
  };
};

const handleShare = (payload) => {
  const sanitized = {
    title: payload.title?.trim() || 'Shared item',
    text: payload.text?.trim() || '',
    url: payload.url?.trim() || '',
  };
  document.getElementById('payload').textContent = JSON.stringify(sanitized, null, 2);
  storePayload(sanitized);
  setTimeout(() => {
    window.location.href = '/';
  }, 300);
};

const form = document.querySelector('form');
if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      title: formData.get('title') || 'Shared item',
      text: formData.get('text') || '',
      url: formData.get('url') || '',
    };
    handleShare(payload);
  });
}

const initialPayload = buildPayloadFromParams();
if (initialPayload.title || initialPayload.text || initialPayload.url) {
  handleShare(initialPayload);
}
