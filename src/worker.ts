export default {
  fetch(_request: Request, _env: Env) {
    const url = new URL(_request.url);

    if (url.pathname.startsWith('/api/')) {
      return Response.json({
        name: 'Hello from Worker',
      });
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

interface Env {}
