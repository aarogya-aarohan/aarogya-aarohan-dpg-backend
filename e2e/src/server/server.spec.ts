import axios from 'axios';

describe('GET /api/sites', () => {
  it('should return a site list', async () => {
    const res = await axios.get(`/api/sites`);

    expect(res.status).toBe(200);
  });
});
