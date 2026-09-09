import type { Job } from './api';

const operations: Record<keyof Job['usage'], string> = {
  maxImages: 'Total image generations',
  maxCalls: 'Total provider calls',
  maxSearches: 'Research searches',
  maxTakes: 'Narration recordings',
  maxImageCorrections: 'Most corrections for one image',
  maxEditorialCorrections: 'Editorial correction cycles',
  maxFilmCorrections: 'Film visual correction cycles',
  maxTechnicalRepairs: 'Technical repair attempts',
};
const number = (value: number | null) =>
  value === null ? 'Unavailable' : value.toLocaleString('en-US');
const money = (value: number | null) =>
  value === null
    ? 'Unavailable'
    : value > 0 && value < 0.0001
      ? '<$0.0001'
      : `$${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
const count = (value: number, unit: string) => `${number(value)} ${unit}${value === 1 ? '' : 's'}`;

export function ProductionConsumption({ job }: { job: Job }) {
  const report = job.consumption;
  const exportData = {
    filmId: job.id,
    savedAt: job.savedAt,
    operations: job.usage,
    consumption: report,
  };
  return (
    <section className="film-consumption" aria-label="Film consumption">
      <div className="consumption-heading">
        <div>
          <span className="eyebrow">CONSUMPTION SO FAR</span>
          <h2>
            {count(job.usage.maxCalls, 'provider call')} ·{' '}
            {count(job.usage.maxImages, 'image attempt')}
          </h2>
          <p>Includes retries and corrections across all production sessions.</p>
        </div>
        <div className="consumption-price">
          <strong>{money(report?.estimatedSubtotalUsd ?? null)}</strong>
          <span>Partial model estimate · USD</span>
        </div>
      </div>
      <p className="consumption-note">
        {report?.costedCalls
          ? `${report.costedCalls} of ${report.totalCalls} calls priced. `
          : 'No priced measurements yet. '}
        Image generation, narration, search fees, hosting and calls without pricing are excluded.
        This is a list-price estimate before credits and taxes, not your bill.
      </p>
      {Boolean(report?.pendingCalls) && (
        <p>
          {count(report?.pendingCalls ?? 0, 'call')} {report?.pendingCalls === 1 ? 'is' : 'are'}{' '}
          awaiting a confirmed result. Consumption may be incomplete.
        </p>
      )}
      <details className="usage-details">
        <summary>Production consumption</summary>
        <div className="usage-scroll">
          <table>
            <caption>Production operations</caption>
            <thead>
              <tr>
                <th scope="col">Operation</th>
                <th scope="col">Used</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(operations) as (keyof Job['usage'])[]).map((key) => (
                <tr key={key}>
                  <th scope="row">{operations[key]}</th>
                  <td>{number(job.usage[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report && report.rows.length > 0 ? (
          <>
            <p>
              Token totals reported for {report.meteredCalls} of {report.totalCalls} calls. Cached
              tokens are part of input. Output and reasoning are shown separately. Unavailable
              measurements are not counted as zero.
            </p>
            <section
              className="usage-scroll"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the wide usage table.
              tabIndex={0}
              aria-label="Consumption by model and role"
            >
              <table>
                <caption>Measured usage by model and role</caption>
                <thead>
                  <tr>
                    {[
                      'Model / role',
                      'Calls',
                      'Failed',
                      'Input',
                      'Cached input',
                      'Output',
                      'Reasoning',
                      'Tool input',
                      'Total tokens',
                      'Estimate (USD)',
                    ].map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={`${row.provider}-${row.model}-${row.role}`}>
                      <th scope="row">
                        <span>{row.model === 'production' ? row.provider : row.model}</span>
                        <small>{row.role}</small>
                        <small>
                          {row.meteredCalls}/{row.calls} calls with token totals
                        </small>
                      </th>
                      <td>{number(row.calls)}</td>
                      <td>{number(row.failedCalls)}</td>
                      {(['input', 'cached', 'output', 'reasoning', 'tools', 'total'] as const).map(
                        (field) => (
                          <td key={field}>
                            {number(row.tokens[field])}
                            {row.tokens[field] !== null && row.tokenReports[field] < row.calls && (
                              <small>
                                {row.tokenReports[field]}/{row.calls} calls
                              </small>
                            )}
                          </td>
                        ),
                      )}
                      <td>
                        {money(
                          row.estimatedNanoUsd === null
                            ? null
                            : row.estimatedNanoUsd / 1_000_000_000,
                        )}
                        <small>
                          {row.costedCalls}/{row.calls} calls priced
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : (
          <p>
            {job.usage.maxCalls
              ? 'Detailed measurements are unavailable for this saved film.'
              : 'Measurements appear as production completes its calls.'}
          </p>
        )}
        {Boolean(report?.unattributedCalls) && (
          <p>{report?.unattributedCalls} historical calls have no detailed measurements.</p>
        )}
        <div className="consumption-footer">
          <a
            className="secondary"
            download={`vox-consumption-${job.id}.json`}
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`}
          >
            Download consumption report
          </a>
          {report && (
            <a href={report.priceSource} target="_blank" rel="noreferrer">
              Pricing reference · {report.priceCheckedAt}
            </a>
          )}
        </div>
      </details>
    </section>
  );
}
