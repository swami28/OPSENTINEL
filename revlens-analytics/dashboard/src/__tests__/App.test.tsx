import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import sampleBundle from '../../public/data/analytics_bundle.json';
import App from '../App';

describe('RevLens Executive BI & Decision Science Dashboard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => sampleBundle,
      })),
    );
  });

  it('renders executive KPIs and navigates across all 5 analytical views', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('RevLens Analytics')).toBeInTheDocument();
    });

    expect(screen.getByText('Ending ARR')).toBeInTheDocument();
    expect(
      screen.getByText(/GTM Acquisition Channel Unit Economics/i),
    ).toBeInTheDocument();

    // Switch to Cohorts, RFM & Funnel tab
    fireEvent.click(screen.getByRole('button', { name: /Cohorts, RFM & Funnel/i }));
    expect(
      screen.getByText(/Quarterly Cohort Retention Matrix/i),
    ).toBeInTheDocument();

    // Switch to Churn ML & Hypothesis Lab tab
    fireEvent.click(screen.getByRole('button', { name: /Churn ML & Hypothesis Lab/i }));
    expect(
      screen.getByText(/Statistical Hypothesis Testing Suite/i),
    ).toBeInTheDocument();

    // Switch to What-If ROI Simulator tab
    fireEvent.click(screen.getByRole('button', { name: /What-If ROI Simulator/i }));
    expect(
      screen.getByText(/Projected 12-Month Executive ARR & NRR Impact/i),
    ).toBeInTheDocument();

    // Switch to SQL Workbench & ETL Audit tab
    fireEvent.click(screen.getByRole('button', { name: /SQL Workbench & ETL Audit/i }));
    expect(
      screen.getByText(/Star-Schema Analytical SQL Workbench/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Automated ETL Data Cleaning & Quality Audit Log/i),
    ).toBeInTheDocument();
  });
});
