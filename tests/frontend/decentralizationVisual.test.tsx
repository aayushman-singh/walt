import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DecentralizationVisual from '../../components/landing/DecentralizationVisual';
import { PEERS, SAMPLE_CID } from '../../components/landing/networkModel';

describe('DecentralizationVisual', () => {
  beforeAll(() => {
    // jsdom does not implement matchMedia; framer-motion's useReducedMotion
    // probes it. Provide a deterministic "reduced motion off" stub.
    if (!window.matchMedia) {
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
    }

    // jsdom has no IntersectionObserver; framer-motion's `whileInView` needs it.
    if (!('IntersectionObserver' in window)) {
      class StubIntersectionObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
      window.IntersectionObserver =
        StubIntersectionObserver as unknown as typeof IntersectionObserver;
      globalThis.IntersectionObserver =
        StubIntersectionObserver as unknown as typeof IntersectionObserver;
    }
  });

  afterEach(() => cleanup());

  it('renders the honest, non-telemetry heading', () => {
    render(<DecentralizationVisual />);
    expect(
      screen.getByRole('heading', {
        name: /Your files live on many nodes, not one server/i,
      })
    ).toBeInTheDocument();
  });

  it('frames the network as illustrative, not live data', () => {
    render(<DecentralizationVisual />);
    expect(
      screen.getByText(/Illustrative model — not live network telemetry\./i)
    ).toBeInTheDocument();
  });

  it('contrasts a single centralized server against many peers', () => {
    render(<DecentralizationVisual />);

    // exactly one server node on the centralized side
    expect(screen.getByTestId('centralized-svg')).toBeInTheDocument();

    // the decentralized side renders one node per peer in the model
    const peerNodes = screen.getAllByTestId('peer-node');
    expect(peerNodes.length).toBe(PEERS.length);
    expect(peerNodes.length).toBeGreaterThan(1);
  });

  it('shows the file addressed by a CID, scoped to the decentralized panel', () => {
    render(<DecentralizationVisual />);
    const panel = screen.getByTestId('decentralized-panel');
    expect(within(panel).getByText(SAMPLE_CID)).toBeInTheDocument();
  });

  it('exposes accessible labels on the decorative SVGs', () => {
    render(<DecentralizationVisual />);
    expect(
      screen.getByRole('img', { name: /single central server/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /illustrative peer-to-peer network/i })
    ).toBeInTheDocument();
  });
});
