export class Poll {
  constructor(state) {
    this.state = state;
    this.votes = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST') {
      const data = await request.json();
      const vote = data.vote;
      if (!['like', 'dislike'].includes(vote)) {
        return new Response('Invalid vote', { status: 400 });
      }

      const stored = await this.state.storage.get('votes') || { like: 0, dislike: 0 };
      stored[vote]++;
      await this.state.storage.put('votes', stored);
      return new Response(JSON.stringify(stored), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'GET') {
      const stored = await this.state.storage.get('votes') || { like: 0, dislike: 0 };
      return new Response(JSON.stringify(stored), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }
}
