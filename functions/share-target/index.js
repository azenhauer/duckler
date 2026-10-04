const MAX_TITLE_LENGTH = 1000;
const MAX_TEXT_LENGTH = 2000;
const MAX_URL_LENGTH = 2048;
const MAX_REDIRECT_LENGTH = 8000;

const fieldValue = (value, maxLength) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const onRequestPost = async ({ request }) => {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return new Response('Expected a URL-encoded or multipart share form.', { status: 400 });
  }

  const title = fieldValue(formData.get('title'), MAX_TITLE_LENGTH);
  const text = fieldValue(formData.get('text'), MAX_TEXT_LENGTH);
  const sourceUrl = fieldValue(formData.get('url'), MAX_URL_LENGTH);
  const hasSharedFile = formData.getAll('files').some((value) => typeof value !== 'string' && value.size > 0);

  if (hasSharedFile) {
    return new Response('Open Duckler and use Upload to add shared image files.', { status: 415 });
  }

  if (!title && !text && !sourceUrl) {
    return new Response('The shared item did not include a title, text, or URL.', { status: 400 });
  }

  if (sourceUrl) {
    try {
      const parsedUrl = new URL(sourceUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return new Response('Shared URLs must use HTTP or HTTPS.', { status: 400 });
      }
    } catch {
      return new Response('The shared URL is invalid.', { status: 400 });
    }
  }

  const redirectUrl = new URL('/', request.url);
  redirectUrl.searchParams.set('sharedId', crypto.randomUUID());
  if (title) redirectUrl.searchParams.set('sharedTitle', title);
  if (text) redirectUrl.searchParams.set('sharedText', text);
  if (sourceUrl) redirectUrl.searchParams.set('sharedUrl', sourceUrl);

  if (redirectUrl.href.length > MAX_REDIRECT_LENGTH) {
    return new Response('This shared item is too large. Open Duckler and use the upload or paste action instead.', {
      status: 413,
    });
  }

  return Response.redirect(redirectUrl, 303);
};
