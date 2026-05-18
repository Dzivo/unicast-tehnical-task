import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const filesPayload = [
  { id: 1, filePath: '/tmp/video.mp4', status: 'Processing', processedPath: null, errorMessage: null },
];

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders files from API and allows path submission', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(filesPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(filesPayload[0]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 2, status: 'Processing', filePath: '/tmp/new.mp4' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(filesPayload), { status: 200 }));

    render(<App />);

    await screen.findByText('#1 /tmp/video.mp4');

    const input = screen.getByLabelText('Absolute path:');
    await userEvent.type(input, '/tmp/new.mp4');
    await userEvent.click(screen.getByRole('button', { name: 'Process Path' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/files/process'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
